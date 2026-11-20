-- =============================================================================
-- SmartCampus CHMSU — Sprint 5 Migration: Zero-OTP 8-Digit ID Registration,
-- Private Front/Back School ID Verification & System Admin Approval Queue
-- Run this file in the Supabase SQL Editor. Safe to re-run (idempotent).
-- RA 10173 Compliance: ID photos and ID numbers are strictly private and NEVER
-- exposed to anon or on /[campus]/kiosk.
-- =============================================================================

-- =============================================================================
-- 1. Extend public.profiles with Approval & ID Verification Columns
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS requested_role public.user_role DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS id_front_path text,
  ADD COLUMN IF NOT EXISTS id_back_path text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_approval_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_requested_role_not_admin_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_requested_role_not_admin_check
      CHECK (requested_role IS NULL OR requested_role <> 'admin');
  END IF;
END
$$;

-- Normalize any empty string IDs to NULL before creating the partial unique index
UPDATE public.profiles
SET employee_or_student_id = NULL
WHERE employee_or_student_id IS NOT NULL
  AND trim(employee_or_student_id) = '';

-- Partial UNIQUE index so each 8-digit School/Student ID can only register 1 account
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_employee_or_student_id
  ON public.profiles (trim(employee_or_student_id))
  WHERE employee_or_student_id IS NOT NULL;

-- Supporting index for the Admin Pending Registrations queue
CREATE INDEX IF NOT EXISTS idx_profiles_pending_approval
  ON public.profiles (approval_status, created_at DESC)
  WHERE approval_status = 'pending';

-- =============================================================================
-- 2. Private Supabase Storage Bucket (`id-verifications`) + Strict RLS
-- =============================================================================
-- Path convention: <auth.uid()>/front.<ext> and <auth.uid()>/back.<ext>

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'id-verifications',
  'id-verifications',
  false,
  5242880, -- 5 MB max per file
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated users can INSERT only their own front/back ID files
DROP POLICY IF EXISTS "id_verifications_owner_insert" ON storage.objects;
CREATE POLICY "id_verifications_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'id-verifications'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND name ~ ('^' || (SELECT auth.uid())::text || '/(front|back)\.(jpe?g|png|webp)$')
  );

-- Authenticated users can UPDATE (replace/upsert) only their own front/back ID files
DROP POLICY IF EXISTS "id_verifications_owner_update" ON storage.objects;
CREATE POLICY "id_verifications_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'id-verifications'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND name ~ ('^' || (SELECT auth.uid())::text || '/(front|back)\.(jpe?g|png|webp)$')
  )
  WITH CHECK (
    bucket_id = 'id-verifications'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND name ~ ('^' || (SELECT auth.uid())::text || '/(front|back)\.(jpe?g|png|webp)$')
  );

-- Only System Admins (and the owning user) can SELECT from `id-verifications`
-- to generate short-lived signed URLs. Zero anon or cross-user access.
DROP POLICY IF EXISTS "id_verifications_admin_or_owner_select" ON storage.objects;
CREATE POLICY "id_verifications_admin_or_owner_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'id-verifications'
    AND (
      private.current_user_role() = 'admin'
      OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )
  );

-- =============================================================================
-- 3. Tighten Private RLS Helper Functions to Require Approved + Active Status
-- =============================================================================

CREATE OR REPLACE FUNCTION private.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
    AND is_active = true
    AND approval_status = 'approved'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.current_user_campus_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT campus_id
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
    AND is_active = true
    AND approval_status = 'approved'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.current_user_campus_slug()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.slug
  FROM public.profiles p
  JOIN public.campuses c ON c.id = p.campus_id
  WHERE p.id = (SELECT auth.uid())
    AND p.is_active = true
    AND p.approval_status = 'approved'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
      AND approval_status = 'approved'
  );
$$;

-- =============================================================================
-- 4. Update private.handle_new_user() Trigger
-- =============================================================================
-- Security:
--  - Self-registrations (no app_metadata.role) ALWAYS start with:
--      role = 'student', approval_status = 'pending', is_active = false, show_on_kiosk = false
--  - requested_role defaults to 'student' and NEVER allows 'admin'.
--  - Admin-seeded accounts (app_metadata.role pre-set) keep approval_status = 'approved'
--    and is_active = true.

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_app_role text;
  v_is_seeded boolean := false;
  v_role public.user_role := 'student';
  v_requested_role_text text;
  v_requested_role public.user_role := 'student';
  v_approval_status text := 'pending';
  v_is_active boolean := false;
  v_show_on_kiosk boolean := false;
  v_campus_id uuid;
  v_campus_slug text;
  v_full_name text;
  v_id_number text;
  v_department text;
