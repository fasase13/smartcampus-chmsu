"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  FileText,
  Megaphone,
  UserCheck,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const diffSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  );
  if (diffSec < 45) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
  }).format(new Date(isoString));
}

function getNotificationMeta(type) {
  switch (type) {
    case "delay_alert":
      return {
        icon: AlertTriangle,
        iconWrap: "bg-red-100 text-[#DC2626]",
      };
    case "announcement":
      return {
        icon: Megaphone,
        iconWrap: "bg-chmsu-navy/10 text-chmsu-navy",
      };
    case "system":
      return {
        icon: UserCheck,
        iconWrap: "bg-amber-100 text-amber-800",
      };
    case "document_assigned":
    case "document_forwarded":
    default:
      return {
        icon: FileText,
        iconWrap: "bg-emerald-100 text-chmsu-forest",
      };
  }
}

export default function LiveNotificationBell({ userId, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [toast, setToast] = useState(null);
  const containerRef = useRef(null);
  const toastTimerRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select(
        "id, user_id, campus_id, document_id, type, title, message, is_read, read_at, created_at"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (Array.isArray(data)) {
      setNotifications(data);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const initTimer = setTimeout(() => {
      fetchNotifications();
    }, 0);

    const supabase = createClient();
    const channel = supabase
      .channel(`live-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = payload.new;
          if (!incoming?.id) return;
          setNotifications((prev) => {
            if (prev.some((item) => item.id === incoming.id)) return prev;
            return [incoming, ...prev].slice(0, 30);
          });
          setToast(incoming);
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setToast(null), 5000);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new;
          if (!updated?.id) return;
          setNotifications((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const removedId = payload.old?.id;
          if (!removedId) return;
          setNotifications((prev) =>
            prev.filter((item) => item.id !== removedId)
          );
        }
      )
      .subscribe();

    return () => {
      clearTimeout(initTimer);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function handleNotificationClick(item) {
    if (!item.is_read) {
      const nowIso = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === item.id ? { ...n, is_read: true, read_at: nowIso } : n
        )
      );
      const supabase = createClient();
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: nowIso })
        .eq("id", item.id)
        .eq("user_id", userId);
    }
    setOpen(false);
    if (onNavigate) {
      onNavigate(item);
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0 || !userId) return;
    setMarkingAll(true);
    try {
      const nowIso = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) =>
          n.is_read ? n : { ...n, is_read: true, read_at: nowIso }
        )
      );
      const supabase = createClient();
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: nowIso })
        .eq("user_id", userId)
        .eq("is_read", false);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-label="Open notifications"
          aria-expanded={open}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-chmsu-border bg-white text-slate-700 transition hover:border-chmsu-green hover:bg-chmsu-canvas hover:text-chmsu-forest"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex min-w-4.5 items-center justify-center rounded-md bg-[#DC2626] px-1 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Notifications"
            className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-chmsu-border bg-white shadow-xl sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-chmsu-border bg-chmsu-canvas px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-chmsu-forest">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="rounded-md bg-[#DC2626] px-2 py-0.5 text-[10px] font-bold text-white tabular-nums">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  disabled={markingAll}
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-chmsu-navy hover:text-chmsu-forest disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all as read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
                <Bell className="h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  You&apos;re all caught up
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  New document updates, announcements, and alerts will appear
                  here in real time.
                </p>
              </div>
            ) : (
              <ul className="max-h-96 divide-y divide-chmsu-border overflow-y-auto">
                {notifications.map((item) => {
                  const meta = getNotificationMeta(item.type);
                  const Icon = meta.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(item)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-chmsu-canvas ${
                          !item.is_read ? "bg-emerald-50/40" : "bg-white"
                        }`}
                      >
                        <span
                          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${meta.iconWrap}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`truncate text-xs ${
                                !item.is_read
                                  ? "font-bold text-slate-900"
                                  : "font-semibold text-slate-700"
                              }`}
                            >
                              {item.title}
                            </p>
                            <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
                              {formatRelativeTime(item.created_at)}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                            {item.message}
                          </p>
                        </div>
                        {!item.is_read && (
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-chmsu-green"
                            aria-label="Unread"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Non-intrusive live corner toast on incoming Realtime notification */}
      {toast && (
        <div
          role="status"
          className="no-print fixed bottom-5 right-5 z-50 flex w-80 max-w-[calc(100vw-2.5rem)] items-start gap-3 rounded-2xl border border-chmsu-border bg-white p-3.5 shadow-2xl"
        >
          <span
            className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
              getNotificationMeta(toast.type).iconWrap
            }`}
          >
            {(() => {
              const ToastIcon = getNotificationMeta(toast.type).icon;
              return <ToastIcon className="h-4 w-4" />;
            })()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-chmsu-forest">
              {toast.title}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
              {toast.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
