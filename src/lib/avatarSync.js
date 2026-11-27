"use client";

import { useEffect, useState } from "react";

const AVATAR_UPDATE_EVENT = "smartcampus-avatar-updated";

export function broadcastAvatarUpdate(userId, avatarUrl) {
  if (typeof window === "undefined" || !userId) return;
  window.dispatchEvent(
    new CustomEvent(AVATAR_UPDATE_EVENT, {
      detail: { userId, avatarUrl: avatarUrl || null },
    })
  );
}

export function useLiveAvatarUrl(userId, initialAvatarUrl) {
  const [override, setOverride] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;

    function handleAvatarUpdated(event) {
      const detail = event?.detail;
      if (!detail || detail.userId !== userId) return;
      setOverride({
        userId,
        avatarUrl: detail.avatarUrl || null,
      });
    }

    window.addEventListener(AVATAR_UPDATE_EVENT, handleAvatarUpdated);
    return () => {
      window.removeEventListener(AVATAR_UPDATE_EVENT, handleAvatarUpdated);
    };
  }, [userId]);

  if (override && override.userId === userId) {
    return override.avatarUrl;
  }
  return initialAvatarUrl || null;
}
