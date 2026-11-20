"use client";

import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function GlobalError({ error, reset }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-chmsu-canvas p-6">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xs">
        <Image
          src="/images/chmsu-logo.jpg"
          alt="CHMSU Seal"
          width={64}
          height={64}
          className="mx-auto mb-4 h-16 w-16 rounded-full object-contain"
        />
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-3 text-xl font-bold text-chmsu-forest">
          Something Went Wrong
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          SmartCampus CHMSU encountered an unexpected error while loading this
          view. Please try again or return to the Campus Gateway.
        </p>
        {error?.digest && (
          <p className="mt-2 font-mono text-[11px] text-slate-400">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-chmsu-border bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-chmsu-green"
          >
            <Home className="h-4 w-4" />
            Campus Gateway
          </Link>
        </div>
      </div>
    </main>
  );
}
