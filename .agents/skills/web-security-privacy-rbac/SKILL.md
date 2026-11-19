---
name: web-security-privacy-rbac
description: >-
  Web security, data privacy, multi-campus RBAC, and audit logging best
  practices for Next.js App Router + Supabase. Use when designing route guards,
  campus login isolation, public vs. private data boundaries, or document
  tracking audit trails.
---

# Web Security, Data Privacy & Multi-Campus RBAC

Use this skill whenever implementing authentication, authorization, public vs. private routes, or audit logging in the multi-campus university system.

## 1. Strict Public vs. Private Route Separation

Keep public surfaces completely isolated from authenticated campus portals:

- **Public Routes** (no login required, read-only, zero private PII):
  - Full-screen interactive kiosk (`/kiosk/[campus]`)
  - Public announcements & faculty availability summaries
  - Optional public document status lookup (if exposed, return only sanitized status/office/timestamp—never internal remarks, submitter PII, or staff emails)
- **Private Routes** (authenticated, role- and campus-scoped):
  - Campus-specific login (`/login` or `/campus/[slug]/login`)
  - Student portal (campus-scoped)
  - Announcement & faculty availability publisher portal (`publisher` / `admin` roles)
  - Document tracking management, QR scanner handoffs, delay alerts, and audit logs (`staff` / `records` / `admin` roles)

## 2. Defense-in-Depth Auth & Campus Isolation

Never rely on client-side checks or UI hiding alone:

1. **Middleware / Proxy Guard**: Refresh the Supabase session cookie and redirect unauthenticated requests away from private routes.
2. **Server-Side Verification**: In every protected Server Component, Server Action, and Route Handler, call `supabase.auth.getUser()` (never trust `getSession()` alone on the server) and fetch the user's profile (`role`, `campus_id`).
3. **Campus Login & Tenant Scoping**:
   - Enforce that a user authenticating for Campus A belongs to Campus A (unless they hold a designated system-wide `super_admin` role).
   - Scope all queries and mutations by `campus_id`.
4. **PostgreSQL Row-Level Security (RLS)**:
   - Enable RLS on every table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
   - Enforce `campus_id` and `role` checks directly in RLS policies so compromised client calls cannot read or mutate another campus's data.
   - Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code (`NEXT_PUBLIC_*` must only hold the URL and anon/publishable key).

## 3. Immutable Audit Logging

For document tracking, QR scans, and administrative actions:

- Record every state transition in an append-only `audit_logs` table:
  - `id`, `campus_id`, `actor_id`, `actor_role`, `action` (e.g., `document.created`, `document.scanned_in`, `document.forwarded`, `document.delayed_alert`, `announcement.published`), `entity_type`, `entity_id`, `metadata` (JSONB before/after summary), and `created_at`.
- Restrict `audit_logs` RLS policies to `INSERT` (from authenticated/server workflows) and `SELECT` (authorized roles within the same campus); disallow `UPDATE` and `DELETE` for standard application roles.
- Never log passwords, session tokens, or raw sensitive file contents in audit metadata.

## 4. Input Validation & File Upload Safety

- Validate all form payloads, QR tracking codes, and query parameters on the server before querying or mutating data.
- Restrict Supabase Storage buckets for document attachments/announcements by allowed MIME types, file size limits, and campus-prefixed storage paths with matching Storage RLS policies.

## Verification Checklist

- Attempt to access private routes while logged out → confirm redirect or `401`/`403`.
- Attempt to query or mutate Campus B records while logged in as a Campus A user → confirm RLS denies access.
- Verify public kiosk/student views expose no staff emails, internal notes, or audit logs.
- Confirm every QR scan / status change writes a corresponding immutable `audit_logs` row.
