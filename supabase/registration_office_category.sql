-- =============================================================================
-- SmartCampus CHMSU — Cascading Office Category -> Office for Non-Student Roles
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- What this migration does:
--   Updates `public.complete_registration_credentials(...)` so that:
--     1. `p_department` is required for ALL 4 self-registration roles:
--        - `student`: stores College / Department
--        - `faculty`, `staff`, `rmo`: stores Office Category
--     2. `student` requires `p_program_or_course` (sets `office_location = NULL`).
--     3. `faculty`, `staff`, and `rmo` require `p_office_location`
--        (sets `program_or_course = NULL`).
--     4. Keeps `job_title = NULL` and `is_teaching = (p_requested_role = 'faculty')`.
--     5. Enforces returned-field duplicate checks for `department` and
--        `program_or_office` across all 4 roles.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.complete_registration_credentials(
  p_campus_id uuid,
  p_id_number text,
  p_full_name text,
  p_requested_role public.user_role,
  p_department text,
  p_front_path text,
  p_back_path text,
  p_program_or_course text DEFAULT NULL,
  p_office_location text DEFAULT NULL,
  p_job_title text DEFAULT NULL,
  p_is_teaching boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_prefix text;
  v_clean_id text;
  v_clean_name text;
  v_clean_dept text;
  v_clean_program text;
  v_clean_office text;
  v_clean_is_teaching boolean;
  v_current record;
  v_campus_exists boolean;
  v_snap jsonb;
  v_flags jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT
    approval_status,
    profile_completed,
    returned_fields,
    returned_snapshot
  INTO v_current
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND
     OR v_current.approval_status NOT IN ('pending', 'returned')
     OR v_current.profile_completed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Only incomplete pending or returned registrations may submit credentials' USING ERRCODE = '42501';
  END IF;

  -- Strictly allow ONLY 4 self-registration roles
  IF p_requested_role IS NULL
     OR p_requested_role NOT IN (
       'student'::public.user_role,
       'faculty'::public.user_role,
       'staff'::public.user_role,
       'rmo'::public.user_role
     ) THEN
    RAISE EXCEPTION 'Invalid requested role. Self-registration is restricted to Student, Faculty, Staff, and RMO.'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.campuses
    WHERE id = p_campus_id AND is_active = true
  ) INTO v_campus_exists;

  IF NOT v_campus_exists THEN
    RAISE EXCEPTION 'Selected CHMSU campus is invalid or inactive' USING ERRCODE = '22023';
  END IF;

  v_clean_id := trim(COALESCE(p_id_number, ''));
  IF v_clean_id !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'Please enter a valid School ID.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE employee_or_student_id IS NOT NULL
      AND trim(employee_or_student_id) = v_clean_id
      AND id <> v_uid
  ) THEN
    RAISE EXCEPTION 'School ID % is already registered to another account', v_clean_id
      USING ERRCODE = '23505';
  END IF;

  v_clean_name := trim(COALESCE(p_full_name, ''));
  IF char_length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Full Name must be at least 2 characters' USING ERRCODE = '22023';
  END IF;

  -- Require College / Department (students) or Office Category (faculty, staff, rmo)
  v_clean_dept := trim(COALESCE(p_department, ''));
  IF char_length(v_clean_dept) < 2 THEN
    IF p_requested_role = 'student'::public.user_role THEN
      RAISE EXCEPTION 'College / Department is required' USING ERRCODE = '22023';
    ELSE
      RAISE EXCEPTION 'Office Category is required' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_requested_role = 'student'::public.user_role THEN
    v_clean_program := NULLIF(trim(COALESCE(p_program_or_course, '')), '');
    IF v_clean_program IS NULL THEN
      RAISE EXCEPTION 'Program is required for student registrations' USING ERRCODE = '22023';
    END IF;
    v_clean_office := NULL;
  ELSE
    v_clean_office := NULLIF(trim(COALESCE(p_office_location, '')), '');
    IF v_clean_office IS NULL THEN
      RAISE EXCEPTION 'Office is required for non-student registrations' USING ERRCODE = '22023';
    END IF;
    v_clean_program := NULL;
  END IF;

  -- Strictly mirror faculty role; job_title is no longer collected
  v_clean_is_teaching := (p_requested_role = 'faculty'::public.user_role);

  v_prefix := v_uid::text || '/';
  IF p_front_path IS NULL OR p_back_path IS NULL
     OR left(p_front_path, char_length(v_prefix)) <> v_prefix
     OR left(p_back_path, char_length(v_prefix)) <> v_prefix
     OR position('..' IN p_front_path) > 0
     OR position('..' IN p_back_path) > 0 THEN
    RAISE EXCEPTION 'Invalid ID verification storage paths' USING ERRCODE = '42501';
  END IF;

  IF v_current.approval_status = 'returned' AND v_current.returned_snapshot IS NOT NULL THEN
    v_snap := v_current.returned_snapshot;
    v_flags := COALESCE(v_current.returned_fields, '[]'::jsonb);

    IF v_flags ? 'employee_or_student_id'
       AND v_clean_id = COALESCE(v_snap ->> 'employee_or_student_id', '') THEN
      RAISE EXCEPTION 'This School ID was marked invalid by the admin. Please enter a different value.'
        USING ERRCODE = '22023';
    END IF;

    IF v_flags ? 'full_name'
       AND lower(v_clean_name) = lower(trim(COALESCE(v_snap ->> 'full_name', ''))) THEN
      RAISE EXCEPTION 'Your Full Name was returned as invalid. Please enter your corrected Full Name.'
        USING ERRCODE = '22023';
    END IF;

    IF v_flags ? 'campus_id'
       AND p_campus_id::text = COALESCE(v_snap ->> 'campus_id', '') THEN
      RAISE EXCEPTION 'Your CHMSU Campus was returned as invalid. Please select your correct campus.'
        USING ERRCODE = '22023';
    END IF;

    IF v_flags ? 'requested_role'
       AND p_requested_role::text = COALESCE(v_snap ->> 'requested_role', '') THEN
      RAISE EXCEPTION 'Your Role was returned as invalid. Please select your correct role.'
        USING ERRCODE = '22023';
    END IF;

    IF v_flags ? 'department'
       AND lower(v_clean_dept) = lower(trim(COALESCE(v_snap ->> 'department', ''))) THEN
      IF p_requested_role = 'student'::public.user_role THEN
        RAISE EXCEPTION 'Your College / Department was returned as invalid. Please select a corrected value.'
          USING ERRCODE = '22023';
      ELSE
        RAISE EXCEPTION 'Your Office Category was returned as invalid. Please select a corrected value.'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_flags ? 'program_or_office' THEN
      IF (p_requested_role = 'student'::public.user_role
          AND lower(v_clean_program) = lower(trim(COALESCE(v_snap ->> 'program_or_course', ''))))
         OR (p_requested_role <> 'student'::public.user_role
          AND lower(v_clean_office) = lower(trim(COALESCE(v_snap ->> 'office_location', '')))) THEN
        RAISE EXCEPTION 'Your Program / Office was returned as invalid. Please select a corrected value.'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_flags ? 'id_photos'
       AND (
         p_front_path = COALESCE(v_snap ->> 'id_front_path', '')
         OR p_back_path = COALESCE(v_snap ->> 'id_back_path', '')
       ) THEN
      RAISE EXCEPTION 'Your School ID Photos were returned as invalid. Please upload new Front and Back ID photos.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    campus_id = p_campus_id,
    employee_or_student_id = v_clean_id,
    full_name = v_clean_name,
    requested_role = p_requested_role,
    department = v_clean_dept,
    program_or_course = v_clean_program,
    office_location = v_clean_office,
    job_title = NULL,
    is_teaching = v_clean_is_teaching,
    id_front_path = p_front_path,
    id_back_path = p_back_path,
    profile_completed = true,
    approval_status = 'pending',
    is_active = false,
    returned_fields = '[]'::jsonb,
    returned_snapshot = NULL,
    review_notes = NULL,
    updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'profile_id', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_registration_credentials(
  uuid, text, text, public.user_role, text, text, text, text, text, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_registration_credentials(
  uuid, text, text, public.user_role, text, text, text, text, text, text, boolean
) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_registration_credentials(
  uuid, text, text, public.user_role, text, text, text, text, text, text, boolean
) TO authenticated;
