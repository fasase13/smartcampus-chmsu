-- =============================================================================
-- SmartCampus CHMSU — Universal Sign In & Sign Out Audit Logging RPC
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- What this migration does:
--   Creates SECURITY DEFINER RPC `public.log_auth_activity(p_event, p_portal)`
--   so EVERY authenticated role (`superadmin`, `campus_admin`, `management`,
--   `rmo`, `faculty`, `staff`, `student`) records immutable Sign In and
--   Sign Out events into `public.audit_logs` with full_name, email, role,
--   campus_id, and portal context.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_auth_activity(
  p_event text,
  p_portal text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_clean_event text := lower(btrim(COALESCE(p_event, '')));
  v_clean_portal text := NULLIF(btrim(COALESCE(p_portal, '')), '');
  v_profile record;
  v_action text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_clean_event NOT IN ('sign_in', 'sign_out') THEN
    RAISE EXCEPTION 'Invalid auth event; expected sign_in or sign_out' USING ERRCODE = '22023';
  END IF;

  SELECT
    id,
    full_name,
    email,
    role,
    campus_id
  INTO v_profile
  FROM public.profiles
  WHERE id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  END IF;

  v_action := CASE
    WHEN v_clean_event = 'sign_in' THEN 'auth.sign_in'
    ELSE 'auth.sign_out'
  END;

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
    v_profile.campus_id,
    v_uid,
    v_profile.role,
    v_action,
    'auth',
    v_uid,
    jsonb_build_object(
      'email', v_profile.email,
      'role', v_profile.role::text,
      'full_name', v_profile.full_name,
      'portal', v_clean_portal
    )
  );

  RETURN jsonb_build_object('ok', true, 'action', v_action);
END;
$$;

REVOKE ALL ON FUNCTION public.log_auth_activity(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_auth_activity(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_auth_activity(text, text) TO authenticated;
