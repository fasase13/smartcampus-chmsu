-- =============================================================================
-- SmartCampus CHMSU — Restrict Admin Document Registration & Recipient Pool
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- Authorized Roles Summary (Strict):
--   CAN Register / Send Documents:
--     faculty, staff, dept_head, rmo, management
--   CANNOT Register / Send Documents (Blocked by RLS):
--     superadmin, campus_admin, student
--
-- Oversight Preserved:
--   All existing SELECT policies and `public.can_access_document` bypass rules
--   remain untouched so `superadmin` and `campus_admin` retain full monitoring,
--   alerts, and scan-lookup visibility.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. public.documents — Restrict INSERT strictly to operational non-admin roles
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
-- 2. public.document_routes — Restrict INSERT strictly to operational roles
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "document_routes_authorized_insert" ON public.document_routes;
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
          OR EXISTS (
            SELECT 1
            FROM public.documents d
            WHERE d.id = document_routes.document_id
              AND (
                d.origin_campus_id = me.campus_id
                OR d.current_campus_id = me.campus_id
                OR d.current_holder_id = (SELECT auth.uid())
                OR d.created_by = (SELECT auth.uid())
              )
          )
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 3. storage.objects (`document-files`) — Restrict INSERT strictly to
--    operational non-admin roles (preserves SELECT for admin oversight)
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

-- -----------------------------------------------------------------------------
-- 4. public.get_eligible_document_recipients — Exclude superadmin, campus_admin,
--    and student from both caller eligibility and returned recipient pool
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

  -- Verify caller is an active, approved operational non-admin user
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
        'rmo'::public.user_role,
        'management'::public.user_role
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
        AND p.role IN (
          'faculty'::public.user_role,
          'staff'::public.user_role,
          'dept_head'::public.user_role,
          'rmo'::public.user_role,
          'management'::public.user_role
        )
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
      AND p.role IN (
        'faculty'::public.user_role,
        'staff'::public.user_role,
        'dept_head'::public.user_role,
        'rmo'::public.user_role,
        'management'::public.user_role
      )
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
