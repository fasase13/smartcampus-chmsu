-- =============================================================================
-- SmartCampus CHMSU — Forgot Password Eligibility Lookup (Anti-Enumeration)
-- Run this file in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================
-- Allows POST /api/auth/forgot-password (unauthenticated / anon) to resolve
-- an eligible regular user's Auth email from either an 8-digit School ID or
-- an Email address WITHOUT exposing public.profiles or public.banned_emails
-- to anon, and WITHOUT allowing password resets for superadmin, campus_admin,
-- rejected, or permanently banned accounts.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_password_reset_eligibility(
  p_identifier text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trimmed   text;
  v_canonical text;
  v_rec       RECORD;
BEGIN
  v_trimmed := btrim(COALESCE(p_identifier, ''));
  IF v_trimmed = '' THEN
    RETURN NULL;
  END IF;

  IF v_trimmed ~ '^[0-9]{8}$' THEN
    SELECT
      u.email AS auth_email,
      p.email AS profile_email,
      p.canonical_email,
      p.role,
      p.approval_status
    INTO v_rec
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE btrim(p.employee_or_student_id) = v_trimmed
    LIMIT 1;
  ELSE
    v_canonical := private.canonicalize_email(v_trimmed);
    SELECT
      u.email AS auth_email,
      p.email AS profile_email,
      p.canonical_email,
      p.role,
      p.approval_status
    INTO v_rec
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE (v_canonical IS NOT NULL AND p.canonical_email = v_canonical)
       OR lower(u.email) = lower(v_trimmed)
       OR lower(p.email) = lower(v_trimmed)
    LIMIT 1;
  END IF;

  IF NOT FOUND OR v_rec.auth_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- Strictly block Admin accounts from public password reset
  IF v_rec.role IN ('superadmin', 'campus_admin') THEN
    RETURN NULL;
  END IF;

  -- Strictly block rejected or permanently banned accounts
  IF v_rec.approval_status = 'rejected' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.banned_emails b
    WHERE b.canonical_email = COALESCE(
      v_rec.canonical_email,
      private.canonicalize_email(v_rec.auth_email)
    )
  ) THEN
    RETURN NULL;
  END IF;

  RETURN v_rec.auth_email;
END;
$$;

REVOKE ALL ON FUNCTION public.check_password_reset_eligibility(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_password_reset_eligibility(text) TO anon, authenticated;
