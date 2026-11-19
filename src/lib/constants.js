export const CAMPUSES = [
  {
    code: "TAL",
    slug: "talisay",
    name: "Talisay (Main)",
    isMain: true,
    address: "Mabini St., Talisay City, Negros Occidental 6115",
  },
  {
    code: "ALJ",
    slug: "alijis",
    name: "Alijis",
    isMain: false,
    address: "Brgy. Alijis, Bacolod City, Negros Occidental 6100",
  },
  {
    code: "BIN",
    slug: "binalbagan",
    name: "Binalbagan",
    isMain: false,
    address: "Brgy. Enclaro, Binalbagan, Negros Occidental 6107",
  },
  {
    code: "FTW",
    slug: "fortune-towne",
    name: "Fortune Towne",
    isMain: false,
    address: "Fortune Towne, Brgy. Estefania, Bacolod City, Negros Occidental 6100",
  },
];

export const CAMPUS_SLUGS = CAMPUSES.map((c) => c.slug);

export function getCampusBySlug(slug) {
  return CAMPUSES.find((c) => c.slug === slug) ?? null;
}

export const ROLES = {
  ADMIN: "admin",
  RMO: "rmo",
  DEPT_HEAD: "dept_head",
  FACULTY: "faculty",
  STAFF: "staff",
  MANAGEMENT: "management",
  STUDENT: "student",
};

export const ALL_ROLES = Object.values(ROLES);

export const CROSS_CAMPUS_ROLES = [ROLES.ADMIN, ROLES.MANAGEMENT];

export const ROLE_LABELS = {
  [ROLES.ADMIN]: "System Admin",
  [ROLES.RMO]: "Records Management Officer",
  [ROLES.DEPT_HEAD]: "Department Head",
  [ROLES.FACULTY]: "Faculty",
  [ROLES.STAFF]: "Staff",
  [ROLES.MANAGEMENT]: "Institutional Management",
  [ROLES.STUDENT]: "Student",
};

/**
 * Route-level RBAC matrix for campus-scoped private portals: /[campus]/[section]
 * Public routes (/[campus]/kiosk, /login/[campus]) are handled separately.
 */
export const PORTAL_ROLE_ACCESS = {
  faculty: [
    ROLES.FACULTY,
    ROLES.STAFF,
    ROLES.DEPT_HEAD,
    ROLES.RMO,
    ROLES.ADMIN,
    ROLES.MANAGEMENT,
  ],
  student: [ROLES.STUDENT, ROLES.ADMIN],
  rmo: [ROLES.RMO, ROLES.ADMIN],
  office: [ROLES.DEPT_HEAD, ROLES.ADMIN],
};

export function getDefaultRouteForRole(role, campusSlug) {
  switch (role) {
    case ROLES.ADMIN:
    case ROLES.MANAGEMENT:
      return "/management";
    case ROLES.RMO:
      return `/${campusSlug}/rmo`;
    case ROLES.DEPT_HEAD:
      return `/${campusSlug}/office`;
    case ROLES.FACULTY:
    case ROLES.STAFF:
      return `/${campusSlug}/faculty`;
    case ROLES.STUDENT:
    default:
      return `/${campusSlug}/student`;
  }
}

export const AVAILABILITY_STATUSES = [
  {
    value: "available",
    label: "Available",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    dotClass: "bg-emerald-500",
  },
  {
    value: "in_class",
    label: "In Class",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
    dotClass: "bg-amber-500",
  },
  {
    value: "in_meeting",
    label: "In Meeting",
    badgeClass: "bg-sky-100 text-sky-800 border-sky-200",
    dotClass: "bg-sky-600",
  },
  {
    value: "on_leave",
    label: "On Leave",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
    dotClass: "bg-rose-500",
  },
  {
    value: "offline",
    label: "Offline",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    dotClass: "bg-slate-400",
  },
];

export function getAvailabilityMeta(status) {
  return (
    AVAILABILITY_STATUSES.find((s) => s.value === status) ??
    AVAILABILITY_STATUSES[AVAILABILITY_STATUSES.length - 1]
  );
}

export const ANNOUNCEMENT_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "academic", label: "Academic" },
  { value: "calendar", label: "Calendar" },
  { value: "emergency", label: "Emergency" },
  { value: "event", label: "Event" },
];

export const ANNOUNCEMENT_PRIORITIES = [
  { value: "normal", label: "Normal", badgeClass: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "high", label: "High", badgeClass: "bg-amber-100 text-amber-900 border-amber-300" },
  { value: "urgent", label: "Urgent", badgeClass: "bg-red-100 text-red-800 border-red-300" },
];

export const STORAGE_BUCKETS = {
  DOCUMENT_FILES: "document-files",
};
