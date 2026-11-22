-- =============================================================================
-- SmartCampus CHMSU — Step 3 Dynamic Program / Office Registration Migration
-- Run this file in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================

-- 1. Add program_or_course column to public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS program_or_course text;

-- 2. Drop legacy 7-argument overload so PostgREST RPC resolution is unambiguous
DROP FUNCTION IF EXISTS public.complete_registration_credentials(
  uuid, text, text, public.user_role, text, text, text
);

-- 3. Updated Step 3 completion RPC accepting p_program_or_course & p_office_location
CREATE OR REPLACE FUNCTION public.complete_registration_credentials(
  p_campus_id uuid,
  p_id_number text,
  p_full_name text,
  p_requested_role public.user_role,
  p_department text,
  p_front_path text,
  p_back_path text,
  p_program_or_course text DEFAULT NULL,
  p_office_location text DEFAULT NULL
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
  v_current_status text;
  v_campus_exists boolean;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT approval_status INTO v_current_status
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF v_current_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Only pending registrations may submit credentials' USING ERRCODE = '42501';
  END IF;

  IF p_requested_role IS NULL OR p_requested_role IN ('superadmin', 'campus_admin') THEN
    RAISE EXCEPTION 'Invalid requested role' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'ID Number must be exactly 8 digits (e.g., 20230399)' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE employee_or_student_id IS NOT NULL
      AND trim(employee_or_student_id) = v_clean_id
      AND id <> v_uid
  ) THEN
    RAISE EXCEPTION 'ID Number % is already registered to another account', v_clean_id
      USING ERRCODE = '23505';
  END IF;

  v_clean_name := trim(COALESCE(p_full_name, ''));
  IF char_length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Full Name must be at least 2 characters' USING ERRCODE = '22023';
  END IF;

  v_clean_dept := trim(COALESCE(p_department, ''));
  IF char_length(v_clean_dept) < 2 THEN
    RAISE EXCEPTION 'College / Department is required' USING ERRCODE = '22023';
  END IF;

  -- Enforce Program (for students) vs Office (for non-student roles)
  IF p_requested_role = 'student' THEN
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

  v_prefix := v_uid::text || '/';
  IF p_front_path IS NULL OR p_back_path IS NULL
     OR left(p_front_path, char_length(v_prefix)) <> v_prefix
     OR left(p_back_path, char_length(v_prefix)) <> v_prefix
     OR position('..' IN p_front_path) > 0
     OR position('..' IN p_back_path) > 0 THEN
    RAISE EXCEPTION 'Invalid ID verification storage paths' USING ERRCODE = '42501';
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
    id_front_path = p_front_path,
    id_back_path = p_back_path,
    profile_completed = true,
    approval_status = 'pending',
    is_active = false,
    updated_at = now()
  WHERE id = v_uid
    AND approval_status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'profile_id', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_registration_credentials(uuid, text, text, public.user_role, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_registration_credentials(uuid, text, text, public.user_role, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_registration_credentials(uuid, text, text, public.user_role, text, text, text, text, text) TO authenticated;
