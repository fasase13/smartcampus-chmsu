"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, X, ExternalLink } from "lucide-react";

export default function PrivacyNoticeModal({ compact = false }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 font-semibold text-chmsu-navy transition hover:text-chmsu-green ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-chmsu-green" />
        RA 10173 Data Privacy Notice
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="RA 10173 Data Privacy Notice"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-xl">
            <div className="flex items-center justify-between bg-chmsu-forest px-5 py-4 text-white">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-chmsu-gold" />
                <h2 className="text-sm font-bold">
                  RA 10173 Data Privacy Notice
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close privacy notice"
                className="rounded-lg p-1 text-white/80 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-5 text-xs leading-relaxed text-slate-600">
              <p>
                <strong className="text-slate-900">What we collect:</strong>{" "}
                SmartCampus CHMSU stores your institutional email, name,
                assigned campus, and role strictly to verify access and route
                official campus services.
              </p>
              <p>
                <strong className="text-slate-900">
                  Restricted Document Tracking:
                </strong>{" "}
                Document files and custody logs are isolated by campus and role
                using PostgreSQL Row-Level Security (RLS). Students can track
                only exact non-confidential tracking codes without viewing
                internal staff remarks or other users&apos; records.
              </p>
              <p>
                <strong className="text-slate-900">
                  Zero-PII Public Kiosks:
                </strong>{" "}
                Public kiosks display only active public announcements,
                calendars, and opt-in faculty availability status.
              </p>

              <div className="flex items-center justify-between border-t border-chmsu-border pt-3">
                <Link
                  href="/privacy"
                  className="inline-flex items-center gap-1 font-semibold text-chmsu-green hover:underline"
                >
                  Read Full Policy
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-chmsu-forest px-4 py-1.5 font-semibold text-white hover:bg-chmsu-green"
                >
                  Understood
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
