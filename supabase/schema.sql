-- =============================================================================
-- SmartCampus CHMSU — Production Database Schema, RLS, Realtime & Storage
-- Carlos Hilado Memorial State University (4 Campuses)
-- Run this file FIRST in the Supabase SQL Editor, then run supabase/seed.sql.
-- =============================================================================

-- 1. Extensions & Non-Exposed Private Schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

-- 2. Custom Enum Types (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM (
      'admin',
      'rmo',
      'dept_head',
      'faculty',
      'staff',
      'management',
      'student'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'availability_status') THEN
    CREATE TYPE public.availability_status AS ENUM (
      'available',
      'in_class',
      'in_meeting',
      'on_leave',
      'offline'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'announcement_category') THEN
    CREATE TYPE public.announcement_category AS ENUM (
      'general',
      'academic',
      'calendar',
      'emergency',
      'event'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'announcement_priority') THEN
    CREATE TYPE public.announcement_priority AS ENUM (
      'normal',
      'high',
      'urgent'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status') THEN
    CREATE TYPE public.document_status AS ENUM (
      'registered',
      'in_transit',
      'received',
      'in_review',
      'action_required',
      'completed',
      'archived',
      'delayed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_priority') THEN
    CREATE TYPE public.document_priority AS ENUM (
      'routine',
      'urgent',
      'confidential'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'route_action') THEN
    CREATE TYPE public.route_action AS ENUM (
      'registered',
      'dispatched',
      'received',
      'forwarded',
      'returned',
      'completed',
      'archived',
      'delay_flagged'
    );
  END IF;
END
$$;

-- =============================================================================
-- 3. Normalized Core Tables (7 Tables)
-- =============================================================================

-- 3.1 Campuses
CREATE TABLE IF NOT EXISTS public.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 2 AND 10),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name text NOT NULL UNIQUE,
  address text,
  contact_email text,
  is_main boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.2 Profiles (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses(id) ON DELETE RESTRICT,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  role public.user_role NOT NULL DEFAULT 'student',
  department text,
  job_title text,
  office_location text,
  employee_or_student_id text,
  availability_status public.availability_status NOT NULL DEFAULT 'offline',
  availability_note text CHECK (availability_note IS NULL OR char_length(availability_note) <= 200),
  availability_updated_at timestamptz NOT NULL DEFAULT now(),
  show_on_kiosk boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.3 Announcements (Campus-scoped or University-wide when campus_id IS NULL)
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid REFERENCES public.campuses(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(trim(title)) >= 3),
  body text NOT NULL CHECK (char_length(trim(body)) >= 3),
  category public.announcement_category NOT NULL DEFAULT 'general',
  priority public.announcement_priority NOT NULL DEFAULT 'normal',
  is_public boolean NOT NULL DEFAULT true,
  is_pinned boolean NOT NULL DEFAULT false,
  event_start_at timestamptz,
  event_end_at timestamptz,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_event_window_valid CHECK (
    event_end_at IS NULL OR event_start_at IS NULL OR event_end_at >= event_start_at
  ),
  CONSTRAINT announcements_expiry_valid CHECK (
    expires_at IS NULL OR expires_at > published_at
  )
);

-- 3.4 Documents (QR-tracked official documents — strictly private, never on kiosk)
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text NOT NULL UNIQUE CHECK (char_length(trim(tracking_code)) >= 6),
  qr_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  origin_campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE RESTRICT,
  current_campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(trim(title)) >= 3),
  description text,
  document_type text NOT NULL CHECK (char_length(trim(document_type)) >= 2),
  priority public.document_priority NOT NULL DEFAULT 'routine',
  status public.document_status NOT NULL DEFAULT 'registered',
  sender_name text NOT NULL,
  sender_office text,
  current_office text NOT NULL,
  current_holder_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  file_path text,
  file_name text,
  file_mime_type text,
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  sla_hours integer NOT NULL DEFAULT 48 CHECK (sla_hours > 0 AND sla_hours <= 720),
  due_at timestamptz,
  is_delayed boolean NOT NULL DEFAULT false,
  delayed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.5 Document Routes (Append-only custody / QR handoff trail)
