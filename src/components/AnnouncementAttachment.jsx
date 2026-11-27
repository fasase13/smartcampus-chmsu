"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Paperclip, X } from "lucide-react";
import {
  formatFileSize,
  isImageAttachment,
} from "@/lib/announcementAttachments";

export default function AnnouncementAttachment({
  url,
  name = "",
  type = "",
  size = 0,
  compact = false,
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setLightboxOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen]);

  if (!url) return null;

  const isImage = isImageAttachment(type, name);
  const formattedSize = formatFileSize(size);
  const displayName = name || (isImage ? "Attached image" : "Attached file");

  if (isImage) {
    return (
      <>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            title="Click to view full image"
            className="group relative inline-block max-w-full cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left transition hover:border-chmsu-green"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={displayName}
              loading="lazy"
              className={`${
                compact ? "max-h-36" : "max-h-72"
              } w-auto max-w-full rounded-xl object-contain`}
            />
          </button>
        </div>

        {lightboxOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={displayName}
            onClick={() => setLightboxOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative flex max-h-[90vh] max-w-5xl flex-col overflow-hidden rounded-2xl bg-slate-950 shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  {formattedSize && (
                    <p className="text-[11px] text-white/65">{formattedSize}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={displayName}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(false)}
                    aria-label="Close image preview"
                    className="cursor-pointer rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-center overflow-auto bg-black p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={displayName}
                  className="max-h-[78vh] w-auto max-w-full rounded-lg object-contain"
                />
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mt-3">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex max-w-full items-center gap-3 rounded-xl border border-chmsu-border bg-chmsu-canvas/70 px-3.5 py-2.5 text-left transition hover:border-chmsu-green hover:bg-white"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chmsu-forest/10 text-chmsu-forest">
          {type === "application/pdf" ? (
            <FileText className="h-4 w-4" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-800 group-hover:text-chmsu-forest">
            {displayName}
          </span>
          <span className="block text-[11px] text-slate-500">
            {formattedSize ? `${formattedSize} • ` : ""}Open / Download
          </span>
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-chmsu-green" />
      </a>
    </div>
  );
}