BEGIN
  v_app_role := NEW.raw_app_meta_data ->> 'role';
  IF v_app_role IN ('admin', 'rmo', 'dept_head', 'faculty', 'staff', 'management', 'student') THEN
    v_is_seeded := true;
    v_role := v_app_role::public.user_role;
    v_approval_status := 'approved';
    v_is_active := true;
    v_show_on_kiosk := v_role IN ('faculty', 'dept_head');
    v_requested_role := CASE WHEN v_role = 'admin' THEN NULL ELSE v_role END;
  ELSE
    -- Self-registration: never trust user_metadata for active role; store requested_role only
    v_requested_role_text := NEW.raw_user_meta_data ->> 'requested_role';
    IF v_requested_role_text IN ('rmo', 'dept_head', 'faculty', 'staff', 'management', 'student') THEN
      v_requested_role := v_requested_role_text::public.user_role;
    ELSE
      v_requested_role := 'student';
    END IF;
    v_role := 'student';
    v_approval_status := 'pending';
    v_is_active := false;
    v_show_on_kiosk := false;
  END IF;

  -- Resolve campus_id from app_metadata, then user_metadata campus_slug, else Main campus
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

  v_full_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    split_part(COALESCE(NEW.email, 'user@chmsu.edu.ph'), '@', 1)
  );

  v_id_number := NULLIF(trim(NEW.raw_user_meta_data ->> 'employee_or_student_id'), '');
  v_department := NULLIF(trim(NEW.raw_user_meta_data ->> 'department'), '');

  INSERT INTO public.profiles (
    id,
    campus_id,
    email,
    full_name,
    role,
    requested_role,
    department,
    employee_or_student_id,
    approval_status,
    is_active,
    show_on_kiosk
  )
  VALUES (
    NEW.id,
    v_campus_id,
    COALESCE(NEW.email, NEW.id::text || '@chmsu.local'),
    v_full_name,
    v_role,
    v_requested_role,
    v_department,
    v_id_number,
    v_approval_status,
    v_is_active,
    v_show_on_kiosk
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
-- 5. SECURITY DEFINER RPCs for Registration & Admin Verification
-- =============================================================================

-- 5.1 Check whether an 8-digit School/Student ID number is available
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

-- 5.2 Attach uploaded Front & Back School ID storage paths to caller's pending profile
CREATE OR REPLACE FUNCTION public.attach_id_verification_files(
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
  v_updated_id uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_prefix := v_uid::text || '/';

  IF p_front_path IS NULL OR p_back_path IS NULL THEN
    RAISE EXCEPTION 'Both front and back ID photo paths are required' USING ERRCODE = '22023';
  END IF;

  IF left(p_front_path, char_length(v_prefix)) <> v_prefix
     OR left(p_back_path, char_length(v_prefix)) <> v_prefix
     OR position('..' IN p_front_path) > 0
     OR position('..' IN p_back_path) > 0 THEN
    RAISE EXCEPTION 'Invalid ID verification storage path' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET
    id_front_path = p_front_path,
    id_back_path = p_back_path,
    updated_at = now()
  WHERE id = v_uid
    AND approval_status = 'pending'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'No pending registration profile found for current user' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'profile_id', v_updated_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.attach_id_verification_files(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_id_verification_files(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.attach_id_verification_files(text, text) TO authenticated;

-- 5.3 System Admin Approval / Rejection RPC
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
    approval_status
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

-- =============================================================================
-- 6. Verify RLS Policies, Public Kiosk View & RA 10173 Column Grants
-- =============================================================================

-- Ensure authenticated users can ALWAYS read their own profile row even while
-- is_active = false / approval_status = 'pending' so /pending-approval works.
DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;
CREATE POLICY "profiles_authenticated_read"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR private.current_user_role() IN ('admin', 'management')
    OR (
      private.current_user_role() IN ('rmo', 'dept_head', 'faculty', 'staff')
      AND campus_id = private.current_user_campus_id()
      AND is_active = true
      AND approval_status = 'approved'
    )
    OR (
      private.current_user_role() = 'student'
      AND campus_id = private.current_user_campus_id()
      AND role IN ('faculty', 'dept_head')
      AND is_active = true
      AND approval_status = 'approved'
      AND show_on_kiosk = true
    )
  );

-- Ensure pending/unapproved authenticated users cannot read internal announcements
DROP POLICY IF EXISTS "announcements_authenticated_read" ON public.announcements;
CREATE POLICY "announcements_authenticated_read"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    private.is_active_user()
    AND (
      private.current_user_role() IN ('admin', 'management')
      OR author_id = (SELECT auth.uid())
      OR (
        is_active = true
        AND published_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
        AND (campus_id IS NULL OR campus_id = private.current_user_campus_id())
      )
    )
  );

-- Re-assert strict RA 10173 public kiosk view (NEVER exposes ID numbers, ID photos, or approval_status)
CREATE OR REPLACE VIEW public.public_faculty_availability
WITH (security_invoker = true) AS
SELECT
  id,
  campus_id,
  full_name,
  department,
  job_title,
  office_location,
  availability_status,
  availability_note,
  availability_updated_at
FROM public.profiles
WHERE role IN ('faculty', 'dept_head')
  AND is_active = true
  AND approval_status = 'approved'
  AND show_on_kiosk = true;

-- Re-assert strict anon column grants on public.profiles
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT (
  id,
  campus_id,
  full_name,
  role,
  department,
  job_title,
  office_location,
  availability_status,
  availability_note,
  availability_updated_at,
  show_on_kiosk,
  is_active
) ON public.profiles TO anon;
GRANT SELECT ON public.public_faculty_availability TO anon, authenticated;

-- Update anon kiosk policy to also require approval_status = 'approved'
DROP POLICY IF EXISTS "profiles_anon_kiosk_availability" ON public.profiles;
CREATE POLICY "profiles_anon_kiosk_availability"
  ON public.profiles FOR SELECT
  TO anon
  USING (
    role IN ('faculty', 'dept_head')
    AND is_active = true
    AND approval_status = 'approved'
    AND show_on_kiosk = true
  );
