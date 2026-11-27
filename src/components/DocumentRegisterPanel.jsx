"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FilePlus2,
  Loader2,
  QrCode,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_PRIORITIES,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_FILE_BYTES,
  ROLE_LABELS,
  ROLES,
  SLA_PRESETS,
  STORAGE_BUCKETS,
} from "@/lib/constants";

const DOCUMENT_REGISTER_ALLOWED_ROLES = [
  ROLES.FACULTY,
  ROLES.STAFF,
  ROLES.RMO,
];

const FORBIDDEN_REGISTER_MESSAGE =
  "Administrators, Institutional Management, and students are not permitted to register or send documents.";
import {
  getAllDestinationOfficesForCampus,
  getDestinationOfficesForCampus,
} from "@/lib/chmsuDirectory";
import QrSlipModal from "@/components/QrSlipModal";

function generateTrackingCode(campusCode) {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CHMSU-${campusCode || "CHMSU"}-${year}-${rand}`;
}

function sanitizeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
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

export default function DocumentRegisterPanel({
  profile,
  campus,
  allCampuses = [],
  onDocumentRegistered,
  heading = "Register New Document",
  subtitle = "Generates a unique opaque QR token and printable CHMSU routing slip immediately on save.",
  showPageHeader = false,
}) {
  // Prefer profile.campus_id first so campus-bound users always insert with
  // their assigned origin_campus_id (matching RLS), falling back to portal campus
  const defaultOriginCampus =
    (profile?.campus_id
      ? allCampuses.find((c) => c.id === profile.campus_id)
      : null) ??
    (campus?.id ? campus : null) ??
    allCampuses.find((c) => c.is_main) ??
    allCampuses[0] ??
    null;

  const campusMap = useMemo(
    () => Object.fromEntries(allCampuses.map((c) => [c.id, c])),
    [allCampuses]
  );

  // Strictly locked Sender Name & Sender Office derived from authenticated profile
  const lockedSenderName =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? "").trim() ||
    "CHMSU Staff";
  const lockedSenderOffice = String(
    profile?.office_location ||
      profile?.department ||
      ROLE_LABELS[profile?.role] ||
      "CHMSU Office"
  ).trim();

  const originCampusId = profile?.campus_id || defaultOriginCampus?.id || "";
  const originCampusCode = defaultOriginCampus?.code ?? "CHMSU";
  const originCampusSlug = defaultOriginCampus?.slug ?? "talisay";
  const originCampusName = defaultOriginCampus?.name ?? "CHMSU";

  // Registration Form State
  const [trackingCode, setTrackingCode] = useState(() =>
    generateTrackingCode(originCampusCode)
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [priority, setPriority] = useState("routine");
  const [destinationCampusId, setDestinationCampusId] =
    useState(originCampusId);
  const [destinationOffice, setDestinationOffice] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [eligibleRecipients, setEligibleRecipients] = useState([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [slaDays, setSlaDays] = useState(2);
  const [attachedFile, setAttachedFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Printable QR Slip Modal & Feedback
  const [qrSlipDoc, setQrSlipDoc] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [nowMs, setNowMs] = useState(0);
  const fileInputRef = useRef(null);
  const recipientReqIdRef = useRef(0);

  useEffect(() => {
    const initialTick = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => {
      clearTimeout(initialTick);
      clearInterval(timer);
    };
  }, []);

  const computedDueAt = useMemo(() => {
    if (!nowMs) return null;
    const days = Math.min(90, Math.max(1, Number(slaDays) || 2));
    return new Date(nowMs + days * 24 * 3600 * 1000);
  }, [slaDays, nowMs]);

  const destinationCampusSlug =
    campusMap[destinationCampusId]?.slug ?? originCampusSlug;

  const destinationOfficeGroups = useMemo(
    () => getDestinationOfficesForCampus(destinationCampusSlug),
    [destinationCampusSlug]
  );

  const validDestinationOffices = useMemo(
    () => new Set(getAllDestinationOfficesForCampus(destinationCampusSlug)),
    [destinationCampusSlug]
  );

  const fetchEligibleRecipients = useCallback(async (campusId, officeName) => {
    const cleanOffice = String(officeName ?? "").trim();
    const reqId = ++recipientReqIdRef.current;

    if (!campusId || !cleanOffice) {
      setEligibleRecipients([]);
      setLoadingRecipients(false);
      return;
    }

    setLoadingRecipients(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "get_eligible_document_recipients",
        {
          p_campus_id: campusId,
          p_destination_office: cleanOffice,
        }
      );

      if (recipientReqIdRef.current !== reqId) return;
      if (error) {
        setEligibleRecipients([]);
      } else {
        setEligibleRecipients(Array.isArray(data) ? data : []);
      }
    } finally {
      if (recipientReqIdRef.current === reqId) {
        setLoadingRecipients(false);
      }
    }
  }, []);

  function handleDestinationCampusChange(nextCampusId) {
    setDestinationCampusId(nextCampusId);
    setDestinationOffice("");
    setRecipientId("");
    setEligibleRecipients([]);
    setLoadingRecipients(false);
  }

  function handleDestinationOfficeChange(nextOffice) {
    setDestinationOffice(nextOffice);
    setRecipientId("");
    fetchEligibleRecipients(destinationCampusId, nextOffice);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setAttachedFile(null);
      return;
    }
    if (file.size > MAX_DOCUMENT_FILE_BYTES) {
      setFeedback({
        type: "error",
        message: "File exceeds the 15 MB maximum upload limit.",
      });
      e.target.value = "";
      return;
    }
    if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type)) {
      setFeedback({
        type: "error",
        message:
          "Unsupported file format. Please upload PDF, Word, Excel, or image files.",
      });
      e.target.value = "";
      return;
    }
    setFeedback(null);
    setAttachedFile(file);
  }

  const isAllowedToRegister = DOCUMENT_REGISTER_ALLOWED_ROLES.includes(
    profile?.role
  );

  async function handleRegisterDocument(e) {
    e.preventDefault();
    setFeedback(null);

    if (!isAllowedToRegister) {
      setFeedback({
        type: "error",
        message: `403 Forbidden — ${FORBIDDEN_REGISTER_MESSAGE}`,
      });
      return;
    }

    if (!originCampusId) {
      setFeedback({
        type: "error",
        message: "No active campus found for document registration.",
      });
      return;
    }

    const cleanDestOffice = destinationOffice.trim();
    if (!cleanDestOffice || !validDestinationOffices.has(cleanDestOffice)) {
      setFeedback({
        type: "error",
        message:
          "Please select a valid Destination Office for the selected campus.",
      });
      return;
    }

    if (recipientId && recipientId === profile.id) {
      setFeedback({
        type: "error",
        message: "You cannot assign yourself as the document recipient.",
      });
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();
      const days = Math.min(90, Math.max(1, Math.round(Number(slaDays) || 2)));
      const hoursForDb = Math.min(720, Math.max(24, days * 24));
      const dueAtIso = new Date(
        Date.now() + days * 24 * 3600 * 1000
      ).toISOString();
      const isInterCampus = destinationCampusId !== originCampusId;

      // 1. Insert document row (sender_name & sender_office strictly from authenticated profile)
      const { data: createdDoc, error: insertError } = await supabase
        .from("documents")
        .insert({
          tracking_code: trackingCode.trim().toUpperCase(),
          origin_campus_id: originCampusId,
          current_campus_id: destinationCampusId,
          title: title.trim(),
          description: description.trim() || null,
          document_type: documentType,
          priority,
          status: isInterCampus ? "in_transit" : "registered",
          sender_name: lockedSenderName,
          sender_office: lockedSenderOffice,
          current_office: cleanDestOffice,
          current_holder_id: recipientId || null,
          created_by: profile.id,
          sla_hours: hoursForDb,
          due_at: dueAtIso,
        })
        .select("*")
        .single();

      if (insertError) {
        setFeedback({
          type: "error",
          message: insertError.message.includes("tracking_code")
            ? "That tracking code already exists. Click regenerate and try again."
            : insertError.message,
        });
        return;
      }

      let finalDoc = createdDoc;

      // 2. Upload file to private `document-files` bucket if attached
      if (attachedFile) {
        const safeName = sanitizeFileName(attachedFile.name);
        const storagePath = `${originCampusSlug}/${createdDoc.id}/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKETS.DOCUMENT_FILES)
          .upload(storagePath, attachedFile, {
            contentType: attachedFile.type,
            upsert: true,
          });

        if (uploadError) {
          setFeedback({
            type: "error",
            message: `Document registered (${createdDoc.tracking_code}), but file upload failed: ${uploadError.message}`,
          });
        } else {
          const { data: updatedDoc } = await supabase
            .from("documents")
            .update({
              file_path: storagePath,
              file_name: attachedFile.name,
              file_mime_type: attachedFile.type,
              file_size_bytes: attachedFile.size,
            })
            .eq("id", createdDoc.id)
            .select("*")
            .single();

          if (updatedDoc) finalDoc = updatedDoc;
        }
      }

      // 3. Append initial `registered` custody route
      await supabase.from("document_routes").insert({
        document_id: finalDoc.id,
        campus_id: originCampusId,
        from_office: lockedSenderOffice,
        to_office: cleanDestOffice,
        from_user_id: profile.id,
        to_user_id: recipientId || null,
        acted_by: profile.id,
        action: "registered",
        remarks: isInterCampus
          ? `Registered at CHMSU ${originCampusName} (${lockedSenderOffice}) for inter-campus routing to CHMSU ${campusMap[destinationCampusId]?.name ?? "destination"}.`
          : `Registered at CHMSU ${originCampusName} (${lockedSenderOffice}).`,
        scanned_via_qr: false,
      });

      // 4. Notify recipient if selected
      if (recipientId) {
        await supabase.from("notifications").insert({
          user_id: recipientId,
          campus_id: destinationCampusId,
          document_id: finalDoc.id,
          type: "document_assigned",
          title: `New Document Routed: ${finalDoc.tracking_code}`,
          message: `"${finalDoc.title}" (${finalDoc.document_type}) has been registered at CHMSU ${originCampusName} by ${lockedSenderName} and routed to ${finalDoc.current_office}.`,
        });
      }

      // 5. Record immutable audit log
      await supabase.from("audit_logs").insert({
        campus_id: originCampusId,
        actor_id: profile.id,
        actor_role: profile.role,
        action: "document.registered",
        entity_type: "document",
        entity_id: finalDoc.id,
        metadata: {
          tracking_code: finalDoc.tracking_code,
          document_type: finalDoc.document_type,
          priority: finalDoc.priority,
          inter_campus: isInterCampus,
          destination_campus_id: destinationCampusId,
          destination_office: finalDoc.current_office,
          has_attachment: Boolean(finalDoc.file_path),
        },
      });

      if (onDocumentRegistered) {
        await onDocumentRegistered(finalDoc);
      }

      setQrSlipDoc(finalDoc);

      // Reset form for next intake (Sender Name & Sender Office remain auto-filled from profile)
      setTrackingCode(generateTrackingCode(originCampusCode));
      setTitle("");
      setDescription("");
      setDestinationCampusId(originCampusId);
      setDestinationOffice("");
      setRecipientId("");
      setEligibleRecipients([]);
      setSlaDays(2);
      setAttachedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setFeedback({
        type: "success",
        message: `Document ${finalDoc.tracking_code} registered! QR Routing Slip is ready to print.`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAllowedToRegister) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <h2 className="text-base font-bold">
              403 &mdash; Document Registration Not Permitted
            </h2>
            <p className="mt-1 text-sm text-red-800">
              {FORBIDDEN_REGISTER_MESSAGE}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {showPageHeader && (
        <div className="no-print">
          <h1 className="text-2xl font-bold tracking-tight text-chmsu-forest">
            Send / Register Document
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Register an official document, attach files securely, route intra-
            or inter-campus, and generate a printable CHMSU QR routing slip.
          </p>
        </div>
      )}

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

      <section className="no-print rounded-2xl border border-chmsu-border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-chmsu-border pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-chmsu-forest">
              <FilePlus2 className="h-5 w-5 text-chmsu-green" />
              {heading}
            </h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>

        <form onSubmit={handleRegisterDocument} className="mt-4 space-y-4">
          {/* Row 1: Tracking Code + Document Type + Priority */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="doc_reg_tracking_code"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Tracking Code *
              </label>
              <div className="mt-1 flex gap-1.5">
                <input
                  id="doc_reg_tracking_code"
                  type="text"
                  required
                  minLength={6}
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas px-3 py-2 font-mono text-sm font-semibold uppercase text-chmsu-forest outline-none focus:border-chmsu-green focus:bg-white"
                />
                <button
                  type="button"
                  onClick={() =>
                    setTrackingCode(generateTrackingCode(originCampusCode))
                  }
                  title="Regenerate tracking code"
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-chmsu-border px-2.5 text-slate-600 hover:border-chmsu-green hover:text-chmsu-forest"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="doc_reg_type"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Document Type *
              </label>
              <select
                id="doc_reg_type"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
              >
                {DOCUMENT_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {dt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="doc_reg_priority"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Priority *
              </label>
              <select
                id="doc_reg_priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
              >
                {DOCUMENT_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Title & Description */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="doc_reg_title"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Document Title / Subject *
              </label>
              <input
                id="doc_reg_title"
                type="text"
                required
                minLength={3}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Special Order No. 114 — Faculty Designation"
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
              />
            </div>

            <div>
              <label
                htmlFor="doc_reg_desc"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Description / Summary (Optional)
              </label>
              <input
                id="doc_reg_desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief routing instructions or context..."
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
              />
            </div>
          </div>

          {/* Row 3: Locked Sender Info + Cascading Destination Campus / Office */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="doc_reg_sender_name"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Sender Name *
              </label>
              <input
                id="doc_reg_sender_name"
                type="text"
                required
                readOnly
                value={lockedSenderName}
                className="mt-1 w-full cursor-not-allowed rounded-xl border border-chmsu-border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="doc_reg_sender_office"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Sender Office *
              </label>
              <input
                id="doc_reg_sender_office"
                type="text"
                required
                readOnly
                value={lockedSenderOffice}
                className="mt-1 w-full cursor-not-allowed rounded-xl border border-chmsu-border bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="doc_reg_dest_campus"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Destination Campus *
              </label>
              <select
                id="doc_reg_dest_campus"
                value={destinationCampusId}
                onChange={(e) => handleDestinationCampusChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
              >
                {allCampuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    CHMSU {c.name}{" "}
                    {c.id === originCampusId
                      ? "(This Campus)"
                      : "(Inter-Campus)"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="doc_reg_dest_office"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Destination Office *
              </label>
              <select
                id="doc_reg_dest_office"
                required
                value={destinationOffice}
                onChange={(e) => handleDestinationOfficeChange(e.target.value)}
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
              >
                <option value="">Select destination office...</option>
                {destinationOfficeGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((office) => (
                      <option key={office} value={office}>
                        {office}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Recipient, SLA Presets, Attachment */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <label
                htmlFor="doc_reg_recipient"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                <span>Assign Recipient (Optional)</span>
                {loadingRecipients && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-chmsu-green" />
                )}
              </label>
              <select
                id="doc_reg_recipient"
                value={recipientId}
                disabled={loadingRecipients}
                onChange={(e) => setRecipientId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green disabled:opacity-70"
              >
                <option value="">
                  {loadingRecipients
                    ? "Loading eligible recipients..."
                    : "Unassigned (Office Queue)"}
                </option>
                {eligibleRecipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatRecipientOption(r)}
                  </option>
                ))}
              </select>
              {!destinationOffice ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Select a destination office to load eligible recipients.
                </p>
              ) : !loadingRecipients && eligibleRecipients.length === 0 ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  No specific staff matched — document will route to the Office
                  Queue.
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="doc_reg_sla"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                SLA Target (Days) &mdash; Due{" "}
                {computedDueAt
                  ? formatDateTime(computedDueAt.toISOString())
                  : "—"}
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {SLA_PRESETS.map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => setSlaDays(preset.days)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      Number(slaDays) === preset.days
                        ? "bg-chmsu-navy text-white"
                        : "border border-chmsu-border bg-chmsu-canvas text-slate-700 hover:border-chmsu-navy"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <input
                  id="doc_reg_sla"
                  type="number"
                  min={1}
                  max={90}
                  step={1}
                  value={slaDays}
                  onChange={(e) => setSlaDays(e.target.value)}
                  className="w-20 rounded-lg border border-chmsu-border bg-white px-2.5 py-1.5 text-xs font-semibold tabular-nums text-slate-900 outline-none focus:border-chmsu-green"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="doc_reg_file"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Attach Scanned File (PDF/Doc/Image, max 15 MB)
              </label>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-chmsu-border bg-chmsu-canvas px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-chmsu-green hover:bg-white">
                <Upload className="h-4 w-4 shrink-0 text-chmsu-green" />
                <span className="truncate">
                  {attachedFile ? attachedFile.name : "Choose file to upload..."}
                </span>
                <input
                  ref={fileInputRef}
                  id="doc_reg_file"
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-chmsu-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registering &amp; Generating QR...
                </>
              ) : (
                <>
                  <QrCode className="h-4 w-4" />
                  Register &amp; Generate QR Slip
                </>
              )}
            </button>
          </div>
        </form>
      </section>

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
