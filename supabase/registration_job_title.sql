-- =============================================================================
-- SmartCampus CHMSU — Registration Job Title (Non-Student Roles)
-- Run this file in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================

-- 1. Ensure job_title column exists on public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title text;

-- 2. Update review_user_registration(...) to support 'job_title' in snapshot & flagged fields
CREATE OR REPLACE FUNCTION public.review_user_registration(
  p_target_user_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL,
  p_flagged_fields jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_actor_role public.user_role;
  v_actor_campus_id uuid;
  v_target record;
  v_campus_name text;
  v_clean_reason text;
  v_flag text;
  v_allowed_flags text[] := ARRAY[
    'campus_id',
    'requested_role',
    'employee_or_student_id',
    'full_name',
    'department',
    'program_or_office',
    'job_title',
    'id_photos'
  ];
  v_snapshot jsonb;
  v_now timestamptz := now();
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role, campus_id
  INTO v_actor_role, v_actor_campus_id
  FROM public.profiles
  WHERE id = v_uid
    AND is_active = true
    AND approval_status = 'approved'
  LIMIT 1;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('superadmin', 'campus_admin') THEN
    RAISE EXCEPTION 'Only System Admin or Campus Admin may review registrations' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('activate', 'approve', 'return', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision; expected activate, return, or reject' USING ERRCODE = '22023';
  END IF;

  SELECT
    id,
    email,
    canonical_email,
    full_name,
    employee_or_student_id,
    campus_id,
    requested_role,
    department,
    program_or_course,
    office_location,
    job_title,
    id_front_path,
    id_back_path,
    approval_status,
    profile_completed,
    privacy_terms_accepted_at
  INTO v_target
  FROM public.profiles
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_role = 'campus_admin' AND v_target.campus_id IS DISTINCT FROM v_actor_campus_id THEN
    RAISE EXCEPTION 'Campus Admins may only review registrations belonging to their own campus' USING ERRCODE = '42501';
  END IF;

  IF v_target.approval_status IS DISTINCT FROM 'pending' OR v_target.profile_completed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Only completed pending registrations can be reviewed' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_campus_name
  FROM public.campuses
  WHERE id = v_target.campus_id
  LIMIT 1;

  -- 1. ACTIVATE / APPROVE
  IF p_decision IN ('activate', 'approve') THEN
    IF v_target.requested_role IS NULL OR v_target.requested_role IN ('superadmin', 'campus_admin') THEN
      RAISE EXCEPTION 'Registrant requested role is invalid' USING ERRCODE = '22023';
    END IF;

    IF v_target.campus_id IS NULL THEN
      RAISE EXCEPTION 'Registrant campus is missing' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles
    SET
      role = v_target.requested_role,
      approval_status = 'approved',
      is_active = true,
      show_on_kiosk = (v_target.requested_role IN ('faculty', 'dept_head')),
      privacy_terms_accepted = CASE
        WHEN privacy_terms_accepted_at IS NULL THEN false
        ELSE privacy_terms_accepted
      END,
      returned_fields = '[]'::jsonb,
      returned_snapshot = NULL,
      review_notes = NULL,
      rejection_reason = NULL,
      reviewed_by = v_uid,
      reviewed_at = v_now,
      updated_at = v_now
    WHERE id = p_target_user_id;

    INSERT INTO public.audit_logs (
      campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata
    )
    VALUES (
      v_target.campus_id,
      v_uid,
      v_actor_role,
      'registration_activated',
      'profile',
      p_target_user_id,
      jsonb_build_object(
        'target_name', v_target.full_name,
        'employee_or_student_id', v_target.employee_or_student_id,
        'role', v_target.requested_role,
        'campus_id', v_target.campus_id,
        'campus_name', v_campus_name
      )
    );

    INSERT INTO public.notifications (
      user_id, campus_id, type, title, message, is_read
    )
    VALUES (
      p_target_user_id,
      v_target.campus_id,
      'system',
      'SmartCampus Account Activated',
      format(
        'Your CHMSU SmartCampus registration (School ID %s) has been verified and activated for CHMSU %s.',
        COALESCE(v_target.employee_or_student_id, 'N/A'),
        COALESCE(v_campus_name, 'CHMSU')
      ),
      false
    );

    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'activate',
      'user_id', p_target_user_id
    );
  END IF;

  -- 2. RETURN FOR CORRECTION (includes job_title in snapshot & clears it if flagged)
  IF p_decision = 'return' THEN
    v_clean_reason := NULLIF(trim(COALESCE(p_reason, '')), '');
    IF v_clean_reason IS NULL THEN
      RAISE EXCEPTION 'A reason is required when returning a registration' USING ERRCODE = '22023';
    END IF;

    IF p_flagged_fields IS NULL
       OR jsonb_typeof(p_flagged_fields) <> 'array'
       OR jsonb_array_length(p_flagged_fields) = 0 THEN
      RAISE EXCEPTION 'Select at least one invalid field to return for correction' USING ERRCODE = '22023';
    END IF;

    FOR v_flag IN SELECT jsonb_array_elements_text(p_flagged_fields) LOOP
      IF NOT (v_flag = ANY(v_allowed_flags)) THEN
        RAISE EXCEPTION 'Invalid flagged field: %', v_flag USING ERRCODE = '22023';
      END IF;
    END LOOP;

    v_snapshot := jsonb_build_object(
      'campus_id', v_target.campus_id,
      'employee_or_student_id', v_target.employee_or_student_id,
      'full_name', v_target.full_name,
      'requested_role', v_target.requested_role,
      'department', v_target.department,
      'program_or_course', v_target.program_or_course,
      'office_location', v_target.office_location,
      'job_title', v_target.job_title,
      'id_front_path', v_target.id_front_path,
      'id_back_path', v_target.id_back_path
    );

    UPDATE public.profiles
    SET
      approval_status = 'returned',
      profile_completed = false,
      is_active = false,
      review_notes = v_clean_reason,
      returned_fields = p_flagged_fields,
      returned_snapshot = v_snapshot,
      campus_id = CASE WHEN p_flagged_fields ? 'campus_id' THEN NULL ELSE campus_id END,
      employee_or_student_id = CASE WHEN p_flagged_fields ? 'employee_or_student_id' THEN NULL ELSE employee_or_student_id END,
      requested_role = CASE WHEN p_flagged_fields ? 'requested_role' THEN NULL ELSE requested_role END,
      department = CASE WHEN p_flagged_fields ? 'department' THEN NULL ELSE department END,
      program_or_course = CASE WHEN p_flagged_fields ? 'program_or_office' THEN NULL ELSE program_or_course END,
      office_location = CASE WHEN p_flagged_fields ? 'program_or_office' THEN NULL ELSE office_location END,
      job_title = CASE WHEN p_flagged_fields ? 'job_title' THEN NULL ELSE job_title END,
      id_front_path = CASE WHEN p_flagged_fields ? 'id_photos' THEN NULL ELSE id_front_path END,
      id_back_path = CASE WHEN p_flagged_fields ? 'id_photos' THEN NULL ELSE id_back_path END,
      reviewed_by = v_uid,
      reviewed_at = v_now,
      updated_at = v_now
    WHERE id = p_target_user_id;

    INSERT INTO public.audit_logs (
      campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata
    )
    VALUES (
      v_target.campus_id,
      v_uid,
      v_actor_role,
      'registration_returned',
      'profile',
      p_target_user_id,
      jsonb_build_object(
        'target_name', v_target.full_name,
        'employee_or_student_id', v_target.employee_or_student_id,
        'flagged_fields', p_flagged_fields,
        'reason', v_clean_reason
      )
    );

    RETURN jsonb_build_object(
      'ok', true,
      'decision', 'return',
      'user_id', p_target_user_id,
      'flagged_fields', p_flagged_fields
    );
  END IF;

  -- 3. REJECT & PERMANENTLY BAN EMAIL
  v_clean_reason := NULLIF(trim(COALESCE(p_reason, '')), '');
  IF v_clean_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required when rejecting and banning a registration' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.banned_emails (
    email,
    canonical_email,
    reason,
    banned_by,
    banned_at
  )
  VALUES (
    v_target.email,
    COALESCE(v_target.canonical_email, private.canonicalize_email(v_target.email)),
    v_clean_reason,
    v_uid,
    v_now
  )
  ON CONFLICT (canonical_email) DO NOTHING;

  UPDATE public.profiles
  SET
    approval_status = 'rejected',
    is_active = false,
    show_on_kiosk = false,
    employee_or_student_id = NULL,
    review_notes = v_clean_reason,
    rejection_reason = v_clean_reason,
    returned_fields = '[]'::jsonb,
    returned_snapshot = NULL,
    reviewed_by = v_uid,
    reviewed_at = v_now,
    updated_at = v_now
  WHERE id = p_target_user_id;

  INSERT INTO public.audit_logs (
    campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata
  )
  VALUES (
    v_target.campus_id,
    v_uid,
    v_actor_role,
    'registration_rejected_banned',
    'profile',
    p_target_user_id,
    jsonb_build_object(
      'target_name', v_target.full_name,
      'banned_email', v_target.email,
      'reason', v_clean_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'decision', 'reject',
    'user_id', p_target_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_user_registration(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_user_registration(uuid, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_user_registration(uuid, text, text, jsonb) TO authenticated;

-- 3. Drop old 9-argument signature to avoid overload ambiguity, then create 10-argument signature
DROP FUNCTION IF EXISTS public.complete_registration_credentials(
  uuid, text, text, public.user_role, text, text, text, text, text
);

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
  p_job_title text DEFAULT NULL
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
  v_clean_job_title text;
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

  v_clean_dept := trim(COALESCE(p_department, ''));
  IF char_length(v_clean_dept) < 2 THEN
    RAISE EXCEPTION 'College / Department is required' USING ERRCODE = '22023';
  END IF;

  IF p_requested_role = 'student' THEN
    v_clean_program := NULLIF(trim(COALESCE(p_program_or_course, '')), '');
    IF v_clean_program IS NULL THEN
      RAISE EXCEPTION 'Program is required for student registrations' USING ERRCODE = '22023';
    END IF;
    v_clean_office := NULL;
    v_clean_job_title := NULL;
  ELSE
    v_clean_office := NULLIF(trim(COALESCE(p_office_location, '')), '');
    IF v_clean_office IS NULL THEN
      RAISE EXCEPTION 'Office is required for non-student registrations' USING ERRCODE = '22023';
    END IF;
    v_clean_job_title := NULLIF(trim(COALESCE(p_job_title, '')), '');
    IF v_clean_job_title IS NULL THEN
      RAISE EXCEPTION 'Job Title is required for non-student roles.' USING ERRCODE = '22023';
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

  -- Enforce that previously returned invalid values CANNOT be re-submitted
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
      RAISE EXCEPTION 'Your College / Department was returned as invalid. Please select a corrected value.'
        USING ERRCODE = '22023';
    END IF;

    IF v_flags ? 'program_or_office' THEN
      IF (p_requested_role = 'student'
          AND lower(v_clean_program) = lower(trim(COALESCE(v_snap ->> 'program_or_course', ''))))
         OR (p_requested_role <> 'student'
          AND lower(v_clean_office) = lower(trim(COALESCE(v_snap ->> 'office_location', '')))) THEN
        RAISE EXCEPTION 'Your Program / Office was returned as invalid. Please select a corrected value.'
          USING ERRCODE = '22023';
      END IF;
    END IF;

    IF v_flags ? 'job_title'
       AND p_requested_role <> 'student'
       AND lower(v_clean_job_title) = lower(trim(COALESCE(v_snap ->> 'job_title', ''))) THEN
      RAISE EXCEPTION 'Your Job Title was marked invalid by the admin. Please enter a corrected Job Title.'
        USING ERRCODE = '22023';
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
    job_title = v_clean_job_title,
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
  uuid, text, text, public.user_role, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_registration_credentials(
  uuid, text, text, public.user_role, text, text, text, text, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_registration_credentials(
  uuid, text, text, public.user_role, text, text, text, text, text, text
) TO authenticated;
