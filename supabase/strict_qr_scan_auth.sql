-- =============================================================================
-- SmartCampus CHMSU — Strict Role-Based Document QR Scanning & Lookup Auth
-- Run this file in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================
-- Enforces strict authorization across all non-student portals:
--   1. superadmin   : Full bypass across all 4 CHMSU campuses.
--   2. campus_admin : Campus-travel bypass (origin_campus_id, current_campus_id,
--                     OR any document_routes.campus_id matching admin's campus_id).
--   3. faculty, staff, dept_head, rmo, management:
--                     Strict sender/recipient ONLY (created_by, current_holder_id,
--                     from_user_id/to_user_id/acted_by in document_routes, OR
--                     active office-level routing matching campus_id + office/dept
--                     when current_holder_id IS NULL).
--   4. student      : Strictly denied (false).
-- =============================================================================

-- 1. Core Authorization Helper (SECURITY DEFINER prevents RLS recursion)
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

  -- Students have zero document tracking / QR scanning access
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

  -- Rule 1: System Admin (superadmin) — Full University-Wide Bypass
  IF v_user.role = 'superadmin' THEN
    RETURN true;
  END IF;

  -- Rule 2: Campus Admin — Campus-Travel Bypass (Origin, Current, or Route History)
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

  -- Rule 3: Regular Non-Student Roles (faculty, staff, dept_head, rmo, management)
  -- Strictly authorized ONLY if sent by them or sent to them.
  IF v_user.role IN ('faculty', 'staff', 'dept_head', 'rmo', 'management') THEN
    -- Direct creator or active individual holder
    IF v_doc.created_by = p_user_id
       OR v_doc.current_holder_id = p_user_id THEN
      RETURN true;
    END IF;

    -- Sent by them or addressed to them in document routing history
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

    -- Office-level routing without a specific individual recipient:
    -- must strictly match user's assigned campus_id AND office/department
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

-- 2. Authorized QR Token / Tracking Code Lookup RPC (Zero Leakage on Unauthorized)
CREATE OR REPLACE FUNCTION public.lookup_authorized_document(
  p_query text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid;
  v_clean text;
  v_doc   public.documents%ROWTYPE;
  v_routes jsonb;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  v_clean := btrim(COALESCE(p_query, ''));
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;

  IF v_clean ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT *
    INTO v_doc
    FROM public.documents
    WHERE qr_token = v_clean::uuid
    LIMIT 1;
  ELSE
    SELECT *
    INTO v_doc
    FROM public.documents
    WHERE lower(tracking_code) = lower(v_clean)
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Enforce strict role-based authorization without leaking existence
  IF NOT public.can_access_document(v_doc.id, v_uid) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'campus_id', r.campus_id,
        'from_office', r.from_office,
        'to_office', r.to_office,
        'action', r.action,
        'remarks', r.remarks,
        'scanned_via_qr', r.scanned_via_qr,
        'created_at', r.created_at,
        'actor', CASE
          WHEN a.id IS NOT NULL THEN jsonb_build_object(
            'full_name', a.full_name,
            'role', a.role
          )
          ELSE NULL
        END
      )
      ORDER BY r.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_routes
  FROM public.document_routes r
  LEFT JOIN public.profiles a ON a.id = r.acted_by
  WHERE r.document_id = v_doc.id;

  RETURN jsonb_build_object(
    'document', to_jsonb(v_doc),
    'routes', v_routes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_authorized_document(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_authorized_document(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lookup_authorized_document(text) TO authenticated;

-- 3. Enforce Strict RLS on public.documents (Read + Custody Mutations)
DROP POLICY IF EXISTS "documents_authorized_read" ON public.documents;
CREATE POLICY "documents_authorized_read"
  ON public.documents FOR SELECT
  TO authenticated
  USING (public.can_access_document(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "documents_authorized_update" ON public.documents;
CREATE POLICY "documents_authorized_update"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (public.can_access_document(id, (SELECT auth.uid())))
  WITH CHECK (
    private.current_user_role() IN (
      'superadmin',
      'campus_admin',
      'management',
      'rmo',
      'dept_head',
      'faculty',
      'staff'
    )
  );

-- 4. Enforce Strict RLS on public.document_routes (Read + Append-Only Custody Actions)
DROP POLICY IF EXISTS "document_routes_authorized_read" ON public.document_routes;
CREATE POLICY "document_routes_authorized_read"
  ON public.document_routes FOR SELECT
  TO authenticated
  USING (public.can_access_document(document_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "document_routes_authorized_insert" ON public.document_routes;
CREATE POLICY "document_routes_authorized_insert"
  ON public.document_routes FOR INSERT
  TO authenticated
  WITH CHECK (
    acted_by = (SELECT auth.uid())
    AND public.can_access_document(document_id, (SELECT auth.uid()))
  );

-- 5. Supporting indexes for fast campus_admin & sender/recipient route lookups
CREATE INDEX IF NOT EXISTS idx_document_routes_doc_campus
  ON public.document_routes (document_id, campus_id);

CREATE INDEX IF NOT EXISTS idx_document_routes_doc_users
  ON public.document_routes (document_id, from_user_id, to_user_id, acted_by);
