"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FilePlus2,
  FolderOpen,
  Megaphone,
  UserCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/constants";
import PrivacyTermsGate from "@/components/PrivacyTermsGate";
import PortalSidebar, {
  SidebarToggleButton,
  usePortalSidebarState,
} from "@/components/PortalSidebar";
import DocumentRegisterPanel from "@/components/DocumentRegisterPanel";
import MyDocumentsClient from "@/components/MyDocumentsClient";
import LiveNotificationBell from "@/components/LiveNotificationBell";
import HeaderAccountMenu from "@/components/HeaderAccountMenu";
import AnnouncementsAvailabilityPanel from "@/components/AnnouncementsAvailabilityPanel";
import UserProfileView from "@/components/UserProfileView";

export default function RmoPortalClient({
  profile,
  campus,
  initialTab = "intake",
  allCampuses,
  initialDocuments,
  initialAnnouncements = [],
}) {
  const router = useRouter();
  const roleLabel = ROLE_LABELS[profile?.role] ?? profile?.role ?? "RMO";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [signingOut, setSigningOut] = useState(false);
  const [documents, setDocuments] = useState(initialDocuments);
  const { collapsed, mobileOpen, toggleSidebar, closeMobile } =
    usePortalSidebarState();

  function handleSelectTab(nextTab) {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", nextTab);
      window.history.replaceState(null, "", url.toString());
    }
  }

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

  const refreshDocuments = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("documents")
      .select(
        "id, tracking_code, qr_token, origin_campus_id, current_campus_id, title, description, document_type, priority, status, sender_name, sender_office, current_office, current_holder_id, created_by, file_path, file_name, file_mime_type, file_size_bytes, sla_hours, due_at, is_delayed, delayed_at, completed_at, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(150);

    if (data) setDocuments(data);
  }, []);

  const navItems = [
    {
      id: "intake",
      label: "Register / Send Document",
      icon: FilePlus2,
    },
    {
      id: "documents",
      label: "My Documents",
      icon: FolderOpen,
    },
    {
      id: "announcements",
      label: Boolean(profile?.is_teaching)
        ? "Announcements & Availability"
        : "Manage Announcements",
      icon: Megaphone,
    },
  ];

  return (
    <div className="min-h-dvh flex flex-col bg-chmsu-canvas text-slate-900 lg:flex-row">
      <PrivacyTermsGate profile={profile} />

      <PortalSidebar
        title="SmartCampus CHMSU"
        subtitle={`CHMSU ${campus.name}`}
        navItems={navItems}
        activeId={activeTab}
        onSelect={handleSelectTab}
        profile={profile}
        roleBadge={roleLabel}
        roleIcon={UserCheck}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        collapsed={collapsed}
        onToggleCollapse={toggleSidebar}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
        ariaLabel="RMO Portal Navigation"
      />

      {/* Main Column */}
      <div
        className={`flex min-h-screen min-w-0 flex-1 flex-col transition-all duration-200 print:pl-0 ${
          collapsed ? "lg:pl-20" : "lg:pl-64"
        }`}
      >
        {/* Sticky Top Header Bar */}
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-chmsu-border bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarToggleButton onClick={toggleSidebar} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-bold text-chmsu-forest">
                  CHMSU {campus.name}
                </span>
                <span className="hidden items-center rounded-full border border-chmsu-forest/15 bg-chmsu-forest/10 px-2.5 py-0.5 text-xs font-semibold text-chmsu-forest sm:inline-flex">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <LiveNotificationBell
              userId={profile?.id}
              onNavigate={(item) => {
                if (item.type === "announcement")
                  handleSelectTab("announcements");
                else handleSelectTab("documents");
              }}
            />
            <HeaderAccountMenu
              userId={profile?.id}
              avatarUrl={profile?.avatar_url}
              fullName={profile?.full_name}
              onOpenProfile={() => handleSelectTab("profile")}
              onSignOut={handleSignOut}
              signingOut={signingOut}
            />
          </div>
        </header>

        {/* Page Body */}
        <main className="w-full flex-1 px-4 py-5 sm:px-6">
          {/* TAB 1: REGISTER / SEND DOCUMENT */}
          {activeTab === "intake" && (
            <DocumentRegisterPanel
              profile={profile}
              campus={campus}
              allCampuses={allCampuses}
              onDocumentRegistered={refreshDocuments}
              showPageHeader
            />
          )}

          {/* TAB 2: MY DOCUMENTS */}
          {activeTab === "documents" && (
            <MyDocumentsClient
              profile={profile}
              campus={campus}
              allCampuses={allCampuses}
              initialDocuments={documents}
            />
          )}

          {/* TAB 3: ANNOUNCEMENTS & AVAILABILITY */}
          {activeTab === "announcements" && (
            <AnnouncementsAvailabilityPanel
              profile={profile}
              campus={campus}
              initialAnnouncements={initialAnnouncements}
            />
          )}

          {/* TAB 4: MY PROFILE */}
          {activeTab === "profile" && (
            <UserProfileView profile={profile} campus={campus} />
          )}
        </main>
      </div>
    </div>
  );
}
