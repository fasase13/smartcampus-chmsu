-- =============================================================================
-- SmartCampus CHMSU — Sprint 4 Migration: Automated SLA Delay Alerts & Analytics
-- Run this file in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================

-- 1. Automated SLA Delay Detection RPC
--    Executable ONLY by authenticated users with role in ('admin', 'management', 'rmo', 'dept_head').
--    Flags overdue active documents, appends 'delay_flagged' to document_routes,
--    dispatches Realtime notifications to current holder + management + campus RMOs,
--    and records immutable 'document_delay_flagged' entries in audit_logs.
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
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'management', 'rmo', 'dept_head') THEN
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
    -- 1. Mark document as delayed
    UPDATE public.documents
    SET
      is_delayed = true,
      delayed_at = now(),
      status = 'delayed',
      updated_at = now()
    WHERE id = v_doc.id;

    -- 2. Append delay_flagged entry to document_routes
    INSERT INTO public.document_routes (
      document_id,
      campus_id,
      from_office,
      to_office,
      from_user_id,
      to_user_id,
      acted_by,
      action,
      remarks,
      scanned_via_qr
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

    -- 3. Notify current holder (if set), all active management users, and campus RMOs (deduplicated)
    INSERT INTO public.notifications (
      user_id,
      campus_id,
      document_id,
      type,
      title,
      message,
      is_read
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
          OR (p.role = 'rmo' AND p.campus_id IN (v_doc.current_campus_id, v_doc.origin_campus_id))
        )
    ) AS recipients
    WHERE recipients.user_id IS NOT NULL;

    -- 4. Write immutable audit log entry
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

REVOKE ALL ON FUNCTION public.run_sla_delay_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_sla_delay_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.run_sla_delay_check() TO authenticated;

-- 2. Management Multi-Campus Analytics RPC
--    Strictly restricted to active 'admin' and 'management' users.
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
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'management') THEN
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

  SELECT COALESCE(
    jsonb_agg(row_to_json(b)),
    '[]'::jsonb
  )
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

REVOKE ALL ON FUNCTION public.get_management_analytics(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_management_analytics(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_management_analytics(uuid) TO authenticated;
