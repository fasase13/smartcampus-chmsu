"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
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
import {
  JOB_TITLES_BY_ROLE,
  getDepartmentsForCampusAndRole,
  getSubOptionsForSelection,
} from "@/lib/chmsuDirectory";
import PrivacyNoticeModal from "@/components/PrivacyNoticeModal";

const ID_NUMBER_REGEX = /^\d{8}$/;

const FIELD_LABELS = {
  campus_id: "Campus",
  requested_role: "Role",
  employee_or_student_id: "School ID",
  full_name: "Full Name",
  department: "College / Department",
  program_or_office: "Program / Office",
  job_title: "Job Title",
  is_teaching: "Teaches Classes",
  id_photos: "School ID Photos",
};

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
  profile = null,
  initialFullName = "",
  existingFrontUrl = "",
  existingBackUrl = "",
}) {
  const router = useRouter();

  const isReturned = profile?.approval_status === "returned";
  const flaggedFields = Array.isArray(profile?.returned_fields)
    ? profile.returned_fields
    : [];
  const snapshot = profile?.returned_snapshot ?? null;

  const isFlagged = (key) => isReturned && flaggedFields.includes(key);

  const initialCampusId = isReturned
    ? isFlagged("campus_id")
      ? ""
      : profile?.campus_id ?? ""
    : campuses.find((c) => c.slug === preselectedSlug)?.id ??
      campuses[0]?.id ??
      "";

  const [campusId, setCampusId] = useState(initialCampusId);
  const [idNumber, setIdNumber] = useState(
    isReturned && !isFlagged("employee_or_student_id")
      ? profile?.employee_or_student_id ?? ""
      : ""
  );
  const emailLocalPart = String(verifiedEmail || "").split("@")[0] ?? "";
  const profileRealName =
    profile?.full_name &&
    profile.full_name !== "Pending User" &&
    profile.full_name !== emailLocalPart
      ? profile.full_name
      : "";

  const [fullName, setFullName] = useState(
    isReturned
      ? isFlagged("full_name")
        ? ""
        : profile?.full_name ?? ""
      : initialFullName || profileRealName || ""
  );
  const [requestedRole, setRequestedRole] = useState(
    isReturned
      ? isFlagged("requested_role")
        ? ""
        : profile?.requested_role ?? "student"
      : "student"
  );
  const [department, setDepartment] = useState(
    isReturned && !isFlagged("department") ? profile?.department ?? "" : ""
  );
  const [programOrCourse, setProgramOrCourse] = useState(
    isReturned && !isFlagged("program_or_office")
      ? profile?.program_or_course ?? ""
      : ""
  );
  const [officeLocation, setOfficeLocation] = useState(
    isReturned && !isFlagged("program_or_office")
      ? profile?.office_location ?? ""
      : ""
  );
  const [jobTitle, setJobTitle] = useState(
    isReturned && !isFlagged("job_title") ? profile?.job_title ?? "" : ""
  );
  const [isTeaching, setIsTeaching] = useState(
    isReturned &&
      !isFlagged("is_teaching") &&
      profile?.requested_role !== "student" &&
      typeof profile?.is_teaching === "boolean"
      ? profile.is_teaching
        ? "yes"
        : "no"
      : ""
  );

  // Existing valid photo paths retained if id_photos was NOT flagged
  const canReuseExistingPhotos =
    isReturned &&
    !isFlagged("id_photos") &&
    Boolean(profile?.id_front_path && profile?.id_back_path);

  const [frontFile, setFrontFile] = useState(null);
  const [frontPreview, setFrontPreview] = useState("");
  const [backFile, setBackFile] = useState(null);
  const [backPreview, setBackPreview] = useState("");
  const [usingExistingFront, setUsingExistingFront] = useState(
    canReuseExistingPhotos
  );
  const [usingExistingBack, setUsingExistingBack] = useState(
    canReuseExistingPhotos
  );

  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedCampusSlug =
    campuses.find((c) => c.id === campusId)?.slug ?? "";
  const isStudentRole = requestedRole === "student";
  const departmentOptions =
    selectedCampusSlug && requestedRole
      ? getDepartmentsForCampusAndRole(selectedCampusSlug, requestedRole)
      : [];
  const subOptions =
    selectedCampusSlug && requestedRole && department
      ? getSubOptionsForSelection(selectedCampusSlug, requestedRole, department)
      : [];
  const jobTitleOptions =
    requestedRole && !isStudentRole
      ? JOB_TITLES_BY_ROLE[requestedRole] ?? []
      : [];

  // Inline duplicate-invalid-value checks against returned_snapshot
  const invalidDuplicateMsg =
    "This value was marked invalid by the admin. Please enter a different value.";

  const isCampusDuplicate = Boolean(
    isFlagged("campus_id") &&
      snapshot?.campus_id &&
      campusId &&
      campusId === snapshot.campus_id
  );
  const isIdDuplicate = Boolean(
    isFlagged("employee_or_student_id") &&
      snapshot?.employee_or_student_id &&
      idNumber.trim() === snapshot.employee_or_student_id
  );
  const isNameDuplicate = Boolean(
    isFlagged("full_name") &&
      snapshot?.full_name &&
      fullName.trim().toLowerCase() ===
        String(snapshot.full_name).trim().toLowerCase()
  );
  const isRoleDuplicate = Boolean(
    isFlagged("requested_role") &&
      snapshot?.requested_role &&
      requestedRole &&
      requestedRole === snapshot.requested_role
  );
  const isDeptDuplicate = Boolean(
    isFlagged("department") &&
      snapshot?.department &&
      department &&
      department.trim().toLowerCase() ===
        String(snapshot.department).trim().toLowerCase()
  );
  const isSubDuplicate = Boolean(
    isFlagged("program_or_office") &&
      ((isStudentRole &&
        snapshot?.program_or_course &&
        programOrCourse.trim().toLowerCase() ===
          String(snapshot.program_or_course).trim().toLowerCase()) ||
        (!isStudentRole &&
          snapshot?.office_location &&
          officeLocation.trim().toLowerCase() ===
            String(snapshot.office_location).trim().toLowerCase()))
  );
  const isJobTitleDuplicate = Boolean(
    isFlagged("job_title") &&
      !isStudentRole &&
      snapshot?.job_title &&
      jobTitle.trim().toLowerCase() ===
        String(snapshot.job_title).trim().toLowerCase()
  );
  const isTeachingDuplicate = Boolean(
    isFlagged("is_teaching") &&
      !isStudentRole &&
      typeof snapshot?.is_teaching === "boolean" &&
      isTeaching !== "" &&
      (isTeaching === "yes") === snapshot.is_teaching
  );

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
      setUsingExistingFront(false);
    } else {
      setBackFile(file);
      setBackPreview(previewUrl);
      setUsingExistingBack(false);
    }
  }

  function clearFile(side) {
    if (side === "front") {
      setFrontFile(null);
      setFrontPreview("");
      setUsingExistingFront(false);
    } else {
      setBackFile(null);
      setBackPreview("");
      setUsingExistingBack(false);
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
    const cleanProgram = programOrCourse.trim();
    const cleanOffice = officeLocation.trim();
    const cleanJobTitle = jobTitle.trim();

    if (
      isCampusDuplicate ||
      isIdDuplicate ||
      isNameDuplicate ||
      isRoleDuplicate ||
      isDeptDuplicate ||
      isSubDuplicate ||
      isJobTitleDuplicate ||
      isTeachingDuplicate
    ) {
      setErrorMessage(
        "One or more flagged fields still contain the previous invalid value. Please correct all highlighted fields before resubmitting."
      );
      return;
    }

    if (!campusId) {
      setErrorMessage("Please select your CHMSU campus.");
      return;
    }
    if (!ID_NUMBER_REGEX.test(cleanId)) {
      setErrorMessage("Please enter a valid School ID.");
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
    if (!cleanDept) {
      setErrorMessage("Please select your College / Department.");
      return;
    }
    if (isStudentRole && !cleanProgram) {
      setErrorMessage("Please select your degree Program.");
      return;
    }
    if (!isStudentRole && !cleanOffice) {
      setErrorMessage("Please select your Office.");
      return;
    }
    if (
      !isStudentRole &&
      (!cleanJobTitle || !jobTitleOptions.includes(cleanJobTitle))
    ) {
      setErrorMessage("Please select a valid Job Title for your role.");
      return;
    }
    if (!isStudentRole && isTeaching !== "yes" && isTeaching !== "no") {
      setErrorMessage(
        "Please answer whether you have a class to teach (Yes or No)."
      );
      return;
    }

    if (!usingExistingFront) {
      const frontErr = validateIdImageFile(frontFile, "Front of School ID");
      if (frontErr) {
        setErrorMessage(frontErr);
        return;
      }
    }
    if (!usingExistingBack) {
      const backErr = validateIdImageFile(backFile, "Back of School ID");
      if (backErr) {
        setErrorMessage(backErr);
        return;
      }
    }

    setSubmitting(true);
    try {
      const supabase = createClient();

      // 1. Check School ID availability only if new or changed from own current value
      if (!profile?.employee_or_student_id || cleanId !== profile.employee_or_student_id) {
        const { data: isAvailable, error: availError } = await supabase.rpc(
          "check_id_number_available",
          { p_id_number: cleanId }
        );

        if (availError) {
          setErrorMessage(
            `Unable to verify School ID availability: ${availError.message}`
          );
          return;
        }

        if (!isAvailable) {
          setErrorMessage(
            `School ID ${cleanId} is already registered to another account.`
          );
          return;
        }
      }

      // 2. Upload replacement or new ID photos using unique timestamped paths
      const ts = new Date().getTime();
      let finalFrontPath = profile?.id_front_path ?? "";
      let finalBackPath = profile?.id_back_path ?? "";

      const uploads = [];
      if (!usingExistingFront && frontFile) {
        finalFrontPath = `${userId}/front_${ts}.${extensionForMime(frontFile.type)}`;
        uploads.push(
          supabase.storage
            .from(STORAGE_BUCKETS.ID_VERIFICATIONS)
            .upload(finalFrontPath, frontFile, {
              contentType: frontFile.type,
              upsert: true,
            })
        );
      }
      if (!usingExistingBack && backFile) {
        finalBackPath = `${userId}/back_${ts}.${extensionForMime(backFile.type)}`;
        uploads.push(
          supabase.storage
            .from(STORAGE_BUCKETS.ID_VERIFICATIONS)
            .upload(finalBackPath, backFile, {
              contentType: backFile.type,
              upsert: true,
            })
        );
      }

      if (uploads.length > 0) {
        const results = await Promise.all(uploads);
        const failed = results.find((r) => r.error);
        if (failed?.error) {
          setErrorMessage(
            `ID photo upload failed: ${failed.error.message}. Please try again.`
          );
          return;
        }
      }

      // 3. Submit credentials via SECURITY DEFINER RPC
      const { error: completeError } = await supabase.rpc(
        "complete_registration_credentials",
        {
          p_campus_id: campusId,
          p_id_number: cleanId,
          p_full_name: cleanName,
          p_requested_role: requestedRole,
          p_department: cleanDept,
          p_front_path: finalFrontPath,
          p_back_path: finalBackPath,
          p_program_or_course: isStudentRole ? cleanProgram : null,
          p_office_location: isStudentRole ? null : cleanOffice,
          p_job_title: isStudentRole ? null : cleanJobTitle,
          p_is_teaching: isStudentRole ? false : isTeaching === "yes",
        }
      );

      if (completeError) {
        const rawMsg = completeError.message || "Unable to save your credentials.";
        const friendlyMsg = /must be exactly 8 digits/i.test(rawMsg)
          ? "Please enter a valid School ID."
          : /returned as invalid/i.test(rawMsg) && /id number/i.test(rawMsg)
            ? "This School ID was marked invalid by the admin. Please enter a different value."
            : rawMsg
                .replace(/8[- ]digit\s+id\s+number/gi, "School ID")
                .replace(/\bid\s+number\b/gi, "School ID");
        setErrorMessage(friendlyMsg);
        return;
      }

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

  const fieldRing = (flagged, isDup) =>
    isDup
      ? "border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-200"
      : flagged
        ? "border-amber-400 bg-amber-50/40 focus:border-amber-600 focus:ring-amber-200"
        : "border-chmsu-border bg-white focus:border-chmsu-green focus:ring-chmsu-green/20";

  const displayedFrontPreview = usingExistingFront
    ? existingFrontUrl
    : frontPreview;
  const displayedBackPreview = usingExistingBack
    ? existingBackUrl
    : backPreview;

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
          <div
            className={`px-6 py-5 text-white ${
              isReturned ? "bg-amber-700" : "bg-chmsu-forest"
            }`}
          >
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
                  {isReturned
                    ? "Action Required • Returned Registration"
                    : "Step 3 of 3 • Final Step"}
                </p>
                <h1 className="text-lg font-bold tracking-tight sm:text-xl">
                  {isReturned
                    ? "Correct Flagged Registration Details"
                    : "School Credentials & ID Verification"}
                </h1>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-6">
            {/* Prominent Returned-for-Correction Banner */}
            {isReturned && (
              <div
                role="alert"
                className="space-y-2.5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-bold">
                      Registration Returned for Correction
                    </p>
                    {profile?.review_notes && (
                      <p className="mt-1 text-xs leading-relaxed text-amber-900">
                        <span className="font-semibold">Admin Note:</span>{" "}
                        {profile.review_notes}
                      </p>
                    )}
                  </div>
                </div>

                {flaggedFields.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
                      Fields to fix:
                    </span>
                    {flaggedFields.map((key) => (
                      <span
                        key={key}
                        className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-950"
                      >
                        {FIELD_LABELS[key] ?? key}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

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

            {/* Campus + School ID */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <label
                  htmlFor="campus"
                  className="block text-sm font-semibold text-slate-700"
                >
                  CHMSU Campus <span className="text-red-600">*</span>
                  {isFlagged("campus_id") && (
                    <span className="ml-1.5 text-[11px] font-bold text-amber-700">
                      (Needs correction)
                    </span>
                  )}
                </label>
                <div className="relative mt-1.5">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    id="campus"
                    required
                    value={campusId}
                    onChange={(e) => {
                      setCampusId(e.target.value);
                      setDepartment("");
                      setProgramOrCourse("");
                      setOfficeLocation("");
                    }}
                    className={`w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:ring-2 ${fieldRing(
                      isFlagged("campus_id"),
                      isCampusDuplicate
                    )}`}
                  >
                    <option value="">Select CHMSU Campus...</option>
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        CHMSU {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {isCampusDuplicate && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    {invalidDuplicateMsg}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="id-number"
                  className="block text-sm font-semibold text-slate-700"
                >
                  School ID <span className="text-red-600">*</span>
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
                    className={`w-44 rounded-xl border py-2.5 pl-9 pr-3 text-center font-mono text-sm font-semibold tracking-widest text-slate-900 outline-none transition focus:ring-2 ${fieldRing(
                      isFlagged("employee_or_student_id"),
                      isIdDuplicate
                    )}`}
                  />
                </div>
                {isIdDuplicate ? (
                  <p className="mt-1 max-w-44 text-[11px] font-semibold text-red-700">
                    {invalidDuplicateMsg}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Used for Portal Login
                  </p>
                )}
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label
                htmlFor="full-name"
                className="block text-sm font-semibold text-slate-700"
              >
                Full Name <span className="text-red-600">*</span>
                {isFlagged("full_name") && (
                  <span className="ml-1.5 text-[11px] font-bold text-amber-700">
                    (Needs correction)
                  </span>
                )}
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
                  className={`w-full rounded-xl border py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${fieldRing(
                    isFlagged("full_name"),
                    isNameDuplicate
                  )}`}
                />
              </div>
              {isNameDuplicate && (
                <p className="mt-1 text-xs font-semibold text-red-700">
                  {invalidDuplicateMsg}
                </p>
              )}
            </div>

            {/* Requested Role & Dynamic College/Department */}
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
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    setRequestedRole(nextRole);
                    setDepartment("");
                    setProgramOrCourse("");
                    setOfficeLocation("");
                    setJobTitle("");
                    if (nextRole === "student") {
                      setIsTeaching("");
                    }
                  }}
                  className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${fieldRing(
                    isFlagged("requested_role"),
                    isRoleDuplicate
                  )}`}
                >
                  <option value="">Select Role...</option>
                  {SELF_REGISTER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                </select>
                {isRoleDuplicate && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    {invalidDuplicateMsg}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="department"
                  className="block text-sm font-semibold text-slate-700"
                >
                  {isStudentRole ? "College" : "College / Department"}{" "}
                  <span className="text-red-600">*</span>
                </label>
                <select
                  id="department"
                  required
                  disabled={!campusId || !requestedRole}
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    setProgramOrCourse("");
                    setOfficeLocation("");
                  }}
                  className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 disabled:bg-slate-100 ${fieldRing(
                    isFlagged("department"),
                    isDeptDuplicate
                  )}`}
                >
                  <option value="">
                    {isStudentRole
                      ? "Select your College..."
                      : "Select your College / Department..."}
                  </option>
                  {departmentOptions.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                {isDeptDuplicate && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    {invalidDuplicateMsg}
                  </p>
                )}
              </div>
            </div>

            {/* Cascading Program (Students) or Office (Non-Students) */}
            {department && (
              <div>
                <label
                  htmlFor={
                    isStudentRole ? "program-or-course" : "office-location"
                  }
                  className="block text-sm font-semibold text-slate-700"
                >
                  {isStudentRole ? "Program" : "Office"}{" "}
                  <span className="text-red-600">*</span>
                </label>
                <select
                  id={isStudentRole ? "program-or-course" : "office-location"}
                  required
                  value={isStudentRole ? programOrCourse : officeLocation}
                  onChange={(e) => {
                    if (isStudentRole) {
                      setProgramOrCourse(e.target.value);
                    } else {
                      setOfficeLocation(e.target.value);
                    }
                  }}
                  className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${fieldRing(
                    isFlagged("program_or_office"),
                    isSubDuplicate
                  )}`}
                >
                  <option value="">
                    {isStudentRole
                      ? "Select your degree Program..."
                      : "Select your Office..."}
                  </option>
                  {subOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {isSubDuplicate && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    {invalidDuplicateMsg}
                  </p>
                )}
              </div>
            )}

            {/* Required Role-Connected Job Title Dropdown (Non-Student Roles Only) */}
            {requestedRole && !isStudentRole && (
              <div>
                <label
                  htmlFor="job-title"
                  className="block text-sm font-semibold text-slate-700"
                >
                  Job Title <span className="text-red-600">*</span>
                  {isFlagged("job_title") && (
                    <span className="ml-1.5 text-[11px] font-bold text-amber-700">
                      (Needs correction)
                    </span>
                  )}
                </label>
                <div className="relative mt-1.5">
                  <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    id="job-title"
                    required
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    className={`w-full rounded-xl border py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${fieldRing(
                      isFlagged("job_title"),
                      isJobTitleDuplicate
                    )}`}
                  >
                    <option value="">Select your Job Title...</option>
                    {jobTitleOptions.map((titleOption) => (
                      <option key={titleOption} value={titleOption}>
                        {titleOption}
                      </option>
                    ))}
                  </select>
                </div>
                {isJobTitleDuplicate && (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    {invalidDuplicateMsg}
                  </p>
                )}
              </div>
            )}

            {/* Required Teaching Classes Selection (Non-Student Roles Only) */}
            {requestedRole && !isStudentRole && (
              <div>
                <p className="block text-sm font-semibold text-slate-700">
                  Do you have a class to teach?{" "}
                  <span className="text-red-600">*</span>
                  {isFlagged("is_teaching") && (
                    <span className="ml-1.5 text-[11px] font-bold text-amber-700">
                      (Needs correction)
                    </span>
                  )}
                </p>
                <div
                  role="radiogroup"
                  aria-label="Do you have a class to teach?"
                  className="mt-1.5 grid grid-cols-2 gap-3"
                >
                  {[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                  ].map((opt) => {
                    const selected = isTeaching === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setIsTeaching(opt.value)}
                        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                          selected
                            ? "border-chmsu-forest bg-chmsu-forest text-white shadow-xs"
                            : isTeachingDuplicate
                              ? "border-red-400 bg-red-50/40 text-slate-700 hover:border-red-500"
                              : isFlagged("is_teaching")
                                ? "border-amber-400 bg-amber-50/40 text-slate-700 hover:border-amber-600"
                                : "border-chmsu-border bg-white text-slate-700 hover:border-chmsu-green hover:bg-chmsu-canvas"
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full border ${
                            selected
                              ? "border-white bg-chmsu-gold"
                              : "border-slate-400 bg-white"
                          }`}
                        />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {isTeachingDuplicate ? (
                  <p className="mt-1 text-xs font-semibold text-red-700">
                    {invalidDuplicateMsg}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    Select Yes if you teach students to enable Live Availability
                    Control on the Campus Kiosk and Instructor Locator.
                  </p>
                )}
              </div>
            )}

            {/* Front & Back School ID Photos */}
            <div className="space-y-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  School ID Verification Photos{" "}
                  <span className="text-red-600">*</span>
                  {isFlagged("id_photos") && (
                    <span className="ml-1.5 text-xs font-bold text-amber-700">
                      (Please upload brand-new Front &amp; Back photos)
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {canReuseExistingPhotos
                    ? "Your previously uploaded ID photos are kept. You may replace them if needed."
                    : "Upload clear photos of both sides of your CHMSU ID (JPG, PNG, or WebP, max 5 MB each)."}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Front ID */}
                <div
                  className={`flex flex-col rounded-xl border border-dashed p-3.5 ${
                    isFlagged("id_photos")
                      ? "border-amber-400 bg-amber-50/50"
                      : "border-chmsu-border bg-chmsu-canvas"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-chmsu-forest">
                      1. Front of School ID
                    </span>
                    {(frontFile || usingExistingFront) && (
                      <button
                        type="button"
                        onClick={() => clearFile("front")}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                      >
                        <X className="h-3 w-3" />
                        Replace
                      </button>
                    )}
                  </div>

                  {displayedFrontPreview ? (
                    <div className="mt-2.5 overflow-hidden rounded-lg border border-chmsu-border bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={displayedFrontPreview}
                        alt="Front of School ID preview"
                        className="h-40 w-full bg-slate-50 object-contain"
                      />
                      <p className="truncate border-t border-chmsu-border px-2.5 py-1.5 text-[11px] text-slate-600">
                        {usingExistingFront
                          ? "Existing verified front photo"
                          : frontFile?.name}
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
                <div
                  className={`flex flex-col rounded-xl border border-dashed p-3.5 ${
                    isFlagged("id_photos")
                      ? "border-amber-400 bg-amber-50/50"
                      : "border-chmsu-border bg-chmsu-canvas"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-chmsu-forest">
                      2. Back of School ID
                    </span>
                    {(backFile || usingExistingBack) && (
                      <button
                        type="button"
                        onClick={() => clearFile("back")}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                      >
                        <X className="h-3 w-3" />
                        Replace
                      </button>
                    )}
                  </div>

                  {displayedBackPreview ? (
                    <div className="mt-2.5 overflow-hidden rounded-lg border border-chmsu-border bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={displayedBackPreview}
                        alt="Back of School ID preview"
                        className="h-40 w-full bg-slate-50 object-contain"
                      />
                      <p className="truncate border-t border-chmsu-border px-2.5 py-1.5 text-[11px] text-slate-600">
                        {usingExistingBack
                          ? "Existing verified back photo"
                          : backFile?.name}
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
                Your School ID and verification photos are stored in a private,
                access-controlled bucket visible strictly to CHMSU Campus Admin
                and System Admin for verification and are never displayed on
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
                  Uploading &amp; submitting...
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4" />
                  {isReturned
                    ? "Resubmit Corrected Registration"
                    : "Submit for Admin Review"}
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
