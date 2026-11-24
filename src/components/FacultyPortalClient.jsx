"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  Save,
  Search,
  Loader2,
  MapPin,
  Globe,
  Building2,
  Radio,
  X,
  FilePlus2,
  QrCode,
  Newspaper,
  Megaphone,
  User,
  UserCheck,
  UserCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PrivacyTermsGate from "@/components/PrivacyTermsGate";
import UserProfileView from "@/components/UserProfileView";
import PortalSidebar, {
  SidebarToggleButton,
  usePortalSidebarState,
} from "@/components/PortalSidebar";
import DocumentRegisterPanel from "@/components/DocumentRegisterPanel";
import OfficeScannerClient from "@/components/OfficeScannerClient";
import useUnreadAnnouncements from "@/hooks/useUnreadAnnouncements";
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_PRIORITIES,
  AVAILABILITY_STATUSES,
  CROSS_CAMPUS_ROLES,
  ROLE_LABELS,
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

function toLocalDateTimeInput(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIsoOrNull(localValue) {
  if (!localValue) return null;
  return new Date(localValue).toISOString();
}

const EMPTY_FORM = {
  title: "",
  body: "",
  category: "general",
  priority: "normal",
  event_start_at: "",
  event_end_at: "",
  expires_at: "",
  is_public: true,
  is_pinned: false,
  university_wide: false,
};

export default function FacultyPortalClient({
  profile,
  campus,
  initialTab = "manage",
  initialAnnouncements,
  allCampuses = [],
  staffDirectory = [],
  initialDocuments = [],
}) {
  const router = useRouter();
  const canPublishUniversityWide = CROSS_CAMPUS_ROLES.includes(profile.role);
  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? "Faculty";

  // Unified client-side tab state & sidebar collapse state
  const [activeTab, setActiveTab] = useState(initialTab);
  const [scannerCameraActive, setScannerCameraActive] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { collapsed, mobileOpen, toggleSidebar, closeMobile } =
    usePortalSidebarState();

  function handleSelectTab(nextTab) {
    if (nextTab !== "queue") {
      setScannerCameraActive(false);
    }
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", nextTab);
      window.history.replaceState(null, "", url.toString());
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

  // Availability state
  const [availabilityStatus, setAvailabilityStatus] = useState(
    profile.availability_status ?? "offline"
  );
  const [officeLocation, setOfficeLocation] = useState(
    profile.office_location ?? ""
  );
  const [availabilityNote, setAvailabilityNote] = useState(
    profile.availability_note ?? ""
  );
  const [showOnKiosk, setShowOnKiosk] = useState(Boolean(profile.show_on_kiosk));
  const [savingAvailability, setSavingAvailability] = useState(false);

  // Announcements state
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [mountedAt] = useState(() => Date.now());
  const [newsQuery, setNewsQuery] = useState("");
  const [newsCategory, setNewsCategory] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [busyRowId, setBusyRowId] = useState(null);

  // Feedback banner
  const [feedback, setFeedback] = useState(null);

  function showFeedback(type, message) {
    setFeedback({ type, message });
  }

  async function writeAuditLog(supabase, action, entityType, entityId, metadata = {}) {
    await supabase.from("audit_logs").insert({
      campus_id: campus.id,
      actor_id: profile.id,
      actor_role: profile.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    });
  }

  const refreshAnnouncements = useCallback(
    async (existingClient) => {
      const supabase = existingClient ?? createClient();
      const { data } = await supabase
        .from("announcements")
        .select(
          "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, event_start_at, event_end_at, published_at, expires_at, is_active, created_at, author:author_id(full_name, department, office_location)"
        )
        .or(`campus_id.eq.${campus.id},campus_id.is.null`)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

      if (data) setAnnouncements(data);
    },
    [campus.id]
  );

  // Live Realtime sync for campus announcements across tabs
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`faculty-announcements-${campus.slug}-${profile.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => refreshAnnouncements()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campus.slug, profile.id, refreshAnnouncements]);

  // Update live availability immediately
  async function updateAvailability(overrides = {}) {
    setSavingAvailability(true);
    setFeedback(null);

    const nextStatus = overrides.availability_status ?? availabilityStatus;
    const nextOffice =
      overrides.office_location !== undefined
        ? overrides.office_location
        : officeLocation;
    const nextNote =
      overrides.availability_note !== undefined
        ? overrides.availability_note
        : availabilityNote;
    const nextKiosk =
      overrides.show_on_kiosk !== undefined
        ? overrides.show_on_kiosk
        : showOnKiosk;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          availability_status: nextStatus,
          office_location: nextOffice.trim() || null,
          availability_note: nextNote.trim() || null,
          show_on_kiosk: nextKiosk,
        })
        .eq("id", profile.id);

      if (error) {
        showFeedback("error", error.message);
        return;
      }

      setAvailabilityStatus(nextStatus);
      setOfficeLocation(nextOffice);
      setAvailabilityNote(nextNote);
      setShowOnKiosk(nextKiosk);

      await writeAuditLog(
        supabase,
        "profile.availability_updated",
        "profile",
        profile.id,
        {
          availability_status: nextStatus,
          office_location: nextOffice.trim() || null,
          show_on_kiosk: nextKiosk,
        }
      );

      showFeedback(
        "success",
        `Availability updated to "${getAvailabilityMeta(nextStatus).label}"${nextKiosk ? " — synced live to the campus kiosk." : "."
        }`
      );
    } finally {
      setSavingAvailability(false);
    }
  }

  // Create or Update announcement
  async function handleAnnouncementSubmit(e) {
    e.preventDefault();
    setSavingAnnouncement(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      const targetCampusId =
        canPublishUniversityWide && form.university_wide ? null : campus.id;

      const payload = {
        campus_id: targetCampusId,
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category,
        priority: form.priority,
        event_start_at: toIsoOrNull(form.event_start_at),
        event_end_at: toIsoOrNull(form.event_end_at),
        expires_at: toIsoOrNull(form.expires_at),
        is_public: Boolean(form.is_public),
        is_pinned: Boolean(form.is_pinned),
      };

      if (editingId) {
        const { data, error } = await supabase
          .from("announcements")
          .update(payload)
          .eq("id", editingId)
          .eq("author_id", profile.id)
          .select("id, title, category, priority, is_public, is_pinned")
          .single();

        if (error) {
          showFeedback("error", error.message);
          return;
        }

        await writeAuditLog(
          supabase,
          "announcement.updated",
          "announcement",
          data.id,
          {
            title: data.title,
            category: data.category,
            priority: data.priority,
            university_wide: targetCampusId === null,
          }
        );

        await refreshAnnouncements(supabase);
        setEditingId(null);
        setForm(EMPTY_FORM);
        showFeedback("success", "Announcement updated and synced.");
      } else {
        const { data, error } = await supabase
          .from("announcements")
          .insert({
            ...payload,
            author_id: profile.id,
            is_active: true,
          })
          .select("id, title, category, priority, is_public, is_pinned")
          .single();

        if (error) {
          showFeedback("error", error.message);
          return;
        }

        await writeAuditLog(
          supabase,
          "announcement.created",
          "announcement",
          data.id,
          {
            title: data.title,
            category: data.category,
            priority: data.priority,
            is_public: data.is_public,
            university_wide: targetCampusId === null,
          }
        );

        await refreshAnnouncements(supabase);
        setForm(EMPTY_FORM);
        showFeedback("success", "Announcement published successfully.");
      }
    } finally {
      setSavingAnnouncement(false);
    }
  }

  function startEditing(item) {
    if (item.author_id !== profile.id) return;
    setEditingId(item.id);
    setForm({
      title: item.title ?? "",
      body: item.body ?? "",
      category: item.category ?? "general",
      priority: item.priority ?? "normal",
      event_start_at: toLocalDateTimeInput(item.event_start_at),
      event_end_at: toLocalDateTimeInput(item.event_end_at),
      expires_at: toLocalDateTimeInput(item.expires_at),
      is_public: Boolean(item.is_public),
      is_pinned: Boolean(item.is_pinned),
      university_wide: item.campus_id === null,
    });
    handleSelectTab("manage");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function togglePin(item) {
    if (item.author_id !== profile.id) return;
    setBusyRowId(item.id);
    setFeedback(null);
    try {
      const supabase = createClient();
      const nextPinned = !item.is_pinned;
      const { error } = await supabase
        .from("announcements")
        .update({ is_pinned: nextPinned })
        .eq("id", item.id)
        .eq("author_id", profile.id);

      if (error) {
        showFeedback("error", error.message);
        return;
      }

      await writeAuditLog(
        supabase,
        nextPinned ? "announcement.pinned" : "announcement.unpinned",
        "announcement",
        item.id,
        { title: item.title, is_pinned: nextPinned }
      );

      await refreshAnnouncements(supabase);
      showFeedback(
        "success",
        nextPinned ? "Announcement pinned." : "Announcement unpinned."
      );
    } finally {
      setBusyRowId(null);
    }
  }

  async function toggleActive(item) {
    if (item.author_id !== profile.id) return;
    setBusyRowId(item.id);
    setFeedback(null);
    try {
      const supabase = createClient();
      const nextActive = !item.is_active;
      const { error } = await supabase
        .from("announcements")
        .update({ is_active: nextActive })
        .eq("id", item.id)
        .eq("author_id", profile.id);

      if (error) {
        showFeedback("error", error.message);
        return;
      }

      await writeAuditLog(
        supabase,
        nextActive ? "announcement.activated" : "announcement.deactivated",
        "announcement",
        item.id,
        { title: item.title, is_active: nextActive }
      );

      await refreshAnnouncements(supabase);
      showFeedback(
        "success",
        nextActive ? "Announcement reactivated." : "Announcement deactivated."
      );
    } finally {
      setBusyRowId(null);
    }
  }

  async function deleteAnnouncement(item) {
    if (item.author_id !== profile.id) return;
    const confirmed = window.confirm(
      `Permanently delete "${item.title}"?`
    );
    if (!confirmed) return;

    setBusyRowId(item.id);
    setFeedback(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", item.id)
        .eq("author_id", profile.id);

      if (error) {
        showFeedback("error", error.message);
        return;
      }

      await writeAuditLog(
        supabase,
        "announcement.deleted",
        "announcement",
        item.id,
        { title: item.title, category: item.category }
      );

      if (editingId === item.id) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }

      await refreshAnnouncements(supabase);
      showFeedback("success", "Announcement deleted.");
    } finally {
      setBusyRowId(null);
    }
  }

  // Active announcements visible in the read-only Campus Announcements feed
  const activeFeedAnnouncements = useMemo(() => {
    return announcements.filter(
      (a) =>
        a.is_active &&
        (!a.expires_at || new Date(a.expires_at).getTime() > mountedAt)
    );
  }, [announcements, mountedAt]);

  const filteredFeedAnnouncements = useMemo(() => {
    const q = newsQuery.trim().toLowerCase();
    return activeFeedAnnouncements.filter((a) => {
      const catMatch = newsCategory === "all" || a.category === newsCategory;
      if (!catMatch) return false;
      if (!q) return true;
      return (
        a.title?.toLowerCase().includes(q) ||
        a.body?.toLowerCase().includes(q) ||
        a.author?.full_name?.toLowerCase().includes(q) ||
        a.author?.office_location?.toLowerCase().includes(q)
      );
    });
  }, [activeFeedAnnouncements, newsQuery, newsCategory]);

  // Own announcements ONLY (strictly scoped to currentUser.id)
  const myAnnouncements = useMemo(
    () => announcements.filter((a) => a.author_id === profile.id),
    [announcements, profile.id]
  );

  // Track unseen announcements (excludes own posts, auto-clears when viewing tab)
  const { unreadCount: unreadAnnouncementsCount } = useUnreadAnnouncements({
    userId: profile.id,
    announcements: activeFeedAnnouncements,
    isViewingAnnouncements: activeTab === "announcements",
  });

  const currentStatusMeta = getAvailabilityMeta(availabilityStatus);

  const navItems = [
    {
      id: "send",
      label: "Send / Register Document",
      icon: FilePlus2,
    },
    {
      id: "queue",
      label: "QR Scanner & Office Queue",
      icon: QrCode,
    },
    {
      id: "announcements",
      label: "Campus Announcements",
      icon: Newspaper,
      badge: unreadAnnouncementsCount,
    },
    {
      id: "manage",
      label: "Announcements & Availability",
      icon: Megaphone,
    },
    {
      id: "profile",
      label: "My Profile",
      icon: UserCircle,
    },
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900 lg:flex-row">
      <PrivacyTermsGate profile={profile} />

      <PortalSidebar
        title="SmartCampus CHMSU"
        subtitle={`CHMSU ${campus.name}`}
        navItems={navItems}
        activeId={activeTab}
        onSelect={handleSelectTab}
        profile={profile}
        roleBadge={roleLabel}
        roleIcon={UserCheck}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        collapsed={collapsed}
        onToggleCollapse={toggleSidebar}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
        ariaLabel="Faculty Portal Navigation"
      />

      {/* Main Content Wrapper */}
      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-200 print:pl-0 ${collapsed ? "lg:pl-20" : "lg:pl-64"
          }`}
      >
        {/* Sticky Top Header Bar */}
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarToggleButton onClick={toggleSidebar} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-chmsu-forest">
                  CHMSU {campus.name}
                </span>
                <span className="hidden items-center rounded-full border border-chmsu-forest/15 bg-chmsu-forest/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-forest sm:inline-flex">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-900">
              {profile?.full_name}
            </p>
            <p className="text-xs text-slate-500">{roleLabel}</p>
          </div>
        </header>

        {/* Page Body */}
        <main className="w-full flex-1 space-y-6 px-4 py-5 sm:px-6">
          {/* Feedback Banner */}
          {feedback && (
            <div
              role="status"
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${feedback.type === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
                }`}
            >
              <div className="flex items-center gap-2.5">
                {feedback.type === "error" ? (
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                )}
                <span>{feedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                aria-label="Dismiss message"
                className="rounded-md p-1 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* TAB 0: SEND / REGISTER DOCUMENT */}
          {activeTab === "send" && (
            <DocumentRegisterPanel
              profile={profile}
              campus={campus}
              allCampuses={allCampuses}
              showPageHeader
            />
          )}

          {/* TAB 1: QR SCANNER & OFFICE QUEUE (Kept mounted so queue data stays cached; camera stops on tab switch) */}
          <div className={activeTab === "queue" ? "" : "hidden"}>
            <OfficeScannerClient
              profile={profile}
              campus={campus}
              allCampuses={allCampuses}
              staffDirectory={staffDirectory}
              initialDocuments={initialDocuments}
              controlledCameraActive={scannerCameraActive}
              onCameraActiveChange={setScannerCameraActive}
            />
          </div>

          {/* TAB 3: ANNOUNCEMENTS & AVAILABILITY (Availability + Publish Composer ONLY) */}
          {activeTab === "manage" && (
            <div className="space-y-6">
              {/* Page Heading */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-chmsu-forest">
                    Announcements &amp; Availability
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Manage your real-time kiosk availability and publish campus
                    notices for CHMSU {campus.name}.
                  </p>
                </div>

                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold ${currentStatusMeta.badgeClass}`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${currentStatusMeta.dotClass}`}
                  />
                  Status: {currentStatusMeta.label}
                </span>
              </div>

              {/* Side-by-Side Grid: Live Availability Card + Announcement Composer */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                {/* 1. Live Availability Control Card */}
                <section className="rounded-2xl border border-chmsu-border bg-white p-5 xl:col-span-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-chmsu-forest">
                        <Radio className="h-5 w-5 text-chmsu-green" />
                        Live Availability Control
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        One-click status updates sync immediately to the campus kiosk.
                      </p>
                    </div>
                  </div>

                  {/* One-Click Status Buttons */}
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
                    {AVAILABILITY_STATUSES.map((st) => {
                      const isSelected = availabilityStatus === st.value;
                      return (
                        <button
                          key={st.value}
                          type="button"
                          disabled={savingAvailability}
                          onClick={() =>
                            updateAvailability({ availability_status: st.value })
                          }
                          className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${isSelected
                              ? "border-chmsu-forest bg-chmsu-forest text-white shadow-xs"
                              : "border-chmsu-border bg-chmsu-canvas text-slate-700 hover:border-chmsu-green hover:bg-white"
                            }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${isSelected ? "bg-chmsu-gold" : st.dotClass
                              }`}
                          />
                          <span>{st.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Office Location & Availability Note */}
                  <div className="mt-5 space-y-3.5 border-t border-chmsu-border pt-4">
                    <div>
                      <label
                        htmlFor="office_location"
                        className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                      >
                        Office / Room Location
                      </label>
                      <div className="relative mt-1">
                        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          id="office_location"
                          type="text"
                          value={officeLocation}
                          onChange={(e) => setOfficeLocation(e.target.value)}
                          placeholder="e.g., CCS Faculty Room 204"
                          className="w-full rounded-xl border border-chmsu-border bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="availability_note"
                        className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                      >
                        Public Availability Note (Max 200 chars)
                      </label>
                      <input
                        id="availability_note"
                        type="text"
                        maxLength={200}
                        value={availabilityNote}
                        onChange={(e) => setAvailabilityNote(e.target.value)}
                        placeholder="e.g., Consultation hours 1:00 PM – 4:00 PM"
                        className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                      />
                    </div>

                    {/* Show on Kiosk Toggle */}
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-chmsu-border bg-chmsu-canvas px-3.5 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          Show on Public Kiosk
                        </p>
                        <p className="text-xs text-slate-500">
                          Displays only your name, office, and live status (no email/PII).
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={showOnKiosk}
                        disabled={savingAvailability}
                        onChange={(e) =>
                          updateAvailability({ show_on_kiosk: e.target.checked })
                        }
                        className="h-5 w-5 rounded border-slate-300 accent-chmsu-green"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={savingAvailability}
                      onClick={() => updateAvailability()}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-chmsu-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-chmsu-forest disabled:opacity-60"
                    >
                      {savingAvailability ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save Office &amp; Note
                    </button>
                  </div>
                </section>

                {/* 2. Announcement Composer */}
                <section className="rounded-2xl border border-chmsu-border bg-white p-5 xl:col-span-7">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-chmsu-forest">
                        <Plus className="h-5 w-5 text-chmsu-green" />
                        {editingId ? "Edit Announcement" : "Announcement Composer"}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Publish notices, calendar events, or advisories for CHMSU{" "}
                        {campus.name}.
                      </p>
                    </div>
                    {editingId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setForm(EMPTY_FORM);
                        }}
                        className="rounded-lg border border-chmsu-border px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleAnnouncementSubmit} className="mt-4 space-y-4">
                    <div>
                      <label
                        htmlFor="ann_title"
                        className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                      >
                        Title *
                      </label>
                      <input
                        id="ann_title"
                        type="text"
                        required
                        minLength={3}
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="e.g., Midterm Examination Schedule — 1st Semester"
                        className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="ann_body"
                        className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                      >
                        Message Body *
                      </label>
                      <textarea
                        id="ann_body"
                        required
                        minLength={3}
                        rows={4}
                        value={form.body}
                        onChange={(e) => setForm({ ...form, body: e.target.value })}
                        placeholder="Write clear, concise details for students and visitors..."
                        className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="ann_category"
                          className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                        >
                          Category
                        </label>
                        <select
                          id="ann_category"
                          value={form.category}
                          onChange={(e) =>
                            setForm({ ...form, category: e.target.value })
                          }
                          className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
                        >
                          {ANNOUNCEMENT_CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="ann_priority"
                          className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                        >
                          Priority
                        </label>
                        <select
                          id="ann_priority"
                          value={form.priority}
                          onChange={(e) =>
                            setForm({ ...form, priority: e.target.value })
                          }
                          className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
                        >
                          {ANNOUNCEMENT_PRIORITIES.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label
                          htmlFor="event_start"
                          className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                        >
                          Event Start
                        </label>
                        <input
                          id="event_start"
                          type="datetime-local"
                          value={form.event_start_at}
                          onChange={(e) =>
                            setForm({ ...form, event_start_at: e.target.value })
                          }
                          className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-chmsu-green"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="event_end"
                          className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                        >
                          Event End
                        </label>
                        <input
                          id="event_end"
                          type="datetime-local"
                          value={form.event_end_at}
                          onChange={(e) =>
                            setForm({ ...form, event_end_at: e.target.value })
                          }
                          className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-chmsu-green"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="expires_at"
                          className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                        >
                          Expires At
                        </label>
                        <input
                          id="expires_at"
                          type="datetime-local"
                          value={form.expires_at}
                          onChange={(e) =>
                            setForm({ ...form, expires_at: e.target.value })
                          }
                          className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-2.5 py-2 text-xs text-slate-900 outline-none focus:border-chmsu-green"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-4 pt-1">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={form.is_public}
                          onChange={(e) =>
                            setForm({ ...form, is_public: e.target.checked })
                          }
                          className="h-4 w-4 rounded accent-chmsu-green"
                        />
                        Public (Show on Kiosk)
                      </label>

                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={form.is_pinned}
                          onChange={(e) =>
                            setForm({ ...form, is_pinned: e.target.checked })
                          }
                          className="h-4 w-4 rounded accent-chmsu-green"
                        />
                        Pin Notice
                      </label>

                      {canPublishUniversityWide && (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-chmsu-navy">
                          <input
                            type="checkbox"
                            checked={form.university_wide}
                            onChange={(e) =>
                              setForm({ ...form, university_wide: e.target.checked })
                            }
                            className="h-4 w-4 rounded accent-chmsu-navy"
                          />
                          University-Wide (All 4 Campuses)
                        </label>
                      )}
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={savingAnnouncement}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-chmsu-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:opacity-60"
                      >
                        {savingAnnouncement ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {editingId ? "Update Announcement" : "Publish Announcement"}
                      </button>
                    </div>
                  </form>
                </section>
              </div>

              {/* My Published Announcements (Own Posts ONLY) */}
              <section className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-chmsu-border px-5 py-4">
                  <div>
                    <h2 className="text-lg font-bold text-chmsu-forest">
                      My Published Announcements
                    </h2>
                    <p className="text-xs text-slate-500">
                      View, edit, pin, toggle visibility, or delete
                      announcements you have published.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 tabular-nums">
                    {myAnnouncements.length} published
                  </span>
                </div>

                {myAnnouncements.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    You have not published any announcements yet. Use the
                    composer above to create your first notice.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="px-5 py-3">Announcement</th>
                          <th className="px-4 py-3">Scope</th>
                          <th className="px-4 py-3">Category / Priority</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-5 py-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-chmsu-border">
                        {myAnnouncements.map((item) => {
                          const priorityMeta =
                            ANNOUNCEMENT_PRIORITIES.find(
                              (p) => p.value === item.priority
                            ) ?? ANNOUNCEMENT_PRIORITIES[0];
                          const isBusy = busyRowId === item.id;

                          return (
                            <tr
                              key={item.id}
                              className={`transition hover:bg-slate-50/70 ${!item.is_active ? "opacity-60" : ""
                                }`}
                            >
                              <td className="px-5 py-3.5 align-top">
                                <div className="flex items-center gap-2">
                                  {item.is_pinned && (
                                    <Pin className="h-3.5 w-3.5 shrink-0 text-chmsu-flame" />
                                  )}
                                  <p className="font-semibold text-slate-900">
                                    {item.title}
                                  </p>
                                </div>
                                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">
                                  {item.body}
                                </p>
                              </td>

                              <td className="px-4 py-3.5 align-top">
                                {item.campus_id === null ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-chmsu-navy/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-navy">
                                    <Globe className="h-3 w-3" />
                                    University-Wide
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-chmsu-green/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-forest">
                                    <Building2 className="h-3 w-3" />
                                    {campus.name}
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-3.5 align-top">
                                <div className="flex flex-wrap gap-1.5">
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">
                                    {item.category}
                                  </span>
                                  <span
                                    className={`rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${priorityMeta.badgeClass}`}
                                  >
                                    {item.priority}
                                  </span>
                                </div>
                              </td>

                              <td className="px-4 py-3.5 align-top">
                                <div className="flex flex-wrap gap-1.5">
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.is_active
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-slate-200 text-slate-600"
                                      }`}
                                  >
                                    {item.is_active ? "Active" : "Inactive"}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                    {item.is_public ? "Public" : "Internal"}
                                  </span>
                                </div>
                              </td>

                              <td className="px-5 py-3.5 text-left align-top">
                                <div className="inline-flex items-center justify-start gap-1">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => startEditing(item)}
                                    title="Edit announcement"
                                    className="rounded-lg border border-chmsu-border p-1.5 text-slate-600 hover:border-chmsu-green hover:text-chmsu-forest disabled:opacity-50"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => togglePin(item)}
                                    title={item.is_pinned ? "Unpin" : "Pin"}
                                    className="rounded-lg border border-chmsu-border p-1.5 text-slate-600 hover:border-chmsu-gold hover:text-chmsu-flame disabled:opacity-50"
                                  >
                                    {item.is_pinned ? (
                                      <PinOff className="h-4 w-4" />
                                    ) : (
                                      <Pin className="h-4 w-4" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => toggleActive(item)}
                                    title={
                                      item.is_active
                                        ? "Deactivate"
                                        : "Reactivate"
                                    }
                                    className="rounded-lg border border-chmsu-border p-1.5 text-slate-600 hover:border-chmsu-navy hover:text-chmsu-navy disabled:opacity-50"
                                  >
                                    {item.is_active ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => deleteAnnouncement(item)}
                                    title="Delete announcement"
                                    className="rounded-lg border border-chmsu-border p-1.5 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 2: READ-ONLY FULL-DETAIL CAMPUS ANNOUNCEMENTS FEED */}
          {activeTab === "announcements" && (
            <section className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-chmsu-forest">
                  Campus Announcements
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
                      aria-label="Clear announcement search"
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

              {/* Full-Detail Announcement Cards */}
              {filteredFeedAnnouncements.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-chmsu-border bg-white p-8 text-center">
                  <Newspaper className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    No announcements match your filter
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Official updates for CHMSU {campus.name} and university-wide
                    notices appear here in real time.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredFeedAnnouncements.map((item) => {
                    const authorLabel = [
                      item.author?.full_name,
                      item.author?.office_location || item.author?.department,
                    ]
                      .filter(Boolean)
                      .join(" • ");

                    return (
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
                                CHMSU {campus.name}
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
                            {item.priority === "high" && (
                              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-900">
                                High Priority
                              </span>
                            )}
                          </div>

                          <span className="flex items-center gap-1 text-xs text-slate-500 tabular-nums">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDateTime(item.published_at || item.created_at)}
                          </span>
                        </div>

                        <h2 className="mt-2.5 text-base font-bold text-slate-900 sm:text-lg">
                          {item.title}
                        </h2>
                        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                          {item.body}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {item.event_start_at && (
                            <div className="inline-flex items-center gap-2 rounded-lg border border-chmsu-border bg-chmsu-canvas px-3 py-1.5 text-xs font-semibold text-chmsu-navy">
                              <Calendar className="h-3.5 w-3.5 text-chmsu-green" />
                              <span>
                                {formatDateTime(item.event_start_at)}
                                {item.event_end_at
                                  ? ` – ${formatDateTime(item.event_end_at)}`
                                  : ""}
                              </span>
                            </div>
                          )}

                          {authorLabel && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              {authorLabel}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* TAB 4: MY PROFILE */}
          {activeTab === "profile" && (
            <UserProfileView profile={profile} campus={campus} />
          )}
        </main>
      </div>
    </div>
  );
}
