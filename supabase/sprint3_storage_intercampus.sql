-- =============================================================================
-- SmartCampus CHMSU — Sprint 3 Migration: Inter-Campus Storage & Handoff Alerts
-- Run this file in the Supabase SQL Editor. Safe to re-run (idempotent).
-- =============================================================================

-- 1. Allow authorized staff at EITHER origin_campus_id OR current_campus_id
--    (or the current_holder / creator) to generate signed URLs and download
--    attachments from the private `document-files` bucket during inter-campus routing.
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
        AND (
          (storage.foldername(name))[1] = private.current_user_campus_slug()
          OR EXISTS (
            SELECT 1
            FROM public.documents d
            WHERE d.file_path = storage.objects.name
              AND (
                d.origin_campus_id = private.current_user_campus_id()
                OR d.current_campus_id = private.current_user_campus_id()
                OR d.current_holder_id = (SELECT auth.uid())
                OR d.created_by = (SELECT auth.uid())
              )
          )
        )
      )
    )
  );

-- 2. Allow staff/RMO/dept_head to send handoff notifications across campuses
--    when the notification is linked to a document they are authorized to route.
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
      OR (
        document_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.documents d
          WHERE d.id = notifications.document_id
            AND (
              d.origin_campus_id = private.current_user_campus_id()
              OR d.current_campus_id = private.current_user_campus_id()
              OR d.current_holder_id = (SELECT auth.uid())
              OR d.created_by = (SELECT auth.uid())
            )
        )
      )
    )
  );
