-- =============================================================================
-- SmartCampus CHMSU — User Profile Avatars (Storage + RPC + View)
-- =============================================================================
-- Idempotent migration. Safe to re-run in the Supabase SQL Editor.
--
-- What this migration does:
--   1. Adds `avatar_url text` to `public.profiles`.
--   2. Creates/updates the public `avatars` Storage bucket (5 MB limit,
--      JPG / PNG / WebP only).
--   3. Adds RLS policies on `storage.objects` for `bucket_id = 'avatars'`
--      (public read; authenticated owner-only insert/update/delete under
--      `<auth.uid()>/...`).
--   4. Creates SECURITY DEFINER RPC `public.update_my_avatar(p_avatar_url text)`
--      so signed-in users can update ONLY their own `avatar_url` without
--      loosening RLS on verified institutional profile fields.
--   5. Includes `avatar_url` in `public.public_faculty_availability` (if present)
--      and updates `anon` column grants accordingly.
-- =============================================================================

-- 1. Add avatar_url column to public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Create/update public Supabase Storage bucket `avatars`
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. RLS policies on storage.objects for `avatars`
DROP POLICY IF EXISTS avatars_public_select ON storage.objects;
CREATE POLICY avatars_public_select
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
CREATE POLICY avatars_owner_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- 4. SECURITY DEFINER RPC: update ONLY own avatar_url + updated_at
CREATE OR REPLACE FUNCTION public.update_my_avatar(p_avatar_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_clean_url text;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  v_clean_url := NULLIF(trim(COALESCE(p_avatar_url, '')), '');

  IF v_clean_url IS NOT NULL THEN
    IF char_length(v_clean_url) > 2048 OR v_clean_url !~ '^https?://' THEN
      RAISE EXCEPTION 'Invalid avatar URL' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    avatar_url = v_clean_url,
    updated_at = now()
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'avatar_url', v_clean_url
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_avatar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_avatar(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_avatar(text) TO authenticated;

-- 5. Include avatar_url in public.public_faculty_availability (if view exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'public_faculty_availability'
  ) THEN
    EXECUTE $view$
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
        availability_updated_at,
        avatar_url
      FROM public.profiles
      WHERE role <> 'student'::public.user_role
        AND is_active = true
        AND approval_status = 'approved'
        AND is_teaching = true
        AND show_on_kiosk = true
    $view$;
  END IF;
END;
$$;

-- Re-assert strict anon column grants on public.profiles (including avatar_url)
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
  is_teaching,
  show_on_kiosk,
  is_active,
  avatar_url
) ON public.profiles TO anon;
GRANT SELECT ON public.public_faculty_availability TO anon, authenticated;
