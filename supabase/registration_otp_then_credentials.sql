-- =============================================================================
-- SmartCampus CHMSU — 3-Step Registration Migration:
-- Email OTP Verification FIRST -> School Credentials & Front/Back ID Upload
-- Run this file in the Supabase SQL Editor (after registration_id_verification.sql
-- and login_by_id_lookup.sql). Safe to re-run (idempotent).
-- =============================================================================

-- =============================================================================
-- 1. Canonical Email Normalizer (1 account per email; strips Gmail dots/+alias)
-- =============================================================================

CREATE OR REPLACE FUNCTION private.canonicalize_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_clean text;
  v_local text;
  v_domain text;
BEGIN
  v_clean := lower(trim(COALESCE(p_email, '')));
  IF v_clean = '' OR position('@' IN v_clean) = 0 THEN
    RETURN NULL;
  END IF;

  v_local := split_part(v_clean, '@', 1);
  v_domain := split_part(v_clean, '@', 2);

  IF v_local = '' OR v_domain = '' THEN
    RETURN NULL;
  END IF;

  IF v_domain IN ('gmail.com', 'googlemail.com') THEN
    v_local := split_part(v_local, '+', 1);
    v_local := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  END IF;

  RETURN v_local || '@' || v_domain;
END;
$$;

REVOKE ALL ON FUNCTION private.canonicalize_email(text) FROM PUBLIC;

-- =============================================================================
-- 2. Extend public.profiles with profile_completed & canonical_email
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_completed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS canonical_email text;

-- Backfill canonical_email for existing profiles
UPDATE public.profiles
SET canonical_email = private.canonicalize_email(email)
WHERE canonical_email IS NULL
  AND email IS NOT NULL;

-- Enforce 1 account per canonical email
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_canonical_email
  ON public.profiles (canonical_email)
  WHERE canonical_email IS NOT NULL;

-- Re-assert partial UNIQUE index on 8-digit School/Student ID so multiple
-- unfinished NULL rows do not conflict while submitted 8-digit IDs stay unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_employee_or_student_id
  ON public.profiles (trim(employee_or_student_id))
  WHERE employee_or_student_id IS NOT NULL;

-- Supporting index for the Admin Pending Registrations queue (completed only)
CREATE INDEX IF NOT EXISTS idx_profiles_pending_completed_approval
  ON public.profiles (approval_status, profile_completed, created_at DESC)
  WHERE approval_status = 'pending' AND profile_completed = true;

-- =============================================================================
-- 3. Update private.handle_new_user() Trigger
-- =============================================================================
-- - Computes canonical_email on every signup.
-- - Self-registrations (no app_metadata.role):
--     role = 'student', approval_status = 'pending', is_active = false,
--     show_on_kiosk = false, profile_completed = false
--     (campus_id, employee_or_student_id, requested_role, department,
--      id_front_path, id_back_path remain NULL until Step 3).
-- - Admin-seeded accounts (app_metadata.role pre-set):
--     approval_status = 'approved', is_active = true, profile_completed = true.

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app_role text;
  v_role public.user_role := 'student';
  v_requested_role public.user_role := NULL;
  v_approval_status text := 'pending';
  v_is_active boolean := false;
  v_show_on_kiosk boolean := false;
  v_profile_completed boolean := false;
  v_campus_id uuid := NULL;
  v_campus_slug text;
  v_full_name text;
  v_email_local text;
  v_id_number text := NULL;
  v_department text := NULL;
  v_canonical_email text;
BEGIN
  v_canonical_email := private.canonicalize_email(NEW.email);
  v_email_local := trim(split_part(COALESCE(NEW.email, ''), '@', 1));

  v_app_role := NEW.raw_app_meta_data ->> 'role';
  IF v_app_role IN ('admin', 'rmo', 'dept_head', 'faculty', 'staff', 'management', 'student') THEN
    -- Admin-seeded / pre-provisioned account
    v_role := v_app_role::public.user_role;
    v_approval_status := 'approved';
    v_is_active := true;
    v_profile_completed := true;
    v_show_on_kiosk := v_role IN ('faculty', 'dept_head');
    v_requested_role := CASE WHEN v_role = 'admin' THEN NULL ELSE v_role END;

    IF (NEW.raw_app_meta_data ->> 'campus_id') IS NOT NULL THEN
      v_campus_id := (NEW.raw_app_meta_data ->> 'campus_id')::uuid;
    ELSE
      v_campus_slug := COALESCE(
        NULLIF(trim(NEW.raw_app_meta_data ->> 'campus_slug'), ''),
        NULLIF(trim(NEW.raw_user_meta_data ->> 'campus_slug'), ''),
        'talisay'
      );
      SELECT id INTO v_campus_id
      FROM public.campuses
      WHERE slug = v_campus_slug
      LIMIT 1;
    END IF;

    v_id_number := NULLIF(trim(NEW.raw_user_meta_data ->> 'employee_or_student_id'), '');
    v_department := NULLIF(trim(NEW.raw_user_meta_data ->> 'department'), '');
  ELSE
    -- Self-registration (Step 1 -> Step 2 OTP -> Step 3 credentials)
    v_role := 'student';
    v_approval_status := 'pending';
    v_is_active := false;
    v_show_on_kiosk := false;
    v_profile_completed := false;
    v_campus_id := NULL;
    v_requested_role := NULL;
    v_id_number := NULL;
    v_department := NULL;
  END IF;

  v_full_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    CASE WHEN char_length(v_email_local) >= 2 THEN v_email_local ELSE 'Pending User' END
  );

  INSERT INTO public.profiles (
    id,
    campus_id,
    email,
    canonical_email,
    full_name,
    role,
    requested_role,
    department,
    employee_or_student_id,
    approval_status,
    is_active,
    show_on_kiosk,
    profile_completed
  )
  VALUES (
    NEW.id,
    v_campus_id,
    COALESCE(lower(trim(NEW.email)), NEW.id::text || '@chmsu.local'),
    v_canonical_email,
    v_full_name,
    v_role,
    v_requested_role,
    v_department,
    v_id_number,
    v_approval_status,
    v_is_active,
    v_show_on_kiosk,
    v_profile_completed
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

-- =============================================================================
-- 4. SECURITY DEFINER RPCs for Step 1 Email Check & Step 3 Completion
-- =============================================================================

-- 4.1 Check whether an email (normalized via canonical_email) is available
CREATE OR REPLACE FUNCTION public.check_registration_email_available(
  p_email text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_canonical text;
BEGIN
  v_canonical := private.canonicalize_email(p_email);
  IF v_canonical IS NULL THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE canonical_email = v_canonical
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_registration_email_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_registration_email_available(text) TO anon, authenticated;

-- 4.2 Complete Step 3: Save School Credentials & Private ID Photo Paths
CREATE OR REPLACE FUNCTION public.complete_registration_credentials(
  p_campus_id uuid,
  p_id_number text,
  p_full_name text,
  p_requested_role public.user_role,
  p_department text,
  p_front_path text,
  p_back_path text
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

  IF p_requested_role IS NULL OR p_requested_role = 'admin' THEN
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

REVOKE ALL ON FUNCTION public.complete_registration_credentials(uuid, text, text, public.user_role, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_registration_credentials(uuid, text, text, public.user_role, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_registration_credentials(uuid, text, text, public.user_role, text, text, text) TO authenticated;
