"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FilePlus2,
  Home,
  Megaphone,
  QrCode,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, ROLES } from "@/lib/constants";
import PrivacyTermsGate from "@/components/PrivacyTermsGate";
import PortalSidebar, {
  SidebarToggleButton,
  usePortalSidebarState,
} from "@/components/PortalSidebar";

export default function PortalShell({ profile, campus, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const { collapsed, mobileOpen, toggleSidebar, closeMobile } =
    usePortalSidebarState();

  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? "User";
  const campusSlug = campus?.slug ?? profile?.campuses?.slug ?? "talisay";
  const campusName = campus?.name ?? profile?.campuses?.name ?? "CHMSU";

  const navItems = [
    {
      href: "/superadmin",
      label: "Superadmin Console",
      icon: ShieldCheck,
      visible: profile?.role === ROLES.SUPERADMIN,
    },
    {
      href: `/${campusSlug}/admin`,
      label: "Campus Admin",
      icon: ShieldCheck,
      visible: profile?.role === ROLES.CAMPUS_ADMIN,
    },
    {
      href: "/management",
      label: "Institutional Management",
      icon: ShieldCheck,
      visible: [ROLES.SUPERADMIN, ROLES.MANAGEMENT].includes(profile?.role),
    },
    {
      href: `/${campusSlug}/rmo`,
      label: "RMO Intake & Registry",
      icon: FilePlus2,
      visible: [
        ROLES.RMO,
        ROLES.CAMPUS_ADMIN,
        ROLES.SUPERADMIN,
        ROLES.MANAGEMENT,
      ].includes(profile?.role),
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
        ROLES.CAMPUS_ADMIN,
        ROLES.SUPERADMIN,
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
        ROLES.CAMPUS_ADMIN,
        ROLES.SUPERADMIN,
        ROLES.MANAGEMENT,
      ].includes(profile?.role),
    },
    {
      href: "/",
      label: "Campus Gateway",
      icon: Home,
      visible: true,
    },
  ]
    .filter((item) => item.visible)
    .map((item) => ({
      ...item,
      isActive: pathname === item.href,
    }));

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

      <PortalSidebar
        title="SmartCampus CHMSU"
        subtitle={`CHMSU ${campusName}`}
        navItems={navItems}
        profile={profile}
        roleBadge={roleLabel}
        roleIcon={UserCheck}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        collapsed={collapsed}
        onToggleCollapse={toggleSidebar}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />

      {/* Main Column */}
      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-200 print:pl-0 ${
          collapsed ? "lg:pl-20" : "lg:pl-64"
        }`}
      >
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarToggleButton onClick={toggleSidebar} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <nav
                  aria-label="Breadcrumb"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500"
                >
                  <Link href="/" className="hover:text-chmsu-forest">
                    Gateway
                  </Link>
                  <span>/</span>
                  <span className="truncate font-semibold text-chmsu-forest">
                    CHMSU {campusName}
                  </span>
                </nav>
                <span className="hidden items-center rounded-full border border-chmsu-forest/15 bg-chmsu-forest/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-forest sm:inline-flex">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-900">
              {profile?.full_name}
            </p>
            <p className="text-xs text-slate-500">
              {profile?.department || profile?.email}
            </p>
          </div>
        </header>

        {/* Page Body */}
        <main className="w-full flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
