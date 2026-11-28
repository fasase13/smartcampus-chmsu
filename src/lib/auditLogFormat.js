const EXACT_ACTION_LABELS = {
  "auth.sign_in": "Signed In",
  "auth.sign_out": "Signed Out",
  "auth.campus_login": "Signed In",
  "auth.login": "Signed In",
  "auth.logout": "Signed Out",
  "document.registered": "Document Registered",
  "document.received": "Document Received",
  "document.forwarded": "Document Forwarded",
  "document.returned": "Document Returned",
  "document.completed": "Document Marked as Processed",
  "document.delay_flagged": "SLA Delay Flagged",
  registered: "Document Registered",
  dispatched: "Document Dispatched",
  received: "Document Received",
  forwarded: "Document Forwarded",
  returned: "Document Returned",
  completed: "Document Marked as Processed",
  delay_flagged: "SLA Delay Flagged",
  "announcement.created": "Announcement Published",
  "announcement.updated": "Announcement Updated",
  "announcement.deleted": "Announcement Deleted",
  "announcement.pinned": "Announcement Pinned",
  "announcement.unpinned": "Announcement Unpinned",
  "announcement.activated": "Announcement Activated",
  "announcement.deactivated": "Announcement Deactivated",
  announcement_published: "Announcement Published",
  announcement_updated: "Announcement Updated",
  "profile.availability_updated": "Availability Updated",
  "availability.updated": "Availability Updated",
  user_account_activated: "User Account Activated",
  user_account_reactivated: "User Account Reactivated",
  user_account_deactivated: "User Account Deactivated",
  registration_activated: "Registration Activated",
  registration_returned: "Registration Returned",
  registration_rejected_banned: "Registration Rejected & Banned",
  privacy_terms_accepted: "Privacy Terms Accepted",
  maintenance_mode_enabled: "Maintenance Mode Enabled",
  maintenance_mode_disabled: "Maintenance Mode Disabled",
};

function toTitleCase(raw) {
  return String(raw ?? "")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (["SLA", "QR", "RMO", "ID", "CHMSU"].includes(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function isDocumentLog(log) {
  if (!log) return false;
  if (log._source === "document_route") return true;
  const entity = String(log?.entity_type ?? "").toLowerCase();
  const action = String(log?.action ?? "").toLowerCase();
  return (
    ["document", "document_route", "documents", "document_routes"].includes(
      entity
    ) ||
    entity.startsWith("document") ||
    action.startsWith("document") ||
    action.includes("document_") ||
    action.includes("doc_") ||
    action.includes("route") ||
    action.includes("custody") ||
    action.includes("sla") ||
    action.includes("qr_track")
  );
}

export const isDocumentAuditLog = isDocumentLog;

export function getAuditLogCategory(log) {
  const action = String(log?.action ?? "").toLowerCase();
  const entity = String(log?.entity_type ?? "").toLowerCase();

  if (action.startsWith("auth.") || entity === "auth") {
    return { label: "Authentication" };
  }
  if (action.startsWith("registration_")) {
    return { label: "Registration" };
  }
  if (action.startsWith("privacy_terms_")) {
    return { label: "Privacy & Terms" };
  }
  if (
    action.startsWith("user_account_") ||
    action.startsWith("profile.") ||
    action.startsWith("availability.")
  ) {
    return { label: "User Management" };
  }
  if (
    action.startsWith("document") ||
    action.includes("sla") ||
    entity.startsWith("document")
  ) {
    return { label: "Document Tracking" };
  }
  if (action.startsWith("announcement") || entity === "announcement") {
    return { label: "Announcements" };
  }
  if (
    action.startsWith("maintenance") ||
    action.startsWith("system_") ||
    entity === "system_settings"
  ) {
    return { label: "System Settings" };
  }

  return {
    label: entity ? toTitleCase(entity) : "General",
  };
}

export function formatAuditActionLabel(action) {
  const raw = String(action ?? "").trim();
  if (!raw) return "Activity Recorded";

  const exact = EXACT_ACTION_LABELS[raw.toLowerCase()];
  if (exact) return exact;

  const withoutAuthPrefix = raw.replace(/^auth\./i, "");
  return toTitleCase(withoutAuthPrefix);
}

export function formatAuditDetailSummary(
  log,
  { roleLabels = {}, campusMap = {} } = {}
) {
  const details = log?.metadata;
  const action = String(log?.action ?? "").toLowerCase();
  const campusName = log?.campus_id ? campusMap[log.campus_id]?.name : null;

  if (
    action === "auth.sign_in" ||
    action === "auth.sign_out" ||
    action === "auth.campus_login"
  ) {
    const roleKey = details?.role || log?.actor_role || "";
    const roleLabel =
      roleKey === "superadmin"
        ? "System Admin"
        : roleLabels[roleKey] ?? (roleKey ? toTitleCase(roleKey) : "");
    const parts = [];
    if (roleLabel) parts.push(`Role: ${roleLabel}`);
    if (campusName) {
      parts.push(`CHMSU ${campusName}`);
    } else if (roleKey === "superadmin") {
      parts.push("University-Wide");
    }
    return parts.join(" • ");
  }

  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return "";
  }

  const parts = [];

  if (details.tracking_code) {
    parts.push(details.tracking_code);
  }
  if (details.target_name) {
    parts.push(`Target: ${details.target_name}`);
  } else if (details.banned_email) {
    parts.push(`Email: ${details.banned_email}`);
  }
  if (details.title) {
    parts.push(details.title);
  }
  if (details.from_office && details.to_office) {
    parts.push(`${details.from_office} → ${details.to_office}`);
  } else if (details.to_office) {
    parts.push(details.to_office);
  }
  if (details.scope) {
    parts.push(details.scope);
  } else if (isDocumentAuditLog(log) && campusName) {
    parts.push(`CHMSU ${campusName}`);
  }
  if (details.availability_status) {
    parts.push(`Status: ${toTitleCase(details.availability_status)}`);
  }
  if (details.reason) {
    const clean = String(details.reason).trim();
    parts.push(
      `Reason: ${clean.length > 80 ? `${clean.slice(0, 77)}...` : clean}`
    );
  } else if (details.remarks) {
    const clean = String(details.remarks).trim();
    parts.push(
      `Note: ${clean.length > 80 ? `${clean.slice(0, 77)}...` : clean}`
    );
  }

  return parts.slice(0, 3).join(" • ");
}
