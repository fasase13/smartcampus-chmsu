"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Paperclip,
  QrCode,
  Radio,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_PRIORITIES,
  DOCUMENT_STATUS_META,
  DOCUMENT_TYPES,
  MAX_DOCUMENT_FILE_BYTES,
  ROUTE_ACTION_LABELS,
  SLA_PRESETS,
  STORAGE_BUCKETS,
} from "@/lib/constants";
import QrSlipModal from "@/components/QrSlipModal";

function generateTrackingCode(campusCode) {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `CHMSU-${campusCode}-${year}-${rand}`;
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

function isDocOverdue(doc) {
  if (!doc) return false;
  if (doc.status === "completed" || doc.status === "archived") return false;
  if (doc.is_delayed) return true;
  return Boolean(doc.due_at && new Date(doc.due_at) < new Date());
}

export default function RmoPortalClient({
  profile,
  campus,
  allCampuses,
  staffDirectory,
  initialDocuments,
}) {
  const campusMap = useMemo(
    () => Object.fromEntries(allCampuses.map((c) => [c.id, c])),
    [allCampuses]
  );

  // Registration Form State
  const [trackingCode, setTrackingCode] = useState(() =>
    generateTrackingCode(campus.code)
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [priority, setPriority] = useState("routine");
  const [senderName, setSenderName] = useState("");
  const [senderOffice, setSenderOffice] = useState("");
  const [destinationCampusId, setDestinationCampusId] = useState(campus.id);
  const [destinationOffice, setDestinationOffice] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [slaHours, setSlaHours] = useState(48);
  const [attachedFile, setAttachedFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Registry State
  const [documents, setDocuments] = useState(initialDocuments);
  const [realtimeLive, setRealtimeLive] = useState(false);
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
  const [nowMs, setNowMs] = useState(0);

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
    const hours = Number(slaHours) || 48;
    return new Date(nowMs + hours * 3600 * 1000);
  }, [slaHours, nowMs]);

  // Filter recipient dropdown to destination campus staff (plus cross-campus)
  const destinationStaff = useMemo(() => {
    return staffDirectory.filter(
      (s) =>
        s.campus_id === destinationCampusId ||
        s.role === "admin" ||
        s.role === "management"
    );
  }, [staffDirectory, destinationCampusId]);

  const refreshDocuments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("documents")
      .select(
        "id, tracking_code, qr_token, origin_campus_id, current_campus_id, title, description, document_type, priority, status, sender_name, sender_office, current_office, current_holder_id, created_by, file_path, file_name, file_mime_type, file_size_bytes, sla_hours, due_at, is_delayed, delayed_at, completed_at, created_at, updated_at"
      )
      .or(`origin_campus_id.eq.${campus.id},current_campus_id.eq.${campus.id}`)
      .order("created_at", { ascending: false })
      .limit(150);

    if (data) setDocuments(data);
  }, [campus.id]);

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
      .subscribe((status) => {
        setRealtimeLive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campus.slug, inspectDoc, loadDocumentRoutes, refreshDocuments]);

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

  async function handleRegisterDocument(e) {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      const hours = Math.min(720, Math.max(1, Number(slaHours) || 48));
      const dueAtIso = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      const isInterCampus = destinationCampusId !== campus.id;

      // 1. Insert document row (Postgres generates id & opaque qr_token)
      const { data: createdDoc, error: insertError } = await supabase
        .from("documents")
        .insert({
          tracking_code: trackingCode.trim().toUpperCase(),
          origin_campus_id: campus.id,
          current_campus_id: destinationCampusId,
          title: title.trim(),
          description: description.trim() || null,
          document_type: documentType,
          priority,
          status: isInterCampus ? "in_transit" : "registered",
          sender_name: senderName.trim(),
          sender_office: senderOffice.trim() || null,
          current_office: destinationOffice.trim(),
          current_holder_id: recipientId || null,
          created_by: profile.id,
          sla_hours: hours,
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
        const storagePath = `${campus.slug}/${createdDoc.id}/${safeName}`;

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
        campus_id: campus.id,
        from_office: senderOffice.trim() || "RMO Intake Window",
        to_office: destinationOffice.trim(),
        from_user_id: profile.id,
        to_user_id: recipientId || null,
        acted_by: profile.id,
        action: "registered",
        remarks: isInterCampus
          ? `Registered at CHMSU ${campus.name} RMO for inter-campus routing to CHMSU ${campusMap[destinationCampusId]?.name ?? "destination"}.`
          : `Registered at CHMSU ${campus.name} RMO.`,
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
          message: `"${finalDoc.title}" (${finalDoc.document_type}) has been registered at CHMSU ${campus.name} and routed to ${finalDoc.current_office}.`,
        });
      }

      // 5. Record immutable audit log
      await supabase.from("audit_logs").insert({
        campus_id: campus.id,
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

      await refreshDocuments();
      setQrSlipDoc(finalDoc);

      // Reset form for next intake
      setTrackingCode(generateTrackingCode(campus.code));
      setTitle("");
      setDescription("");
      setSenderName("");
      setSenderOffice("");
      setDestinationCampusId(campus.id);
      setDestinationOffice("");
      setRecipientId("");
      setSlaHours(48);
      setAttachedFile(null);

      setFeedback({
        type: "success",
        message: `Document ${finalDoc.tracking_code} registered! QR Routing Slip is ready to print.`,
      });
    } finally {
      setSubmitting(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-chmsu-forest">
            RMO Document Intake &amp; Registry
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Register official documents, attach files securely, generate
            printable QR slips, and monitor intra- and inter-campus routing for
            CHMSU {campus.name}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            <Radio
              className={`h-3.5 w-3.5 ${
                realtimeLive ? "text-emerald-600 animate-pulse" : "text-slate-400"
              }`}
            />
            {realtimeLive ? "Live Registry" : "Connecting..."}
          </span>
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-800 tabular-nums">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              {overdueCount} Overdue
            </span>
          )}
        </div>
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

      {/* 1. Document Registration Form */}
      <section className="no-print rounded-2xl border border-chmsu-border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-chmsu-border pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-chmsu-forest">
              <FilePlus2 className="h-5 w-5 text-chmsu-green" />
              Register New Document
            </h2>
            <p className="text-xs text-slate-500">
              Generates a unique opaque QR token and printable CHMSU routing
              slip immediately on save.
            </p>
          </div>
        </div>

        <form onSubmit={handleRegisterDocument} className="mt-4 space-y-4">
          {/* Row 1: Tracking Code + Document Type + Priority */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="rmo_tracking_code"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Tracking Code *
              </label>
              <div className="mt-1 flex gap-1.5">
                <input
                  id="rmo_tracking_code"
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
                    setTrackingCode(generateTrackingCode(campus.code))
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
                htmlFor="rmo_doc_type"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Document Type *
              </label>
              <select
                id="rmo_doc_type"
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
                htmlFor="rmo_priority"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Priority *
              </label>
              <select
                id="rmo_priority"
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
                htmlFor="rmo_title"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Document Title / Subject *
              </label>
              <input
                id="rmo_title"
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
                htmlFor="rmo_desc"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Description / Summary (Optional)
              </label>
              <input
                id="rmo_desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief routing instructions or context..."
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
              />
            </div>
          </div>

          {/* Row 3: Sender & Destination Campus / Office */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label
                htmlFor="rmo_sender_name"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Sender Name *
              </label>
              <input
                id="rmo_sender_name"
                type="text"
                required
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="e.g., Dr. Elena Cruz"
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
              />
            </div>

            <div>
              <label
                htmlFor="rmo_sender_office"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Sender Office
              </label>
              <input
                id="rmo_sender_office"
                type="text"
                value={senderOffice}
                onChange={(e) => setSenderOffice(e.target.value)}
                placeholder="e.g., Alijis Campus Dean Office"
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
              />
            </div>

            <div>
              <label
                htmlFor="rmo_dest_campus"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Destination Campus *
              </label>
              <select
                id="rmo_dest_campus"
                value={destinationCampusId}
                onChange={(e) => {
                  setDestinationCampusId(e.target.value);
                  setRecipientId("");
                }}
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
              >
                {allCampuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    CHMSU {c.name} {c.id === campus.id ? "(This Campus)" : "(Inter-Campus)"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="rmo_dest_office"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Destination Office *
              </label>
              <input
                id="rmo_dest_office"
                type="text"
                required
                value={destinationOffice}
                onChange={(e) => setDestinationOffice(e.target.value)}
                placeholder="e.g., Office of the VPAA"
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
              />
            </div>
          </div>

          {/* Row 4: Recipient, SLA Presets, Attachment */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <label
                htmlFor="rmo_recipient"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Assign Recipient (Optional)
              </label>
              <select
                id="rmo_recipient"
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green"
              >
                <option value="">Unassigned (Office Queue)</option>
                {destinationStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.role.replace("_", " ")})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="rmo_sla"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                SLA Target (Hours) &mdash; Due{" "}
                {computedDueAt ? formatDateTime(computedDueAt.toISOString()) : "—"}
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {SLA_PRESETS.map((preset) => (
                  <button
                    key={preset.hours}
                    type="button"
                    onClick={() => setSlaHours(preset.hours)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      Number(slaHours) === preset.hours
                        ? "bg-chmsu-navy text-white"
                        : "border border-chmsu-border bg-chmsu-canvas text-slate-700 hover:border-chmsu-navy"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <input
                  id="rmo_sla"
                  type="number"
                  min={1}
                  max={720}
                  value={slaHours}
                  onChange={(e) => setSlaHours(e.target.value)}
                  className="w-20 rounded-lg border border-chmsu-border bg-white px-2.5 py-1.5 text-xs font-semibold tabular-nums text-slate-900 outline-none focus:border-chmsu-green"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="rmo_file"
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
                  id="rmo_file"
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
                  <th className="px-5 py-3 text-right">Actions</th>
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

                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setQrSlipDoc(doc)}
                            className="inline-flex items-center gap-1 rounded-lg border border-chmsu-border bg-white px-2.5 py-1.5 text-xs font-semibold text-chmsu-forest hover:border-chmsu-green hover:bg-chmsu-green/10"
                          >
                            <QrCode className="h-3.5 w-3.5 text-chmsu-green" />
                            QR Slip
                          </button>
                          <button
                            type="button"
                            onClick={() => openInspectDrawer(doc)}
                            className="inline-flex items-center gap-1 rounded-lg border border-chmsu-border bg-white px-2.5 py-1.5 text-xs font-semibold text-chmsu-navy hover:border-chmsu-navy"
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
  );
}
