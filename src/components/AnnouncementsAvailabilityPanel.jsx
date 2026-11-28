"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  MapPin,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Radio,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_PRIORITIES,
  AVAILABILITY_STATUSES,
  CROSS_CAMPUS_ROLES,
  getAvailabilityMeta,
  normalizeAnnouncementCategory,
} from "@/lib/constants";
import {
  deleteAnnouncementAttachment,
  uploadAnnouncementAttachment,
} from "@/lib/announcementAttachments";
import AnnouncementAttachmentPicker from "@/components/AnnouncementAttachmentPicker";
import AnnouncementAttachment from "@/components/AnnouncementAttachment";

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

export default function AnnouncementsAvailabilityPanel({
  profile,
  campus,
  initialAnnouncements = [],
}) {
  const canPublishUniversityWide = CROSS_CAMPUS_ROLES.includes(profile.role);
  const isTeaching = Boolean(profile?.is_teaching);

  // Live Availability state
  const [availabilityStatus, setAvailabilityStatus] = useState(
    profile.availability_status ?? "offline"
  );
  const [officeLocation, setOfficeLocation] = useState(
    profile.office_location ?? ""
  );
  const [availabilityNote, setAvailabilityNote] = useState(
    profile.availability_note ?? ""
  );
  const [showOnKiosk, setShowOnKiosk] = useState(
    Boolean(profile.show_on_kiosk)
  );
  const [savingAvailability, setSavingAvailability] = useState(false);

  // Announcements state
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [existingAttachment, setExistingAttachment] = useState(null);
  const [removedAttachmentPath, setRemovedAttachmentPath] = useState(null);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [busyRowId, setBusyRowId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const writeAuditLog = useCallback(
    async (supabase, action, entityType, entityId, metadata = {}) => {
      await supabase.from("audit_logs").insert({
        campus_id: campus.id,
        actor_id: profile.id,
        actor_role: profile.role,
        action,
        entity_type: entityType,
        entity_id: entityId,
        metadata,
      });
    },
    [campus.id, profile.id, profile.role]
  );

  const refreshAnnouncements = useCallback(
    async (existingClient) => {
      const supabase = existingClient ?? createClient();
      const { data } = await supabase
        .from("announcements")
        .select(
          "id, campus_id, author_id, title, body, category, priority, is_public, is_pinned, event_start_at, event_end_at, published_at, expires_at, is_active, created_at, attachment_url, attachment_path, attachment_name, attachment_type, attachment_size"
        )
        .or(`campus_id.eq.${campus.id},campus_id.is.null`)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

      if (data) setAnnouncements(data);
    },
    [campus.id]
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`rmo-announcements-${campus.slug}-${profile.id}`)
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

  async function updateAvailability(overrides = {}) {
    if (!isTeaching) return;
    setSavingAvailability(true);
    setFeedback(null);

    const nextStatus = overrides.status ?? availabilityStatus;
    const nextOffice = (overrides.office ?? officeLocation).trim();
    const nextNote = (overrides.note ?? availabilityNote).trim();
    const nextKiosk =
      overrides.showOnKiosk !== undefined ? overrides.showOnKiosk : showOnKiosk;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          availability_status: nextStatus,
          office_location: nextOffice || null,
          availability_note: nextNote || null,
          show_on_kiosk: nextKiosk,
          availability_updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);

      if (error) {
        setFeedback({ type: "error", message: error.message });
        return;
      }

      setAvailabilityStatus(nextStatus);
      setShowOnKiosk(nextKiosk);

      await writeAuditLog(
        supabase,
        "availability.updated",
        "profile",
        profile.id,
        {
          availability_status: nextStatus,
          office_location: nextOffice || null,
          show_on_kiosk: nextKiosk,
        }
      );

      const meta = getAvailabilityMeta(nextStatus);
      setFeedback({
        type: "success",
        message: `Availability updated to "${meta.label}"${
          nextKiosk ? " — synced live to the campus kiosk." : "."
        }`,
      });
    } finally {
      setSavingAvailability(false);
    }
  }

  function resetAnnouncementComposer() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAttachmentFile(null);
    setExistingAttachment(null);
    setRemovedAttachmentPath(null);
    setIsComposerOpen(false);
  }

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

      let uploadedAttachment = null;
      if (attachmentFile) {
        uploadedAttachment = await uploadAnnouncementAttachment(
          supabase,
          profile.id,
          attachmentFile
        );
        Object.assign(payload, uploadedAttachment);
      } else if (editingId && !existingAttachment) {
        Object.assign(payload, {
          attachment_url: null,
          attachment_path: null,
          attachment_name: null,
          attachment_type: null,
          attachment_size: null,
        });
      }

      if (editingId) {
        const { data, error } = await supabase
          .from("announcements")
          .update(payload)
          .eq("id", editingId)
          .eq("author_id", profile.id)
          .select("id, title, category, priority, is_public, is_pinned")
          .single();

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

        if (removedAttachmentPath) {
          await deleteAnnouncementAttachment(supabase, removedAttachmentPath);
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
        resetAnnouncementComposer();
        setFeedback({ type: "success", message: "Announcement updated." });
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
          if (uploadedAttachment?.attachment_path) {
            await deleteAnnouncementAttachment(
              supabase,
              uploadedAttachment.attachment_path
            );
          }
          setFeedback({ type: "error", message: error.message });
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
        resetAnnouncementComposer();
        setFeedback({
          type: "success",
          message: "Announcement published successfully.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: err?.message || "Failed to publish announcement.",
      });
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
      category: normalizeAnnouncementCategory(item.category),
      priority: item.priority ?? "normal",
      event_start_at: toLocalDateTimeInput(item.event_start_at),
      event_end_at: toLocalDateTimeInput(item.event_end_at),
      expires_at: toLocalDateTimeInput(item.expires_at),
      is_public: Boolean(item.is_public),
      is_pinned: Boolean(item.is_pinned),
      university_wide: item.campus_id === null,
    });
    setAttachmentFile(null);
    setExistingAttachment(
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
    setRemovedAttachmentPath(null);
    setIsComposerOpen(true);
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
        setFeedback({ type: "error", message: error.message });
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
      setFeedback({
        type: "success",
        message: nextPinned ? "Announcement pinned." : "Announcement unpinned.",
      });
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
        setFeedback({ type: "error", message: error.message });
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
      setFeedback({
        type: "success",
        message: nextActive
          ? "Announcement reactivated."
          : "Announcement deactivated.",
      });
    } finally {
      setBusyRowId(null);
    }
  }

  async function deleteAnnouncement(item) {
    if (item.author_id !== profile.id) return;
    if (!window.confirm(`Permanently delete "${item.title}"?`)) return;
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
        setFeedback({ type: "error", message: error.message });
        return;
      }

      if (item.attachment_path) {
        await deleteAnnouncementAttachment(supabase, item.attachment_path);
      }

      await writeAuditLog(
        supabase,
        "announcement.deleted",
        "announcement",
        item.id,
        { title: item.title, category: item.category }
      );
      if (editingId === item.id) {
        resetAnnouncementComposer();
      }
      await refreshAnnouncements(supabase);
      setFeedback({ type: "success", message: "Announcement deleted." });
    } finally {
      setBusyRowId(null);
    }
  }

  const myAnnouncements = useMemo(
    () => announcements.filter((a) => a.author_id === profile.id),
    [announcements, profile.id]
  );

  const currentStatusMeta = getAvailabilityMeta(availabilityStatus);

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-chmsu-forest">
            {isTeaching ? "Announcements & Availability" : "Manage Announcements"}
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            {isTeaching
              ? `Manage your real-time office availability and publish notices for CHMSU ${campus.name}.`
              : `Publish campus notices or advisories for CHMSU ${campus.name}.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isTeaching && (
            <span
              className={`inline-flex items-center gap-2 rounded-md border px-3.5 py-1.5 text-xs font-bold ${currentStatusMeta.badgeClass}`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${currentStatusMeta.dotClass}`}
              />
              Status: {currentStatusMeta.label}
            </span>
          )}
          {!isComposerOpen && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
                setAttachmentFile(null);
                setExistingAttachment(null);
                setRemovedAttachmentPath(null);
                setIsComposerOpen(true);
              }}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#143D29] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2e1f]"
            >
              <Plus className="h-4 w-4" />
              New Announcement
            </button>
          )}
        </div>
      </div>

      {/* Feedback */}
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
            aria-label="Dismiss message"
            className="rounded-md p-1 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Live Availability Control (Teaching Personnel Only) & Expandable Announcement Composer */}
      {(isTeaching || isComposerOpen) && (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Live Availability Control (Teaching Personnel Only) */}
        {isTeaching && (
        <section
          className={`rounded-2xl border border-chmsu-border bg-white p-5 ${
            isComposerOpen ? "xl:col-span-5" : "xl:col-span-12"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-chmsu-forest">
                <Radio className="h-5 w-5 text-chmsu-green" />
                Live Availability Control
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                One-click status updates sync in real time to the campus kiosk.
              </p>
            </div>
            {savingAvailability && (
              <Loader2 className="h-4 w-4 animate-spin text-chmsu-green" />
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AVAILABILITY_STATUSES.map((opt) => {
              const selected = availabilityStatus === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingAvailability}
                  onClick={() => updateAvailability({ status: opt.value })}
                  className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                    selected
                      ? "border-chmsu-forest bg-chmsu-forest text-white shadow-xs"
                      : "border-chmsu-border bg-white text-slate-700 hover:border-chmsu-green hover:bg-chmsu-canvas"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${opt.dotClass}`}
                  />
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 space-y-3 border-t border-chmsu-border pt-4">
            <div>
              <label
                htmlFor="rmo_avail_office"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Office / Room Location
              </label>
              <div className="relative mt-1">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="rmo_avail_office"
                  type="text"
                  value={officeLocation}
                  onChange={(e) => setOfficeLocation(e.target.value)}
                  placeholder="e.g., Records Management Office, Ground Floor"
                  className="w-full rounded-xl border border-chmsu-border bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="rmo_avail_note"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Public Status Note (Optional)
              </label>
              <input
                id="rmo_avail_note"
                type="text"
                maxLength={140}
                value={availabilityNote}
                onChange={(e) => setAvailabilityNote(e.target.value)}
                placeholder="e.g., Open for document receiving until 4:30 PM"
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
              />
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-chmsu-border bg-chmsu-canvas px-3.5 py-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Show on Public Kiosk
                </p>
                <p className="text-xs text-slate-500">
                  Opt in to display your availability on the campus kiosk.
                </p>
              </div>
              <input
                type="checkbox"
                checked={showOnKiosk}
                onChange={(e) =>
                  updateAvailability({ showOnKiosk: e.target.checked })
                }
                className="h-5 w-5 rounded accent-chmsu-green"
              />
            </label>

            <button
              type="button"
              disabled={savingAvailability}
              onClick={() => updateAvailability()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Save Office &amp; Note
            </button>
          </div>
        </section>
        )}

        {/* Expandable Announcement Composer */}
        {isComposerOpen && (
        <section
          className={`rounded-2xl border border-chmsu-border bg-white p-5 ${
            isTeaching ? "xl:col-span-7" : "xl:col-span-12"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-chmsu-forest">
                <Plus className="h-5 w-5 text-chmsu-green" />
                {editingId ? "Edit Announcement" : "Publish New Announcement"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Publish notices for CHMSU {campus.name}
                {canPublishUniversityWide ? " or university-wide" : ""}.
              </p>
            </div>
            <button
              type="button"
              onClick={resetAnnouncementComposer}
              aria-label="Close announcement composer"
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-chmsu-border px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>

          <form onSubmit={handleAnnouncementSubmit} className="mt-4 space-y-3.5">
            <div>
              <label
                htmlFor="rmo_ann_title"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Title *
              </label>
              <input
                id="rmo_ann_title"
                type="text"
                required
                minLength={3}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Updated Document Receiving Schedule"
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
              />
            </div>

            <div>
              <label
                htmlFor="rmo_ann_body"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Details / Advisory Content *
              </label>
              <textarea
                id="rmo_ann_body"
                required
                minLength={5}
                rows={4}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Write the full announcement message..."
                className="mt-1 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
              />
            </div>

            <AnnouncementAttachmentPicker
              inputId="rmo_ann_attachment"
              file={attachmentFile}
              existingAttachment={existingAttachment}
              disabled={savingAnnouncement}
              onFileSelect={(picked) => {
                if (existingAttachment?.attachment_path) {
                  setRemovedAttachmentPath(existingAttachment.attachment_path);
                }
                setAttachmentFile(picked);
              }}
              onClear={() => {
                if (existingAttachment?.attachment_path) {
                  setRemovedAttachmentPath(existingAttachment.attachment_path);
                }
                setAttachmentFile(null);
                setExistingAttachment(null);
              }}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="rmo_ann_category"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Category
                </label>
                <select
                  id="rmo_ann_category"
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
                  htmlFor="rmo_ann_priority"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Priority
                </label>
                <select
                  id="rmo_ann_priority"
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
                  htmlFor="rmo_event_start"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Event Start
                </label>
                <input
                  id="rmo_event_start"
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
                  htmlFor="rmo_event_end"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Event End
                </label>
                <input
                  id="rmo_event_end"
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
                  htmlFor="rmo_expires_at"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
                >
                  Auto-Expire
                </label>
                <input
                  id="rmo_expires_at"
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

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={resetAnnouncementComposer}
                disabled={savingAnnouncement}
                className="min-h-11 cursor-pointer rounded-lg border border-chmsu-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingAnnouncement}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-[#143D29] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f2e1f] disabled:opacity-60"
              >
                {savingAnnouncement ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingId ? "Update Announcement" : "Publish Announcement"}
              </button>
            </div>
          </form>
        </section>
        )}
      </div>
      )}

      {/* Owner-Only My Published Announcements */}
      <section className="overflow-hidden rounded-2xl border border-chmsu-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-chmsu-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-chmsu-forest">
              My Published Announcements
            </h2>
            <p className="text-xs text-slate-500">
              Manage announcements you have personally published.
            </p>
          </div>
          <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 tabular-nums">
            {myAnnouncements.length} published
          </span>
        </div>

        {myAnnouncements.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            You have not published any announcements yet. Click{" "}
            <span className="font-semibold text-chmsu-forest">
              + New Announcement
            </span>{" "}
            above to publish your first notice.
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
                      className={`transition hover:bg-slate-50/70 ${
                        !item.is_active ? "opacity-60" : ""
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
                        <AnnouncementAttachment
                          url={item.attachment_url}
                          name={item.attachment_name}
                          type={item.attachment_type}
                          size={item.attachment_size}
                          compact
                        />
                      </td>

                      <td className="px-4 py-3.5 align-top">
                        {item.campus_id === null ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-chmsu-navy/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-navy">
                            <Globe className="h-3 w-3" />
                            University-Wide
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-chmsu-green/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-forest">
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
                            className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                              item.is_active
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {item.is_active ? "Active" : "Inactive"}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
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
                            title={item.is_active ? "Deactivate" : "Reactivate"}
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
  );
}
