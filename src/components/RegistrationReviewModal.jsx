"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  RotateCcw,
  X,
  ZoomIn,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, STORAGE_BUCKETS } from "@/lib/constants";

export const RETURNABLE_FIELD_OPTIONS = [
  { key: "campus_id", label: "Campus" },
  { key: "requested_role", label: "Role" },
  { key: "employee_or_student_id", label: "School ID" },
  { key: "full_name", label: "Full Name" },
  { key: "department", label: "College / Department", hideForRmo: true },
  { key: "program_or_office", label: "Program / Office" },
  { key: "job_title", label: "Job Title", nonStudentOnly: true },
  { key: "is_teaching", label: "Teaches Classes", nonStudentOnly: true },
  { key: "id_photos", label: "School ID Photos" },
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

export default function RegistrationReviewModal({
  user,
  campusName,
  headerLabel = "School ID & Registration Verification",
  onClose,
  onCompleted,
}) {
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photoUrls, setPhotoUrls] = useState({ front: "", back: "" });
  const [photoError, setPhotoError] = useState("");
  const [zoomedPhoto, setZoomedPhoto] = useState(null);

  // Active sub-panel: null | "return" | "reject"
  const [panelMode, setPanelMode] = useState(null);
  const [flaggedFields, setFlaggedFields] = useState([]);
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function loadSignedUrls() {
      setPhotoUrls({ front: "", back: "" });
      setPhotoError("");
      setPanelMode(null);
      setFlaggedFields([]);
      setReason("");
      setLocalError("");
      setZoomedPhoto(null);

      if (!user.id_front_path && !user.id_back_path) {
        setPhotoError("No ID verification photos were attached.");
        return;
      }

      setLoadingPhotos(true);
      try {
        const supabase = createClient();
        const [frontRes, backRes] = await Promise.all([
          user.id_front_path
            ? supabase.storage
                .from(STORAGE_BUCKETS.ID_VERIFICATIONS)
                .createSignedUrl(user.id_front_path, 300)
            : Promise.resolve({ data: null, error: null }),
          user.id_back_path
            ? supabase.storage
                .from(STORAGE_BUCKETS.ID_VERIFICATIONS)
                .createSignedUrl(user.id_back_path, 300)
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (!active) return;

        if (frontRes.error || backRes.error) {
          setPhotoError(
            frontRes.error?.message ||
              backRes.error?.message ||
              "Unable to load private ID photos."
          );
        }

        setPhotoUrls({
          front: frontRes.data?.signedUrl ?? "",
          back: backRes.data?.signedUrl ?? "",
        });
      } finally {
        if (active) setLoadingPhotos(false);
      }
    }

    loadSignedUrls();
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return null;

  const isStudent =
    user.requested_role === "student" || Boolean(user.program_or_course);
  const isRmo = user.requested_role === "rmo";

  function toggleFlag(key) {
    setFlaggedFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function submitDecision(decision) {
    setLocalError("");

    if (decision === "return") {
      if (flaggedFields.length === 0) {
        setLocalError(
          "Please select at least one invalid field to return for correction."
        );
        return;
      }
      if (!reason.trim()) {
        setLocalError("Please provide a clear reason for returning.");
        return;
      }
    }

    if (decision === "reject" && !reason.trim()) {
      setLocalError(
        "Please provide a reason before rejecting and permanently banning this email."
      );
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("review_user_registration", {
        p_target_user_id: user.id,
        p_decision: decision,
        p_reason: decision === "activate" ? null : reason.trim(),
        p_flagged_fields: decision === "return" ? flaggedFields : [],
      });

      if (error) {
        setLocalError(error.message);
        return;
      }

      onCompleted?.(decision, user);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="View ID and Registration Details"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-4 backdrop-blur-xs"
      >
        <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-chmsu-forest px-5 py-4 text-white">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-chmsu-gold">
                {headerLabel} &bull; Private Signed URL (5 min)
              </p>
              <h3 className="text-base font-bold">
                {user.full_name}{" "}
                <span className="ml-1.5 rounded bg-white/15 px-2 py-0.5 font-mono text-xs tracking-widest">
                  {user.employee_or_student_id ?? "No ID"}
                </span>
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="rounded-lg p-1.5 text-white/80 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {/* Read-Only Registration Details Grid (NO editable Campus/Role dropdowns) */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Registration Details (Read-Only)
              </h4>
              <dl className="mt-2 grid grid-cols-1 gap-3 rounded-xl border border-chmsu-border bg-chmsu-canvas p-4 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-slate-500">Full Name</dt>
                  <dd className="mt-0.5 font-bold text-slate-900">
                    {user.full_name || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Email</dt>
                  <dd className="mt-0.5 truncate font-medium text-slate-800">
                    {user.email || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">School ID</dt>
                  <dd className="mt-0.5 font-mono font-bold tracking-widest text-chmsu-forest">
                    {user.employee_or_student_id || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Campus</dt>
                  <dd className="mt-0.5 font-bold text-slate-900">
                    {campusName ? `CHMSU ${campusName}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Role</dt>
                  <dd className="mt-0.5">
                    <span className="inline-flex rounded-md bg-chmsu-navy/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-navy">
                      {ROLE_LABELS[user.requested_role ?? "student"] ??
                        user.requested_role ??
                        "Student"}
                    </span>
                  </dd>
                </div>
                {(!isRmo || user.department) && (
                  <div>
                    <dt className="font-semibold text-slate-500">
                      College / Department
                    </dt>
                    <dd className="mt-0.5 font-semibold text-slate-900">
                      {user.department || "—"}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="font-semibold text-slate-500">
                    {isStudent ? "Program" : "Office"}
                  </dt>
                  <dd className="mt-0.5 font-semibold text-chmsu-forest">
                    {isStudent
                      ? user.program_or_course || "—"
                      : user.office_location || "—"}
                  </dd>
                </div>
                {!isStudent && (
                  <>
                    <div>
                      <dt className="font-semibold text-slate-500">Job Title</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {user.job_title || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">
                        Teaches Classes
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {user.is_teaching ? "Yes" : "No"}
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt className="font-semibold text-slate-500">
                    Submitted Date &amp; Time
                  </dt>
                  <dd className="mt-0.5 font-medium text-slate-700 tabular-nums">
                    {formatDateTime(user.created_at)}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Front & Back School ID Photos */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                School ID Photos (Click to Zoom)
              </h4>

              {photoError && (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {photoError}
                </div>
              )}

              {loadingPhotos ? (
                <div className="mt-2 flex h-44 items-center justify-center gap-2 rounded-xl border border-chmsu-border bg-slate-50 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-chmsu-green" />
                  Loading private ID photos...
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    { label: "Front of School ID", url: photoUrls.front },
                    { label: "Back of School ID", url: photoUrls.back },
                  ].map((photo) => (
                    <div
                      key={photo.label}
                      className="overflow-hidden rounded-xl border border-chmsu-border bg-slate-50"
                    >
                      <div className="flex items-center justify-between border-b border-chmsu-border bg-white px-3 py-2 text-xs font-bold text-chmsu-forest">
                        <span>{photo.label}</span>
                        {photo.url && (
                          <button
                            type="button"
                            onClick={() => setZoomedPhoto(photo)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-chmsu-navy hover:text-chmsu-green"
                          >
                            <ZoomIn className="h-3.5 w-3.5" />
                            Zoom
                          </button>
                        )}
                      </div>
                      {photo.url ? (
                        <button
                          type="button"
                          onClick={() => setZoomedPhoto(photo)}
                          className="block w-full cursor-zoom-in p-2"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.url}
                            alt={photo.label}
                            className="h-52 w-full rounded-lg bg-white object-contain"
                          />
                        </button>
                      ) : (
                        <div className="flex h-52 items-center justify-center text-xs text-slate-400">
                          No image uploaded
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inline Return Panel */}
            {panelMode === "return" && (
              <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                    Select invalid field(s) to correct *
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    Flagged fields will be cleared and the registrant will be
                    blocked from re-submitting the same invalid value.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {RETURNABLE_FIELD_OPTIONS.filter(
                      (opt) =>
                        !(opt.nonStudentOnly && isStudent) &&
                        !(opt.hideForRmo && isRmo)
                    ).map((opt) => {
                      const checked = flaggedFields.includes(opt.key);
                      const pillLabel =
                        isRmo && opt.key === "program_or_office"
                          ? "Office"
                          : opt.label;
                      return (
                        <label
                          key={opt.key}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-semibold transition ${
                            checked
                              ? "border-amber-600 bg-amber-600 text-white"
                              : "border-amber-300 bg-white text-amber-900 hover:border-amber-500"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFlag(opt.key)}
                            className="sr-only"
                          />
                          {pillLabel}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="return-reason"
                    className="block text-xs font-bold uppercase tracking-wide text-amber-900"
                  >
                    Reason for Return *
                  </label>
                  <textarea
                    id="return-reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Blurry front ID photo or School ID does not match the uploaded ID"
                    className="mt-1.5 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-600"
                  />
                </div>
              </div>
            )}

            {/* Inline Reject & Permanent Ban Panel */}
            {panelMode === "reject" && (
              <div className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4">
                <div className="flex items-start gap-2 text-xs text-red-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <p className="font-semibold">
                    Only reject troll or fraudulent registrations. This
                    permanently bans the email address from SmartCampus.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="reject-reason"
                    className="block text-xs font-bold uppercase tracking-wide text-red-900"
                  >
                    Reason for Rejection *
                  </label>
                  <textarea
                    id="reject-reason"
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Fraudulent / meme image uploaded instead of CHMSU School ID"
                    className="mt-1.5 w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-600"
                  />
                </div>
              </div>
            )}

            {localError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800"
              >
                {localError}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-chmsu-border bg-chmsu-canvas px-5 py-3.5">
            {panelMode === "return" ? (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setPanelMode(null);
                    setLocalError("");
                  }}
                  className="rounded-xl border border-chmsu-border bg-white px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => submitDecision("return")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Confirm Return
                </button>
              </>
            ) : panelMode === "reject" ? (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setPanelMode(null);
                    setLocalError("");
                  }}
                  className="rounded-xl border border-chmsu-border bg-white px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => submitDecision("reject")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ban className="h-4 w-4" />
                  )}
                  Confirm Reject &amp; Ban Email
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setPanelMode("return");
                      setReason("");
                      setLocalError("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Return
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setPanelMode("reject");
                      setReason("");
                      setLocalError("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3.5 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={onClose}
                    className="rounded-xl border border-chmsu-border bg-white px-4 py-2 text-xs font-semibold text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => submitDecision("activate")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-chmsu-forest px-4 py-2 text-xs font-bold text-white transition hover:bg-chmsu-green disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Activate Account
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {zoomedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomedPhoto(null)}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950/90 p-4"
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
                className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={zoomedPhoto.url}
              alt={zoomedPhoto.label}
              className="max-h-[82dvh] max-w-full rounded-xl bg-white object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
