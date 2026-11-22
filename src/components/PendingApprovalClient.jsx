"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, getDefaultRouteForRole } from "@/lib/constants";

export default function PendingApprovalClient({ initialProfile, userId }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [checking, setChecking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  async function handleCheckStatus() {
    setChecking(true);
    setStatusMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, campus_id, full_name, role, requested_role, employee_or_student_id, approval_status, review_notes, rejection_reason, department, program_or_course, office_location, is_active, campuses:campus_id(id, code, slug, name)"
        )
        .eq("id", userId)
        .single();

      if (error || !data) {
        setStatusMessage(
          "Unable to refresh your account status right now. Please try again."
        );
        return;
      }

      setProfile(data);

      if (data.approval_status === "returned") {
        router.push("/register/complete");
        router.refresh();
        return;
      }

      if (data.is_active && data.approval_status === "approved") {
        const campusSlug = data.campuses?.slug ?? "talisay";
        router.push(getDefaultRouteForRole(data.role, campusSlug));
        router.refresh();
        return;
      }

      if (data.approval_status === "rejected") {
        setStatusMessage("Your registration status is currently Declined.");
      } else if (data.approval_status === "pending") {
        setStatusMessage(
          "Still pending review by your Campus Admin or Superadmin. Please check back shortly."
        );
      } else {
        setStatusMessage(
          "Your account is currently inactive. Please contact your campus ICT/Admin office."
        );
      }
    } finally {
      setChecking(false);
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

  const isRejected = profile?.approval_status === "rejected";
  const isPending = !profile || profile.approval_status === "pending";

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900">
      <header className="border-b border-chmsu-border bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5 sm:px-6">
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

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-chmsu-border bg-chmsu-card shadow-xs">
          {/* Status Banner Header */}
          <div
            className={`px-6 py-6 text-white ${
              isRejected ? "bg-red-700" : "bg-chmsu-forest"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                {isRejected ? (
                  <XCircle className="h-6 w-6 text-red-100" />
                ) : (
                  <Clock className="h-6 w-6 text-chmsu-gold" />
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/80">
                  Account Verification Status
                </p>
                <h1 className="text-lg font-bold tracking-tight">
                  {isRejected
                    ? "Registration Permanently Rejected"
                    : isPending
                      ? "Pending Admin Verification"
                      : "Account Inactive"}
                </h1>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-5 p-6">
            {isRejected ? (
              <div
                role="alert"
                className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
              >
                <p className="font-bold">
                  Your registration has been permanently rejected and this email
                  address has been banned from registering on SmartCampus CHMSU.
                </p>
                <p className="text-xs leading-relaxed text-red-800">
                  <span className="font-semibold">Reason:</span>{" "}
                  {profile?.review_notes ||
                    profile?.rejection_reason ||
                    "Registration violated SmartCampus CHMSU verification policies."}
                </p>
              </div>
            ) : isPending ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <p className="font-semibold">
                  Your Front &amp; Back School ID photos have been submitted.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">
                  Your Campus Admin or the Superadmin will visually verify your ID and
                  activate your account. Until approved, access to campus
                  portals is restricted.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                Your account is currently deactivated. Please contact your
                campus ICT or Campus Admin for assistance.
              </div>
            )}

            {/* Submitted Details Card */}
            <div className="divide-y divide-chmsu-border rounded-xl border border-chmsu-border bg-chmsu-canvas text-sm">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <User className="h-3.5 w-3.5" />
                  Full Name
                </span>
                <span className="font-semibold text-slate-900">
                  {profile?.full_name ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <CreditCard className="h-3.5 w-3.5" />
                  School ID
                </span>
                <span className="rounded-md bg-white px-2.5 py-0.5 font-mono text-xs font-bold tracking-widest text-chmsu-forest border border-chmsu-border">
                  {profile?.employee_or_student_id ?? "—"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Building2 className="h-3.5 w-3.5" />
                  Campus
                </span>
                <span className="font-semibold text-slate-900">
                  {profile?.campuses?.name
                    ? `CHMSU ${profile.campuses.name}`
                    : "Unassigned"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Requested Role
                </span>
                <span className="rounded-full bg-chmsu-navy/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-navy">
                  {ROLE_LABELS[profile?.requested_role ?? profile?.role] ??
                    profile?.requested_role ??
                    "Student"}
                </span>
              </div>

              {profile?.department && (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-xs font-semibold text-slate-500">
                    College / Dept
                  </span>
                  <span className="text-right font-medium text-slate-800">
                    {profile.department}
                  </span>
                </div>
              )}

              {profile?.program_or_course && (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-xs font-semibold text-slate-500">
                    Program
                  </span>
                  <span className="text-right font-medium text-slate-800">
                    {profile.program_or_course}
                  </span>
                </div>
              )}

              {profile?.office_location && (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-xs font-semibold text-slate-500">
                    Office
                  </span>
                  <span className="text-right font-medium text-slate-800">
                    {profile.office_location}
                  </span>
                </div>
              )}

              {profile?.job_title &&
                (profile?.requested_role ?? profile?.role) !== "student" && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-xs font-semibold text-slate-500">
                      Job Title
                    </span>
                    <span className="text-right font-medium text-slate-800">
                      {profile.job_title}
                    </span>
                  </div>
                )}
            </div>

            {statusMessage && (
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-chmsu-navy" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Actions (Sign Out ONLY when permanently rejected) */}
            <div className="flex flex-col gap-2.5 sm:flex-row">
              {!isRejected && (
                <button
                  type="button"
                  disabled={checking}
                  onClick={handleCheckStatus}
                  className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:opacity-60"
                >
                  {checking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking status...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Check Status
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                disabled={signingOut}
                onClick={handleSignOut}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                  isRejected
                    ? "w-full border-red-300 bg-red-600 text-white hover:bg-red-700"
                    : "border-chmsu-border bg-white text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                }`}
              >
                {signingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Sign Out
              </button>
            </div>

            {!isRejected && (
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
                <CheckCircle2 className="h-3.5 w-3.5 text-chmsu-green" />
                Once approved, clicking Check Status will open your portal
                immediately.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
