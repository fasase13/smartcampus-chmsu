-- =============================================================================
-- SmartCampus CHMSU — Part B: Superadmin, 4 Campus Admins & Maintenance Mode
-- Run AFTER supabase/superadmin_roles_enum.sql. Safe to re-run (idempotent).
-- =============================================================================

-- =============================================================================
-- 1. Enforce Strictly 1 Active Campus Admin Per Campus & Disallow Self-Registering Admin Roles
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_active_campus_admin_per_campus
  ON public.profiles (campus_id)
  WHERE role = 'campus_admin' AND is_active = true;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_requested_role_not_admin_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_requested_role_not_admin_check
  CHECK (
    requested_role IS NULL
    OR requested_role NOT IN ('superadmin', 'campus_admin')
  );

-- =============================================================================
-- 2. System Maintenance Configuration Table (public.system_settings)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text NOT NULL DEFAULT 'SmartCampus CHMSU is currently undergoing scheduled system maintenance. Please check back shortly.',
  maintenance_updated_at timestamptz NOT NULL DEFAULT now(),
  maintenance_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.system_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON public.system_settings FROM anon, authenticated;
GRANT SELECT ON public.system_settings TO anon, authenticated;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_settings_public_read" ON public.system_settings;
CREATE POLICY "system_settings_public_read"
  ON public.system_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Add system_settings to Realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
  END IF;
END
$$;

