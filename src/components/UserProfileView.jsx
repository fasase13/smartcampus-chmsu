"use client";

import Link from "next/link";
import {
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  GraduationCap,
  Info,
  KeyRound,
  Mail,
  MapPin,
  ShieldCheck,
  User,
} from "lucide-react";
import { ADMIN_PORTAL_ROLES, ROLE_LABELS, ROLES } from "@/lib/constants";

function getInitials(name) {
  const clean = String(name ?? "").trim();
  if (!clean) return "U";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
  if (!profile) return null;

  const isSuperadmin = profile.role === ROLES.SUPERADMIN;
  const isAdmin = ADMIN_PORTAL_ROLES.includes(profile.role);
  const isStudent = profile.role === ROLES.STUDENT;
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
              </>
            )}

            <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3">
              <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <Calendar className="h-3.5 w-3.5 text-chmsu-green" />
                {profile.reviewed_at ? "Account Verified Date" : "Account Created Date"}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
                {verifiedOrCreatedDate}
              </dd>
            </div>
          </dl>

          {/* Read-Only Governance Note */}
          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-chmsu-forest" />
            <p>
              To request corrections to your verified institutional details,
              please contact your Campus Administrator.
            </p>
          </div>
        </div>

        {/* Security & RA 10173 Footer Row */}
        <div className="flex flex-col gap-3 border-t border-chmsu-border bg-chmsu-canvas px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-xs text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-chmsu-green" />
            <span>
              <strong className="text-chmsu-forest">
                RA 10173 Data Privacy:
              </strong>{" "}
              Your personal credentials and School ID records are protected
              under the Data Privacy Act of 2012.
            </span>
          </div>

          {!isAdmin && (
            <Link
              href="/forgot-password"
              className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-xs font-semibold text-chmsu-forest transition hover:border-chmsu-green hover:bg-chmsu-green/10"
            >
              <KeyRound className="h-3.5 w-3.5 text-chmsu-green" />
              Reset Password
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
