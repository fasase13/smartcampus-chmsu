"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  Eye,
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
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_PRIORITIES,
  CAMPUS_ADMIN_ASSIGNABLE_ROLES,
  ROLE_LABELS,
  ROLES,
  getCampusAdminTitle,
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

const CAMPUS_ROLE_SPECS = [
  { role: ROLES.STUDENT, label: "Students", shortLabel: "Students", color: "#143D29" },
  { role: ROLES.FACULTY, label: "Faculty", shortLabel: "Faculty", color: "#2563EB" },
  { role: ROLES.STAFF, label: "Staff", shortLabel: "Staff", color: "#F59E0B" },
  {
    role: ROLES.RMO,
    label: "Records Management Officers (RMO)",
    shortLabel: "RMO",
    color: "#EF4444",
  },
  {
    role: ROLES.MANAGEMENT,
    label: "Institutional Management",
    shortLabel: "Management",
    color: "#7C3AED",
  },
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
  initialTab = "dashboard",
  initialUsers,
  initialAnnouncements,
  initialAuditLogs = [],
}) {
  const router = useRouter();
  const campusAdminTitle = getCampusAdminTitle(campus.slug, campus.name);
  const campusMap = useMemo(() => ({ [campus.id]: campus }), [campus]);

  const normalizedInitialTab =
    initialTab === "documents" || initialTab === "alerts"
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

  // Dashboard donut hover state
  const [hoveredRole, setHoveredRole] = useState(null);

  // Pending review modal target
  const [reviewUser, setReviewUser] = useState(null);

  // Campus announcements form
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState(EMPTY_ANNOUNCEMENT);
  const [announcementAttachmentFile, setAnnouncementAttachmentFile] =
    useState(null);
  const [existingAnnouncementAttachment, setExistingAnnouncementAttachment] =
    useState(null);
  const [removedAnnouncementAttachmentPath, setRemovedAnnouncementAttachmentPath] =
    useState(null);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  // Campus users directory & read-only details modal
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userStatusFilter, setUserStatusFilter] = useState("all"); // all | active | inactive
  const [selectedUser, setSelectedUser] = useState(null);
  const [togglingUserStatus, setTogglingUserStatus] = useState(false);

  // Campus Reports (System Logs only) filters
  const [reportSearch, setReportSearch] = useState("");
  const [reportCategoryFilter, setReportCategoryFilter] = useState("all");

  const refreshUsers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, campus_id, email, full_name, avatar_url, role, requested_role, employee_or_student_id, approval_status, profile_completed, id_front_path, id_back_path, rejection_reason, department, program_or_course, job_title, office_location, is_teaching, show_on_kiosk, is_active, created_at"
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
        "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, published_at, is_active, created_at, attachment_url, attachment_path, attachment_name, attachment_type, attachment_size"
      )
      .eq("campus_id", campus.id)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(150);
    if (data) setAnnouncements(data);
  }, [campus.id]);

  const refreshAuditLogs = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("audit_logs")
      .select(
        "id, campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata, created_at, actor:actor_id(full_name, email, role, campus_id)"
      )
      .eq("campus_id", campus.id)
      .order("created_at", { ascending: false })
      .limit(400);
    if (data) setAuditLogs(data);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    campus.id,
    campus.slug,
    profile.id,
    refreshAnnouncements,
    refreshUsers,
  ]);

  const pendingRegistrations = useMemo(() => {
    return users.filter(
      (u) => u.approval_status === "pending" && u.profile_completed === true
    );
  }, [users]);

  const campusKpis = useMemo(() => {
    const totalUsers = users.length;
    const activeAccounts = users.filter(
      (u) => u.is_active && u.approval_status === "approved"
    ).length;
    const pendingCount = pendingRegistrations.length;
    const inactiveAccounts = users.filter((u) => !u.is_active).length;
    const activeAnnouncements = announcements.filter(
      (a) => a.is_active !== false
    ).length;

    return {
      totalUsers,
      activeAccounts,
      pendingCount,
      inactiveAccounts,
      activeAnnouncements,
    };
  }, [announcements, pendingRegistrations.length, users]);

  const roleDonutData = useMemo(() => {
    const counts = CAMPUS_ROLE_SPECS.map((spec) => ({
      ...spec,
      count: users.filter((u) => u.role === spec.role).length,
    }));
    const total = counts.reduce((sum, item) => sum + item.count, 0);
    const segments = [];
    let cumulativeAngle = 0;

    for (let idx = 0; idx < counts.length; idx += 1) {
      const item = counts[idx];
      const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
      const sweepAngle = total > 0 ? (item.count / total) * 360 : 0;
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + sweepAngle;
      cumulativeAngle = endAngle;

      segments.push({
        ...item,
        pct,
        startAngle,
        endAngle,
        sweepAngle,
      });
    }

    const nonZeroCount = segments.filter((s) => s.count > 0).length;
    return { total, segments, nonZeroCount };
  }, [users]);

  const activeDonutSegment = useMemo(
    () =>
      hoveredRole
        ? roleDonutData.segments.find((seg) => seg.role === hoveredRole) ?? null
        : null,
    [hoveredRole, roleDonutData.segments]
  );

  const directoryUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (userRoleFilter !== "all" && u.role !== userRoleFilter) return false;
      if (
        userStatusFilter === "active" &&
        !(u.is_active && u.approval_status === "approved")
      ) {
        return false;
      }
      if (userStatusFilter === "inactive" && u.is_active) {
        return false;
      }
      if (!q) return true;
      return (
        u.full_name?.toLowerCase().includes(q) ||
        u.employee_or_student_id?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    });
  }, [userRoleFilter, userSearch, userStatusFilter, users]);

  // Campus Reports: strictly non-document logs for this campus's own actors (no superadmin or other campus admins)
  const campusSystemLogs = useMemo(
    () =>
      auditLogs.filter((log) => {
        if (log.campus_id !== campus.id) return false;
        if (isDocumentLog(log)) return false;
        const metaRole = String(log.metadata?.role ?? "").toLowerCase();
        const actorRole = String(
          log.actor?.role ?? log.actor_role ?? ""
        ).toLowerCase();
        if (
          actorRole === ROLES.SUPERADMIN ||
          metaRole === ROLES.SUPERADMIN ||
          String(log.actor_role ?? "").toLowerCase() === ROLES.SUPERADMIN
        ) {
          return false;
        }
        if (!log.actor || log.actor.campus_id !== campus.id) return false;
        return true;
      }),
    [auditLogs, campus.id]
  );

  const reportCategoryOptions = useMemo(() => {
    const seen = new Set();
    const list = [];
    campusSystemLogs.forEach((log) => {
      const cat = getAuditLogCategory(log);
      if (!seen.has(cat.label)) {
        seen.add(cat.label);
        list.push(cat.label);
      }
    });
    return list.sort((a, b) => a.localeCompare(b));
  }, [campusSystemLogs]);

  const filteredCampusLogs = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    return campusSystemLogs.filter((log) => {
      const category = getAuditLogCategory(log);
      if (
        reportCategoryFilter !== "all" &&
        category.label !== reportCategoryFilter
      ) {
        return false;
      }
      if (!q) return true;
      const actorName = String(
        log.actor?.full_name || log.metadata?.full_name || ""
      ).toLowerCase();
      const actorEmail = String(
        log.actor?.email || log.metadata?.email || ""
      ).toLowerCase();
      const actionLabel = formatAuditActionLabel(log.action).toLowerCase();
      const detailSummary = formatAuditDetailSummary(log, {
        roleLabels: ROLE_LABELS,
        campusMap,
      }).toLowerCase();
      return (
        actorName.includes(q) ||
        actorEmail.includes(q) ||
        category.label.toLowerCase().includes(q) ||
        actionLabel.includes(q) ||
        detailSummary.includes(q) ||
        String(log.action ?? "").toLowerCase().includes(q)
      );
    });
  }, [campusMap, campusSystemLogs, reportCategoryFilter, reportSearch]);

  // Interactive navigation helpers
  function openUsersFiltered({ role = "all", status = "all" } = {}) {
    setUserSearch("");
    setUserRoleFilter(role);
    setUserStatusFilter(status);
    setActiveTab("users");
  }

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

  function resetAnnouncementComposer() {
    setAnnouncementForm(EMPTY_ANNOUNCEMENT);
    setAnnouncementAttachmentFile(null);
    setExistingAnnouncementAttachment(null);
    setRemovedAnnouncementAttachmentPath(null);
    setIsComposerOpen(false);
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
          .eq("id", announcementForm.id)
          .eq("campus_id", campus.id));
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

      const wasEditing = Boolean(announcementForm.id);
      resetAnnouncementComposer();
      await refreshAnnouncements();
      setFeedback({
        type: "success",
        message: wasEditing
          ? "Campus announcement updated."
          : `Announcement published for CHMSU ${campus.name}.`,
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
    if (item.attachment_path) {
      await deleteAnnouncementAttachment(supabase, item.attachment_path);
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

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      try {
        await supabase.rpc("log_auth_activity", {
          p_event: "sign_out",
          p_portal: "campus_admin",
        });
      } catch {
        // Best-effort auth activity logging
      }
      await supabase.auth.signOut();
      router.push("/campus-admin");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const navTabs = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "users", label: "Campus Users", icon: Users },
    {
      id: "registrations",
      label: "Campus Registrations",
      icon: UserCheck,
      badge: pendingRegistrations.length,
    },
    { id: "announcements", label: "Campus Announcements", icon: Megaphone },
    { id: "reports", label: "Campus Reports", icon: Activity },
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
                  else setActiveTab("reports");
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

          {/* TAB 1: CAMPUS DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Dashboard &mdash; {campus.name}
                </h1>
                <p className="text-sm text-slate-600">
                  Campus user accounts, registration queue, announcements, and
                  account overview for {campus.name}.
                </p>
              </div>

              {/* 5 Interactive KPI Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  {
                    label: "Total Users",
                    value: campusKpis.totalUsers,
                    icon: Users,
                    iconWrapClass: "bg-[#143D29]/10 text-[#143D29]",
                    valueClass: "text-chmsu-forest",
                    onClick: () =>
                      openUsersFiltered({ role: "all", status: "all" }),
                  },
                  {
                    label: "Active Accounts",
                    value: campusKpis.activeAccounts,
                    icon: UserCheck,
                    iconWrapClass: "bg-emerald-50 text-emerald-700",
                    valueClass: "text-emerald-700",
                    onClick: () =>
                      openUsersFiltered({ role: "all", status: "active" }),
                  },
                  {
                    label: "Pending Registrations",
                    value: campusKpis.pendingCount,
                    icon: Clock,
                    iconWrapClass: "bg-amber-50 text-amber-700",
                    valueClass:
                      campusKpis.pendingCount > 0
                        ? "text-amber-700"
                        : "text-chmsu-forest",
                    onClick: () => setActiveTab("registrations"),
                  },
                  {
                    label: "Inactive Accounts",
                    value: campusKpis.inactiveAccounts,
                    icon: UserX,
                    iconWrapClass:
                      campusKpis.inactiveAccounts > 0
                        ? "bg-rose-50 text-rose-700"
                        : "bg-slate-100 text-slate-600",
                    valueClass:
                      campusKpis.inactiveAccounts > 0
                        ? "text-rose-700"
                        : "text-slate-700",
                    onClick: () =>
                      openUsersFiltered({ role: "all", status: "inactive" }),
                  },
                  {
                    label: "Announcements",
                    value: campusKpis.activeAnnouncements,
                    icon: Megaphone,
                    iconWrapClass: "bg-blue-50 text-blue-700",
                    valueClass: "text-chmsu-forest",
                    onClick: () => setActiveTab("announcements"),
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

              {/* 2-Column Interactive Analytics Row */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <section className="flex flex-col justify-between rounded-2xl border border-chmsu-border bg-white p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-chmsu-forest">
                      Campus Role Distribution
                    </h2>
                    <span className="text-[11px] font-medium text-slate-500">
                      Click a slice to view users
                    </span>
                  </div>

                  <div className="mt-4 flex flex-col items-center justify-center">
                    <div className="relative h-[200px] w-[200px]">
                      <svg
                        viewBox="0 0 200 200"
                        className="h-full w-full overflow-visible"
                        role="img"
                        aria-label="Campus Role Distribution Donut Chart"
                      >
                        {roleDonutData.total === 0 ? (
                          <circle
                            cx="100"
                            cy="100"
                            r="72"
                            fill="none"
                            stroke="#E2E8F0"
                            strokeWidth="28"
                          />
                        ) : roleDonutData.nonZeroCount === 1 ? (
                          roleDonutData.segments
                            .filter((seg) => seg.count > 0)
                            .map((seg) => {
                              const isHighlighted =
                                !hoveredRole || hoveredRole === seg.role;
                              const isEmphasized = hoveredRole === seg.role;
                              return (
                                <circle
                                  key={seg.role}
                                  cx="100"
                                  cy="100"
                                  r="72"
                                  fill="none"
                                  stroke={seg.color}
                                  strokeWidth="28"
                                  onClick={() =>
                                    openUsersFiltered({
                                      role: seg.role,
                                      status: "all",
                                    })
                                  }
                                  onMouseEnter={() => setHoveredRole(seg.role)}
                                  onMouseLeave={() => setHoveredRole(null)}
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
                          roleDonutData.segments
                            .filter((seg) => seg.count > 0)
                            .map((seg) => {
                              const isHighlighted =
                                !hoveredRole || hoveredRole === seg.role;
                              const isEmphasized = hoveredRole === seg.role;
                              return (
                                <path
                                  key={seg.role}
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
                                    openUsersFiltered({
                                      role: seg.role,
                                      status: "all",
                                    })
                                  }
                                  onMouseEnter={() => setHoveredRole(seg.role)}
                                  onMouseLeave={() => setHoveredRole(null)}
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
                          {roleDonutData.total === 0
                            ? 0
                            : activeDonutSegment
                              ? `${activeDonutSegment.pct}%`
                              : roleDonutData.total}
                        </span>
                        <span className="mt-1.5 text-xs font-medium leading-tight text-slate-500">
                          {roleDonutData.total === 0
                            ? "Campus Users"
                            : activeDonutSegment
                              ? `${activeDonutSegment.shortLabel} • ${activeDonutSegment.count} users`
                              : "Campus Users"}
                        </span>
                      </div>
                    </div>

                    {/* Compact 2-Column Clickable Legend */}
                    <div className="mt-5 grid w-full max-w-md grid-cols-2 gap-x-4 gap-y-2">
                      {roleDonutData.segments.map((seg) => {
                        const isDimmed =
                          Boolean(hoveredRole) && hoveredRole !== seg.role;
                        return (
                          <button
                            key={seg.role}
                            type="button"
                            onClick={() =>
                              openUsersFiltered({
                                role: seg.role,
                                status: "all",
                              })
                            }
                            onMouseEnter={() => setHoveredRole(seg.role)}
                            onMouseLeave={() => setHoveredRole(null)}
                            onFocus={() => setHoveredRole(seg.role)}
                            onBlur={() => setHoveredRole(null)}
                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border border-transparent px-2.5 py-1.5 text-left text-xs transition hover:bg-slate-50 ${
                              isDimmed ? "opacity-50" : "opacity-100"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: seg.color }}
                              />
                              <span className="truncate font-medium text-slate-700">
                                {seg.shortLabel}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-500">
                              {seg.count} ({seg.pct}%)
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
                    {roleDonutData.segments.map((entry) => (
                      <button
                        key={entry.role}
                        type="button"
                        onClick={() =>
                          openUsersFiltered({
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
                              {entry.pct}%
                            </span>
                            <span className="rounded-md border border-chmsu-border bg-chmsu-canvas px-2.5 py-0.5 font-bold text-chmsu-forest tabular-nums group-hover:border-chmsu-green/40 group-hover:bg-white">
                              {entry.count}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-md bg-slate-100">
                          <div
                            className="h-full rounded-md bg-chmsu-green transition-all duration-300"
                            style={{ width: `${entry.pct}%` }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* TAB 3: CAMPUS REGISTRATIONS */}
          {activeTab === "registrations" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Campus Registrations &mdash; CHMSU {campus.name}
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
                              <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-chmsu-forest">
                    Campus Announcements &mdash; CHMSU {campus.name}
                  </h1>
                  <p className="text-sm text-slate-600">
                    Create, edit, pin, and delete announcements scoped to CHMSU{" "}
                    {campus.name}.
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
                      ? "Edit Campus Announcement"
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

                <AnnouncementAttachmentPicker
                  inputId="campus_admin_ann_attachment"
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
                        ? "Save Changes"
                        : "Publish Announcement"}
                    </button>
                  </div>
                </div>
              </form>
              )}

              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-700">
                  Published Announcements ({announcements.length})
                </h2>
              </div>

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

          {/* TAB 2: CAMPUS USERS */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Campus Users &mdash; CHMSU {campus.name}
                </h1>
                <p className="text-sm text-slate-600">
                  View campus user details and manage account activation status
                  for your campus.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-chmsu-border bg-white p-4 sm:grid-cols-4">
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
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Accounts</option>
                  <option value="inactive">Inactive Accounts</option>
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
                          <td className="px-4 py-3 text-left">
                            <span className="text-xs font-semibold text-slate-700">
                              {ROLE_LABELS[u.role] ?? u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${u.is_active
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

          {/* TAB 5: CAMPUS REPORTS (SYSTEM LOGS ONLY — ZERO DOCUMENT LOGS) */}
          {activeTab === "reports" && (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-chmsu-forest">
                  Campus Reports &mdash; {campus.name}
                </h1>
                <p className="text-sm text-slate-600">
                  Immutable authentication, user management, registration,
                  privacy, and announcement activity logs for {campus.name}.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-chmsu-border bg-white p-4 sm:grid-cols-3">
                <div className="relative sm:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    placeholder="Search by name, email, category, or action..."
                    className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2 pl-9 pr-3 text-sm outline-none focus:border-chmsu-green focus:bg-white"
                  />
                </div>
                <select
                  value={reportCategoryFilter}
                  onChange={(e) => setReportCategoryFilter(e.target.value)}
                  className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  <option value="all">All Categories</option>
                  {reportCategoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                {filteredCampusLogs.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    No campus system activity logs match your filters.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="whitespace-nowrap px-5 py-3 text-left">
                            Timestamp
                          </th>
                          <th className="px-4 py-3 text-left">
                            Actor / User
                          </th>
                          <th className="px-4 py-3 text-left">
                            Log Category
                          </th>
                          <th className="px-5 py-3 text-left">
                            Action Performed
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-chmsu-border">
                        {filteredCampusLogs.slice(0, 150).map((log) => {
                          const category = getAuditLogCategory(log);
                          const actionLabel = formatAuditActionLabel(log.action);
                          const detailSummary = formatAuditDetailSummary(log, {
                            roleLabels: ROLE_LABELS,
                            campusMap,
                          });
                          const actorName =
                            log.actor?.full_name ||
                            log.metadata?.full_name ||
                            ROLE_LABELS[log.actor_role] ||
                            "System";
                          const actorEmail =
                            log.actor?.email || log.metadata?.email || "—";

                          return (
                            <tr
                              key={log.id}
                              className="transition hover:bg-chmsu-canvas/50"
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
                              <td className="whitespace-nowrap px-4 py-3.5 text-left align-top text-sm font-medium text-slate-700">
                                {category.label}
                              </td>
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

      {/* Read-Only User Details Modal (Profile Picture, School ID Photos & Activation Toggle) */}
      {selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          campusLabel={`CHMSU ${campus.name}`}
          cannotDeactivateReason={
            selectedUser.id === profile.id
              ? "You cannot deactivate your own account."
              : [ROLES.SUPERADMIN, ROLES.CAMPUS_ADMIN].includes(
                    selectedUser.role
                  )
                ? "Admin accounts cannot be deactivated here."
                : ""
          }
          togglingStatus={togglingUserStatus}
          onToggleActive={handleToggleUserActive}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
