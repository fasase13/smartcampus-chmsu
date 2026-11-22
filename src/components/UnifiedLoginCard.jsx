"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  User,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const ID_NUMBER_REGEX = /^\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const QUERY_ERROR_MESSAGES = {
  account_inactive:
    "Your account is inactive or missing a CHMSU profile. Please contact your campus administrator.",
  campus_restricted:
    "You were redirected because your account is restricted to your assigned campus.",
  unauthorized:
    "You do not have permission to access that portal section.",
  email_banned:
    "This email address has been banned from registering on SmartCampus CHMSU.",
  oauth_failed: "Google sign-in was cancelled or failed. Please try again.",
  invalid_credentials: "Invalid credentials.",
};

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function UnifiedLoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryErrorCode = searchParams.get("error");
  const nextParam = searchParams.get("next");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    QUERY_ERROR_MESSAGES[queryErrorCode] ?? ""
  );

  async function handleGoogleSignIn() {
    setErrorMessage("");
    setGoogleLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        setErrorMessage(
          error.message || "Google sign-in failed. Please try again."
        );
        setGoogleLoading(false);
      }
    } catch {
      setErrorMessage("Google sign-in failed. Please try again.");
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");

    const cleanIdentifier = identifier.trim();
    if (
      !ID_NUMBER_REGEX.test(cleanIdentifier) &&
      !EMAIL_REGEX.test(cleanIdentifier)
    ) {
      setErrorMessage(
        "Enter a valid 8-digit CHMSU ID Number or Email address."
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: cleanIdentifier,
          password,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setErrorMessage(payload?.error || "Invalid credentials.");
        return;
      }

      // 1. Incomplete profile -> Step 3
      if (payload.profile_completed === false) {
        router.push("/register/complete");
        router.refresh();
        return;
      }

      // 2. Pending / Declined / Inactive -> Pending Approval screen
      if (payload.approval_status !== "approved" || !payload.is_active) {
        router.push("/pending-approval");
        router.refresh();
        return;
      }

      // 3. Route automatically based on verified database record (campus + role)
      const isSafeNext =
        nextParam &&
        nextParam.startsWith("/") &&
        !nextParam.startsWith("//") &&
        !nextParam.startsWith("/sys-admin");

      const destination =
        isSafeNext &&
        payload.campus_slug &&
        nextParam.startsWith(`/${payload.campus_slug}/`)
          ? nextParam
          : payload.redirect_to ||
            `/${payload.campus_slug || "talisay"}/student`;

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

  return (
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-chmsu-border bg-chmsu-card shadow-xs">
      {/* Branded Card Header */}
      <div className="bg-chmsu-forest px-6 py-6 text-white">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white p-1">
            <Image
              src="/images/chmsu-logo.jpg"
              alt="Carlos Hilado Memorial State University Seal"
              width={44}
              height={44}
              priority
              className="h-full w-full rounded-full object-contain"
            />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-chmsu-gold">
              Carlos Hilado Memorial State University
            </p>
            <h1 className="text-lg font-bold tracking-tight">
              Unified Portal Sign In
            </h1>
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/90">
          Your CHMSU campus and role are detected automatically from your ID
          Number or Email.
        </p>
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
            htmlFor="identifier"
            className="block text-sm font-semibold text-slate-700"
          >
            CHMSU ID Number or Email
          </label>
          <div className="relative mt-1.5">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="identifier"
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="20230399 or name@gmail.com"
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
          disabled={submitting || googleLoading}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Sign In
            </>
          )}
        </button>

        {/* Divider */}
        <div className="relative flex items-center py-1">
          <div className="flex-grow border-t border-chmsu-border" />
          <span className="mx-3 shrink-0 text-xs font-medium text-slate-400">
            or
          </span>
          <div className="flex-grow border-t border-chmsu-border" />
        </div>

        {/* Continue with Google */}
        <button
          type="button"
          disabled={submitting || googleLoading}
          onClick={handleGoogleSignIn}
          className="flex min-h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-chmsu-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {googleLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </button>

        <div className="flex flex-col items-center gap-2 border-t border-chmsu-border pt-4 text-center text-xs text-slate-500">
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm">
            <span className="text-slate-600">New to SmartCampus?</span>
            <Link
              href="/register"
              className="inline-flex items-center gap-1 font-semibold text-chmsu-forest transition hover:text-chmsu-green"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Register Account
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
