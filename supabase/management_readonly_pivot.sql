-- =============================================================================
-- SmartCampus CHMSU — Institutional Management Read-Only Oversight Pivot
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- Strict Role Rules Enforced:
--   - `faculty`, `staff`, `dept_head`, `rmo`:
--       ONLY operational roles allowed to register/send documents, mutate
--       custody (receive/forward/return/complete), upload document attachments,
--       and appear in Assign Recipient dropdowns.
--   - `management` (Institutional Management):
--       Strictly READ-ONLY university-wide oversight across all 4 campuses:
--         * CAN SELECT / QR-track any document and its routing timeline.
--         * CAN SELECT document-only audit logs (`entity_type` in document /
--           document_route OR `action` matching `document%` / `%sla%`).
--         * CANNOT INSERT/UPDATE documents, document_routes, or document-files.
--         * CANNOT appear as an assignable recipient.
--   - `superadmin` & `campus_admin`:
--       Retain full monitoring/oversight SELECT access (and full audit_logs
--       for superadmin), blocked from registering/mutating documents.
--   - `student`:
--       Zero document tracking or registration access.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Core Authorization Helper (`public.can_access_document`)
--    Allow `management` university-wide read-only lookup across all 4 campuses
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_document(
  p_document_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user record;
  v_doc  record;
BEGIN
  IF p_document_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    role,
    campus_id,
    office_location,
    department,
    is_active,
    approval_status
  INTO v_user
  FROM public.profiles
  WHERE id = p_user_id
  LIMIT 1;

  IF NOT FOUND
     OR v_user.is_active IS DISTINCT FROM true
     OR v_user.approval_status IS DISTINCT FROM 'approved' THEN
    RETURN false;
  END IF;

  -- Students have zero document tracking / QR scanning access
  IF v_user.role = 'student' THEN
    RETURN false;
  END IF;

  SELECT
    id,
    origin_campus_id,
    current_campus_id,
    current_office,
    current_holder_id,
    created_by
  INTO v_doc
  FROM public.documents
  WHERE id = p_document_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Rule 1: System Admin & Institutional Management — Full University-Wide Read Bypass
  IF v_user.role IN ('superadmin', 'management') THEN
    RETURN true;
  END IF;

  -- Rule 2: Campus Admin — Campus-Travel Bypass (Origin, Current, or Route History)
  IF v_user.role = 'campus_admin' THEN
    IF v_user.campus_id IS NULL THEN
      RETURN false;
    END IF;

    IF v_doc.origin_campus_id = v_user.campus_id
       OR v_doc.current_campus_id = v_user.campus_id THEN
      RETURN true;
    END IF;

    RETURN EXISTS (
      SELECT 1
      FROM public.document_routes r
      WHERE r.document_id = v_doc.id
        AND r.campus_id = v_user.campus_id
    );
  END IF;

  -- Rule 3: Operational Roles (faculty, staff, dept_head, rmo)
  -- Strictly authorized ONLY if sent by them, sent to them, or routed to their exact office
  IF v_user.role IN ('faculty', 'staff', 'dept_head', 'rmo') THEN
    IF v_doc.created_by = p_user_id
       OR v_doc.current_holder_id = p_user_id THEN
      RETURN true;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.document_routes r
      WHERE r.document_id = v_doc.id
        AND (
          r.from_user_id = p_user_id
          OR r.to_user_id = p_user_id
          OR r.acted_by = p_user_id
        )
    ) THEN
      RETURN true;
    END IF;

    IF v_doc.current_holder_id IS NULL
       AND v_user.campus_id IS NOT NULL
       AND v_doc.current_campus_id = v_user.campus_id
       AND NULLIF(btrim(COALESCE(v_doc.current_office, '')), '') IS NOT NULL
       AND (
         (
           NULLIF(btrim(COALESCE(v_user.office_location, '')), '') IS NOT NULL
           AND lower(btrim(v_doc.current_office)) = lower(btrim(v_user.office_location))
         )
         OR (
           NULLIF(btrim(COALESCE(v_user.department, '')), '') IS NOT NULL
           AND lower(btrim(v_doc.current_office)) = lower(btrim(v_user.department))
         )
         OR (
           NULLIF(btrim(COALESCE(v_user.department, '')), '') IS NOT NULL
           AND NULLIF(btrim(COALESCE(v_user.office_location, '')), '') IS NOT NULL
           AND lower(btrim(v_doc.current_office)) = lower(
             btrim(v_user.department) || ' — ' || btrim(v_user.office_location)
           )
         )
       ) THEN
      RETURN true;
    END IF;

    RETURN false;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_document(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_document(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_document(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Drop ALL existing INSERT policies on public.documents & public.document_routes
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
-- 3. public.documents — Strictly operational roles for INSERT & UPDATE;
--    university-wide SELECT for superadmin & management via can_access_document
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
        AND me.role IN ('faculty', 'staff', 'dept_head', 'rmo')
        AND origin_campus_id = me.campus_id
    )
  );

DROP POLICY IF EXISTS "documents_authorized_read" ON public.documents;
CREATE POLICY "documents_authorized_read"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    (
      created_by = (SELECT auth.uid())
      AND private.current_user_role() IN ('faculty', 'staff', 'dept_head', 'rmo')
    )
    OR public.can_access_document(id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "documents_authorized_update" ON public.documents;
CREATE POLICY "documents_authorized_update"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN ('faculty', 'staff', 'dept_head', 'rmo')
    )
    AND (
      created_by = (SELECT auth.uid())
      OR public.can_access_document(id, (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN ('faculty', 'staff', 'dept_head', 'rmo')
    )
  );

-- -----------------------------------------------------------------------------
-- 4. public.document_routes — Read via can_access_document; INSERT strictly
--    operational roles only (blocks management, superadmin, campus_admin, student)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "document_routes_authorized_read" ON public.document_routes;
CREATE POLICY "document_routes_authorized_read"
  ON public.document_routes FOR SELECT
  TO authenticated
  USING (public.can_access_document(document_id, (SELECT auth.uid())));

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
        AND me.role IN ('faculty', 'staff', 'dept_head', 'rmo')
        AND (
          public.can_access_document(document_id, (SELECT auth.uid()))
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
-- 5. storage.objects (`document-files`) — Restrict INSERT/UPDATE/DELETE strictly
--    to active operational roles; keep SELECT for management/superadmin oversight
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
        AND me.role IN ('faculty', 'staff', 'dept_head', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
    )
  );

DROP POLICY IF EXISTS "document_files_rmo_update" ON storage.objects;
CREATE POLICY "document_files_rmo_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN ('faculty', 'staff', 'dept_head', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
    )
  )
  WITH CHECK (
    bucket_id = 'document-files'
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN ('faculty', 'staff', 'dept_head', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
    )
  );

