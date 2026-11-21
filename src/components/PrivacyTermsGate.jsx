"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  CheckCircle2,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLES } from "@/lib/constants";

export default function PrivacyTermsGate({ profile }) {
  const router = useRouter();

  const shouldShowInitially = Boolean(
    profile &&
      profile.approval_status === "approved" &&
      profile.is_active === true &&
      profile.role !== ROLES.ADMIN &&
      profile.privacy_terms_accepted === false
  );

  const [accepted, setAccepted] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [checkedTerms, setCheckedTerms] = useState(false);
  const [checkedPrivacy, setCheckedPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isOpen = shouldShowInitially && !accepted;

  // Block Escape key and background scroll while the mandatory gate is open
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  function handleTermsScroll(e) {
    if (hasScrolledToBottom) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      setHasScrolledToBottom(true);
    }
  }

  async function handleAccept() {
    if (!hasScrolledToBottom || !checkedTerms || !checkedPrivacy || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("accept_privacy_terms");
      if (error) {
        setErrorMessage(
          error.message || "Unable to record your consent. Please try again."
        );
        return;
      }

      setAccepted(true);
      router.refresh();
    } catch {
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
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

  const canSubmit =
    hasScrolledToBottom && checkedTerms && checkedPrivacy && !submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ra10173-terms-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-2xl">
        {/* Header (strictly NO close button) */}
        <div className="bg-chmsu-forest px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <ShieldCheck className="h-5 w-5 text-chmsu-gold" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-chmsu-gold">
                First-Login Onboarding &bull; Mandatory Consent
              </p>
              <h2
                id="ra10173-terms-title"
                className="text-base font-bold tracking-tight sm:text-lg"
              >
                SmartCampus CHMSU Terms &amp; Conditions and RA 10173 Privacy
                Consent
              </h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <p className="text-xs text-slate-600 sm:text-sm">
            Welcome,{" "}
            <span className="font-semibold text-chmsu-forest">
              {profile.full_name}
            </span>
            ! Your CHMSU account has been approved. Before accessing your portal,
            please read the entire Terms &amp; Conditions and Republic Act No.
            10173 Data Privacy Consent Notice below.
          </p>

          {/* Scrollable Terms & RA 10173 Container */}
          <div
            onScroll={handleTermsScroll}
            tabIndex={0}
            aria-label="Terms and Conditions and RA 10173 Privacy Consent Notice"
            className="max-h-72 overflow-y-auto rounded-lg border border-chmsu-border bg-chmsu-canvas p-4 text-xs leading-relaxed text-slate-700 space-y-4"
          >
            <section className="space-y-1">
              <h3 className="text-sm font-bold text-chmsu-forest">
                1. Scope &amp; Acceptable Use
              </h3>
              <p>
                SmartCampus CHMSU is the official unified campus information and
                document-tracking platform of Carlos Hilado Memorial State
                University across Talisay (Main), Alijis, Binalbagan, and
                Fortune Towne campuses. By accessing your assigned portal, you
                agree to use the system strictly for legitimate academic,
                administrative, and university-sanctioned purposes. You must
                keep your login credentials confidential, refrain from sharing
                your account, and avoid any unauthorized attempt to access,
                alter, or disclose records outside your assigned campus and
                role.
              </p>
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-bold text-chmsu-forest">
                2. Personal Data Collected
              </h3>
              <p>
                In accordance with Republic Act No. 10173 (Data Privacy Act of
                2012) and its Implementing Rules and Regulations, CHMSU collects
                and processes only the minimum personal information necessary
                for identity verification and institutional operations: your
                full name, 8-digit CHMSU Student or Employee ID number, email
                address, assigned campus, college or department, university
                role, and Front &amp; Back School ID verification photos.
              </p>
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-bold text-chmsu-forest">
                3. ID Verification &amp; Document Tracking Privacy
              </h3>
              <p>
                Your School ID photos and 8-digit ID number are stored in
                private, access-controlled storage buckets and are accessible
                strictly to authorized CHMSU System Administrators via
                short-lived signed links for account verification. Personal ID
                numbers, email addresses, ID photos, internal document remarks,
                and custody logs are NEVER exposed on public campus kiosks.
                Public kiosks display only published university announcements
                and opted-in faculty availability summaries.
              </p>
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-bold text-chmsu-forest">
                4. Security Safeguards &amp; Accountability
              </h3>
              <p>
                SmartCampus CHMSU enforces multi-campus Row-Level Security
                (RLS), role-based access control (RBAC), encrypted transport,
                and append-only immutable audit logging for administrative
                actions, document handoffs, QR scans, and privacy consent
                records. Any suspected unauthorized access or security incident
                must be reported immediately to the CHMSU ICT Office or Data
                Protection Officer.
              </p>
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-bold text-chmsu-forest">
                5. Your Data Subject Rights under RA 10173
              </h3>
              <p>
                As a Data Subject under Republic Act No. 10173, you have the
                right to be informed, the right to object, the right to access
                your personal data, the right to rectification of inaccurate
                records, the right to erasure or blocking where applicable, and
                the right to file a complaint with the National Privacy
                Commission. For data privacy inquiries or requests, contact the
                CHMSU Data Protection Officer through your campus administration
                office.
              </p>
            </section>

            <p className="border-t border-chmsu-border pt-3 text-[11px] font-semibold text-chmsu-forest">
              End of SmartCampus CHMSU Terms &amp; Conditions and RA 10173
              Privacy Consent Notice.
            </p>
          </div>

          {/* Scroll Status Hint */}
          {!hasScrolledToBottom ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
              <ArrowDown className="h-4 w-4 shrink-0 text-amber-600 animate-bounce" />
              <span>
                Scroll to the bottom of the Terms &amp; Conditions to unlock the
                checkboxes.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                You have reached the end. Please check both boxes below to
                continue.
              </span>
            </div>
          )}

          {/* Two Required Checkboxes */}
          <div className="space-y-2.5">
            <label
              className={`flex items-start gap-3 rounded-xl border p-3 text-xs sm:text-sm transition ${
                hasScrolledToBottom
                  ? "cursor-pointer border-chmsu-border bg-white text-slate-800 hover:border-chmsu-green"
                  : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              <input
                type="checkbox"
                disabled={!hasScrolledToBottom}
                checked={checkedTerms}
                onChange={(e) => setCheckedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-chmsu-green disabled:cursor-not-allowed"
              />
              <span>
                I have read and agree to the SmartCampus CHMSU Terms and
                Conditions.
              </span>
            </label>

            <label
              className={`flex items-start gap-3 rounded-xl border p-3 text-xs sm:text-sm transition ${
                hasScrolledToBottom
                  ? "cursor-pointer border-chmsu-border bg-white text-slate-800 hover:border-chmsu-green"
                  : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              <input
                type="checkbox"
                disabled={!hasScrolledToBottom}
                checked={checkedPrivacy}
                onChange={(e) => setCheckedPrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-chmsu-green disabled:cursor-not-allowed"
              />
              <span>
                I consent to the processing of my personal data in accordance
                with Republic Act No. 10173 (Data Privacy Act of 2012).
              </span>
            </label>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-chmsu-border bg-chmsu-canvas px-6 py-4">
          <button
            type="button"
            disabled={signingOut || submitting}
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 rounded-xl border border-chmsu-border bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
          >
            {signingOut ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Sign Out
          </button>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleAccept}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-5 py-2 text-sm font-semibold text-white transition hover:bg-chmsu-green disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Recording consent...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Accept &amp; Continue
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
