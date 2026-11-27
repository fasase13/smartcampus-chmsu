"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  QrCode,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  DOCUMENT_PRIORITIES,
  DOCUMENT_STATUS_META,
  ROUTE_ACTION_LABELS,
  formatSlaDays,
} from "@/lib/constants";

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

export default function ManagementQrTrackerPanel({
  campusMap = {},
  campusName = "",
  controlledCameraActive,
  onCameraActiveChange,
}) {
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

  const [manualInput, setManualInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  const [activeDoc, setActiveDoc] = useState(null);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const [wasScannedViaQr, setWasScannedViaQr] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Ensure camera stops cleanly on unmount
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
            message:
              payload?.error ||
              "Document not found. Verify the tracking code or QR token and try again.",
          });
          return;
        }

        setActiveDoc(payload.document);
        setActiveRoutes(Array.isArray(payload.routes) ? payload.routes : []);
        setWasScannedViaQr(scannedViaQr);

        if (scannedViaQr) {
          setCameraActive(false);
          setFeedback({
            type: "success",
            message: `QR verified: ${payload.document.tracking_code} loaded in read-only tracking mode.`,
          });
        }
      } catch {
        setActiveDoc(null);
        setActiveRoutes([]);
        setFeedback({
          type: "error",
          message: "Unable to look up this document right now. Please try again.",
        });
      } finally {
        setLookingUp(false);
      }
    },
    [setCameraActive]
  );

  function handleQrScan(detectedCodes) {
    if (!detectedCodes || detectedCodes.length === 0) return;
    const rawValue = detectedCodes[0]?.rawValue?.trim();
    if (!rawValue) return;

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

  const activeStatusMeta = activeDoc
    ? DOCUMENT_STATUS_META[activeDoc.status] ?? {
        label: activeDoc.status,
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      }
    : null;
  const activePriorityMeta = activeDoc
    ? DOCUMENT_PRIORITIES.find((p) => p.value === activeDoc.priority) ??
      DOCUMENT_PRIORITIES[0]
    : null;
  const activeSla = activeDoc ? getSlaSummary(activeDoc) : null;
  const slaTargetDays = activeDoc?.sla_hours
    ? Math.max(1, Math.round((activeDoc.sla_hours / 24) * 10) / 10)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-chmsu-forest">
            QR Document Tracker
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Scan a CHMSU QR routing slip or enter a tracking code to inspect
            real-time document location, routing timeline, and SLA delay alerts{" "}
            {campusName ? `for CHMSU ${campusName}` : "for your assigned campus"}
            .
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-chmsu-navy/20 bg-chmsu-navy/10 px-3 py-1.5 text-xs font-semibold text-chmsu-navy">
          <Eye className="h-3.5 w-3.5" />
          Read-Only Oversight Mode &mdash; Tracking &amp; Alerts Only
        </span>
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

      {/* Main Split Grid */}
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
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                cameraActive
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

          <div className="mt-4 overflow-hidden rounded-xl border border-chmsu-border bg-slate-950">
            {cameraActive ? (
              <div className="aspect-square max-h-80 w-full">
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
                    video: {
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    },
                  }}
                />
              </div>
            ) : (
              <div className="flex h-56 flex-col items-center justify-center p-6 text-center text-slate-300">
                <Camera className="h-9 w-9 text-chmsu-gold" />
                <p className="mt-2 text-sm font-semibold text-white">
                  Read-Only QR Tracker Standby
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Click &ldquo;Start Camera&rdquo; to scan a CHMSU QR routing
                  slip{" "}
                  {campusName
                    ? `for CHMSU ${campusName}`
                    : "for your assigned campus"}
                  .
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
              htmlFor="mgmt_manual_doc_lookup"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Manual Tracking Code or QR Token Fallback
            </label>
            <div className="mt-1.5 flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="mgmt_manual_doc_lookup"
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="CHMSU-TAL-2026-0001 or UUID"
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
                  "Track"
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Right: Strictly Read-Only Document Details & Alerts Panel */}
        <section className="rounded-2xl border border-chmsu-border bg-white p-5 xl:col-span-7">
          {!activeDoc ? (
            <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-chmsu-border p-8 text-center">
              <QrCode className="h-10 w-10 text-slate-300" />
              <h2 className="mt-3 text-base font-bold text-slate-800">
                No Document Tracked Yet
              </h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Scan a printed CHMSU QR routing slip or enter a tracking code to
                view its live status, SLA alerts, and full routing timeline.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Overdue Alert Banner if Delayed */}
              {activeSla?.overdue && (
                <div className="flex items-center gap-2.5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs font-bold text-red-800">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-[#DC2626]" />
                  <span>
                    SLA Delay Alert: {activeSla.label} (Due{" "}
                    {formatDateTime(activeDoc.due_at)})
                  </span>
                </div>
              )}

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
                    {activePriorityMeta && (
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${activePriorityMeta.badgeClass}`}
                      >
                        {activePriorityMeta.label}
                      </span>
                    )}
                    {activeSla?.overdue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#DC2626] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        <AlertTriangle className="h-3 w-3" />
                        {activeSla.label}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 text-lg font-bold text-chmsu-forest">
                    {activeDoc.title}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {activeDoc.document_type} &bull; Registered{" "}
                    <span className="tabular-nums">
                      {formatDateTime(activeDoc.created_at)}
                    </span>
                  </p>
                  {activeDoc.description && (
                    <p className="mt-1.5 text-xs text-slate-600">
                      {activeDoc.description}
                    </p>
                  )}
                </div>

                {activeStatusMeta && (
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${activeStatusMeta.badgeClass}`}
                  >
                    {activeStatusMeta.label}
                  </span>
                )}
              </div>

              {/* Metadata Grid (Read-Only) */}
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-xl bg-chmsu-canvas p-3">
                  <p className="font-semibold uppercase text-slate-500">
                    Origin Campus &amp; Sender
                  </p>
                  <p className="mt-0.5 font-bold text-chmsu-navy">
                    CHMSU {campusMap[activeDoc.origin_campus_id]?.name ?? "?"}
                  </p>
                  <p className="text-slate-700">{activeDoc.sender_name}</p>
                  <p className="text-slate-500">{activeDoc.sender_office}</p>
                </div>

                <div className="rounded-xl bg-chmsu-canvas p-3">
                  <p className="font-semibold uppercase text-slate-500">
                    Current Campus &amp; Office
                  </p>
                  <p className="mt-0.5 font-bold text-chmsu-navy">
                    CHMSU {campusMap[activeDoc.current_campus_id]?.name ?? "?"}
                  </p>
                  <p className="font-semibold text-slate-700">
                    {activeDoc.current_office}
                  </p>
                </div>

                <div
                  className={`rounded-xl p-3 ${
                    activeSla?.overdue
                      ? "border border-red-200 bg-red-50"
                      : "bg-chmsu-canvas"
                  }`}
                >
                  <p className="font-semibold uppercase text-slate-500">
                    SLA Target &amp; Status
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 font-bold text-slate-900 tabular-nums">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {slaTargetDays ? formatSlaDays(slaTargetDays) : "—"}
                  </p>
                  <p
                    className={`font-semibold tabular-nums ${
                      activeSla?.overdue ? "text-[#DC2626]" : "text-slate-700"
                    }`}
                  >
                    {activeSla?.label}
                  </p>
                  <p className="text-[11px] text-slate-500 tabular-nums">
                    Due {formatDateTime(activeDoc.due_at)}
                  </p>
                </div>
              </div>

              {/* Chronological Routing / Custody History (Read-Only) */}
              <div className="border-t border-chmsu-border pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Routing &amp; Custody History
                </h3>
                {activeRoutes.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No routing history entries recorded yet.
                  </p>
                ) : (
                  <ol className="mt-3 max-h-72 space-y-3 overflow-y-auto border-l-2 border-chmsu-green/30 pl-4 pr-1">
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
                          {step.scanned_via_qr ? " • QR Scan" : ""}
                        </p>
                        {step.actor?.full_name && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Handled by {step.actor.full_name}
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
    </div>
  );
}