-- Superadmin-only Maintenance Mode RPC
CREATE OR REPLACE FUNCTION public.set_maintenance_mode(
  p_enabled boolean,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_actor_role public.user_role;
  v_clean_message text;
  v_now timestamptz := now();
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

  IF v_actor_role IS DISTINCT FROM 'superadmin' THEN
    RAISE EXCEPTION 'Only the Superadmin may toggle System Maintenance Mode' USING ERRCODE = '42501';
  END IF;

  v_clean_message := NULLIF(trim(COALESCE(p_message, '')), '');

  UPDATE public.system_settings
  SET
    maintenance_mode = COALESCE(p_enabled, false),
    maintenance_message = COALESCE(v_clean_message, maintenance_message),
    maintenance_updated_at = v_now,
    maintenance_updated_by = v_uid
  WHERE id = 1;

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
    NULL,
    v_uid,
    'superadmin',
    CASE WHEN COALESCE(p_enabled, false) THEN 'maintenance_mode_enabled' ELSE 'maintenance_mode_disabled' END,
    'system',
    NULL,
    jsonb_build_object(
      'maintenance_mode', COALESCE(p_enabled, false),
      'maintenance_message', COALESCE(v_clean_message, (SELECT maintenance_message FROM public.system_settings WHERE id = 1)),
      'updated_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'maintenance_mode', COALESCE(p_enabled, false),
    'maintenance_updated_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_maintenance_mode(boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_maintenance_mode(boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_maintenance_mode(boolean, text) TO authenticated;

-- =============================================================================
-- 3. Update private.handle_new_user() & Registration RPCs
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
  v_email_local text;
  v_id_number text := NULL;
  v_department text := NULL;
  v_canonical_email text;
BEGIN
  v_canonical_email := private.canonicalize_email(NEW.email);
  v_email_local := trim(split_part(COALESCE(NEW.email, ''), '@', 1));

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
    -- Self-registration: never allow superadmin or campus_admin
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

-- Update Step 3 completion RPC to block superadmin and campus_admin requests
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

-- Update review_user_registration(...) for Superadmin (all campuses) & Campus Admin (own campus only)
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
  v_actor_campus_id uuid;
  v_target record;
  v_campus_name text;
  v_clean_reason text;
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
    RAISE EXCEPTION 'Only Superadmin or Campus Admin may review user registrations' USING ERRCODE = '42501';
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

  -- Campus Admin strict isolation checks
  IF v_actor_role = 'campus_admin' THEN
    IF v_target.campus_id IS DISTINCT FROM v_actor_campus_id THEN
      RAISE EXCEPTION 'Campus Admins may only review registrations belonging to their own campus' USING ERRCODE = '42501';
    END IF;

    IF p_decision = 'approve' THEN
      IF p_campus_id IS DISTINCT FROM v_actor_campus_id THEN
        RAISE EXCEPTION 'Campus Admins cannot transfer users to a different campus' USING ERRCODE = '42501';
      END IF;
      IF p_assigned_role IN ('superadmin', 'campus_admin') THEN
        RAISE EXCEPTION 'Campus Admins cannot assign superadmin or campus_admin roles' USING ERRCODE = '42501';
      END IF;
    END IF;
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
      v_actor_role,
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
      v_actor_role,
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

-- Update SLA Delay Check & Management Analytics RPCs for superadmin & campus_admin
CREATE OR REPLACE FUNCTION public.run_sla_delay_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_role public.user_role;
  v_doc record;
  v_flagged_ids uuid[] := ARRAY[]::uuid[];
  v_flagged_count integer := 0;
  v_origin_name text;
  v_current_name text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_uid
    AND is_active = true
    AND approval_status = 'approved'
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'campus_admin', 'management', 'rmo', 'dept_head') THEN
    RAISE EXCEPTION 'Insufficient privileges to run SLA delay check' USING ERRCODE = '42501';
  END IF;

  FOR v_doc IN
    SELECT
      d.id,
      d.tracking_code,
      d.title,
      d.origin_campus_id,
      d.current_campus_id,
      d.current_office,
      d.current_holder_id,
      d.due_at,
      d.sla_hours
    FROM public.documents d
    WHERE d.status NOT IN ('completed', 'archived')
      AND d.due_at IS NOT NULL
      AND d.due_at < now()
      AND d.is_delayed = false
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.documents
    SET
      is_delayed = true,
      delayed_at = now(),
      status = 'delayed',
      updated_at = now()
    WHERE id = v_doc.id;

    INSERT INTO public.document_routes (
      document_id, campus_id, from_office, to_office,
      from_user_id, to_user_id, acted_by, action, remarks, scanned_via_qr
    )
    VALUES (
      v_doc.id,
      v_doc.current_campus_id,
      v_doc.current_office,
      v_doc.current_office,
      v_doc.current_holder_id,
      v_doc.current_holder_id,
      v_uid,
      'delay_flagged',
      format(
        'Automatically flagged as overdue (SLA deadline %s exceeded).',
        to_char(v_doc.due_at AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY HH12:MI AM')
      ),
      false
    );

    SELECT name INTO v_origin_name FROM public.campuses WHERE id = v_doc.origin_campus_id;
    SELECT name INTO v_current_name FROM public.campuses WHERE id = v_doc.current_campus_id;

    INSERT INTO public.notifications (
      user_id, campus_id, document_id, type, title, message, is_read
    )
    SELECT DISTINCT
      recipients.user_id,
      v_doc.current_campus_id,
      v_doc.id,
      'delay_alert',
      format('SLA Delay Alert: %s', v_doc.tracking_code),
      format(
        '"%s" (%s -> %s, %s) has exceeded its %sh SLA deadline and is now flagged as Delayed.',
        v_doc.title,
        COALESCE(v_origin_name, 'CHMSU'),
        COALESCE(v_current_name, 'CHMSU'),
        v_doc.current_office,
        v_doc.sla_hours
      ),
      false
    FROM (
      SELECT v_doc.current_holder_id AS user_id
      WHERE v_doc.current_holder_id IS NOT NULL
      UNION
      SELECT p.id AS user_id
      FROM public.profiles p
      WHERE p.is_active = true
        AND (
          p.role = 'management'
          OR (p.role IN ('rmo', 'campus_admin') AND p.campus_id IN (v_doc.current_campus_id, v_doc.origin_campus_id))
        )
    ) AS recipients
    WHERE recipients.user_id IS NOT NULL;

    INSERT INTO public.audit_logs (
      campus_id, actor_id, actor_role, action, entity_type, entity_id, metadata
    )
    VALUES (
      v_doc.current_campus_id,
      v_uid,
      v_role,
      'document_delay_flagged',
      'document',
      v_doc.id,
      jsonb_build_object(
        'tracking_code', v_doc.tracking_code,
        'title', v_doc.title,
        'current_office', v_doc.current_office,
        'due_at', v_doc.due_at,
        'sla_hours', v_doc.sla_hours
      )
    );

    v_flagged_ids := array_append(v_flagged_ids, v_doc.id);
    v_flagged_count := v_flagged_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'flagged_count', v_flagged_count,
    'flagged_ids', to_jsonb(v_flagged_ids),
    'checked_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_management_analytics(
  p_campus_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_role public.user_role;
  v_summary jsonb;
  v_by_campus jsonb;
  v_bottlenecks jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_uid
    AND is_active = true
    AND approval_status = 'approved'
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'management') THEN
    RAISE EXCEPTION 'Insufficient privileges for management analytics' USING ERRCODE = '42501';
  END IF;

  WITH scoped AS (
    SELECT *
    FROM public.documents d
    WHERE p_campus_id IS NULL
       OR d.current_campus_id = p_campus_id
       OR d.origin_campus_id = p_campus_id
  )
  SELECT jsonb_build_object(
    'total_documents', COUNT(*),
    'active_documents', COUNT(*) FILTER (WHERE status NOT IN ('completed', 'archived')),
    'completed_documents', COUNT(*) FILTER (WHERE status = 'completed'),
    'delayed_documents', COUNT(*) FILTER (
      WHERE status NOT IN ('completed', 'archived')
        AND (is_delayed = true OR (due_at IS NOT NULL AND due_at < now()))
    ),
    'inter_campus_in_transit', COUNT(*) FILTER (
      WHERE origin_campus_id <> current_campus_id
        AND status NOT IN ('completed', 'archived')
    ),
    'on_time_rate', CASE
      WHEN COUNT(*) = 0 THEN 100
      ELSE ROUND(
        100.0 * COUNT(*) FILTER (
          WHERE NOT (
            is_delayed = true
            OR (status NOT IN ('completed', 'archived') AND due_at IS NOT NULL AND due_at < now())
          )
        ) / COUNT(*),
        1
      )
    END,
    'avg_turnaround_hours', COALESCE(
      ROUND(
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600.0)
        FILTER (WHERE completed_at IS NOT NULL),
        1
      ),
      0
    )
  )
  INTO v_summary
  FROM scoped;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'campus_id', c.id,
        'campus_code', c.code,
        'campus_name', c.name,
        'total', COALESCE(stats.total, 0),
        'active', COALESCE(stats.active, 0),
        'delayed', COALESCE(stats.delayed, 0)
      )
      ORDER BY c.is_main DESC, c.name ASC
    ),
    '[]'::jsonb
  )
  INTO v_by_campus
  FROM public.campuses c
  LEFT JOIN (
    SELECT
      current_campus_id,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status NOT IN ('completed', 'archived')) AS active,
      COUNT(*) FILTER (
        WHERE status NOT IN ('completed', 'archived')
          AND (is_delayed = true OR (due_at IS NOT NULL AND due_at < now()))
      ) AS delayed
    FROM public.documents
    GROUP BY current_campus_id
  ) stats ON stats.current_campus_id = c.id
  WHERE c.is_active = true;

  SELECT COALESCE(jsonb_agg(row_to_json(b)), '[]'::jsonb)
  INTO v_bottlenecks
  FROM (
    SELECT
      d.current_office AS office,
      c.name AS campus_name,
      COUNT(*) FILTER (WHERE d.status NOT IN ('completed', 'archived')) AS active_count,
      COUNT(*) FILTER (
        WHERE d.status NOT IN ('completed', 'archived')
          AND (d.is_delayed = true OR (d.due_at IS NOT NULL AND d.due_at < now()))
      ) AS overdue_count,
      ROUND(
        AVG(EXTRACT(EPOCH FROM (COALESCE(d.completed_at, now()) - d.created_at)) / 3600.0),
        1
      ) AS avg_holding_hours
    FROM public.documents d
    JOIN public.campuses c ON c.id = d.current_campus_id
    WHERE p_campus_id IS NULL OR d.current_campus_id = p_campus_id
    GROUP BY d.current_office, c.name
    ORDER BY overdue_count DESC, avg_holding_hours DESC
    LIMIT 10
  ) b;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'by_campus', v_by_campus,
    'top_bottlenecks', v_bottlenecks
  );
