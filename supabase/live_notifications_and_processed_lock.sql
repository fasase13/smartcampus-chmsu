-- =============================================================================
-- SmartCampus CHMSU — Live Notifications Realtime, Automatic Triggers &
-- Permanent Record Lock on Processed Documents
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- What this migration does:
--   1. Enables Supabase Realtime on `public.notifications` and enforces strict
--      self-only SELECT and UPDATE (`is_read`, `read_at`) RLS policies.
--   2. Permanently locks Processed (`completed` / `processed`) documents at
--      the PostgreSQL trigger level — blocking any UPDATE or DELETE on
--      `public.documents` and blocking any INSERT/UPDATE/DELETE on
--      `public.document_routes` once a document is marked Processed.
--   3. Adds `SECURITY DEFINER` triggers to automatically dispatch real-time
--      notifications for:
--        - Document registration / forwarding / receipt / return / processed
--        - New completed user registrations (`approval_status = 'pending'`)
--        - Published campus or university-wide announcements
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enable Realtime on public.notifications & Self-Only RLS
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_self_read" ON public.notifications;
CREATE POLICY "notifications_self_read"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notifications_self_update" ON public.notifications;
CREATE POLICY "notifications_self_update"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- -----------------------------------------------------------------------------
-- 2. Permanent Record Lock Triggers for Processed Documents
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_processed_document_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status::text IN ('completed', 'processed') THEN
    RAISE EXCEPTION 'Processed documents are permanently locked in records and cannot be edited or deleted.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_processed_documents ON public.documents;
CREATE TRIGGER trg_lock_processed_documents
  BEFORE UPDATE OR DELETE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_processed_document_mutation();

CREATE OR REPLACE FUNCTION public.prevent_processed_document_route_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_doc_id uuid;
  v_status text;
BEGIN
  v_doc_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.document_id ELSE NEW.document_id END;

  SELECT status::text
  INTO v_status
  FROM public.documents
  WHERE id = v_doc_id
  LIMIT 1;

  IF v_status IN ('completed', 'processed') THEN
    RAISE EXCEPTION 'Processed documents are permanently locked in records and cannot be edited, re-routed, or deleted.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_processed_document_routes ON public.document_routes;
CREATE TRIGGER trg_lock_processed_document_routes
  BEFORE INSERT OR UPDATE OR DELETE ON public.document_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_processed_document_route_mutation();

-- -----------------------------------------------------------------------------
-- 3. Automatic Live Notification Triggers (SECURITY DEFINER)
-- -----------------------------------------------------------------------------

