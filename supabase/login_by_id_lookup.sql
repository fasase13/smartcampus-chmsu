-- =============================================================================
-- SmartCampus CHMSU — Login by 8-Digit ID Lookup RPC (Idempotent Patch)
-- Run this file in the Supabase SQL Editor after registration_id_verification.sql.
-- Enables server-side ID-to-email resolution in /api/auth/login-id without ever
-- exposing user emails to the browser or public kiosks (RA 10173 compliant).
-- =============================================================================

-- 1. Re-assert partial UNIQUE index on 8-digit School/Student ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_employee_or_student_id
  ON public.profiles (trim(employee_or_student_id))
  WHERE employee_or_student_id IS NOT NULL;

-- 2. Re-assert ID availability check RPC
CREATE OR REPLACE FUNCTION public.check_id_number_available(
  p_id_number text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean text;
BEGIN
  v_clean := trim(COALESCE(p_id_number, ''));
  IF v_clean !~ '^\d{8}$' THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE employee_or_student_id IS NOT NULL
      AND trim(employee_or_student_id) = v_clean
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_id_number_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_id_number_available(text) TO anon, authenticated;

-- 3. Server-side ID-to-Email Lookup RPC for /api/auth/login-id
--    Trims p_id_number, validates 8-digit format, matches public.profiles.employee_or_student_id,
--    and returns the stored auth email for server-side signInWithPassword().
CREATE OR REPLACE FUNCTION public.lookup_email_for_id_login(
  p_id_number text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clean text;
  v_email text;
BEGIN
  v_clean := trim(COALESCE(p_id_number, ''));
  IF v_clean !~ '^\d{8}$' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(u.email, p.email)
  INTO v_email
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.employee_or_student_id IS NOT NULL
    AND trim(p.employee_or_student_id) = v_clean
  LIMIT 1;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_email_for_id_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_email_for_id_login(text) TO anon, authenticated;
