import Image from "next/image";
import Link from "next/link";
import {
  Building2,
  MapPin,
  Monitor,
  LogIn,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CampusGatewayPage() {
  const supabase = await createClient();

  const { data: campuses, error } = await supabase
    .from("campuses")
    .select("id, code, slug, name, address, contact_email, is_main")
    .eq("is_active", true)
    .order("is_main", { ascending: false })
    .order("name", { ascending: true });

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900">
      {/* Top Institutional Header */}
      <header className="border-b border-chmsu-forest/15 bg-chmsu-forest text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white p-1 shadow-sm">
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-chmsu-gold">
                Carlos Hilado Memorial State University
              </p>
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">
                SmartCampus CHMSU
              </h1>
            </div>
          </div>

          <Link
            href="/login/management"
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/20 sm:text-sm"
          >
            <ShieldCheck className="h-4 w-4 text-chmsu-gold" />
            <span className="hidden sm:inline">Management / Admin</span>
            <span className="sm:hidden">Admin</span>
          </Link>
        </div>
      </header>

      {/* Main Gateway Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-chmsu-green/25 bg-chmsu-green/10 px-3 py-1 text-xs font-semibold text-chmsu-forest">
            <Building2 className="h-3.5 w-3.5 text-chmsu-green" />
            4-Campus Unified Digital Gateway
          </span>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-chmsu-forest sm:text-3xl">
            Select Your CHMSU Campus
          </h2>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Launch a public campus information kiosk for announcements and
            instructor availability, or sign in to your dedicated campus portal.
          </p>
        </div>

        {error ? (
          <div className="mx-auto mt-8 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-800">
            Unable to load campuses from Supabase. Please verify your database
            connection and that <code className="font-mono">seed.sql</code> has
            been executed.
          </div>
        ) : !campuses || campuses.length === 0 ? (
          <div className="mx-auto mt-8 max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">
            No active campuses found in <code className="font-mono">public.campuses</code>.
            Run <code className="font-mono">supabase/seed.sql</code> to initialize the 4 CHMSU campuses.
          </div>
        ) : (
          <section
            aria-label="CHMSU Campuses"
            className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2"
          >
            {campuses.map((campus) => (
              <article
                key={campus.id}
                className="flex flex-col justify-between rounded-2xl border border-chmsu-border bg-chmsu-card p-6 transition hover:border-chmsu-green/50 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chmsu-forest text-sm font-bold tracking-wider text-chmsu-gold">
                        {campus.code}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-chmsu-forest">
                          CHMSU {campus.name}
                        </h3>
                        <p className="text-xs font-medium text-slate-500">
                          {campus.is_main
                            ? "Main University Campus"
                            : "External Campus"}
                        </p>
                      </div>
                    </div>
                    {campus.is_main && (
                      <span className="rounded-full border border-chmsu-gold/60 bg-chmsu-gold/20 px-2.5 py-0.5 text-[11px] font-semibold text-chmsu-forest">
                        Main
                      </span>
                    )}
                  </div>

                  {campus.address && (
                    <p className="mt-4 flex items-start gap-2 text-sm text-slate-600">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-chmsu-green" />
                      <span>{campus.address}</span>
                    </p>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Link
                    href={`/${campus.slug}/kiosk`}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-chmsu-forest/20 bg-chmsu-canvas px-4 py-2.5 text-sm font-semibold text-chmsu-forest transition hover:border-chmsu-green hover:bg-chmsu-green/10"
                  >
                    <Monitor className="h-4 w-4 text-chmsu-green" />
                    Open Public Kiosk
                  </Link>
                  <Link
                    href={`/login/${campus.slug}`}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-chmsu-forest px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-chmsu-green"
                  >
                    <LogIn className="h-4 w-4" />
                    Campus Portal Login
                  </Link>
                </div>
              </article>
            ))}
          </section>
        )}

        {/* Institutional Management / System Admin Subtle Banner */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 rounded-xl border border-chmsu-border bg-white px-5 py-4 text-sm sm:flex-row">
          <div className="flex items-center gap-3 text-slate-600">
            <ShieldCheck className="h-5 w-5 shrink-0 text-chmsu-navy" />
            <span>
              University Executives &amp; System Administrators have
              cross-campus oversight access.
            </span>
          </div>
          <Link
            href="/login/management"
            className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-chmsu-navy transition hover:text-chmsu-green"
          >
            Institutional Management / Admin Login
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>

      {/* System Status & Campus Info Footer */}
      <footer className="border-t border-chmsu-border bg-white py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              System Online &bull; {campuses?.length ?? 0}/4 Campuses Active
            </span>
            <span>
              &copy; {new Date().getFullYear()} Carlos Hilado Memorial State
              University
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/privacy"
              className="font-semibold text-chmsu-navy transition hover:text-chmsu-green"
            >
              RA 10173 Data Privacy Notice
            </Link>
            <Link
              href="/login/management"
              className="font-semibold text-chmsu-forest transition hover:text-chmsu-green"
            >
              Management &amp; Admin
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
