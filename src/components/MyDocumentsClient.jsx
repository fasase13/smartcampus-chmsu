"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  FileText,
  FolderOpen,
  Loader2,
  Lock,
  PackageCheck,
  QrCode,
  RotateCcw,
  Search,
  Send,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DOCUMENT_PRIORITIES,
  DOCUMENT_STATUS_META,
  ROLE_LABELS,
  ROLES,
  ROUTE_ACTION_LABELS,
  STORAGE_BUCKETS,
  formatSlaDays,
} from "@/lib/constants";
import {
  getAllDestinationOfficesForCampus,
  getDestinationOfficesForCampus,
} from "@/lib/chmsuDirectory";
import QrSlipModal from "@/components/QrSlipModal";

const OPERATIONAL_CUSTODIAN_ROLES = [
  ROLES.FACULTY,
  ROLES.STAFF,
  ROLES.RMO,
];

function isProcessedStatus(status) {
  return status === "completed" || status === "processed" || status === "archived";
}

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

function formatRecipientOption(r) {
  const roleLabel = ROLE_LABELS[r.role] ?? r.role?.replace("_", " ") ?? "Staff";
  const detail = r.office || r.department;
  return detail
    ? `${r.full_name} — ${roleLabel} (${detail})`
    : `${r.full_name} — ${roleLabel}`;
}

function getSlaSummary(doc) {
  if (!doc?.due_at) return { label: "No SLA set", overdue: false };
  if (isProcessedStatus(doc.status)) {
    return { label: "Processed", overdue: false };
  }
  const diffMs = new Date(doc.due_at).getTime() - Date.now();
  const absDays = Math.max(
    0.1,
    Math.round((Math.abs(diffMs) / 86400000) * 10) / 10
  );
  if (diffMs < 0 || doc.is_delayed) {
    return {
      label: `Overdue by ${formatSlaDays(absDays)}`,
      overdue: true,
    };
  }
  return {
    label: `${formatSlaDays(absDays)} remaining`,
    overdue: false,
  };
}

