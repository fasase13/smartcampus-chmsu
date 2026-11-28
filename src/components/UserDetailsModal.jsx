"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  IdCard,
  Loader2,
  X,
  ZoomIn,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ROLE_LABELS,
  ROLES,
  STORAGE_BUCKETS,
  getUserAccountStatus,
} from "@/lib/constants";

function getInitials(fullName, email) {
  const name = String(fullName ?? "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const fallback = String(email ?? "U").trim();
  return fallback.slice(0, 2).toUpperCase();
}

export default function UserDetailsModal({
  user,
  campusLabel,
  cannotDeactivateReason = "",
  togglingStatus = false,
  onToggleActive,
  onReviewPending,
  reviewPendingLabel = "Review in Pending Registrations",
  onClose,
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photoUrls, setPhotoUrls] = useState({ front: "", back: "" });
  const [photoError, setPhotoError] = useState("");
  const [zoomedPhoto, setZoomedPhoto] = useState(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function loadSignedIdPhotos() {
      setAvatarFailed(false);
      setPhotoUrls({ front: "", back: "" });
      setPhotoError("");
      setZoomedPhoto(null);

      if (!user.id_front_path && !user.id_back_path) {
        setLoadingPhotos(false);
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
              "Unable to load private School ID photos."
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

    loadSignedIdPhotos();
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) return null;

  const hasIdPhotos = Boolean(user.id_front_path || user.id_back_path);
  const initials = getInitials(user.full_name, user.email);
  const showAvatarImg = Boolean(user.avatar_url) && !avatarFailed;
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const accountStatus = getUserAccountStatus(user);

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="User Details"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      >
        <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-xl">
          {/* Fixed Header */}
          <div className="flex shrink-0 items-center justify-between bg-chmsu-forest px-5 py-4 text-white">
            <div>
              <h3 className="text-base font-bold">User Details</h3>
              <p className="text-xs text-chmsu-gold">{user.full_name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close user details"
              className="cursor-pointer rounded-lg p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {/* Profile Picture & Identity Summary */}
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-chmsu-border bg-chmsu-canvas/70 p-4">
              {showAvatarImg ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={user.avatar_url}
                  alt={user.full_name || "User avatar"}
                  onError={() => setAvatarFailed(true)}
                  className="h-16 w-16 shrink-0 rounded-full border-2 border-slate-200 object-cover bg-white"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-[#143D29] text-lg font-bold tracking-wide text-white"
                >
                  {initials}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h4 className="truncate text-base font-bold text-slate-900">
                  {user.full_name}
                </h4>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-chmsu-navy/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-navy">
                    {roleLabel}
                  </span>
                  <span
                    className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${accountStatus.badgeClass}`}
                  >
                    {accountStatus.label}
                  </span>
                  {user.employee_or_student_id && (
                    <span className="rounded-md border border-chmsu-border bg-white px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-chmsu-forest">
                      ID {user.employee_or_student_id}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Account Information Table */}
            <div className="divide-y divide-chmsu-border rounded-xl border border-chmsu-border bg-chmsu-canvas text-sm">
              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-xs font-semibold text-slate-500">
                  Full Name
                </span>
                <span className="text-right font-semibold text-slate-900">
                  {user.full_name}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-xs font-semibold text-slate-500">
                  Email
                </span>
                <span className="truncate text-right text-xs font-medium text-slate-800">
                  {user.email}
                </span>
              </div>

              {user.employee_or_student_id && (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    School ID
                  </span>
                  <span className="rounded-md border border-chmsu-border bg-white px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-chmsu-forest">
                    {user.employee_or_student_id}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-xs font-semibold text-slate-500">
                  Role
                </span>
                <span className="rounded-md bg-chmsu-navy/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-navy">
                  {roleLabel}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-xs font-semibold text-slate-500">
                  Campus
                </span>
                <span className="text-right text-xs font-semibold text-slate-800">
                  {campusLabel}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-xs font-semibold text-slate-500">
                  {user.role === ROLES.STUDENT
                    ? "College / Department"
                    : "Office Category"}
                </span>
                <span className="text-right text-xs font-medium text-slate-800">
                  {user.department || "—"}
                </span>
              </div>

              {user.role === ROLES.STUDENT || user.program_or_course ? (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    Program
                  </span>
                  <span className="text-right text-xs font-medium text-slate-800">
                    {user.program_or_course || "—"}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs font-semibold text-slate-500">
                    Office
                  </span>
                  <span className="text-right text-xs font-medium text-slate-800">
                    {user.office_location || "—"}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-xs font-semibold text-slate-500">
                  Status
                </span>
                <span
                  className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${accountStatus.badgeClass}`}
                >
                  {accountStatus.label}
                </span>
              </div>
            </div>

            {/* Submitted School ID Photos Section */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <IdCard className="h-4 w-4 text-chmsu-forest" />
                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Submitted School ID Photos
                </h4>
              </div>

              {!hasIdPhotos ? (
                <div className="rounded-xl border border-dashed border-chmsu-border bg-slate-50 p-4 text-center text-xs text-slate-500">
                  No School ID photos on file for this account.
                </div>
              ) : loadingPhotos ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {["Front of School ID", "Back of School ID"].map((label) => (
                    <div
                      key={label}
                      className="flex h-44 flex-col items-center justify-center gap-2 rounded-lg border border-chmsu-border bg-slate-50 text-xs text-slate-500"
                    >
                      <Loader2 className="h-5 w-5 animate-spin text-chmsu-green" />
                      <span>Loading {label.toLowerCase()}...</span>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {photoError && (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                      <span>{photoError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {[
                      {
                        label: "Front of School ID",
                        url: photoUrls.front,
                        hasPath: Boolean(user.id_front_path),
                      },
                      {
                        label: "Back of School ID",
                        url: photoUrls.back,
                        hasPath: Boolean(user.id_back_path),
                      },
                    ].map((side) => (
                      <div
                        key={side.label}
                        className="overflow-hidden rounded-lg border border-chmsu-border bg-white"
                      >
                        <div className="border-b border-chmsu-border bg-chmsu-canvas px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          {side.label}
                        </div>
                        {side.url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setZoomedPhoto({
                                label: side.label,
                                url: side.url,
                              })
                            }
                            className="group relative flex h-48 w-full cursor-pointer items-center justify-center bg-slate-50 p-2 transition hover:bg-slate-100"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={side.url}
                              alt={`${user.full_name} — ${side.label}`}
                              className="max-h-44 w-full object-contain"
                            />
                            <span className="pointer-events-none absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-slate-900/75 px-2 py-1 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
                              <ZoomIn className="h-3 w-3" />
                              Zoom
                            </span>
                          </button>
                        ) : (
                          <div className="flex h-48 items-center justify-center bg-slate-50 p-4 text-center text-xs text-slate-400">
                            {side.hasPath
                              ? "Unable to display image."
                              : "Not uploaded."}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-chmsu-border bg-white px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl border border-chmsu-border px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Close
            </button>

            {accountStatus.key === "pending" ? (
              onReviewPending ? (
                <button
                  type="button"
                  onClick={onReviewPending}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700"
                >
                  {reviewPendingLabel}
                </button>
              ) : (
                <p className="text-xs font-medium text-amber-700">
                  Registration is pending admin verification.
                </p>
              )
            ) : accountStatus.key === "rejected" ? (
              <p className="text-xs font-medium text-rose-700">
                This registration was rejected.
              </p>
            ) : cannotDeactivateReason ? (
              <p className="text-xs font-medium text-amber-700">
                {cannotDeactivateReason}
              </p>
            ) : user.is_active ? (
              <button
                type="button"
                disabled={togglingStatus}
                onClick={onToggleActive}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {togglingStatus && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Deactivate Account
              </button>
            ) : (
              <button
                type="button"
                disabled={togglingStatus}
                onClick={onToggleActive}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-chmsu-forest px-4 py-2 text-xs font-bold text-white transition hover:bg-chmsu-green disabled:opacity-60"
              >
                {togglingStatus && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Reactivate Account
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Full-Size School ID Lightbox Preview */}
      {zoomedPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoomedPhoto.label}
          onClick={() => setZoomedPhoto(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
              <p className="text-sm font-bold">
                {user.full_name} &mdash; {zoomedPhoto.label}
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={zoomedPhoto.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/90 transition hover:bg-white/10"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Original
                </a>
                <button
                  type="button"
                  onClick={() => setZoomedPhoto(null)}
                  aria-label="Close zoom preview"
                  className="cursor-pointer rounded-lg p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-950 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={zoomedPhoto.url}
                alt={zoomedPhoto.label}
                className="max-h-[76vh] w-auto max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
