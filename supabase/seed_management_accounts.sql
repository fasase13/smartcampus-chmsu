-- =============================================================================
-- SmartCampus CHMSU — Seed 4 Campus Admin + 4 Institutional Management Accounts
-- =============================================================================
-- Run this directly in the Supabase SQL Editor (no service_role key needed).
-- Safe to re-run (idempotent).
--
-- Default Password for all 8 accounts: ChmsuTest123!
--
-- Campus Admins (Login at /campus-admin):
--   - CHMSU Talisay (Main) : admin.talisay@chmsu.edu.ph
--   - CHMSU Alijis         : admin.alijis@chmsu.edu.ph
--   - CHMSU Binalbagan     : admin.binalbagan@chmsu.edu.ph
--   - CHMSU Fortune Towne  : admin.fortunetowne@chmsu.edu.ph
--
-- Institutional Management (Login at / -> /management):
--   - CHMSU Talisay (Main) : mgmt.talisay@chmsu.edu.ph      (School ID: 90000001)
--   - CHMSU Alijis         : mgmt.alijis@chmsu.edu.ph       (School ID: 90000002)
--   - CHMSU Binalbagan     : mgmt.binalbagan@chmsu.edu.ph   (School ID: 90000003)
--   - CHMSU Fortune Towne  : mgmt.fortunetowne@chmsu.edu.ph (School ID: 90000004)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_password text := 'ChmsuTest123!';
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000';
  v_rec record;
  v_campus_id uuid;
  v_user_id uuid;
  v_now timestamptz := now();
BEGIN
  FOR v_rec IN
    SELECT * FROM (
      VALUES
        -- 4 Campus Admin accounts (1 per campus)
        ('talisay',       'campus_admin', 'admin.talisay@chmsu.edu.ph',      NULL,       'Talisay Admin',       'Campus Administration',              'Office of the Campus Administrator',      'Campus Administrator'),
        ('alijis',        'campus_admin', 'admin.alijis@chmsu.edu.ph',       NULL,       'Alijis Admin',        'Campus Administration & Support',    'Office of the Campus Administrator',      'Campus Administrator'),
        ('binalbagan',    'campus_admin', 'admin.binalbagan@chmsu.edu.ph',   NULL,       'Binalbagan Admin',    'Campus Administration & Support',    'Office of the Campus Administrator',      'Campus Administrator'),
        ('fortune-towne', 'campus_admin', 'admin.fortunetowne@chmsu.edu.ph', NULL,       'Fortune Towne Admin', 'Campus Administration & Support',    'Office of the Campus Administrator',      'Campus Administrator'),
        -- 4 Institutional Management accounts (1 per campus)
        ('talisay',       'management',   'mgmt.talisay@chmsu.edu.ph',       '90000001', 'Institutional Management — Talisay (Main)', 'Office of the University President', 'Office of the University President',      'Institutional Management Officer'),
        ('alijis',        'management',   'mgmt.alijis@chmsu.edu.ph',        '90000002', 'Institutional Management — Alijis',         'Campus Administration & Support',    'Office of the Campus Executive Director', 'Institutional Management Officer'),
        ('binalbagan',    'management',   'mgmt.binalbagan@chmsu.edu.ph',    '90000003', 'Institutional Management — Binalbagan',     'Campus Administration & Support',    'Office of the Campus Executive Director', 'Institutional Management Officer'),
        ('fortune-towne', 'management',   'mgmt.fortunetowne@chmsu.edu.ph',  '90000004', 'Institutional Management — Fortune Towne',  'Campus Administration & Support',    'Office of the Campus Executive Director', 'Institutional Management Officer')
    ) AS t(campus_slug, role_name, email, school_id, full_name, department, office_location, job_title)
  LOOP
    SELECT id INTO v_campus_id
    FROM public.campuses
    WHERE slug = v_rec.campus_slug
      AND is_active = true
    LIMIT 1;

    IF v_campus_id IS NULL THEN
      RAISE NOTICE 'Skipping % (%): campus not found in public.campuses.', v_rec.email, v_rec.campus_slug;
      CONTINUE;
    END IF;

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE lower(email) = lower(v_rec.email)
    LIMIT 1;

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change
      ) VALUES (
        v_instance_id,
        v_user_id,
        'authenticated',
        'authenticated',
        v_rec.email,
        extensions.crypt(v_password, extensions.gen_salt('bf')),
        v_now,
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', v_rec.full_name, 'role', v_rec.role_name, 'campus_slug', v_rec.campus_slug),
        v_now,
        v_now,
        '',
        '',
        '',
        ''
      );

      INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        v_user_id,
        v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', v_rec.email, 'email_verified', true),
        'email',
        v_now,
        v_now,
        v_now
      )
      ON CONFLICT DO NOTHING;
    ELSE
      UPDATE auth.users
      SET
        encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, v_now),
        updated_at = v_now
      WHERE id = v_user_id;
    END IF;

    INSERT INTO public.profiles (
      id,
      campus_id,
      email,
      full_name,
      role,
      requested_role,
      employee_or_student_id,
      department,
      office_location,
      job_title,
      approval_status,
      is_active,
      profile_completed,
      privacy_terms_accepted,
      privacy_terms_accepted_at,
      is_teaching,
      show_on_kiosk,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_campus_id,
      v_rec.email,
      v_rec.full_name,
      v_rec.role_name::public.user_role,
      NULL,
      v_rec.school_id,
      v_rec.department,
      v_rec.office_location,
      v_rec.job_title,
      'approved',
      true,
      true,
      true,
      v_now,
      false,
      false,
      v_now,
      v_now
    )
    ON CONFLICT (id) DO UPDATE SET
      campus_id = EXCLUDED.campus_id,
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      requested_role = EXCLUDED.requested_role,
      employee_or_student_id = EXCLUDED.employee_or_student_id,
      department = EXCLUDED.department,
      office_location = EXCLUDED.office_location,
      job_title = EXCLUDED.job_title,
      approval_status = 'approved',
      is_active = true,
      profile_completed = true,
      privacy_terms_accepted = true,
      privacy_terms_accepted_at = COALESCE(public.profiles.privacy_terms_accepted_at, v_now),
      is_teaching = false,
      show_on_kiosk = false,
      updated_at = v_now;
  END LOOP;
END;
$$;

-- Verify all 8 provisioned accounts (4 Campus Admins + 4 Institutional Management)
SELECT
  p.role,
  c.name AS campus,
  p.full_name,
  p.email,
  p.employee_or_student_id AS school_id,
  p.approval_status,
  p.is_active
FROM public.profiles p
JOIN public.campuses c ON c.id = p.campus_id
WHERE p.role IN ('campus_admin'::public.user_role, 'management'::public.user_role)
ORDER BY p.role ASC, c.is_main DESC, c.name ASC;
