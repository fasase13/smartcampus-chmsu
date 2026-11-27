-- =============================================================================
-- SmartCampus CHMSU — Announcement Image & File Attachments
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- What this migration does:
--   1. Adds attachment metadata columns to `public.announcements`:
--      `attachment_url`, `attachment_path`, `attachment_name`,
--      `attachment_type`, `attachment_size`.
--   2. Creates/updates the public Storage bucket `announcement-attachments`
--      (15 MB limit; JPG, PNG, WebP, GIF, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX).
--   3. Adds RLS policies on `storage.objects` for `announcement-attachments`:
--      - SELECT: public (`anon`, `authenticated`) so portals & public Campus
--        Kiosk render attachments cleanly.
--      - INSERT / UPDATE: active approved publishers (`superadmin`,
--        `campus_admin`, `faculty`, `staff`, `rmo`) into their own folder
--        `<auth.uid()>/...`.
--      - DELETE: uploader (`<auth.uid()>/...`) or `superadmin`.
-- =============================================================================

-- 1. Add attachment columns to public.announcements
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint;

-- 2. Create/update public Supabase Storage bucket `announcement-attachments`
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-attachments',
  'announcement-attachments',
  true,
  15728640,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. RLS policies on storage.objects for `announcement-attachments`
DROP POLICY IF EXISTS announcement_attachments_public_select ON storage.objects;
CREATE POLICY announcement_attachments_public_select
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'announcement-attachments');

DROP POLICY IF EXISTS announcement_attachments_publisher_insert ON storage.objects;
CREATE POLICY announcement_attachments_publisher_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'announcement-attachments'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.is_active = true
        AND p.approval_status = 'approved'
        AND p.role IN ('superadmin', 'campus_admin', 'faculty', 'staff', 'rmo')
    )
  );

DROP POLICY IF EXISTS announcement_attachments_publisher_update ON storage.objects;
CREATE POLICY announcement_attachments_publisher_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'announcement-attachments'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.is_active = true
        AND p.approval_status = 'approved'
        AND p.role IN ('superadmin', 'campus_admin', 'faculty', 'staff', 'rmo')
    )
  )
  WITH CHECK (
    bucket_id = 'announcement-attachments'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.is_active = true
        AND p.approval_status = 'approved'
        AND p.role IN ('superadmin', 'campus_admin', 'faculty', 'staff', 'rmo')
    )
  );

DROP POLICY IF EXISTS announcement_attachments_owner_or_superadmin_delete ON storage.objects;
CREATE POLICY announcement_attachments_owner_or_superadmin_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'announcement-attachments'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.is_active = true
          AND p.approval_status = 'approved'
          AND p.role = 'superadmin'
      )
    )
  );
