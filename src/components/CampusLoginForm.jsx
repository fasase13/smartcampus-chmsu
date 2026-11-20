"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Monitor,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLES, getDefaultRouteForRole } from "@/lib/constants";
import PrivacyNoticeModal from "@/components/PrivacyNoticeModal";

const ID_NUMBER_REGEX = /^\d{8}$/;

const QUERY_ERROR_MESSAGES = {
  account_inactive:
    "Your account is inactive or missing a CHMSU profile. Please contact your campus administrator.",
  campus_restricted:
    "You were redirected because your account is restricted to your assigned campus.",
  unauthorized:
    "You do not have permission to access that portal section.",
};

export default function CampusLoginForm({
  campus,
  isManagementLogin = false,
  isAdminLogin = false,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryErrorCode = searchParams.get("error");
  const nextParam = searchParams.get("next");

  const [loginMode, setLoginMode] = useState(isAdminLogin ? "admin" : "id");
  const [idNumber, setIdNumber] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    QUERY_ERROR_MESSAGES[queryErrorCode] ?? ""
  );

  const isAdminMode = loginMode === "admin";

  function switchMode(nextMode) {
    setLoginMode(nextMode);
    setErrorMessage("");
    setPassword("");
  }

  async function handleIdLoginSubmit(e) {
    e.preventDefault();
    setErrorMessage("");

    const cleanId = idNumber.trim();
    if (!ID_NUMBER_REGEX.test(cleanId)) {
      setErrorMessage(
        "Please enter a valid 8-digit CHMSU ID Number (e.g., 20230399)."
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idNumber: cleanId,
          password,
          campusSlug: isManagementLogin ? "management" : campus?.slug ?? "",
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setErrorMessage(payload?.error || "Invalid ID Number or password.");
        return;
      }

      // Redirect pending, rejected, or inactive users to /pending-approval
      if (payload.approval_status !== "approved" || !payload.is_active) {
        router.push("/pending-approval");
        router.refresh();
        return;
      }

      if (isManagementLogin) {
        const destination =
          nextParam && nextParam.startsWith("/") && !nextParam.includes("//")
            ? nextParam
            : "/management";
        router.push(destination);
        router.refresh();
        return;
      }

      const targetSlug = campus?.slug ?? payload.campus_slug ?? "talisay";
      const defaultRoute = getDefaultRouteForRole(payload.role, targetSlug);
      const isSafeNext =
        nextParam &&
        nextParam.startsWith(`/${targetSlug}/`) &&
        !nextParam.includes("//");

      router.push(isSafeNext ? nextParam : defaultRoute);
      router.refresh();
    } catch {
      setErrorMessage(
        "An unexpected error occurred while signing in. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdminLoginSubmit(e) {
    e.preventDefault();
    setErrorMessage("");
    setSubmitting(true);

    try {
      const supabase = createClient();

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: adminEmail.trim().toLowerCase(),
          password,
        });

      if (authError || !authData?.user) {
        setErrorMessage(
          authError?.message || "Invalid administrator email or password."
        );
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, is_active, approval_status")
        .eq("id", authData.user.id)
        .single();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setErrorMessage(
          "No active System Administrator profile found for this account."
        );
        return;
      }

      // Strictly block non-admin accounts on System Administrator Login
      if (profile.role !== ROLES.ADMIN) {
        await supabase.auth.signOut();
        setErrorMessage(
          "Access denied. System Administrator Login is restricted to System Admin accounts only. Regular users must sign in with their 8-digit CHMSU ID Number."
        );
        return;
      }

      if (!profile.is_active || profile.approval_status !== "approved") {
        await supabase.auth.signOut();
        setErrorMessage(
          "This System Administrator account is inactive. Please contact ICT."
        );
        return;
      }

      const destination =
        nextParam && nextParam.startsWith("/") && !nextParam.includes("//")
          ? nextParam
          : "/management";
      router.push(destination);
      router.refresh();
    } catch {
      setErrorMessage(
        "An unexpected error occurred while signing in. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const headerBgClass =
    isAdminMode || isManagementLogin ? "bg-chmsu-navy" : "bg-chmsu-forest";

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

          {!isManagementLogin && !isAdminLogin && campus && (
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
          <div className={`px-6 py-6 text-white ${headerBgClass}`}>
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
                  SmartCampus CHMSU
                </p>
                <h1 className="text-lg font-bold tracking-tight">
                  {isAdminMode
                    ? "System Administrator Login"
                    : isManagementLogin
                      ? "Institutional Management Portal"
                      : `CHMSU ${campus?.name ?? "Campus"}`}
                </h1>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/90">
              {isAdminMode ? (
                <>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-chmsu-gold" />
                  <span>
                    Restricted System Admin email sign-in (non-admin accounts
                    blocked)
                  </span>
                </>
              ) : isManagementLogin ? (
                <>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-chmsu-gold" />
                  <span>
                    Sign in with your 8-digit CHMSU ID Number or switch to Admin
                    Login
                  </span>
                </>
              ) : (
                <>
                  <Building2 className="h-4 w-4 shrink-0 text-chmsu-gold" />
                  <span>
                    Campus-isolated ID login ({campus?.code}) &mdash; verified
                    against your assigned campus
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Mode Toggle Bar (hidden only on dedicated /login/admin route) */}
          {!isAdminLogin && (
            <div className="grid grid-cols-2 border-b border-chmsu-border bg-chmsu-canvas p-1.5">
              <button
                type="button"
                onClick={() => switchMode("id")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                  !isAdminMode
                    ? "bg-white text-chmsu-forest shadow-xs"
                    : "text-slate-600 hover:text-chmsu-forest"
                }`}
              >
                <CreditCard className="h-3.5 w-3.5" />
                ID Number Login
              </button>
              <button
                type="button"
                onClick={() => switchMode("admin")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                  isAdminMode
                    ? "bg-white text-chmsu-navy shadow-xs"
                    : "text-slate-600 hover:text-chmsu-navy"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                System Admin Login
              </button>
            </div>
          )}

          {/* Form Body */}
          <form
            onSubmit={
              isAdminMode ? handleAdminLoginSubmit : handleIdLoginSubmit
            }
            className="space-y-4 p-6"
          >
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {isAdminMode ? (
              <div>
                <label
                  htmlFor="admin-email"
                  className="block text-sm font-semibold text-slate-700"
                >
                  System Administrator Email
                </label>
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@chmsu.edu.ph"
                    className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="id-number"
                  className="block text-sm font-semibold text-slate-700"
                >
                  8-Digit CHMSU ID Number
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
                    autoComplete="username"
                    value={idNumber}
                    onChange={(e) =>
                      setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 8))
                    }
                    placeholder="20230399"
                    className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-3.5 font-mono text-sm font-semibold tracking-widest text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Enter your 8-digit Student or Employee ID number only.
                </p>
              </div>
            )}

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
                isAdminMode || isManagementLogin
                  ? "bg-chmsu-navy hover:bg-chmsu-forest"
                  : "bg-chmsu-forest hover:bg-chmsu-green"
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying credentials...
                </>
              ) : isAdminMode ? (
                "Sign In as System Administrator"
              ) : isManagementLogin ? (
                "Sign In to Management Portal"
              ) : (
                `Sign In to ${campus?.name ?? "Campus"}`
              )}
            </button>

            <div className="flex flex-col items-center gap-2.5 border-t border-chmsu-border pt-4 text-center text-xs text-slate-500">
              {!isAdminMode && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm">
                  <span className="text-slate-600">New to SmartCampus?</span>
                  <Link
                    href={
                      !isManagementLogin && campus
                        ? `/register/${campus.slug}`
                        : "/register"
                    }
                    className="inline-flex items-center gap-1 font-semibold text-chmsu-forest transition hover:text-chmsu-green"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Register Account
                  </Link>
                </div>
              )}

              {isAdminLogin && (
                <Link
                  href="/"
                  className="font-semibold text-chmsu-forest transition hover:text-chmsu-green"
                >
                  Not a System Administrator? Return to Campus Portal Login
                </Link>
              )}

              <p>
                Your role and campus assignment are verified automatically upon
                sign-in.
              </p>
              <PrivacyNoticeModal />
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
