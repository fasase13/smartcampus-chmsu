"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Globe,
  Loader2,
  Megaphone,
  Pin,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserCheck,
  Users,
  Wrench,
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
  ALL_ROLES,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_PRIORITIES,
  DOCUMENT_STATUS_META,
  ROLE_LABELS,
  ROLES,
  ROUTE_ACTION_LABELS,
  STORAGE_BUCKETS,
  formatSlaDays,
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

function escapeCsvCell(value) {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsvFile(filename, headers, rows) {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  const blob = new Blob([lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
  const { collapsed, mobileOpen, toggleSidebar, closeMobile } =
    usePortalSidebarState();

  const [users, setUsers] = useState(initialUsers);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [documents, setDocuments] = useState(initialDocuments);
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs);
  const [settings, setSettings] = useState(initialSettings);

  // Analytics & Document Alerts state
  const [analyticsCampusId, setAnalyticsCampusId] = useState("all");
  const [docSearch, setDocSearch] = useState("");
  const [docCampusFilter, setDocCampusFilter] = useState("all");
  const [docOverdueOnly, setDocOverdueOnly] = useState(false);
  const [runningSla, setRunningSla] = useState(false);
  const [inspectDoc, setInspectDoc] = useState(null);
  const [inspectRoutes, setInspectRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);

  // Users & Roles state (read-only details + deactivate/reactivate only)
  const [userSearch, setUserSearch] = useState("");
  const [userCampusFilter, setUserCampusFilter] = useState("all");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [togglingUserStatus, setTogglingUserStatus] = useState(false);

  // Announcements editor state
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [announcementCampusFilter, setAnnouncementCampusFilter] =
    useState("all");

  // Pending registrations filter & review modal target
  const [regCampusFilter, setRegCampusFilter] = useState("all");
  const [reviewUser, setReviewUser] = useState(null);

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
        "id, campus_id, email, full_name, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, department, program_or_course, job_title, office_location, is_teaching, show_on_kiosk, is_active, created_at"
      )
      .order("created_at", { ascending: false });
    if (data) setUsers(data);
  }, []);

  const refreshDocuments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("documents")
      .select(
        "id, tracking_code, qr_token, origin_campus_id, current_campus_id, title, description, document_type, priority, status, sender_name, sender_office, current_office, current_holder_id, created_by, file_path, file_name, file_mime_type, file_size_bytes, sla_hours, due_at, is_delayed, delayed_at, completed_at, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data) setDocuments(data);
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
        { event: "*", schema: "public", table: "documents" },
        () => refreshDocuments()
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
  }, [
    profile.id,
    refreshAnnouncements,
    refreshDocuments,
    refreshSettings,
    refreshUsers,
  ]);

  // Derived data
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

  // Analytics & SLA calculations
  const analyticsDocs = useMemo(() => {
    if (analyticsCampusId === "all") return documents;
    return documents.filter(
      (d) =>
        d.current_campus_id === analyticsCampusId ||
        d.origin_campus_id === analyticsCampusId
    );
  }, [analyticsCampusId, documents]);

  const analyticsKpis = useMemo(() => {
    const total = analyticsDocs.length;
    const active = analyticsDocs.filter(
      (d) => d.status !== "completed" && d.status !== "archived"
    );
    const overdue = active.filter(isDocOverdue);
    const interTransit = active.filter(
      (d) => d.origin_campus_id !== d.current_campus_id
    );
    const onTimeCount = analyticsDocs.filter((d) => !isDocOverdue(d)).length;
    const onTimeRate =
      total === 0 ? 100 : Math.round((onTimeCount / total) * 1000) / 10;

    const completed = analyticsDocs.filter((d) => d.completed_at);
    const avgTurnaround =
      completed.length === 0
        ? 0
        : Math.round(
          (completed.reduce((acc, d) => {
            const days =
              (new Date(d.completed_at).getTime() -
                new Date(d.created_at).getTime()) /
              86400000;
            return acc + Math.max(0, days);
          }, 0) /
            completed.length) *
          10
        ) / 10;

    return {
      total,
      activeCount: active.length,
      overdueCount: overdue.length,
      interTransitCount: interTransit.length,
      onTimeRate,
      avgTurnaround,
    };
  }, [analyticsDocs]);

  const analyticsByCampus = useMemo(() => {
    return campuses.map((c) => {
      const docs = analyticsDocs.filter((d) => d.current_campus_id === c.id);
      const delayed = docs.filter(isDocOverdue).length;
      const delayRate =
        docs.length === 0 ? 0 : Math.round((delayed / docs.length) * 100);
      return { campus: c, total: docs.length, delayed, delayRate };
    });
  }, [analyticsDocs, campuses]);

  const maxCampusVolume = useMemo(
    () => Math.max(1, ...analyticsByCampus.map((c) => c.total)),
    [analyticsByCampus]
  );

  const bottleneckOffices = useMemo(() => {
    const map = new Map();
    analyticsDocs.forEach((doc) => {
      const campusName = campusMap[doc.current_campus_id]?.name ?? "CHMSU";
      const key = `${doc.current_office}__${doc.current_campus_id}`;
      const existing = map.get(key) ?? {
        office: doc.current_office,
        campusName,
        total: 0,
        active: 0,
        overdue: 0,
      };
      existing.total += 1;
      if (doc.status !== "completed" && doc.status !== "archived") {
        existing.active += 1;
      }
      if (isDocOverdue(doc)) existing.overdue += 1;
      map.set(key, existing);
    });
    return Array.from(map.values())
      .sort((a, b) => b.overdue - a.overdue || b.active - a.active)
      .slice(0, 8);
  }, [analyticsDocs, campusMap]);

  // Document Alerts tab derived list
  const totalOverdueCount = useMemo(
    () => documents.filter(isDocOverdue).length,
    [documents]
  );

  const filteredDocuments = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    return documents.filter((d) => {
      if (
        docCampusFilter !== "all" &&
        d.current_campus_id !== docCampusFilter &&
        d.origin_campus_id !== docCampusFilter
      ) {
        return false;
      }
      if (docOverdueOnly && !isDocOverdue(d)) return false;
      if (!q) return true;
      return (
        d.tracking_code?.toLowerCase().includes(q) ||
        d.title?.toLowerCase().includes(q) ||
        d.current_office?.toLowerCase().includes(q) ||
        d.document_type?.toLowerCase().includes(q)
      );
    });
  }, [docCampusFilter, docOverdueOnly, docSearch, documents]);

  // Users & Roles derived list
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userCampusFilter !== "all" && u.campus_id !== userCampusFilter) {
        return false;
      }
      if (userRoleFilter !== "all" && u.role !== userRoleFilter) return false;
      if (!q) return true;
      return (
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.employee_or_student_id?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    });
  }, [userCampusFilter, userRoleFilter, userSearch, users]);

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

  // SLA Check & Document Custody Inspector
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
      await Promise.all([refreshDocuments(), refreshAuditLogs()]);
      const flagged = data?.flagged_count ?? 0;
      setFeedback({
        type: flagged > 0 ? "warning" : "success",
        message:
          flagged > 0
            ? `SLA Delay Check flagged ${flagged} newly overdue document${flagged === 1 ? "" : "s"}.`
            : "SLA Delay Check completed — no newly overdue documents.",
      });
    } finally {
      setRunningSla(false);
    }
  }

  async function openInspectModal(doc) {
    setInspectDoc(doc);
    setLoadingRoutes(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("document_routes")
        .select(
          "id, campus_id, from_office, to_office, action, remarks, scanned_via_qr, created_at"
        )
        .eq("document_id", doc.id)
        .order("created_at", { ascending: true });
      setInspectRoutes(data ?? []);
    } finally {
      setLoadingRoutes(false);
    }
  }

  async function handleSignedDownload(doc) {
    if (!doc?.file_path) return;
    setDownloadingFile(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.DOCUMENT_FILES)
        .createSignedUrl(doc.file_path, 300);
      if (error || !data?.signedUrl) {
        setFeedback({
          type: "error",
          message: error?.message || "Unable to generate download link.",
        });
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingFile(false);
    }
  }

  function handleExportAnalyticsCsv() {
    const today = new Date().toISOString().slice(0, 10);
    const headers = [
      "Tracking Code",
      "Title",
      "Type",
      "Status",
      "Origin Campus",
      "Current Campus",
      "Current Office",
      "Overdue",
      "Created At",
    ];
    const rows = analyticsDocs.map((d) => [
      d.tracking_code,
      d.title,
      d.document_type,
      d.status,
      campusMap[d.origin_campus_id]?.name ?? "",
      campusMap[d.current_campus_id]?.name ?? "",
      d.current_office,
      isDocOverdue(d) ? "YES" : "NO",
      d.created_at,
    ]);
    downloadCsvFile(`chmsu-analytics-${today}.csv`, headers, rows);
  }

  // Deactivate / Reactivate User Account ONLY (never mutates role, campus, dept, office, or kiosk)
  async function handleToggleUserActive() {
    if (!selectedUser) return;

    if (selectedUser.id === profile.id) {
      setFeedback({
        type: "error",
        message: "You cannot deactivate your own account.",
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
        .eq("id", selectedUser.id);

      if (error) {
        setFeedback({ type: "error", message: error.message });
        return;
      }

      await supabase.from("audit_logs").insert({
        campus_id: selectedUser.campus_id,
        actor_id: profile.id,
        actor_role: ROLES.SUPERADMIN,
        action: nextActive
          ? "user_account_reactivated"
          : "user_account_deactivated",
        entity_type: "profile",
        entity_id: selectedUser.id,
        metadata: {
          target_name: selectedUser.full_name,
          target_email: selectedUser.email,
          before: { is_active: selectedUser.is_active },
          after: { is_active: nextActive },
        },
      });

      const updatedUser = { ...selectedUser, is_active: nextActive };
      setSelectedUser(updatedUser);
      setUsers((prev) =>
        prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
      );
      await Promise.all([refreshUsers(), refreshAuditLogs()]);
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

  // Callback after RegistrationReviewModal completes activate / return / reject
  async function handleReviewCompleted(decision, target) {
    setReviewUser(null);
    await Promise.all([refreshUsers(), refreshAuditLogs()]);
    setFeedback({
      type: decision === "activate" ? "success" : "warning",
      message:
        decision === "activate"
          ? `Activated account for ${target.full_name}.`
          : decision === "return"
            ? `Returned registration for ${target.full_name} for correction.`
            : `Rejected registration and permanently banned ${target.email}.`,
    });
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
          ? "System Maintenance Mode is now ENABLED. All non-System Admin traffic is redirected to /maintenance."
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
    { id: "analytics", label: "Analytics & SLA", icon: BarChart3 },
    {
      id: "documents",
      label: "Document Alerts",
      icon: ShieldAlert,
      alertBadge: totalOverdueCount,
    },
    { id: "users", label: "Users & Roles", icon: Users },
    {
      id: "registrations",
      label: "Pending Registrations",
      icon: UserCheck,
      badge: pendingRegistrations.length,
    },
    { id: "announcements", label: "Announcements", icon: Megaphone },
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
      <PortalSidebar
        title="SmartCampus CHMSU"
        subtitle="System Admin Console"
        navItems={navTabs}
        activeId={activeTab}
        onSelect={setActiveTab}
        profile={profile}
        roleBadge="System Admin"
        onSignOut={handleSignOut}
        signingOut={signingOut}
        collapsed={collapsed}
        onToggleCollapse={toggleSidebar}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
        ariaLabel="System Admin Navigation"
      />

      {/* Main Content */}
      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-200 ${collapsed ? "lg:pl-20" : "lg:pl-64"
          }`}
      >
        <header className="sticky top-0 z-20 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarToggleButton onClick={toggleSidebar} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-chmsu-forest">
                  University-Wide System Admin Control
                </p>
                <p className="truncate text-xs text-slate-500">
                  4 CHMSU Campuses &bull; Talisay, Alijis, Binalbagan, Fortune
                  Towne
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {settings?.maintenance_mode && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-800">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  Maintenance Mode Active
                </span>
              )}
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
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-chmsu-green">
                        CHMSU {item.campus.name}
                      </p>
                      <h2 className="mt-0.5 text-lg font-bold text-chmsu-forest">
                        {item.adminTitle}
                      </h2>
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
                          className={`text-lg font-bold tabular-nums ${item.overdueDocs > 0
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

          {/* TAB 2: ANALYTICS & SLA */}
          {activeTab === "analytics" && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    Analytics &amp; SLA Performance
                  </h1>
                  <p className="text-sm text-slate-600">
                    Cross-campus KPIs, turnaround metrics, and office bottleneck
                    analysis.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={analyticsCampusId}
                    onChange={(e) => setAnalyticsCampusId(e.target.value)}
                    className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    <option value="all">All 4 Campuses</option>
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        CHMSU {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleExportAnalyticsCsv}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-chmsu-forest bg-white px-3.5 py-2 text-xs font-bold text-chmsu-forest hover:bg-chmsu-green/10"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-chmsu-green" />
                    Export CSV
                  </button>
                </div>
              </div>

              {/* KPI Grid */}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                {[
                  { label: "Total Documents", value: analyticsKpis.total },
                  { label: "Active Routing", value: analyticsKpis.activeCount },
                  {
                    label: "Overdue Alerts",
                    value: analyticsKpis.overdueCount,
                    danger: analyticsKpis.overdueCount > 0,
                  },
                  {
                    label: "On-Time SLA",
                    value: `${analyticsKpis.onTimeRate}%`,
                  },
                  {
                    label: "Avg Turnaround",
                    value: formatSlaDays(analyticsKpis.avgTurnaround),
                  },
                  {
                    label: "Inter-Campus",
                    value: analyticsKpis.interTransitCount,
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-2xl border border-chmsu-border bg-white p-4"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {kpi.label}
                    </p>
                    <p
                      className={`mt-1 text-2xl font-bold tabular-nums ${kpi.danger ? "text-red-600" : "text-chmsu-forest"
                        }`}
                    >
                      {kpi.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Campus Volume + Bottlenecks */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <section className="rounded-2xl border border-chmsu-border bg-white p-5">
                  <h2 className="text-base font-bold text-chmsu-forest">
                    Campus Document Volume &amp; Delay Rate
                  </h2>
                  <div className="mt-4 space-y-3.5">
                    {analyticsByCampus.map((row) => (
                      <div key={row.campus.id} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-800">
                            CHMSU {row.campus.name}
                          </span>
                          <span className="tabular-nums text-slate-600">
                            {row.total} docs ({row.delayed} late &bull;{" "}
                            {row.delayRate}%)
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-chmsu-green"
                            style={{
                              width: `${Math.round(
                                (row.total / maxCampusVolume) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-chmsu-border bg-white p-5">
                  <h2 className="text-base font-bold text-chmsu-forest">
                    Top Bottleneck Offices
                  </h2>
                  {bottleneckOffices.length === 0 ? (
                    <p className="mt-4 text-xs text-slate-500">
                      No document routing data yet.
                    </p>
                  ) : (
                    <div className="mt-3 divide-y divide-chmsu-border text-xs">
                      {bottleneckOffices.map((b) => (
                        <div
                          key={`${b.office}-${b.campusName}`}
                          className="flex items-center justify-between py-2.5"
                        >
                          <div>
                            <p className="font-bold text-slate-900">
                              {b.office}
                            </p>
                            <p className="text-slate-500">
                              CHMSU {b.campusName}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 tabular-nums">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                              {b.active} active
                            </span>
                            {b.overdue > 0 && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-800">
                                {b.overdue} overdue
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* TAB 3: DOCUMENT ALERTS */}
          {activeTab === "documents" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    Document Routing &amp; Red Delay Alerts
                  </h1>
                  <p className="text-sm text-slate-600">
                    Monitor all-campus documents, flag SLA delays, and inspect
                    full custody trails.
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

              <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-chmsu-border bg-white p-4 sm:grid-cols-4">
                <div className="relative sm:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    placeholder="Search tracking code, title, office..."
                    className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2 pl-9 pr-3 text-sm outline-none focus:border-chmsu-green focus:bg-white"
                  />
                </div>
                <select
                  value={docCampusFilter}
                  onChange={(e) => setDocCampusFilter(e.target.value)}
                  className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Campuses</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      CHMSU {c.name}
                    </option>
                  ))}
                </select>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-chmsu-border bg-chmsu-canvas px-3 py-2 text-xs font-bold text-red-800">
                  <input
                    type="checkbox"
                    checked={docOverdueOnly}
                    onChange={(e) => setDocOverdueOnly(e.target.checked)}
                    className="h-4 w-4 accent-red-600"
                  />
                  Overdue Only ({totalOverdueCount})
                </label>
              </div>

              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                {filteredDocuments.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No documents match your filters.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="px-5 py-3">Tracking Code</th>
                          <th className="px-4 py-3">Title &amp; Office</th>
                          <th className="px-4 py-3">Campus</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-5 py-3 text-left">Trail</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-chmsu-border">
                        {filteredDocuments.slice(0, 100).map((d) => {
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
                                  {d.current_office} &bull; {d.document_type}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-700">
                                {campusMap[d.current_campus_id]?.name ?? "—"}
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
                              <td className="px-5 py-3 text-left">
                                <button
                                  type="button"
                                  onClick={() => openInspectModal(d)}
                                  className="whitespace-nowrap rounded-lg border border-chmsu-border bg-white px-3 py-1.5 text-xs font-semibold text-chmsu-forest hover:border-chmsu-green"
                                >
                                  Inspect Trail
                                </button>
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

          {/* TAB 4: USERS & ROLES */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Users &amp; Roles Management
                </h1>
                <p className="text-sm text-slate-600">
                  View user details and manage account activation status across
                  all 4 CHMSU campuses.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-chmsu-border bg-white p-4 sm:grid-cols-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name, ID, email, dept..."
                    className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2 pl-9 pr-3 text-sm outline-none focus:border-chmsu-green focus:bg-white"
                  />
                </div>
                <select
                  value={userCampusFilter}
                  onChange={(e) => setUserCampusFilter(e.target.value)}
                  className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Campuses</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      CHMSU {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Roles</option>
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-5 py-3">User</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Assigned Campus</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-5 py-3 text-left">Manage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-chmsu-border">
                      {filteredUsers.map((u) => (
                        <tr
                          key={u.id}
                          className={!u.is_active ? "bg-slate-50 opacity-65" : ""}
                        >
                          <td className="px-5 py-3">
                            <p className="font-semibold text-slate-900">
                              {u.full_name}{" "}
                              {u.id === profile.id && (
                                <span className="rounded bg-chmsu-gold/40 px-1.5 py-0.5 text-[10px] font-bold text-chmsu-forest">
                                  You
                                </span>
                              )}
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
                          <td className="px-4 py-3 text-xs font-medium text-slate-700">
                            {campusMap[u.campus_id]?.name ?? "Unassigned"}
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
                              className="whitespace-nowrap rounded-lg border border-chmsu-border bg-white px-3 py-1.5 text-xs font-semibold text-chmsu-forest hover:border-chmsu-green"
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

          {/* TAB 5: PENDING REGISTRATIONS (ALL CAMPUSES) */}
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
                          <th className="px-5 py-3">School ID</th>
                          <th className="px-4 py-3">Applicant</th>
                          <th className="px-4 py-3">Campus</th>
                          <th className="px-4 py-3">Requested Role</th>
                          <th className="px-4 py-3">Submitted</th>
                          <th className="px-5 py-3 text-left">Action</th>
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
                                {u.program_or_course
                                  ? ` • ${u.program_or_course}`
                                  : u.office_location
                                    ? ` • ${u.office_location}`
                                    : ""}
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
                            <td className="px-5 py-3.5 text-left">
                              <button
                                type="button"
                                onClick={() => setReviewUser(u)}
                                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-chmsu-forest px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-chmsu-green"
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

          {/* TAB 6: ANNOUNCEMENTS */}
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
                            className="rounded-lg border border-chmsu-border p-1.5 text-slate-600 hover:border-chmsu-green"
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

          {/* TAB 7: SYSTEM MAINTENANCE MODE */}
          {activeTab === "maintenance" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  System Maintenance Mode
                </h1>
                <p className="text-sm text-slate-600">
                  Exclusively controlled by the System Admin. When enabled, all
                  portals, registrations, campus admins, and public kiosks
                  redirect to <code className="font-mono">/maintenance</code>.
                </p>
              </div>

              <div className="rounded-2xl border border-chmsu-border bg-white p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${settings?.maintenance_mode
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
                        className={`text-lg font-bold ${settings?.maintenance_mode
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
                          Admins, and public kiosks will be redirected to{" "}
                          <code className="font-mono">/maintenance</code>. Only
                          your System Admin session and{" "}
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

          {/* TAB 8: GLOBAL AUDIT LOGS */}
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
                              {log.actor?.full_name ||
                                log.actor?.email ||
                                "System"}
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

          {/* TAB 9: MY PROFILE */}
          {activeTab === "profile" && <UserProfileView profile={profile} />}
        </main>
      </div>

      {/* Custody Trail Drawer */}
      {inspectDoc && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
        >
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-chmsu-forest px-5 py-4 text-white">
              <div>
                <p className="font-mono text-xs font-bold text-chmsu-gold">
                  {inspectDoc.tracking_code}
                </p>
                <h3 className="text-base font-bold">{inspectDoc.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {inspectDoc.file_path && (
                <div className="flex items-center justify-between rounded-xl border border-chmsu-border bg-chmsu-canvas p-3">
                  <span className="truncate text-xs font-semibold text-slate-800">
                    {inspectDoc.file_name}
                  </span>
                  <button
                    type="button"
                    disabled={downloadingFile}
                    onClick={() => handleSignedDownload(inspectDoc)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-chmsu-navy px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </div>
              )}

              <h4 className="text-sm font-bold text-chmsu-forest">
                Custody Timeline
              </h4>
              {loadingRoutes ? (
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading custody trail...
                </p>
              ) : (
                <ol className="space-y-4 border-l-2 border-chmsu-border pl-4">
                  {inspectRoutes.map((step) => (
                    <li key={step.id} className="relative text-sm">
                      <span className="absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-chmsu-forest" />
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">
                          {ROUTE_ACTION_LABELS[step.action] ?? step.action}
                        </span>
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          {formatDateTime(step.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700">
                        {step.from_office ? `${step.from_office} → ` : ""}
                        <span className="font-semibold text-chmsu-navy">
                          {step.to_office}
                        </span>{" "}
                        ({campusMap[step.campus_id]?.name ?? "CHMSU"})
                      </p>
                      {step.remarks && (
                        <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                          {step.remarks}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Read-Only User Details Modal (Deactivate / Reactivate Only) */}
      {selectedUser && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="User Details"
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
                aria-label="Close user details"
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
                    Assigned Campus
                  </span>
                  <span className="text-right text-xs font-semibold text-slate-800">
                    {campusMap[selectedUser.campus_id]?.name
                      ? `CHMSU ${campusMap[selectedUser.campus_id].name}`
                      : "Unassigned"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    Department
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
                    Account Status
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

      {/* Shared View ID & Details Review Modal */}
      {reviewUser && (
        <RegistrationReviewModal
          user={reviewUser}
          campusName={campusMap[reviewUser.campus_id]?.name ?? ""}
          headerLabel="System Admin • Registration Verification"
          onClose={() => setReviewUser(null)}
          onCompleted={handleReviewCompleted}
        />
      )}
    </div>
  );
}
