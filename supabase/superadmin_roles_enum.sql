-- =============================================================================
-- SmartCampus CHMSU — Part A: Enum Role Migration (Run FIRST in SQL Editor)
-- Safely renames 'admin' -> 'superadmin' and adds 'campus_admin' on public.user_role.
-- PostgreSQL requires enum DDL to commit before new values are referenced in
-- functions, indexes, or RLS policies (Part B).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
      AND e.enumlabel = 'admin'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'user_role'
      AND e.enumlabel = 'superadmin'
  ) THEN
    ALTER TYPE public.user_role RENAME VALUE 'admin' TO 'superadmin';
  END IF;
END
$$;

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'campus_admin';
