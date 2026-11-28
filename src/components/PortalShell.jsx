"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  FilePlus2,
  FolderOpen,
  Megaphone,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, ROLES } from "@/lib/constants";
import PrivacyTermsGate from "@/components/PrivacyTermsGate";
import DocumentRegisterPanel from "@/components/DocumentRegisterPanel";
import LiveNotificationBell from "@/components/LiveNotificationBell";
import HeaderAccountMenu from "@/components/HeaderAccountMenu";
import UserProfileView from "@/components/UserProfileView";
import PortalSidebar, {
  SidebarToggleButton,
  usePortalSidebarState,
} from "@/components/PortalSidebar";

export default function PortalShell({
  profile,
  campus,
  allCampuses = [],
  children,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [activeView, setActiveView] = useState("main"); // main | send | profile
  const { collapsed, mobileOpen, toggleSidebar, closeMobile } =
    usePortalSidebarState();

  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? "User";
  const campusSlug = campus?.slug ?? profile?.campuses?.slug ?? "talisay";
  const campusName = campus?.name ?? profile?.campuses?.name ?? "CHMSU";
  const canSendDocuments =
    [ROLES.FACULTY, ROLES.STAFF, ROLES.RMO].includes(profile?.role) &&
    allCampuses.length > 0;

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
      id: "send",
      label: "Send / Register Document",
      icon: FilePlus2,
      visible: canSendDocuments,
    },
    {
      href: `/${campusSlug}/office`,
      label: "My Documents",
      icon: FolderOpen,
      visible: [
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
      label:
        profile?.role === ROLES.FACULTY
          ? "Announcements & Availability"
          : "Manage Announcements",
      icon: Megaphone,
      visible: [
        ROLES.FACULTY,
        ROLES.STAFF,
        ROLES.RMO,
        ROLES.CAMPUS_ADMIN,
        ROLES.SUPERADMIN,
        ROLES.MANAGEMENT,
      ].includes(profile?.role),
    },
  ]
    .filter((item) => item.visible)
    .map((item) => {
      if (item.id === "profile") {
        return { ...item, isActive: activeView === "profile" };
      }
      if (item.id === "send") {
        return { ...item, isActive: activeView === "send" };
      }
      if (item.href === pathname) {
        return {
          id: "current-route",
          label: item.label,
          icon: item.icon,
          isActive: activeView === "main",
        };
      }
      return {
        ...item,
        isActive: false,
      };
    });

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createClient();
      try {
        await supabase.rpc("log_auth_activity", {
          p_event: "sign_out",
          p_portal: profile?.role || "office",
        });
      } catch {
        // Best-effort auth activity logging
      }
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
        activeId={
          activeView === "profile"
            ? "profile"
            : activeView === "send"
              ? "send"
              : "current-route"
        }
        onSelect={(id) => {
          if (id === "profile") setActiveView("profile");
          else if (id === "send") setActiveView("send");
          else if (id === "current-route") setActiveView("main");
        }}
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
                <span className="truncate text-sm font-bold text-chmsu-forest">
                  CHMSU {campusName}
                </span>
                <span className="hidden items-center rounded-md border border-chmsu-forest/15 bg-chmsu-forest/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-forest sm:inline-flex">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <LiveNotificationBell
              userId={profile?.id}
              onNavigate={() => setActiveView("main")}
            />
            <HeaderAccountMenu
              userId={profile?.id}
              avatarUrl={profile?.avatar_url}
              fullName={profile?.full_name}
              onOpenProfile={() => {
                setActiveView("profile");
                if (typeof window !== "undefined") {
                  const url = new URL(window.location.href);
                  url.searchParams.set("tab", "profile");
                  window.history.replaceState(null, "", url.toString());
                }
              }}
              onSignOut={handleSignOut}
              signingOut={signingOut}
            />
          </div>
        </header>

        {/* Page Body */}
        <main className="w-full flex-1 px-4 py-5 sm:px-6">
          {activeView === "profile" ? (
            <UserProfileView profile={profile} campus={campus} />
          ) : activeView === "send" && canSendDocuments ? (
            <DocumentRegisterPanel
              profile={profile}
              campus={campus}
              allCampuses={allCampuses}
              showPageHeader
            />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