CREATE TABLE IF NOT EXISTS public.document_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE RESTRICT,
  from_office text,
  to_office text NOT NULL,
  from_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  acted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action public.route_action NOT NULL,
  remarks text,
  scanned_via_qr boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.6 Notifications (Real-time delay alerts & handoff alerts)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campus_id uuid REFERENCES public.campuses(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (
    type IN ('document_assigned', 'document_forwarded', 'delay_alert', 'announcement', 'system')
  ),
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.7 Audit Logs (Strictly append-only, immutable compliance trail)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid REFERENCES public.campuses(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role public.user_role,
  action text NOT NULL CHECK (char_length(trim(action)) >= 3),
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4. Performance Indexes (Foreign Keys, RLS Predicates & Query Patterns)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_profiles_campus_role
  ON public.profiles (campus_id, role)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_profiles_kiosk_availability
  ON public.profiles (campus_id, availability_status)
  WHERE is_active = true AND show_on_kiosk = true AND role IN ('faculty', 'dept_head');

CREATE INDEX IF NOT EXISTS idx_announcements_public_feed
  ON public.announcements (campus_id, is_pinned DESC, published_at DESC)
  WHERE is_active = true AND is_public = true;

CREATE INDEX IF NOT EXISTS idx_announcements_author
  ON public.announcements (author_id);

CREATE INDEX IF NOT EXISTS idx_documents_current_campus_status
  ON public.documents (current_campus_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_origin_campus
  ON public.documents (origin_campus_id);

CREATE INDEX IF NOT EXISTS idx_documents_current_holder
  ON public.documents (current_holder_id)
  WHERE current_holder_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_delayed_active
  ON public.documents (current_campus_id, due_at)
  WHERE is_delayed = true AND status NOT IN ('completed', 'archived');

CREATE INDEX IF NOT EXISTS idx_document_routes_document_created
  ON public.document_routes (document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_routes_campus
  ON public.document_routes (campus_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_campus_created
  ON public.audit_logs (campus_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (entity_type, entity_id, created_at DESC);

-- =============================================================================
-- 5. Triggers: Timestamps, Auth Signup Profile Sync, Audit Immutability
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campuses_updated_at ON public.campuses;
CREATE TRIGGER trg_campuses_updated_at
  BEFORE UPDATE ON public.campuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_documents_updated_at ON public.documents;
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Automatically stamp availability_updated_at when availability changes
CREATE OR REPLACE FUNCTION public.track_availability_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.availability_status IS DISTINCT FROM OLD.availability_status
     OR NEW.availability_note IS DISTINCT FROM OLD.availability_note THEN
    NEW.availability_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_availability_updated ON public.profiles;
CREATE TRIGGER trg_profiles_availability_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.track_availability_timestamp();

-- Automatically create a public.profiles row whenever a Supabase Auth user signs up.
-- Security: only reads role from app_metadata (admin-controlled), never trusting
-- user-editable user_metadata for privilege escalation; defaults safely to 'student'.
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role := 'student';
  v_app_role text;
  v_campus_id uuid;
  v_campus_slug text;
  v_full_name text;
BEGIN
  v_app_role := NEW.raw_app_meta_data ->> 'role';
  IF v_app_role IN ('admin', 'rmo', 'dept_head', 'faculty', 'staff', 'management', 'student') THEN
    v_role := v_app_role::public.user_role;
  END IF;

  -- Resolve campus_id from app_metadata, then user_metadata campus_slug, else Main campus
  IF (NEW.raw_app_meta_data ->> 'campus_id') IS NOT NULL THEN
    v_campus_id := (NEW.raw_app_meta_data ->> 'campus_id')::uuid;
  ELSE
    v_campus_slug := COALESCE(
      NEW.raw_app_meta_data ->> 'campus_slug',
      NEW.raw_user_meta_data ->> 'campus_slug',
      'talisay'
    );
    SELECT id INTO v_campus_id
    FROM public.campuses
    WHERE slug = v_campus_slug
    LIMIT 1;
  END IF;

  v_full_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    split_part(COALESCE(NEW.email, 'user@chmsu.edu.ph'), '@', 1)
  );

  INSERT INTO public.profiles (
    id,
    campus_id,
    email,
    full_name,
    role,
    department,
    show_on_kiosk
  )
  VALUES (
    NEW.id,
    v_campus_id,
    COALESCE(NEW.email, NEW.id::text || '@chmsu.local'),
    v_full_name,
    v_role,
    NULLIF(trim(NEW.raw_user_meta_data ->> 'department'), ''),
    v_role IN ('faculty', 'dept_head')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

-- Enforce hard immutability on audit_logs (blocks UPDATE and DELETE at the DB level)
CREATE OR REPLACE FUNCTION private.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is strictly append-only; % operations are prohibited', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION private.prevent_audit_log_mutation();

-- =============================================================================
-- 6. Private RLS Helper Functions (Not exposed on PostgREST API)
-- =============================================================================

CREATE OR REPLACE FUNCTION private.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
    AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.current_user_campus_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT campus_id
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
    AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.current_user_campus_slug()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.slug
  FROM public.profiles p
  JOIN public.campuses c ON c.id = p.campus_id
  WHERE p.id = (SELECT auth.uid())
    AND p.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true
  );
$$;

REVOKE ALL ON FUNCTION private.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_user_campus_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_user_campus_slug() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_active_user() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_campus_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_user_campus_slug() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_user() TO authenticated;

-- =============================================================================
-- 7. Public Kiosk Safe View (RA 10173 — zero PII exposed to anon)
-- =============================================================================

CREATE OR REPLACE VIEW public.public_faculty_availability
WITH (security_invoker = true) AS
SELECT
  id,
  campus_id,
  full_name,
  department,
  job_title,
  office_location,
  availability_status,
  availability_note,
  availability_updated_at
FROM public.profiles
WHERE role IN ('faculty', 'dept_head')
  AND is_active = true
  AND show_on_kiosk = true;

-- =============================================================================
-- 8. Explicit Table & Column Privileges (Defense-in-Depth)
-- =============================================================================

-- Public (anon) gets ONLY active campuses, public announcements, and
-- non-PII faculty availability columns. Zero access to private tables.
REVOKE ALL ON public.campuses FROM anon;
GRANT SELECT ON public.campuses TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.campuses TO authenticated;

REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT (
  id,
  campus_id,
  full_name,
  role,
  department,
  job_title,
  office_location,
  availability_status,
  availability_note,
  availability_updated_at,
  show_on_kiosk,
  is_active
) ON public.profiles TO anon;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.public_faculty_availability TO anon, authenticated;

REVOKE ALL ON public.announcements FROM anon;
GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.announcements TO authenticated;

REVOKE ALL ON public.documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;

REVOKE ALL ON public.document_routes FROM anon;
GRANT SELECT, INSERT ON public.document_routes TO authenticated;

REVOKE ALL ON public.notifications FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;

REVOKE ALL ON public.audit_logs FROM anon;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;

-- =============================================================================
-- 9. Row-Level Security (RLS) Policies
-- =============================================================================

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 9.1 Campuses Policies
DROP POLICY IF EXISTS "campuses_public_read" ON public.campuses;
CREATE POLICY "campuses_public_read"
  ON public.campuses FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "campuses_admin_manage" ON public.campuses;
CREATE POLICY "campuses_admin_manage"
  ON public.campuses FOR ALL
  TO authenticated
  USING (private.current_user_role() = 'admin')
  WITH CHECK (private.current_user_role() = 'admin');

-- 9.2 Profiles Policies
DROP POLICY IF EXISTS "profiles_anon_kiosk_availability" ON public.profiles;
CREATE POLICY "profiles_anon_kiosk_availability"
  ON public.profiles FOR SELECT
  TO anon
  USING (
    role IN ('faculty', 'dept_head')
    AND is_active = true
    AND show_on_kiosk = true
  );

DROP POLICY IF EXISTS "profiles_authenticated_read" ON public.profiles;
CREATE POLICY "profiles_authenticated_read"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR private.current_user_role() IN ('admin', 'management')
    OR (
      private.current_user_role() IN ('rmo', 'dept_head', 'faculty', 'staff')
      AND campus_id = private.current_user_campus_id()
      AND is_active = true
    )
    OR (
      -- Students can view public faculty availability within their own campus
      private.current_user_role() = 'student'
      AND campus_id = private.current_user_campus_id()
      AND role IN ('faculty', 'dept_head')
      AND is_active = true
      AND show_on_kiosk = true
    )
  );

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()) AND is_active = true)
  WITH CHECK (
    id = (SELECT auth.uid())
    AND role = private.current_user_role()
    AND campus_id IS NOT DISTINCT FROM private.current_user_campus_id()
    AND is_active = true
  );

DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (private.current_user_role() = 'admin')
  WITH CHECK (private.current_user_role() = 'admin');

-- 9.3 Announcements Policies
DROP POLICY IF EXISTS "announcements_anon_public_read" ON public.announcements;
CREATE POLICY "announcements_anon_public_read"
  ON public.announcements FOR SELECT
  TO anon
  USING (
    is_active = true
    AND is_public = true
    AND published_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
  );

DROP POLICY IF EXISTS "announcements_authenticated_read" ON public.announcements;
CREATE POLICY "announcements_authenticated_read"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() IN ('admin', 'management')
    OR author_id = (SELECT auth.uid())
    OR (
      is_active = true
      AND published_at <= now()
      AND (expires_at IS NULL OR expires_at > now())
      AND (campus_id IS NULL OR campus_id = private.current_user_campus_id())
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
      private.current_user_role() IN ('admin', 'management')
      OR (
        private.current_user_role() IN ('rmo', 'dept_head', 'faculty', 'staff')
        AND campus_id = private.current_user_campus_id()
      )
    )
  );

DROP POLICY IF EXISTS "announcements_publisher_update" ON public.announcements;
CREATE POLICY "announcements_publisher_update"
  ON public.announcements FOR UPDATE
  TO authenticated
  USING (
    private.current_user_role() = 'admin'
    OR (
      private.current_user_role() = 'management'
      AND (campus_id IS NULL OR campus_id = private.current_user_campus_id())
    )
    OR (
      author_id = (SELECT auth.uid())
      AND private.current_user_role() IN ('rmo', 'dept_head', 'faculty', 'staff')
    )
    OR (
      private.current_user_role() IN ('rmo', 'dept_head')
      AND campus_id = private.current_user_campus_id()
    )
  )
  WITH CHECK (
    private.current_user_role() IN ('admin', 'management')
    OR (
      private.current_user_role() IN ('rmo', 'dept_head', 'faculty', 'staff')
      AND campus_id = private.current_user_campus_id()
    )
  );

DROP POLICY IF EXISTS "announcements_publisher_delete" ON public.announcements;
CREATE POLICY "announcements_publisher_delete"
  ON public.announcements FOR DELETE
  TO authenticated
  USING (
    private.current_user_role() = 'admin'
    OR (
      author_id = (SELECT auth.uid())
      AND private.current_user_role() IN ('management', 'rmo', 'dept_head', 'faculty', 'staff')
    )
  );

-- 9.4 Documents Policies (Strictly private — ZERO anon or student access)
DROP POLICY IF EXISTS "documents_authorized_read" ON public.documents;
CREATE POLICY "documents_authorized_read"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() IN ('admin', 'management')
    OR (
      private.current_user_role() IN ('rmo', 'dept_head', 'faculty', 'staff')
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
      private.current_user_role() = 'admin'
      OR (
        private.current_user_role() = 'rmo'
        AND origin_campus_id = private.current_user_campus_id()
      )
    )
  );

