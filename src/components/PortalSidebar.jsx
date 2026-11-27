"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { useLiveAvatarUrl } from "@/lib/avatarSync";

const STORAGE_KEY = "smartcampus_sidebar_collapsed";
const CHANGE_EVENT = "smartcampus-sidebar-change";

function subscribeCollapsed(callback) {
  if (typeof window === "undefined") return () => { };
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(CHANGE_EVENT, handler);
  };
}

function getCollapsedSnapshot() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getCollapsedServerSnapshot() {
  return false;
}

export function usePortalSidebarState() {
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen((prev) => !prev);
      return;
    }

    try {
      const next = !getCollapsedSnapshot();
      window.localStorage.setItem(STORAGE_KEY, String(next));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // Ignore storage quota / private-mode errors
    }
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return { collapsed, mobileOpen, toggleSidebar, closeMobile };
}

export function SidebarToggleButton({ onClick, label = "Toggle navigation menu" }) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-chmsu-border bg-white text-[#143D29] transition hover:border-[#143D29]/30 hover:bg-chmsu-canvas lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-chmsu-border bg-white p-0.5 shadow-2xs sm:h-10 sm:w-10">
        <Image
          src="/images/chmsu-logo.jpg"
          alt="CHMSU Seal"
          width={38}
          height={38}
          className="h-full w-full rounded-full object-contain"
        />
      </div>
    </div>
  );
}

