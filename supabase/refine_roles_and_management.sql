-- =============================================================================
-- SmartCampus CHMSU — Refine Roles, Lock Self-Registration to 4 Roles &
-- Enforce 1 Institutional Management Account Per Campus
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- What this migration does:
--   1. Migrates any existing `dept_head` profiles (`role` or `requested_role`)
--      to `faculty`, preserving or backfilling `job_title` as
--      'Department / Program Chairperson' so no existing accounts break.
--   2. Adds a partial unique index enforcing at most 1 `management` account
--      per campus (`idx_unique_management_per_campus`).
--   3. Locks down `private.handle_new_user()`, `complete_registration_credentials()`,
--      and `review_user_registration()` so self-registration strictly accepts
--      ONLY ('student', 'faculty', 'staff', 'rmo') — explicitly blocking
--      'dept_head', 'management', 'campus_admin', and 'superadmin'.
--   4. Updates operational RLS policies on `public.documents`,
--      `public.document_routes`, `storage.objects` (`document-files`),
--      `public.audit_logs`, `public.can_access_document`, and
--      `public.get_eligible_document_recipients` to use ('faculty', 'staff', 'rmo')
--      only, while preserving university-wide read-only oversight for `management`
--      and `superadmin` / campus-travel oversight for `campus_admin`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Migrate Existing `dept_head` Profiles Safely to `faculty`
-- -----------------------------------------------------------------------------
UPDATE public.profiles
SET
  role = 'faculty'::public.user_role,
  job_title = COALESCE(NULLIF(btrim(job_title), ''), 'Department / Program Chairperson'),
  updated_at = now()
WHERE role = 'dept_head'::public.user_role;

UPDATE public.profiles
SET
  requested_role = 'faculty'::public.user_role,
  job_title = COALESCE(NULLIF(btrim(job_title), ''), 'Department / Program Chairperson'),
  updated_at = now()
WHERE requested_role = 'dept_head'::public.user_role;

-- -----------------------------------------------------------------------------
-- 2. Enforce 1 Institutional Management Account Per Campus
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_management_per_campus
  ON public.profiles (campus_id)
  WHERE role = 'management'::public.user_role;

-- -----------------------------------------------------------------------------
-- 3. Lock Down Self-Registration Roles to ('student', 'faculty', 'staff', 'rmo')
-- -----------------------------------------------------------------------------
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
  p_is_teaching boolean DEFAULT false
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
    v_clean_is_teaching := false;
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
    v_clean_is_teaching := COALESCE(p_is_teaching, false);
  END IF;

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
      RAISE EXCEPTION 'Your Job Title was marked invalid by the admin. Please select a corrected Job Title.'
        USING ERRCODE = '22023';
    END IF;

    IF v_flags ? 'is_teaching'
       AND p_requested_role <> 'student'
       AND v_clean_is_teaching = COALESCE((v_snap ->> 'is_teaching')::boolean, false) THEN
      RAISE EXCEPTION 'Your Teaching Classes selection was marked invalid by the admin. Please select the corrected option.'
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

