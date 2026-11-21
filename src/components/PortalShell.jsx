"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  Megaphone,
  Menu,
  X,
  Building2,
  UserCheck,
  Home,
  FilePlus2,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, ROLES } from "@/lib/constants";
import PrivacyTermsGate from "@/components/PrivacyTermsGate";

export default function PortalShell({
  profile,
  campus,
  children,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? "User";
  const campusSlug = campus?.slug ?? profile?.campuses?.slug ?? "talisay";
  const campusName = campus?.name ?? profile?.campuses?.name ?? "CHMSU";

  const navItems = [
    {
      href: "/management",
      label: "Management & Admin",
      icon: ShieldCheck,
      visible: [ROLES.ADMIN, ROLES.MANAGEMENT].includes(profile?.role),
    },
    {
      href: `/${campusSlug}/rmo`,
      label: "RMO Intake & Registry",
      icon: FilePlus2,
      visible: [ROLES.RMO, ROLES.ADMIN, ROLES.MANAGEMENT].includes(
        profile?.role
      ),
    },
    {
      href: `/${campusSlug}/office`,
      label: "QR Scanner & Office Queue",
      icon: QrCode,
      visible: [
        ROLES.DEPT_HEAD,
        ROLES.RMO,
        ROLES.FACULTY,
        ROLES.STAFF,
        ROLES.ADMIN,
        ROLES.MANAGEMENT,
      ].includes(profile?.role),
    },
    {
      href: `/${campusSlug}/faculty`,
      label: "Announcements & Availability",
      icon: Megaphone,
      visible: [
        ROLES.FACULTY,
        ROLES.STAFF,
        ROLES.DEPT_HEAD,
        ROLES.RMO,
        ROLES.ADMIN,
        ROLES.MANAGEMENT,
      ].includes(profile?.role),
    },
    {
      href: "/",
      label: "Campus Gateway",
      icon: Home,
      visible: true,
    },
  ].filter((item) => item.visible);

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

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas lg:flex-row">
      <PrivacyTermsGate profile={profile} />
      {/* Desktop Sidebar */}
      <aside className="no-print hidden w-64 shrink-0 flex-col border-r border-chmsu-forest/15 bg-chmsu-forest text-white lg:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white p-0.5">
            <Image
              src="/images/chmsu-logo.jpg"
              alt="CHMSU Seal"
              width={38}
              height={38}
              className="h-full w-full rounded-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight">
              SmartCampus
            </p>
            <p className="truncate text-[11px] font-medium text-chmsu-gold">
              CHMSU {campusName}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Portal Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-chmsu-green text-white shadow-xs"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl bg-white/10 p-3">
            <p className="truncate text-sm font-semibold text-white">
              {profile?.full_name}
            </p>
            <p className="mt-0.5 truncate text-xs text-white/75">
              {profile?.email}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-chmsu-gold px-2 py-0.5 text-[11px] font-semibold text-chmsu-forest">
                <UserCheck className="h-3 w-3" />
                {roleLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-white">
                <Building2 className="h-3 w-3" />
                {campusName}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-600/80 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar (Mobile + Desktop Context Header) */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-chmsu-border text-slate-700 hover:bg-slate-50 lg:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            <div className="flex items-center gap-2.5 lg:hidden">
              <Image
                src="/images/chmsu-logo.jpg"
                alt="CHMSU Seal"
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-contain"
              />
              <div>
                <p className="text-sm font-bold text-chmsu-forest">
                  SmartCampus CHMSU
                </p>
                <p className="text-[11px] text-slate-500">{campusName}</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500"
              >
                <Link href="/" className="hover:text-chmsu-forest">
                  Gateway
                </Link>
                <span>/</span>
                <span className="font-semibold text-chmsu-forest">
                  CHMSU {campusName}
                </span>
              </nav>
              <span className="inline-flex items-center rounded-full border border-chmsu-navy/20 bg-chmsu-navy/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-navy">
                {roleLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">
                {profile?.full_name}
              </p>
              <p className="text-xs text-slate-500">
                {profile?.department || profile?.email}
              </p>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-chmsu-border bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60 lg:hidden"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-chmsu-border bg-chmsu-forest p-3 text-white lg:hidden">
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive ? "bg-chmsu-green text-white" : "text-white/85 hover:bg-white/10"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* Page Body */}
        <main className="w-full flex-1 px-4 py-5 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
