"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

const CHANGE_EVENT = "smartcampus-seen-announcements-change";
const MAX_STORED_IDS = 500;

function getStorageKey(userId) {
  return userId ? `smartcampus_seen_announcements_${userId}` : "";
}

function readRawSeen(userId) {
  if (typeof window === "undefined" || !userId) return "[]";
  try {
    return window.localStorage.getItem(getStorageKey(userId)) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribeSeen(callback) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(CHANGE_EVENT, handler);
  };
}

function getServerSnapshot() {
  return "[]";
}

export default function useUnreadAnnouncements({
  userId,
  announcements = [],
  isViewingAnnouncements = false,
}) {
  const getSnapshot = useCallback(() => readRawSeen(userId), [userId]);

  const rawSeen = useSyncExternalStore(
    subscribeSeen,
    getSnapshot,
    getServerSnapshot
  );

  const seenSet = useMemo(() => {
    try {
      const parsed = JSON.parse(rawSeen);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }, [rawSeen]);

  const markAllAsSeen = useCallback(
    (list = announcements) => {
      if (typeof window === "undefined" || !userId) return;
      if (!Array.isArray(list) || list.length === 0) return;

      const currentRaw = readRawSeen(userId);
      let currentIds = [];
      try {
        const parsed = JSON.parse(currentRaw);
        if (Array.isArray(parsed)) currentIds = parsed;
      } catch {
        currentIds = [];
      }

      const existing = new Set(currentIds);
      let added = false;

      for (const item of list) {
        if (item?.id && !existing.has(item.id)) {
          existing.add(item.id);
          currentIds.push(item.id);
          added = true;
        }
      }

      if (!added) return;

      const trimmed =
        currentIds.length > MAX_STORED_IDS
          ? currentIds.slice(currentIds.length - MAX_STORED_IDS)
          : currentIds;

      try {
        window.localStorage.setItem(
          getStorageKey(userId),
          JSON.stringify(trimmed)
        );
        window.dispatchEvent(new Event(CHANGE_EVENT));
      } catch {
        // Ignore storage quota / private-mode errors
      }
    },
    [announcements, userId]
  );

  // Auto-mark visible announcements as seen whenever viewing the Announcements tab
  // (covers initial load, clicking the tab, and new Realtime arrivals while viewing)
  useEffect(() => {
    if (isViewingAnnouncements && announcements.length > 0) {
      markAllAsSeen(announcements);
    }
  }, [isViewingAnnouncements, announcements, markAllAsSeen]);

  const unreadCount = useMemo(() => {
    if (!userId || !Array.isArray(announcements)) return 0;
    let count = 0;
    for (const item of announcements) {
      if (!item?.id) continue;
      if (item.is_active === false) continue;
      const authorId = item.author_id ?? item.created_by ?? null;
      if (authorId && authorId === userId) continue;
      if (!seenSet.has(item.id)) {
        count += 1;
      }
    }
    return count;
  }, [announcements, seenSet, userId]);

  return { unreadCount, markAllAsSeen };
}
