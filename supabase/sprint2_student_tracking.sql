-- =============================================================================
-- SmartCampus CHMSU — Sprint 2 Migration: Private Student Document ID Lookup
-- Run this file in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================

-- Index to ensure fast case-insensitive exact tracking code lookups
CREATE INDEX IF NOT EXISTS idx_documents_tracking_code_upper
  ON public.documents (upper(tracking_code));

-- SECURITY DEFINER RPC for authenticated private document tracking.
-- Enforces RA 10173:
--   1. Executable ONLY by authenticated active users (revoked from PUBLIC and anon).
--   2. Requires exact case-insensitive tracking_code match (prevents browsing).
--   3. Blocks confidential documents for student accounts without leaking existence.
--   4. Returns ONLY student-safe fields and sanitized custody timeline
--      (omits internal staff remarks, staff names/emails, and file paths).
CREATE OR REPLACE FUNCTION public.lookup_document_by_tracking_code(
  p_tracking_code text
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
  v_code text;
  v_doc record;
  v_timeline jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_uid
    AND is_active = true
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN NULL;
  END IF;

  v_code := upper(trim(COALESCE(p_tracking_code, '')));
  IF char_length(v_code) < 6 THEN
    RETURN NULL;
  END IF;

  SELECT
    d.id,
    d.tracking_code,
    d.title,
    d.document_type,
    d.priority,
    d.status,
    d.current_office,
    d.is_delayed,
    d.due_at,
    d.created_at,
    d.updated_at,
    d.completed_at,
    oc.name AS origin_campus_name,
    cc.name AS current_campus_name
  INTO v_doc
  FROM public.documents d
  JOIN public.campuses oc ON oc.id = d.origin_campus_id
  JOIN public.campuses cc ON cc.id = d.current_campus_id
  WHERE upper(trim(d.tracking_code)) = v_code
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Never expose confidential documents to students (return NULL to avoid existence leak)
  IF v_role = 'student' AND v_doc.priority = 'confidential' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'action', r.action,
        'from_office', r.from_office,
        'to_office', r.to_office,
        'campus_name', c.name,
        'created_at', r.created_at
      )
      ORDER BY r.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_timeline
  FROM public.document_routes r
  JOIN public.campuses c ON c.id = r.campus_id
  WHERE r.document_id = v_doc.id;

  RETURN jsonb_build_object(
    'tracking_code', v_doc.tracking_code,
    'title', v_doc.title,
    'document_type', v_doc.document_type,
    'status', v_doc.status,
    'origin_campus_name', v_doc.origin_campus_name,
    'current_campus_name', v_doc.current_campus_name,
    'current_office', v_doc.current_office,
    'is_delayed', v_doc.is_delayed,
    'due_at', v_doc.due_at,
    'created_at', v_doc.created_at,
    'updated_at', v_doc.updated_at,
    'completed_at', v_doc.completed_at,
    'timeline', v_timeline
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_document_by_tracking_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_document_by_tracking_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_document_by_tracking_code(text) TO authenticated;
