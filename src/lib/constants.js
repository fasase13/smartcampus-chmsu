export const CAMPUSES = [
  {
    code: "TAL",
    slug: "talisay",
    name: "Talisay (Main)",
    isMain: true,
    address: "Mabini St., Talisay City, Negros Occidental",
  },
  {
    code: "ALJ",
    slug: "alijis",
    name: "Alijis",
    isMain: false,
    address: "Brgy. Alijis, Bacolod City, Negros Occidental",
  },
  {
    code: "BIN",
    slug: "binalbagan",
    name: "Binalbagan",
    isMain: false,
    address: "Brgy. Enclaro, Binalbagan, Negros Occidental",
  },
  {
    code: "FTW",
    slug: "fortune-towne",
    name: "Fortune Towne",
    isMain: false,
    address: "Fortune Towne, Brgy. Estefania, Bacolod City, Negros Occidental",
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

export const DOCUMENT_AUTHORIZED_ROLES = [
  ROLES.ADMIN,
  ROLES.RMO,
  ROLES.DEPT_HEAD,
  ROLES.FACULTY,
  ROLES.STAFF,
  ROLES.MANAGEMENT,
];

/**
 * Route-level RBAC matrix for campus-scoped private portals: /[campus]/[section]
 * Public routes (/[campus]/kiosk, /[campus]/login) are handled separately.
 */
export const PORTAL_ROLE_ACCESS = {
  student: [ROLES.STUDENT, ROLES.ADMIN],
  publisher: [
    ROLES.ADMIN,
    ROLES.MANAGEMENT,
    ROLES.RMO,
    ROLES.DEPT_HEAD,
    ROLES.FACULTY,
    ROLES.STAFF,
  ],
  documents: DOCUMENT_AUTHORIZED_ROLES,
  rmo: [ROLES.RMO, ROLES.ADMIN],
  management: [ROLES.MANAGEMENT, ROLES.DEPT_HEAD, ROLES.ADMIN],
  admin: [ROLES.ADMIN],
};

export const DEFAULT_PORTAL_BY_ROLE = {
  [ROLES.ADMIN]: "admin",
  [ROLES.RMO]: "rmo",
  [ROLES.DEPT_HEAD]: "documents",
  [ROLES.FACULTY]: "publisher",
  [ROLES.STAFF]: "documents",
  [ROLES.MANAGEMENT]: "management",
  [ROLES.STUDENT]: "student",
};

export const STORAGE_BUCKETS = {
  DOCUMENT_FILES: "document-files",
};
