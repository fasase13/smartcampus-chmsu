"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Edit3,
  Eye,
  FileText,
  Loader2,
  Megaphone,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RegistrationReviewModal from "@/components/RegistrationReviewModal";
import LiveNotificationBell from "@/components/LiveNotificationBell";
import HeaderAccountMenu from "@/components/HeaderAccountMenu";
import UserProfileView from "@/components/UserProfileView";
import PortalSidebar, {
  SidebarToggleButton,
  usePortalSidebarState,
} from "@/components/PortalSidebar";
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_PRIORITIES,
  CAMPUS_ADMIN_ASSIGNABLE_ROLES,
  DOCUMENT_STATUS_META,
  ROLE_LABELS,
  ROLES,
  getCampusAdminTitle,
} from "@/lib/constants";

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

function isDocOverdue(doc) {
  if (!doc) return false;
  if (doc.status === "completed" || doc.status === "archived") return false;
  if (doc.is_delayed) return true;
  return Boolean(doc.due_at && new Date(doc.due_at) < new Date());
}

const EMPTY_ANNOUNCEMENT = {
  id: null,
  title: "",
  body: "",
  category: "general",
  priority: "normal",
  is_public: true,
  is_pinned: false,
};

export default function CampusAdminPortalClient({
  profile,
  campus,
  initialUsers,
  initialAnnouncements,
  initialDocuments,
}) {
  const router = useRouter();
  const campusAdminTitle = getCampusAdminTitle(campus.slug, campus.name);

  const [activeTab, setActiveTab] = useState("registrations");
  const [signingOut, setSigningOut] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { collapsed, mobileOpen, toggleSidebar, closeMobile } =
    usePortalSidebarState();

  const [users, setUsers] = useState(initialUsers);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [documents, setDocuments] = useState(initialDocuments);
  const [runningSla, setRunningSla] = useState(false);

  // Pending review modal target
  const [reviewUser, setReviewUser] = useState(null);

  // Campus announcements form
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  // Campus users directory & read-only details modal
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [togglingUserStatus, setTogglingUserStatus] = useState(false);

  const refreshUsers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, campus_id, email, full_name, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, department, program_or_course, job_title, office_location, is_teaching, show_on_kiosk, is_active, created_at"
      )
      .eq("campus_id", campus.id)
      .order("created_at", { ascending: false });
    if (data) setUsers(data);
  }, [campus.id]);

  const refreshAnnouncements = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("announcements")
      .select(
        "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, published_at, is_active, created_at"
      )
      .eq("campus_id", campus.id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(150);
    if (data) setAnnouncements(data);
  }, [campus.id]);

  const refreshDocuments = useCallback(async () => {
    const supabase = createClient();
    // Strict RLS (can_access_document) includes origin, current, AND route-history campus matches
    const { data } = await supabase
      .from("documents")
      .select(
        "id, tracking_code, origin_campus_id, current_campus_id, title, document_type, priority, status, current_office, sla_hours, due_at, is_delayed, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setDocuments(data);
  }, []);

  // Background Realtime sync scoped to campus
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`campus-admin-${campus.slug}-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `campus_id=eq.${campus.id}`,
        },
        () => refreshUsers()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements",
          filter: `campus_id=eq.${campus.id}`,
        },
        () => refreshAnnouncements()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        () => refreshDocuments()
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
    refreshDocuments,
    refreshUsers,
  ]);

  const pendingRegistrations = useMemo(() => {
    return users.filter(
      (u) => u.approval_status === "pending" && u.profile_completed === true
    );
  }, [users]);

  const directoryUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (u.approval_status !== "approved") return false;
      if (userRoleFilter !== "all" && u.role !== userRoleFilter) return false;
      if (!q) return true;
      return (
        u.full_name?.toLowerCase().includes(q) ||
        u.employee_or_student_id?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    });
  }, [userRoleFilter, userSearch, users]);

  const overdueDocs = useMemo(
    () => documents.filter(isDocOverdue),
    [documents]
  );

  // Callback after RegistrationReviewModal completes activate / return / reject
  async function handleReviewCompleted(decision, target) {
    setReviewUser(null);
    await refreshUsers();
    setFeedback({
      type: decision === "activate" ? "success" : "warning",
      message:
        decision === "activate"
          ? `Activated account for ${target.full_name} at CHMSU ${campus.name}.`
          : decision === "return"
            ? `Returned registration for ${target.full_name} for correction.`
            : `Rejected registration and permanently banned ${target.email}.`,
    });
  }

  // Campus Announcement CRUD (locked to campus.id)
  async function handleSaveAnnouncement(e) {
    e.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.body.trim()) return;
    setSavingAnnouncement(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      const payload = {
        campus_id: campus.id,
        title: announcementForm.title.trim(),
        body: announcementForm.body.trim(),
        category: announcementForm.category,
        priority: announcementForm.priority,
        is_public: Boolean(announcementForm.is_public),
        is_pinned: Boolean(announcementForm.is_pinned),
      };

      let error;
      if (announcementForm.id) {
        ({ error } = await supabase
          .from("announcements")
          .update(payload)
          .eq("id", announcementForm.id)
          .eq("campus_id", campus.id));
      } else {
        ({ error } = await supabase.from("announcements").insert({
          ...payload,
          author_id: profile.id,
        }));
      }

      if (error) {
        setFeedback({ type: "error", message: error.message });
        return;
      }

      setAnnouncementForm(EMPTY_ANNOUNCEMENT);
      await refreshAnnouncements();
      setFeedback({
        type: "success",
        message: announcementForm.id
          ? "Campus announcement updated."
          : `Announcement published for CHMSU ${campus.name}.`,
      });
    } finally {
      setSavingAnnouncement(false);
    }
  }

  async function handleTogglePin(item) {
    const supabase = createClient();
    const { error } = await supabase
      .from("announcements")
      .update({ is_pinned: !item.is_pinned })
      .eq("id", item.id)
      .eq("campus_id", campus.id);
    if (error) {
      setFeedback({ type: "error", message: error.message });
      return;
    }
    await refreshAnnouncements();
  }

  async function handleDeleteAnnouncement(item) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", item.id)
      .eq("campus_id", campus.id);
    if (error) {
      setFeedback({ type: "error", message: error.message });
      return;
    }
    await refreshAnnouncements();
    setFeedback({ type: "success", message: "Campus announcement deleted." });
  }

  // Toggle Campus User Active Status ONLY (strictly scoped to campus_id)
  async function handleToggleUserActive() {
    if (!selectedUser) return;
    if (selectedUser.id === profile.id) {
      setFeedback({
        type: "error",
        message: "You cannot deactivate your own account.",
      });
      return;
    }
    if ([ROLES.SUPERADMIN, ROLES.CAMPUS_ADMIN].includes(selectedUser.role)) {
      setFeedback({
        type: "error",
        message: "Admin accounts cannot be modified from the campus directory.",
      });
      return;
    }

    const nextActive = !selectedUser.is_active;
    setTogglingUserStatus(true);
    setFeedback(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: nextActive })
        .eq("id", selectedUser.id)
        .eq("campus_id", campus.id);

      if (error) {
        setFeedback({ type: "error", message: error.message });
        return;
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id ? { ...u, is_active: nextActive } : u
        )
      );
      setSelectedUser((prev) =>
        prev ? { ...prev, is_active: nextActive } : null
      );
      await refreshUsers();
      setFeedback({
        type: nextActive ? "success" : "warning",
        message: nextActive
          ? `Reactivated account for ${selectedUser.full_name}.`
          : `Deactivated account for ${selectedUser.full_name}.`,
      });
    } finally {
      setTogglingUserStatus(false);
    }
  }

  async function handleRunSlaCheck() {
    setRunningSla(true);
    setFeedback(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("run_sla_delay_check");
      if (error) {
        setFeedback({ type: "error", message: error.message });
        return;
      }
      await refreshDocuments();
      const flagged = data?.flagged_count ?? 0;
      setFeedback({
        type: flagged > 0 ? "warning" : "success",
        message:
          flagged > 0
            ? `Flagged ${flagged} newly overdue document${flagged === 1 ? "" : "s"}.`
            : "SLA check completed — no newly overdue documents.",
      });
    } finally {
      setRunningSla(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/campus-admin");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const navTabs = [
    {
      id: "registrations",
      label: "Pending Registrations",
      icon: UserCheck,
      badge: pendingRegistrations.length,
    },
    { id: "announcements", label: "Campus Announcements", icon: Megaphone },
    { id: "users", label: "Campus Users & Directory", icon: Users },
    {
      id: "documents",
      label: "Campus Documents & Alerts",
      icon: FileText,
      alertCount: overdueDocs.length,
    },
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900 lg:flex-row">
      <PortalSidebar
        title="SmartCampus CHMSU"
        subtitle={`CHMSU ${campus.name}`}
        navItems={navTabs}
        activeId={activeTab}
        onSelect={setActiveTab}
        profile={profile}
        roleBadge={campusAdminTitle}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        collapsed={collapsed}
        onToggleCollapse={toggleSidebar}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
        ariaLabel="Campus Admin Navigation"
      />

      {/* Main Content */}
      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-200 ${collapsed ? "lg:pl-20" : "lg:pl-64"
          }`}
      >
        <header className="sticky top-0 z-20 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarToggleButton onClick={toggleSidebar} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-chmsu-forest">
                  {campusAdminTitle} Portal
                </p>
                <p className="truncate text-xs text-slate-500">
                  CHMSU {campus.name} &bull; Campus Administration
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <LiveNotificationBell
                userId={profile?.id}
                onNavigate={(item) => {
                  if (item.type === "system") setActiveTab("registrations");
                  else if (item.type === "announcement")
                    setActiveTab("announcements");
                  else setActiveTab("documents");
                }}
              />
              <HeaderAccountMenu
                userId={profile?.id}
                avatarUrl={profile?.avatar_url}
                fullName={profile?.full_name}
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
            </div>
          </div>
        </header>

        <main className="w-full flex-1 space-y-6 px-4 py-5 sm:px-6">
          {feedback && (
            <div
              role="status"
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${feedback.type === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : feedback.type === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
            >
              <span>{feedback.message}</span>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="rounded p-1 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* TAB 1: PENDING REGISTRATIONS */}
          {activeTab === "registrations" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Pending Registrations &mdash; CHMSU {campus.name}
                </h1>
                <p className="text-sm text-slate-600">
                  Verify uploaded Front &amp; Back School IDs for registrants in
                  your campus.
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                {pendingRegistrations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                    <CheckCircle2 className="h-9 w-9 text-chmsu-green" />
                    <p className="text-sm font-bold text-chmsu-forest">
                      All registrations for CHMSU {campus.name} are reviewed
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="px-5 py-3">School ID</th>
                          <th className="px-4 py-3">Applicant</th>
                          <th className="px-4 py-3">Requested Role</th>
                          <th className="px-4 py-3">Submitted</th>
                          <th className="px-5 py-3 text-left">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-chmsu-border">
                        {pendingRegistrations.map((u) => (
                          <tr key={u.id} className="hover:bg-chmsu-canvas/60">
                            <td className="px-5 py-3.5">
                              <span className="inline-flex items-center gap-1.5 rounded-lg border border-chmsu-border bg-chmsu-canvas px-2.5 py-1 font-mono text-xs font-bold tracking-widest text-chmsu-forest">
                                <CreditCard className="h-3.5 w-3.5 text-chmsu-green" />
                                {u.employee_or_student_id ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="font-semibold text-slate-900">
                                {u.full_name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {u.department || "No department"}
                                {u.program_or_course
                                  ? ` • ${u.program_or_course}`
                                  : u.office_location
                                    ? ` • ${u.office_location}`
                                    : ""}
                              </p>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                                {ROLE_LABELS[u.requested_role ?? "student"] ??
                                  "Student"}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-500 tabular-nums">
                              {formatDateTime(u.created_at)}
                            </td>
                            <td className="px-5 py-3.5 text-left">
                              <button
                                type="button"
                                onClick={() => setReviewUser(u)}
                                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-chmsu-forest px-3.5 py-2 text-xs font-semibold text-white hover:bg-chmsu-green"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View ID &amp; Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CAMPUS ANNOUNCEMENTS */}
          {activeTab === "announcements" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Campus Announcements &mdash; CHMSU {campus.name}
                </h1>
                <p className="text-sm text-slate-600">
                  Create, edit, pin, and delete announcements scoped to CHMSU{" "}
                  {campus.name}.
                </p>
              </div>

              <form
                onSubmit={handleSaveAnnouncement}
                className="space-y-4 rounded-2xl border border-chmsu-border bg-white p-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-chmsu-forest">
                    {announcementForm.id
                      ? "Edit Campus Announcement"
                      : "New Campus Announcement"}
                  </h2>
                  {announcementForm.id && (
                    <button
                      type="button"
                      onClick={() => setAnnouncementForm(EMPTY_ANNOUNCEMENT)}
                      className="text-xs font-semibold text-slate-500"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">
                      Category
                    </label>
                    <select
                      value={announcementForm.category}
                      onChange={(e) =>
                        setAnnouncementForm({
                          ...announcementForm,
                          category: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm"
                    >
                      {ANNOUNCEMENT_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600">
                      Priority
                    </label>
                    <select
                      value={announcementForm.priority}
                      onChange={(e) =>
                        setAnnouncementForm({
                          ...announcementForm,
                          priority: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm"
                    >
                      {ANNOUNCEMENT_PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={announcementForm.title}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        title: e.target.value,
                      })
                    }
                    placeholder="Announcement title..."
                    className="mt-1 w-full rounded-xl border border-chmsu-border px-3.5 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    Message
                  </label>
                  <textarea
                    rows={3}
                    required
                    minLength={3}
                    value={announcementForm.body}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        body: e.target.value,
                      })
                    }
                    placeholder={`Write announcement for CHMSU ${campus.name}...`}
                    className="mt-1 w-full rounded-xl border border-chmsu-border px-3.5 py-2 text-sm"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-700">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={announcementForm.is_public}
                        onChange={(e) =>
                          setAnnouncementForm({
                            ...announcementForm,
                            is_public: e.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-chmsu-green"
                      />
                      Visible on Public Kiosk
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={announcementForm.is_pinned}
                        onChange={(e) =>
                          setAnnouncementForm({
                            ...announcementForm,
                            is_pinned: e.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-chmsu-green"
                      />
                      Pin to Top
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={savingAnnouncement}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-forest px-4 py-2 text-xs font-bold text-white hover:bg-chmsu-green disabled:opacity-60"
                  >
                    {savingAnnouncement ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {announcementForm.id
                      ? "Save Changes"
                      : "Publish Announcement"}
                  </button>
                </div>
              </form>

              <div className="space-y-3">
                {announcements.length === 0 ? (
                  <div className="rounded-2xl border border-chmsu-border bg-white p-8 text-center text-sm text-slate-500">
                    No announcements published yet for CHMSU {campus.name}.
                  </div>
                ) : (
                  announcements.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-chmsu-border bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 uppercase text-slate-600">
                              {item.category}
                            </span>
                            {item.is_pinned && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
                                <Pin className="h-3 w-3" />
                                Pinned
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {item.title}
                          </h3>
                          <p className="text-xs text-slate-600 whitespace-pre-line">
                            {item.body}
                          </p>
                          <p className="text-[11px] text-slate-400 tabular-nums">
                            {formatDateTime(item.published_at || item.created_at)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleTogglePin(item)}
                            className="rounded-lg border border-chmsu-border p-1.5 text-slate-600 hover:border-chmsu-green"
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAnnouncementForm({
                                id: item.id,
                                title: item.title,
                                body: item.body,
                                category: item.category,
                                priority: item.priority,
                                is_public: Boolean(item.is_public),
                                is_pinned: Boolean(item.is_pinned),
                              })
                            }
                            className="rounded-lg border border-chmsu-border p-1.5 text-slate-600 hover:border-chmsu-green"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAnnouncement(item)}
                            className="rounded-lg border border-chmsu-border p-1.5 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CAMPUS USERS & DIRECTORY */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Campus Users &amp; Directory
                </h1>
                <p className="text-sm text-slate-600">
                  View campus user details and manage account activation status
                  for your campus.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-chmsu-border bg-white p-4 sm:grid-cols-3">
                <div className="relative sm:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name, School ID, email, department..."
                    className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2 pl-9 pr-3 text-sm outline-none focus:border-chmsu-green focus:bg-white"
                  />
                </div>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Roles</option>
                  {CAMPUS_ADMIN_ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-5 py-3">User</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-5 py-3 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-chmsu-border">
                      {directoryUsers.map((u) => (
                        <tr
                          key={u.id}
                          className={!u.is_active ? "bg-slate-50 opacity-65" : ""}
                        >
                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-900">
                              {u.full_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {u.employee_or_student_id ? (
                                <span className="mr-1.5 font-mono font-semibold text-chmsu-forest">
                                  ID {u.employee_or_student_id}
                                </span>
                              ) : null}
                              {u.email}
                              {u.department ? ` • ${u.department}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-chmsu-navy/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-navy">
                              {ROLE_LABELS[u.role] ?? u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.is_active
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-red-100 text-red-800"
                                }`}
                            >
                              {u.is_active ? "Active" : "Deactivated"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-left">
                            <button
                              type="button"
                              onClick={() => setSelectedUser(u)}
                              className="whitespace-nowrap rounded-lg border border-chmsu-border bg-white px-3 py-1.5 text-xs font-semibold text-chmsu-forest transition hover:border-chmsu-green"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CAMPUS DOCUMENTS & ALERTS */}
          {activeTab === "documents" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    Campus Documents &amp; SLA Alerts
                  </h1>
                  <p className="text-sm text-slate-600">
                    Monitor document routing and overdue SLA alerts for CHMSU{" "}
                    {campus.name}.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={runningSla}
                  onClick={handleRunSlaCheck}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-flame px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {runningSla ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Run SLA Delay Check
                </button>
              </div>

              {overdueDocs.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-red-900">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    {overdueDocs.length} Overdue Document
                    {overdueDocs.length === 1 ? "" : "s"} Requiring Attention
                  </div>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                {documents.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No documents recorded for CHMSU {campus.name} yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="px-5 py-3">Tracking Code</th>
                          <th className="px-4 py-3">Document</th>
                          <th className="px-4 py-3">Current Office</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-5 py-3 text-right">Due</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-chmsu-border">
                        {documents.map((d) => {
                          const overdue = isDocOverdue(d);
                          const statusMeta = DOCUMENT_STATUS_META[d.status] ?? {
                            label: d.status,
                            badgeClass:
                              "bg-slate-100 text-slate-800 border-slate-200",
                          };
                          return (
                            <tr
                              key={d.id}
                              className={overdue ? "bg-red-50/40" : ""}
                            >
                              <td className="px-5 py-3 font-mono text-xs font-bold text-chmsu-forest">
                                {d.tracking_code}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-900">
                                  {d.title}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {d.document_type}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-700">
                                {d.current_office}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${overdue
                                      ? "border-red-300 bg-red-100 text-red-900"
                                      : statusMeta.badgeClass
                                    }`}
                                >
                                  {overdue ? "Delayed" : statusMeta.label}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right text-xs text-slate-500 tabular-nums">
                                {formatDateTime(d.due_at)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: MY PROFILE */}
          {activeTab === "profile" && (
            <UserProfileView profile={profile} campus={campus} />
          )}
        </main>
      </div>

      {/* Shared View ID & Details Review Modal (Campus Scoped) */}
      {reviewUser && (
        <RegistrationReviewModal
          user={reviewUser}
          campusName={campus.name}
          headerLabel={`${campusAdminTitle} • Registration Verification`}
          onClose={() => setReviewUser(null)}
          onCompleted={handleReviewCompleted}
        />
      )}

      {/* Read-Only User Details Modal (Activation Toggle Only) */}
      {selectedUser && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-xl">
            <div className="flex items-center justify-between bg-chmsu-forest px-5 py-4 text-white">
              <div>
                <h3 className="text-base font-bold">User Details</h3>
                <p className="text-xs text-chmsu-gold">
                  {selectedUser.full_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="rounded-lg p-1 text-white/80 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="divide-y divide-chmsu-border rounded-xl border border-chmsu-border bg-chmsu-canvas text-sm">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    Full Name
                  </span>
                  <span className="text-right font-semibold text-slate-900">
                    {selectedUser.full_name}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    Email
                  </span>
                  <span className="truncate text-right text-xs font-medium text-slate-800">
                    {selectedUser.email}
                  </span>
                </div>

                {selectedUser.employee_or_student_id && (
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-xs font-semibold text-slate-500">
                      School ID
                    </span>
                    <span className="rounded border border-chmsu-border bg-white px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-chmsu-forest">
                      {selectedUser.employee_or_student_id}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    Role
                  </span>
                  <span className="rounded-full bg-chmsu-navy/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-navy">
                    {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    Campus
                  </span>
                  <span className="text-right text-xs font-semibold text-slate-800">
                    CHMSU {campus.name}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    College / Department
                  </span>
                  <span className="text-right text-xs font-medium text-slate-800">
                    {selectedUser.department || "—"}
                  </span>
                </div>

                {selectedUser.role === ROLES.STUDENT ||
                  selectedUser.program_or_course ? (
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-xs font-semibold text-slate-500">
                      Program
                    </span>
                    <span className="text-right text-xs font-medium text-slate-800">
                      {selectedUser.program_or_course || "—"}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-xs font-semibold text-slate-500">
                      Office
                    </span>
                    <span className="text-right text-xs font-medium text-slate-800">
                      {selectedUser.office_location || "—"}
                    </span>
                  </div>
                )}

                {selectedUser.role !== ROLES.STUDENT && (
                  <>
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-xs font-semibold text-slate-500">
                        Job Title
                      </span>
                      <span className="text-right text-xs font-medium text-slate-800">
                        {selectedUser.job_title || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="text-xs font-semibold text-slate-500">
                        Teaches Classes
                      </span>
                      <span className="text-right text-xs font-semibold text-slate-800">
                        {selectedUser.is_teaching ? "Yes" : "No"}
                      </span>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    Status
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${selectedUser.is_active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-800"
                      }`}
                  >
                    {selectedUser.is_active ? "Active" : "Deactivated"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="rounded-xl border border-chmsu-border px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>

                {selectedUser.id === profile.id ? (
                  <p className="text-xs font-medium text-amber-700">
                    You cannot deactivate your own account.
                  </p>
                ) : [ROLES.SUPERADMIN, ROLES.CAMPUS_ADMIN].includes(
                  selectedUser.role
                ) ? (
                  <p className="text-xs font-medium text-slate-500">
                    Admin accounts cannot be deactivated here.
                  </p>
                ) : selectedUser.is_active ? (
                  <button
                    type="button"
                    disabled={togglingUserStatus}
                    onClick={handleToggleUserActive}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                  >
                    {togglingUserStatus && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Deactivate Account
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={togglingUserStatus}
                    onClick={handleToggleUserActive}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-forest px-4 py-2 text-xs font-bold text-white transition hover:bg-chmsu-green disabled:opacity-60"
                  >
                    {togglingUserStatus && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Reactivate Account
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
