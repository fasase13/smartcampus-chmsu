-- =============================================================================
-- SmartCampus CHMSU — Enable Non-Student Document Registration &
-- Cross-Campus Eligible Recipients RPC
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- What this migration does:
--   1. Expands INSERT / UPDATE RLS policies on `public.documents`,
--      `public.document_routes`, `public.notifications`, `public.audit_logs`,
--      and `storage.objects` (`document-files`) so ALL active, approved
--      non-student roles (`superadmin`, `campus_admin`, `management`, `rmo`,
--      `dept_head`, `faculty`, `staff`) can register and send documents
--      (intra-campus & inter-campus), while strictly blocking `student`.
--   2. Adds `public.get_eligible_document_recipients(p_campus_id, p_destination_office)`
--      as a `SECURITY DEFINER` RPC returning ONLY non-sensitive directory
--      fields (no emails, School IDs, or PII — RA 10173 compliant) for active,
--      approved non-student users in ANY selected CHMSU campus & office/college.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. public.documents — Allow all active, approved non-student roles to register
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "documents_rmo_admin_insert" ON public.documents;
CREATE POLICY "documents_rmo_admin_insert"
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
          'superadmin',
          'campus_admin',
          'management',
          'rmo',
          'dept_head',
          'faculty',
          'staff'
        )
        AND (
          me.role IN ('superadmin', 'management')
          OR origin_campus_id = me.campus_id
        )
    )
  );

-- Allow document creator to attach uploaded file metadata even on inter-campus docs
DROP POLICY IF EXISTS "documents_authorized_update" ON public.documents;
CREATE POLICY "documents_authorized_update"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    private.current_user_role() = 'superadmin'
    OR (
      private.current_user_role() IN ('campus_admin', 'rmo')
      AND (
        origin_campus_id = private.current_user_campus_id()
        OR current_campus_id = private.current_user_campus_id()
        OR created_by = (SELECT auth.uid())
      )
    )
    OR (
      private.current_user_role() IN ('dept_head', 'faculty', 'staff', 'management')
      AND (
        current_campus_id = private.current_user_campus_id()
        OR current_holder_id = (SELECT auth.uid())
        OR created_by = (SELECT auth.uid())
      )
    )
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
-- 2. public.document_routes — Allow creator + authorized staff to log routes
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "document_routes_authorized_insert" ON public.document_routes;
CREATE POLICY "document_routes_authorized_insert"
  ON public.document_routes FOR INSERT
  TO authenticated
  WITH CHECK (
    acted_by = (SELECT auth.uid())
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
        AND EXISTS (
          SELECT 1
          FROM public.documents d
          WHERE d.id = document_routes.document_id
            AND (
              d.origin_campus_id = private.current_user_campus_id()
              OR d.current_campus_id = private.current_user_campus_id()
              OR d.current_holder_id = (SELECT auth.uid())
              OR d.created_by = (SELECT auth.uid())
            )
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 3. public.notifications — Allow non-student roles to notify across campuses
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
-- 4. public.audit_logs — Re-assert non-student insert permission
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
-- 5. storage.objects (`document-files`) — Allow all non-student roles to upload
--    attachments to their campus folder (or any campus for superadmin/management)
--    and read attachments for accessible intra- or inter-campus documents
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "document_files_authorized_select" ON storage.objects;
CREATE POLICY "document_files_authorized_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
        AND (
          (storage.foldername(name))[1] = private.current_user_campus_slug()
          OR EXISTS (
            SELECT 1
            FROM public.documents d
            WHERE d.file_path = storage.objects.name
              AND (
                d.origin_campus_id = private.current_user_campus_id()
                OR d.current_campus_id = private.current_user_campus_id()
                OR d.current_holder_id = (SELECT auth.uid())
                OR d.created_by = (SELECT auth.uid())
              )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "document_files_rmo_insert" ON storage.objects;
CREATE POLICY "document_files_rmo_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  );

DROP POLICY IF EXISTS "document_files_rmo_update" ON storage.objects;
CREATE POLICY "document_files_rmo_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  );

DROP POLICY IF EXISTS "document_files_rmo_delete" ON storage.objects;
CREATE POLICY "document_files_rmo_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Cross-Campus Eligible Recipients RPC (RA 10173 Safe — No Emails/PII)
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

  -- Verify caller is an active, approved non-student user
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = v_caller_id
      AND me.is_active = true
      AND me.approval_status = 'approved'
      AND me.role IN (
        'superadmin'::public.user_role,
        'campus_admin'::public.user_role,
        'management'::public.user_role,
        'rmo'::public.user_role,
        'dept_head'::public.user_role,
        'faculty'::public.user_role,
        'staff'::public.user_role
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
      matched.id,
      matched.full_name,
      matched.role,
      matched.department,
      matched.office,
      matched.job_title
    FROM (
      SELECT
        p.id,
        p.full_name,
        p.role,
        p.department,
        p.office_location AS office,
        p.job_title,
        CASE
          WHEN lower(btrim(coalesce(p.office_location, ''))) = lower(v_clean_dest)
            OR (
              lower(btrim(coalesce(p.office_location, ''))) = lower(v_sub_office)
              AND (
                lower(btrim(coalesce(p.department, ''))) = lower(v_college)
                OR btrim(coalesce(p.department, '')) = ''
              )
            )
          THEN 1
          ELSE 2
        END AS match_rank
      FROM public.profiles p
      WHERE p.is_active = true
        AND p.approval_status = 'approved'
        AND p.role <> 'student'::public.user_role
        AND p.id <> v_caller_id
        AND p.campus_id = p_campus_id
        AND (
          lower(btrim(coalesce(p.office_location, ''))) = lower(v_clean_dest)
          OR (
            lower(btrim(coalesce(p.office_location, ''))) = lower(v_sub_office)
            AND (
              lower(btrim(coalesce(p.department, ''))) = lower(v_college)
              OR btrim(coalesce(p.department, '')) = ''
            )
          )
          OR lower(btrim(coalesce(p.department, ''))) = lower(v_college)
        )
    ) AS matched
    ORDER BY matched.match_rank ASC, lower(matched.full_name) ASC;
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
      AND p.role <> 'student'::public.user_role
      AND p.id <> v_caller_id
      AND p.campus_id = p_campus_id
      AND (
        lower(btrim(coalesce(p.office_location, ''))) = lower(v_clean_dest)
        OR lower(btrim(coalesce(p.department, ''))) = lower(v_clean_dest)
      )
    ORDER BY lower(p.full_name) ASC;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_eligible_document_recipients(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_eligible_document_recipients(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_eligible_document_recipients(uuid, text) TO authenticated;
