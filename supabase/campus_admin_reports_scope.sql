-- =============================================================================
-- SmartCampus CHMSU — Campus Admin Strict Per-Campus System Audit Logs RLS
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- What this migration does:
--   Updates the SELECT RLS policy on `public.audit_logs` so:
--     1. `superadmin` retains university-wide read access to all audit logs.
--     2. `management` retains campus-scoped document-only audit log access.
--     3. `campus_admin` can read ONLY rows where ALL of the following hold:
--        a) `audit_logs.campus_id` equals the signed-in Campus Admin's campus.
--        b) Row is NOT a document or SLA log.
--        c) Actor is NOT `superadmin` (neither in `profiles`, `actor_role`,
--           nor `metadata->>'role'`).
--        d) Actor belongs to the same `campus_id` as the signed-in Campus Admin
--           (excluding other Campus Admins and System Admins).
--     4. `rmo` retains campus-scoped read access for their own `campus_id`.
-- =============================================================================

DROP POLICY IF EXISTS "audit_logs_authorized_read" ON public.audit_logs;
CREATE POLICY "audit_logs_authorized_read"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() = 'superadmin'
    OR (
      private.current_user_role() = 'management'
      AND campus_id = private.current_user_campus_id()
      AND (
        entity_type IN ('document', 'document_route', 'documents', 'document_routes')
        OR action ILIKE 'document%'
        OR action ILIKE '%sla%'
      )
    )
    OR (
      private.current_user_role() = 'campus_admin'
      AND campus_id = private.current_user_campus_id()
      AND COALESCE(entity_type, '') NOT IN (
        'document',
        'document_route',
        'documents',
        'document_routes'
      )
      AND COALESCE(action, '') NOT ILIKE 'document%'
      AND COALESCE(action, '') NOT ILIKE '%sla%'
      AND COALESCE(actor_role::text, '') <> 'superadmin'
      AND COALESCE(metadata->>'role', '') <> 'superadmin'
      AND EXISTS (
        SELECT 1
        FROM public.profiles ap
        WHERE ap.id = audit_logs.actor_id
          AND ap.campus_id = private.current_user_campus_id()
          AND ap.role <> 'superadmin'
          AND (
            ap.role <> 'campus_admin'
            OR ap.id = (SELECT auth.uid())
            OR ap.campus_id = private.current_user_campus_id()
          )
      )
    )
    OR (
      private.current_user_role() = 'rmo'
      AND campus_id = private.current_user_campus_id()
    )
  );
