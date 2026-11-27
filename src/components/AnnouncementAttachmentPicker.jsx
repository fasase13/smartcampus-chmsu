"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FileText, Paperclip, Upload, X } from "lucide-react";
import {
  ANNOUNCEMENT_ATTACHMENT_ACCEPT,
  formatFileSize,
  isImageAttachment,
  validateAnnouncementAttachment,
} from "@/lib/announcementAttachments";

export default function AnnouncementAttachmentPicker({
  file = null,
  existingAttachment = null,
  onFileSelect,
  onClear,
  disabled = false,
  inputId = "announcement-attachment",
}) {
  const inputRef = useRef(null);
  const [validationError, setValidationError] = useState("");

  const objectUrl = useMemo(() => {
    if (!file || !isImageAttachment(file.type, file.name)) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  function handleFileChange(event) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;

    const check = validateAnnouncementAttachment(picked);
    if (!check.valid) {
      setValidationError(check.error);
      return;
    }

    setValidationError("");
    onFileSelect?.(picked);
  }

  function handleRemove() {
    setValidationError("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    onClear?.();
  }

  const activeName = file ? file.name : existingAttachment?.attachment_name || "";
  const activeSize = file ? file.size : existingAttachment?.attachment_size || 0;
  const activeType = file ? file.type : existingAttachment?.attachment_type || "";
  const activePreviewUrl = file
    ? objectUrl
    : existingAttachment &&
        isImageAttachment(
          existingAttachment.attachment_type,
          existingAttachment.attachment_name
        )
      ? existingAttachment.attachment_url
      : null;

  const hasSelection = Boolean(file || existingAttachment?.attachment_url);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
        >
          Attachment (Image or File — Max 15 MB)
        </label>
        <span className="text-[11px] text-slate-400">
          Optional &bull; JPG, PNG, WebP, GIF, PDF, Office
        </span>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ANNOUNCEMENT_ATTACHMENT_ACCEPT}
        disabled={disabled}
        onChange={handleFileChange}
        className="hidden"
      />

      {!hasSelection ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-chmsu-border bg-chmsu-canvas/60 px-4 py-3 text-xs font-semibold text-slate-600 transition hover:border-chmsu-green hover:bg-chmsu-canvas hover:text-chmsu-forest disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-4 w-4 text-chmsu-green" />
          <span>Choose Image or Document to Attach</span>
        </button>
      ) : activePreviewUrl ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-chmsu-border bg-chmsu-canvas/60 p-2.5">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activePreviewUrl}
              alt={activeName || "Selected attachment preview"}
              className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800">
                {activeName}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {formatFileSize(activeSize) || "Image attachment"}
              </p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
                className="mt-1 cursor-pointer text-[11px] font-semibold text-chmsu-green hover:underline disabled:opacity-50"
              >
                Replace file
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={handleRemove}
            aria-label="Remove attachment"
            title="Remove attachment"
            className="shrink-0 cursor-pointer rounded-lg border border-chmsu-border bg-white p-1.5 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-chmsu-border bg-chmsu-canvas/60 px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chmsu-forest/10 text-chmsu-forest">
              {activeType === "application/pdf" ? (
                <FileText className="h-4 w-4" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800">
                {activeName}
              </p>
              <p className="text-[11px] text-slate-500">
                {formatFileSize(activeSize) || "Document attachment"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="cursor-pointer rounded-lg border border-chmsu-border bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-chmsu-green hover:text-chmsu-forest disabled:opacity-50"
            >
              Replace
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={handleRemove}
              aria-label="Remove attachment"
              title="Remove attachment"
              className="cursor-pointer rounded-lg border border-chmsu-border bg-white p-1.5 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {validationError && (
        <div
          role="alert"
          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
}