export default function MyDocumentsClient({
  profile,
  campus,
  allCampuses = [],
  initialDocuments = [],
}) {
  const campusMap = useMemo(
    () => Object.fromEntries(allCampuses.map((c) => [c.id, c])),
    [allCampuses]
  );

  const canMutateCustody = OPERATIONAL_CUSTODIAN_ROLES.includes(profile?.role);

  // Documents List & Filter Tabs
  const [documents, setDocuments] = useState(initialDocuments);
  const [filterTab, setFilterTab] = useState("incoming"); // incoming | in_progress | sent | processed
  const [searchQuery, setSearchQuery] = useState("");

  // Selected Document & Routing History
  const [activeDoc, setActiveDoc] = useState(null);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [qrSlipDoc, setQrSlipDoc] = useState(null);

  // Custody Action State
  const [remarks, setRemarks] = useState("");
  const [showForwardForm, setShowForwardForm] = useState(false);
  const [forwardCampusId, setForwardCampusId] = useState(campus?.id ?? "");
  const [forwardOffice, setForwardOffice] = useState("");
  const [forwardHolderId, setForwardHolderId] = useState("");
  const [forwardRecipients, setForwardRecipients] = useState([]);
  const [loadingForwardRecipients, setLoadingForwardRecipients] =
    useState(false);
  const forwardReqIdRef = useRef(0);
  const [acting, setActing] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const forwardCampusSlug =
    campusMap[forwardCampusId]?.slug ?? campus?.slug ?? "talisay";

  const forwardOfficeGroups = useMemo(
    () => getDestinationOfficesForCampus(forwardCampusSlug),
    [forwardCampusSlug]
  );

  const validForwardOffices = useMemo(
    () => new Set(getAllDestinationOfficesForCampus(forwardCampusSlug)),
    [forwardCampusSlug]
  );

  const fetchForwardRecipients = useCallback(async (campusId, officeName) => {
    const cleanOffice = String(officeName ?? "").trim();
    const reqId = ++forwardReqIdRef.current;

    if (!campusId || !cleanOffice) {
      setForwardRecipients([]);
      setLoadingForwardRecipients(false);
      return;
    }

    setLoadingForwardRecipients(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "get_eligible_document_recipients",
        {
          p_campus_id: campusId,
          p_destination_office: cleanOffice,
        }
      );

      if (forwardReqIdRef.current !== reqId) return;
      if (error) {
        setForwardRecipients([]);
      } else {
        setForwardRecipients(Array.isArray(data) ? data : []);
      }
    } finally {
      if (forwardReqIdRef.current === reqId) {
        setLoadingForwardRecipients(false);
      }
    }
  }, []);

  const refreshDocuments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("documents")
      .select(
        "id, tracking_code, qr_token, origin_campus_id, current_campus_id, title, description, document_type, priority, status, sender_name, sender_office, current_office, current_holder_id, created_by, file_path, file_name, file_mime_type, file_size_bytes, sla_hours, due_at, is_delayed, delayed_at, completed_at, created_at, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(150);

    if (data) {
      setDocuments(data);
      setActiveDoc((prev) =>
        prev ? data.find((d) => d.id === prev.id) ?? prev : null
      );
    }
  }, []);

  const loadRoutes = useCallback(async (docId) => {
    setLoadingRoutes(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("document_routes")
        .select(
          "id, campus_id, from_office, to_office, from_user_id, to_user_id, acted_by, action, remarks, scanned_via_qr, created_at, actor:acted_by(full_name, role)"
        )
        .eq("document_id", docId)
        .order("created_at", { ascending: true });

      setActiveRoutes(data ?? []);
    } finally {
      setLoadingRoutes(false);
    }
  }, []);

  // Supabase Realtime sync on documents & document_routes
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`my-documents-${campus?.slug ?? "campus"}-${profile.id}`)
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
          if (activeDoc && payload.new?.document_id === activeDoc.id) {
            loadRoutes(activeDoc.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeDoc, campus?.slug, loadRoutes, profile.id, refreshDocuments]);

  async function selectDocument(doc) {
    setActiveDoc(doc);
    setRemarks("");
    setShowForwardForm(false);
    setForwardCampusId(campus?.id ?? "");
    setForwardOffice("");
    setForwardHolderId("");
    setForwardRecipients([]);
    setFeedback(null);
    await loadRoutes(doc.id);
  }

  async function handleSignedDownload() {
    if (!activeDoc?.file_path) return;
    setDownloadingFile(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKETS.DOCUMENT_FILES)
        .createSignedUrl(activeDoc.file_path, 300);

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

  const latestNonSystemRoute = useMemo(() => {
    for (let i = activeRoutes.length - 1; i >= 0; i -= 1) {
      if (activeRoutes[i]?.action !== "delay_flagged") {
        return activeRoutes[i];
      }
    }
    return null;
  }, [activeRoutes]);

  const isAlreadyReceived = Boolean(
    activeDoc &&
      !isProcessedStatus(activeDoc.status) &&
      (activeDoc.status === "received" ||
        activeDoc.status === "in_review" ||
        (activeDoc.status === "delayed" &&
          latestNonSystemRoute?.action === "received") ||
        latestNonSystemRoute?.action === "received")
  );

  async function executeCustodyAction(actionType) {
    if (!activeDoc || !canMutateCustody || acting) return;

    if (isProcessedStatus(activeDoc.status)) {
      setFeedback({
        type: "error",
        message:
          "Processed documents are permanently locked in records and cannot be edited or re-routed.",
      });
      return;
    }

    if (actionType === "received" && isAlreadyReceived) {
      setFeedback({
        type: "error",
        message:
          "This document has already been received. You may only Forward, Return, or Mark as Processed.",
      });
      return;
    }

    if (actionType !== "received" && !isAlreadyReceived) {
      setFeedback({
        type: "error",
        message:
          "You must receive this document first before forwarding, returning, or marking it as processed.",
      });
      return;
    }

    if (actionType === "returned" && !remarks.trim()) {
      setFeedback({
        type: "error",
        message: "Remarks are required when returning a document for action.",
      });
      return;
    }

    if (
      actionType === "forwarded" &&
      (!forwardOffice.trim() || !validForwardOffices.has(forwardOffice.trim()))
    ) {
      setFeedback({
        type: "error",
        message: "Please select a valid destination office before forwarding.",
      });
      return;
    }

    if (
      actionType === "forwarded" &&
      forwardHolderId &&
      forwardHolderId === profile.id
    ) {
      setFeedback({
        type: "error",
        message: "You cannot assign yourself as the document recipient.",
      });
      return;
    }

    if (actionType === "completed") {
      const confirmed = window.confirm(
        "Marking this document as Processed will permanently lock it in records. It can no longer be edited, forwarded, or modified. Continue?"
      );
      if (!confirmed) return;
    }

    setActing(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      const previousOffice = activeDoc.current_office;
      const actorOffice =
        profile.office_location ||
        profile.department ||
        `${campus?.name ?? "CHMSU"} Office`;

      let docUpdate = {};
      let routePayload = {
        document_id: activeDoc.id,
        campus_id: campus.id,
        from_office: previousOffice,
        to_office: previousOffice,
        from_user_id: activeDoc.current_holder_id,
        to_user_id: profile.id,
        acted_by: profile.id,
        action: actionType,
        remarks: remarks.trim() || null,
        scanned_via_qr: false,
      };
      const auditAction = `document.${actionType}`;
      let notificationPayload = null;

      if (actionType === "received") {
        docUpdate = {
          status: "received",
          current_campus_id: campus.id,
          current_holder_id: profile.id,
        };
        routePayload.to_office = activeDoc.current_office || actorOffice;
        routePayload.to_user_id = profile.id;
      } else if (actionType === "completed") {
        docUpdate = {
          status: "completed",
          completed_at: new Date().toISOString(),
          is_delayed: false,
          current_holder_id: profile.id,
        };
        routePayload.to_office = activeDoc.current_office || actorOffice;
        routePayload.to_user_id = profile.id;

        if (activeDoc.created_by && activeDoc.created_by !== profile.id) {
          notificationPayload = {
            user_id: activeDoc.created_by,
            campus_id: activeDoc.origin_campus_id,
            document_id: activeDoc.id,
            type: "document_forwarded",
            title: `Document Processed: ${activeDoc.tracking_code}`,
            message: `"${activeDoc.title}" has been marked as Processed and locked in records by ${profile.full_name} (${campus.name}).`,
          };
        }
      } else if (actionType === "forwarded") {
        const destCampus = campusMap[forwardCampusId];
        docUpdate = {
          status: "in_transit",
          current_campus_id: forwardCampusId,
          current_office: forwardOffice.trim(),
          current_holder_id: forwardHolderId || null,
        };
        routePayload.campus_id = forwardCampusId;
        routePayload.to_office = forwardOffice.trim();
        routePayload.to_user_id = forwardHolderId || null;

        if (forwardHolderId) {
          notificationPayload = {
            user_id: forwardHolderId,
            campus_id: forwardCampusId,
            document_id: activeDoc.id,
            type: "document_forwarded",
            title: `Document Forwarded: ${activeDoc.tracking_code}`,
            message: `"${activeDoc.title}" was forwarded from ${previousOffice} (CHMSU ${campus.name}) to ${forwardOffice.trim()} (CHMSU ${destCampus?.name ?? "CHMSU"}).`,
          };
        }
      } else if (actionType === "returned") {
        const previousHandoff = [...activeRoutes]
          .reverse()
          .find(
            (r) =>
              (r.action === "forwarded" || r.action === "registered") &&
              r.acted_by &&
              r.acted_by !== profile.id
          );
        const returnHolderId =
          previousHandoff?.acted_by || activeDoc.created_by || null;
        const returnOffice =
          previousHandoff?.from_office ||
          activeDoc.sender_office ||
          "Originating Office";
        const returnCampusId =
          activeDoc.origin_campus_id || activeDoc.current_campus_id;

        docUpdate = {
          status: "action_required",
          current_campus_id: returnCampusId,
          current_office: returnOffice,
          current_holder_id: returnHolderId,
        };
        routePayload.campus_id = returnCampusId;
        routePayload.to_office = returnOffice;
        routePayload.to_user_id = returnHolderId;

        if (returnHolderId && returnHolderId !== profile.id) {
          notificationPayload = {
            user_id: returnHolderId,
            campus_id: returnCampusId,
            document_id: activeDoc.id,
            type: "document_forwarded",
            title: `Action Required: ${activeDoc.tracking_code}`,
            message: `"${activeDoc.title}" was returned by ${profile.full_name}: ${remarks.trim()}`,
          };
        }
      }

      // Insert custody route FIRST so the PostgreSQL single-receive &
      // processed-lock triggers validate the transition before documents mutates.
      const { error: routeError } = await supabase
        .from("document_routes")
        .insert(routePayload);

      if (routeError) {
        setFeedback({ type: "error", message: routeError.message });
        return;
      }

      const { data: updatedDoc, error: updateError } = await supabase
        .from("documents")
        .update(docUpdate)
        .eq("id", activeDoc.id)
        .select("*")
        .single();

      if (updateError) {
        setFeedback({ type: "error", message: updateError.message });
        return;
      }

      // Record immutable audit log
      await supabase.from("audit_logs").insert({
        campus_id: campus.id,
        actor_id: profile.id,
        actor_role: profile.role,
        action: auditAction,
        entity_type: "document",
        entity_id: activeDoc.id,
        metadata: {
          tracking_code: activeDoc.tracking_code,
          from_office: previousOffice,
          to_office: routePayload.to_office,
          target_campus_id: routePayload.campus_id,
          remarks: remarks.trim() || null,
        },
      });

      if (notificationPayload) {
        await supabase.from("notifications").insert(notificationPayload);
      }

      setActiveDoc(updatedDoc);
      setRemarks("");
      setShowForwardForm(false);
      await Promise.all([loadRoutes(updatedDoc.id), refreshDocuments()]);

      setFeedback({
        type: "success",
        message:
          actionType === "completed"
            ? `${updatedDoc.tracking_code} has been marked as Processed and permanently locked in records.`
            : `${ROUTE_ACTION_LABELS[actionType] ?? actionType} recorded for ${updatedDoc.tracking_code}.`,
      });
    } finally {
      setActing(false);
    }
  }

  // Categorized buckets
  const incomingDocs = useMemo(
    () =>
      documents.filter(
        (d) =>
          !isProcessedStatus(d.status) &&
          ["registered", "in_transit", "action_required"].includes(d.status) &&
          (d.current_holder_id === profile.id ||
            (d.current_holder_id === null && d.current_campus_id === campus?.id))
      ),
    [documents, profile.id, campus?.id]
  );

  const inProgressDocs = useMemo(
    () =>
      documents.filter(
        (d) =>
          !isProcessedStatus(d.status) &&
          ["received", "in_review", "delayed"].includes(d.status) &&
          d.current_holder_id === profile.id
      ),
    [documents, profile.id]
  );

  const sentByMeDocs = useMemo(
    () => documents.filter((d) => d.created_by === profile.id),
    [documents, profile.id]
  );

  const processedDocs = useMemo(
    () => documents.filter((d) => isProcessedStatus(d.status)),
    [documents]
  );

  const activeBucket = useMemo(() => {
    if (filterTab === "incoming") return incomingDocs;
    if (filterTab === "in_progress") return inProgressDocs;
    if (filterTab === "sent") return sentByMeDocs;
    return processedDocs;
  }, [filterTab, incomingDocs, inProgressDocs, sentByMeDocs, processedDocs]);

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeBucket;
    return activeBucket.filter(
      (doc) =>
        doc.tracking_code?.toLowerCase().includes(q) ||
        doc.title?.toLowerCase().includes(q) ||
        doc.sender_name?.toLowerCase().includes(q) ||
        doc.current_office?.toLowerCase().includes(q)
    );
  }, [activeBucket, searchQuery]);

  const activeStatusMeta = activeDoc
    ? DOCUMENT_STATUS_META[activeDoc.status] ?? {
        label: activeDoc.status,
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      }
    : null;
  const activeSla = activeDoc ? getSlaSummary(activeDoc) : null;
  const isDocLocked = Boolean(activeDoc && isProcessedStatus(activeDoc.status));
  const slaTargetDays = activeDoc?.sla_hours
    ? Math.max(1, Math.round((activeDoc.sla_hours / 24) * 10) / 10)
    : null;

  const canReceiveCurrentDoc = Boolean(
    activeDoc &&
      canMutateCustody &&
      !isDocLocked &&
      !isAlreadyReceived &&
      (activeDoc.current_holder_id === profile.id ||
        (activeDoc.current_holder_id === null &&
          activeDoc.current_campus_id === campus?.id))
  );

  const canActOnReceivedDoc = Boolean(
    activeDoc &&
      canMutateCustody &&
      !isDocLocked &&
      isAlreadyReceived &&
      activeDoc.current_holder_id === profile.id
  );

  const isCurrentCustodian = canReceiveCurrentDoc || canActOnReceivedDoc;

  const bucketTabs = [
    {
      id: "incoming",
      label: "Incoming / Assigned to Me",
      count: incomingDocs.length,
    },
    {
      id: "in_progress",
      label: "In Progress",
      count: inProgressDocs.length,
    },
    {
      id: "sent",
      label: "Sent by Me",
      count: sentByMeDocs.length,
    },
    {
      id: "processed",
      label: "Processed Records",
      count: processedDocs.length,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-chmsu-forest">
            <FolderOpen className="h-6 w-6 text-chmsu-green" />
            My Documents
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Manage documents assigned to you, track active routing handoffs, and
            view permanently archived processed records for CHMSU{" "}
            {campus?.name ?? "CHMSU"}.
          </p>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
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

      {/* Filter Tabs + Search */}
      <div className="space-y-3 rounded-2xl border border-chmsu-border bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {bucketTabs.map((tab) => {
            const active = filterTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  active
                    ? "bg-chmsu-forest text-white"
                    : "border border-chmsu-border bg-chmsu-canvas text-slate-700 hover:border-chmsu-green"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                    active
                      ? "bg-white/20 text-white"
                      : "bg-slate-200/80 text-slate-700"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by tracking code, document title, sender, or office..."
            className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:bg-white"
          />
        </div>
      </div>

      {/* Main Split Workspace: Document List + Details & Routing History */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Document List */}
        <section className="overflow-hidden rounded-2xl border border-chmsu-border bg-white xl:col-span-5">
          <div className="border-b border-chmsu-border bg-chmsu-canvas px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600">
            {bucketTabs.find((t) => t.id === filterTab)?.label} (
            {filteredDocs.length})
          </div>

          {filteredDocs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No documents in this view right now.
            </div>
          ) : (
            <div className="max-h-[640px] divide-y divide-chmsu-border overflow-y-auto">
              {filteredDocs.map((doc) => {
                const statusMeta = DOCUMENT_STATUS_META[doc.status] ?? {
                  label: doc.status,
                  badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
                };
                const priorityMeta =
                  DOCUMENT_PRIORITIES.find((p) => p.value === doc.priority) ??
                  DOCUMENT_PRIORITIES[0];
                const sla = getSlaSummary(doc);
                const locked = isProcessedStatus(doc.status);
                const isSelected = activeDoc?.id === doc.id;

                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => selectDocument(doc)}
                    className={`block w-full px-4 py-3.5 text-left transition hover:bg-slate-50 ${
                      isSelected ? "bg-emerald-50/70" : "bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-chmsu-green">
                        {doc.tracking_code}
                      </span>
                      {locked ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                          <Lock className="h-2.5 w-2.5" />
                          Processed
                        </span>
                      ) : (
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.label}
                        </span>
                      )}
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${priorityMeta.badgeClass}`}
                      >
                        {priorityMeta.label}
                      </span>
                      {sla.overdue && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#DC2626] px-2 py-0.5 text-[10px] font-bold text-white">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {sla.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-bold text-slate-900">
                      {doc.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {campusMap[doc.origin_campus_id]?.name ?? "?"} &rarr;{" "}
                      <span className="font-semibold text-chmsu-navy">
                        {doc.current_office}
                      </span>
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Document Details, Custody Actions & Routing History */}
        <section className="rounded-2xl border border-chmsu-border bg-white p-5 xl:col-span-7">
          {!activeDoc ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-chmsu-border p-8 text-center">
              <FileText className="h-10 w-10 text-slate-300" />
              <h2 className="mt-3 text-base font-bold text-slate-800">
                Select a Document
              </h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Choose any document from the list to inspect its details, SLA
                deadline, printable QR slip, routing history, or take custody
                action.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Permanent Lock Banner for Processed Documents */}
              {isDocLocked && (
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  <div>
                    <p className="font-bold">Processed &mdash; Locked in Records</p>
                    <p className="mt-0.5 text-emerald-800">
                      This document is marked as processed and permanently
                      archived in records. No further edits or actions are
                      permitted.
                    </p>
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-chmsu-border pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-chmsu-green">
                      {activeDoc.tracking_code}
                    </span>
                    {isDocLocked && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-900">
                        <Lock className="h-3 w-3" />
                        Processed &mdash; Locked in Records
                      </span>
                    )}
                    {activeSla?.overdue && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[#DC2626] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        <AlertTriangle className="h-3 w-3" />
                        {activeSla.label}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 text-lg font-bold text-chmsu-forest">
                    {activeDoc.title}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {activeDoc.document_type} &bull; Priority:{" "}
                    <span className="font-semibold capitalize text-slate-700">
                      {activeDoc.priority}
                    </span>{" "}
                    &bull; Sender: {activeDoc.sender_name}
                  </p>
                  {activeDoc.description && (
                    <p className="mt-1.5 text-xs text-slate-600">
                      {activeDoc.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQrSlipDoc(activeDoc)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-chmsu-border bg-white px-3 py-1.5 text-xs font-semibold text-chmsu-forest hover:border-chmsu-green hover:bg-chmsu-canvas"
                  >
                    <QrCode className="h-3.5 w-3.5 text-chmsu-green" />
                    QR Slip
                  </button>
                  {activeStatusMeta && !isDocLocked && (
                    <span
                      className={`rounded-md border px-3 py-1 text-xs font-bold ${activeStatusMeta.badgeClass}`}
                    >
                      {activeStatusMeta.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Metadata + Attachment */}
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-xl bg-chmsu-canvas p-3">
                  <p className="font-semibold uppercase text-slate-500">
                    Route
                  </p>
                  <p className="mt-0.5 font-bold text-chmsu-navy">
                    {campusMap[activeDoc.origin_campus_id]?.name ?? "?"} &rarr;{" "}
                    {campusMap[activeDoc.current_campus_id]?.name ?? "?"}
                  </p>
                  <p className="text-slate-600">{activeDoc.current_office}</p>
                </div>

                <div className="rounded-xl bg-chmsu-canvas p-3">
                  <p className="font-semibold uppercase text-slate-500">
                    SLA Target &amp; Deadline
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 font-bold text-slate-900 tabular-nums">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {slaTargetDays ? formatSlaDays(slaTargetDays) : "—"}
                  </p>
                  <p
                    className={`font-semibold tabular-nums ${
                      activeSla?.overdue ? "text-[#DC2626]" : "text-slate-600"
                    }`}
                  >
                    {activeSla?.label}
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    Due {formatDateTime(activeDoc.due_at)}
                  </p>
                </div>

                <div className="rounded-xl bg-chmsu-canvas p-3">
                  <p className="font-semibold uppercase text-slate-500">
                    Attachment
                  </p>
                  {activeDoc.file_path ? (
                    <button
                      type="button"
                      disabled={downloadingFile}
                      onClick={handleSignedDownload}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-chmsu-navy px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-chmsu-forest disabled:opacity-60"
                    >
                      {downloadingFile ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Download File
                    </button>
                  ) : (
                    <p className="mt-1 text-slate-500">No file attached</p>
                  )}
                </div>
              </div>

              {/* Custody Action Controls (STRICT single-receive state machine) */}
              {isCurrentCustodian && (
                <div className="space-y-3 rounded-xl border border-chmsu-border bg-chmsu-canvas/50 p-4">
                  <div>
                    <label
                      htmlFor="mydocs_custody_remarks"
                      className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                    >
                      {canReceiveCurrentDoc
                        ? "Receipt Remarks (Optional)"
                        : "Action Remarks (Required for Return)"}
                    </label>
                    <input
                      id="mydocs_custody_remarks"
                      type="text"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder={
                        canReceiveCurrentDoc
                          ? "Optional note when receiving this document..."
                          : "Optional note for Forward/Processed; required for Return..."
                      }
                      className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                    />
                  </div>

                  {canReceiveCurrentDoc ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-slate-600">
                        Confirm receipt to take custody of this document. Once
                        received, you can Forward, Return, or Mark as Processed.
                      </p>
                      <button
                        type="button"
                        disabled={acting || loadingRoutes}
                        onClick={() => executeCustodyAction("received")}
                        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-chmsu-navy px-5 py-2 text-xs font-semibold text-white transition hover:bg-chmsu-forest disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {acting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PackageCheck className="h-4 w-4" />
                        )}
                        {acting ? "Receiving..." : "Receive Document"}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        disabled={acting || loadingRoutes}
                        onClick={() => setShowForwardForm((prev) => !prev)}
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-chmsu-forest bg-white px-3 py-2 text-xs font-semibold text-chmsu-forest transition hover:bg-chmsu-green/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Send className="h-4 w-4 text-chmsu-green" />
                        Forward
                      </button>

                      <button
                        type="button"
                        disabled={acting || loadingRoutes}
                        onClick={() => executeCustodyAction("returned")}
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {acting ? (
                          <Loader2 className="h-4 w-4 animate-spin text-chmsu-flame" />
                        ) : (
                          <RotateCcw className="h-4 w-4 text-chmsu-flame" />
                        )}
                        Return
                      </button>

                      <button
                        type="button"
                        disabled={acting || loadingRoutes}
                        onClick={() => executeCustodyAction("completed")}
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-chmsu-green px-3 py-2 text-xs font-semibold text-white transition hover:bg-chmsu-forest disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {acting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileCheck2 className="h-4 w-4" />
                        )}
                        Mark as Processed
                      </button>
                    </div>
                  )}

                  {/* Inline Forward Form (Only when already received & in custody) */}
                  {canActOnReceivedDoc && showForwardForm && (
                    <div className="space-y-3 rounded-xl border border-chmsu-green/30 bg-emerald-50/40 p-4">
                      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-chmsu-forest">
                        <ArrowRightLeft className="h-4 w-4 text-chmsu-green" />
                        Forward to Next Office / Campus
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <select
                          value={forwardCampusId}
                          onChange={(e) => {
                            setForwardCampusId(e.target.value);
                            setForwardOffice("");
                            setForwardHolderId("");
                            setForwardRecipients([]);
                            setLoadingForwardRecipients(false);
                          }}
                          aria-label="Forward destination campus"
                          className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                        >
                          {allCampuses.map((c) => (
                            <option key={c.id} value={c.id}>
                              CHMSU {c.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={forwardOffice}
                          onChange={(e) => {
                            const nextOffice = e.target.value;
                            setForwardOffice(nextOffice);
                            setForwardHolderId("");
                            fetchForwardRecipients(forwardCampusId, nextOffice);
                          }}
                          aria-label="Forward destination office"
                          className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs text-slate-900"
                        >
                          <option value="">Select destination office...</option>
                          {forwardOfficeGroups.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.options.map((office) => (
                                <option key={office} value={office}>
                                  {office}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>

                        <div className="relative">
                          <select
                            value={forwardHolderId}
                            disabled={loadingForwardRecipients}
                            onChange={(e) => setForwardHolderId(e.target.value)}
                            aria-label="Forward recipient"
                            className="w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs text-slate-800 disabled:opacity-70"
                          >
                            <option value="">
                              {loadingForwardRecipients
                                ? "Loading eligible recipients..."
                                : "Unassigned (Office Queue)"}
                            </option>
                            {forwardRecipients.map((r) => (
                              <option key={r.id} value={r.id}>
                                {formatRecipientOption(r)}
                              </option>
                            ))}
                          </select>
                          {loadingForwardRecipients && (
                            <Loader2 className="pointer-events-none absolute right-7 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-chmsu-green" />
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowForwardForm(false)}
                          className="rounded-lg border border-chmsu-border bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={acting}
                          onClick={() => executeCustodyAction("forwarded")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-chmsu-forest px-4 py-1.5 text-xs font-semibold text-white hover:bg-chmsu-green disabled:opacity-60"
                        >
                          {acting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Confirm Forward
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Chronological Routing / Custody History */}
              <div className="border-t border-chmsu-border pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Routing &amp; Custody History
                </h3>
                {loadingRoutes ? (
                  <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading routing history...
                  </p>
                ) : activeRoutes.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No routing entries logged yet.
                  </p>
                ) : (
                  <ol className="mt-3 max-h-60 space-y-3 overflow-y-auto border-l-2 border-chmsu-green/30 pl-4 pr-1">
                    {activeRoutes.map((step) => (
                      <li key={step.id} className="relative text-xs">
                        <span
                          className={`absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full ${
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
                        <p className="text-slate-600">
                          {step.from_office ? `${step.from_office} → ` : ""}
                          <span className="font-semibold text-chmsu-navy">
                            {step.to_office}
                          </span>{" "}
                          ({campusMap[step.campus_id]?.name ?? "CHMSU"})
                        </p>
                        {step.actor?.full_name && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            By {step.actor.full_name}
                          </p>
                        )}
                        {step.remarks && (
                          <p className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
                            {step.remarks}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Printable QR Slip Modal */}
      {qrSlipDoc && (
        <QrSlipModal
          doc={qrSlipDoc}
          campusMap={campusMap}
          onClose={() => setQrSlipDoc(null)}
        />
      )}
    </div>
  );
}
