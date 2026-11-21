"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CreditCard,
  ImagePlus,
  Loader2,
  LogOut,
  ShieldCheck,
  User,
  UserCheck,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  ALLOWED_ID_PHOTO_MIME_TYPES,
  MAX_ID_PHOTO_BYTES,
  ROLE_LABELS,
  SELF_REGISTER_ROLES,
  STORAGE_BUCKETS,
} from "@/lib/constants";
import PrivacyNoticeModal from "@/components/PrivacyNoticeModal";

const ID_NUMBER_REGEX = /^\d{8}$/;

function extensionForMime(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function validateIdImageFile(file, label) {
  if (!file) {
    return `Please upload the ${label} image of your School ID.`;
  }
  if (!ALLOWED_ID_PHOTO_MIME_TYPES.includes(file.type)) {
    return `${label}: Only JPG, PNG, or WebP images are allowed.`;
  }
  if (file.size > MAX_ID_PHOTO_BYTES) {
    return `${label}: Image must be 5 MB or smaller.`;
  }
  return "";
}

export default function CompleteRegistrationForm({
  campuses,
  userId,
  verifiedEmail,
  preselectedSlug = "",
}) {
  const router = useRouter();

  const initialCampus =
    campuses.find((c) => c.slug === preselectedSlug) ?? campuses[0] ?? null;

  const [campusId, setCampusId] = useState(initialCampus?.id ?? "");
  const [idNumber, setIdNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [requestedRole, setRequestedRole] = useState("student");
  const [department, setDepartment] = useState("");

  const [frontFile, setFrontFile] = useState(null);
  const [frontPreview, setFrontPreview] = useState("");
  const [backFile, setBackFile] = useState(null);
  const [backPreview, setBackPreview] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    return () => {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
    };
  }, [frontPreview]);

  useEffect(() => {
    return () => {
      if (backPreview) URL.revokeObjectURL(backPreview);
    };
  }, [backPreview]);

  function handleFileChange(side, fileList) {
    const file = fileList?.[0];
    if (!file) return;

    const label = side === "front" ? "Front of School ID" : "Back of School ID";
    const err = validateIdImageFile(file, label);
    if (err) {
      setErrorMessage(err);
      return;
    }

    setErrorMessage("");
    const previewUrl = URL.createObjectURL(file);
    if (side === "front") {
      setFrontFile(file);
      setFrontPreview(previewUrl);
    } else {
      setBackFile(file);
      setBackPreview(previewUrl);
    }
  }

  function clearFile(side) {
    if (side === "front") {
      setFrontFile(null);
      setFrontPreview("");
    } else {
      setBackFile(null);
      setBackPreview("");
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

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");

    const cleanId = idNumber.trim();
    const cleanName = fullName.trim();
    const cleanDept = department.trim();

    if (!campusId) {
      setErrorMessage("Please select your CHMSU campus.");
      return;
    }
    if (!ID_NUMBER_REGEX.test(cleanId)) {
      setErrorMessage(
        "Please enter a valid 8-digit School/Student ID number (e.g., 20230399)."
      );
      return;
    }
    if (cleanName.length < 2) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!SELF_REGISTER_ROLES.includes(requestedRole)) {
      setErrorMessage("Please select a valid role.");
      return;
    }
    if (cleanDept.length < 2) {
      setErrorMessage("Please enter your College or Department.");
      return;
    }

    const frontErr = validateIdImageFile(frontFile, "Front of School ID");
    if (frontErr) {
      setErrorMessage(frontErr);
      return;
    }
    const backErr = validateIdImageFile(backFile, "Back of School ID");
    if (backErr) {
      setErrorMessage(backErr);
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();

      // 1. Verify 8-digit ID number availability
      const { data: isAvailable, error: availError } = await supabase.rpc(
        "check_id_number_available",
        { p_id_number: cleanId }
      );

      if (availError) {
        setErrorMessage(
          `Unable to verify ID number availability: ${availError.message}`
        );
        return;
      }

      if (!isAvailable) {
        setErrorMessage(
          `ID Number ${cleanId} is already registered to another account.`
        );
        return;
      }

      // 2. Upload Front & Back School ID photos to private `id-verifications` bucket
      const frontPath = `${userId}/front.${extensionForMime(frontFile.type)}`;
      const backPath = `${userId}/back.${extensionForMime(backFile.type)}`;

      const [frontUpload, backUpload] = await Promise.all([
        supabase.storage
          .from(STORAGE_BUCKETS.ID_VERIFICATIONS)
          .upload(frontPath, frontFile, {
            contentType: frontFile.type,
            upsert: true,
          }),
        supabase.storage
          .from(STORAGE_BUCKETS.ID_VERIFICATIONS)
          .upload(backPath, backFile, {
            contentType: backFile.type,
            upsert: true,
          }),
      ]);

      if (frontUpload.error || backUpload.error) {
        setErrorMessage(
          `ID photo upload failed: ${
            frontUpload.error?.message || backUpload.error?.message
          }. Please try again.`
        );
        return;
      }

      // 3. Complete Step 3 profile credentials via SECURITY DEFINER RPC
      const { error: completeError } = await supabase.rpc(
        "complete_registration_credentials",
        {
          p_campus_id: campusId,
          p_id_number: cleanId,
          p_full_name: cleanName,
          p_requested_role: requestedRole,
          p_department: cleanDept,
          p_front_path: frontPath,
          p_back_path: backPath,
        }
      );

      if (completeError) {
        setErrorMessage(completeError.message);
        return;
      }

      // 4. Redirect to Pending Admin Verification screen
      router.push("/pending-approval");
      router.refresh();
    } catch {
      setErrorMessage(
        "An unexpected error occurred while saving your credentials. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900">
      {/* Top Bar */}
      <header className="border-b border-chmsu-border bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-chmsu-border bg-white p-0.5">
              <Image
                src="/images/chmsu-logo.jpg"
                alt="CHMSU Seal"
                width={32}
                height={32}
                className="h-full w-full rounded-full object-contain"
              />
            </div>
            <span className="text-sm font-bold text-chmsu-forest">
              SmartCampus CHMSU
            </span>
          </Link>

          <button
            type="button"
            disabled={signingOut}
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 rounded-lg border border-chmsu-border px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
          >
            {signingOut ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Step 3 Card */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 items-start justify-center px-4 py-8 sm:py-10">
        <div className="w-full overflow-hidden rounded-2xl border border-chmsu-border bg-chmsu-card shadow-xs">
          {/* Header */}
          <div className="bg-chmsu-forest px-6 py-5 text-white">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white p-1">
                <Image
                  src="/images/chmsu-logo.jpg"
                  alt="CHMSU Seal"
                  width={44}
                  height={44}
                  className="h-full w-full rounded-full object-contain"
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-chmsu-gold">
                  Step 3 of 3 &bull; Final Step
                </p>
                <h1 className="text-lg font-bold tracking-tight sm:text-xl">
                  School Credentials &amp; ID Verification
                </h1>
              </div>
            </div>
          </div>

          {/* 3-Step Indicator */}
          <ol className="grid grid-cols-3 gap-2 border-b border-chmsu-border bg-chmsu-canvas px-6 py-3 text-xs">
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chmsu-green text-white">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
              <span className="truncate font-semibold text-chmsu-forest">
                Account
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chmsu-green text-white">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
              <span className="truncate font-semibold text-chmsu-forest">
                Verify Email
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chmsu-forest text-[11px] font-bold text-chmsu-gold">
                3
              </span>
              <span className="truncate font-semibold text-chmsu-forest">
                School ID
              </span>
            </li>
          </ol>

          <form onSubmit={handleSubmit} className="space-y-5 p-6">
            {/* Green Email Verified Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Email Verified</span>
              </div>
              <span className="truncate font-mono text-xs font-semibold text-emerald-800">
                {verifiedEmail}
              </span>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Campus + 8-Digit ID Number */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <label
                  htmlFor="campus"
                  className="block text-sm font-semibold text-slate-700"
                >
                  CHMSU Campus <span className="text-red-600">*</span>
                </label>
                <div className="relative mt-1.5">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    id="campus"
                    required
                    value={campusId}
                    onChange={(e) => setCampusId(e.target.value)}
                    className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                  >
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        CHMSU {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="id-number"
                  className="block text-sm font-semibold text-slate-700"
                >
                  8-Digit ID Number <span className="text-red-600">*</span>
                </label>
                <div className="relative mt-1.5">
                  <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="id-number"
                    type="text"
                    required
                    maxLength={8}
                    inputMode="numeric"
                    pattern="\d{8}"
                    value={idNumber}
                    onChange={(e) =>
                      setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 8))
                    }
                    placeholder="20230399"
                    className="w-44 rounded-xl border border-chmsu-border bg-white py-2.5 pl-9 pr-3 text-center font-mono text-sm font-semibold tracking-widest text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Used for Campus Portal Login
                </p>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label
                htmlFor="full-name"
                className="block text-sm font-semibold text-slate-700"
              >
                Full Name <span className="text-red-600">*</span>
              </label>
              <div className="relative mt-1.5">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="full-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g., Juan Dela Cruz"
                  className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                />
              </div>
            </div>

            {/* Requested Role & College/Department */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="requested-role"
                  className="block text-sm font-semibold text-slate-700"
                >
                  Requested Role <span className="text-red-600">*</span>
                </label>
                <select
                  id="requested-role"
                  required
                  value={requestedRole}
                  onChange={(e) => setRequestedRole(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                >
                  {SELF_REGISTER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="department"
                  className="block text-sm font-semibold text-slate-700"
                >
                  College / Department <span className="text-red-600">*</span>
                </label>
                <input
                  id="department"
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g., College of Computer Studies"
                  className="mt-1.5 w-full rounded-xl border border-chmsu-border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                />
              </div>
            </div>

            {/* Front & Back School ID Photos */}
            <div className="space-y-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  School ID Verification Photos{" "}
                  <span className="text-red-600">*</span>
                </p>
                <p className="text-xs text-slate-500">
                  Upload clear photos of both sides of your CHMSU ID (JPG, PNG,
                  or WebP, max 5 MB each).
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Front ID */}
                <div className="flex flex-col rounded-xl border border-dashed border-chmsu-border bg-chmsu-canvas p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-chmsu-forest">
                      1. Front of School ID
                    </span>
                    {frontFile && (
                      <button
                        type="button"
                        onClick={() => clearFile("front")}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                      >
                        <X className="h-3 w-3" />
                        Remove
                      </button>
                    )}
                  </div>

                  {frontPreview ? (
                    <div className="mt-2.5 overflow-hidden rounded-lg border border-chmsu-border bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={frontPreview}
                        alt="Front of School ID preview"
                        className="h-40 w-full bg-slate-50 object-contain"
                      />
                      <p className="truncate border-t border-chmsu-border px-2.5 py-1.5 text-[11px] text-slate-600">
                        {frontFile?.name}
                      </p>
                    </div>
                  ) : (
                    <label
                      htmlFor="id-front-upload"
                      className="mt-2.5 flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-chmsu-border bg-white px-4 text-center transition hover:border-chmsu-green hover:bg-chmsu-green/5"
                    >
                      <ImagePlus className="h-7 w-7 text-chmsu-green" />
                      <span className="text-xs font-semibold text-chmsu-forest">
                        Tap to upload Front ID
                      </span>
                      <span className="text-[11px] text-slate-500">
                        JPG, PNG, WebP &bull; Max 5 MB
                      </span>
                      <input
                        id="id-front-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) =>
                          handleFileChange("front", e.target.files)
                        }
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>

                {/* Back ID */}
                <div className="flex flex-col rounded-xl border border-dashed border-chmsu-border bg-chmsu-canvas p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-chmsu-forest">
                      2. Back of School ID
                    </span>
                    {backFile && (
                      <button
                        type="button"
                        onClick={() => clearFile("back")}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                      >
                        <X className="h-3 w-3" />
                        Remove
                      </button>
                    )}
                  </div>

                  {backPreview ? (
                    <div className="mt-2.5 overflow-hidden rounded-lg border border-chmsu-border bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={backPreview}
                        alt="Back of School ID preview"
                        className="h-40 w-full bg-slate-50 object-contain"
                      />
                      <p className="truncate border-t border-chmsu-border px-2.5 py-1.5 text-[11px] text-slate-600">
                        {backFile?.name}
                      </p>
                    </div>
                  ) : (
                    <label
                      htmlFor="id-back-upload"
                      className="mt-2.5 flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-chmsu-border bg-white px-4 text-center transition hover:border-chmsu-green hover:bg-chmsu-green/5"
                    >
                      <ImagePlus className="h-7 w-7 text-chmsu-green" />
                      <span className="text-xs font-semibold text-chmsu-forest">
                        Tap to upload Back ID
                      </span>
                      <span className="text-[11px] text-slate-500">
                        JPG, PNG, WebP &bull; Max 5 MB
                      </span>
                      <input
                        id="id-back-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) =>
                          handleFileChange("back", e.target.files)
                        }
                        className="sr-only"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* RA 10173 Privacy Assurance */}
            <div className="flex items-start gap-2.5 rounded-xl border border-chmsu-border bg-chmsu-canvas p-3.5 text-xs text-slate-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-chmsu-green" />
              <p>
                <span className="font-semibold text-chmsu-forest">
                  RA 10173 Data Privacy Protection:
                </span>{" "}
                Your ID number and School ID photos are stored in a private,
                access-controlled bucket visible strictly to CHMSU System
                Administrators for verification and are never displayed on
                public kiosks.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading ID photos &amp; submitting...
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4" />
                  Submit for Admin Review
                </>
              )}
            </button>

            <div className="flex flex-col items-center gap-2 pt-1 text-center text-xs text-slate-500">
              <PrivacyNoticeModal />
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
