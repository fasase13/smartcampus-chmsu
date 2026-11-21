"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Edit3,
  Eye,
  Globe,
  Loader2,
  LogOut,
  Megaphone,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  Wrench,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ALL_ROLES,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_PRIORITIES,
  ROLE_LABELS,
  ROLES,
  STORAGE_BUCKETS,
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
  campus_id: "university",
  title: "",
  body: "",
  category: "general",
  priority: "normal",
  is_public: true,
  is_pinned: false,
};

export default function SuperadminPortalClient({
  profile,
  campuses,
  initialUsers,
  initialAnnouncements,
  initialDocuments,
  initialAuditLogs,
  initialSettings,
}) {
  const router = useRouter();

  const campusMap = useMemo(
    () => Object.fromEntries(campuses.map((c) => [c.id, c])),
    [campuses]
  );

  const [activeTab, setActiveTab] = useState("overview");
  const [signingOut, setSigningOut] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [users, setUsers] = useState(initialUsers);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [documents] = useState(initialDocuments);
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs);
  const [settings, setSettings] = useState(initialSettings);

  // Announcements editor state
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [announcementCampusFilter, setAnnouncementCampusFilter] = useState("all");

  // Pending registrations filter & ID modal
  const [regCampusFilter, setRegCampusFilter] = useState("all");
  const [reviewUser, setReviewUser] = useState(null);
  const [reviewRole, setReviewRole] = useState("student");
  const [reviewCampusId, setReviewCampusId] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [loadingIdPhotos, setLoadingIdPhotos] = useState(false);
  const [idPhotoUrls, setIdPhotoUrls] = useState({ front: "", back: "" });
  const [idPhotoError, setIdPhotoError] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [zoomedPhoto, setZoomedPhoto] = useState(null);

  // Maintenance mode state
  const [maintMessageDraft, setMaintMessageDraft] = useState(
    initialSettings?.maintenance_message ??
      "SmartCampus CHMSU is currently undergoing scheduled system maintenance. Please check back shortly."
  );
  const [confirmEnableMaint, setConfirmEnableMaint] = useState(false);
  const [savingMaint, setSavingMaint] = useState(false);

  // Audit logs filter
  const [auditQuery, setAuditQuery] = useState("");
  const [auditCampusFilter, setAuditCampusFilter] = useState("all");
  const [expandedAuditId, setExpandedAuditId] = useState(null);

  const refreshUsers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, campus_id, email, full_name, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, department, job_title, office_location, show_on_kiosk, is_active, created_at"
      )
      .order("created_at", { ascending: false });
    if (data) setUsers(data);
  }, []);

  const refreshAnnouncements = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("announcements")
      .select(
        "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, event_start_at, event_end_at, published_at, expires_at, is_active, created_at"
      )
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setAnnouncements(data);
  }, []);

  const refreshAuditLogs = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("audit_logs")
      .select(
        "id, campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at, actor:actor_id(full_name, email)"
      )
      .order("created_at", { ascending: false })
      .limit(400);
    if (data) setAuditLogs(data);
  }, []);

  const refreshSettings = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("system_settings")
      .select("id, maintenance_mode, maintenance_message, maintenance_updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (data) {
      setSettings(data);
      setMaintMessageDraft(data.maintenance_message);
    }
  }, []);

  // Background Realtime sync
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`superadmin-realtime-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => refreshUsers()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => refreshAnnouncements()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_settings" },
        () => refreshSettings()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile.id, refreshAnnouncements, refreshSettings, refreshUsers]);

  const pendingRegistrations = useMemo(() => {
    return users.filter(
      (u) => u.approval_status === "pending" && u.profile_completed === true
    );
  }, [users]);

  const filteredPending = useMemo(() => {
    if (regCampusFilter === "all") return pendingRegistrations;
    return pendingRegistrations.filter((u) => u.campus_id === regCampusFilter);
  }, [pendingRegistrations, regCampusFilter]);

  const campusOverview = useMemo(() => {
    return campuses.map((c) => {
      const campusUsers = users.filter((u) => u.campus_id === c.id);
      const campusAdmin = campusUsers.find(
        (u) => u.role === ROLES.CAMPUS_ADMIN && u.is_active
      );
      const activeCount = campusUsers.filter(
        (u) => u.is_active && u.approval_status === "approved"
      ).length;
      const pendingCount = campusUsers.filter(
        (u) => u.approval_status === "pending" && u.profile_completed === true
      ).length;
      const campusDocs = documents.filter(
        (d) => d.current_campus_id === c.id || d.origin_campus_id === c.id
      );
      const overdueDocs = campusDocs.filter(isDocOverdue).length;

      return {
        campus: c,
        adminTitle: getCampusAdminTitle(c.slug, c.name),
        campusAdmin,
        activeCount,
        pendingCount,
        docCount: campusDocs.length,
        overdueDocs,
      };
    });
  }, [campuses, documents, users]);

  const filteredAnnouncements = useMemo(() => {
    if (announcementCampusFilter === "all") return announcements;
    if (announcementCampusFilter === "university") {
      return announcements.filter((a) => a.campus_id === null);
    }
    return announcements.filter((a) => a.campus_id === announcementCampusFilter);
  }, [announcementCampusFilter, announcements]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditQuery.trim().toLowerCase();
    return auditLogs.filter((log) => {
      if (auditCampusFilter !== "all" && log.campus_id !== auditCampusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        log.action?.toLowerCase().includes(q) ||
        log.actor?.full_name?.toLowerCase().includes(q) ||
        log.actor?.email?.toLowerCase().includes(q) ||
        log.actor_role?.toLowerCase().includes(q) ||
        JSON.stringify(log.metadata ?? {})
          .toLowerCase()
          .includes(q)
      );
    });
  }, [auditCampusFilter, auditLogs, auditQuery]);

  // Announcement CRUD
  async function handleSaveAnnouncement(e) {
    e.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.body.trim()) return;
    setSavingAnnouncement(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      const targetCampusId =
        announcementForm.campus_id === "university"
          ? null
          : announcementForm.campus_id;

      const payload = {
        campus_id: targetCampusId,
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
          .eq("id", announcementForm.id));
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

      await supabase.from("audit_logs").insert({
        campus_id: targetCampusId,
        actor_id: profile.id,
        actor_role: ROLES.SUPERADMIN,
        action: announcementForm.id
          ? "announcement_updated"
          : "announcement_published",
        entity_type: "announcement",
        metadata: {
          title: payload.title,
          scope: targetCampusId
            ? campusMap[targetCampusId]?.name ?? "Campus"
            : "University-Wide",
        },
      });

      setAnnouncementForm(EMPTY_ANNOUNCEMENT);
      await Promise.all([refreshAnnouncements(), refreshAuditLogs()]);
      setFeedback({
        type: "success",
        message: announcementForm.id
          ? "Announcement updated."
          : "Announcement published.",
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
      .eq("id", item.id);
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
      .eq("id", item.id);
    if (error) {
      setFeedback({ type: "error", message: error.message });
      return;
    }
    await refreshAnnouncements();
    setFeedback({ type: "success", message: "Announcement deleted." });
  }

  // Pending Registration ID Verification
  async function openReviewModal(target) {
    setReviewUser(target);
    setReviewRole(target.requested_role || target.role || "student");
    setReviewCampusId(target.campus_id || campuses[0]?.id || "");
    setRejectionReason("");
    setShowRejectBox(false);
    setIdPhotoUrls({ front: "", back: "" });
    setIdPhotoError("");
    setZoomedPhoto(null);

    if (!target.id_front_path && !target.id_back_path) {
      setIdPhotoError("No ID verification photos were attached.");
      return;
    }

    setLoadingIdPhotos(true);
    try {
      const supabase = createClient();
      const [frontRes, backRes] = await Promise.all([
        target.id_front_path
          ? supabase.storage
              .from(STORAGE_BUCKETS.ID_VERIFICATIONS)
              .createSignedUrl(target.id_front_path, 300)
          : Promise.resolve({ data: null, error: null }),
        target.id_back_path
          ? supabase.storage
              .from(STORAGE_BUCKETS.ID_VERIFICATIONS)
              .createSignedUrl(target.id_back_path, 300)
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (frontRes.error || backRes.error) {
        setIdPhotoError(
          frontRes.error?.message ||
            backRes.error?.message ||
            "Unable to load signed ID photos."
        );
      }

      setIdPhotoUrls({
        front: frontRes.data?.signedUrl ?? "",
        back: backRes.data?.signedUrl ?? "",
      });
    } finally {
      setLoadingIdPhotos(false);
    }
  }

  function closeReviewModal() {
    setReviewUser(null);
    setIdPhotoUrls({ front: "", back: "" });
    setIdPhotoError("");
    setShowRejectBox(false);
    setRejectionReason("");
    setZoomedPhoto(null);
  }

  async function handleReviewDecision(decision) {
    if (!reviewUser) return;
    if (decision === "reject" && !rejectionReason.trim()) {
      setFeedback({
        type: "error",
        message: "Please provide a brief reason before rejecting.",
      });
      return;
    }

    setSubmittingReview(true);
    setFeedback(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("review_user_registration", {
        p_user_id: reviewUser.id,
        p_decision: decision,
        p_assigned_role: reviewRole,
        p_campus_id: reviewCampusId || reviewUser.campus_id,
        p_rejection_reason:
          decision === "reject" ? rejectionReason.trim() : null,
      });

      if (error) {
        setFeedback({ type: "error", message: error.message });
        return;
      }

      const name = reviewUser.full_name;
      closeReviewModal();
      await Promise.all([refreshUsers(), refreshAuditLogs()]);
      setFeedback({
        type: decision === "approve" ? "success" : "warning",
        message:
          decision === "approve"
            ? `Approved ${name} as ${ROLE_LABELS[reviewRole] ?? reviewRole}.`
            : `Declined registration for ${name}.`,
      });
    } finally {
      setSubmittingReview(false);
    }
  }

  // Maintenance Mode Toggle
  async function handleSetMaintenance(nextEnabled) {
    setSavingMaint(true);
    setFeedback(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("set_maintenance_mode", {
        p_enabled: nextEnabled,
        p_message: maintMessageDraft.trim() || null,
      });

      if (error) {
        setFeedback({ type: "error", message: error.message });
        return;
      }

      setConfirmEnableMaint(false);
      await Promise.all([refreshSettings(), refreshAuditLogs()]);
      setFeedback({
        type: nextEnabled ? "warning" : "success",
        message: nextEnabled
          ? "System Maintenance Mode is now ENABLED. All non-Superadmin traffic is redirected to /maintenance."
          : "System Maintenance Mode is now DISABLED. All portals and kiosks are back online.",
      });
    } finally {
      setSavingMaint(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/sys-admin");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const navTabs = [
    { id: "overview", label: "Overview & Campus Admins", icon: Building2 },
    { id: "announcements", label: "Announcements", icon: Megaphone },
    {
      id: "registrations",
      label: "Pending Registrations",
      icon: UserCheck,
      badge: pendingRegistrations.length,
    },
    {
      id: "maintenance",
      label: "System Maintenance",
      icon: Wrench,
      alertDot: settings?.maintenance_mode,
    },
    { id: "audit", label: "Audit Logs", icon: Activity },
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900 lg:flex-row">
      {/* Sidebar */}
      <aside className="flex w-full shrink-0 flex-col border-b border-chmsu-navy/20 bg-chmsu-navy text-white lg:w-64 lg:border-b-0 lg:border-r">
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
              SmartCampus CHMSU
            </p>
            <p className="truncate text-[11px] font-semibold text-chmsu-gold">
              Superadmin Console
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
                    ? "bg-white text-chmsu-navy shadow-xs"
                    : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </span>
                {tab.badge > 0 && (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-chmsu-navy tabular-nums">
                    {tab.badge}
                  </span>
                )}
                {tab.alertDot && (
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                )}
              </button>
            );
          })}

          <div className="mt-2 border-t border-white/10 pt-2">
            <Link
              href="/management"
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              <BarChart3 className="h-4 w-4 shrink-0" />
              Analytics &amp; Management
            </Link>
          </div>
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <p className="truncate text-sm font-semibold text-white">
              {profile.full_name}
            </p>
            <p className="truncate text-xs text-white/70">{profile.email}</p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-chmsu-gold px-2.5 py-0.5 text-[11px] font-bold text-chmsu-navy">
              <ShieldCheck className="h-3 w-3" />
              Superadmin
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
        {/* Top Bar */}
        <header className="sticky top-0 z-30 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-chmsu-forest">
                University-Wide Superadmin Control
              </p>
              <p className="text-xs text-slate-500">
                4 CHMSU Campuses &bull; Talisay, Alijis, Binalbagan, Fortune
                Towne
              </p>
            </div>

            {settings?.maintenance_mode && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-800">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                Maintenance Mode Active
              </span>
            )}
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

          {/* TAB 1: OVERVIEW & CAMPUS ADMINS */}
          {activeTab === "overview" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Overview &amp; Campus Admins
                </h1>
                <p className="text-sm text-slate-600">
                  Monitor all 4 CHMSU campuses and their assigned Campus Admin
                  accounts.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {campusOverview.map((item) => (
                  <article
                    key={item.campus.id}
                    className="rounded-2xl border border-chmsu-border bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-chmsu-green">
                          CHMSU {item.campus.name}
                        </p>
                        <h2 className="mt-0.5 text-lg font-bold text-chmsu-forest">
                          {item.adminTitle}
                        </h2>
                      </div>
                      <Link
                        href={`/${item.campus.slug}/admin`}
                        className="rounded-lg border border-chmsu-border bg-chmsu-canvas px-3 py-1.5 text-xs font-semibold text-chmsu-forest transition hover:border-chmsu-green hover:bg-chmsu-green/10"
                      >
                        Open Campus Admin
                      </Link>
                    </div>

                    <div className="mt-4 rounded-xl border border-chmsu-border bg-chmsu-canvas px-3.5 py-2.5 text-xs">
                      {item.campusAdmin ? (
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900">
                              {item.campusAdmin.full_name}
                            </p>
                            <p className="text-slate-500">
                              {item.campusAdmin.email}
                            </p>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                            Assigned
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2 text-amber-800">
                          <span className="font-semibold">
                            No active Campus Admin assigned yet
                          </span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold">
                            Unassigned
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
                      <div className="rounded-xl border border-chmsu-border bg-white p-2.5">
                        <p className="text-lg font-bold text-chmsu-forest tabular-nums">
                          {item.activeCount}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500">
                          Active Users
                        </p>
                      </div>
                      <div className="rounded-xl border border-chmsu-border bg-white p-2.5">
                        <p className="text-lg font-bold text-amber-700 tabular-nums">
                          {item.pendingCount}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500">
                          Pending IDs
                        </p>
                      </div>
                      <div className="rounded-xl border border-chmsu-border bg-white p-2.5">
                        <p
                          className={`text-lg font-bold tabular-nums ${
                            item.overdueDocs > 0
                              ? "text-red-700"
                              : "text-slate-800"
                          }`}
                        >
                          {item.docCount}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500">
                          Documents ({item.overdueDocs} late)
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: ANNOUNCEMENTS (UNIVERSITY-WIDE OR CAMPUS) */}
          {activeTab === "announcements" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  University-Wide &amp; Campus Announcements
                </h1>
                <p className="text-sm text-slate-600">
                  Publish, edit, pin, or delete announcements across all 4
                  campuses.
                </p>
              </div>

              <form
                onSubmit={handleSaveAnnouncement}
                className="space-y-4 rounded-2xl border border-chmsu-border bg-white p-5"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-chmsu-forest">
                    {announcementForm.id
                      ? "Edit Announcement"
                      : "Publish New Announcement"}
                  </h2>
                  {announcementForm.id && (
                    <button
                      type="button"
                      onClick={() => setAnnouncementForm(EMPTY_ANNOUNCEMENT)}
                      className="text-xs font-semibold text-slate-500 hover:text-chmsu-forest"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">
                      Target Scope
                    </label>
                    <select
                      value={announcementForm.campus_id}
                      onChange={(e) =>
                        setAnnouncementForm({
                          ...announcementForm,
                          campus_id: e.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm"
                    >
                      <option value="university">
                        University-Wide (All 4 Campuses)
                      </option>
                      {campuses.map((c) => (
                        <option key={c.id} value={c.id}>
                          CHMSU {c.name} Only
                        </option>
                      ))}
                    </select>
                  </div>

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
                    placeholder="Announcement headline..."
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
                    placeholder="Write the official university or campus notice..."
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
                      Visible on Public Kiosks
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
                    className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-forest px-4 py-2 text-xs font-bold text-white transition hover:bg-chmsu-green disabled:opacity-60"
                  >
                    {savingAnnouncement ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {announcementForm.id
                      ? "Save Announcement"
                      : "Publish Announcement"}
                  </button>
                </div>
              </form>

              {/* Filter + List */}
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-700">
                  Published Announcements ({filteredAnnouncements.length})
                </h2>
                <select
                  value={announcementCampusFilter}
                  onChange={(e) => setAnnouncementCampusFilter(e.target.value)}
                  className="rounded-xl border border-chmsu-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Scopes</option>
                  <option value="university">University-Wide Only</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      CHMSU {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                {filteredAnnouncements.length === 0 ? (
                  <div className="rounded-2xl border border-chmsu-border bg-white p-8 text-center text-sm text-slate-500">
                    No announcements found for this filter.
                  </div>
                ) : (
                  filteredAnnouncements.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-chmsu-border bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                            <span className="inline-flex items-center gap-1 rounded-full bg-chmsu-forest/10 px-2.5 py-0.5 text-chmsu-forest">
                              {item.campus_id ? (
                                <>
                                  <Building2 className="h-3 w-3" />
                                  CHMSU {campusMap[item.campus_id]?.name}
                                </>
                              ) : (
                                <>
                                  <Globe className="h-3 w-3" />
                                  University-Wide
                                </>
                              )}
                            </span>
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
                            title={item.is_pinned ? "Unpin" : "Pin"}
                            className="rounded-lg border border-chmsu-border p-1.5 text-slate-600 hover:border-chmsu-green hover:text-chmsu-forest"
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAnnouncementForm({
                                id: item.id,
                                campus_id: item.campus_id ?? "university",
                                title: item.title,
                                body: item.body,
                                category: item.category,
                                priority: item.priority,
                                is_public: Boolean(item.is_public),
                                is_pinned: Boolean(item.is_pinned),
                              })
                            }
                            title="Edit"
                            className="rounded-lg border border-chmsu-border p-1.5 text-slate-600 hover:border-chmsu-green hover:text-chmsu-forest"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAnnouncement(item)}
                            title="Delete"
                            className="rounded-lg border border-chmsu-border p-1.5 text-red-600 hover:border-red-300 hover:bg-red-50"
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

          {/* TAB 3: PENDING REGISTRATIONS (ALL CAMPUSES) */}
          {activeTab === "registrations" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    Pending Registrations (All Campuses)
                  </h1>
                  <p className="text-sm text-slate-600">
                    Inspect Front &amp; Back CHMSU IDs across all 4 campuses and
                    approve or decline accounts.
                  </p>
                </div>

                <select
                  value={regCampusFilter}
                  onChange={(e) => setRegCampusFilter(e.target.value)}
                  className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">
                    All Campuses ({pendingRegistrations.length})
                  </option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      CHMSU {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                {filteredPending.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                    <CheckCircle2 className="h-9 w-9 text-chmsu-green" />
                    <p className="text-sm font-bold text-chmsu-forest">
                      No pending registrations in this scope
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="px-5 py-3">ID Number</th>
                          <th className="px-4 py-3">Applicant</th>
                          <th className="px-4 py-3">Campus</th>
                          <th className="px-4 py-3">Requested Role</th>
                          <th className="px-4 py-3">Submitted</th>
                          <th className="px-5 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-chmsu-border">
                        {filteredPending.map((u) => (
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
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-xs font-medium text-slate-700">
                              CHMSU{" "}
                              {campusMap[u.campus_id]?.name ?? "Unassigned"}
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
                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => openReviewModal(u)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-forest px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-chmsu-green"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View ID Photos
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

          {/* TAB 4: SYSTEM MAINTENANCE MODE */}
          {activeTab === "maintenance" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  System Maintenance Mode
                </h1>
                <p className="text-sm text-slate-600">
                  Exclusively controlled by the Superadmin. When enabled, all
                  portals, registrations, campus admins, and public kiosks
                  redirect to <code className="font-mono">/maintenance</code>.
                </p>
              </div>

              <div className="rounded-2xl border border-chmsu-border bg-white p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                        settings?.maintenance_mode
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      <Wrench className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Current Status
                      </p>
                      <p
                        className={`text-lg font-bold ${
                          settings?.maintenance_mode
                            ? "text-red-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {settings?.maintenance_mode
                          ? "MAINTENANCE MODE ON"
                          : "SYSTEM ONLINE (NORMAL)"}
                      </p>
                      {settings?.maintenance_updated_at && (
                        <p className="text-xs text-slate-500 tabular-nums">
                          Last updated:{" "}
                          {formatDateTime(settings.maintenance_updated_at)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="maint-message"
                    className="block text-xs font-bold uppercase tracking-wide text-slate-600"
                  >
                    Maintenance Message Displayed to Users
                  </label>
                  <textarea
                    id="maint-message"
                    rows={3}
                    value={maintMessageDraft}
                    onChange={(e) => setMaintMessageDraft(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-chmsu-border bg-chmsu-canvas p-3 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:bg-white"
                  />
                </div>

                {settings?.maintenance_mode ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={savingMaint}
                      onClick={() => handleSetMaintenance(false)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-chmsu-forest px-5 py-2.5 text-sm font-bold text-white transition hover:bg-chmsu-green disabled:opacity-60"
                    >
                      {savingMaint ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Turn Maintenance Mode OFF (Restore System)
                    </button>
                    <button
                      type="button"
                      disabled={savingMaint}
                      onClick={() => handleSetMaintenance(true)}
                      className="rounded-xl border border-chmsu-border bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:border-chmsu-green"
                    >
                      Update Message Only
                    </button>
                  </div>
                ) : !confirmEnableMaint ? (
                  <button
                    type="button"
                    onClick={() => setConfirmEnableMaint(true)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Enable Maintenance Mode...
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                    <div className="flex items-start gap-2.5 text-sm text-red-900">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                      <div>
                        <p className="font-bold">
                          Confirm Enabling System Maintenance Mode
                        </p>
                        <p className="mt-0.5 text-xs">
                          All students, faculty, staff, RMOs, management, Campus
                          Admins, and public kiosks will be immediately
                          redirected to <code className="font-mono">/maintenance</code>.
                          Only your Superadmin session and{" "}
                          <code className="font-mono">/sys-admin</code> will
                          remain accessible.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={savingMaint}
                        onClick={() => handleSetMaintenance(true)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {savingMaint && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        Yes, Enable Maintenance Mode Now
                      </button>
                      <button
                        type="button"
                        disabled={savingMaint}
                        onClick={() => setConfirmEnableMaint(false)}
                        className="rounded-xl border border-chmsu-border bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: GLOBAL AUDIT LOGS */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Global Audit Logs
                </h1>
                <p className="text-sm text-slate-600">
                  Immutable security and activity trail across all 4 CHMSU
                  campuses.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-chmsu-border bg-white p-4 sm:grid-cols-3">
                <div className="relative sm:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={auditQuery}
                    onChange={(e) => setAuditQuery(e.target.value)}
                    placeholder="Filter by action, actor, role, or metadata..."
                    className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2 pl-9 pr-3 text-xs outline-none focus:border-chmsu-green focus:bg-white"
                  />
                </div>
                <select
                  value={auditCampusFilter}
                  onChange={(e) => setAuditCampusFilter(e.target.value)}
                  className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Campuses</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      CHMSU {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white divide-y divide-chmsu-border">
                {filteredAuditLogs.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No audit log entries match your filter.
                  </p>
                ) : (
                  filteredAuditLogs.slice(0, 100).map((log) => {
                    const isExpanded = expandedAuditId === log.id;
                    return (
                      <div key={log.id} className="px-5 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-chmsu-forest">
                              {log.action}
                            </span>
                            {log.actor_role && (
                              <span className="rounded-full bg-chmsu-navy/10 px-2 py-0.5 text-[11px] font-semibold text-chmsu-navy">
                                {ROLE_LABELS[log.actor_role] ?? log.actor_role}
                              </span>
                            )}
                            <span className="text-xs text-slate-600">
                              {log.actor?.full_name || log.actor?.email || "System"}
                            </span>
                            <span className="text-xs text-slate-400">
                              &bull;{" "}
                              {campusMap[log.campus_id]?.name ??
                                "University-Wide"}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 tabular-nums">
                              {formatDateTime(log.created_at)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedAuditId(isExpanded ? null : log.id)
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-chmsu-border px-2 py-1 text-[11px] font-semibold text-slate-600"
                            >
                              JSON
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <pre className="mt-2.5 overflow-x-auto rounded-xl bg-slate-950 p-3 font-mono text-xs text-emerald-300">
                            {JSON.stringify(log.metadata ?? {}, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* View ID Photos Modal */}
      {reviewUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Verify School ID Photos"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-chmsu-forest px-5 py-4 text-white">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-chmsu-gold">
                  School ID Verification &bull; Private Signed URL (5 min)
                </p>
                <h3 className="text-base font-bold">
                  {reviewUser.full_name}{" "}
                  <span className="ml-1.5 rounded bg-white/15 px-2 py-0.5 font-mono text-xs tracking-widest">
                    {reviewUser.employee_or_student_id ?? "No ID"}
                  </span>
                </h3>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {idPhotoError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {idPhotoError}
                </div>
              )}

              {loadingIdPhotos ? (
                <div className="flex h-48 items-center justify-center gap-2 rounded-xl border border-chmsu-border bg-slate-50 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-chmsu-green" />
                  Loading private ID photos...
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    { label: "Front of School ID", url: idPhotoUrls.front },
                    { label: "Back of School ID", url: idPhotoUrls.back },
                  ].map((photo) => (
                    <div
                      key={photo.label}
                      className="overflow-hidden rounded-xl border border-chmsu-border bg-slate-50"
                    >
                      <div className="flex items-center justify-between border-b border-chmsu-border bg-white px-3 py-2 text-xs font-bold text-chmsu-forest">
                        <span>{photo.label}</span>
                        {photo.url && (
                          <button
                            type="button"
                            onClick={() => setZoomedPhoto(photo)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-chmsu-navy"
                          >
                            <ZoomIn className="h-3.5 w-3.5" />
                            Zoom
                          </button>
                        )}
                      </div>
                      {photo.url ? (
                        <button
                          type="button"
                          onClick={() => setZoomedPhoto(photo)}
                          className="block w-full cursor-zoom-in p-2"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.url}
                            alt={photo.label}
                            className="h-56 w-full rounded-lg bg-white object-contain"
                          />
                        </button>
                      ) : (
                        <div className="flex h-56 items-center justify-center text-xs text-slate-400">
                          No image uploaded
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-chmsu-border bg-white p-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    Assigned Campus
                  </label>
                  <select
                    value={reviewCampusId}
                    onChange={(e) => setReviewCampusId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm"
                  >
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        CHMSU {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    Assigned Role
                  </label>
                  <select
                    value={reviewRole}
                    onChange={(e) => setReviewRole(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] ?? r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {showRejectBox && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <label className="block text-xs font-bold uppercase text-red-800">
                    Rejection Reason
                  </label>
                  <textarea
                    rows={2}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explain why this registration is declined..."
                    className="mt-1.5 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-chmsu-border bg-chmsu-canvas px-5 py-3.5">
              {!showRejectBox ? (
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={() => setShowRejectBox(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4" />
                  Reject...
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRejectBox(false)}
                    className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submittingReview}
                    onClick={() => handleReviewDecision("reject")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white"
                  >
                    Confirm Reject
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeReviewModal}
                  className="rounded-xl border border-chmsu-border bg-white px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={() => handleReviewDecision("approve")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-forest px-4 py-2 text-xs font-bold text-white hover:bg-chmsu-green"
                >
                  {submittingReview ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Approve &amp; Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {zoomedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomedPhoto(null)}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950/90 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92dvh] max-w-5xl flex-col items-center gap-3"
          >
            <div className="flex w-full items-center justify-between text-white">
              <span className="text-sm font-bold">{zoomedPhoto.label}</span>
              <button
                type="button"
                onClick={() => setZoomedPhoto(null)}
                className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomedPhoto.url}
              alt={zoomedPhoto.label}
              className="max-h-[82dvh] max-w-full rounded-xl bg-white object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
