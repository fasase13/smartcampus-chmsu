import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Lock, Monitor, FileCheck2, EyeOff } from "lucide-react";

export const metadata = {
  title: "RA 10173 Data Privacy Notice — SmartCampus CHMSU",
  description:
    "Data Privacy Act of 2012 (RA 10173) compliance and data handling notice for SmartCampus CHMSU.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900">
      <header className="border-b border-chmsu-forest/15 bg-chmsu-forest text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white p-0.5">
              <Image
                src="/images/chmsu-logo.jpg"
                alt="CHMSU Seal"
                width={38}
                height={38}
                className="h-full w-full rounded-full object-contain"
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-chmsu-gold">
                Carlos Hilado Memorial State University
              </p>
              <h1 className="text-base font-bold sm:text-lg">
                RA 10173 Data Privacy Notice
              </h1>
            </div>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Campus Gateway
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-chmsu-border bg-white p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-chmsu-green" />
            <div>
              <h2 className="text-xl font-bold text-chmsu-forest">
                Commitment to Republic Act No. 10173 (Data Privacy Act of 2012)
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                SmartCampus CHMSU is designed with privacy-by-default across all
                four Carlos Hilado Memorial State University campuses: Talisay
                (Main), Alijis, Binalbagan, and Fortune Towne. Personal data is
                collected, processed, and protected strictly for legitimate
                academic, administrative, and records management purposes.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-chmsu-forest">
                <Lock className="h-4 w-4 text-chmsu-green" />
                1. Data Collected
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Authenticated accounts store only institutional identity fields
                (CHMSU email, full name, assigned campus, role, department, and
                optional office location or student/employee ID) required for
                campus-scoped access control.
              </p>
            </div>

            <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-chmsu-forest">
                <Monitor className="h-4 w-4 text-chmsu-green" />
                2. Zero-PII Public Kiosks
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Public campus kiosks (<code className="font-mono">/[campus]/kiosk</code>)
                display only active public announcements, campus calendars, and
                opt-in faculty availability status. Kiosks never expose emails,
                student records, QR scanning, or personal document tracking.
              </p>
            </div>

            <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-chmsu-forest">
                <EyeOff className="h-4 w-4 text-chmsu-green" />
                3. Restricted Document Tracking
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Official documents, QR custody trails, and uploaded files in the
                private <code className="font-mono">document-files</code> bucket
                are protected by PostgreSQL Row-Level Security (RLS). Students
                cannot browse records and may only look up non-confidential
                tracking codes through a sanitized RPC that omits internal staff
                remarks and staff personal information.
              </p>
            </div>

            <div className="rounded-xl border border-chmsu-border bg-chmsu-canvas p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-chmsu-forest">
                <FileCheck2 className="h-4 w-4 text-chmsu-green" />
                4. Accountability &amp; Audit Trails
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                Document registrations, QR custody handoffs, delay alerts,
                announcement updates, and administrative role changes are
                recorded in an append-only, database-immutable{" "}
                <code className="font-mono">audit_logs</code> table for
                institutional transparency and compliance review.
              </p>
            </div>
          </div>

          <div className="mt-6 border-t border-chmsu-border pt-4 text-xs text-slate-500">
            For data access, correction, or privacy inquiries, please contact
            the CHMSU Data Protection Officer or your assigned campus Records
            Management Office (RMO).
          </div>
        </div>
      </main>
    </div>
  );
}
