"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function verifyRecoverySession() {
      try {
        const supabase = createClient();
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!isMounted) return;
        setHasValidSession(Boolean(user && !error));
      } catch {
        if (!isMounted) return;
        setHasValidSession(false);
      } finally {
        if (isMounted) {
          setCheckingSession(false);
        }
      }
    }

    verifyRecoverySession();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter them.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setErrorMessage(
          updateError.message ||
            "Unable to update your password. Your reset link may have expired."
        );
        return;
      }

      // Sign out the temporary recovery session and return to unified login
      await supabase.auth.signOut();
      router.replace("/?reset=success");
      router.refresh();
    } catch {
      setErrorMessage(
        "An unexpected error occurred while updating your password. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900">
      {/* Clean Top Institutional Navbar */}
      <header className="border-b border-chmsu-forest/15 bg-chmsu-forest text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white p-1 shadow-sm">
              <Image
                src="/images/chmsu-logo.jpg"
                alt="Carlos Hilado Memorial State University Seal"
                width={40}
                height={40}
                priority
                className="h-full w-full rounded-full object-contain"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-chmsu-gold">
                Carlos Hilado Memorial State University
              </p>
              <span className="block text-lg font-bold tracking-tight sm:text-xl">
                SmartCampus CHMSU
              </span>
            </div>
          </Link>
        </div>
      </header>

      {/* Centered Reset Password Card */}
      <main className="flex flex-1 items-center justify-center px-4 py-10">
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
                  Account Recovery
                </p>
                <h1 className="text-lg font-bold tracking-tight">
                  Set New Password
                </h1>
              </div>
            </div>
            <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/90">
              Choose a strong new password (at least 8 characters) to secure
              your SmartCampus CHMSU account.
            </p>
          </div>

          <div className="p-6">
            {checkingSession ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-slate-600">
                <Loader2 className="h-6 w-6 animate-spin text-chmsu-forest" />
                <span>Verifying your password reset link...</span>
              </div>
            ) : !hasValidSession ? (
              <div className="space-y-4">
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div>
                    <p className="font-semibold">
                      Reset link is invalid or has expired
                    </p>
                    <p className="mt-1 text-xs text-red-700">
                      For your security, password reset links can only be used
                      once and expire shortly after they are sent. Please
                      request a new link.
                    </p>
                  </div>
                </div>

                <Link
                  href="/forgot-password"
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green"
                >
                  Request New Reset Link
                </Link>

                <div className="flex items-center justify-center border-t border-chmsu-border pt-4 text-center text-sm">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 font-semibold text-chmsu-forest transition hover:text-chmsu-green"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Sign In
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
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
                    htmlFor="new-password"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    New Password
                  </label>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      aria-label={
                        showNewPassword
                          ? "Hide new password"
                          : "Show new password"
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                    >
                      {showNewPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Confirm New Password
                  </label>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={
                        showConfirmPassword
                          ? "Hide confirm password"
                          : "Show confirm password"
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? (
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
                      Updating Password...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4" />
                      Update Password
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