-- 3A. Document lifecycle notifications (assigned, forwarded, received, returned, processed)
CREATE OR REPLACE FUNCTION public.notify_on_document_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_notif_title text;
  v_notif_msg text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.current_holder_id IS NOT NULL
       AND NEW.current_holder_id <> NEW.created_by
       AND NOT EXISTS (
         SELECT 1
         FROM public.notifications n
         WHERE n.user_id = NEW.current_holder_id
           AND n.document_id = NEW.id
           AND n.type = 'document_assigned'
           AND n.created_at > now() - interval '10 seconds'
       ) THEN
      INSERT INTO public.notifications (
        user_id, campus_id, document_id, type, title, message
      ) VALUES (
        NEW.current_holder_id,
        NEW.current_campus_id,
        NEW.id,
        'document_assigned',
        'New Document Assigned: ' || NEW.tracking_code,
        '"' || NEW.title || '" has been routed to ' || NEW.current_office || '.'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Forwarded / reassigned to a new holder
    IF NEW.current_holder_id IS DISTINCT FROM OLD.current_holder_id
       AND NEW.current_holder_id IS NOT NULL
       AND NEW.current_holder_id IS DISTINCT FROM v_actor_id
       AND NOT EXISTS (
         SELECT 1
         FROM public.notifications n
         WHERE n.user_id = NEW.current_holder_id
           AND n.document_id = NEW.id
           AND n.type = 'document_forwarded'
           AND n.created_at > now() - interval '10 seconds'
       ) THEN
      INSERT INTO public.notifications (
        user_id, campus_id, document_id, type, title, message
      ) VALUES (
        NEW.current_holder_id,
        NEW.current_campus_id,
        NEW.id,
        'document_forwarded',
        'Document Forwarded: ' || NEW.tracking_code,
        '"' || NEW.title || '" was forwarded to ' || NEW.current_office || '.'
      );
    END IF;

    -- Status changed to received / action_required / completed -> notify original sender
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status::text IN ('received', 'action_required', 'completed', 'processed')
       AND NEW.created_by IS DISTINCT FROM v_actor_id
       AND NOT EXISTS (
         SELECT 1
         FROM public.notifications n
         WHERE n.user_id = NEW.created_by
           AND n.document_id = NEW.id
           AND n.type = 'document_forwarded'
           AND n.created_at > now() - interval '10 seconds'
       ) THEN
      v_notif_title := CASE NEW.status::text
        WHEN 'received' THEN 'Document Received: ' || NEW.tracking_code
        WHEN 'action_required' THEN 'Action Required: ' || NEW.tracking_code
        ELSE 'Document Processed: ' || NEW.tracking_code
      END;
      v_notif_msg := CASE NEW.status::text
        WHEN 'received' THEN '"' || NEW.title || '" was received at ' || NEW.current_office || '.'
        WHEN 'action_required' THEN '"' || NEW.title || '" was returned for action from ' || NEW.current_office || '.'
        ELSE '"' || NEW.title || '" has been marked as Processed and permanently locked in records.'
      END;

      INSERT INTO public.notifications (
        user_id, campus_id, document_id, type, title, message
      ) VALUES (
        NEW.created_by,
        NEW.origin_campus_id,
        NEW.id,
        'document_forwarded',
        v_notif_title,
        v_notif_msg
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_document_event ON public.documents;
CREATE TRIGGER trg_notify_on_document_event
  AFTER INSERT OR UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_document_event();

-- 3B. Pending user registration notifications for Campus Admin & Superadmin
CREATE OR REPLACE FUNCTION public.notify_on_pending_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.approval_status = 'pending'
     AND NEW.profile_completed = true
     AND (
       TG_OP = 'INSERT'
       OR OLD.approval_status IS DISTINCT FROM 'pending'
       OR OLD.profile_completed IS DISTINCT FROM true
     ) THEN
    INSERT INTO public.notifications (
      user_id, campus_id, type, title, message
    )
    SELECT
      admin_user.id,
      NEW.campus_id,
      'system',
      'New Pending Registration',
      COALESCE(NEW.full_name, 'A new user') || ' submitted a registration awaiting School ID verification.'
    FROM public.profiles admin_user
    WHERE admin_user.is_active = true
      AND admin_user.approval_status = 'approved'
      AND admin_user.id <> NEW.id
      AND (
        admin_user.role = 'superadmin'::public.user_role
        OR (
          admin_user.role = 'campus_admin'::public.user_role
          AND admin_user.campus_id = NEW.campus_id
        )
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_pending_registration ON public.profiles;
CREATE TRIGGER trg_notify_on_pending_registration
  AFTER INSERT OR UPDATE OF approval_status, profile_completed ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_pending_registration();

-- 3C. Published announcement notifications for target campus (or university-wide)
CREATE OR REPLACE FUNCTION public.notify_on_announcement_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_active = true THEN
    INSERT INTO public.notifications (
      user_id, campus_id, type, title, message
    )
    SELECT
      recipient.id,
      NEW.campus_id,
      'announcement',
      'New Announcement: ' || left(NEW.title, 80),
      left(NEW.body, 160)
    FROM public.profiles recipient
    WHERE recipient.is_active = true
      AND recipient.approval_status = 'approved'
      AND recipient.id IS DISTINCT FROM NEW.author_id
      AND (
        NEW.campus_id IS NULL
        OR recipient.campus_id = NEW.campus_id
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_announcement_published ON public.announcements;
CREATE TRIGGER trg_notify_on_announcement_published
  AFTER INSERT ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_announcement_published();
