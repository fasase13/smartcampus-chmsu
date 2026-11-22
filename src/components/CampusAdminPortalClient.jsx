"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Edit3,
  Eye,
  FileText,
  Loader2,
  LogOut,
  Megaphone,
  Pin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RegistrationReviewModal from "@/components/RegistrationReviewModal";
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

  const [users, setUsers] = useState(initialUsers);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [documents, setDocuments] = useState(initialDocuments);
  const [runningSla, setRunningSla] = useState(false);

  // Pending review modal target
  const [reviewUser, setReviewUser] = useState(null);

  // Campus announcements form
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  // Campus users directory & edit modal
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingUser, setSavingUser] = useState(false);

  const refreshUsers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, campus_id, email, full_name, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, department, program_or_course, job_title, office_location, show_on_kiosk, is_active, created_at"
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
    const { data } = await supabase
      .from("documents")
      .select(
        "id, tracking_code, origin_campus_id, current_campus_id, title, document_type, priority, status, current_office, sla_hours, due_at, is_delayed, created_at, updated_at"
      )
      .or(`origin_campus_id.eq.${campus.id},current_campus_id.eq.${campus.id}`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setDocuments(data);
  }, [campus.id]);

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

  // Edit Campus User
  function openEditUser(target) {
    setEditingUser(target);
    setEditForm({
      role: target.role,
      department: target.department ?? "",
      office_location: target.office_location ?? "",
      show_on_kiosk: Boolean(target.show_on_kiosk),
      is_active: Boolean(target.is_active),
    });
  }

  async function handleSaveUser(e) {
    e.preventDefault();
    if (!editingUser || !editForm) return;
    if (!CAMPUS_ADMIN_ASSIGNABLE_ROLES.includes(editForm.role)) {
      setFeedback({
        type: "error",
        message: "Campus Admins cannot assign superadmin or campus_admin roles.",
      });
      return;
    }

    setSavingUser(true);
    setFeedback(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          role: editForm.role,
          department: editForm.department.trim() || null,
          office_location: editForm.office_location.trim() || null,
          show_on_kiosk: Boolean(editForm.show_on_kiosk),
          is_active: Boolean(editForm.is_active),
        })
        .eq("id", editingUser.id)
        .eq("campus_id", campus.id);

      if (error) {
        setFeedback({ type: "error", message: error.message });
        return;
      }

      setEditingUser(null);
      setEditForm(null);
      await refreshUsers();
      setFeedback({
        type: "success",
        message: `Updated ${editingUser.full_name}.`,
      });
    } finally {
      setSavingUser(false);
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
      {/* Sidebar */}
      <aside className="flex w-full shrink-0 flex-col border-b border-chmsu-forest/15 bg-chmsu-forest text-white lg:w-64 lg:border-b-0 lg:border-r">
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
              {campusAdminTitle}
            </p>
            <p className="truncate text-[11px] font-semibold text-chmsu-gold">
              CHMSU {campus.name}
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 p-3 lg:flex-1 lg:flex-col">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition ${
                  active
                    ? "bg-white text-chmsu-forest shadow-xs"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </span>
                {tab.badge > 0 && (
                  <span className="rounded-full bg-chmsu-gold px-2 py-0.5 text-[11px] font-bold text-chmsu-forest tabular-nums">
                    {tab.badge}
                  </span>
                )}
                {tab.alertCount > 0 && (
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                    {tab.alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <p className="truncate text-sm font-semibold text-white">
              {profile.full_name}
            </p>
            <p className="truncate text-xs text-white/75">{profile.email}</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-chmsu-gold px-2.5 py-0.5 text-[11px] font-bold text-chmsu-forest">
              <ShieldCheck className="h-3 w-3" />
              {campusAdminTitle}
            </span>
          </div>

          <button
            type="button"
            disabled={signingOut}
            onClick={handleSignOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-600/80 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="flex w-full items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-chmsu-forest">
                {campusAdminTitle} Portal
              </p>
              <p className="text-xs text-slate-500">
                CHMSU {campus.name} &bull; Campus Administration
              </p>
            </div>
          </div>
        </header>

        <main className="w-full flex-1 space-y-6 px-4 py-5 sm:px-6">
          {feedback && (
            <div
              role="status"
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                feedback.type === "error"
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
                  Manage active Students, Faculty, Staff, Department Heads, and
                  RMO Staff at CHMSU {campus.name}.
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
                        <th className="px-5 py-3 text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-chmsu-border">
                      {directoryUsers.map((u) => {
                        const isProtectedRole = [
                          ROLES.SUPERADMIN,
                          ROLES.CAMPUS_ADMIN,
                        ].includes(u.role);
                        return (
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
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  u.is_active
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {u.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              {!isProtectedRole ? (
                                <button
                                  type="button"
                                  onClick={() => openEditUser(u)}
                                  className="rounded-lg border border-chmsu-border bg-white px-3 py-1.5 text-xs font-semibold text-chmsu-forest hover:border-chmsu-green"
                                >
                                  Edit
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  Protected
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
                                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                    overdue
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

      {/* Edit Campus User Modal */}
      {editingUser && editForm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-xl">
            <div className="flex items-center justify-between bg-chmsu-forest px-5 py-4 text-white">
              <div>
                <h3 className="text-base font-bold">Edit Campus User</h3>
                <p className="text-xs text-chmsu-gold">{editingUser.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setEditForm(null);
                }}
                className="rounded-lg p-1 text-white/80 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 p-5">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Role
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) =>
                    setEditForm({ ...editForm, role: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm"
                >
                  {CAMPUS_ADMIN_ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    Department
                  </label>
                  <input
                    type="text"
                    value={editForm.department}
                    onChange={(e) =>
                      setEditForm({ ...editForm, department: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-chmsu-border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    Office Location
                  </label>
                  <input
                    type="text"
                    value={editForm.office_location}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        office_location: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-chmsu-border px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-sm font-medium text-slate-700">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editForm.show_on_kiosk}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        show_on_kiosk: e.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-chmsu-green"
                  />
                  Show on Kiosk
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    onChange={(e) =>
                      setEditForm({ ...editForm, is_active: e.target.checked })
                    }
                    className="h-4 w-4 accent-chmsu-green"
                  />
                  Account Active
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setEditForm(null);
                  }}
                  className="rounded-xl border border-chmsu-border px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-forest px-4 py-2 text-xs font-semibold text-white hover:bg-chmsu-green"
                >
                  {savingUser && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
