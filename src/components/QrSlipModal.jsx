"use client";

import { QRCodeSVG } from "qrcode.react";
import Image from "next/image";
import { Printer, X, Copy, Check } from "lucide-react";
import { useState } from "react";

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoString));
}

export default function QrSlipModal({ doc, campusMap, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!doc) return null;

  const originName =
    campusMap[doc.origin_campus_id]?.name ??
    doc.origin_campus?.name ??
    "CHMSU";
  const currentName =
    campusMap[doc.current_campus_id]?.name ??
    doc.current_campus?.name ??
    "CHMSU";

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(doc.tracking_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable in non-focused window
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Printable QR Routing Slip"
      className="qr-slip-print-root fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-xl print:max-w-none print:rounded-none print:border-slate-400 print:shadow-none">
        {/* Modal Toolbar (hidden on print) */}
        <div className="no-print flex items-center justify-between border-b border-chmsu-border bg-chmsu-canvas px-5 py-3">
          <p className="text-sm font-bold text-chmsu-forest">
            Printable QR Routing Slip
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyCode}
              className="inline-flex items-center gap-1.5 rounded-lg border border-chmsu-border bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-chmsu-green"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy ID
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-chmsu-forest px-3 py-1.5 text-xs font-semibold text-white hover:bg-chmsu-green"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Slip
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable Routing Slip Body */}
        <div className="p-6">
          {/* Header with CHMSU Seal */}
          <div className="flex items-center justify-between gap-3 border-b-2 border-chmsu-forest pb-4">
            <div className="flex items-center gap-3">
              <Image
                src="/images/chmsu-logo.jpg"
                alt="CHMSU Seal"
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-contain"
              />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-chmsu-green">
                  Carlos Hilado Memorial State University
                </p>
                <h2 className="text-base font-bold text-chmsu-forest">
                  Official Document Routing Slip
                </h2>
                <p className="text-xs text-slate-500">
                  Records Management Office (RMO)
                </p>
              </div>
            </div>
            <span
              className={`rounded-md border px-2.5 py-1 text-xs font-bold uppercase ${
                doc.priority === "urgent"
                  ? "border-orange-300 bg-orange-100 text-orange-900"
                  : doc.priority === "confidential"
                    ? "border-purple-300 bg-purple-100 text-purple-900"
                    : "border-slate-300 bg-slate-100 text-slate-800"
              }`}
            >
              {doc.priority}
            </span>
          </div>

          {/* QR Code & Tracking Code */}
          <div className="my-5 flex flex-col items-center justify-center rounded-xl border border-slate-300 bg-white p-4">
            <div className="bg-white p-2">
              <QRCodeSVG
                value={doc.qr_token}
                size={180}
                level="Q"
                includeMargin={true}
              />
            </div>
            <p className="mt-2 font-mono text-lg font-bold tracking-wider text-chmsu-forest">
              {doc.tracking_code}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Scan with SmartCampus Office QR Scanner or enter Tracking Code manually
            </p>
          </div>

          {/* Document Metadata Grid */}
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <dt className="font-semibold uppercase tracking-wide text-slate-500">
                Document Title
              </dt>
              <dd className="mt-0.5 text-sm font-bold text-slate-900">
                {doc.title}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-200 p-2.5">
              <dt className="font-semibold uppercase tracking-wide text-slate-500">
                Document Type
              </dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                {doc.document_type}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-200 p-2.5">
              <dt className="font-semibold uppercase tracking-wide text-slate-500">
                SLA Deadline
              </dt>
              <dd className="mt-0.5 font-semibold text-chmsu-flame tabular-nums">
                {formatDate(doc.due_at)}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-200 p-2.5">
              <dt className="font-semibold uppercase tracking-wide text-slate-500">
                Origin
              </dt>
              <dd className="mt-0.5 font-semibold text-slate-900">
                CHMSU {originName}
              </dd>
              <dd className="text-[11px] text-slate-600">
                {doc.sender_office || doc.sender_name}
              </dd>
            </div>

            <div className="rounded-lg border border-slate-200 p-2.5">
              <dt className="font-semibold uppercase tracking-wide text-slate-500">
                Destination
              </dt>
              <dd className="mt-0.5 font-semibold text-chmsu-navy">
                CHMSU {currentName}
              </dd>
              <dd className="text-[11px] text-slate-600">{doc.current_office}</dd>
            </div>
          </dl>

          <p className="mt-4 border-t border-slate-200 pt-2.5 text-center text-[10px] text-slate-500">
            RA 10173 Notice: QR code encodes an opaque system token only. Attach
            this slip securely to the physical document folder.
          </p>
        </div>
      </div>
    </div>
  );
}
