"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Calendar,
  Clock,
  Globe,
  LogOut,
  MapPin,
  Newspaper,
  Pin,
  Search,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PrivacyTermsGate from "@/components/PrivacyTermsGate";
import LiveNotificationBell from "@/components/LiveNotificationBell";
import HeaderAccountMenu from "@/components/HeaderAccountMenu";
import UserProfileView from "@/components/UserProfileView";
import PortalSidebar, {
  SidebarToggleButton,
  usePortalSidebarState,
} from "@/components/PortalSidebar";
import useUnreadAnnouncements from "@/hooks/useUnreadAnnouncements";
import {
  ANNOUNCEMENT_CATEGORIES,
  getAvailabilityMeta,
} from "@/lib/constants";

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
  initialTab = "news",
  initialAnnouncements,
  initialFaculty,
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(
    initialTab === "instructors" || initialTab === "profile"
      ? initialTab
      : "news"
  );
  const [signingOut, setSigningOut] = useState(false);
  const { collapsed, mobileOpen, toggleSidebar, closeMobile } =
    usePortalSidebarState();

  // Live data states
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [faculty, setFaculty] = useState(initialFaculty);

  // News filters
  const [newsQuery, setNewsQuery] = useState("");
  const [newsCategory, setNewsCategory] = useState("all");

  // Instructor filters
  const [facultyQuery, setFacultyQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    campus.id,
    campus.slug,
    profile.id,
    refreshAnnouncements,
    refreshFaculty,
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

  const { unreadCount: unreadAnnouncementsCount } = useUnreadAnnouncements({
    userId: profile.id,
    announcements,
    isViewingAnnouncements: activeTab === "news",
  });

  const tabs = [
    {
      id: "news",
      label: "Announcements",
      desktopLabel: "Announcements",
      icon: Newspaper,
      badge: unreadAnnouncementsCount,
    },
    {
      id: "instructors",
      label: "Instructor Locator",
      desktopLabel: "Instructor Locator",
      icon: Users,
    },
    {
      id: "profile",
      label: "My Profile",
      desktopLabel: "My Profile",
      icon: UserCircle,
    },
  ];

  const sidebarNavItems = tabs
    .filter((tab) => tab.id !== "profile")
    .map((tab) => ({
      id: tab.id,
      label: tab.desktopLabel,
      icon: tab.icon,
      badge: tab.badge,
    }));

  return (
    <div className="min-h-dvh flex flex-col overflow-x-hidden bg-chmsu-canvas text-slate-900 lg:flex-row">
      <PrivacyTermsGate profile={profile} />

      <PortalSidebar
        title="Student Portal"
        subtitle={`CHMSU ${campus.name}`}
        navItems={sidebarNavItems}
        activeId={activeTab}
        onSelect={setActiveTab}
        profile={profile}
        roleBadge={`Student • ${campus.name}`}
        roleIcon={Building2}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        collapsed={collapsed}
        onToggleCollapse={toggleSidebar}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
        ariaLabel="Student Navigation"
      />

      {/* Main Column */}
      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-200 ${collapsed ? "lg:pl-20" : "lg:pl-64"
          }`}
      >
        {/* Sticky Header */}
        <header className="sticky top-0 z-20 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarToggleButton onClick={toggleSidebar} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-chmsu-forest sm:text-base">
                  CHMSU {campus.name}
                </p>
                <p className="truncate text-xs font-medium text-slate-500">
                  Student Portal
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
              <LiveNotificationBell
                userId={profile.id}
                onNavigate={() => setActiveTab("news")}
              />
              <HeaderAccountMenu
                onOpenProfile={() => {
                  setActiveTab("profile");
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.set("tab", "profile");
                    window.history.replaceState(null, "", url.toString());
                  }
                }}
                onSignOut={handleSignOut}
                signingOut={signingOut}
              />
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="inline-flex items-center gap-1.5 rounded-lg border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60 sm:hidden"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area (padded for mobile bottom nav) */}
        <main className="w-full flex-1 px-4 py-5 pb-24 sm:px-6 md:pb-8">
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
                      className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${newsCategory === cat.value
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
                      className={`rounded-2xl border bg-white p-4 sm:p-5 ${item.priority === "urgent" ||
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
                    className={`min-h-9 rounded-lg px-3 text-xs font-semibold transition ${statusFilter === st.value
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

          {/* TAB 3: MY PROFILE */}
          {activeTab === "profile" && (
            <UserProfileView profile={profile} campus={campus} />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-chmsu-border bg-white/95 backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition ${isActive
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
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FACC15] px-1 text-[10px] font-bold text-[#143D29] tabular-nums">
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
