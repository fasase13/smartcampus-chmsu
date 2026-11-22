-- =============================================================================
-- SmartCampus CHMSU — Google OAuth Profile Trigger Support (Idempotent)
-- Run this file in the Supabase SQL Editor (after registration_return_and_ban.sql).
-- Ensures Google OAuth signups capture `full_name` / `name` metadata safely,
-- enforce `public.banned_emails`, and initialize `profile_completed = false`.
-- =============================================================================

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
  v_privacy_terms_accepted boolean := false;
  v_privacy_terms_accepted_at timestamptz := NULL;
  v_campus_id uuid := NULL;
  v_campus_slug text;
  v_full_name text;
  v_meta_name text;
  v_email_local text;
  v_id_number text := NULL;
  v_department text := NULL;
  v_canonical_email text;
BEGIN
  v_canonical_email := private.canonicalize_email(NEW.email);
  v_email_local := trim(split_part(COALESCE(NEW.email, ''), '@', 1));

  -- Permanently block banned emails (including Google OAuth signups)
  IF v_canonical_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.banned_emails WHERE canonical_email = v_canonical_email
  ) THEN
    RAISE EXCEPTION 'This email address has been banned from registering on SmartCampus CHMSU.'
      USING ERRCODE = '42501';
  END IF;

  v_app_role := NEW.raw_app_meta_data ->> 'role';
  IF v_app_role = 'admin' THEN
    v_app_role := 'superadmin';
  END IF;

  IF v_app_role IN ('superadmin', 'campus_admin', 'rmo', 'dept_head', 'faculty', 'staff', 'management', 'student') THEN
    v_role := v_app_role::public.user_role;
    v_approval_status := 'approved';
    v_is_active := true;
    v_profile_completed := true;
    v_privacy_terms_accepted := true;
    v_privacy_terms_accepted_at := now();
    v_show_on_kiosk := v_role IN ('faculty', 'dept_head');
    v_requested_role := CASE WHEN v_role IN ('superadmin', 'campus_admin') THEN NULL ELSE v_role END;

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
    -- Self-registration (Email OTP or Google OAuth)
    v_role := 'student';
    v_approval_status := 'pending';
    v_is_active := false;
    v_show_on_kiosk := false;
    v_profile_completed := false;
    v_privacy_terms_accepted := false;
    v_privacy_terms_accepted_at := NULL;
    v_campus_id := NULL;
    v_requested_role := NULL;
    v_id_number := NULL;
    v_department := NULL;
  END IF;

  -- Capture Google OAuth `full_name` or `name` metadata safely
  v_meta_name := NULLIF(
    trim(
      COALESCE(
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name',
        ''
      )
    ),
    ''
  );

  v_full_name := COALESCE(
    CASE WHEN char_length(v_meta_name) >= 2 THEN v_meta_name ELSE NULL END,
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
    profile_completed,
    privacy_terms_accepted,
    privacy_terms_accepted_at
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
    v_profile_completed,
    v_privacy_terms_accepted,
    v_privacy_terms_accepted_at
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