DROP POLICY IF EXISTS "document_files_rmo_delete" ON storage.objects;
CREATE POLICY "document_files_rmo_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN ('faculty', 'staff', 'dept_head', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
    )
  );

-- -----------------------------------------------------------------------------
-- 6. public.get_eligible_document_recipients — Operational roles ONLY
--    (faculty, staff, dept_head, rmo) with strict exact sub-office matching
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_eligible_document_recipients(
  p_campus_id uuid,
  p_destination_office text
)
RETURNS TABLE (
  id uuid,
  full_name text,
  role public.user_role,
  department text,
  office text,
  job_title text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_is_allowed boolean := false;
  v_clean_dest text := btrim(coalesce(p_destination_office, ''));
  v_has_college_sep boolean := false;
  v_college text := '';
  v_sub_office text := '';
BEGIN
  IF v_caller_id IS NULL OR p_campus_id IS NULL OR v_clean_dest = '' THEN
    RETURN;
  END IF;

  -- Verify caller is an active, approved operational sender/handler
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = v_caller_id
      AND me.is_active = true
      AND me.approval_status = 'approved'
      AND me.role IN (
        'faculty'::public.user_role,
        'staff'::public.user_role,
        'dept_head'::public.user_role,
        'rmo'::public.user_role
      )
  ) INTO v_is_allowed;

  IF NOT v_is_allowed THEN
    RETURN;
  END IF;

  v_has_college_sep := position(' — ' in v_clean_dest) > 0;

  IF v_has_college_sep THEN
    v_college := btrim(split_part(v_clean_dest, ' — ', 1));
    v_sub_office := btrim(split_part(v_clean_dest, ' — ', 2));

    RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.role,
      p.department,
      p.office_location AS office,
      p.job_title
    FROM public.profiles p
    WHERE p.is_active = true
      AND p.approval_status = 'approved'
      AND p.role IN (
        'faculty'::public.user_role,
        'staff'::public.user_role,
        'dept_head'::public.user_role,
        'rmo'::public.user_role
      )
      AND p.id <> v_caller_id
      AND p.campus_id = p_campus_id
      AND nullif(btrim(coalesce(p.office_location, '')), '') IS NOT NULL
      AND (
        lower(btrim(p.office_location)) = lower(v_clean_dest)
        OR (
          lower(btrim(coalesce(p.department, ''))) = lower(v_college)
          AND lower(btrim(p.office_location)) = lower(v_sub_office)
        )
      )
    ORDER BY lower(p.full_name) ASC;
  ELSE
    RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.role,
      p.department,
      p.office_location AS office,
      p.job_title
    FROM public.profiles p
    WHERE p.is_active = true
      AND p.approval_status = 'approved'
      AND p.role IN (
        'faculty'::public.user_role,
        'staff'::public.user_role,
        'dept_head'::public.user_role,
        'rmo'::public.user_role
      )
      AND p.id <> v_caller_id
      AND p.campus_id = p_campus_id
      AND lower(
        coalesce(
          nullif(btrim(p.office_location), ''),
          nullif(btrim(p.department), ''),
          ''
        )
      ) = lower(v_clean_dest)
    ORDER BY lower(p.full_name) ASC;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_eligible_document_recipients(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_eligible_document_recipients(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_eligible_document_recipients(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. public.audit_logs — Document-Only SELECT for `management`; full access
--    preserved for `superadmin`
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_authorized_read" ON public.audit_logs;
CREATE POLICY "audit_logs_authorized_read"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() = 'superadmin'
    OR (
      private.current_user_role() = 'management'
      AND (
        entity_type IN ('document', 'document_route', 'documents', 'document_routes')
        OR action ILIKE 'document%'
        OR action ILIKE '%sla%'
      )
    )
    OR (
      private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head')
      AND campus_id = private.current_user_campus_id()
    )
  );
