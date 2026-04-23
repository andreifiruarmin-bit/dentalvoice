-- ============================================================
-- MIGRATION: Multi-tenant clinic_id additions
-- Version: 3.8.0
-- Date: 2026-04-23
-- ============================================================

-- 1. Add clinic_id to unlocked_slots (if missing)
ALTER TABLE unlocked_slots
  ADD COLUMN IF NOT EXISTS clinic_id TEXT NOT NULL DEFAULT 'beautiful-smile-demo';

-- 2. Add clinic_id to temp_reservations (if missing)
ALTER TABLE temp_reservations
  ADD COLUMN IF NOT EXISTS clinic_id TEXT NOT NULL DEFAULT 'beautiful-smile-demo';

-- 3. Create clinic_users mapping table (auth user → clinic_id)
CREATE TABLE IF NOT EXISTS clinic_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(auth_user_id)
);

-- 4. Insert mapping for existing demo clinic Supabase Auth user
-- IMPORTANT: Replace '<AUTH_USER_UUID>' with actual UUID from auth.users for beautiful-smile-demo
-- Run: SELECT id, email FROM auth.users; to find it
-- INSERT INTO clinic_users (auth_user_id, clinic_id, role)
-- VALUES ('<AUTH_USER_UUID>', 'beautiful-smile-demo', 'admin')
-- ON CONFLICT (auth_user_id) DO NOTHING;

-- 5. Add indexes for clinic_id lookups
CREATE INDEX IF NOT EXISTS idx_unlocked_slots_clinic_id ON unlocked_slots(clinic_id);
CREATE INDEX IF NOT EXISTS idx_temp_reservations_clinic_id ON temp_reservations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_users_auth_user_id ON clinic_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_clinic_users_clinic_id ON clinic_users(clinic_id);

-- ============================================================
-- RLS POLICIES — Defense in depth (backend uses service_role
-- which bypasses RLS, but policies protect against direct access)
-- ============================================================

-- Enable RLS on new tables
ALTER TABLE clinic_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE unlocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE temp_reservations ENABLE ROW LEVEL SECURITY;

-- DENY ALL for anon and authenticated roles on all tables
-- (backend uses service_role which bypasses RLS automatically)
-- This ensures zero direct DB access from frontend

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'appointments', 'doctors', 'services', 'blocked_slots',
    'clinic_config', 'clinic_holidays', 'unlocked_slots',
    'temp_reservations', 'clinic_users', 'reminder_log',
    'chat_sessions', 'leads', 'live_traffic'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    -- Drop any existing permissive policies first
    EXECUTE format(
      'DROP POLICY IF EXISTS allow_all ON %I',
      tbl
    );
    -- Create deny-all policy for anon
    EXECUTE format(
      'CREATE POLICY deny_anon ON %I FOR ALL TO anon USING (false)',
      tbl
    );
    -- Create deny-all policy for authenticated
    EXECUTE format(
      'CREATE POLICY deny_authenticated ON %I FOR ALL TO authenticated USING (false)',
      tbl
    );
  END LOOP;
END;
$$;

-- Revoke direct grants (belt-and-suspenders)
REVOKE ALL ON clinic_users FROM anon, authenticated;
REVOKE ALL ON unlocked_slots FROM anon, authenticated;
REVOKE ALL ON temp_reservations FROM anon, authenticated;
