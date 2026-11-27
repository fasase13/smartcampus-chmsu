"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, User } from "lucide-react";

export default function HeaderAccountMenu({
  onOpenProfile,
  onSignOut,
  signingOut = false,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    function handleMouseDown(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border bg-white text-slate-700 transition hover:border-chmsu-green hover:bg-chmsu-canvas hover:text-chmsu-forest ${
          open
            ? "border-chmsu-green bg-chmsu-canvas text-chmsu-forest ring-2 ring-chmsu-green/15"
            : "border-chmsu-border"
        }`}
      >
        <User className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account options"
          className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-chmsu-border bg-white py-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              if (onOpenProfile) onOpenProfile();
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-chmsu-canvas hover:text-chmsu-forest"
          >
            <User className="h-4 w-4 shrink-0 text-chmsu-green" />
            <span>Profile Details</span>
          </button>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={() => {
              setOpen(false);
              if (onSignOut) onSignOut();
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>{signingOut ? "Signing out..." : "Sign Out"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
