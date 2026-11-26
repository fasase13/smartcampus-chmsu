-- =============================================================================
-- SmartCampus CHMSU — Fix Documents INSERT & RETURNING RLS Policy
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- Root Cause Fixed:
--   1. Supabase `.insert(...).select("*").single()` executes `INSERT ... RETURNING *`,
--      which evaluates BOTH the INSERT `WITH CHECK` policy AND the SELECT `USING`
--      policy on the newly inserted row.
--   2. Previously, `documents_authorized_read` called ONLY
--      `public.can_access_document(id, auth.uid())`, which is declared `STABLE`
--      and re-queries `public.documents`. In PostgreSQL, a `STABLE` function uses
--      the outer statement snapshot and CANNOT see the uncommitted row being
--      inserted by `INSERT ... RETURNING`, so it returned `false` and threw:
--        `new row violates row-level security policy for table "documents"`
--   3. Additionally, any leftover legacy INSERT policies on `public.documents`
--      or `public.document_routes` are dynamically dropped and replaced with
--      clean policies allowing ONLY active, approved operational roles
--      (`faculty`, `staff`, `dept_head`, `rmo`, `management`) for both
--      intra-campus and inter-campus routing, while strictly blocking
--      `superadmin`, `campus_admin`, and `student` from registering documents.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Drop ALL existing INSERT policies on public.documents & public.document_routes
--    so no conflicting legacy policy can block or bypass registration
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('documents', 'document_routes')
      AND cmd = 'INSERT'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I;',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. public.documents — Clean INSERT policy (faculty, staff, dept_head, rmo,
--    management ONLY; allows ANY destination current_campus_id for inter-campus)
-- -----------------------------------------------------------------------------
CREATE POLICY "documents_staff_insert"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN (
          'faculty',
          'staff',
          'dept_head',
          'rmo',
          'management'
        )
        AND (
          me.role = 'management'
          OR origin_campus_id = me.campus_id
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 3. public.documents — Fix SELECT policy so INSERT ... RETURNING * sees the
--    newly created row immediately via direct `created_by = auth.uid()` check,
--    while preserving `public.can_access_document` for all other access &
--    superadmin / campus_admin oversight
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "documents_authorized_read" ON public.documents;
CREATE POLICY "documents_authorized_read"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    (
      created_by = (SELECT auth.uid())
      AND private.current_user_role() IN (
        'faculty',
        'staff',
        'dept_head',
        'rmo',
        'management'
      )
    )
    OR public.can_access_document(id, (SELECT auth.uid()))
  );

-- Also ensure UPDATE policy allows creator to attach uploaded file metadata
-- immediately after registration (even on inter-campus documents)
DROP POLICY IF EXISTS "documents_authorized_update" ON public.documents;
CREATE POLICY "documents_authorized_update"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    (
      created_by = (SELECT auth.uid())
      AND private.current_user_role() IN (
        'faculty',
        'staff',
        'dept_head',
        'rmo',
        'management'
      )
    )
    OR public.can_access_document(id, (SELECT auth.uid()))
  )
  WITH CHECK (
    private.current_user_role() IN (
      'superadmin',
      'campus_admin',
      'management',
      'rmo',
      'dept_head',
      'faculty',
      'staff'
    )
  );

-- -----------------------------------------------------------------------------
-- 4. public.document_routes — Clean INSERT policy for active operational roles
-- -----------------------------------------------------------------------------
CREATE POLICY "document_routes_authorized_insert"
  ON public.document_routes FOR INSERT
  TO authenticated
  WITH CHECK (
    acted_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN (
          'faculty',
          'staff',
          'dept_head',
          'rmo',
          'management'
        )
        AND (
          me.role = 'management'
          OR public.can_access_document(document_id, (SELECT auth.uid()))
          OR EXISTS (
            SELECT 1
            FROM public.documents d
            WHERE d.id = document_routes.document_id
              AND d.created_by = (SELECT auth.uid())
          )
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 5. public.notifications — Allow inter-campus recipient notifications
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_staff_insert" ON public.notifications;
CREATE POLICY "notifications_staff_insert"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN (
          'superadmin',
          'campus_admin',
          'management',
          'rmo',
          'dept_head',
          'faculty',
          'staff'
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 6. public.audit_logs — Allow active authorized roles to record audit logs
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_authorized_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_authorized_insert"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = (SELECT auth.uid())
    AND actor_role = private.current_user_role()
    AND private.current_user_role() IN (
      'superadmin',
      'campus_admin',
      'management',
      'rmo',
      'dept_head',
      'faculty',
      'staff'
    )
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR campus_id IS NULL
      OR campus_id = private.current_user_campus_id()
    )
  );

-- -----------------------------------------------------------------------------
-- 7. storage.objects (`document-files`) — Allow active operational roles to
--    upload attachments (blocks superadmin, campus_admin, and student)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "document_files_rmo_insert" ON storage.objects;
CREATE POLICY "document_files_rmo_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'document-files'
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN (
          'faculty',
          'staff',
          'dept_head',
          'rmo',
          'management'
        )
        AND (
          me.role = 'management'
          OR (storage.foldername(name))[1] = private.current_user_campus_slug()
        )
    )
  );