END;
$$;

-- =============================================================================
-- 4. Update Row-Level Security (RLS) Policies for Superadmin & Campus Admin
-- =============================================================================

-- 4.1 Campuses
DROP POLICY IF EXISTS "campuses_admin_manage" ON public.campuses;
CREATE POLICY "campuses_admin_manage"
  ON public.campuses FOR ALL
  TO authenticated
  USING (private.current_user_role() = 'superadmin')
  WITH CHECK (private.current_user_role() = 'superadmin');

-- 4.2 Profiles
DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;
CREATE POLICY "profiles_authenticated_read"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR private.current_user_role() IN ('superadmin', 'management')
    OR (
      private.current_user_role() = 'campus_admin'
      AND campus_id = private.current_user_campus_id()
    )
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

DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (private.current_user_role() = 'superadmin')
  WITH CHECK (private.current_user_role() = 'superadmin');

DROP POLICY IF EXISTS "profiles_campus_admin_update" ON public.profiles;
CREATE POLICY "profiles_campus_admin_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    private.current_user_role() = 'campus_admin'
    AND campus_id = private.current_user_campus_id()
    AND role NOT IN ('superadmin', 'campus_admin')
  )
  WITH CHECK (
    private.current_user_role() = 'campus_admin'
    AND campus_id = private.current_user_campus_id()
    AND role NOT IN ('superadmin', 'campus_admin')
  );

