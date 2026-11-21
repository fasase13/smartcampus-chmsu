-- =============================================================================
-- SmartCampus CHMSU — Clean Data Reset (Keep 4 Campuses + Admin Account Only)
-- Run this in the Supabase SQL Editor when you want to wipe all test/demo data
-- and start fresh with real data.
--
-- Keeps:
--   - public.campuses (the 4 CHMSU campuses)
--   - System Administrator account(s) (role = 'admin') in auth.users & public.profiles
--
-- Erases:
--   - All notifications, document_routes, documents, announcements, audit_logs
--   - All non-admin accounts in public.profiles and auth.users
--
-- Note on Storage buckets (`document-files` and `id-verifications`):
--   Supabase blocks direct SQL DELETE on storage.objects to avoid orphaned files.
--   After running this script, empty both buckets in:
--   Supabase Dashboard -> Storage -> [bucket] -> Empty bucket.
-- =============================================================================

BEGIN;

-- Safety guard: abort if no System Admin account exists
DO $$
DECLARE
  v_admin_count integer;
BEGIN
  SELECT COUNT(*) INTO v_admin_count
  FROM public.profiles
  WHERE role = 'admin'
    AND is_active = true;

  IF v_admin_count = 0 THEN
    RAISE EXCEPTION 'Reset aborted: no active admin account found in public.profiles.';
  END IF;
END
$$;

-- 1. Erase all transactional & content tables (respecting FK order)
DELETE FROM public.notifications;
DELETE FROM public.document_routes;
DELETE FROM public.documents;
DELETE FROM public.announcements;

-- 2. Temporarily disable immutability trigger to clear audit_logs, then re-enable it
ALTER TABLE public.audit_logs DISABLE TRIGGER trg_audit_logs_immutable;
DELETE FROM public.audit_logs;
ALTER TABLE public.audit_logs ENABLE TRIGGER trg_audit_logs_immutable;

-- 3. Remove all non-admin users from auth.users (cascades to public.profiles)
DELETE FROM auth.users
WHERE id NOT IN (
  SELECT id FROM public.profiles WHERE role = 'admin'
);

-- Clean up any leftover non-admin profiles just in case
DELETE FROM public.profiles
WHERE role <> 'admin';

-- 4. Ensure remaining admin profile(s) are active and approved
UPDATE public.profiles
SET
  is_active = true,
  approval_status = 'approved',
  reviewed_by = NULL,
  reviewed_at = NULL,
  rejection_reason = NULL
WHERE role = 'admin';

COMMIT;

-- Verification summary (should show 4 campuses, 0 docs/announcements/logs, and only admin user(s))
SELECT
  (SELECT COUNT(*) FROM public.campuses) AS campuses_remaining,
  (SELECT COUNT(*) FROM public.profiles) AS profiles_remaining,
  (SELECT COUNT(*) FROM auth.users) AS auth_users_remaining,
  (SELECT COUNT(*) FROM public.announcements) AS announcements_remaining,
  (SELECT COUNT(*) FROM public.documents) AS documents_remaining,
  (SELECT COUNT(*) FROM public.document_routes) AS routes_remaining,
  (SELECT COUNT(*) FROM public.notifications) AS notifications_remaining,
  (SELECT COUNT(*) FROM public.audit_logs) AS audit_logs_remaining;