-- -----------------------------------------------------------------------------
-- 4. Update Operational Document, Route, Storage, Audit & Recipient Policies
--    Strictly ('faculty', 'staff', 'rmo') — `dept_head` removed
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_document(
  p_document_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user record;
  v_doc  record;
BEGIN
  IF p_document_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    role,
    campus_id,
    office_location,
    department,
    is_active,
    approval_status
  INTO v_user
  FROM public.profiles
  WHERE id = p_user_id
  LIMIT 1;

  IF NOT FOUND
     OR v_user.is_active IS DISTINCT FROM true
     OR v_user.approval_status IS DISTINCT FROM 'approved' THEN
    RETURN false;
  END IF;

  IF v_user.role = 'student' THEN
    RETURN false;
  END IF;

  SELECT
    id,
    origin_campus_id,
    current_campus_id,
    current_office,
    current_holder_id,
    created_by
  INTO v_doc
  FROM public.documents
  WHERE id = p_document_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Rule 1: System Admin & Institutional Management — University-Wide Read Oversight
  IF v_user.role IN ('superadmin', 'management') THEN
    RETURN true;
  END IF;

  -- Rule 2: Campus Admin — Campus-Travel Read Oversight
  IF v_user.role = 'campus_admin' THEN
    IF v_user.campus_id IS NULL THEN
      RETURN false;
    END IF;

    IF v_doc.origin_campus_id = v_user.campus_id
       OR v_doc.current_campus_id = v_user.campus_id THEN
      RETURN true;
    END IF;

    RETURN EXISTS (
      SELECT 1
      FROM public.document_routes r
      WHERE r.document_id = v_doc.id
        AND r.campus_id = v_user.campus_id
    );
  END IF;

  -- Rule 3: Operational Roles ('faculty', 'staff', 'rmo')
  IF v_user.role IN ('faculty', 'staff', 'rmo') THEN
    IF v_doc.created_by = p_user_id
       OR v_doc.current_holder_id = p_user_id THEN
      RETURN true;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.document_routes r
      WHERE r.document_id = v_doc.id
        AND (
          r.from_user_id = p_user_id
          OR r.to_user_id = p_user_id
          OR r.acted_by = p_user_id
        )
    ) THEN
      RETURN true;
    END IF;

    IF v_doc.current_holder_id IS NULL
       AND v_user.campus_id IS NOT NULL
       AND v_doc.current_campus_id = v_user.campus_id
       AND NULLIF(btrim(COALESCE(v_doc.current_office, '')), '') IS NOT NULL
       AND (
         (
           NULLIF(btrim(COALESCE(v_user.office_location, '')), '') IS NOT NULL
           AND lower(btrim(v_doc.current_office)) = lower(btrim(v_user.office_location))
         )
         OR (
           NULLIF(btrim(COALESCE(v_user.department, '')), '') IS NOT NULL
           AND lower(btrim(v_doc.current_office)) = lower(btrim(v_user.department))
         )
         OR (
           NULLIF(btrim(COALESCE(v_user.department, '')), '') IS NOT NULL
           AND NULLIF(btrim(COALESCE(v_user.office_location, '')), '') IS NOT NULL
           AND lower(btrim(v_doc.current_office)) = lower(
             btrim(v_user.department) || ' — ' || btrim(v_user.office_location)
           )
         )
       ) THEN
      RETURN true;
    END IF;

    RETURN false;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_document(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_document(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_document(uuid, uuid) TO authenticated;

-- Re-create clean INSERT/SELECT/UPDATE policies for ('faculty', 'staff', 'rmo')
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('documents', 'document_routes')
      AND cmd = 'INSERT'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I;',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END;
$$;

CREATE POLICY "documents_staff_insert"
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
        AND me.role IN ('faculty', 'staff', 'rmo')
        AND origin_campus_id = me.campus_id
    )
  );

DROP POLICY IF EXISTS "documents_authorized_read" ON public.documents;
CREATE POLICY "documents_authorized_read"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    (
      created_by = (SELECT auth.uid())
      AND private.current_user_role() IN ('faculty', 'staff', 'rmo')
    )
    OR public.can_access_document(id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "documents_authorized_update" ON public.documents;
CREATE POLICY "documents_authorized_update"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN ('faculty', 'staff', 'rmo')
    )
    AND (
      created_by = (SELECT auth.uid())
      OR public.can_access_document(id, (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN ('faculty', 'staff', 'rmo')
    )
  );

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
        AND me.role IN ('faculty', 'staff', 'rmo')
        AND (
          public.can_access_document(document_id, (SELECT auth.uid()))
          OR EXISTS (
            SELECT 1
            FROM public.documents d
            WHERE d.id = document_routes.document_id
              AND d.created_by = (SELECT auth.uid())
          )
        )
    )
  );

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
        AND me.role IN ('faculty', 'staff', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
    )
  );

DROP POLICY IF EXISTS "document_files_rmo_update" ON storage.objects;
CREATE POLICY "document_files_rmo_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN ('faculty', 'staff', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
    )
  )
  WITH CHECK (
    bucket_id = 'document-files'
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN ('faculty', 'staff', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
    )
  );

DROP POLICY IF EXISTS "document_files_rmo_delete" ON storage.objects;
CREATE POLICY "document_files_rmo_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      WHERE me.id = (SELECT auth.uid())
        AND me.is_active = true
        AND me.approval_status = 'approved'
        AND me.role IN ('faculty', 'staff', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
    )
  );

DROP POLICY IF EXISTS "audit_logs_authorized_read" ON public.audit_logs;
CREATE POLICY "audit_logs_authorized_read"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() = 'superadmin'
    OR (
      private.current_user_role() = 'management'
      AND (
        entity_type IN ('document', 'document_route', 'documents', 'document_routes')
        OR action ILIKE 'document%'
        OR action ILIKE '%sla%'
      )
    )
    OR (
      private.current_user_role() IN ('campus_admin', 'rmo')
      AND campus_id = private.current_user_campus_id()
    )
  );

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

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles me
    WHERE me.id = v_caller_id
      AND me.is_active = true
      AND me.approval_status = 'approved'
      AND me.role IN (
        'faculty'::public.user_role,
        'staff'::public.user_role,
        'rmo'::public.user_role
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
        'rmo'::public.user_role
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
        'rmo'::public.user_role
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
