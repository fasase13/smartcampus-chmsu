"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Download,
  FileCheck2,
  Inbox,
  Loader2,
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
  ROUTE_ACTION_LABELS,
  STORAGE_BUCKETS,
  formatSlaDays,
} from "@/lib/constants";
import {
  getAllDestinationOfficesForCampus,
  getDestinationOfficesForCampus,
  matchesDestinationOffice,
} from "@/lib/chmsuDirectory";

const QrScanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  { ssr: false }
);

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

function getSlaSummary(doc) {
  if (!doc?.due_at) return { label: "No SLA set", overdue: false };
  if (doc.status === "completed" || doc.status === "archived") {
    return { label: "Completed", overdue: false };
  }
  const diffMs = new Date(doc.due_at).getTime() - Date.now();
  const absDays = Math.max(0.1, Math.round((Math.abs(diffMs) / 86400000) * 10) / 10);
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

export default function OfficeScannerClient({
  profile,
  campus,
  allCampuses,
  staffDirectory,
  initialDocuments,
  controlledCameraActive,
  onCameraActiveChange,
}) {
  const campusMap = useMemo(
    () => Object.fromEntries(allCampuses.map((c) => [c.id, c])),
    [allCampuses]
  );

  // Camera Scanner State (supports optional controlled mode for instant tab switching)
  const [internalCameraActive, setInternalCameraActive] = useState(false);
  const cameraActive =
    controlledCameraActive !== undefined
      ? controlledCameraActive
      : internalCameraActive;
  const setCameraActive = useCallback(
    (updater) => {
      if (onCameraActiveChange) {
        onCameraActiveChange(updater);
      } else {
        setInternalCameraActive(updater);
      }
    },
    [onCameraActiveChange]
  );
  const [cameraError, setCameraError] = useState("");
  const lastScanRef = useRef({ value: "", timestamp: 0 });

  // Manual Lookup State
  const [manualInput, setManualInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  // Selected / Scanned Document State
  const [activeDoc, setActiveDoc] = useState(null);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [wasScannedViaQr, setWasScannedViaQr] = useState(false);

  // Custody Action State
  const [remarks, setRemarks] = useState("");
  const [showForwardForm, setShowForwardForm] = useState(false);
  const [forwardCampusId, setForwardCampusId] = useState(campus.id);
  const [forwardOffice, setForwardOffice] = useState("");
  const [forwardHolderId, setForwardHolderId] = useState("");
  const [acting, setActing] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);

  // Office Queue State
  const [queueDocs, setQueueDocs] = useState(initialDocuments);
  const [queueTab, setQueueTab] = useState("incoming"); // incoming | active

  // Feedback Banner
  const [feedback, setFeedback] = useState(null);

  const forwardCampusSlug =
    campusMap[forwardCampusId]?.slug ?? campus.slug;

  const forwardOfficeGroups = useMemo(
    () => getDestinationOfficesForCampus(forwardCampusSlug),
    [forwardCampusSlug]
  );

  const validForwardOffices = useMemo(
    () => new Set(getAllDestinationOfficesForCampus(forwardCampusSlug)),
    [forwardCampusSlug]
  );

  const forwardStaffOptions = useMemo(() => {
    if (!forwardOffice.trim()) return [];
    return staffDirectory.filter(
      (s) =>
        s.id !== profile.id &&
        (s.campus_id === forwardCampusId ||
          s.role === "superadmin" ||
          s.role === "management") &&
        matchesDestinationOffice(s, forwardOffice)
    );
  }, [staffDirectory, forwardCampusId, forwardOffice, profile.id]);

  const refreshQueue = useCallback(async () => {
    const supabase = createClient();
    // Strict RLS (public.can_access_document) enforces role-based scoping:
    // - superadmin: all documents
    // - campus_admin: all documents touching campus_id (origin, current, or route history)
    // - regular non-student roles: strictly documents sent to or sent by currentUser
    const { data } = await supabase
      .from("documents")
      .select(
        "id, tracking_code, qr_token, origin_campus_id, current_campus_id, title, description, document_type, priority, status, sender_name, sender_office, current_office, current_holder_id, created_by, file_path, file_name, file_mime_type, file_size_bytes, sla_hours, due_at, is_delayed, delayed_at, completed_at, created_at, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(120);

    if (data) setQueueDocs(data);
  }, []);

  const loadRoutes = useCallback(async (docId) => {
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

      setActiveRoutes(data ?? []);
    } finally {
      setLoadingRoutes(false);
    }
  }, []);

  // Supabase Realtime sync for Office Queue & Active Document
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`office-queue-${campus.slug}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        () => refreshQueue()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "document_routes" },
        (payload) => {
          refreshQueue();
          if (activeDoc && payload.new?.document_id === activeDoc.id) {
            loadRoutes(activeDoc.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeDoc, campus.slug, loadRoutes, refreshQueue]);

  // Ensure camera is stopped cleanly on unmount
  useEffect(() => {
    return () => {
      setCameraActive(false);
    };
  }, [setCameraActive]);

  const lookupDocument = useCallback(
    async (rawQuery, scannedViaQr = false) => {
      const cleaned = rawQuery.trim();
      if (!cleaned) return;

      setLookingUp(true);
      setFeedback(null);

      const unauthorizedAlert =
        profile.role === "campus_admin"
          ? "Invalid Document — This document is outside your campus scope."
          : "Invalid Document — You can only scan documents that were sent to you or sent by you.";

      try {
        const response = await fetch("/api/documents/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: cleaned }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload?.ok || !payload?.document) {
          setActiveDoc(null);
          setActiveRoutes([]);
          setFeedback({
            type: "error",
            message: unauthorizedAlert,
          });
          return;
        }

        setActiveDoc(payload.document);
        setActiveRoutes(Array.isArray(payload.routes) ? payload.routes : []);
        setWasScannedViaQr(scannedViaQr);
        setRemarks("");
        setShowForwardForm(false);
        setForwardCampusId(campus.id);
        setForwardOffice("");
        setForwardHolderId("");

        if (scannedViaQr) {
          setCameraActive(false);
          setFeedback({
            type: "success",
            message: `QR verified: ${payload.document.tracking_code} — ready for custody action.`,
          });
        }
      } catch {
        setActiveDoc(null);
        setActiveRoutes([]);
        setFeedback({
          type: "error",
          message: unauthorizedAlert,
        });
      } finally {
        setLookingUp(false);
      }
    },
    [campus.id, profile.role, setCameraActive]
  );

  function handleQrScan(detectedCodes) {
    if (!detectedCodes || detectedCodes.length === 0) return;
    const rawValue = detectedCodes[0]?.rawValue?.trim();
    if (!rawValue) return;

    // Cooldown deduplication (2.5 seconds) so a held QR code never double-triggers
    const now = Date.now();
    if (
      lastScanRef.current.value === rawValue &&
      now - lastScanRef.current.timestamp < 2500
    ) {
      return;
    }
    lastScanRef.current = { value: rawValue, timestamp: now };
    lookupDocument(rawValue, true);
  }

  function handleCameraError(err) {
    const msg =
      err?.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in your browser settings or use the Manual Tracking Code input."
        : err?.name === "NotFoundError"
          ? "No webcam or camera device was detected on this machine. Use the Manual Tracking Code input."
          : err?.message ||
          "Unable to start camera on this device. Use the Manual Tracking Code input below.";
    setCameraError(msg);
    setCameraActive(false);
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    await lookupDocument(manualInput, false);
  }

  async function selectFromQueue(doc) {
    setActiveDoc(doc);
    setWasScannedViaQr(false);
    setRemarks("");
    setShowForwardForm(false);
    setFeedback(null);
    await loadRoutes(doc.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
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
            "Unable to generate download link. Ensure inter-campus storage migration has been applied.",
        });
        return;
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingFile(false);
    }
  }

  // Execute one of the 4 Custody Actions
  async function executeCustodyAction(actionType) {
    if (!activeDoc) return;

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

    setActing(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      const previousOffice = activeDoc.current_office;
      const actorOffice =
        profile.office_location ||
        profile.department ||
        `${campus.name} Office`;

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
        scanned_via_qr: wasScannedViaQr,
      };
      let auditAction = `document.${actionType}`;
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
            title: `Document Completed: ${activeDoc.tracking_code}`,
            message: `"${activeDoc.title}" has been marked as Processed/Completed by ${profile.full_name} (${campus.name}).`,
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
        docUpdate = {
          status: "action_required",
        };
        routePayload.to_office = activeDoc.sender_office || "Originating Office";
        routePayload.to_user_id = activeDoc.created_by;

        if (activeDoc.created_by && activeDoc.created_by !== profile.id) {
          notificationPayload = {
            user_id: activeDoc.created_by,
            campus_id: activeDoc.origin_campus_id,
            document_id: activeDoc.id,
            type: "document_forwarded",
            title: `Action Required: ${activeDoc.tracking_code}`,
            message: `"${activeDoc.title}" was returned by ${profile.full_name}: ${remarks.trim()}`,
          };
        }
      }

      // 1. Update public.documents
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

      // 2. Append immutable custody step to public.document_routes
      const { error: routeError } = await supabase
        .from("document_routes")
        .insert(routePayload);

      if (routeError) {
        setFeedback({
          type: "error",
          message: `Document updated, but route logging failed: ${routeError.message}`,
        });
      }

      // 3. Record immutable audit log
      await supabase.from("audit_logs").insert({
        campus_id: campus.id,
        actor_id: profile.id,
        actor_role: profile.role,
        action: auditAction,
        entity_type: "document",
        entity_id: activeDoc.id,
        metadata: {
          tracking_code: activeDoc.tracking_code,
          scanned_via_qr: wasScannedViaQr,
          from_office: previousOffice,
          to_office: routePayload.to_office,
          target_campus_id: routePayload.campus_id,
          remarks: remarks.trim() || null,
        },
      });

      // 4. Insert notification if applicable
      if (notificationPayload) {
        await supabase.from("notifications").insert(notificationPayload);
      }

      setActiveDoc(updatedDoc);
      setRemarks("");
      setShowForwardForm(false);
      await Promise.all([loadRoutes(updatedDoc.id), refreshQueue()]);

      setFeedback({
        type: "success",
        message: `${ROUTE_ACTION_LABELS[actionType] ?? actionType} recorded for ${updatedDoc.tracking_code}.`,
      });
    } finally {
      setActing(false);
    }
  }

  // Queue Tabs
  const incomingQueue = useMemo(
    () =>
      queueDocs.filter(
        (d) =>
          d.current_campus_id === campus.id &&
          (d.status === "registered" || d.status === "in_transit")
      ),
    [queueDocs, campus.id]
  );

  const activeOfficeQueue = useMemo(
    () =>
      queueDocs.filter(
        (d) =>
          (d.current_campus_id === campus.id ||
            d.current_holder_id === profile.id) &&
          ["received", "in_review", "action_required", "delayed"].includes(
            d.status
          )
      ),
    [queueDocs, campus.id, profile.id]
  );

  const displayedQueue =
    queueTab === "incoming" ? incomingQueue : activeOfficeQueue;

  const activeStatusMeta = activeDoc
    ? DOCUMENT_STATUS_META[activeDoc.status] ?? {
      label: activeDoc.status,
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    }
    : null;
  const activeSla = activeDoc ? getSlaSummary(activeDoc) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-chmsu-forest">
            Office QR Scanner &amp; Custody Portal
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Scan document QR routing slips via webcam or enter a tracking code
            to receive, forward, return, or complete documents at CHMSU{" "}
            {campus.name}.
          </p>
        </div>
      </div>

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
            aria-label="Dismiss"
            className="rounded-md p-1 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Top Grid: Camera Scanner + Scanned Document Action Panel */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Webcam QR Scanner + Manual Fallback */}
        <section className="rounded-2xl border border-chmsu-border bg-white p-5 xl:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold text-chmsu-forest">
              <QrCode className="h-5 w-5 text-chmsu-green" />
              Web QR Scanner
            </h2>
            <button
              type="button"
              onClick={() => {
                setCameraError("");
                setCameraActive((prev) => !prev);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${cameraActive
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-chmsu-forest text-white hover:bg-chmsu-green"
                }`}
            >
              {cameraActive ? (
                <>
                  <CameraOff className="h-4 w-4" />
                  Stop Camera
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  Start Camera
                </>
              )}
            </button>
          </div>

          {/* Camera Viewport */}
          <div className="mt-4 overflow-hidden rounded-xl border border-chmsu-border bg-slate-950">
            {cameraActive ? (
              <div className="aspect-square w-full max-h-80">
                <QrScanner
                  onScan={handleQrScan}
                  onError={handleCameraError}
                  formats={["qr_code"]}
                  allowMultiple={false}
                  scanDelay={2500}
                  sound={false}
                  constraints={{ facingMode: "environment" }}
                  styles={{
                    container: { width: "100%", height: "100%" },
                    video: { width: "100%", height: "100%", objectFit: "cover" },
                  }}
                />
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center p-6 text-center text-slate-300">
                <Camera className="h-9 w-9 text-chmsu-gold" />
                <p className="mt-2 text-sm font-semibold text-white">
                  Camera Scanner Standby
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Click &ldquo;Start Camera&rdquo; to scan a CHMSU QR Routing
                  Slip via your webcam on localhost.
                </p>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Manual Tracking Code / QR Token Fallback */}
          <form
            onSubmit={handleManualSubmit}
            className="mt-4 border-t border-chmsu-border pt-4"
          >
            <label
              htmlFor="manual_doc_lookup"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Manual Tracking Code or QR Token Fallback
            </label>
            <div className="mt-1.5 flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="manual_doc_lookup"
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="CHMSU-ALJ-2026-0001 or UUID"
                  className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2 pl-9 pr-3 font-mono text-xs text-slate-900 outline-none focus:border-chmsu-green focus:bg-white"
                />
              </div>
              <button
                type="submit"
                disabled={lookingUp || !manualInput.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-chmsu-navy px-4 py-2 text-xs font-semibold text-white transition hover:bg-chmsu-forest disabled:opacity-60"
              >
                {lookingUp ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Lookup"
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Right: Scanned Document Action Panel */}
        <section className="rounded-2xl border border-chmsu-border bg-white p-5 xl:col-span-7">
          {!activeDoc ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-chmsu-border p-8 text-center">
              <QrCode className="h-10 w-10 text-slate-300" />
              <h2 className="mt-3 text-base font-bold text-slate-800">
                No Document Loaded
              </h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Scan a printed QR routing slip, enter a tracking code manually,
                or select a document from the Office Queue below.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Document Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-chmsu-border pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-chmsu-green">
                      {activeDoc.tracking_code}
                    </span>
                    {wasScannedViaQr && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                        QR Verified
                      </span>
                    )}
                    {activeSla?.overdue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
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
                </div>

                {activeStatusMeta && (
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${activeStatusMeta.badgeClass}`}
                  >
                    {activeStatusMeta.label}
                  </span>
                )}
              </div>

              {/* Metadata + Signed File Download */}
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
                    SLA Deadline
                  </p>
                  <p
                    className={`mt-0.5 font-bold tabular-nums ${activeSla?.overdue ? "text-red-700" : "text-slate-900"
                      }`}
                  >
                    {formatDateTime(activeDoc.due_at)}
                  </p>
                  <p className="text-slate-600">{activeSla?.label}</p>
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

              {/* Remarks Input */}
              <div>
                <label
                  htmlFor="custody_remarks"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Action Remarks (Required for Return)
                </label>
                <input
                  id="custody_remarks"
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional note for Receive/Complete/Forward; required for Return..."
                  className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                />
              </div>

              {/* 4 One-Click Custody Action Buttons */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => executeCustodyAction("received")}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-chmsu-navy px-3 py-2 text-xs font-semibold text-white transition hover:bg-chmsu-forest disabled:opacity-60"
                >
                  <PackageCheck className="h-4 w-4" />
                  Receive
                </button>

                <button
                  type="button"
                  disabled={acting}
                  onClick={() => setShowForwardForm((prev) => !prev)}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-chmsu-forest bg-chmsu-canvas px-3 py-2 text-xs font-semibold text-chmsu-forest transition hover:bg-chmsu-green/10 disabled:opacity-60"
                >
                  <Send className="h-4 w-4 text-chmsu-green" />
                  Forward
                </button>

                <button
                  type="button"
                  disabled={acting}
                  onClick={() => executeCustodyAction("completed")}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-chmsu-green px-3 py-2 text-xs font-semibold text-white transition hover:bg-chmsu-forest disabled:opacity-60"
                >
                  <FileCheck2 className="h-4 w-4" />
                  Mark Processed
                </button>

                <button
                  type="button"
                  disabled={acting}
                  onClick={() => executeCustodyAction("returned")}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900 transition hover:bg-orange-100 disabled:opacity-60"
                >
                  <RotateCcw className="h-4 w-4 text-chmsu-flame" />
                  Return
                </button>
              </div>

              {/* Inline Forward Destination Panel */}
              {showForwardForm && (
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
                        setForwardOffice(e.target.value);
                        setForwardHolderId("");
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

                    <select
                      value={forwardHolderId}
                      onChange={(e) => setForwardHolderId(e.target.value)}
                      aria-label="Forward recipient"
                      className="rounded-xl border border-chmsu-border bg-white px-3 py-2 text-xs text-slate-800"
                    >
                      <option value="">Unassigned (Office Queue)</option>
                      {forwardStaffOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({ROLE_LABELS[s.role] ?? s.role.replace("_", " ")})
                        </option>
                      ))}
                    </select>
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

              {/* Custody Timeline */}
              <div className="border-t border-chmsu-border pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Custody Timeline
                </h3>
                {loadingRoutes ? (
                  <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading custody trail...
                  </p>
                ) : activeRoutes.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No custody entries yet.
                  </p>
                ) : (
                  <ol className="mt-3 max-h-52 space-y-3 overflow-y-auto border-l-2 border-chmsu-green/30 pl-4 pr-1">
                    {activeRoutes.map((step) => (
                      <li key={step.id} className="relative text-xs">
                        <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-chmsu-forest" />
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
                          {step.scanned_via_qr ? " • QR Scan" : ""}
                        </p>
                        {step.remarks && (
                          <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-slate-600 border border-slate-200">
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

      {/* Office Queue Dashboard */}
      <section className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-chmsu-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-chmsu-green" />
            <h2 className="text-lg font-bold text-chmsu-forest">
              Office Queue Dashboard
            </h2>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setQueueTab("incoming")}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${queueTab === "incoming"
                  ? "bg-chmsu-forest text-white"
                  : "border border-chmsu-border bg-chmsu-canvas text-slate-700 hover:border-chmsu-green"
                }`}
            >
              Incoming / In Transit ({incomingQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setQueueTab("active")}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${queueTab === "active"
                  ? "bg-chmsu-forest text-white"
                  : "border border-chmsu-border bg-chmsu-canvas text-slate-700 hover:border-chmsu-green"
                }`}
            >
              Active in Office ({activeOfficeQueue.length})
            </button>
          </div>
        </div>

        {displayedQueue.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No documents in{" "}
            {queueTab === "incoming"
              ? "Incoming / In Transit"
              : "Active in Office"}{" "}
            right now.
          </div>
        ) : (
          <div className="divide-y divide-chmsu-border">
            {displayedQueue.map((doc) => {
              const statusMeta = DOCUMENT_STATUS_META[doc.status] ?? {
                label: doc.status,
                badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
              };
              const priorityMeta =
                DOCUMENT_PRIORITIES.find((p) => p.value === doc.priority) ??
                DOCUMENT_PRIORITIES[0];
              const sla = getSlaSummary(doc);
              const isSelected = activeDoc?.id === doc.id;

              return (
                <div
                  key={doc.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-slate-50 ${isSelected ? "bg-emerald-50/50" : ""
                    }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-chmsu-green">
                        {doc.tracking_code}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${priorityMeta.badgeClass}`}
                      >
                        {priorityMeta.label}
                      </span>
                      {sla.overdue && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          <AlertTriangle className="h-3 w-3" />
                          {sla.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-bold text-slate-900">
                      {doc.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      From {campusMap[doc.origin_campus_id]?.name ?? "?"} &rarr;{" "}
                      <span className="font-semibold text-chmsu-navy">
                        {doc.current_office}
                      </span>{" "}
                      &bull; Due{" "}
                      <span className="tabular-nums">
                        {formatDateTime(doc.due_at)}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => selectFromQueue(doc)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-chmsu-forest bg-white px-3.5 py-2 text-xs font-semibold text-chmsu-forest transition hover:bg-chmsu-forest hover:text-white"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Open Action Panel
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
