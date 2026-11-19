"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Monitor,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  CROSS_CAMPUS_ROLES,
  getDefaultRouteForRole,
} from "@/lib/constants";

const QUERY_ERROR_MESSAGES = {
  account_inactive:
    "Your account is inactive or missing a CHMSU profile. Please contact your campus administrator.",
  campus_restricted:
    "You were redirected because your account is restricted to your assigned campus.",
  unauthorized:
    "You do not have permission to access that portal section.",
};

export default function CampusLoginForm({ campus, isManagementLogin = false }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryErrorCode = searchParams.get("error");
  const nextParam = searchParams.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    QUERY_ERROR_MESSAGES[queryErrorCode] ?? ""
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");
    setSubmitting(true);

    try {
      const supabase = createClient();

      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError || !authData?.user) {
        setErrorMessage(
          authError?.message || "Invalid email address or password."
        );
        return;
      }

      // 2. Fetch authoritative profile and assigned campus
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, role, is_active, campus_id, full_name, campuses:campus_id(id, code, slug, name)"
        )
        .eq("id", authData.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setErrorMessage(
          "No active SmartCampus profile found for this account. Contact your campus ICT/Admin office."
        );
        return;
      }

      if (!profile.is_active) {
        await supabase.auth.signOut();
        setErrorMessage(
          "This account has been deactivated. Please contact your campus administrator."
        );
        return;
      }

      const isCrossCampusRole = CROSS_CAMPUS_ROLES.includes(profile.role);

      // 3. Validate Institutional Management / Admin login portal
      if (isManagementLogin) {
        if (!isCrossCampusRole) {
          const assignedName = profile.campuses?.name ?? "your assigned campus";
          await supabase.auth.signOut();
          setErrorMessage(
            `This portal is restricted to Institutional Management and System Administrators. Please sign in through the CHMSU ${assignedName} Campus Portal instead.`
          );
          return;
        }

        const destination =
          nextParam && nextParam.startsWith("/") ? nextParam : "/management";
        router.push(destination);
        router.refresh();
        return;
      }

      // 4. Validate strict campus isolation for campus-bound accounts
      if (!isCrossCampusRole && profile.campus_id !== campus.id) {
        const assignedCampusName =
          profile.campuses?.name ?? "another CHMSU campus";
        await supabase.auth.signOut();
        setErrorMessage(
          `Access denied for CHMSU ${campus.name}. Your account is assigned to CHMSU ${assignedCampusName}. Please use the ${assignedCampusName} campus login portal.`
        );
        return;
      }

      // 5. Log login event for non-student roles (best-effort, non-blocking)
      if (profile.role !== "student") {
        await supabase.from("audit_logs").insert({
          campus_id: campus.id,
          actor_id: profile.id,
          actor_role: profile.role,
          action: "auth.campus_login",
          entity_type: "profile",
          entity_id: profile.id,
          metadata: {
            campus_slug: campus.slug,
            campus_name: campus.name,
          },
        });
      }

      // 6. Redirect automatically by role (or safe `next` param within same campus)
      const defaultRoute = getDefaultRouteForRole(profile.role, campus.slug);
      const isSafeNext =
        nextParam &&
        nextParam.startsWith(`/${campus.slug}/`) &&
        !nextParam.includes("//");

      router.push(isSafeNext ? nextParam : defaultRoute);
      router.refresh();
    } catch {
      setErrorMessage("An unexpected error occurred while signing in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas">
      {/* Top Bar */}
      <header className="border-b border-chmsu-border bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-chmsu-forest"
          >
            <ArrowLeft className="h-4 w-4" />
            All CHMSU Campuses
          </Link>

          {!isManagementLogin && campus && (
            <Link
              href={`/${campus.slug}/kiosk`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-chmsu-border px-3 py-1.5 text-xs font-semibold text-chmsu-forest transition hover:border-chmsu-green hover:bg-chmsu-green/10"
            >
              <Monitor className="h-3.5 w-3.5 text-chmsu-green" />
              Open {campus.name} Kiosk
            </Link>
          )}
        </div>
      </header>

      {/* Centered Login Card */}
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-chmsu-border bg-chmsu-card shadow-xs">
          {/* Branded Card Header */}
          <div
            className={`px-6 py-6 text-white ${
              isManagementLogin ? "bg-chmsu-navy" : "bg-chmsu-forest"
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white p-1">
                <img
                  src="/images/chmsu-logo.jpg"
                  alt="CHMSU Seal"
                  className="h-full w-full rounded-full object-contain"
                />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-chmsu-gold">
                  SmartCampus CHMSU
                </p>
                <h1 className="text-lg font-bold tracking-tight">
                  {isManagementLogin
                    ? "Institutional Management & Admin"
                    : `CHMSU ${campus.name}`}
                </h1>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/90">
              {isManagementLogin ? (
                <>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-chmsu-gold" />
                  <span>Cross-campus executive &amp; system administration sign-in</span>
                </>
              ) : (
                <>
                  <Building2 className="h-4 w-4 shrink-0 text-chmsu-gold" />
                  <span>
                    Campus-isolated login ({campus.code}) &mdash; verified against your assigned campus
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-slate-700"
              >
                CHMSU Email Address
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@chmsu.edu.ph"
                  className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-slate-700"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${
                isManagementLogin
                  ? "bg-chmsu-navy hover:bg-chmsu-forest"
                  : "bg-chmsu-forest hover:bg-chmsu-green"
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying campus &amp; credentials...
                </>
              ) : isManagementLogin ? (
                "Sign In to Management Portal"
              ) : (
                `Sign In to ${campus.name}`
              )}
            </button>

            <p className="pt-2 text-center text-xs text-slate-500">
              Your role and campus assignment are verified automatically upon
              sign-in.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
