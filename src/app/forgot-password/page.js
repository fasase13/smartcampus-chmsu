"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  Send,
} from "lucide-react";

const ID_NUMBER_REGEX = /^\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");

    const cleanIdentifier = identifier.trim();
    if (
      !ID_NUMBER_REGEX.test(cleanIdentifier) &&
      !EMAIL_REGEX.test(cleanIdentifier)
    ) {
      setErrorMessage("Enter a valid School ID or Email address.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: cleanIdentifier }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(
          payload?.error || "Unable to send reset link. Please try again."
        );
        return;
      }

      setSuccessMessage(
        payload?.message ||
          "If an account matches that Email or School ID, a password reset link has been sent. Please check your inbox and spam folder."
      );
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setErrorMessage(
        "An unexpected error occurred. Please check your connection and try again."
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

      {/* Centered Forgot Password Card */}
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
                  Forgot Password
                </h1>
              </div>
            </div>
            <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/90">
              Enter your School ID or registered Email address and we
              will send you a secure password reset link.
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

            {successMessage && (
              <div
                role="status"
                className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{successMessage}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="recovery-identifier"
                className="block text-sm font-semibold text-slate-700"
              >
                School ID or Email
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="recovery-identifier"
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

            <button
              type="submit"
              disabled={submitting || cooldown > 0}
              className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending Reset Link...
                </>
              ) : cooldown > 0 ? (
                <>Resend Reset Link in {cooldown}s</>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Reset Link
                </>
              )}
            </button>

            <div className="flex items-center justify-center border-t border-chmsu-border pt-4 text-center text-sm">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 font-semibold text-chmsu-forest transition hover:text-chmsu-green"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Sign In
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
