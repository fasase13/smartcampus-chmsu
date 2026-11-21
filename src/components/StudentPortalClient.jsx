"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Building2,
  Calendar,
  Check,
  CheckCheck,
  Clock,
  FileSearch,
  Globe,
  Loader2,
  LogOut,
  MapPin,
  Monitor,
  Newspaper,
  Pin,
  Radio,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PrivacyTermsGate from "@/components/PrivacyTermsGate";
import {
  ANNOUNCEMENT_CATEGORIES,
  DOCUMENT_STATUS_META,
  ROUTE_ACTION_LABELS,
  getAvailabilityMeta,
} from "@/lib/constants";
import PrivacyNoticeModal from "@/components/PrivacyNoticeModal";

const NEWS_CATEGORIES = [
  { value: "all", label: "All" },
  ...ANNOUNCEMENT_CATEGORIES,
];

function formatDateTime(isoString) {
  if (!isoString) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoString));
}

export default function StudentPortalClient({
  profile,
  campus,
  initialAnnouncements,
  initialFaculty,
  initialNotifications,
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("news");
  const [signingOut, setSigningOut] = useState(false);

  // Live data states
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [faculty, setFaculty] = useState(initialFaculty);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [realtimeLive, setRealtimeLive] = useState(false);

  // News filters
  const [newsQuery, setNewsQuery] = useState("");
  const [newsCategory, setNewsCategory] = useState("all");

  // Instructor filters
  const [facultyQuery, setFacultyQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Document Tracker state
  const [trackingInput, setTrackingInput] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [trackedDoc, setTrackedDoc] = useState(null);
  const [hasSearchedDoc, setHasSearchedDoc] = useState(false);

  // Notification actions
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  // Refetch helpers for Realtime
  const refreshAnnouncements = useCallback(async () => {
    const supabase = createClient();
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("announcements")
      .select(
        "id, campus_id, title, body, category, priority, is_pinned, event_start_at, event_end_at, published_at, expires_at"
      )
      .eq("is_active", true)
      .lte("published_at", nowIso)
      .or(`campus_id.eq.${campus.id},campus_id.is.null`)
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(60);

    if (data) {
      setAnnouncements(
        data.filter(
          (item) => !item.expires_at || new Date(item.expires_at) > new Date()
        )
      );
    }
  }, [campus.id]);

  const refreshFaculty = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("public_faculty_availability")
      .select(
        "id, campus_id, full_name, department, job_title, office_location, availability_status, availability_note, availability_updated_at"
      )
      .eq("campus_id", campus.id)
      .order("full_name", { ascending: true });

    if (data) setFaculty(data);
  }, [campus.id]);

  const refreshNotifications = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, message, is_read, read_at, created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) setNotifications(data);
  }, [profile.id]);

  // Supabase Realtime subscriptions
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`student-portal-${campus.slug}-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => refreshAnnouncements()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `campus_id=eq.${campus.id}`,
        },
        () => refreshFaculty()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        () => refreshNotifications()
      )
      .subscribe((status) => {
        setRealtimeLive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    campus.id,
    campus.slug,
    profile.id,
    refreshAnnouncements,
    refreshFaculty,
    refreshNotifications,
  ]);

  // Derived data: Filtered News
  const filteredAnnouncements = useMemo(() => {
    const q = newsQuery.trim().toLowerCase();
    return announcements.filter((a) => {
      const catMatch = newsCategory === "all" || a.category === newsCategory;
      if (!catMatch) return false;
      if (!q) return true;
      return (
        a.title?.toLowerCase().includes(q) ||
        a.body?.toLowerCase().includes(q)
      );
    });
  }, [announcements, newsQuery, newsCategory]);

  // Derived data: Departments & Filtered Instructors
  const departments = useMemo(() => {
    const set = new Set(
      faculty.map((f) => f.department?.trim()).filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [faculty]);

  const filteredFaculty = useMemo(() => {
    const q = facultyQuery.trim().toLowerCase();
    return faculty.filter((f) => {
      const deptMatch =
        departmentFilter === "all" || f.department === departmentFilter;
      const statusMatch =
        statusFilter === "all" || f.availability_status === statusFilter;
      if (!deptMatch || !statusMatch) return false;
      if (!q) return true;
      return (
        f.full_name?.toLowerCase().includes(q) ||
        f.department?.toLowerCase().includes(q) ||
        f.office_location?.toLowerCase().includes(q) ||
        f.job_title?.toLowerCase().includes(q)
      );
    });
  }, [faculty, facultyQuery, departmentFilter, statusFilter]);

  // Document ID Lookup via SECURITY DEFINER RPC
  async function handleDocumentLookup(e) {
    e.preventDefault();
    const code = trackingInput.trim();
    if (!code) return;

    setTrackingLoading(true);
    setTrackingError("");
    setHasSearchedDoc(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "lookup_document_by_tracking_code",
        { p_tracking_code: code }
      );

      if (error) {
        setTrackedDoc(null);
        setTrackingError(
          "Unable to verify tracking code right now. Please try again."
        );
        return;
      }

      setTrackedDoc(data ?? null);
    } finally {
      setTrackingLoading(false);
    }
  }

  // Notification handlers
  async function markNotificationRead(id) {
    const nowIso = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: nowIso } : n
      )
    );
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: nowIso })
      .eq("id", id)
      .eq("user_id", profile.id);
  }

  async function markAllRead() {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    const nowIso = new Date().toISOString();
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: nowIso })
        .eq("user_id", profile.id)
        .eq("is_read", false);

      if (!error) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at ?? nowIso }))
        );
      }
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const tabs = [
    { id: "news", label: "News", desktopLabel: "Campus News", icon: Newspaper },
    {
      id: "instructors",
      label: "Instructors",
      desktopLabel: "Instructor Locator",
      icon: Users,
    },
    {
      id: "track",
      label: "Track Doc",
      desktopLabel: "Track Document",
      icon: FileSearch,
    },
    {
      id: "alerts",
      label: "Alerts",
      desktopLabel: "Notifications",
      icon: Bell,
      badge: unreadCount,
    },
  ];

  const trackedStatusMeta = trackedDoc
    ? DOCUMENT_STATUS_META[trackedDoc.status] ?? {
        label: trackedDoc.status,
        badgeClass: "bg-slate-100 text-slate-800 border-slate-200",
      }
    : null;

  return (
    <div className="min-h-dvh flex flex-col overflow-x-hidden bg-chmsu-canvas text-slate-900 md:flex-row">
      <PrivacyTermsGate profile={profile} />
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-chmsu-forest/15 bg-chmsu-forest text-white md:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white p-0.5">
            <Image
              src="/images/chmsu-logo.jpg"
              alt="CHMSU Seal"
              width={38}
              height={38}
              className="h-full w-full rounded-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight">
              Student Portal
            </p>
            <p className="truncate text-[11px] font-medium text-chmsu-gold">
              CHMSU {campus.name}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Student Navigation">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? "bg-chmsu-green text-white shadow-xs"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.desktopLabel}</span>
                </span>
                {tab.badge > 0 && (
                  <span className="rounded-full bg-chmsu-flame px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-3">
            <Link
              href={`/${campus.slug}/kiosk`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <Monitor className="h-4 w-4 shrink-0" />
              Open Public Kiosk
            </Link>
          </div>
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <p className="truncate text-sm font-semibold text-white">
              {profile.full_name}
            </p>
            <p className="mt-0.5 truncate text-xs text-white/75">
              {profile.email}
            </p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-chmsu-gold px-2.5 py-0.5 text-[11px] font-bold text-chmsu-forest">
              <Building2 className="h-3 w-3" />
              {campus.name}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-600/80 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky Header */}
        <header className="sticky top-0 z-30 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Image
                src="/images/chmsu-logo.jpg"
                alt="CHMSU Seal"
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-full object-contain md:hidden"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-bold text-chmsu-forest sm:text-base">
                    {profile.full_name}
                  </p>
                  <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 sm:inline-flex">
                    <Radio
                      className={`h-3 w-3 ${
                        realtimeLive ? "text-emerald-600 animate-pulse" : "text-slate-400"
                      }`}
                    />
                    {realtimeLive ? "Live" : "..."}
                  </span>
                </div>
                <p className="truncate text-xs font-medium text-slate-500">
                  CHMSU {campus.name} &bull; Student Portal
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden sm:block">
                <PrivacyNoticeModal compact />
              </div>
              <span className="hidden rounded-full border border-chmsu-green/25 bg-chmsu-green/10 px-3 py-1 text-xs font-semibold text-chmsu-forest sm:inline-flex">
                {campus.code}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60 md:hidden"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area (padded for mobile bottom nav) */}
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 pb-24 sm:px-6 md:pb-8">
          {/* ============================================================== */}
          {/* TAB 1: CAMPUS NEWS & ADVISORIES                                */}
          {/* ============================================================== */}
          {activeTab === "news" && (
            <section className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-chmsu-forest sm:text-2xl">
                  Campus News &amp; Advisories
                </h1>
                <p className="mt-0.5 text-sm text-slate-600">
                  Official updates for CHMSU {campus.name} and university-wide
                  announcements.
                </p>
              </div>

              {/* Search & Category Filters */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={newsQuery}
                    onChange={(e) => setNewsQuery(e.target.value)}
                    placeholder="Search announcements..."
                    className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-9 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                  />
                  {newsQuery && (
                    <button
                      type="button"
                      onClick={() => setNewsQuery("")}
                      aria-label="Clear news search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {NEWS_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setNewsCategory(cat.value)}
                      className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${
                        newsCategory === cat.value
                          ? "bg-chmsu-forest text-white"
                          : "border border-chmsu-border bg-white text-slate-700 hover:border-chmsu-green"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* News Feed */}
              {filteredAnnouncements.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-chmsu-border bg-white p-8 text-center">
                  <Newspaper className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    No announcements match your filter
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    New campus and university advisories appear here in real
                    time.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAnnouncements.map((item) => (
                    <article
                      key={item.id}
                      className={`rounded-2xl border bg-white p-4 sm:p-5 ${
                        item.priority === "urgent" ||
                        item.category === "emergency"
                          ? "border-chmsu-flame/50 bg-orange-50/40"
                          : item.is_pinned
                            ? "border-chmsu-gold bg-amber-50/30"
                            : "border-chmsu-border"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-chmsu-navy px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
                            {item.category}
                          </span>
                          {item.campus_id === null ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-chmsu-green/15 px-2 py-0.5 text-[11px] font-semibold text-chmsu-forest">
                              <Globe className="h-3 w-3" />
                              University-Wide
                            </span>
                          ) : (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {campus.name}
                            </span>
                          )}
                          {item.is_pinned && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-chmsu-gold/40 px-2 py-0.5 text-[11px] font-semibold text-chmsu-forest">
                              <Pin className="h-3 w-3" />
                              Pinned
                            </span>
                          )}
                          {item.priority === "urgent" && (
                            <span className="rounded-md bg-chmsu-flame px-2 py-0.5 text-[11px] font-bold uppercase text-white">
                              Urgent
                            </span>
                          )}
                        </div>
                        <span className="flex items-center gap-1 text-xs text-slate-500 tabular-nums">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDateTime(item.published_at)}
                        </span>
                      </div>

                      <h2 className="mt-2.5 text-base font-bold text-slate-900 sm:text-lg">
                        {item.title}
                      </h2>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                        {item.body}
                      </p>

                      {item.event_start_at && (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-chmsu-border bg-chmsu-canvas px-3 py-1.5 text-xs font-semibold text-chmsu-navy">
                          <Calendar className="h-3.5 w-3.5 text-chmsu-green" />
                          <span>
                            {formatDateTime(item.event_start_at)}
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
            </section>
          )}

          {/* ============================================================== */}
          {/* TAB 2: INSTRUCTOR LOCATOR                                      */}
          {/* ============================================================== */}
          {activeTab === "instructors" && (
            <section className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-chmsu-forest sm:text-2xl">
                  Instructor Locator
                </h1>
                <p className="mt-0.5 text-sm text-slate-600">
                  Real-time faculty availability and office locations at CHMSU{" "}
                  {campus.name}.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={facultyQuery}
                    onChange={(e) => setFacultyQuery(e.target.value)}
                    placeholder="Search name, room, or title..."
                    className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                  />
                </div>

                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  aria-label="Filter by department"
                  className="w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-chmsu-green"
                >
                  <option value="all">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: "all", label: "All Statuses" },
                  { value: "available", label: "Available" },
                  { value: "in_class", label: "In Class" },
                  { value: "in_meeting", label: "In Meeting" },
                  { value: "on_leave", label: "On Leave" },
                  { value: "offline", label: "Offline" },
                ].map((st) => (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => setStatusFilter(st.value)}
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${
                      statusFilter === st.value
                        ? "bg-chmsu-navy text-white"
                        : "border border-chmsu-border bg-white text-slate-700 hover:border-chmsu-navy/40"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {filteredFaculty.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-chmsu-border bg-white p-8 text-center">
                  <Users className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    No matching instructors found
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Try clearing your search or department filter.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredFaculty.map((person) => {
                    const meta = getAvailabilityMeta(person.availability_status);
                    return (
                      <article
                        key={person.id}
                        className="rounded-2xl border border-chmsu-border bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h2 className="truncate text-base font-bold text-slate-900">
                              {person.full_name}
                            </h2>
                            <p className="truncate text-xs text-slate-500">
                              {[person.job_title, person.department]
                                .filter(Boolean)
                                .join(" • ") || "CHMSU Faculty"}
                            </p>
                          </div>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.badgeClass}`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${meta.dotClass}`}
                            />
                            {meta.label}
                          </span>
                        </div>

                        {person.office_location && (
                          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-chmsu-navy">
                            <MapPin className="h-4 w-4 shrink-0 text-chmsu-green" />
                            <span>{person.office_location}</span>
                          </p>
                        )}

                        {person.availability_note && (
                          <p className="mt-2 rounded-xl border border-chmsu-border bg-chmsu-canvas px-3 py-2 text-xs text-slate-700">
                            {person.availability_note}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* ============================================================== */}
          {/* TAB 3: PRIVATE DOCUMENT ID TRACKER                             */}
          {/* ============================================================== */}
          {activeTab === "track" && (
            <section className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-chmsu-forest sm:text-2xl">
                  Private Document ID Tracker
                </h1>
                <p className="mt-0.5 text-sm text-slate-600">
                  Enter your official CHMSU Document Tracking Code to check live
                  processing progress.
                </p>
              </div>

              {/* Lookup Form */}
              <form
                onSubmit={handleDocumentLookup}
                className="rounded-2xl border border-chmsu-border bg-white p-4 sm:p-5"
              >
                <label
                  htmlFor="tracking_code"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Document Tracking Code
                </label>
                <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
                  <div className="relative flex-1">
                    <FileSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="tracking_code"
                      type="text"
                      required
                      value={trackingInput}
                      onChange={(e) => setTrackingInput(e.target.value)}
                      placeholder="e.g., CHMSU-TAL-2026-0001"
                      className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2.5 pl-10 pr-3.5 font-mono text-sm uppercase text-slate-900 outline-none focus:border-chmsu-green focus:bg-white focus:ring-2 focus:ring-chmsu-green/20"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={trackingLoading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:opacity-60"
                  >
                    {trackingLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Tracking...
                      </>
                    ) : (
                      "Track Document"
                    )}
                  </button>
                </div>

                <p className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-chmsu-green" />
                  RA 10173 Protected: Exact tracking code required. Internal
                  staff remarks and confidential records are never exposed.
                </p>
              </form>

              {trackingError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  {trackingError}
                </div>
              )}

              {/* Empty / Not Found State */}
              {hasSearchedDoc && !trackingLoading && !trackingError && !trackedDoc && (
                <div className="rounded-2xl border border-dashed border-chmsu-border bg-white p-8 text-center">
                  <FileSearch className="mx-auto h-9 w-9 text-slate-400" />
                  <h2 className="mt-2.5 text-base font-bold text-slate-800">
                    No Trackable Document Found
                  </h2>
                  <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                    We couldn&apos;t find a public-trackable record matching{" "}
                    <span className="font-mono font-semibold text-slate-700">
                      {trackingInput.trim().toUpperCase()}
                    </span>
                    . Double-check the tracking code on your RMO slip or contact
                    your campus Records Management Office.
                  </p>
                </div>
              )}

              {/* Tracked Document Result */}
              {trackedDoc && (
                <div className="space-y-4">
                  {/* Delayed Alert Banner */}
                  {trackedDoc.is_delayed && (
                    <div
                      role="alert"
                      className="flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-900"
                    >
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                      <div>
                        <p className="text-sm font-bold">
                          Processing Delay Alert
                        </p>
                        <p className="mt-0.5 text-xs text-red-800 sm:text-sm">
                          This document has exceeded its target processing
                          window and has been flagged for follow-up at{" "}
                          <span className="font-semibold">
                            {trackedDoc.current_office} ({trackedDoc.current_campus_name})
                          </span>
                          .
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Document Summary Card */}
                  <div className="rounded-2xl border border-chmsu-border bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-bold tracking-wider text-chmsu-green">
                          {trackedDoc.tracking_code}
                        </p>
                        <h2 className="mt-1 text-lg font-bold text-chmsu-forest">
                          {trackedDoc.title}
                        </h2>
                        <p className="text-xs font-medium text-slate-500">
                          Type: {trackedDoc.document_type}
                        </p>
                      </div>

                      {trackedStatusMeta && (
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${trackedStatusMeta.badgeClass}`}
                        >
                          {trackedStatusMeta.label}
                        </span>
                      )}
                    </div>

                    <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-chmsu-border pt-4 text-sm sm:grid-cols-2">
                      <div className="rounded-xl bg-chmsu-canvas p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Current Location
                        </dt>
                        <dd className="mt-1 font-semibold text-chmsu-navy">
                          {trackedDoc.current_office}
                        </dd>
                        <dd className="text-xs text-slate-600">
                          CHMSU {trackedDoc.current_campus_name}
                        </dd>
                      </div>

                      <div className="rounded-xl bg-chmsu-canvas p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Origin Campus
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                          CHMSU {trackedDoc.origin_campus_name}
                        </dd>
                        <dd className="text-xs text-slate-600 tabular-nums">
                          Filed: {formatDateTime(trackedDoc.created_at)}
                        </dd>
                      </div>

                      <div className="rounded-xl bg-chmsu-canvas p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Target Completion / Due Date
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900 tabular-nums">
                          {formatDateTime(trackedDoc.due_at)}
                        </dd>
                      </div>

                      <div className="rounded-xl bg-chmsu-canvas p-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {trackedDoc.completed_at
                            ? "Completed At"
                            : "Last Updated"}
                        </dt>
                        <dd className="mt-1 font-semibold text-slate-900 tabular-nums">
                          {formatDateTime(
                            trackedDoc.completed_at || trackedDoc.updated_at
                          )}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {/* Chronological Vertical Custody Timeline */}
                  <div className="rounded-2xl border border-chmsu-border bg-white p-5">
                    <h3 className="text-base font-bold text-chmsu-forest">
                      Custody &amp; Routing Timeline
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Chronological office handoffs from registration to release.
                    </p>

                    {!trackedDoc.timeline || trackedDoc.timeline.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-500">
                        No routing steps recorded yet.
                      </p>
                    ) : (
                      <ol className="mt-5 space-y-5 border-l-2 border-chmsu-green/30 pl-5">
                        {trackedDoc.timeline.map((step, idx) => {
                          const isLatest =
                            idx === trackedDoc.timeline.length - 1;
                          const isDelayStep = step.action === "delay_flagged";
                          return (
                            <li key={`${step.created_at}-${idx}`} className="relative">
                              <span
                                className={`absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ${
                                  isDelayStep
                                    ? "bg-red-600"
                                    : isLatest
                                      ? "bg-chmsu-green"
                                      : "bg-chmsu-forest"
                                }`}
                              />
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-bold text-slate-900">
                                  {ROUTE_ACTION_LABELS[step.action] ??
                                    step.action}
                                </p>
                                <span className="text-xs font-medium text-slate-500 tabular-nums">
                                  {formatDateTime(step.created_at)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-sm text-slate-700">
                                {step.from_office ? (
                                  <>
                                    <span className="text-slate-500">
                                      {step.from_office}
                                    </span>{" "}
                                    &rarr;{" "}
                                    <span className="font-semibold text-chmsu-navy">
                                      {step.to_office}
                                    </span>
                                  </>
                                ) : (
                                  <span className="font-semibold text-chmsu-navy">
                                    {step.to_office}
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                CHMSU {step.campus_name}
                              </p>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ============================================================== */}
          {/* TAB 4: NOTIFICATION CENTER                                     */}
          {/* ============================================================== */}
          {activeTab === "alerts" && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-chmsu-forest sm:text-2xl">
                    Notification Center
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Real-time alerts for your account and document updates.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={unreadCount === 0 || markingAll}
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-xs font-semibold text-chmsu-forest transition hover:border-chmsu-green hover:bg-chmsu-green/10 disabled:opacity-50"
                >
                  <CheckCheck className="h-4 w-4 text-chmsu-green" />
                  Mark All as Read
                </button>
              </div>

              {notifications.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-chmsu-border bg-white p-8 text-center">
                  <Bell className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    You&apos;re all caught up
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    New document alerts and campus notifications will appear
                    here automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {notifications.map((notif) => (
                    <article
                      key={notif.id}
                      className={`rounded-2xl border p-4 transition ${
                        notif.is_read
                          ? "border-chmsu-border bg-white"
                          : notif.type === "delay_alert"
                            ? "border-red-300 bg-red-50/70"
                            : "border-chmsu-green/40 bg-emerald-50/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {!notif.is_read && (
                              <span className="h-2 w-2 rounded-full bg-chmsu-flame" />
                            )}
                            <h2 className="text-sm font-bold text-slate-900">
                              {notif.title}
                            </h2>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              {notif.type.replace("_", " ")}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-700">
                            {notif.message}
                          </p>
                          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
                            {formatDateTime(notif.created_at)}
                          </p>
                        </div>

                        {!notif.is_read && (
                          <button
                            type="button"
                            onClick={() => markNotificationRead(notif.id)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-chmsu-border bg-white px-2.5 py-1.5 text-xs font-semibold text-chmsu-forest hover:border-chmsu-green"
                          >
                            <Check className="h-3.5 w-3.5 text-chmsu-green" />
                            Read
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-chmsu-border bg-white/95 backdrop-blur md:hidden"
      >
        <div className="grid grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition ${
                  isActive
                    ? "text-chmsu-forest"
                    : "text-slate-500 hover:text-chmsu-forest"
                }`}
              >
                {isActive && (
                  <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-chmsu-green" />
                )}
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {tab.badge > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-chmsu-flame px-1 text-[10px] font-bold text-white tabular-nums">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  )}
                </span>
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
