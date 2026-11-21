-- =============================================================================
-- SmartCampus CHMSU — Mandatory First-Login RA 10173 Terms & Privacy Consent
-- Run this file in the Supabase SQL Editor (after registration_otp_then_credentials.sql).
-- Safe to re-run (idempotent).
-- =============================================================================

-- 1. Add consent columns to public.profiles
--    Existing seeded/admin accounts default to true so they are unaffected.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_terms_accepted boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS privacy_terms_accepted_at timestamptz;

-- 2. Update private.handle_new_user()
--    Newly self-registered accounts start with privacy_terms_accepted = false
--    and privacy_terms_accepted_at = NULL.
--    Admin-seeded accounts keep privacy_terms_accepted = true.
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
    v_privacy_terms_accepted := true;
    v_privacy_terms_accepted_at := now();
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
    -- Self-registration (Step 1 -> Step 2 OTP -> Step 3 credentials -> Admin approval -> Terms consent)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

-- 3. Update public.review_user_registration(...)
--    On approval, keep privacy_terms_accepted = false when privacy_terms_accepted_at IS NULL
--    so newly approved accounts must accept the RA 10173 Terms modal on first portal login.
CREATE OR REPLACE FUNCTION public.review_user_registration(
  p_user_id uuid,
  p_decision text,
  p_assigned_role public.user_role,
  p_campus_id uuid,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_actor_role public.user_role;
  v_target record;
  v_campus_name text;
  v_clean_reason text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_actor_role
  FROM public.profiles
  WHERE id = v_uid
    AND is_active = true
    AND approval_status = 'approved'
  LIMIT 1;

  IF v_actor_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only System Administrators may review user registrations' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision; expected approve or reject' USING ERRCODE = '22023';
  END IF;

  SELECT
    id,
    full_name,
    employee_or_student_id,
    campus_id,
    requested_role,
    approval_status,
    privacy_terms_accepted_at
  INTO v_target
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_decision = 'approve' THEN
    IF p_assigned_role IS NULL OR p_campus_id IS NULL THEN
      RAISE EXCEPTION 'Assigned role and campus are required for approval' USING ERRCODE = '22023';
    END IF;

    SELECT name INTO v_campus_name
    FROM public.campuses
    WHERE id = p_campus_id AND is_active = true
    LIMIT 1;

    IF v_campus_name IS NULL THEN
      RAISE EXCEPTION 'Selected campus is invalid or inactive' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET
      approval_status = 'approved',
      is_active = true,
      role = p_assigned_role,
      campus_id = p_campus_id,
      show_on_kiosk = (p_assigned_role IN ('faculty', 'dept_head')),
      privacy_terms_accepted = CASE
        WHEN privacy_terms_accepted_at IS NULL THEN false
        ELSE privacy_terms_accepted
      END,
      rejection_reason = NULL,
      reviewed_by = v_uid,
      reviewed_at = now(),
      updated_at = now()
    WHERE id = p_user_id;

    INSERT INTO public.audit_logs (
      campus_id,
      actor_id,
      actor_role,
      action,
      entity_type,
      entity_id,
      metadata
    )
    VALUES (
      p_campus_id,
      v_uid,
      'admin',
      'registration_approved',
      'profile',
      p_user_id,
      jsonb_build_object(
        'target_name', v_target.full_name,
        'employee_or_student_id', v_target.employee_or_student_id,
        'requested_role', v_target.requested_role,
        'assigned_role', p_assigned_role,
        'campus_id', p_campus_id,
        'campus_name', v_campus_name
      )
    );

    INSERT INTO public.notifications (
      user_id,
      campus_id,
      type,
      title,
      message,
      is_read
    )
    VALUES (
      p_user_id,
      p_campus_id,
      'system',
      'SmartCampus Account Approved',
      format(
        'Your CHMSU SmartCampus registration (ID %s) has been verified and approved for CHMSU %s.',
        COALESCE(v_target.employee_or_student_id, 'N/A'),
        v_campus_name
      ),
      false
    );

    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'approve',
      'user_id', p_user_id,
      'assigned_role', p_assigned_role,
      'campus_id', p_campus_id
    );
  ELSE
    v_clean_reason := COALESCE(
      NULLIF(trim(p_rejection_reason), ''),
      'School ID verification could not be completed. Please contact your campus ICT/Admin office.'
    );

    UPDATE public.profiles
    SET
      approval_status = 'rejected',
      is_active = false,
      show_on_kiosk = false,
      rejection_reason = v_clean_reason,
      reviewed_by = v_uid,
      reviewed_at = now(),
      updated_at = now()
    WHERE id = p_user_id;

    INSERT INTO public.audit_logs (
      campus_id,
      actor_id,
      actor_role,
      action,
      entity_type,
      entity_id,
      metadata
    )
    VALUES (
      COALESCE(p_campus_id, v_target.campus_id),
      v_uid,
      'admin',
      'registration_rejected',
      'profile',
      p_user_id,
      jsonb_build_object(
        'target_name', v_target.full_name,
        'employee_or_student_id', v_target.employee_or_student_id,
        'requested_role', v_target.requested_role,
        'rejection_reason', v_clean_reason
      )
    );

    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'reject',
      'user_id', p_user_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.review_user_registration(uuid, text, public.user_role, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_user_registration(uuid, text, public.user_role, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_user_registration(uuid, text, public.user_role, uuid, text) TO authenticated;

-- 4. SECURITY DEFINER RPC: Accept RA 10173 Privacy & Terms Consent
CREATE OR REPLACE FUNCTION public.accept_privacy_terms()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_campus_id uuid;
  v_role public.user_role;
  v_now timestamptz := now();
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT campus_id, role
  INTO v_campus_id, v_role
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles
  SET
    privacy_terms_accepted = true,
    privacy_terms_accepted_at = v_now,
    updated_at = v_now
  WHERE id = v_uid;

  INSERT INTO public.audit_logs (
    campus_id,
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    v_campus_id,
    v_uid,
    v_role,
    'privacy_terms_accepted',
    'profile',
    v_uid,
    jsonb_build_object(
      'accepted_at', v_now,
      'compliance', 'RA 10173 (Data Privacy Act of 2012)'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'accepted_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_privacy_terms() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_privacy_terms() FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_privacy_terms() TO authenticated;