-- 4.3 Announcements
DROP POLICY IF EXISTS "announcements_authenticated_read" ON public.announcements;
CREATE POLICY "announcements_authenticated_read"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    private.is_active_user()
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR (
        private.current_user_role() = 'campus_admin'
        AND (campus_id IS NULL OR campus_id = private.current_user_campus_id())
      )
      OR author_id = (SELECT auth.uid())
      OR (
        is_active = true
        AND published_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
        AND (campus_id IS NULL OR campus_id = private.current_user_campus_id())
      )
    )
  );

DROP POLICY IF EXISTS "announcements_publisher_insert" ON public.announcements;
CREATE POLICY "announcements_publisher_insert"
  ON public.announcements FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND private.is_active_user()
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
        AND campus_id = private.current_user_campus_id()
      )
    )
  );

DROP POLICY IF EXISTS "announcements_publisher_update" ON public.announcements;
CREATE POLICY "announcements_publisher_update"
  ON public.announcements FOR UPDATE
  TO authenticated
  USING (
    private.current_user_role() = 'superadmin'
    OR (
      private.current_user_role() = 'management'
      AND (campus_id IS NULL OR campus_id = private.current_user_campus_id())
    )
    OR (
      private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head')
      AND campus_id = private.current_user_campus_id()
    )
    OR (
      author_id = (SELECT auth.uid())
      AND private.current_user_role() IN ('rmo', 'dept_head', 'faculty', 'staff')
    )
  )
  WITH CHECK (
    private.current_user_role() IN ('superadmin', 'management')
    OR (
      private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
      AND campus_id = private.current_user_campus_id()
    )
  );

DROP POLICY IF EXISTS "announcements_publisher_delete" ON public.announcements;
CREATE POLICY "announcements_publisher_delete"
  ON public.announcements FOR DELETE
  TO authenticated
  USING (
    private.current_user_role() = 'superadmin'
    OR (
      private.current_user_role() = 'campus_admin'
      AND campus_id = private.current_user_campus_id()
    )
    OR (
      author_id = (SELECT auth.uid())
      AND private.current_user_role() IN ('management', 'rmo', 'dept_head', 'faculty', 'staff')
    )
  );

-- 4.4 Documents
DROP POLICY IF EXISTS "documents_authorized_read" ON public.documents;
CREATE POLICY "documents_authorized_read"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() IN ('superadmin', 'management')
    OR (
      private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
      AND (
        origin_campus_id = private.current_user_campus_id()
        OR current_campus_id = private.current_user_campus_id()
        OR current_holder_id = (SELECT auth.uid())
        OR created_by = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "documents_rmo_admin_insert" ON public.documents;
CREATE POLICY "documents_rmo_admin_insert"
  ON public.documents FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    AND (
      private.current_user_role() = 'superadmin'
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo')
        AND origin_campus_id = private.current_user_campus_id()
      )
    )
  );

