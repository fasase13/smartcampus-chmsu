"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PrivacyNoticeModal from "@/components/PrivacyNoticeModal";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;

function StepIndicator({ currentStep }) {
  const steps = [
    { num: 1, label: "Account" },
    { num: 2, label: "Verify Email" },
    { num: 3, label: "School ID" },
  ];

  return (
    <ol className="grid grid-cols-3 gap-2 border-b border-chmsu-border bg-chmsu-canvas px-6 py-3 text-xs">
      {steps.map((step) => {
        const isDone = currentStep > step.num;
        const isActive = currentStep === step.num;
        return (
          <li key={step.num} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                isDone
                  ? "bg-chmsu-green text-white"
                  : isActive
                    ? "bg-chmsu-forest text-chmsu-gold"
                    : "border border-chmsu-border bg-white text-slate-400"
              }`}
            >
              {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.num}
            </span>
            <span
              className={`truncate font-semibold ${
                isActive || isDone ? "text-chmsu-forest" : "text-slate-400"
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function RegistrationForm({ preselectedSlug = "" }) {
  const router = useRouter();

  const [step, setStep] = useState(1); // 1 = Email & Password, 2 = 6-Digit OTP
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleStep1Submit(e) {
    e.preventDefault();
    setErrorMessage("");
    setInfoMessage("");

    const cleanEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(cleanEmail)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();

      // 1. Enforce 1 account per canonical email
      const { data: isAvailable, error: availError } = await supabase.rpc(
        "check_registration_email_available",
        { p_email: cleanEmail }
      );

      if (availError) {
        setErrorMessage(
          `Unable to verify email availability: ${availError.message}`
        );
        return;
      }

      if (!isAvailable) {
        setErrorMessage(
          "An account with this email address already exists. Please sign in using your 8-digit CHMSU ID Number."
        );
        return;
      }

      // 2. Create Auth user & trigger 6-digit signup OTP email
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (signUpError) {
        setErrorMessage(signUpError.message);
        return;
      }

      if (
        !authData?.user ||
        (Array.isArray(authData.user.identities) &&
          authData.user.identities.length === 0)
      ) {
        setErrorMessage(
          "An account with this email address is already registered. Please sign in instead."
        );
        return;
      }

      // 3. Move to Step 2 (OTP verification)
      setEmail(cleanEmail);
      setOtpCode("");
      setResendCooldown(60);
      setInfoMessage(
        `We sent a 6-digit verification code to ${cleanEmail}. Check your inbox (and Spam folder).`
      );
      setStep(2);
    } catch {
      setErrorMessage(
        "An unexpected error occurred while creating your account. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStep2VerifyOtp(e) {
    e.preventDefault();
    setErrorMessage("");
    setInfoMessage("");

    const cleanToken = otpCode.trim();
    if (!OTP_REGEX.test(cleanToken)) {
      setErrorMessage("Please enter the 6-digit verification code from your email.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: cleanToken,
        type: "signup",
      });

      if (error || !data?.session) {
        setErrorMessage(
          error?.message ||
            "Invalid or expired 6-digit code. Please try again or request a new code."
        );
        return;
      }

      // OTP verified — transition straight to Step 3 (/register/complete)
      const completePath = preselectedSlug
        ? `/register/complete?campus=${encodeURIComponent(preselectedSlug)}`
        : "/register/complete";
      router.push(completePath);
      router.refresh();
    } catch {
      setErrorMessage(
        "An unexpected error occurred while verifying the code. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || resending) return;
    setErrorMessage("");
    setInfoMessage("");
    setResending(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setResendCooldown(60);
      setInfoMessage(`A new 6-digit verification code has been sent to ${email}.`);
    } catch {
      setErrorMessage("Unable to resend verification code right now.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900">
      {/* Top Bar */}
      <header className="border-b border-chmsu-border bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-chmsu-forest"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Sign In
          </Link>

          <Link
            href="/"
            className="text-xs font-semibold text-chmsu-forest transition hover:text-chmsu-green sm:text-sm"
          >
            Already registered? Sign In
          </Link>
        </div>
      </header>

      {/* Main Card */}
      <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center px-4 py-10">
        <div className="w-full overflow-hidden rounded-2xl border border-chmsu-border bg-chmsu-card shadow-xs">
          {/* Branded Header */}
          <div className="bg-chmsu-forest px-6 py-5 text-white">
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
                  {step === 1
                    ? "Create SmartCampus Account"
                    : "Verify Your Email"}
                </h1>
              </div>
            </div>
          </div>

          <StepIndicator currentStep={step} />

          {/* STEP 1: Email & Password */}
          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-4 p-6">
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
                  Email Address <span className="text-red-600">*</span>
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
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  We will send a 6-digit verification code to this email before
                  collecting your CHMSU ID details.
                </p>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-slate-700"
                >
                  Password <span className="text-red-600">*</span>
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
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

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-semibold text-slate-700"
                >
                  Confirm Password <span className="text-red-600">*</span>
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full rounded-xl border border-chmsu-border bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-900 outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending verification code...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" />
                    Continue &amp; Send Email OTP
                  </>
                )}
              </button>

              <div className="flex flex-col items-center gap-2 pt-2 text-center text-xs text-slate-500">
                <PrivacyNoticeModal />
              </div>
            </form>
          )}

          {/* STEP 2: Verify 6-Digit Email OTP */}
          {step === 2 && (
            <form onSubmit={handleStep2VerifyOtp} className="space-y-4 p-6">
              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {infoMessage && (
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{infoMessage}</span>
                </div>
              )}

              <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas px-4 py-3 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Verification code sent to
                </p>
                <p className="mt-0.5 truncate text-sm font-bold text-chmsu-forest">
                  {email}
                </p>
              </div>

              <div>
                <label
                  htmlFor="otp-code"
                  className="block text-center text-sm font-semibold text-slate-700"
                >
                  Enter 6-Digit Verification Code
                </label>
                <div className="relative mt-2 flex justify-center">
                  <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="otp-code"
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    pattern="\d{6}"
                    autoComplete="one-time-code"
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="000000"
                    className="w-full rounded-xl border border-chmsu-border bg-white py-3 pl-10 pr-4 text-center font-mono text-xl font-bold tracking-[0.45em] text-chmsu-forest outline-none transition focus:border-chmsu-green focus:ring-2 focus:ring-chmsu-green/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || otpCode.length < 6}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying code...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Verify Email &amp; Continue
                  </>
                )}
              </button>

              <div className="flex items-center justify-between border-t border-chmsu-border pt-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setErrorMessage("");
                    setInfoMessage("");
                  }}
                  className="font-semibold text-slate-600 transition hover:text-chmsu-forest"
                >
                  &larr; Change email
                </button>

                <button
                  type="button"
                  disabled={resendCooldown > 0 || resending}
                  onClick={handleResendOtp}
                  className="inline-flex items-center gap-1.5 font-semibold text-chmsu-forest transition hover:text-chmsu-green disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {resending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {resendCooldown > 0
                    ? `Resend OTP in ${resendCooldown}s`
                    : "Resend OTP"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
