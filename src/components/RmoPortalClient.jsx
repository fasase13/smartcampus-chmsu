"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Download,
  FilePlus2,
  FileText,
  Loader2,
  Megaphone,
  Paperclip,
  QrCode,
  Search,
  UserCheck,
  UserCircle,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DOCUMENT_PRIORITIES,
  DOCUMENT_STATUS_META,
  ROLE_LABELS,
  ROUTE_ACTION_LABELS,
  STORAGE_BUCKETS,
} from "@/lib/constants";
import PrivacyTermsGate from "@/components/PrivacyTermsGate";
import PortalSidebar, {
  SidebarToggleButton,
  usePortalSidebarState,
} from "@/components/PortalSidebar";
import DocumentRegisterPanel from "@/components/DocumentRegisterPanel";
import OfficeScannerClient from "@/components/OfficeScannerClient";
import AnnouncementsAvailabilityPanel from "@/components/AnnouncementsAvailabilityPanel";
import UserProfileView from "@/components/UserProfileView";
import QrSlipModal from "@/components/QrSlipModal";

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

export default function RmoPortalClient({
  profile,
  campus,
  initialTab = "intake",
  allCampuses,
  staffDirectory,
  initialDocuments,
  initialAnnouncements = [],
}) {
  const router = useRouter();
  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? "RMO";

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

  const campusMap = useMemo(
    () => Object.fromEntries(allCampuses.map((c) => [c.id, c])),
    [allCampuses]
  );

  // Registry State
  const [documents, setDocuments] = useState(initialDocuments);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [routingFilter, setRoutingFilter] = useState("all"); // all | intra | inter
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Modals & Drawers
  const [qrSlipDoc, setQrSlipDoc] = useState(null);
  const [inspectDoc, setInspectDoc] = useState(null);
  const [inspectRoutes, setInspectRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState(null);

  const refreshDocuments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("documents")
      .select(
        "id, tracking_code, qr_token, origin_campus_id, current_campus_id, title, description, document_type, priority, status, sender_name, sender_office, current_office, current_holder_id, created_by, file_path, file_name, file_mime_type, file_size_bytes, sla_hours, due_at, is_delayed, delayed_at, completed_at, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(150);

    if (data) setDocuments(data);
  }, []);

  const loadDocumentRoutes = useCallback(async (docId) => {
    setLoadingRoutes(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("document_routes")
        .select(
          "id, campus_id, from_office, to_office, action, remarks, scanned_via_qr, created_at, actor:acted_by(full_name, role)"
        )
        .eq("document_id", docId)
        .order("created_at", { ascending: true });

      setInspectRoutes(data ?? []);
    } finally {
      setLoadingRoutes(false);
    }
  }, []);

  // Supabase Realtime on documents & document_routes
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`rmo-registry-${campus.slug}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        () => refreshDocuments()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_routes" },
        (payload) => {
          refreshDocuments();
          if (inspectDoc && payload.new?.document_id === inspectDoc.id) {
            loadDocumentRoutes(inspectDoc.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campus.slug, inspectDoc, loadDocumentRoutes, refreshDocuments]);

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
          message:
            error?.message ||
            "Unable to generate secure download link for this attachment.",
        });
        return;
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingFile(false);
    }
  }

  function openInspectDrawer(doc) {
    setInspectDoc(doc);
    loadDocumentRoutes(doc.id);
  }

  const filteredDocuments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      const statusMatch = statusFilter === "all" || doc.status === statusFilter;
      const priorityMatch =
        priorityFilter === "all" || doc.priority === priorityFilter;
      const isInter = doc.origin_campus_id !== doc.current_campus_id;
      const routingMatch =
        routingFilter === "all" ||
        (routingFilter === "inter" && isInter) ||
        (routingFilter === "intra" && !isInter);
      const overdueMatch = !overdueOnly || isDocOverdue(doc);

      if (!statusMatch || !priorityMatch || !routingMatch || !overdueMatch) {
        return false;
      }
      if (!q) return true;
      return (
        doc.tracking_code?.toLowerCase().includes(q) ||
        doc.title?.toLowerCase().includes(q) ||
        doc.sender_name?.toLowerCase().includes(q) ||
        doc.current_office?.toLowerCase().includes(q)
      );
    });
  }, [
    documents,
    searchQuery,
    statusFilter,
    priorityFilter,
    routingFilter,
    overdueOnly,
  ]);

  const overdueCount = useMemo(
    () => documents.filter(isDocOverdue).length,
    [documents]
  );

  const navItems = [
    {
      id: "intake",
      label: "RMO Intake & Registry",
      icon: FilePlus2,
    },
    {
      id: "queue",
      label: "QR Scanner & Office Queue",
      icon: QrCode,
    },
    {
      id: "announcements",
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
        ariaLabel="RMO Portal Navigation"
      />

      {/* Main Column */}
      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-200 print:pl-0 ${
          collapsed ? "lg:pl-20" : "lg:pl-64"
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
        <main className="w-full flex-1 px-4 py-5 sm:px-6">
          {/* TAB 2: QR SCANNER & OFFICE QUEUE (Mounted across tabs so queue stays cached; camera stops on switch) */}
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

          {/* TAB 3: ANNOUNCEMENTS & AVAILABILITY (Stays strictly inside /[campus]/rmo) */}
          {activeTab === "announcements" && (
            <AnnouncementsAvailabilityPanel
              profile={profile}
              campus={campus}
              initialAnnouncements={initialAnnouncements}
            />
          )}

          {/* TAB 4: MY PROFILE */}
          {activeTab === "profile" && (
            <UserProfileView profile={profile} campus={campus} />
          )}

          {/* TAB 1: RMO INTAKE & REGISTRY */}
          <div className={activeTab === "intake" ? "space-y-6" : "hidden"}>
            {/* Header */}
            <div className="no-print flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-chmsu-forest">
                  RMO Document Intake &amp; Registry
                </h1>
                <p className="mt-0.5 text-sm text-slate-600">
                  Register official documents, attach files securely, generate
                  printable QR slips, and monitor intra- and inter-campus
                  routing for CHMSU {campus.name}.
                </p>
              </div>

        {overdueCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-800 tabular-nums">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              {overdueCount} Overdue
            </span>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`no-print flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "error"
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
            aria-label="Dismiss"
            className="rounded-md p-1 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 1. Shared Document Registration Form */}
      <DocumentRegisterPanel
        profile={profile}
        campus={campus}
        allCampuses={allCampuses}
        onDocumentRegistered={refreshDocuments}
      />

      {/* 2. Live RMO Registry Table */}
      <section className="no-print overflow-hidden rounded-2xl border border-chmsu-border bg-white">
        <div className="space-y-3 border-b border-chmsu-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-chmsu-forest">
                Live Document Registry
              </h2>
              <p className="text-xs text-slate-500">
                Showing documents originating from or currently routed to CHMSU{" "}
                {campus.name}.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 tabular-nums">
              {filteredDocuments.length} of {documents.length} documents
            </span>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tracking code, title, sender, office..."
                className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:bg-white"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <option value="all">All Statuses</option>
              {Object.entries(DOCUMENT_STATUS_META).map(([val, meta]) => (
                <option key={val} value={val}>
                  {meta.label}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Filter by priority"
              className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <option value="all">All Priorities</option>
              {DOCUMENT_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>

            <select
              value={routingFilter}
              onChange={(e) => setRoutingFilter(e.target.value)}
              aria-label="Filter by routing scope"
              className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <option value="all">Intra &amp; Inter-Campus</option>
              <option value="intra">Intra-Campus Only</option>
              <option value="inter">Inter-Campus Only</option>
            </select>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-red-700">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="h-4 w-4 rounded accent-red-600"
            />
            Show Overdue / Delayed Only
          </label>
        </div>

        {filteredDocuments.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No documents match your current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-chmsu-border bg-chmsu-canvas text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-5 py-3">Tracking Code &amp; Title</th>
                  <th className="px-4 py-3">Routing</th>
                  <th className="px-4 py-3">Status &amp; Priority</th>
                  <th className="px-4 py-3">SLA Deadline</th>
                  <th className="px-5 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-chmsu-border">
                {filteredDocuments.map((doc) => {
                  const statusMeta = DOCUMENT_STATUS_META[doc.status] ?? {
                    label: doc.status,
                    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
                  };
                  const priorityMeta =
                    DOCUMENT_PRIORITIES.find((p) => p.value === doc.priority) ??
                    DOCUMENT_PRIORITIES[0];
                  const overdue = isDocOverdue(doc);
                  const isInter =
                    doc.origin_campus_id !== doc.current_campus_id;

                  return (
                    <tr
                      key={doc.id}
                      className={`transition hover:bg-slate-50/80 ${
                        overdue ? "bg-red-50/30" : ""
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-chmsu-green">
                            {doc.tracking_code}
                          </span>
                          {doc.file_path && (
                            <span
                              title={doc.file_name}
                              className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                            >
                              <Paperclip className="h-3 w-3" />
                              File
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 font-semibold text-slate-900">
                          {doc.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {doc.document_type} &bull; From: {doc.sender_name}
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-chmsu-navy">
                          {isInter && (
                            <ArrowRightLeft className="h-3.5 w-3.5 text-chmsu-flame" />
                          )}
                          <span>
                            {campusMap[doc.origin_campus_id]?.code ?? "?"}{" "}
                            &rarr;{" "}
                            {campusMap[doc.current_campus_id]?.code ?? "?"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600">
                          {doc.current_office}
                        </p>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.label}
                          </span>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${priorityMeta.badgeClass}`}
                          >
                            {priorityMeta.label}
                          </span>
                          {overdue && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                              <AlertTriangle className="h-3 w-3" />
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600 tabular-nums">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {formatDateTime(doc.due_at)}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-left">
                        <div className="inline-flex items-center justify-start gap-1.5">
                          <button
                            type="button"
                            onClick={() => setQrSlipDoc(doc)}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-chmsu-border bg-white px-2.5 py-1.5 text-xs font-semibold text-chmsu-forest hover:border-chmsu-green hover:bg-chmsu-green/10"
                          >
                            <QrCode className="h-3.5 w-3.5 text-chmsu-green" />
                            QR Slip
                          </button>
                          <button
                            type="button"
                            onClick={() => openInspectDrawer(doc)}
                            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-chmsu-border bg-white px-2.5 py-1.5 text-xs font-semibold text-chmsu-navy hover:border-chmsu-navy"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Trail
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

      {/* Printable QR Slip Modal */}
      {qrSlipDoc && (
        <QrSlipModal
          doc={qrSlipDoc}
          campusMap={campusMap}
          onClose={() => setQrSlipDoc(null)}
        />
      )}

      {/* Custody Trail & File Download Drawer/Modal */}
      {inspectDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Document Custody Trail"
          className="no-print fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
        >
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-chmsu-border bg-chmsu-forest px-5 py-4 text-white">
              <div>
                <p className="font-mono text-xs font-bold text-chmsu-gold">
                  {inspectDoc.tracking_code}
                </p>
                <h3 className="text-base font-bold">{inspectDoc.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                aria-label="Close trail panel"
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Attachment Download */}
              <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Attached File (Private Bucket)
                </p>
                {inspectDoc.file_path ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {inspectDoc.file_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {inspectDoc.file_size_bytes
                          ? `${(inspectDoc.file_size_bytes / 1024).toFixed(1)} KB`
                          : "Attached"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={downloadingFile}
                      onClick={() => handleSignedDownload(inspectDoc)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-chmsu-navy px-3 py-2 text-xs font-semibold text-white hover:bg-chmsu-forest disabled:opacity-60"
                    >
                      {downloadingFile ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Download / View
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    No file attached to this document.
                  </p>
                )}
              </div>

              {/* Custody Timeline */}
              <div>
                <h4 className="text-sm font-bold text-chmsu-forest">
                  Full Custody Trail
                </h4>
                {loadingRoutes ? (
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading custody trail...
                  </div>
                ) : inspectRoutes.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">
                    No custody steps logged yet.
                  </p>
                ) : (
                  <ol className="mt-4 space-y-4 border-l-2 border-chmsu-green/30 pl-4">
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
                        {step.actor?.full_name && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            By {step.actor.full_name}{" "}
                            {step.scanned_via_qr ? "• Scanned via QR" : ""}
                          </p>
                        )}
                        {step.remarks && (
                          <p className="mt-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 border border-slate-200">
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
          </div>
        </main>
      </div>
    </div>
  );
}
