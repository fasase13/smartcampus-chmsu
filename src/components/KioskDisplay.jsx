"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  Clock,
  Info,
  MapPin,
  Maximize2,
  Minimize2,
  Pin,
  Radio,
  Search,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ANNOUNCEMENT_CATEGORIES,
  getAvailabilityMeta,
} from "@/lib/constants";

const KIOSK_CATEGORIES = [
  { value: "all", label: "All Notices" },
  ...ANNOUNCEMENT_CATEGORIES,
];

function formatDateTime(isoString) {
  if (!isoString) return "";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoString));
}

function formatEventDate(isoString) {
  if (!isoString) return { month: "", day: "", time: "" };
  const d = new Date(isoString);
  return {
    month: new Intl.DateTimeFormat("en-PH", { month: "short" }).format(d),
    day: new Intl.DateTimeFormat("en-PH", { day: "2-digit" }).format(d),
    time: new Intl.DateTimeFormat("en-PH", {
      hour: "numeric",
      minute: "2-digit",
    }).format(d),
  };
}

export default function KioskDisplay({
  campus,
  initialAnnouncements,
  initialFaculty,
}) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [faculty, setFaculty] = useState(initialFaculty);
  const [activeCategory, setActiveCategory] = useState("all");
  const [facultyQuery, setFacultyQuery] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [now, setNow] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Live clock & date (client-only to prevent hydration mismatch)
  useEffect(() => {
    const updateClock = () => setNow(new Date());
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Track browser fullscreen state
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Browser may block fullscreen if not triggered by gesture
    }
  };

  // Refetch ONLY RA 10173-compliant public announcements
  const refreshAnnouncements = useCallback(async () => {
    const supabase = createClient();
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("announcements")
      .select(
        "id, campus_id, title, body, category, priority, is_pinned, event_start_at, event_end_at, published_at, expires_at"
      )
      .eq("is_active", true)
      .eq("is_public", true)
      .lte("published_at", nowIso)
      .or(`campus_id.eq.${campus.id},campus_id.is.null`)
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(50);

    if (data) {
      const nonExpired = data.filter(
        (item) => !item.expires_at || new Date(item.expires_at) > new Date()
      );
      setAnnouncements(nonExpired);
    }
  }, [campus.id]);

  // Refetch ONLY RA 10173-safe public_faculty_availability view (zero PII)
  const refreshFaculty = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("public_faculty_availability")
      .select(
        "id, campus_id, full_name, department, job_title, office_location, availability_status, availability_note, availability_updated_at"
      )
      .eq("campus_id", campus.id)
      .order("full_name", { ascending: true });

    if (data) {
      setFaculty(data);
    }
  }, [campus.id]);

  // Supabase Realtime subscriptions on `announcements` and `profiles`
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`kiosk-${campus.slug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements",
        },
        () => {
          refreshAnnouncements();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `campus_id=eq.${campus.id}`,
        },
        () => {
          refreshFaculty();
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campus.id, campus.slug, refreshAnnouncements, refreshFaculty]);

  // Featured Pinned / Urgent Banner
  const featuredNotice = useMemo(() => {
    return (
      announcements.find((a) => a.priority === "urgent" || a.category === "emergency") ??
      announcements.find((a) => a.is_pinned) ??
      null
    );
  }, [announcements]);

  // Filtered Announcements Feed
  const filteredAnnouncements = useMemo(() => {
    if (activeCategory === "all") return announcements;
    return announcements.filter((a) => a.category === activeCategory);
  }, [announcements, activeCategory]);

  // Upcoming Calendar & Events
  const upcomingEvents = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return announcements
      .filter(
        (a) =>
          (a.category === "calendar" || a.category === "event" || a.event_start_at) &&
          (!a.event_start_at || new Date(a.event_start_at) >= todayStart)
      )
      .sort((a, b) => {
        const aTime = a.event_start_at ? new Date(a.event_start_at).getTime() : Infinity;
        const bTime = b.event_start_at ? new Date(b.event_start_at).getTime() : Infinity;
        return aTime - bTime;
      })
      .slice(0, 5);
  }, [announcements]);

  // Searchable Instructor Locator
  const filteredFaculty = useMemo(() => {
    const q = facultyQuery.trim().toLowerCase();
    return faculty.filter((f) => {
      const matchesStatus =
        availabilityFilter === "all" || f.availability_status === availabilityFilter;
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        f.full_name?.toLowerCase().includes(q) ||
        f.department?.toLowerCase().includes(q) ||
        f.office_location?.toLowerCase().includes(q) ||
        f.job_title?.toLowerCase().includes(q)
      );
    });
  }, [faculty, facultyQuery, availabilityFilter]);

  const availableCount = useMemo(
    () => faculty.filter((f) => f.availability_status === "available").length,
    [faculty]
  );

  return (
    <div className="flex min-h-dvh w-full flex-col bg-chmsu-canvas text-slate-900 lg:h-dvh lg:overflow-hidden">
      {/* Kiosk Header */}
      <header className="shrink-0 border-b-4 border-chmsu-gold bg-chmsu-forest px-5 py-3.5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white p-1 shadow-sm">
              <Image
                src="/images/chmsu-logo.jpg"
                alt="Carlos Hilado Memorial State University Seal"
                width={52}
                height={52}
                priority
                className="h-full w-full rounded-full object-contain"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-chmsu-gold">
                Carlos Hilado Memorial State University &bull; Public Information Kiosk
              </p>
              <div className="mt-0.5 flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  CHMSU {campus.name}
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">
                  <Radio
                    className={`h-3.5 w-3.5 ${
                      realtimeConnected ? "text-emerald-300 animate-pulse" : "text-slate-300"
                    }`}
                  />
                  {realtimeConnected ? "Live Sync" : "Connecting..."}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right tabular-nums">
              <p className="text-2xl font-bold leading-none text-chmsu-gold sm:text-3xl">
                {now
                  ? new Intl.DateTimeFormat("en-PH", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }).format(now)
                  : "--:--:--"}
              </p>
              <p className="mt-1 text-xs font-medium text-white/85 sm:text-sm">
                {now
                  ? new Intl.DateTimeFormat("en-PH", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    }).format(now)
                  : ""}
              </p>
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen (F11)"}
              className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-white/25 bg-white/10 px-3 text-white transition hover:bg-white/20"
            >
              {isFullscreen ? (
                <Minimize2 className="h-5 w-5" />
              ) : (
                <Maximize2 className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Featured Pinned / Urgent Banner */}
      {featuredNotice && (
        <div
          className={`shrink-0 border-b px-5 py-3 ${
            featuredNotice.priority === "urgent" ||
            featuredNotice.category === "emergency"
              ? "border-chmsu-flame/40 bg-chmsu-flame text-white"
              : "border-chmsu-gold/60 bg-chmsu-gold/20 text-chmsu-forest"
          }`}
        >
          <div className="flex items-center gap-3">
            {featuredNotice.priority === "urgent" ||
            featuredNotice.category === "emergency" ? (
              <AlertTriangle className="h-6 w-6 shrink-0" />
            ) : (
              <Pin className="h-5 w-5 shrink-0 text-chmsu-forest" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-black/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider">
                  {featuredNotice.priority === "urgent" ||
                  featuredNotice.category === "emergency"
                    ? "Urgent Advisory"
                    : "Pinned Notice"}
                </span>
                <span className="truncate text-base font-bold sm:text-lg">
                  {featuredNotice.title}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-sm opacity-95">
                {featuredNotice.body}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Split Kiosk Workspace */}
      <main className="grid flex-1 grid-cols-1 gap-4 p-4 lg:min-h-0 lg:grid-cols-12 lg:overflow-hidden">
        {/* Left Column (7/12): Announcements + Calendar */}
        <section className="flex flex-col gap-4 lg:col-span-7 lg:min-h-0">
          {/* Category Filter Pills (Touch-Friendly) */}
          <div
            role="tablist"
            aria-label="Announcement Categories"
            className="flex shrink-0 flex-wrap gap-2"
          >
            {KIOSK_CATEGORIES.map((cat) => {
              const isSelected = activeCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveCategory(cat.value)}
                  className={`min-h-12 rounded-xl px-4 text-sm font-semibold transition sm:text-base ${
                    isSelected
                      ? "bg-chmsu-forest text-white shadow-xs"
                      : "border border-chmsu-border bg-white text-slate-700 hover:border-chmsu-green hover:text-chmsu-forest"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Announcements Feed */}
          <div className="flex flex-1 flex-col rounded-2xl border border-chmsu-border bg-white p-4 lg:min-h-0">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              <h2 className="text-lg font-bold text-chmsu-forest sm:text-xl">
                Campus Announcements
              </h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 tabular-nums">
                {filteredAnnouncements.length} active
              </span>
            </div>

            {filteredAnnouncements.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <Info className="h-8 w-8 text-slate-400" />
                <p className="mt-2 text-base font-semibold text-slate-700">
                  No active announcements in this category
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  New notices posted by CHMSU faculty and staff appear here
                  automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-1">
                {filteredAnnouncements.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-xl border p-4 transition ${
                      item.priority === "urgent"
                        ? "border-chmsu-flame/40 bg-orange-50/60"
                        : item.is_pinned
                          ? "border-chmsu-gold bg-amber-50/40"
                          : "border-chmsu-border bg-chmsu-canvas/60"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-chmsu-navy px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                          {item.category}
                        </span>
                        {item.campus_id === null && (
                          <span className="rounded-md bg-chmsu-green/15 px-2.5 py-0.5 text-xs font-semibold text-chmsu-forest">
                            University-Wide
                          </span>
                        )}
                        {item.is_pinned && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-chmsu-gold/40 px-2 py-0.5 text-xs font-semibold text-chmsu-forest">
                            <Pin className="h-3 w-3" />
                            Pinned
                          </span>
                        )}
                        {item.priority === "urgent" && (
                          <span className="rounded-md bg-chmsu-flame px-2 py-0.5 text-xs font-bold uppercase text-white">
                            Urgent
                          </span>
                        )}
                      </div>
                      <span className="flex items-center gap-1 text-xs font-medium text-slate-500 tabular-nums">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDateTime(item.published_at)}
                      </span>
                    </div>

                    <h3 className="mt-2 text-lg font-bold text-slate-900">
                      {item.title}
                    </h3>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700 sm:text-base">
                      {item.body}
                    </p>

                    {item.event_start_at && (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-chmsu-border bg-white px-3 py-1.5 text-xs font-semibold text-chmsu-navy">
                        <Calendar className="h-3.5 w-3.5 text-chmsu-green" />
                        <span>
                          Schedule: {formatDateTime(item.event_start_at)}
                          {item.event_end_at
                            ? ` – ${formatDateTime(item.event_end_at)}`
                            : ""}
                        </span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Calendar & Events Strip */}
          <div className="shrink-0 rounded-2xl border border-chmsu-border bg-white p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold text-chmsu-navy sm:text-lg">
                <Calendar className="h-5 w-5 text-chmsu-green" />
                Upcoming Campus Calendar &amp; Events
              </h2>
            </div>

            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-slate-500">
                No upcoming scheduled campus events posted yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {upcomingEvents.slice(0, 4).map((ev) => {
                  const dt = formatEventDate(ev.event_start_at || ev.published_at);
                  return (
                    <div
                      key={ev.id}
                      className="flex items-center gap-3 rounded-xl border border-chmsu-border bg-chmsu-canvas p-2.5"
                    >
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-chmsu-navy text-white">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-chmsu-gold">
                          {dt.month}
                        </span>
                        <span className="text-base font-bold leading-none tabular-nums">
                          {dt.day}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {ev.title}
                        </p>
                        <p className="text-xs text-slate-600 tabular-nums">
                          {ev.event_start_at ? dt.time : "All-day / Notice"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right Column (5/12): Searchable Live Instructor Locator */}
        <section className="flex flex-col rounded-2xl border border-chmsu-border bg-white p-4 lg:col-span-5 lg:min-h-0">
          <div className="shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-bold text-chmsu-forest sm:text-xl">
                <Users className="h-5 w-5 text-chmsu-green" />
                Instructor Locator
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 tabular-nums">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {availableCount} Available Now
              </span>
            </div>

            {/* Touch-Friendly Search Input */}
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={facultyQuery}
                onChange={(e) => setFacultyQuery(e.target.value)}
                placeholder="Search instructor, department, or room..."
                aria-label="Search instructor locator"
                className="min-h-12 w-full rounded-xl border border-chmsu-border bg-chmsu-canvas pl-11 pr-10 text-base text-slate-900 outline-none transition focus:border-chmsu-green focus:bg-white focus:ring-2 focus:ring-chmsu-green/20"
              />
              {facultyQuery && (
                <button
                  type="button"
                  onClick={() => setFacultyQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Quick Status Filter Pills */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[
                { value: "all", label: "All" },
                { value: "available", label: "Available" },
                { value: "in_class", label: "In Class" },
                { value: "in_meeting", label: "In Meeting" },
                { value: "on_leave", label: "On Leave" },
              ].map((st) => (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => setAvailabilityFilter(st.value)}
                  className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition ${
                    availabilityFilter === st.value
                      ? "bg-chmsu-navy text-white"
                      : "border border-chmsu-border bg-chmsu-canvas text-slate-700 hover:border-chmsu-navy/40"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Instructor List */}
          <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto pr-1">
            {filteredFaculty.length === 0 ? (
              <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center">
                <Users className="h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  No matching instructors found
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Instructors who enable kiosk visibility appear here in real
                  time.
                </p>
              </div>
            ) : (
              filteredFaculty.map((person) => {
                const statusMeta = getAvailabilityMeta(person.availability_status);
                return (
                  <article
                    key={person.id}
                    className="rounded-xl border border-chmsu-border bg-chmsu-canvas/70 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-slate-900">
                          {person.full_name}
                        </h3>
                        <p className="truncate text-xs font-medium text-slate-600">
                          {[person.job_title, person.department]
                            .filter(Boolean)
                            .join(" • ") || "CHMSU Faculty"}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusMeta.badgeClass}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`}
                        />
                        {statusMeta.label}
                      </span>
                    </div>

                    {person.office_location && (
                      <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-chmsu-navy">
                        <MapPin className="h-4 w-4 shrink-0 text-chmsu-green" />
                        <span>{person.office_location}</span>
                      </p>
                    )}

                    {person.availability_note && (
                      <p className="mt-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-700 border border-chmsu-border">
                        {person.availability_note}
                      </p>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* RA 10173 Privacy-Compliant Kiosk Footer */}
      <footer className="shrink-0 border-t border-chmsu-forest/15 bg-chmsu-navy px-5 py-2.5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
          <p className="font-medium">
            <span className="font-bold text-chmsu-gold">Privacy Notice (RA 10173):</span>{" "}
            This public kiosk displays announcements, schedules, and faculty
            availability only. For personal document tracking, please sign in on
            your own device via the{" "}
            <Link
              href={`/login/${campus.slug}`}
              className="font-bold text-chmsu-gold underline underline-offset-2 hover:text-white"
            >
              Student Web Portal
            </Link>
            .
          </p>
          <Link
            href="/"
            className="text-xs font-semibold text-white/80 hover:text-chmsu-gold"
          >
            Switch Campus
          </Link>
        </div>
      </footer>
    </div>
  );
}
