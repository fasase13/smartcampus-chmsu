"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  Eye,
  Globe,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Pin,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserX,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RegistrationReviewModal from "@/components/RegistrationReviewModal";
import UserDetailsModal from "@/components/UserDetailsModal";
import LiveNotificationBell from "@/components/LiveNotificationBell";
import HeaderAccountMenu from "@/components/HeaderAccountMenu";
import {
  deleteAnnouncementAttachment,
  uploadAnnouncementAttachment,
} from "@/lib/announcementAttachments";
import AnnouncementAttachmentPicker from "@/components/AnnouncementAttachmentPicker";
import AnnouncementAttachment from "@/components/AnnouncementAttachment";
import {
  formatAuditActionLabel,
  formatAuditDetailSummary,
  getAuditLogCategory,
  isDocumentLog,
} from "@/lib/auditLogFormat";
import UserProfileView from "@/components/UserProfileView";
import PortalSidebar, {
  SidebarToggleButton,
  usePortalSidebarState,
} from "@/components/PortalSidebar";
import {
  ALL_ROLES,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_PRIORITIES,
  ROLE_LABELS,
  ROLES,
  getUserAccountStatus,
  normalizeAnnouncementCategory,
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

const CAMPUS_DONUT_COLORS = {
  talisay: "#143D29",
  alijis: "#2563EB",
  binalbagan: "#F59E0B",
  "fortune-towne": "#EF4444",
  fortunetowne: "#EF4444",
};

const CAMPUS_DONUT_FALLBACK_COLORS = [
  "#143D29",
  "#2563EB",
  "#F59E0B",
  "#EF4444",
];

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeDonutArc(cx, cy, outerRadius, innerRadius, startAngle, endAngle) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, endAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, startAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? "1" : "0";

  return [
    "M",
    outerStart.x.toFixed(3),
    outerStart.y.toFixed(3),
    "A",
    outerRadius,
    outerRadius,
    0,
    largeArcFlag,
    0,
    outerEnd.x.toFixed(3),
    outerEnd.y.toFixed(3),
    "L",
    innerEnd.x.toFixed(3),
    innerEnd.y.toFixed(3),
    "A",
    innerRadius,
    innerRadius,
    0,
    largeArcFlag,
    1,
    innerStart.x.toFixed(3),
    innerStart.y.toFixed(3),
    "Z",
  ].join(" ");
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
  initialTab = "dashboard",
  campuses,
  initialUsers,
  initialAnnouncements,
  initialAuditLogs,
  initialDocumentRoutes = [],
  initialSettings,
}) {
  const router = useRouter();

  const campusMap = useMemo(
    () => Object.fromEntries(campuses.map((c) => [c.id, c])),
    [campuses]
  );

  const normalizedInitialTab =
    initialTab === "overview" ||
      initialTab === "analytics" ||
      initialTab === "alerts" ||
      initialTab === "documents"
      ? "dashboard"
      : initialTab || "dashboard";
  const [activeTab, setActiveTab] = useState(normalizedInitialTab);
  const [signingOut, setSigningOut] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { collapsed, mobileOpen, toggleSidebar, closeMobile } =
    usePortalSidebarState();

  const [users, setUsers] = useState(initialUsers);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs);
  const [documentRoutes, setDocumentRoutes] = useState(initialDocumentRoutes);
  const [settings, setSettings] = useState(initialSettings);

  // Dashboard campus filter & donut hover state
  const [analyticsCampusId, setAnalyticsCampusId] = useState("all");
  const [hoveredCampusId, setHoveredCampusId] = useState(null);

  // Platform Users state (read-only details + deactivate/reactivate only)
  const [userSearch, setUserSearch] = useState("");
  const [userCampusFilter, setUserCampusFilter] = useState("all");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all"); // all | active | inactive
  const [selectedUser, setSelectedUser] = useState(null);
  const [togglingUserStatus, setTogglingUserStatus] = useState(false);

  // Announcements editor state
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT);
  const [announcementAttachmentFile, setAnnouncementAttachmentFile] =
    useState(null);
  const [existingAnnouncementAttachment, setExistingAnnouncementAttachment] =
    useState(null);
  const [removedAnnouncementAttachmentPath, setRemovedAnnouncementAttachmentPath] =
    useState(null);
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

  // System & Document Logs filter
  const [auditSubTab, setAuditSubTab] = useState("system"); // system | document
  const [auditQuery, setAuditQuery] = useState("");
  const [auditCampusFilter, setAuditCampusFilter] = useState("all");

  const refreshUsers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, campus_id, email, full_name, avatar_url, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, department, program_or_course, job_title, office_location, is_teaching, show_on_kiosk, is_active, created_at"
      )
      .order("created_at", { ascending: false });
    if (data) setUsers(data);
  }, []);

  const refreshAnnouncements = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("announcements")
      .select(
        "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, event_start_at, event_end_at, published_at, expires_at, is_active, created_at, attachment_url, attachment_path, attachment_name, attachment_type, attachment_size"
      )
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);
    if (data) setAnnouncements(data);
  }, []);

  const refreshAuditLogs = useCallback(async () => {
    const supabase = createClient();
    const [auditRes, routesRes] = await Promise.all([
      supabase
        .from("audit_logs")
        .select(
          "id, campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at, actor:actor_id(full_name, email)"
        )
        .order("created_at", { ascending: false })
        .limit(400),
      supabase
        .from("document_routes")
        .select(
          "id, document_id, campus_id, from_office, to_office, action, remarks, acted_by, created_at, actor:acted_by(full_name, email, role), document:document_id(tracking_code, title, origin_campus_id)"
        )
        .order("created_at", { ascending: false })
        .limit(300),
    ]);
    if (auditRes.data) setAuditLogs(auditRes.data);
    if (routesRes.data) setDocumentRoutes(routesRes.data);
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
  }, [
    profile.id,
    refreshAnnouncements,
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
    return campuses.map((c, idx) => {
      const campusUsers = users.filter((u) => u.campus_id === c.id);
      const activeCount = campusUsers.filter(
        (u) => u.is_active && u.approval_status === "approved"
      ).length;
      const pendingCount = campusUsers.filter(
        (u) => u.approval_status === "pending" && u.profile_completed === true
      ).length;
      const inactiveCount = campusUsers.filter(
        (u) => getUserAccountStatus(u).key === "deactivated"
      ).length;
      const announcementCount = announcements.filter(
        (a) =>
          a.is_active !== false && (a.campus_id === c.id || a.campus_id === null)
      ).length;
      const slugKey = String(c.slug ?? "").toLowerCase();
      const accentColor =
        CAMPUS_DONUT_COLORS[slugKey] ??
        CAMPUS_DONUT_FALLBACK_COLORS[idx % CAMPUS_DONUT_FALLBACK_COLORS.length];
      const displayName =
        c.is_main && !String(c.name ?? "").toLowerCase().includes("main")
          ? `CHMSU ${c.name} (Main)`
          : `CHMSU ${c.name}`;

      return {
        campus: c,
        displayName,
        accentColor,
        totalUsers: campusUsers.length,
        activeCount,
        pendingCount,
        inactiveCount,
        announcementCount,
      };
    });
  }, [announcements, campuses, users]);

  // System Health & User Dashboard calculations (filtered by selected campus)
  const scopedDashboardUsers = useMemo(() => {
    if (analyticsCampusId === "all") return users;
    return users.filter((u) => u.campus_id === analyticsCampusId);
  }, [analyticsCampusId, users]);

  const scopedDashboardAnnouncements = useMemo(() => {
    const activeOnly = announcements.filter((a) => a.is_active !== false);
    if (analyticsCampusId === "all") return activeOnly;
    return activeOnly.filter(
      (a) => a.campus_id === analyticsCampusId || a.campus_id === null
    );
  }, [analyticsCampusId, announcements]);

  const systemKpis = useMemo(() => {
    const totalUsers = scopedDashboardUsers.length;
    const activeAccounts = scopedDashboardUsers.filter(
      (u) => u.is_active && u.approval_status === "approved"
    ).length;
    const pendingCount = scopedDashboardUsers.filter(
      (u) => u.approval_status === "pending" && u.profile_completed === true
    ).length;
    const inactiveAccounts = scopedDashboardUsers.filter(
      (u) => getUserAccountStatus(u).key === "deactivated"
    ).length;
    const activeAnnouncements = scopedDashboardAnnouncements.length;

    return {
      totalUsers,
      activeAccounts,
      pendingCount,
      inactiveAccounts,
      activeAnnouncements,
    };
  }, [scopedDashboardAnnouncements, scopedDashboardUsers]);

  const campusDonutData = useMemo(() => {
    const total = campusOverview.reduce((sum, row) => sum + row.totalUsers, 0);
    const segments = [];
    let cumulativeAngle = 0;

    for (let idx = 0; idx < campusOverview.length; idx += 1) {
      const row = campusOverview[idx];
      const slugKey = String(row.campus.slug ?? "").toLowerCase();
      const color =
        CAMPUS_DONUT_COLORS[slugKey] ??
        CAMPUS_DONUT_FALLBACK_COLORS[idx % CAMPUS_DONUT_FALLBACK_COLORS.length];
      const label =
        row.campus.is_main &&
          !String(row.campus.name ?? "").toLowerCase().includes("main")
          ? `${row.campus.name} (Main)`
          : row.campus.name;
      const pct = total > 0 ? Math.round((row.totalUsers / total) * 100) : 0;
      const sweepAngle = total > 0 ? (row.totalUsers / total) * 360 : 0;
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + sweepAngle;
      cumulativeAngle = endAngle;

      segments.push({
        campusId: row.campus.id,
        label,
        color,
        totalUsers: row.totalUsers,
        activeCount: row.activeCount,
        pendingCount: row.pendingCount,
        pct,
        startAngle,
        endAngle,
        sweepAngle,
      });
    }

    const nonZeroCount = segments.filter((s) => s.totalUsers > 0).length;
    return { total, segments, nonZeroCount };
  }, [campusOverview]);

  const activeDonutCampusId =
    hoveredCampusId ?? (analyticsCampusId !== "all" ? analyticsCampusId : null);

  const activeDonutSegment = useMemo(
    () =>
      activeDonutCampusId
        ? campusDonutData.segments.find(
          (seg) => seg.campusId === activeDonutCampusId
        ) ?? null
        : null,
    [activeDonutCampusId, campusDonutData.segments]
  );

  const visibleCampusOverview = useMemo(
    () =>
      analyticsCampusId === "all"
        ? campusOverview
        : campusOverview.filter((item) => item.campus.id === analyticsCampusId),
    [analyticsCampusId, campusOverview]
  );

  const accountsByRole = useMemo(() => {
    const roleSpecs = [
      { role: ROLES.STUDENT, label: "Students" },
      { role: ROLES.FACULTY, label: "Faculty" },
      { role: ROLES.STAFF, label: "Staff" },
      { role: ROLES.RMO, label: "Records Management Officers (RMO)" },
      { role: ROLES.MANAGEMENT, label: "Institutional Management" },
      { role: ROLES.CAMPUS_ADMIN, label: "Campus Admins" },
    ];
    return roleSpecs.map((spec) => ({
      ...spec,
      count: scopedDashboardUsers.filter((u) => u.role === spec.role).length,
    }));
  }, [scopedDashboardUsers]);

  // Platform Users derived list
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userCampusFilter !== "all" && u.campus_id !== userCampusFilter) {
        return false;
      }
      if (userRoleFilter !== "all" && u.role !== userRoleFilter) return false;
      const statusKey = getUserAccountStatus(u).key;
      if (userStatusFilter === "active" && statusKey !== "active") {
        return false;
      }
      if (userStatusFilter === "pending" && statusKey !== "pending") {
        return false;
      }
      if (userStatusFilter === "inactive" && statusKey !== "deactivated") {
        return false;
      }
      if (!q) return true;
      return (
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.employee_or_student_id?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    });
  }, [userCampusFilter, userRoleFilter, userSearch, userStatusFilter, users]);

  const filteredAnnouncements = useMemo(() => {
    if (announcementCampusFilter === "all") return announcements;
    if (announcementCampusFilter === "university") {
      return announcements.filter((a) => a.campus_id === null);
    }
    return announcements.filter((a) => a.campus_id === announcementCampusFilter);
  }, [announcementCampusFilter, announcements]);

  const allSystemLogs = useMemo(
    () => auditLogs.filter((log) => !isDocumentLog(log)),
    [auditLogs]
  );

  const allDocumentLogs = useMemo(() => {
    const docAuditEntries = auditLogs.filter((log) => isDocumentLog(log));
    const normalizedRouteEntries = documentRoutes
      .map((route) => ({
        id: `route-${route.id}`,
        _source: "document_route",
        campus_id: route.campus_id || route.document?.origin_campus_id || null,
        actor_id: route.acted_by,
        actor_role: route.actor?.role ?? null,
        action: `document.${route.action}`,
        entity_type: "document_route",
        entity_id: route.document_id,
        created_at: route.created_at,
        actor: route.actor ?? null,
        metadata: {
          tracking_code: route.document?.tracking_code ?? null,
          title: route.document?.title ?? null,
          from_office: route.from_office ?? null,
          to_office: route.to_office ?? null,
          remarks: route.remarks ?? null,
        },
      }))
      .filter((routeEntry) => {
        const routeTime = new Date(routeEntry.created_at).getTime();
        const routeActionLabel = formatAuditActionLabel(routeEntry.action);
        return !docAuditEntries.some((auditEntry) => {
          if (auditEntry.entity_id !== routeEntry.entity_id) return false;
          if (formatAuditActionLabel(auditEntry.action) !== routeActionLabel) {
            return false;
          }
          const diffMs = Math.abs(
            new Date(auditEntry.created_at).getTime() - routeTime
          );
          return diffMs <= 10000;
        });
      });

    return [...docAuditEntries, ...normalizedRouteEntries].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [auditLogs, documentRoutes]);

  const systemAuditCount = useMemo(
    () =>
      allSystemLogs.filter(
        (log) =>
          auditCampusFilter === "all" || log.campus_id === auditCampusFilter
      ).length,
    [allSystemLogs, auditCampusFilter]
  );

  const documentAuditCount = useMemo(
    () =>
      allDocumentLogs.filter(
        (log) =>
          auditCampusFilter === "all" || log.campus_id === auditCampusFilter
      ).length,
    [allDocumentLogs, auditCampusFilter]
  );

  const filteredAuditLogs = useMemo(() => {
    const q = auditQuery.trim().toLowerCase();
    const sourceLogs =
      auditSubTab === "document" ? allDocumentLogs : allSystemLogs;
    return sourceLogs.filter((log) => {
      if (auditCampusFilter !== "all" && log.campus_id !== auditCampusFilter) {
        return false;
      }
      if (!q) return true;
      const categoryLabel = getAuditLogCategory(log).label.toLowerCase();
      const actionLabel = formatAuditActionLabel(log.action).toLowerCase();
      const detailSummary = formatAuditDetailSummary(log, {
        roleLabels: ROLE_LABELS,
        campusMap,
      }).toLowerCase();
      const actorEmail = String(
        log.actor?.email || log.metadata?.email || ""
      ).toLowerCase();
      const actorName = String(
        log.actor?.full_name || log.metadata?.full_name || ""
      ).toLowerCase();
      const trackingCode = String(
        log.metadata?.tracking_code || ""
      ).toLowerCase();
      const roleLabel = (
        ROLE_LABELS[log.actor_role] ??
        log.actor_role ??
        ""
      ).toLowerCase();
      const campusLabel = (
        campusMap[log.campus_id]?.name ?? "University-Wide"
      ).toLowerCase();
      return (
        log.action?.toLowerCase().includes(q) ||
        actionLabel.includes(q) ||
        categoryLabel.includes(q) ||
        detailSummary.includes(q) ||
        trackingCode.includes(q) ||
        roleLabel.includes(q) ||
        campusLabel.includes(q) ||
        actorName.includes(q) ||
        actorEmail.includes(q) ||
        log.actor_role?.toLowerCase().includes(q)
      );
    });
  }, [
    allDocumentLogs,
    allSystemLogs,
    auditCampusFilter,
    auditQuery,
    auditSubTab,
    campusMap,
  ]);

  // Dashboard interactive navigation helpers
  function toggleDashboardCampusFilter(campusId) {
    setAnalyticsCampusId((prev) => (prev === campusId ? "all" : campusId));
  }

  function openUsersFiltered({
    campusId = "all",
    role = "all",
    status = "all",
  } = {}) {
    setUserSearch("");
    setUserCampusFilter(campusId);
    setUserRoleFilter(role);
    setUserStatusFilter(status);
    setActiveTab("users");
  }

  function openRegistrationsFiltered(campusId = "all") {
    setRegCampusFilter(campusId);
    setActiveTab("registrations");
  }

  function openAnnouncementsFiltered(campusId = "all") {
    setAnnouncementCampusFilter(campusId);
    setActiveTab("announcements");
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

  function resetAnnouncementComposer() {
    setAnnouncementForm(EMPTY_ANNOUNCEMENT);
    setAnnouncementAttachmentFile(null);
    setExistingAnnouncementAttachment(null);
    setRemovedAnnouncementAttachmentPath(null);
    setIsComposerOpen(false);
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

      let uploadedAttachment = null;
      if (announcementAttachmentFile) {
        uploadedAttachment = await uploadAnnouncementAttachment(
          supabase,
          profile.id,
          announcementAttachmentFile
        );
        Object.assign(payload, uploadedAttachment);
      } else if (announcementForm.id && !existingAnnouncementAttachment) {
        Object.assign(payload, {
          attachment_url: null,
          attachment_path: null,
          attachment_name: null,
          attachment_type: null,
          attachment_size: null,
        });
      }

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
        if (uploadedAttachment?.attachment_path) {
          await deleteAnnouncementAttachment(
            supabase,
            uploadedAttachment.attachment_path
          );
        }
        setFeedback({ type: "error", message: error.message });
        return;
      }

      if (removedAnnouncementAttachmentPath) {
        await deleteAnnouncementAttachment(
          supabase,
          removedAnnouncementAttachmentPath
        );
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

      const wasEditing = Boolean(announcementForm.id);
      resetAnnouncementComposer();
      await Promise.all([refreshAnnouncements(), refreshAuditLogs()]);
      setFeedback({
        type: "success",
        message: wasEditing
          ? "Announcement updated."
          : "Announcement published.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err?.message || "Failed to publish announcement.",
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
    if (item.attachment_path) {
      await deleteAnnouncementAttachment(supabase, item.attachment_path);
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
      try {
        await supabase.rpc("log_auth_activity", {
          p_event: "sign_out",
          p_portal: "superadmin",
        });
      } catch {
        // Best-effort auth activity logging
      }
      await supabase.auth.signOut();
      router.push("/sys-admin");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const navTabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "users", label: "Platform Users", icon: Users },
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
    { id: "audit", label: "Reports", icon: Activity },
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
                <span className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-800">
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
                  else setActiveTab("audit");
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

          {/* TAB 1: SYSTEM ADMIN DASHBOARD (System Health, Users & Campus Administration) */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Top Header Row */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    Dashboard
                  </h1>
                  <p className="text-sm text-slate-600">
                    University-wide system health, user accounts, campus
                    administration, and platform oversight across all 4 CHMSU
                    campuses.
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <select
                    value={analyticsCampusId}
                    onChange={(e) => setAnalyticsCampusId(e.target.value)}
                    aria-label="Filter dashboard by campus"
                    className="rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-chmsu-green focus:border-chmsu-green focus:outline-none"
                  >
                    <option value="all">All 4 Campuses</option>
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        CHMSU {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Section 1: 5 Interactive System-Focused KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  {
                    label: "Total Users",
                    value: systemKpis.totalUsers,
                    icon: Users,
                    iconWrapClass: "bg-[#143D29]/10 text-[#143D29]",
                    valueClass: "text-chmsu-forest",
                    onClick: () =>
                      openUsersFiltered({
                        campusId: analyticsCampusId,
                        role: "all",
                        status: "all",
                      }),
                  },
                  {
                    label: "Active Accounts",
                    value: systemKpis.activeAccounts,
                    icon: UserCheck,
                    iconWrapClass: "bg-emerald-50 text-emerald-700",
                    valueClass: "text-emerald-700",
                    onClick: () =>
                      openUsersFiltered({
                        campusId: analyticsCampusId,
                        role: "all",
                        status: "active",
                      }),
                  },
                  {
                    label: "Pending Registrations",
                    value: systemKpis.pendingCount,
                    icon: Clock,
                    iconWrapClass: "bg-amber-50 text-amber-700",
                    valueClass:
                      systemKpis.pendingCount > 0
                        ? "text-amber-700"
                        : "text-chmsu-forest",
                    onClick: () => openRegistrationsFiltered(analyticsCampusId),
                  },
                  {
                    label: "Inactive Accounts",
                    value: systemKpis.inactiveAccounts,
                    icon: UserX,
                    iconWrapClass:
                      systemKpis.inactiveAccounts > 0
                        ? "bg-rose-50 text-rose-700"
                        : "bg-slate-100 text-slate-600",
                    valueClass:
                      systemKpis.inactiveAccounts > 0
                        ? "text-rose-700"
                        : "text-slate-700",
                    onClick: () =>
                      openUsersFiltered({
                        campusId: analyticsCampusId,
                        role: "all",
                        status: "inactive",
                      }),
                  },
                  {
                    label: "Announcements",
                    value: systemKpis.activeAnnouncements,
                    icon: Megaphone,
                    iconWrapClass: "bg-blue-50 text-blue-700",
                    valueClass: "text-chmsu-forest",
                    onClick: () => openAnnouncementsFiltered(analyticsCampusId),
                  },
                ].map((kpi) => {
                  const Icon = kpi.icon;
                  return (
                    <button
                      key={kpi.label}
                      type="button"
                      onClick={kpi.onClick}
                      className="group flex cursor-pointer flex-col justify-between rounded-2xl border border-chmsu-border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#143D29]/30 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${kpi.iconWrapClass}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-[11px] font-semibold text-chmsu-forest opacity-0 transition-opacity group-hover:opacity-100">
                          View &rarr;
                        </span>
                      </div>
                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {kpi.label}
                        </p>
                        <p
                          className={`mt-1 text-2xl font-bold tabular-nums ${kpi.valueClass}`}
                        >
                          {kpi.value}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Section 2: 2-Column Analytics Row */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <section className="flex flex-col justify-between rounded-2xl border border-chmsu-border bg-white p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-chmsu-forest">
                      Campus User Distribution
                    </h2>
                    {analyticsCampusId !== "all" && (
                      <button
                        type="button"
                        onClick={() => setAnalyticsCampusId("all")}
                        className="cursor-pointer rounded-md border border-chmsu-border bg-chmsu-canvas px-2 py-0.5 text-[11px] font-semibold text-chmsu-forest transition hover:border-chmsu-green hover:bg-white"
                      >
                        Reset filter
                      </button>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col items-center justify-center">
                    <div className="relative h-[200px] w-[200px]">
                      <svg
                        viewBox="0 0 200 200"
                        className="h-full w-full overflow-visible"
                        role="img"
                        aria-label="Campus User Distribution Donut Chart"
                      >
                        {campusDonutData.total === 0 ? (
                          <circle
                            cx="100"
                            cy="100"
                            r="72"
                            fill="none"
                            stroke="#E2E8F0"
                            strokeWidth="28"
                          />
                        ) : campusDonutData.nonZeroCount === 1 ? (
                          campusDonutData.segments
                            .filter((seg) => seg.totalUsers > 0)
                            .map((seg) => {
                              const isHighlighted =
                                !activeDonutCampusId ||
                                activeDonutCampusId === seg.campusId;
                              const isEmphasized =
                                activeDonutCampusId === seg.campusId;
                              return (
                                <circle
                                  key={seg.campusId}
                                  cx="100"
                                  cy="100"
                                  r="72"
                                  fill="none"
                                  stroke={seg.color}
                                  strokeWidth="28"
                                  onClick={() =>
                                    toggleDashboardCampusFilter(seg.campusId)
                                  }
                                  onMouseEnter={() =>
                                    setHoveredCampusId(seg.campusId)
                                  }
                                  onMouseLeave={() => setHoveredCampusId(null)}
                                  className="cursor-pointer transition-all duration-200"
                                  style={{
                                    opacity: isHighlighted ? 1 : 0.35,
                                    transform: isEmphasized
                                      ? "scale(1.03)"
                                      : "scale(1)",
                                    transformOrigin: "100px 100px",
                                  }}
                                />
                              );
                            })
                        ) : (
                          campusDonutData.segments
                            .filter((seg) => seg.totalUsers > 0)
                            .map((seg) => {
                              const isHighlighted =
                                !activeDonutCampusId ||
                                activeDonutCampusId === seg.campusId;
                              const isEmphasized =
                                activeDonutCampusId === seg.campusId;
                              return (
                                <path
                                  key={seg.campusId}
                                  d={describeDonutArc(
                                    100,
                                    100,
                                    86,
                                    58,
                                    seg.startAngle,
                                    seg.endAngle
                                  )}
                                  fill={seg.color}
                                  stroke="#ffffff"
                                  strokeWidth="2.5"
                                  strokeLinejoin="round"
                                  onClick={() =>
                                    toggleDashboardCampusFilter(seg.campusId)
                                  }
                                  onMouseEnter={() =>
                                    setHoveredCampusId(seg.campusId)
                                  }
                                  onMouseLeave={() => setHoveredCampusId(null)}
                                  className="cursor-pointer transition-all duration-200"
                                  style={{
                                    opacity: isHighlighted ? 1 : 0.35,
                                    transform: isEmphasized
                                      ? "scale(1.035)"
                                      : "scale(1)",
                                    transformOrigin: "100px 100px",
                                  }}
                                />
                              );
                            })
                        )}
                      </svg>

                      {/* Centered Interactive Readout */}
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                        <span className="text-3xl font-bold leading-none text-slate-900 tabular-nums">
                          {campusDonutData.total === 0
                            ? 0
                            : activeDonutSegment
                              ? `${activeDonutSegment.pct}%`
                              : campusDonutData.total}
                        </span>
                        <span className="mt-1.5 text-xs font-medium leading-tight text-slate-500">
                          {campusDonutData.total === 0
                            ? "Campus Users"
                            : activeDonutSegment
                              ? `${activeDonutSegment.label} • ${activeDonutSegment.activeCount} active`
                              : "Campus Users"}
                        </span>
                      </div>
                    </div>

                    {/* Compact 2x2 Interactive Legend */}
                    <div className="mt-5 grid w-full max-w-md grid-cols-2 gap-x-4 gap-y-2">
                      {campusDonutData.segments.map((seg) => {
                        const isSelected = analyticsCampusId === seg.campusId;
                        const isDimmed =
                          Boolean(activeDonutCampusId) &&
                          activeDonutCampusId !== seg.campusId;
                        return (
                          <button
                            key={seg.campusId}
                            type="button"
                            onClick={() =>
                              toggleDashboardCampusFilter(seg.campusId)
                            }
                            onMouseEnter={() =>
                              setHoveredCampusId(seg.campusId)
                            }
                            onMouseLeave={() => setHoveredCampusId(null)}
                            onFocus={() => setHoveredCampusId(seg.campusId)}
                            onBlur={() => setHoveredCampusId(null)}
                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition ${isSelected
                                ? "border-chmsu-forest/30 bg-chmsu-canvas font-semibold"
                                : "border-transparent hover:bg-slate-50"
                              } ${isDimmed ? "opacity-50" : "opacity-100"}`}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: seg.color }}
                              />
                              <span className="truncate font-medium text-slate-700">
                                {seg.label}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-500">
                              {seg.totalUsers} ({seg.pct}%)
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="flex flex-col justify-between rounded-2xl border border-chmsu-border bg-white p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-chmsu-forest">
                      Accounts by Role
                    </h2>
                    <span className="text-[11px] font-medium text-slate-500">
                      Click a role to filter users
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs">
                    {accountsByRole.map((entry) => {
                      const sharePct =
                        scopedDashboardUsers.length > 0
                          ? Math.round(
                            (entry.count / scopedDashboardUsers.length) * 100
                          )
                          : 0;
                      return (
                        <button
                          key={entry.role}
                          type="button"
                          onClick={() =>
                            openUsersFiltered({
                              campusId: analyticsCampusId,
                              role: entry.role,
                              status: "all",
                            })
                          }
                          className="group w-full cursor-pointer rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-800 group-hover:text-chmsu-forest">
                              {entry.label}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] tabular-nums text-slate-400">
                                {sharePct}%
                              </span>
                              <span className="rounded-md border border-chmsu-border bg-chmsu-canvas px-2.5 py-0.5 font-bold text-chmsu-forest tabular-nums group-hover:border-chmsu-green/40 group-hover:bg-white">
                                {entry.count}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-md bg-slate-100">
                            <div
                              className="h-full rounded-md bg-chmsu-green transition-all duration-300"
                              style={{ width: `${sharePct}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Section 3: Campus Overview (2x2 Grid) */}
              <div className="space-y-3">
                <h2 className="text-base font-bold text-chmsu-forest">
                  Campus Overview
                </h2>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {visibleCampusOverview.map((item) => {
                    const isSelectedCampus =
                      analyticsCampusId === item.campus.id;
                    return (
                      <article
                        key={item.campus.id}
                        className="overflow-hidden rounded-2xl border border-chmsu-border bg-white transition-all hover:border-slate-300 hover:shadow-md"
                      >
                        <div
                          className="h-1 w-full"
                          style={{ backgroundColor: item.accentColor }}
                        />
                        <div className="p-5">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-bold text-chmsu-forest">
                              {item.displayName}
                            </h3>
                            <button
                              type="button"
                              onClick={() =>
                                toggleDashboardCampusFilter(item.campus.id)
                              }
                              className={`cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${isSelectedCampus
                                  ? "border-chmsu-forest bg-chmsu-forest text-white hover:bg-chmsu-green"
                                  : "border-chmsu-border bg-chmsu-canvas text-slate-700 hover:border-chmsu-green hover:bg-white hover:text-chmsu-forest"
                                }`}
                            >
                              {isSelectedCampus ? "Selected" : "Filter Campus"}
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2.5 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                openUsersFiltered({
                                  campusId: item.campus.id,
                                  role: "all",
                                  status: "active",
                                })
                              }
                              className="cursor-pointer rounded-xl border border-chmsu-border bg-white p-2.5 transition hover:border-chmsu-green/50 hover:bg-chmsu-canvas"
                            >
                              <p className="text-lg font-bold text-chmsu-forest tabular-nums">
                                {item.activeCount}
                              </p>
                              <p className="text-[11px] font-medium text-slate-500">
                                Active Users
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openRegistrationsFiltered(item.campus.id)
                              }
                              className="cursor-pointer rounded-xl border border-chmsu-border bg-white p-2.5 transition hover:border-amber-300 hover:bg-amber-50/50"
                            >
                              <p className="text-lg font-bold text-amber-700 tabular-nums">
                                {item.pendingCount}
                              </p>
                              <p className="text-[11px] font-medium text-slate-500">
                                Pending IDs
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openAnnouncementsFiltered(item.campus.id)
                              }
                              className="cursor-pointer rounded-xl border border-chmsu-border bg-white p-2.5 transition hover:border-blue-300 hover:bg-blue-50/40"
                            >
                              <p className="text-lg font-bold text-slate-800 tabular-nums">
                                {item.announcementCount}
                              </p>
                              <p className="text-[11px] font-medium text-slate-500">
                                Announcements
                              </p>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PLATFORM USERS */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Platform Users
                </h1>
                <p className="text-sm text-slate-600">
                  View user details and manage account activation status across
                  all 4 CHMSU campuses.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-chmsu-border bg-white p-4 sm:grid-cols-4">
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
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Accounts</option>
                  <option value="pending">Pending Accounts</option>
                  <option value="inactive">
                    Inactive / Deactivated Accounts
                  </option>
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
                      {filteredUsers.map((u) => {
                        const accountStatus = getUserAccountStatus(u);
                        return (
                          <tr
                            key={u.id}
                            className={
                              accountStatus.key === "deactivated" ||
                                accountStatus.key === "rejected"
                                ? "bg-slate-50 opacity-65"
                                : ""
                            }
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
                            <td className="px-4 py-3 text-left">
                              <span className="text-xs font-semibold text-slate-700">
                                {ROLE_LABELS[u.role] ?? u.role}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs font-medium text-slate-700">
                              {campusMap[u.campus_id]?.name ?? "Unassigned"}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${accountStatus.badgeClass}`}
                              >
                                {accountStatus.label}
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
                        );
                      })}
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
                                {u.department ||
                                  (u.requested_role === ROLES.RMO
                                    ? u.office_location || "Records Management"
                                    : "No department")}
                                {u.department && u.program_or_course
                                  ? ` • ${u.program_or_course}`
                                  : u.department && u.office_location
                                    ? ` • ${u.office_location}`
                                    : ""}
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-xs font-medium text-slate-700">
                              CHMSU{" "}
                              {campusMap[u.campus_id]?.name ?? "Unassigned"}
                            </td>
                            <td className="px-4 py-3.5 text-left text-sm font-medium text-slate-700">
                              {ROLE_LABELS[u.requested_role ?? "student"] ??
                                "Student"}
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    University-Wide &amp; Campus Announcements
                  </h1>
                  <p className="text-sm text-slate-600">
                    Publish, edit, pin, or delete announcements across all 4
                    campuses.
                  </p>
                </div>

                {!isComposerOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setAnnouncementForm(EMPTY_ANNOUNCEMENT);
                      setAnnouncementAttachmentFile(null);
                      setExistingAnnouncementAttachment(null);
                      setRemovedAnnouncementAttachmentPath(null);
                      setIsComposerOpen(true);
                    }}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-lg bg-[#143D29] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2e1f] sm:self-auto"
                  >
                    <Plus className="h-4 w-4" />
                    New Announcement
                  </button>
                )}
              </div>

              {isComposerOpen && (
                <form
                  onSubmit={handleSaveAnnouncement}
                  className="space-y-4 rounded-2xl border border-chmsu-border bg-white p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-chmsu-forest">
                      {announcementForm.id
                        ? "Edit Announcement"
                        : "Publish New Announcement"}
                    </h2>
                    <button
                      type="button"
                      onClick={resetAnnouncementComposer}
                      aria-label="Close announcement composer"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-chmsu-border px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
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

                  <AnnouncementAttachmentPicker
                    inputId="superadmin_ann_attachment"
                    file={announcementAttachmentFile}
                    existingAttachment={existingAnnouncementAttachment}
                    disabled={savingAnnouncement}
                    onFileSelect={(picked) => {
                      if (existingAnnouncementAttachment?.attachment_path) {
                        setRemovedAnnouncementAttachmentPath(
                          existingAnnouncementAttachment.attachment_path
                        );
                      }
                      setAnnouncementAttachmentFile(picked);
                    }}
                    onClear={() => {
                      if (existingAnnouncementAttachment?.attachment_path) {
                        setRemovedAnnouncementAttachmentPath(
                          existingAnnouncementAttachment.attachment_path
                        );
                      }
                      setAnnouncementAttachmentFile(null);
                      setExistingAnnouncementAttachment(null);
                    }}
                  />

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

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={resetAnnouncementComposer}
                        disabled={savingAnnouncement}
                        className="cursor-pointer rounded-lg border border-chmsu-border bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingAnnouncement}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#143D29] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0f2e1f] disabled:opacity-60"
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
                  </div>
                </form>
              )}

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
                            <span className="inline-flex items-center gap-1 rounded-md bg-chmsu-forest/10 px-2.5 py-0.5 text-chmsu-forest">
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
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 uppercase text-slate-600">
                              {item.category}
                            </span>
                            {item.is_pinned && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-amber-900">
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
                          <AnnouncementAttachment
                            url={item.attachment_url}
                            name={item.attachment_name}
                            type={item.attachment_type}
                            size={item.attachment_size}
                          />
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
                            onClick={() => {
                              setAnnouncementForm({
                                id: item.id,
                                campus_id: item.campus_id ?? "university",
                                title: item.title,
                                body: item.body,
                                category: normalizeAnnouncementCategory(
                                  item.category
                                ),
                                priority: item.priority,
                                is_public: Boolean(item.is_public),
                                is_pinned: Boolean(item.is_pinned),
                              });
                              setAnnouncementAttachmentFile(null);
                              setExistingAnnouncementAttachment(
                                item.attachment_url
                                  ? {
                                    attachment_url: item.attachment_url,
                                    attachment_path: item.attachment_path,
                                    attachment_name: item.attachment_name,
                                    attachment_type: item.attachment_type,
                                    attachment_size: item.attachment_size,
                                  }
                                  : null
                              );
                              setRemovedAnnouncementAttachmentPath(null);
                              setIsComposerOpen(true);
                              if (typeof window !== "undefined") {
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }
                            }}
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

          {/* TAB 8: SYSTEM LOGS & DOCUMENT LOGS */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  {auditSubTab === "document" ? "Document Logs" : "System Logs"}
                </h1>
                <p className="text-sm text-slate-600">
                  {auditSubTab === "document"
                    ? "University-wide document tracking, custody handoffs, and SLA delay logs across all 4 CHMSU campuses."
                    : "Immutable authentication, user management, registration, privacy, announcement, and system activity logs across all 4 CHMSU campuses."}
                </p>
              </div>

              {/* System Logs / Document Logs Switcher */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuditSubTab("system")}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${auditSubTab === "system"
                      ? "bg-chmsu-forest text-white shadow-xs"
                      : "border border-chmsu-border bg-white text-slate-700 hover:border-chmsu-green hover:text-chmsu-forest"
                    }`}
                >
                  <span>System Logs</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${auditSubTab === "system"
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                      }`}
                  >
                    {systemAuditCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAuditSubTab("document")}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${auditSubTab === "document"
                      ? "bg-chmsu-forest text-white shadow-xs"
                      : "border border-chmsu-border bg-white text-slate-700 hover:border-chmsu-green hover:text-chmsu-forest"
                    }`}
                >
                  <span>Document Logs</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${auditSubTab === "document"
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-600"
                      }`}
                  >
                    {documentAuditCount}
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-chmsu-border bg-white p-4 sm:grid-cols-3">
                <div className="relative sm:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={auditQuery}
                    onChange={(e) => setAuditQuery(e.target.value)}
                    placeholder={
                      auditSubTab === "document"
                        ? "Search by name, email, tracking code, or action..."
                        : "Search by name, email, category, or action..."
                    }
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

              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                {filteredAuditLogs.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    {auditSubTab === "document"
                      ? "No document log entries match your filter."
                      : "No system log entries match your filter."}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table
                      className={`w-full border-collapse text-left text-sm ${auditSubTab === "document"
                          ? "min-w-[680px]"
                          : "min-w-[760px]"
                        }`}
                    >
                      <thead>
                        <tr className="border-b border-chmsu-border bg-chmsu-canvas text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="px-5 py-3 text-left">Timestamp</th>
                          <th className="px-4 py-3 text-left">Actor / User</th>
                          {auditSubTab === "system" && (
                            <th className="px-4 py-3 text-left">Log Category</th>
                          )}
                          <th className="px-5 py-3 text-left">Action Performed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-chmsu-border">
                        {filteredAuditLogs.slice(0, 100).map((log) => {
                          const category = getAuditLogCategory(log);
                          const actionLabel = formatAuditActionLabel(log.action);
                          const detailSummary = formatAuditDetailSummary(log, {
                            roleLabels: ROLE_LABELS,
                            campusMap,
                          });
                          const actorName =
                            log.actor?.full_name ||
                            log.metadata?.full_name ||
                            "System";
                          const actorEmail =
                            log.actor?.email || log.metadata?.email || "—";

                          return (
                            <tr
                              key={log.id}
                              className="transition hover:bg-slate-50/70"
                            >
                              <td className="whitespace-nowrap px-5 py-3.5 text-left align-top text-xs text-slate-600 tabular-nums">
                                {formatDateTime(log.created_at)}
                              </td>
                              <td className="px-4 py-3.5 text-left align-top">
                                <p className="font-semibold text-slate-900">
                                  {actorName}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {actorEmail}
                                </p>
                              </td>
                              {auditSubTab === "system" && (
                                <td className="whitespace-nowrap px-4 py-3.5 text-left align-top text-sm font-medium text-slate-700">
                                  {category.label}
                                </td>
                              )}
                              <td className="px-5 py-3.5 text-left align-top">
                                <p className="font-semibold text-chmsu-forest">
                                  {actionLabel}
                                </p>
                                {detailSummary && (
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {detailSummary}
                                  </p>
                                )}
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

          {/* TAB 9: MY PROFILE */}
          {activeTab === "profile" && <UserProfileView profile={profile} />}
        </main>
      </div>

      {/* Read-Only User Details Modal (Profile Picture, School ID Photos & Activation Toggle) */}
      {selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          campusLabel={
            campusMap[selectedUser.campus_id]?.name
              ? `CHMSU ${campusMap[selectedUser.campus_id].name}`
              : "Unassigned"
          }
          cannotDeactivateReason={
            selectedUser.id === profile.id
              ? "You cannot deactivate your own account."
              : ""
          }
          togglingStatus={togglingUserStatus}
          onToggleActive={handleToggleUserActive}
          onReviewPending={
            selectedUser.approval_status === "pending" &&
              selectedUser.profile_completed
              ? () => {
                const target = selectedUser;
                setSelectedUser(null);
                setActiveTab("registrations");
                setReviewUser(target);
              }
              : undefined
          }
          reviewPendingLabel="Review in Pending Registrations"
          onClose={() => setSelectedUser(null)}
        />
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
