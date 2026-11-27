export const ANNOUNCEMENT_ATTACHMENTS_BUCKET = "announcement-attachments";
export const MAX_ANNOUNCEMENT_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export const ANNOUNCEMENT_ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

const EXTENSION_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const ALLOWED_ANNOUNCEMENT_MIME_TYPES = new Set(
  Object.values(EXTENSION_TO_MIME)
);

export function formatFileSize(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return "";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachment(mimeType, fileName = "") {
  if (typeof mimeType === "string" && mimeType.startsWith("image/")) {
    return true;
  }
  const ext = String(fileName || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext || "");
}

export function validateAnnouncementAttachment(file) {
  if (!file) {
    return { valid: false, error: "No file selected.", mimeType: "" };
  }

  const ext = String(file.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  const resolvedMime =
    file.type && ALLOWED_ANNOUNCEMENT_MIME_TYPES.has(file.type)
      ? file.type
      : EXTENSION_TO_MIME[ext || ""] || "";

  if (!resolvedMime || !ALLOWED_ANNOUNCEMENT_MIME_TYPES.has(resolvedMime)) {
    return {
      valid: false,
      error:
        "Unsupported file type. Allowed: JPG, PNG, WebP, GIF, PDF, Word, Excel, or PowerPoint.",
      mimeType: "",
    };
  }

  if (file.size > MAX_ANNOUNCEMENT_ATTACHMENT_BYTES) {
    return {
      valid: false,
      error: "Attachment exceeds the 15 MB maximum file size.",
      mimeType: resolvedMime,
    };
  }

  return { valid: true, error: "", mimeType: resolvedMime };
}

function sanitizeFileName(name) {
  const cleaned = String(name || "attachment")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
  return cleaned || "attachment";
}

export async function uploadAnnouncementAttachment(supabase, userId, file) {
  const check = validateAnnouncementAttachment(file);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${userId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(ANNOUNCEMENT_ATTACHMENTS_BUCKET)
    .upload(storagePath, file, {
      contentType: check.mimeType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(
      uploadError.message || "Failed to upload announcement attachment."
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from(ANNOUNCEMENT_ATTACHMENTS_BUCKET)
    .getPublicUrl(storagePath);

  if (!publicUrlData?.publicUrl) {
    await deleteAnnouncementAttachment(supabase, storagePath);
    throw new Error("Failed to resolve uploaded attachment URL.");
  }

  return {
    attachment_url: publicUrlData.publicUrl,
    attachment_path: storagePath,
    attachment_name: file.name || safeName,
    attachment_type: check.mimeType,
    attachment_size: file.size,
  };
}

export async function deleteAnnouncementAttachment(supabase, attachmentPath) {
  if (!attachmentPath) return;
  try {
    await supabase.storage
      .from(ANNOUNCEMENT_ATTACHMENTS_BUCKET)
      .remove([attachmentPath]);
  } catch {
    // Best-effort cleanup
  }
}
