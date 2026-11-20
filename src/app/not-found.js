import Image from "next/image";
import Link from "next/link";
import { Home, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-chmsu-canvas p-6">
      <div className="w-full max-w-md rounded-2xl border border-chmsu-border bg-white p-8 text-center shadow-xs">
        <Image
          src="/images/chmsu-logo.jpg"
          alt="CHMSU Seal"
          width={64}
          height={64}
          className="mx-auto mb-4 h-16 w-16 rounded-full object-contain"
        />
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-chmsu-flame">
          <SearchX className="h-6 w-6" />
        </div>
        <p className="mt-3 text-xs font-bold uppercase tracking-widest text-chmsu-green">
          404 &bull; Page Not Found
        </p>
        <h1 className="mt-1 text-2xl font-bold text-chmsu-forest">
          Campus Route Not Found
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          The SmartCampus CHMSU page or campus portal you requested does not
          exist or has moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green"
        >
          <Home className="h-4 w-4" />
          Return to 4-Campus Gateway
        </Link>
      </div>
    </main>
  );
}