DROP POLICY IF EXISTS "documents_authorized_update" ON public.documents;
CREATE POLICY "documents_authorized_update"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    private.current_user_role() = 'superadmin'
    OR (
      private.current_user_role() IN ('campus_admin', 'rmo')
      AND (
        origin_campus_id = private.current_user_campus_id()
        OR current_campus_id = private.current_user_campus_id()
      )
    )
    OR (
      private.current_user_role() IN ('dept_head', 'faculty', 'staff', 'management')
      AND (
        current_campus_id = private.current_user_campus_id()
        OR current_holder_id = (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    private.current_user_role() IN ('superadmin', 'campus_admin', 'management', 'rmo', 'dept_head', 'faculty', 'staff')
  );

DROP POLICY IF EXISTS "documents_admin_delete" ON public.documents;
CREATE POLICY "documents_admin_delete"
  ON public.documents FOR DELETE
  TO authenticated
  USING (private.current_user_role() = 'superadmin');

-- 4.5 Document Routes
DROP POLICY IF EXISTS "document_routes_authorized_read" ON public.document_routes;
CREATE POLICY "document_routes_authorized_read"
  ON public.document_routes FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() IN ('superadmin', 'management')
    OR (
      private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
      AND EXISTS (
        SELECT 1
        FROM public.documents d
        WHERE d.id = document_routes.document_id
          AND (
            d.origin_campus_id = private.current_user_campus_id()
            OR d.current_campus_id = private.current_user_campus_id()
            OR d.current_holder_id = (SELECT auth.uid())
            OR d.created_by = (SELECT auth.uid())
          )
      )
    )
  );

DROP POLICY IF EXISTS "document_routes_authorized_insert" ON public.document_routes;
CREATE POLICY "document_routes_authorized_insert"
  ON public.document_routes FOR INSERT
  TO authenticated
  WITH CHECK (
    acted_by = (SELECT auth.uid())
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
        AND EXISTS (
          SELECT 1
          FROM public.documents d
          WHERE d.id = document_routes.document_id
            AND (
              d.origin_campus_id = private.current_user_campus_id()
              OR d.current_campus_id = private.current_user_campus_id()
              OR d.current_holder_id = (SELECT auth.uid())
            )
        )
      )
    )
  );

-- 4.6 Notifications
DROP POLICY IF EXISTS "notifications_self_read" ON public.notifications;
CREATE POLICY "notifications_self_read"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.current_user_role() = 'superadmin'
  );

DROP POLICY IF EXISTS "notifications_staff_insert" ON public.notifications;
CREATE POLICY "notifications_staff_insert"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    private.current_user_role() IN ('superadmin', 'campus_admin', 'management', 'rmo', 'dept_head', 'faculty', 'staff')
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR campus_id IS NULL
      OR campus_id = private.current_user_campus_id()
    )
  );

-- 4.7 Audit Logs
DROP POLICY IF EXISTS "audit_logs_authorized_read" ON public.audit_logs;
CREATE POLICY "audit_logs_authorized_read"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() IN ('superadmin', 'management')
    OR (
      private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head')
      AND campus_id = private.current_user_campus_id()
    )
  );

DROP POLICY IF EXISTS "audit_logs_authorized_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_authorized_insert"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = (SELECT auth.uid())
    AND actor_role = private.current_user_role()
    AND private.current_user_role() IN ('superadmin', 'campus_admin', 'management', 'rmo', 'dept_head', 'faculty', 'staff')
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR campus_id IS NULL
      OR campus_id = private.current_user_campus_id()
    )
  );

-- =============================================================================
-- 5. Update Storage Policies (`document-files` & `id-verifications`)
-- =============================================================================

DROP POLICY IF EXISTS "document_files_authorized_select" ON storage.objects;
CREATE POLICY "document_files_authorized_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() IN ('superadmin', 'management')
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo', 'dept_head', 'faculty', 'staff')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  );

DROP POLICY IF EXISTS "document_files_rmo_insert" ON storage.objects;
CREATE POLICY "document_files_rmo_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() = 'superadmin'
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  );

DROP POLICY IF EXISTS "document_files_rmo_update" ON storage.objects;
CREATE POLICY "document_files_rmo_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() = 'superadmin'
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() = 'superadmin'
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  );

DROP POLICY IF EXISTS "document_files_rmo_delete" ON storage.objects;
CREATE POLICY "document_files_rmo_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() = 'superadmin'
      OR (
        private.current_user_role() IN ('campus_admin', 'rmo')
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  );

-- `id-verifications`: Superadmin can view all; Campus Admin can view ONLY
-- registrants belonging to their own campus_id; Owner can view their own.
DROP POLICY IF EXISTS "id_verifications_admin_or_owner_select" ON storage.objects;
CREATE POLICY "id_verifications_admin_or_owner_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'id-verifications'
    AND (
      private.current_user_role() = 'superadmin'
      OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR (
        private.current_user_role() = 'campus_admin'
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id::text = (storage.foldername(name))[1]
            AND p.campus_id = private.current_user_campus_id()
        )
      )
    )
  );