DROP POLICY IF EXISTS "documents_authorized_update" ON public.documents;
CREATE POLICY "documents_authorized_update"
  ON public.documents FOR UPDATE
  TO authenticated
  USING (
    private.current_user_role() = 'admin'
    OR (
      private.current_user_role() = 'rmo'
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
    private.current_user_role() IN ('admin', 'management', 'rmo', 'dept_head', 'faculty', 'staff')
  );

DROP POLICY IF EXISTS "documents_admin_delete" ON public.documents;
CREATE POLICY "documents_admin_delete"
  ON public.documents FOR DELETE
  TO authenticated
  USING (private.current_user_role() = 'admin');

-- 9.5 Document Routes Policies (Append-only custody log; ZERO anon or student access)
DROP POLICY IF EXISTS "document_routes_authorized_read" ON public.document_routes;
CREATE POLICY "document_routes_authorized_read"
  ON public.document_routes FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() IN ('admin', 'management')
    OR (
      private.current_user_role() IN ('rmo', 'dept_head', 'faculty', 'staff')
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
      private.current_user_role() IN ('admin', 'management')
      OR (
        private.current_user_role() IN ('rmo', 'dept_head', 'faculty', 'staff')
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

-- 9.6 Notifications Policies
DROP POLICY IF EXISTS "notifications_self_read" ON public.notifications;
CREATE POLICY "notifications_self_read"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "notifications_self_update" ON public.notifications;
CREATE POLICY "notifications_self_update"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notifications_staff_insert" ON public.notifications;
CREATE POLICY "notifications_staff_insert"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    private.current_user_role() IN ('admin', 'management', 'rmo', 'dept_head', 'faculty', 'staff')
    AND (
      private.current_user_role() IN ('admin', 'management')
      OR campus_id IS NULL
      OR campus_id = private.current_user_campus_id()
    )
  );

-- 9.7 Audit Logs Policies (Append-only; ZERO anon or student access)
DROP POLICY IF EXISTS "audit_logs_authorized_read" ON public.audit_logs;
CREATE POLICY "audit_logs_authorized_read"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    private.current_user_role() IN ('admin', 'management')
    OR (
      private.current_user_role() IN ('rmo', 'dept_head')
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
    AND private.current_user_role() IN ('admin', 'management', 'rmo', 'dept_head', 'faculty', 'staff')
    AND (
      private.current_user_role() IN ('admin', 'management')
      OR campus_id IS NULL
      OR campus_id = private.current_user_campus_id()
    )
  );

-- =============================================================================
-- 10. Realtime Publication
-- =============================================================================

DO $$
DECLARE
  tbl text;
  realtime_tables text[] := ARRAY[
    'announcements',
    'profiles',
    'documents',
    'document_routes',
    'notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY realtime_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END
$$;

-- =============================================================================
-- 11. Private Supabase Storage Bucket (`document-files`) + RLS Policies
-- =============================================================================
-- File path convention: <campus_slug>/<document_id>/<filename>

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-files',
  'document-files',
  false,
  15728640, -- 15 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "document_files_authorized_select" ON storage.objects;
CREATE POLICY "document_files_authorized_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() IN ('admin', 'management')
      OR (
        private.current_user_role() IN ('rmo', 'dept_head', 'faculty', 'staff')
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
      private.current_user_role() = 'admin'
      OR (
        private.current_user_role() = 'rmo'
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
      private.current_user_role() = 'admin'
      OR (
        private.current_user_role() = 'rmo'
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'document-files'
    AND (
      private.current_user_role() = 'admin'
      OR (
        private.current_user_role() = 'rmo'
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
      private.current_user_role() = 'admin'
      OR (
        private.current_user_role() = 'rmo'
        AND (storage.foldername(name))[1] = private.current_user_campus_slug()
      )
    )
  );
