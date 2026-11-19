-- =============================================================================
-- SmartCampus CHMSU — Official Campus Seed Data
-- Run this file SECOND in the Supabase SQL Editor (after supabase/schema.sql).
-- Safe to re-run (idempotent via ON CONFLICT).
-- =============================================================================

INSERT INTO public.campuses (code, slug, name, address, contact_email, is_main, is_active)
VALUES
  (
    'TAL',
    'talisay',
    'Talisay (Main)',
    'Mabini St., Talisay City, Negros Occidental 6115',
    'talisay@chmsu.edu.ph',
    true,
    true
  ),
  (
    'ALJ',
    'alijis',
    'Alijis',
    'Brgy. Alijis, Bacolod City, Negros Occidental 6100',
    'alijis@chmsu.edu.ph',
    false,
    true
  ),
  (
    'BIN',
    'binalbagan',
    'Binalbagan',
    'Brgy. Enclaro, Binalbagan, Negros Occidental 6107',
    'binalbagan@chmsu.edu.ph',
    false,
    true
  ),
  (
    'FTW',
    'fortune-towne',
    'Fortune Towne',
    'Fortune Towne, Brgy. Estefania, Bacolod City, Negros Occidental 6100',
    'fortunetowne@chmsu.edu.ph',
    false,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  contact_email = EXCLUDED.contact_email,
  is_main = EXCLUDED.is_main,
  is_active = EXCLUDED.is_active;
