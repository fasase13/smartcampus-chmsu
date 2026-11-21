import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import UnifiedLoginCard from "@/components/UnifiedLoginCard";

export const dynamic = "force-dynamic";

export default function HomePage() {
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

          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-chmsu-gold px-3.5 py-2 text-xs font-bold text-chmsu-forest transition hover:bg-white sm:text-sm"
          >
            <UserPlus className="h-4 w-4" />
            <span>Register Account</span>
          </Link>
        </div>
      </header>

      {/* Centered Single Unified Portal Login Card */}
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <Suspense fallback={null}>
          <UnifiedLoginCard />
        </Suspense>
      </main>

      {/* Minimal Institutional Footer */}
      <footer className="border-t border-chmsu-border bg-white py-4">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-slate-500 sm:flex-row sm:px-6">
          <span>
            &copy; {new Date().getFullYear()} Carlos Hilado Memorial State
            University
          </span>
          <Link
            href="/privacy"
            className="font-semibold text-chmsu-navy transition hover:text-chmsu-green"
          >
            RA 10173 Data Privacy Notice
          </Link>
        </div>
      </footer>
    </div>
  );
}
