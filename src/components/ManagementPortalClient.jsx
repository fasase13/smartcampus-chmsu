"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  Download,
  Eye,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Loader2,
  LogOut,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserCircle,
  Users,
  X,
  XCircle,
  ZoomIn,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PrivacyTermsGate from "@/components/PrivacyTermsGate";
import DocumentRegisterPanel from "@/components/DocumentRegisterPanel";
import UserProfileView from "@/components/UserProfileView";
import PortalSidebar, {
  SidebarToggleButton,
  usePortalSidebarState,
} from "@/components/PortalSidebar";
import {
  ALL_ROLES,
  DOCUMENT_STATUS_META,
  ROLE_LABELS,
  ROLES,
  ROUTE_ACTION_LABELS,
  STORAGE_BUCKETS,
  formatSlaDays,
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

function getOverdueDays(doc) {
  if (!doc?.due_at) return 0;
  const diffMs = Date.now() - new Date(doc.due_at).getTime();
  return diffMs > 0 ? Math.max(0.1, Math.round((diffMs / 86400000) * 10) / 10) : 0;
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

const AUDIT_PAGE_SIZE = 25;

export default function ManagementPortalClient({
  profile,
  campuses,
  initialDocuments,
  initialUsers,
  initialAuditLogs,
  initialUnreadAlerts,
}) {
  const router = useRouter();
  const isAdmin = profile.role === ROLES.SUPERADMIN;

  const campusMap = useMemo(
    () => Object.fromEntries(campuses.map((c) => [c.id, c])),
    [campuses]
  );

  // Navigation & Global Controls
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedCampusId, setSelectedCampusId] = useState("all");
  const [signingOut, setSigningOut] = useState(false);
  const { collapsed, mobileOpen, toggleSidebar, closeMobile } =
    usePortalSidebarState();

  // Core Data States
  const [documents, setDocuments] = useState(initialDocuments);
  const [users, setUsers] = useState(initialUsers);
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs);
  const [unreadAlerts, setUnreadAlerts] = useState(initialUnreadAlerts);

  // SLA Check State
  const [runningSla, setRunningSla] = useState(false);
  const [slaSummary, setSlaSummary] = useState(null);
  const initialSlaRanRef = useRef(false);

  // Feedback Banner
  const [feedback, setFeedback] = useState(null);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const initialTick = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => {
      clearTimeout(initialTick);
      clearInterval(timer);
    };
  }, []);

  // Inspect Document Trail Modal
  const [inspectDoc, setInspectDoc] = useState(null);
  const [inspectRoutes, setInspectRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);

  // Tab B: Date Range for Analytics & CSV/PDF Report
  const [datePreset, setDatePreset] = useState("all"); // all | 7d | 30d | 90d | custom
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Tab C: User Management (Admin only)
  const [userSearch, setUserSearch] = useState("");
  const [userCampusFilter, setUserCampusFilter] = useState("all");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingUser, setSavingUser] = useState(false);

  // Pending Registrations ID Verification Modal (Admin only)
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

  // Tab D: Audit Logs Viewer
  const [auditCampusFilter, setAuditCampusFilter] = useState("all");
  const [auditRoleFilter, setAuditRoleFilter] = useState("all");
  const [auditEntityFilter, setAuditEntityFilter] = useState("all");
  const [auditActionQuery, setAuditActionQuery] = useState("");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [expandedAuditId, setExpandedAuditId] = useState(null);

  // Refetch helpers
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

  const refreshUsers = useCallback(async () => {
    if (!isAdmin) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, campus_id, email, full_name, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, reviewed_by, reviewed_at, department, job_title, office_location, show_on_kiosk, is_active, created_at"
      )
      .order("created_at", { ascending: false });
    if (data) setUsers(data);
  }, [isAdmin]);

  const refreshUnreadAlerts = useCallback(async () => {
    const supabase = createClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("is_read", false);
    if (typeof count === "number") setUnreadAlerts(count);
  }, [profile.id]);

  // Run SLA Delay Check RPC
  const runSlaCheck = useCallback(
    async (silentIfZero = false) => {
      setRunningSla(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("run_sla_delay_check");
        if (error) {
          if (!silentIfZero) {
            setFeedback({
              type: "error",
              message: `SLA check failed: ${error.message}`,
            });
          }
          return;
        }
        const flagged = data?.flagged_count ?? 0;
        setSlaSummary({
          flagged_count: flagged,
          checked_at: data?.checked_at ?? new Date().toISOString(),
        });

        if (flagged > 0) {
          await Promise.all([
            refreshDocuments(),
            refreshAuditLogs(),
            refreshUnreadAlerts(),
          ]);
          setFeedback({
            type: "warning",
            message: `SLA Delay Check flagged ${flagged} newly overdue document${flagged === 1 ? "" : "s"} and dispatched Realtime alerts.`,
          });
        } else if (!silentIfZero) {
          setFeedback({
            type: "success",
            message:
              "SLA Delay Check completed — no newly overdue documents found.",
          });
        }
      } finally {
        setRunningSla(false);
      }
    },
    [refreshAuditLogs, refreshDocuments, refreshUnreadAlerts]
  );

  // Automatic SLA delay check on mount
  useEffect(() => {
    if (initialSlaRanRef.current) return;
    initialSlaRanRef.current = true;
    runSlaCheck(true);
  }, [runSlaCheck]);

  // Supabase Realtime subscriptions on documents, notifications & profiles (admin)
  useEffect(() => {
    const supabase = createClient();
    let channel = supabase
      .channel(`management-realtime-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        () => refreshDocuments()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        () => refreshUnreadAlerts()
      );

    if (isAdmin) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => refreshUsers()
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, profile.id, refreshDocuments, refreshUnreadAlerts, refreshUsers]);

  // Campus-scoped documents
  const campusScopedDocs = useMemo(() => {
    if (selectedCampusId === "all") return documents;
    return documents.filter(
      (d) =>
        d.current_campus_id === selectedCampusId ||
        d.origin_campus_id === selectedCampusId
    );
  }, [documents, selectedCampusId]);

  // Date-filtered documents for Tab B analytics & reports
  const reportScopedDocs = useMemo(() => {
    if (datePreset === "all") return campusScopedDocs;
    let startMs = 0;
    let endMs = Infinity;

    if (datePreset === "7d") startMs = nowMs ? nowMs - 7 * 86400000 : 0;
    else if (datePreset === "30d") startMs = nowMs ? nowMs - 30 * 86400000 : 0;
    else if (datePreset === "90d") startMs = nowMs ? nowMs - 90 * 86400000 : 0;
    else if (datePreset === "custom") {
      startMs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : 0;
      endMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Infinity;
    }

    return campusScopedDocs.filter((d) => {
      const t = new Date(d.created_at).getTime();
      return t >= startMs && t <= endMs;
    });
  }, [campusScopedDocs, datePreset, dateFrom, dateTo, nowMs]);

  // KPI Metrics (Tab A)
  const kpis = useMemo(() => {
    const total = campusScopedDocs.length;
    const active = campusScopedDocs.filter(
      (d) => d.status !== "completed" && d.status !== "archived"
    );
    const overdue = active.filter(isDocOverdue);
    const interTransit = active.filter(
      (d) => d.origin_campus_id !== d.current_campus_id
    );
    const onTimeCount = campusScopedDocs.filter((d) => !isDocOverdue(d)).length;
    const onTimeRate =
      total === 0 ? 100 : Math.round((onTimeCount / total) * 1000) / 10;

    const completedWithTime = campusScopedDocs.filter((d) => d.completed_at);
    const avgTurnaround =
      completedWithTime.length === 0
        ? 0
        : Math.round(
            (completedWithTime.reduce((acc, d) => {
              const days =
                (new Date(d.completed_at).getTime() -
                  new Date(d.created_at).getTime()) /
                86400000;
              return acc + Math.max(0, days);
            }, 0) /
              completedWithTime.length) *
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
  }, [campusScopedDocs]);

  // Live Red Delay Alerts sorted by most overdue first
  const overdueDocuments = useMemo(() => {
    return campusScopedDocs
      .filter(isDocOverdue)
      .sort((a, b) => {
        const aDue = a.due_at ? new Date(a.due_at).getTime() : 0;
        const bDue = b.due_at ? new Date(b.due_at).getTime() : 0;
        return aDue - bDue;
      });
  }, [campusScopedDocs]);

  // Analytics Breakdowns (Tab B)
  const analyticsByCampus = useMemo(() => {
    return campuses.map((c) => {
      const docs = reportScopedDocs.filter((d) => d.current_campus_id === c.id);
      const delayed = docs.filter(isDocOverdue).length;
      const delayRate =
        docs.length === 0 ? 0 : Math.round((delayed / docs.length) * 100);
      return {
        campus: c,
        total: docs.length,
        delayed,
        delayRate,
      };
    });
  }, [campuses, reportScopedDocs]);

  const maxCampusVolume = useMemo(
    () => Math.max(1, ...analyticsByCampus.map((c) => c.total)),
    [analyticsByCampus]
  );

  const bottleneckOffices = useMemo(() => {
    const map = new Map();
    reportScopedDocs.forEach((doc) => {
      const campusName = campusMap[doc.current_campus_id]?.name ?? "CHMSU";
      const key = `${doc.current_office}__${doc.current_campus_id}`;
      const existing = map.get(key) ?? {
        office: doc.current_office,
        campusName,
        total: 0,
        active: 0,
        overdue: 0,
        holdingDaysSum: 0,
      };
      existing.total += 1;
      if (doc.status !== "completed" && doc.status !== "archived") {
        existing.active += 1;
      }
      if (isDocOverdue(doc)) existing.overdue += 1;
      const endMs = doc.completed_at
        ? new Date(doc.completed_at).getTime()
        : nowMs || new Date(doc.updated_at || doc.created_at).getTime();
      existing.holdingDaysSum += Math.max(
        0,
        (endMs - new Date(doc.created_at).getTime()) / 86400000
      );
      map.set(key, existing);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        avgHoldingDays:
          item.total === 0
            ? 0
            : Math.round((item.holdingDaysSum / item.total) * 10) / 10,
      }))
      .sort(
        (a, b) =>
          b.overdue - a.overdue || b.avgHoldingDays - a.avgHoldingDays
      )
      .slice(0, 8);
  }, [campusMap, reportScopedDocs, nowMs]);

  const breakdownByType = useMemo(() => {
    const counts = new Map();
    reportScopedDocs.forEach((d) => {
      counts.set(d.document_type, (counts.get(d.document_type) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [reportScopedDocs]);

  const breakdownByStatus = useMemo(() => {
    const counts = new Map();
    reportScopedDocs.forEach((d) => {
      counts.set(d.status, (counts.get(d.status) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [reportScopedDocs]);

  // Inspect document custody trail
  async function openInspectModal(doc) {
    setInspectDoc(doc);
    setLoadingRoutes(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("document_routes")
        .select(
          "id, campus_id, from_office, to_office, action, remarks, scanned_via_qr, created_at, actor:acted_by(full_name, role)"
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

  // Export Analytics CSV
  function handleExportReportCsv() {
    const scopeSlug =
      selectedCampusId === "all"
        ? "university-wide"
        : campusMap[selectedCampusId]?.slug ?? "campus";
    const today = new Date().toISOString().slice(0, 10);

    const headers = [
      "Tracking Code",
      "Title",
      "Document Type",
      "Priority",
      "Status",
      "Origin Campus",
      "Current Campus",
      "Current Office",
      "SLA Days",
      "Due At",
      "Is Overdue",
      "Created At",
      "Completed At",
    ];
    const rows = reportScopedDocs.map((d) => [
      d.tracking_code,
      d.title,
      d.document_type,
      d.priority,
      d.status,
      campusMap[d.origin_campus_id]?.name ?? "",
      campusMap[d.current_campus_id]?.name ?? "",
      d.current_office,
      d.sla_hours ? Math.round((d.sla_hours / 24) * 10) / 10 : "",
      d.due_at ?? "",
      isDocOverdue(d) ? "YES" : "NO",
      d.created_at,
      d.completed_at ?? "",
    ]);
    downloadCsvFile(
      `chmsu-document-report-${scopeSlug}-${today}.csv`,
      headers,
      rows
    );
  }

  // Pending Registrations Queue (Admin only — strictly completed Step 3 submissions)
  const pendingRegistrations = useMemo(() => {
    if (!isAdmin) return [];
    return users
      .filter(
        (u) => u.approval_status === "pending" && u.profile_completed === true
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }, [isAdmin, users]);

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
      setIdPhotoError("No ID verification photos were attached to this registration.");
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
            "Unable to load signed ID verification photos."
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
    if (!reviewUser || !isAdmin) return;
    if (decision === "reject" && !rejectionReason.trim()) {
      setFeedback({
        type: "error",
        message: "Please provide a brief reason before rejecting a registration.",
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
        p_rejection_reason: decision === "reject" ? rejectionReason.trim() : null,
      });

      if (error) {
        setFeedback({
          type: "error",
          message: `Verification action failed: ${error.message}`,
        });
        return;
      }

      const targetName = reviewUser.full_name;
      const targetId = reviewUser.employee_or_student_id;
      closeReviewModal();
      await Promise.all([refreshUsers(), refreshAuditLogs()]);

      setFeedback({
        type: decision === "approve" ? "success" : "warning",
        message:
          decision === "approve"
            ? `Approved ${targetName} (ID ${targetId ?? "N/A"}) as ${ROLE_LABELS[reviewRole] ?? reviewRole}.`
            : `Declined registration for ${targetName} (ID ${targetId ?? "N/A"}).`,
      });
    } finally {
      setSubmittingReview(false);
    }
  }

  // Tab C: Filtered Users & Save Edit
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      const cMatch =
        userCampusFilter === "all" || u.campus_id === userCampusFilter;
      const rMatch = userRoleFilter === "all" || u.role === userRoleFilter;
      if (!cMatch || !rMatch) return false;
      if (!q) return true;
      return (
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.employee_or_student_id?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, userCampusFilter, userRoleFilter]);

  function openEditUser(target) {
    setEditingUser(target);
    setEditForm({
      role: target.role,
      campus_id: target.campus_id ?? campuses[0]?.id ?? "",
      department: target.department ?? "",
      office_location: target.office_location ?? "",
      show_on_kiosk: Boolean(target.show_on_kiosk),
      is_active: Boolean(target.is_active),
    });
  }

  async function handleSaveUser(e) {
    e.preventDefault();
    if (!editingUser || !editForm || !isAdmin) return;

    // Prevent self-demotion or self-deactivation
    if (editingUser.id === profile.id) {
      if (editForm.role !== ROLES.SUPERADMIN || !editForm.is_active) {
        setFeedback({
          type: "error",
          message:
            "Safety guard: You cannot demote or deactivate your own Superadmin account.",
        });
        return;
      }
    }

    setSavingUser(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          role: editForm.role,
          campus_id: editForm.campus_id || null,
          department: editForm.department.trim() || null,
          office_location: editForm.office_location.trim() || null,
          show_on_kiosk: Boolean(editForm.show_on_kiosk),
          is_active: Boolean(editForm.is_active),
        })
        .eq("id", editingUser.id);

      if (error) {
        setFeedback({ type: "error", message: error.message });
        return;
      }

      // Log to immutable audit_logs
      await supabase.from("audit_logs").insert({
        campus_id: editForm.campus_id || editingUser.campus_id,
        actor_id: profile.id,
        actor_role: profile.role,
        action: "user_profile_updated",
        entity_type: "profile",
        entity_id: editingUser.id,
        metadata: {
          target_email: editingUser.email,
          before: {
            role: editingUser.role,
            campus_id: editingUser.campus_id,
            is_active: editingUser.is_active,
            show_on_kiosk: editingUser.show_on_kiosk,
          },
          after: {
            role: editForm.role,
            campus_id: editForm.campus_id,
            is_active: editForm.is_active,
            show_on_kiosk: editForm.show_on_kiosk,
          },
        },
      });

      await Promise.all([refreshUsers(), refreshAuditLogs()]);
      setEditingUser(null);
      setEditForm(null);
      setFeedback({
        type: "success",
        message: `Permissions updated for ${editingUser.full_name} and recorded in audit logs.`,
      });
    } finally {
      setSavingUser(false);
    }
  }

  // Tab D: Filtered Audit Logs + Pagination + CSV Export
  const filteredAuditLogs = useMemo(() => {
    const q = auditActionQuery.trim().toLowerCase();
    const fromMs = auditDateFrom
      ? new Date(`${auditDateFrom}T00:00:00`).getTime()
      : 0;
    const toMs = auditDateTo
      ? new Date(`${auditDateTo}T23:59:59`).getTime()
      : Infinity;

    return auditLogs.filter((log) => {
      const cMatch =
        auditCampusFilter === "all" || log.campus_id === auditCampusFilter;
      const rMatch =
        auditRoleFilter === "all" || log.actor_role === auditRoleFilter;
      const eMatch =
        auditEntityFilter === "all" || log.entity_type === auditEntityFilter;
      const t = new Date(log.created_at).getTime();
      const dMatch = t >= fromMs && t <= toMs;
      if (!cMatch || !rMatch || !eMatch || !dMatch) return false;
      if (!q) return true;
      return (
        log.action?.toLowerCase().includes(q) ||
        log.actor?.full_name?.toLowerCase().includes(q) ||
        log.actor?.email?.toLowerCase().includes(q) ||
        JSON.stringify(log.metadata ?? {})
          .toLowerCase()
          .includes(q)
      );
    });
  }, [
    auditLogs,
    auditCampusFilter,
    auditRoleFilter,
    auditEntityFilter,
    auditActionQuery,
    auditDateFrom,
    auditDateTo,
  ]);

  const totalAuditPages = Math.max(
    1,
    Math.ceil(filteredAuditLogs.length / AUDIT_PAGE_SIZE)
  );
  const safeAuditPage = Math.min(auditPage, totalAuditPages);
  const pagedAuditLogs = useMemo(() => {
    const start = (safeAuditPage - 1) * AUDIT_PAGE_SIZE;
    return filteredAuditLogs.slice(start, start + AUDIT_PAGE_SIZE);
  }, [filteredAuditLogs, safeAuditPage]);

  function handleExportAuditCsv() {
    const today = new Date().toISOString().slice(0, 10);
    const headers = [
      "Timestamp",
      "Campus",
      "Actor Name",
      "Actor Role",
      "Action",
      "Entity Type",
      "Entity ID",
      "Metadata JSON",
    ];
    const rows = filteredAuditLogs.map((log) => [
      log.created_at,
      campusMap[log.campus_id]?.name ?? "University-Wide",
      log.actor?.full_name ?? log.actor?.email ?? "System",
      log.actor_role ?? "",
      log.action,
      log.entity_type,
      log.entity_id ?? "",
      JSON.stringify(log.metadata ?? {}),
    ]);
    downloadCsvFile(`chmsu-audit-logs-${today}.csv`, headers, rows);
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

  const scopeLabel =
    selectedCampusId === "all"
      ? "All 4 Campuses (University-Wide)"
      : `CHMSU ${campusMap[selectedCampusId]?.name ?? "Campus"}`;

  const navTabs = [
    {
      id: "overview",
      label: "Overview & Delay Alerts",
      icon: ShieldAlert,
      badge: kpis.overdueCount,
      visible: true,
    },
    {
      id: "analytics",
      label: "Bottlenecks & Reports",
      icon: BarChart3,
      visible: true,
    },
    {
      id: "send",
      label: "Send / Register Document",
      icon: FilePlus2,
      visible: true,
    },
    {
      id: "registrations",
      label: "Pending Registrations",
      icon: UserCheck,
      badge: pendingRegistrations.length,
      visible: isAdmin,
    },
    {
      id: "users",
      label: "User & Role Permissions",
      icon: Users,
      visible: isAdmin,
    },
    {
      id: "audit",
      label: "Immutable Audit Logs",
      icon: Activity,
      visible: true,
    },
    {
      id: "profile",
      label: "My Profile",
      icon: UserCircle,
      visible: true,
    },
  ].filter((t) => t.visible);

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900 lg:flex-row">
      <PrivacyTermsGate profile={profile} />

      <PortalSidebar
        title="SmartCampus CHMSU"
        subtitle={isAdmin ? "Superadmin" : "Institutional Management"}
        navItems={navTabs.map((t) => ({
          id: t.id,
          label: t.label,
          icon: t.icon,
          alertBadge: t.badge,
        }))}
        activeId={activeTab}
        onSelect={setActiveTab}
        profile={profile}
        roleBadge={ROLE_LABELS[profile.role] ?? profile.role}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        collapsed={collapsed}
        onToggleCollapse={toggleSidebar}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
        ariaLabel="Management Navigation"
      />

      {/* Main Content Area */}
      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-200 print:pl-0 ${
          collapsed ? "lg:pl-20" : "lg:pl-64"
        }`}
      >
        {/* Top Action Bar (hidden on print) */}
        <header className="no-print sticky top-0 z-20 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <SidebarToggleButton onClick={toggleSidebar} />
              <label
                htmlFor="mgmt_campus_scope"
                className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                <Building2 className="h-4 w-4 text-chmsu-green" />
                Scope:
              </label>
              <select
                id="mgmt_campus_scope"
                value={selectedCampusId}
                onChange={(e) => setSelectedCampusId(e.target.value)}
                className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-3 py-2 text-sm font-semibold text-chmsu-forest outline-none focus:border-chmsu-green"
              >
                <option value="all">All 4 Campuses (University-Wide)</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    CHMSU {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2.5">
              {unreadAlerts > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800 tabular-nums">
                  <Bell className="h-3.5 w-3.5 text-red-600" />
                  {unreadAlerts} Alerts
                </span>
              )}

              <button
                type="button"
                disabled={runningSla}
                onClick={() => runSlaCheck(false)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-flame px-3.5 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {runningSla ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Run SLA Delay Check
              </button>

              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-900">
                  {profile?.full_name}
                </p>
                <p className="text-xs text-slate-500">
                  {profile?.role === ROLES.SUPERADMIN
                    ? "System Admin"
                    : ROLE_LABELS[profile?.role] ?? profile?.role}
                </p>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="inline-flex items-center gap-1.5 rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700 lg:hidden"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="w-full flex-1 space-y-6 px-4 py-5 sm:px-6">
          {/* TAB: SEND / REGISTER DOCUMENT */}
          {activeTab === "send" && (
            <DocumentRegisterPanel
              profile={profile}
              campus={
                campuses.find((c) => c.id === profile?.campus_id) ??
                campuses.find((c) => c.is_main) ??
                campuses[0]
              }
              allCampuses={campuses}
              onDocumentRegistered={refreshDocuments}
              showPageHeader
            />
          )}

          {/* Print-Only Institutional Report Header */}
          <div className="hidden border-b-2 border-chmsu-forest pb-4 print:block">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image
                  src="/images/chmsu-logo.jpg"
                  alt="CHMSU Seal"
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-full object-contain"
                />
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-chmsu-green">
                    Carlos Hilado Memorial State University
                  </p>
                  <h1 className="text-xl font-bold text-chmsu-forest">
                    SmartCampus Multi-Campus Document Tracking &amp; SLA Report
                  </h1>
                  <p className="text-xs text-slate-600">
                    Scope: {scopeLabel} &bull; Generated:{" "}
                    {formatDateTime(new Date().toISOString())} by{" "}
                    {profile.full_name}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              role="status"
              className={`no-print flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                feedback.type === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : feedback.type === "warning"
                    ? "border-red-300 bg-red-50 text-red-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {feedback.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                )}
                <span>{feedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                aria-label="Dismiss"
                className="rounded-md p-1 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB A: OVERVIEW & RED DELAY ALERTS                             */}
          {/* ============================================================== */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    Executive Overview &amp; Red Delay Alerts
                  </h1>
                  <p className="text-sm text-slate-600">
                    Live SLA monitoring for <span className="font-semibold">{scopeLabel}</span>
                    {slaSummary?.checked_at
                      ? ` • Last SLA check: ${formatDateTime(slaSummary.checked_at)}`
                      : ""}
                  </p>
                </div>
              </div>

              {/* 5 KPI Summary Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-2xl border border-chmsu-border bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Active Documents
                  </p>
                  <p className="mt-2 text-3xl font-bold text-chmsu-forest tabular-nums">
                    {kpis.activeCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    of {kpis.total} total registered
                  </p>
                </div>

                <div className="rounded-2xl border border-chmsu-border bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    On-Time Rate
                  </p>
                  <p className="mt-2 text-3xl font-bold text-chmsu-green tabular-nums">
                    {kpis.onTimeRate}%
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Within target SLA
                  </p>
                </div>

                <div
                  className={`rounded-2xl border p-4 ${
                    kpis.overdueCount > 0
                      ? "border-red-300 bg-[#FEF2F2]"
                      : "border-chmsu-border bg-white"
                  }`}
                >
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#DC2626]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Overdue / Delayed
                  </p>
                  <p className="mt-2 text-3xl font-extrabold text-[#DC2626] tabular-nums">
                    {kpis.overdueCount}
                  </p>
                  <p className="mt-1 text-xs font-medium text-red-700">
                    Requires immediate action
                  </p>
                </div>

                <div className="rounded-2xl border border-chmsu-border bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Avg. Turnaround
                  </p>
                  <p className="mt-2 text-3xl font-bold text-chmsu-navy tabular-nums">
                    {formatSlaDays(kpis.avgTurnaround)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Completed documents
                  </p>
                </div>

                <div className="rounded-2xl border border-chmsu-border bg-white p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <ArrowRightLeft className="h-3.5 w-3.5 text-chmsu-flame" />
                    Inter-Campus Transit
                  </p>
                  <p className="mt-2 text-3xl font-bold text-chmsu-flame tabular-nums">
                    {kpis.interTransitCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Active cross-campus
                  </p>
                </div>
              </div>

              {/* Live Red Delay Alerts Panel */}
              <section className="overflow-hidden rounded-2xl border border-red-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-200 bg-[#FEF2F2] px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="h-5 w-5 text-[#DC2626]" />
                    <div>
                      <h2 className="text-base font-bold text-[#DC2626]">
                        Live Red Delay Alerts
                      </h2>
                      <p className="text-xs text-red-800">
                        Sorted by most overdue first. Click Inspect Trail to
                        identify the exact bottleneck.
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#DC2626] px-3 py-1 text-xs font-bold text-white tabular-nums">
                    {overdueDocuments.length} Overdue
                  </span>
                </div>

                {overdueDocuments.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle2 className="mx-auto h-9 w-9 text-chmsu-green" />
                    <p className="mt-2 text-sm font-bold text-slate-800">
                      All active documents are within SLA
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      No overdue items found for {scopeLabel}.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-red-100">
                    {overdueDocuments.map((doc) => {
                      const overdueDays = getOverdueDays(doc);
                      return (
                        <div
                          key={doc.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-red-50/40"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-[#DC2626]">
                                {doc.tracking_code}
                              </span>
                              <span className="rounded-full bg-[#DC2626] px-2.5 py-0.5 text-[11px] font-bold text-white tabular-nums">
                                Overdue by {formatSlaDays(overdueDays)}
                              </span>
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-700">
                                {doc.priority}
                              </span>
                            </div>
                            <p className="mt-1 font-bold text-slate-900">
                              {doc.title}
                            </p>
                            <p className="text-xs text-slate-600">
                              {campusMap[doc.origin_campus_id]?.name ?? "?"}{" "}
                              &rarr;{" "}
                              <span className="font-semibold text-chmsu-navy">
                                {campusMap[doc.current_campus_id]?.name ?? "?"}
                              </span>{" "}
                              &bull; Held at:{" "}
                              <span className="font-semibold text-red-900">
                                {doc.current_office}
                              </span>{" "}
                              &bull; Due:{" "}
                              <span className="tabular-nums">
                                {formatDateTime(doc.due_at)}
                              </span>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => openInspectModal(doc)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3.5 py-2 text-xs font-bold text-[#DC2626] transition hover:bg-[#DC2626] hover:text-white"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Inspect Trail
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB B: MULTI-CAMPUS BOTTLENECK ANALYTICS & REPORT EXPORTS      */}
          {/* ============================================================== */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <div className="no-print flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    Multi-Campus Bottleneck Analytics &amp; Reports
                  </h1>
                  <p className="text-sm text-slate-600">
                    Analyze document volume, delay rates, and office holding
                    times for {scopeLabel}.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportReportCsv}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-chmsu-forest bg-white px-3.5 py-2 text-xs font-bold text-chmsu-forest transition hover:bg-chmsu-green/10"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-chmsu-green" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-forest px-3.5 py-2 text-xs font-bold text-white transition hover:bg-chmsu-green"
                  >
                    <Printer className="h-4 w-4" />
                    Print / Save PDF Report
                  </button>
                </div>
              </div>

              {/* Date Range Controls */}
              <div className="no-print flex flex-wrap items-center gap-2 rounded-2xl border border-chmsu-border bg-white p-4">
                {[
                  { id: "all", label: "All Time" },
                  { id: "7d", label: "Last 7 Days" },
                  { id: "30d", label: "Last 30 Days" },
                  { id: "90d", label: "Last 90 Days" },
                  { id: "custom", label: "Custom Range" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDatePreset(p.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      datePreset === p.id
                        ? "bg-chmsu-navy text-white"
                        : "border border-chmsu-border bg-chmsu-canvas text-slate-700"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

                {datePreset === "custom" && (
                  <div className="flex flex-wrap items-center gap-2 pl-2">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="rounded-lg border border-chmsu-border px-2.5 py-1 text-xs"
                    />
                    <span className="text-xs text-slate-500">to</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="rounded-lg border border-chmsu-border px-2.5 py-1 text-xs"
                    />
                  </div>
                )}

                <span className="ml-auto text-xs font-semibold text-slate-500 tabular-nums">
                  {reportScopedDocs.length} documents in period
                </span>
              </div>

              {/* 1. Campus Volume & Delay Rate Chart */}
              <section className="rounded-2xl border border-chmsu-border bg-white p-5">
                <h2 className="text-base font-bold text-chmsu-forest">
                  Document Volume &amp; Delay Rate by Campus
                </h2>
                <div className="mt-4 space-y-4">
                  {analyticsByCampus.map((row) => {
                    const widthPct = Math.round(
                      (row.total / maxCampusVolume) * 100
                    );
                    const delayedPctOfBar =
                      row.total === 0
                        ? 0
                        : Math.round((row.delayed / row.total) * 100);
                    return (
                      <div key={row.campus.id} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-900">
                            CHMSU {row.campus.name} ({row.campus.code})
                          </span>
                          <span className="tabular-nums text-slate-600">
                            {row.total} docs &bull;{" "}
                            <span
                              className={
                                row.delayed > 0
                                  ? "font-bold text-[#DC2626]"
                                  : "text-chmsu-green"
                              }
                            >
                              {row.delayed} delayed ({row.delayRate}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="flex h-full overflow-hidden rounded-full bg-chmsu-green transition-all"
                            style={{ width: `${Math.max(widthPct, row.total > 0 ? 4 : 0)}%` }}
                          >
                            <div
                              className="h-full bg-[#DC2626]"
                              style={{ width: `${delayedPctOfBar}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 2. Top Bottleneck Offices Table */}
              <section className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                <div className="border-b border-chmsu-border px-5 py-4">
                  <h2 className="text-base font-bold text-chmsu-forest">
                    Top Bottleneck Offices
                  </h2>
                  <p className="text-xs text-slate-500">
                    Ranked by overdue count and average holding duration.
                  </p>
                </div>

                {bottleneckOffices.length === 0 ? (
                  <p className="p-6 text-center text-sm text-slate-500">
                    No office routing data in this period.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="px-5 py-3">Office</th>
                          <th className="px-4 py-3">Campus</th>
                          <th className="px-4 py-3 text-right">Active</th>
                          <th className="px-4 py-3 text-right">Overdue</th>
                          <th className="px-5 py-3 text-right">
                            Avg. Holding Time
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-chmsu-border">
                        {bottleneckOffices.map((b, i) => (
                          <tr key={`${b.office}-${i}`}>
                            <td className="px-5 py-3 font-semibold text-slate-900">
                              {b.office}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {b.campusName}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                              {b.active}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                  b.overdue > 0
                                    ? "bg-red-100 text-[#DC2626]"
                                    : "bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {b.overdue}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right font-semibold tabular-nums text-chmsu-navy">
                              {formatSlaDays(b.avgHoldingDays)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* 3. Breakdown by Document Type & Status */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-chmsu-border bg-white p-5">
                  <h2 className="text-base font-bold text-chmsu-forest">
                    Breakdown by Document Type
                  </h2>
                  <div className="mt-4 space-y-3">
                    {breakdownByType.length === 0 ? (
                      <p className="text-xs text-slate-500">No data.</p>
                    ) : (
                      breakdownByType.map((item) => {
                        const pct = Math.round(
                          (item.count / Math.max(1, reportScopedDocs.length)) *
                            100
                        );
                        return (
                          <div key={item.type} className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-800">{item.type}</span>
                              <span className="tabular-nums text-slate-600">
                                {item.count} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-chmsu-navy"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-chmsu-border bg-white p-5">
                  <h2 className="text-base font-bold text-chmsu-forest">
                    Breakdown by Status
                  </h2>
                  <div className="mt-4 space-y-3">
                    {breakdownByStatus.length === 0 ? (
                      <p className="text-xs text-slate-500">No data.</p>
                    ) : (
                      breakdownByStatus.map((item) => {
                        const pct = Math.round(
                          (item.count / Math.max(1, reportScopedDocs.length)) *
                            100
                        );
                        const meta = DOCUMENT_STATUS_META[item.status] ?? {
                          label: item.status,
                        };
                        return (
                          <div key={item.status} className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-slate-800">
                                {meta.label}
                              </span>
                              <span className="tabular-nums text-slate-600">
                                {item.count} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${
                                  item.status === "delayed"
                                    ? "bg-[#DC2626]"
                                    : item.status === "completed"
                                      ? "bg-chmsu-green"
                                      : "bg-chmsu-gold"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB: PENDING REGISTRATIONS & ID VERIFICATION (ADMIN ONLY)      */}
          {/* ============================================================== */}
          {activeTab === "registrations" && isAdmin && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    Pending Registrations &amp; ID Verification
                  </h1>
                  <p className="text-sm text-slate-600">
                    Inspect uploaded Front &amp; Back CHMSU School IDs via
                    short-lived private signed URLs before approving or
                    declining accounts.
                  </p>
                </div>

                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900 tabular-nums">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  {pendingRegistrations.length} Pending Review
                </span>
              </div>

              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                {pendingRegistrations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
                    <CheckCircle2 className="h-9 w-9 text-chmsu-green" />
                    <p className="text-sm font-bold text-chmsu-forest">
                      All registrations have been reviewed
                    </p>
                    <p className="text-xs text-slate-500">
                      New School ID registrations will appear here
                      automatically in real time.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="px-5 py-3">School ID</th>
                          <th className="px-4 py-3">Applicant</th>
                          <th className="px-4 py-3">Campus</th>
                          <th className="px-4 py-3">Requested Role</th>
                          <th className="px-4 py-3">Submitted</th>
                          <th className="px-5 py-3 text-left">Verification</th>
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
                                {u.department || "No department specified"}
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-xs font-medium text-slate-700">
                              CHMSU {campusMap[u.campus_id]?.name ?? "Unassigned"}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                                {ROLE_LABELS[u.requested_role ?? "student"] ??
                                  u.requested_role ??
                                  "Student"}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-500 tabular-nums">
                              {formatDateTime(u.created_at)}
                            </td>
                            <td className="px-5 py-3.5 text-left">
                              <button
                                type="button"
                                onClick={() => openReviewModal(u)}
                                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-chmsu-forest px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-chmsu-green"
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

          {/* ============================================================== */}
          {/* TAB C: USER & ROLE PERMISSIONS MANAGEMENT (ADMIN ONLY)         */}
          {/* ============================================================== */}
          {activeTab === "users" && isAdmin && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  User &amp; Role Permissions Management
                </h1>
                <p className="text-sm text-slate-600">
                  Manage CHMSU roles, campus assignments, kiosk visibility, and
                  account status. Every change is logged to{" "}
                  <code className="font-mono">audit_logs</code>.
                </p>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-chmsu-border bg-white p-4 sm:grid-cols-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name, email, department..."
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

              {/* Users Table */}
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
                            <div className="flex flex-wrap gap-1.5">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  u.is_active
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {u.is_active ? "Active" : "Inactive"}
                              </span>
                              {u.show_on_kiosk && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  Kiosk
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-left">
                            <button
                              type="button"
                              onClick={() => openEditUser(u)}
                              className="whitespace-nowrap rounded-lg border border-chmsu-border bg-white px-3 py-1.5 text-xs font-semibold text-chmsu-forest hover:border-chmsu-green hover:bg-chmsu-green/10"
                            >
                              Edit Permissions
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

          {/* ============================================================== */}
          {/* TAB D: IMMUTABLE AUDIT LOGS VIEWER                             */}
          {/* ============================================================== */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    Immutable Audit Logs (RA 10173 Accountability)
                  </h1>
                  <p className="text-sm text-slate-600">
                    Append-only system trail protected by database-level
                    immutability triggers.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleExportAuditCsv}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-chmsu-forest bg-white px-3.5 py-2 text-xs font-bold text-chmsu-forest transition hover:bg-chmsu-green/10"
                >
                  <FileSpreadsheet className="h-4 w-4 text-chmsu-green" />
                  Export Audit Logs CSV
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-chmsu-border bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
                <input
                  type="search"
                  value={auditActionQuery}
                  onChange={(e) => {
                    setAuditActionQuery(e.target.value);
                    setAuditPage(1);
                  }}
                  placeholder="Filter action or actor..."
                  className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-3 py-2 text-xs outline-none focus:border-chmsu-green focus:bg-white lg:col-span-2"
                />

                <select
                  value={auditCampusFilter}
                  onChange={(e) => {
                    setAuditCampusFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="rounded-xl border border-chmsu-border bg-white px-2.5 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Campuses</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={auditRoleFilter}
                  onChange={(e) => {
                    setAuditRoleFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="rounded-xl border border-chmsu-border bg-white px-2.5 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Roles</option>
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>

                <select
                  value={auditEntityFilter}
                  onChange={(e) => {
                    setAuditEntityFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  className="rounded-xl border border-chmsu-border bg-white px-2.5 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Entities</option>
                  <option value="document">document</option>
                  <option value="announcement">announcement</option>
                  <option value="profile">profile</option>
                  <option value="system">system</option>
                </select>

                <div className="flex gap-1.5">
                  <input
                    type="date"
                    value={auditDateFrom}
                    onChange={(e) => {
                      setAuditDateFrom(e.target.value);
                      setAuditPage(1);
                    }}
                    aria-label="From date"
                    className="w-1/2 rounded-xl border border-chmsu-border px-2 py-1.5 text-[11px]"
                  />
                  <input
                    type="date"
                    value={auditDateTo}
                    onChange={(e) => {
                      setAuditDateTo(e.target.value);
                      setAuditPage(1);
                    }}
                    aria-label="To date"
                    className="w-1/2 rounded-xl border border-chmsu-border px-2 py-1.5 text-[11px]"
                  />
                </div>
              </div>

              {/* Audit Table */}
              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                {pagedAuditLogs.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No audit log entries match your filters.
                  </p>
                ) : (
                  <div className="divide-y divide-chmsu-border">
                    {pagedAuditLogs.map((log) => {
                      const isExpanded = expandedAuditId === log.id;
                      return (
                        <div key={log.id} className="px-5 py-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-chmsu-forest">
                                {log.action}
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                {log.entity_type}
                              </span>
                              {log.actor_role && (
                                <span className="rounded-full bg-chmsu-navy/10 px-2 py-0.5 text-[11px] font-semibold text-chmsu-navy">
                                  {log.actor_role}
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
                                  setExpandedAuditId(
                                    isExpanded ? null : log.id
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-chmsu-border px-2 py-1 text-[11px] font-semibold text-slate-600 hover:border-chmsu-green"
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
                            <pre className="mt-2.5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-3 font-mono text-xs text-emerald-300">
                              {JSON.stringify(
                                {
                                  id: log.id,
                                  entity_id: log.entity_id,
                                  metadata: log.metadata,
                                },
                                null,
                                2
                              )}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-chmsu-border bg-chmsu-canvas px-5 py-3 text-xs text-slate-600">
                  <span className="tabular-nums">
                    Showing {pagedAuditLogs.length} of{" "}
                    {filteredAuditLogs.length} logs (Page {safeAuditPage} of{" "}
                    {totalAuditPages})
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={safeAuditPage <= 1}
                      onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-chmsu-border bg-white px-2.5 py-1.5 font-semibold disabled:opacity-50"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={safeAuditPage >= totalAuditPages}
                      onClick={() =>
                        setAuditPage((p) => Math.min(totalAuditPages, p + 1))
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-chmsu-border bg-white px-2.5 py-1.5 font-semibold disabled:opacity-50"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MY PROFILE */}
          {activeTab === "profile" && <UserProfileView profile={profile} />}
        </main>
      </div>

      {/* Inspect Document Custody Trail Modal */}
      {inspectDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Overdue Document Custody Trail"
          className="no-print fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
        >
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-red-200 bg-[#DC2626] px-5 py-4 text-white">
              <div>
                <p className="font-mono text-xs font-bold text-red-100">
                  {inspectDoc.tracking_code}
                </p>
                <h3 className="text-base font-bold">{inspectDoc.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                aria-label="Close panel"
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

              <div>
                <h4 className="text-sm font-bold text-chmsu-forest">
                  Full Custody Timeline
                </h4>
                {loadingRoutes ? (
                  <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading custody trail...
                  </p>
                ) : (
                  <ol className="mt-4 space-y-4 border-l-2 border-red-200 pl-4">
                    {inspectRoutes.map((step) => (
                      <li key={step.id} className="relative text-sm">
                        <span
                          className={`absolute -left-[23px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${
                            step.action === "delay_flagged"
                              ? "bg-[#DC2626]"
                              : "bg-chmsu-forest"
                          }`}
                        />
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
                          <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
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
        </div>
      )}

      {/* Admin View ID Photos & Registration Verification Modal */}
      {reviewUser && isAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Verify School ID Photos"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-chmsu-border bg-chmsu-forest px-5 py-4 text-white">
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
                aria-label="Close ID verification modal"
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Applicant Summary */}
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-chmsu-border bg-chmsu-canvas p-3.5 text-xs sm:grid-cols-3">
                <div>
                  <span className="font-semibold text-slate-500">
                    College / Department
                  </span>
                  <p className="mt-0.5 font-bold text-slate-900">
                    {reviewUser.department || "—"}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">
                    Requested Role
                  </span>
                  <p className="mt-0.5 font-bold text-chmsu-navy">
                    {ROLE_LABELS[reviewUser.requested_role ?? "student"] ??
                      reviewUser.requested_role ??
                      "Student"}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">
                    Submitted At
                  </span>
                  <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">
                    {formatDateTime(reviewUser.created_at)}
                  </p>
                </div>
              </div>

              {/* Front & Back ID Photos Side-by-Side */}
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Uploaded School ID Photos (Click to Zoom)
                  </h4>
                </div>

                {idPhotoError && (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    {idPhotoError}
                  </div>
                )}

                {loadingIdPhotos ? (
                  <div className="mt-3 flex h-48 items-center justify-center gap-2 rounded-xl border border-chmsu-border bg-slate-50 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-chmsu-green" />
                    Generating short-lived signed URLs from private storage...
                  </div>
                ) : (
                  <div className="mt-2.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Front ID */}
                    <div className="overflow-hidden rounded-xl border border-chmsu-border bg-slate-50">
                      <div className="flex items-center justify-between border-b border-chmsu-border bg-white px-3 py-2 text-xs font-bold text-chmsu-forest">
                        <span>Front of School ID</span>
                        {idPhotoUrls.front && (
                          <button
                            type="button"
                            onClick={() =>
                              setZoomedPhoto({
                                label: "Front of School ID",
                                url: idPhotoUrls.front,
                              })
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-chmsu-navy hover:text-chmsu-green"
                          >
                            <ZoomIn className="h-3.5 w-3.5" />
                            Zoom
                          </button>
                        )}
                      </div>
                      {idPhotoUrls.front ? (
                        <button
                          type="button"
                          onClick={() =>
                            setZoomedPhoto({
                              label: "Front of School ID",
                              url: idPhotoUrls.front,
                            })
                          }
                          className="block w-full cursor-zoom-in p-2"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={idPhotoUrls.front}
                            alt="Front of School ID"
                            className="h-56 w-full rounded-lg object-contain bg-white"
                          />
                        </button>
                      ) : (
                        <div className="flex h-56 items-center justify-center text-xs text-slate-400">
                          No front ID image uploaded
                        </div>
                      )}
                    </div>

                    {/* Back ID */}
                    <div className="overflow-hidden rounded-xl border border-chmsu-border bg-slate-50">
                      <div className="flex items-center justify-between border-b border-chmsu-border bg-white px-3 py-2 text-xs font-bold text-chmsu-forest">
                        <span>Back of School ID</span>
                        {idPhotoUrls.back && (
                          <button
                            type="button"
                            onClick={() =>
                              setZoomedPhoto({
                                label: "Back of School ID",
                                url: idPhotoUrls.back,
                              })
                            }
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-chmsu-navy hover:text-chmsu-green"
                          >
                            <ZoomIn className="h-3.5 w-3.5" />
                            Zoom
                          </button>
                        )}
                      </div>
                      {idPhotoUrls.back ? (
                        <button
                          type="button"
                          onClick={() =>
                            setZoomedPhoto({
                              label: "Back of School ID",
                              url: idPhotoUrls.back,
                            })
                          }
                          className="block w-full cursor-zoom-in p-2"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={idPhotoUrls.back}
                            alt="Back of School ID"
                            className="h-56 w-full rounded-lg object-contain bg-white"
                          />
                        </button>
                      ) : (
                        <div className="flex h-56 items-center justify-center text-xs text-slate-400">
                          No back ID image uploaded
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Editable Campus & Assigned Role for Approval */}
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-chmsu-border bg-white p-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-600">
                    Assigned Campus
                  </label>
                  <select
                    value={reviewCampusId}
                    onChange={(e) => setReviewCampusId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900"
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
                    className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] ?? r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Optional Rejection Reason Box */}
              {showRejectBox && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <label
                    htmlFor="rejection-reason"
                    className="block text-xs font-bold uppercase text-red-800"
                  >
                    Reason for Declining Registration
                  </label>
                  <textarea
                    id="rejection-reason"
                    rows={2}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g., ID photo is blurry or School ID does not match the uploaded ID."
                    className="mt-1.5 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-400"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-chmsu-border bg-chmsu-canvas px-5 py-3.5">
              {!showRejectBox ? (
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={() => setShowRejectBox(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Reject...
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submittingReview}
                    onClick={() => setShowRejectBox(false)}
                    className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-600"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submittingReview}
                    onClick={() => handleReviewDecision("reject")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                  >
                    {submittingReview && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    Confirm Reject
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={closeReviewModal}
                  className="rounded-xl border border-chmsu-border bg-white px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={() => handleReviewDecision("approve")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-forest px-4 py-2 text-xs font-bold text-white transition hover:bg-chmsu-green disabled:opacity-60"
                >
                  {submittingReview ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Approve &amp; Activate Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zoomed ID Photo Lightbox */}
      {zoomedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoomedPhoto.label}
          onClick={() => setZoomedPhoto(null)}
          className="no-print fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950/90 p-4"
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
                className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomedPhoto.url}
              alt={zoomedPhoto.label}
              className="max-h-[82dvh] max-w-full rounded-xl bg-white object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Admin Edit User Permissions Modal */}
      {editingUser && editForm && isAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit User Permissions"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-chmsu-border bg-chmsu-forest px-5 py-4 text-white">
              <div>
                <h3 className="text-base font-bold">Edit User Permissions</h3>
                <p className="text-xs text-chmsu-gold">{editingUser.email}</p>
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
                  disabled={editingUser.id === profile.id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, role: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
                {editingUser.id === profile.id && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Self-demotion is blocked to prevent admin lockout.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600">
                  Assigned Campus
                </label>
                <select
                  value={editForm.campus_id}
                  onChange={(e) =>
                    setEditForm({ ...editForm, campus_id: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm"
                >
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      CHMSU {c.name}
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

              <div className="flex flex-wrap gap-4">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
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

                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    disabled={editingUser.id === profile.id}
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
                  className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-forest px-4 py-2 text-xs font-semibold text-white hover:bg-chmsu-green disabled:opacity-60"
                >
                  {savingUser && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
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
