-- =============================================================================
-- SmartCampus CHMSU — Campus-Scoped Read-Only RLS for Institutional Management
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- Strict Campus-Scoping Rules Enforced:
--   - `superadmin` ONLY has university-wide oversight across all 4 campuses.
--   - `management` (1 account per campus) is strictly read-only AND strictly
--     scoped to its own assigned `campus_id`:
--       * `public.can_access_document`: allows `management` SELECT/QR-lookup
--         ONLY when `origin_campus_id = caller.campus_id`,
--         `current_campus_id = caller.campus_id`, OR a route in
--         `public.document_routes` touches `caller.campus_id`.
--       * `public.audit_logs`: allows `management` SELECT ONLY for
--         document-related logs where `campus_id = private.current_user_campus_id()`.
--       * `public.run_sla_delay_check()`: when called by `management`,
--         `campus_admin`, or `rmo`, evaluates ONLY documents touching their
--         assigned `campus_id` (university-wide remains `superadmin` only).
--       * Write blocks (`INSERT`/`UPDATE`/`DELETE`) on `public.documents`,
--         `public.document_routes`, and `storage.objects` (`document-files`)
--         remain strictly enforced for `management`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. public.can_access_document — Scope `management` to own campus_id only
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

  -- Rule 1: System Admin (superadmin) ONLY — University-Wide Oversight
  IF v_user.role = 'superadmin' THEN
    RETURN true;
  END IF;

  -- Rule 2: Campus Admin & Institutional Management — Strict Own-Campus Oversight
  IF v_user.role IN ('campus_admin', 'management') THEN
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

-- -----------------------------------------------------------------------------
-- 2. public.audit_logs — Restrict `management` to own campus + document logs
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "audit_logs_authorized_read" ON public.audit_logs;
CREATE POLICY "audit_logs_authorized_read"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() = 'superadmin'
    OR (
      private.current_user_role() = 'management'
      AND campus_id = private.current_user_campus_id()
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

-- -----------------------------------------------------------------------------
-- 3. storage.objects (`document-files`) — Campus-scoped SELECT for `management`
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "document_files_authorized_select" ON storage.objects;
CREATE POLICY "document_files_authorized_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() = 'superadmin'
      OR (
        private.current_user_role() IN ('campus_admin', 'management', 'rmo', 'faculty', 'staff')
        AND (
          (storage.foldername(name))[1] = private.current_user_campus_slug()
          OR EXISTS (
            SELECT 1
            FROM public.documents d
            WHERE d.file_path = storage.objects.name
              AND public.can_access_document(d.id, (SELECT auth.uid()))
          )
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 4. public.run_sla_delay_check() — Campus-scoped for `management` / non-superadmin
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_sla_delay_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_role public.user_role;
  v_campus_id uuid;
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

  SELECT role, campus_id INTO v_role, v_campus_id
  FROM public.profiles
  WHERE id = v_uid
    AND is_active = true
    AND approval_status = 'approved'
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('superadmin', 'campus_admin', 'management', 'rmo') THEN
    RAISE EXCEPTION 'Insufficient privileges to run SLA delay check' USING ERRCODE = '42501';
  END IF;

  IF v_role <> 'superadmin' AND v_campus_id IS NULL THEN
    RETURN jsonb_build_object(
      'flagged_count', 0,
      'flagged_ids', '[]'::jsonb,
      'checked_at', now()
    );
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
      AND (
        v_role = 'superadmin'
        OR d.origin_campus_id = v_campus_id
        OR d.current_campus_id = v_campus_id
      )
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
        '"%s" (%s -> %s, %s) has exceeded its %s-day SLA deadline and is now flagged as Delayed.',
        v_doc.title,
        COALESCE(v_origin_name, 'CHMSU'),
        COALESCE(v_current_name, 'CHMSU'),
        v_doc.current_office,
        GREATEST(1, ROUND(COALESCE(v_doc.sla_hours, 48) / 24.0))
      ),
      false
    FROM (
      SELECT v_doc.current_holder_id AS user_id
      WHERE v_doc.current_holder_id IS NOT NULL
      UNION
      SELECT p.id AS user_id
      FROM public.profiles p
      WHERE p.is_active = true
        AND p.approval_status = 'approved'
        AND (
          p.role = 'superadmin'
          OR (
            p.role IN ('campus_admin', 'management', 'rmo')
            AND p.campus_id IN (v_doc.origin_campus_id, v_doc.current_campus_id)
          )
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
      'document.sla_delay_flagged',
      'document',
      v_doc.id,
      jsonb_build_object(
        'tracking_code', v_doc.tracking_code,
        'title', v_doc.title,
        'current_office', v_doc.current_office,
        'due_at', v_doc.due_at
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

REVOKE ALL ON FUNCTION public.run_sla_delay_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_sla_delay_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.run_sla_delay_check() TO authenticated;
