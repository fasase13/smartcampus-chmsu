-- =============================================================================
-- SmartCampus CHMSU — Strict Exact Office Matching for Eligible Recipients RPC
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- What this migration changes:
--   Replaces `public.get_eligible_document_recipients(p_campus_id, p_destination_office)`
--   so that **Assign Recipient** strictly matches the EXACT selected Destination
--   Office (including exact sub-office under an Academic College) and NEVER
--   falls back to other sub-offices in the same college.
--
-- Examples:
--   - Destination = "College of Criminal Justice (CCJE) — Office of the Dean":
--       Matches ONLY active, approved operational users in that campus whose
--       exact office is "Office of the Dean" under CCJE (or full combined string).
--       Users in "Department Chairperson's Office" under CCJE will NOT appear.
--   - Destination = "College of Criminal Justice (CCJE) — Department Chairperson's Office":
--       Matches ONLY active, approved operational users in that campus assigned
--       to "Department Chairperson's Office" under CCJE.
--   - Standalone Administrative Office (no " — "):
--       Matches strictly where COALESCE(NULLIF(TRIM(office_location), ''),
--       NULLIF(TRIM(department), '')) equals p_destination_office (case-insensitive).
-- =============================================================================

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

    -- Strictly require BOTH matching college AND matching exact sub-office
    -- (or exact full combined string in office_location). No college-only fallback.
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
    -- Standalone administrative office: exact match on primary office/department
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
