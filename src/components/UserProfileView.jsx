"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MapPin,
  RefreshCw,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_PORTAL_ROLES, ROLE_LABELS, ROLES } from "@/lib/constants";

const MIN_PASSWORD_LENGTH = 8;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

function getInitials(name) {
  const primary = String(name ?? "")
    .split(/[—–|(]/)[0]
    .replace(/[^a-zA-Z\s]/g, " ")
    .trim();
  const words = primary.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "U";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoString));
}

export default function UserProfileView({ profile, campus = null }) {
  const [showOtpPanel, setShowOtpPanel] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!profile) return null;

  const isSuperadmin = profile.role === ROLES.SUPERADMIN;
  const isAdmin = ADMIN_PORTAL_ROLES.includes(profile.role);
  const isStudent = profile.role === ROLES.STUDENT;
  const canSelfResetPassword = ["student", "faculty", "staff", "rmo"].includes(
    profile?.role
  );
  const roleLabel = isSuperadmin
    ? "System Admin"
    : ROLE_LABELS[profile.role] ?? profile.role ?? "User";

  const resolvedCampusName = isSuperadmin
    ? "All 4 Campuses"
    : campus?.name
      ? `CHMSU ${campus.name}`
      : profile.campuses?.name
        ? `CHMSU ${profile.campuses.name}`
        : "Unassigned";

  const showSchoolId = Boolean(profile.employee_or_student_id) || !isAdmin;
  const initials = getInitials(profile.full_name || profile.email);
  const verifiedOrCreatedDate = formatDate(
    profile.reviewed_at || profile.created_at
  );

  function closeOtpPanel() {
    setShowOtpPanel(false);
    setCodeSent(false);
    setOtpCode("");
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setFormError("");
  }

  async function sendOtpEmail() {
    if (!canSelfResetPassword) return;
    const email = String(profile.email ?? "").trim();
    if (!email || isSendingOtp || cooldown > 0) return;

    setIsSendingOtp(true);
    setFormError("");
    setSuccessMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      setShowOtpPanel(true);
      if (error) {
        setFormError(
          error.message ||
            "Unable to send the verification code. Please try again shortly."
        );
      } else {
        setCodeSent(true);
        setCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      }
    } catch {
      setShowOtpPanel(true);
      setFormError(
        "Unable to send the verification code right now. Please try again."
      );
    } finally {
      setIsSendingOtp(false);
    }
  }

  async function handleStartPasswordReset() {
    if (!canSelfResetPassword) return;
    if (showOtpPanel) {
      return;
    }
    if (cooldown > 0) {
      setShowOtpPanel(true);
      setFormError("");
      setSuccessMessage("");
      return;
    }
    await sendOtpEmail();
  }

  async function handleVerifyAndUpdatePassword(e) {
    e.preventDefault();
    if (!canSelfResetPassword) return;
    setFormError("");

    const email = String(profile.email ?? "").trim();
    const cleanOtp = otpCode.replace(/\D/g, "");

    if (!/^\d{6}$/.test(cleanOtp)) {
      setFormError("Please enter the 6-digit verification code sent to your email.");
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setFormError(
        `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError("New password and confirmation do not match.");
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const supabase = createClient();

      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: cleanOtp,
        type: "recovery",
      });

      if (verifyError) {
        setFormError(
          verifyError.message ||
            "Invalid or expired 6-digit verification code. Please check the code or request a new one."
        );
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setFormError(
          updateError.message ||
            "Your code was verified, but we could not update your password. Please try a stronger password."
        );
        return;
      }

      closeOtpPanel();
      setCooldown(0);
      setSuccessMessage("Your password has been updated successfully.");
    } catch {
      setFormError(
        "Something went wrong while updating your password. Please try again."
      );
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-chmsu-forest">
          My Profile
        </h1>
        <p className="mt-0.5 text-sm text-slate-600">
          Your verified SmartCampus CHMSU personal and institutional account
          information.
        </p>
      </div>

      {/* Password Updated Confirmation Banner */}
      {canSelfResetPassword && successMessage && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage("")}
            aria-label="Dismiss message"
            className="rounded-lg p-1 text-emerald-700 transition hover:bg-emerald-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Profile Card */}
      <div className="overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-xs">
        {/* Branded Forest Green Profile Header */}
        <div className="bg-[#143D29] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-[#FACC15]/70 bg-white/10 text-xl font-bold text-[#FACC15]">
                {initials}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold tracking-tight text-white">
                  {profile.full_name}
                </h2>
                <p className="mt-0.5 truncate text-xs text-white/75">
                  {profile.email}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FACC15] px-2.5 py-0.5 text-[11px] font-bold text-[#143D29]">
                    <ShieldCheck className="h-3 w-3" />
                    {roleLabel}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      profile.is_active
                        ? "bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/40"
                        : "bg-red-500/20 text-red-100 ring-1 ring-red-300/40"
                    }`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    {profile.is_active ? "Active" : "Deactivated"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Personal & Account Information Grid (Read-Only) */}
        <div className="p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Personal &amp; Institutional Information
          </h3>

          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <User className="h-3.5 w-3.5 text-chmsu-green" />
                Full Name
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {profile.full_name || "—"}
              </dd>
            </div>

            <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Mail className="h-3.5 w-3.5 text-chmsu-green" />
                Email Address
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold text-slate-900">
                {profile.email || "—"}
              </dd>
            </div>

            {showSchoolId && (
              <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <CreditCard className="h-3.5 w-3.5 text-chmsu-green" />
                  School ID
                </dt>
                <dd className="mt-1">
                  {profile.employee_or_student_id ? (
                    <span className="inline-block rounded-md border border-chmsu-border bg-white px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-chmsu-forest">
                      {profile.employee_or_student_id}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-slate-500">
                      N/A
                    </span>
                  )}
                </dd>
              </div>
            )}

            <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Building2 className="h-3.5 w-3.5 text-chmsu-green" />
                Assigned Campus
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {resolvedCampusName}
              </dd>
            </div>

            {(!isAdmin || profile.department) && (
              <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <Building2 className="h-3.5 w-3.5 text-chmsu-green" />
                  College / Department
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {profile.department || "—"}
                </dd>
              </div>
            )}

            {isStudent && (
              <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
                <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <GraduationCap className="h-3.5 w-3.5 text-chmsu-green" />
                  Program
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">
                  {profile.program_or_course || "—"}
                </dd>
              </div>
            )}

            {!isStudent && !isAdmin && (
              <>
                <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <MapPin className="h-3.5 w-3.5 text-chmsu-green" />
                    Office
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">
                    {profile.office_location || "—"}
                  </dd>
                </div>

                <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <Briefcase className="h-3.5 w-3.5 text-chmsu-green" />
                    Job Title
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">
                    {profile.job_title || "—"}
                  </dd>
                </div>

                <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <GraduationCap className="h-3.5 w-3.5 text-chmsu-green" />
                    Teaches Classes
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-900">
                    {profile.is_teaching ? "Yes" : "No"}
                  </dd>
                </div>
              </>
            )}

            <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Calendar className="h-3.5 w-3.5 text-chmsu-green" />
                {profile.reviewed_at
                  ? "Account Verified Date"
                  : "Account Created Date"}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
                {verifiedOrCreatedDate}
              </dd>
            </div>
          </dl>
        </div>

        {/* Account Security Footer & In-Portal OTP Password Reset */}
        {canSelfResetPassword && Boolean(profile.email) && (
          <div className="border-t border-chmsu-border bg-chmsu-canvas px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Lock className="h-4 w-4 shrink-0 text-chmsu-green" />
                <span className="font-semibold text-chmsu-forest">
                  Account Password
                </span>
              </div>

              {!showOtpPanel && (
                <button
                  type="button"
                  onClick={handleStartPasswordReset}
                  disabled={isSendingOtp}
                  className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-xs font-semibold text-chmsu-forest transition hover:border-chmsu-green hover:bg-chmsu-green/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSendingOtp ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-chmsu-green" />
                      Sending Code...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-3.5 w-3.5 text-chmsu-green" />
                      Reset Password
                    </>
                  )}
                </button>
              )}
            </div>

            {showOtpPanel && (
              <form
                onSubmit={handleVerifyAndUpdatePassword}
                className="mt-4 rounded-xl border border-chmsu-border bg-white p-5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-chmsu-forest">
                      Verify OTP &amp; Change Password
                    </h4>
                    <p className="mt-1 text-xs text-slate-600">
                      {codeSent ? (
                        <>
                          We sent a 6-digit verification code to{" "}
                          <span className="font-semibold text-slate-900">
                            {profile.email}
                          </span>
                          .
                        </>
                      ) : (
                        <>
                          Verification code destination:{" "}
                          <span className="font-semibold text-slate-900">
                            {profile.email}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeOtpPanel}
                    disabled={isUpdatingPassword}
                    aria-label="Close password reset form"
                    className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {formError && (
                  <div
                    role="alert"
                    className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* 6-Digit OTP Code */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="profile-otp-code"
                        className="text-xs font-semibold text-slate-700"
                      >
                        6-Digit OTP Code
                      </label>
                      <button
                        type="button"
                        onClick={sendOtpEmail}
                        disabled={isSendingOtp || cooldown > 0}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-chmsu-green transition hover:text-chmsu-forest disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        {isSendingOtp ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Sending...
                          </>
                        ) : cooldown > 0 ? (
                          <>Resend OTP in {cooldown}s</>
                        ) : (
                          <>
                            <RefreshCw className="h-3 w-3" />
                            Resend OTP
                          </>
                        )}
                      </button>
                    </div>
                    <input
                      id="profile-otp-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      value={otpCode}
                      onChange={(e) =>
                        setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      placeholder="Enter 6-digit code"
                      className="mt-1.5 w-full rounded-xl border border-chmsu-border bg-chmsu-canvas px-3.5 py-2.5 font-mono text-sm tracking-[0.25em] text-slate-900 placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-chmsu-green focus:bg-white focus:outline-none focus:ring-2 focus:ring-chmsu-green/20"
                    />
                  </div>

                  {/* New Password */}
                  <div>
                    <label
                      htmlFor="profile-new-password"
                      className="text-xs font-semibold text-slate-700"
                    >
                      New Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="profile-new-password"
                        type={showNewPassword ? "text" : "password"}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                        className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2.5 pl-3.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-chmsu-green focus:bg-white focus:outline-none focus:ring-2 focus:ring-chmsu-green/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        aria-label={
                          showNewPassword
                            ? "Hide new password"
                            : "Show new password"
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-slate-600"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Confirm New Password */}
                  <div>
                    <label
                      htmlFor="profile-confirm-password"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Confirm New Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="profile-confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full rounded-xl border border-chmsu-border bg-chmsu-canvas py-2.5 pl-3.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-chmsu-green focus:bg-white focus:outline-none focus:ring-2 focus:ring-chmsu-green/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={
                          showConfirmPassword
                            ? "Hide confirm password"
                            : "Show confirm password"
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-slate-600"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={closeOtpPanel}
                    disabled={isUpdatingPassword}
                    className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-chmsu-border bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-chmsu-forest px-4 py-2 text-xs font-semibold text-white transition hover:bg-chmsu-green disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isUpdatingPassword ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Updating Password...
                      </>
                    ) : (
                      <>
                        <KeyRound className="h-3.5 w-3.5 text-[#FACC15]" />
                        Verify &amp; Update Password
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