function getInitials(name) {
  const primary = String(name ?? "")
    .split(/[—–|(]/)[0]
    .replace(/[^a-zA-Z\s]/g, " ")
    .trim();
  const words = primary.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "U";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export default function PortalSidebar({
  title = "SmartCampus CHMSU",
  subtitle,
  navItems,
  activeId,
  onSelect,
  profile,
  roleBadge,
  roleIcon: RoleIcon = ShieldCheck,
  onSignOut,
  signingOut = false,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
  onProfileClick,
  ariaLabel = "Portal Navigation",
}) {
  const initials = getInitials(profile?.full_name || profile?.email);
  const avatarUrl = useLiveAvatarUrl(profile?.id, profile?.avatar_url);
  const isProfileActive = activeId === "profile";
  const handleProfileCardClick =
    onProfileClick ||
    (onSelect
      ? () => {
        onSelect("profile");
        onCloseMobile?.();
      }
      : null);

  const visibleNavItems = navItems.filter((item) => item.id !== "profile");

  function renderNavItems(isCompact) {
    return visibleNavItems.map((item) => {
      const Icon = item.icon;
      const isActive =
        typeof item.isActive === "boolean"
          ? item.isActive
          : item.id !== undefined && item.id === activeId;
      const badgeCount = Number(item.badge ?? 0);
      const alertCount = Number(item.alertBadge ?? item.alertCount ?? 0);
      const hasAlertDot = Boolean(item.alertDot);
      const hasAnyDot = badgeCount > 0 || alertCount > 0 || hasAlertDot;

      const baseClass = `relative flex w-full shrink-0 items-center rounded-xl py-2.5 text-sm transition ${isCompact ? "justify-center px-0" : "justify-between gap-2 px-3.5 text-left"
        } ${isActive
          ? "bg-white font-semibold text-[#143D29] shadow-sm"
          : "font-medium text-white/85 hover:bg-white/10 hover:text-white"
        }`;

      const innerContent = (
        <>
          <span
            className={`flex items-center ${isCompact ? "justify-center" : "min-w-0 gap-2.5"
              }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!isCompact && <span className="truncate">{item.label}</span>}
          </span>

          {!isCompact && badgeCount > 0 && (
            <span className="rounded-full bg-[#FACC15] px-2 py-0.5 text-[11px] font-bold text-[#143D29] tabular-nums">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
          {!isCompact && alertCount > 0 && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
          {!isCompact && hasAlertDot && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
          )}

          {isCompact && hasAnyDot && (
            <span
              className={`absolute right-2.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#143D29] ${alertCount > 0 || hasAlertDot ? "bg-red-500" : "bg-[#FACC15]"
                }`}
            />
          )}
        </>
      );

      if (item.href) {
        return (
          <Link
            key={item.href}
            href={item.href}
            title={isCompact ? item.label : undefined}
            onClick={() => onCloseMobile?.()}
            className={baseClass}
          >
            {innerContent}
          </Link>
        );
      }

      return (
        <button
          key={item.id}
          type="button"
          title={isCompact ? item.label : undefined}
          onClick={() => {
            onSelect?.(item.id);
            onCloseMobile?.();
          }}
          className={baseClass}
        >
          {innerContent}
        </button>
      );
    });
  }

  function renderSidebarContent(isCompact, showMobileClose = false) {
    return (
      <>
        {/* Sidebar Header with 3-Line Collapse Toggle */}
        <div
          className={`flex min-h-[61px] shrink-0 items-center border-b border-white/15 py-3 sm:min-h-[65px] ${isCompact ? "justify-center px-2" : "justify-between gap-2 px-4"
            }`}
        >
          {isCompact ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/25 text-white transition hover:bg-white/10"
            >
              <Menu className="h-5 w-5" />
            </button>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-2.5">
                {!showMobileClose && (
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar"
                    className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/25 text-white transition hover:bg-white/10"
                  >
                    <Menu className="h-5 w-5" />
                  </button>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold tracking-tight text-white">
                    {title}
                  </p>
                  <p className="truncate text-[11px] font-semibold text-[#FACC15]">
                    {subtitle}
                  </p>
                </div>
              </div>

              {showMobileClose && (
                <button
                  type="button"
                  onClick={onCloseMobile}
                  aria-label="Close navigation menu"
                  className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Top Interactive User Profile Card (Opens My Profile) */}
        <div
          className={`shrink-0 ${isCompact ? "px-3 pb-2 pt-3.5" : "px-3.5 pb-2 pt-3.5"
            }`}
        >
          {isCompact ? (
            <button
              type="button"
              onClick={handleProfileCardClick ?? undefined}
              title={`My Profile — ${profile?.full_name ?? "User"}`}
              aria-label="My Profile"
              aria-current={isProfileActive ? "page" : undefined}
              className={`mx-auto flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-full text-xs font-bold transition ${isProfileActive
                  ? "bg-white text-[#143D29] ring-2 ring-[#FACC15]"
                  : "border border-white/15 bg-white/10 text-[#FACC15] hover:bg-white/20"
                }`}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={profile?.full_name || "Profile photo"}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleProfileCardClick ?? undefined}
              title="View My Profile"
              aria-current={isProfileActive ? "page" : undefined}
              className={`group w-full cursor-pointer rounded-xl p-3 text-left transition ${isProfileActive
                  ? "border border-[#FACC15] bg-white/15 ring-2 ring-[#FACC15]/75"
                  : "border border-white/10 bg-white/10 hover:bg-white/15"
                }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {profile?.full_name}
                  </p>
                  <p className="truncate text-xs text-white/70">
                    {profile?.email}
                  </p>
                </div>
                <ChevronRight
                  className={`mt-0.5 h-4 w-4 shrink-0 transition ${isProfileActive
                      ? "text-[#FACC15]"
                      : "text-white/50 group-hover:translate-x-0.5 group-hover:text-white"
                    }`}
                />
              </div>
              {roleBadge && (
                <span className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-[#FACC15] px-2.5 py-0.5 text-[11px] font-semibold text-[#143D29]">
                  <RoleIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{roleBadge}</span>
                </span>
              )}
            </button>
          )}
        </div>

        {/* Navigation Links / Tabs */}
        <nav
          aria-label={ariaLabel}
          className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 pt-2"
        >
          {renderNavItems(isCompact)}
        </nav>

        {/* Bottom Sign Out */}
        <div
          className={`mt-auto shrink-0 border-t border-white/10 ${isCompact ? "p-3" : "p-4"
            }`}
        >
          <button
            type="button"
            disabled={signingOut}
            onClick={onSignOut}
            title={isCompact ? "Sign Out" : undefined}
            aria-label={isCompact ? "Sign Out" : undefined}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60 ${isCompact ? "px-0" : "px-3"
              }`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!isCompact && (signingOut ? "Signing out..." : "Sign Out")}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop Fixed Full-Viewport Collapsible Sidebar (lg+) */}
      <aside
        className={`no-print hidden h-screen shrink-0 flex-col border-r border-white/10 bg-[#143D29] text-white transition-all duration-200 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex ${collapsed ? "w-20" : "w-64"
          }`}
      >
        {renderSidebarContent(collapsed, false)}
      </aside>

      {/* Mobile Slide-Over Drawer (< lg) */}
      <div
        className={`no-print fixed inset-0 z-40 lg:hidden ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"
          }`}
        aria-hidden={!mobileOpen}
      >
        {/* Backdrop */}
        <div
          onClick={onCloseMobile}
          className={`fixed inset-0 bg-slate-900/50 backdrop-blur-[1px] transition-opacity duration-200 ${mobileOpen ? "opacity-100" : "opacity-0"
            }`}
        />
        {/* Drawer Panel */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-dvh w-64 max-w-[85vw] flex-col border-r border-white/10 bg-[#143D29] text-white shadow-xl transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"
            }`}
        >
          {renderSidebarContent(false, true)}
        </aside>
      </div>
    </>
  );
}
