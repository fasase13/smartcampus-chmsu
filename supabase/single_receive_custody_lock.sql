-- =============================================================================
-- SmartCampus CHMSU — Strict Single-Receive Per Custody Handoff Lock
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- What this migration enforces at the PostgreSQL trigger level on
-- `public.document_routes` (BEFORE INSERT):
--   1. Preserves the existing permanent lock on Processed (`completed` /
--      `processed` / `archived`) documents.
--   2. Restricts operational custody actions (`received`, `forwarded`,
--      `returned`, `completed`) strictly to active, approved operational
--      custodians (`faculty`, `staff`, `rmo`) — blocking `superadmin`,
--      `campus_admin`, `management`, and `student`.
--   3. No Duplicate Receive: blocks inserting a `received` route entry if the
--      parent document's status is already `received` (or if the latest
--      non-system route entry is already `received`).
--   4. Must Receive Before Acting: blocks inserting `forwarded`, `returned`,
--      or `completed` while the document has NOT yet been received in the
--      current handoff hop (`registered`, `in_transit`, `action_required`, or
--      latest non-system route is not `received`).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_single_receive_custody_flow()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_actor_role text;
  v_doc_status text;
  v_last_action text;
  v_action text := NEW.action::text;
  v_is_received boolean := false;
BEGIN
  -- Only enforce custody handoff rules on operational custody actions.
  -- System/initial actions (`registered`, `dispatched`, `delay_flagged`, `archived`)
  -- are governed by their own RLS policies / RPCs.
  IF v_action NOT IN ('received', 'forwarded', 'returned', 'completed') THEN
    RETURN NEW;
  END IF;

  -- Lock parent document row to serialize concurrent double-click submissions
  SELECT d.status::text
  INTO v_doc_status
  FROM public.documents d
  WHERE d.id = NEW.document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found.' USING ERRCODE = 'P0002';
  END IF;

  -- 1. Preserve permanent Processed lock
  IF v_doc_status IN ('completed', 'processed', 'archived') THEN
    RAISE EXCEPTION 'Processed documents are permanently locked in records and cannot be edited, re-routed, or deleted.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Strictly allow only active, approved operational custodians (faculty, staff, rmo)
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record document custody actions.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.role::text
  INTO v_actor_role
  FROM public.profiles p
  WHERE p.id = v_uid
    AND p.is_active = true
    AND p.approval_status = 'approved'
  LIMIT 1;

  IF v_actor_role IS NULL OR v_actor_role NOT IN ('faculty', 'staff', 'rmo') THEN
    RAISE EXCEPTION 'Only active Faculty, Staff, or RMO custodians may perform document custody actions.'
      USING ERRCODE = '42501';
  END IF;

  -- Determine latest non-system route action for this document
  SELECT r.action::text
  INTO v_last_action
  FROM public.document_routes r
  WHERE r.document_id = NEW.document_id
    AND r.action::text NOT IN ('delay_flagged')
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1;

  v_is_received := (
    v_doc_status IN ('received', 'in_review')
    OR v_last_action = 'received'
  );

  -- 3. No Duplicate Receive per handoff
  IF v_action = 'received' THEN
    IF v_is_received THEN
      RAISE EXCEPTION 'This document has already been received. You may only Forward, Return, or Mark as Processed.'
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  -- 4. Must Receive before Forward / Return / Mark as Processed
  IF v_action IN ('forwarded', 'returned', 'completed') THEN
    IF NOT v_is_received OR v_doc_status IN ('registered', 'in_transit', 'action_required') THEN
      RAISE EXCEPTION 'You must receive this document first before forwarding, returning, or marking it as processed.'
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_receive_custody ON public.document_routes;
CREATE TRIGGER trg_enforce_single_receive_custody
  BEFORE INSERT ON public.document_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_receive_custody_flow();
