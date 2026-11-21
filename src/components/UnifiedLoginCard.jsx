"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  UserPlus,
} from "lucide-react";
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

export default function UnifiedLoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryErrorCode = searchParams.get("error");
  const nextParam = searchParams.get("next");

  const [idNumber, setIdNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    QUERY_ERROR_MESSAGES[queryErrorCode] ?? ""
  );

  async function handleSubmit(e) {
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
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        setErrorMessage(payload?.error || "Invalid ID Number or password.");
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
        isSafeNext && payload.campus_slug && nextParam.startsWith(`/${payload.campus_slug}/`)
          ? nextParam
          : payload.redirect_to || `/${payload.campus_slug || "talisay"}/student`;

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
          Your CHMSU campus and role are detected automatically from your
          8-digit ID Number.
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
              inputMode="numeric"
              maxLength={8}
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

        <div className="flex flex-col items-center gap-2.5 border-t border-chmsu-border pt-4 text-center text-xs text-slate-500">
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
          <PrivacyNoticeModal />
        </div>
      </form>
    </div>
  );
}
