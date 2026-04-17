-- Migration: Create unlocked_slots table
-- Description: Stores unlocked slots that receptionists can make available outside working hours
-- Created: 2026-04-17

CREATE TABLE IF NOT EXISTS unlocked_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id TEXT NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_unlocked_slots_doctor_date_time ON unlocked_slots(doctor_id, date, time);

-- Add RLS policy (if needed in future)
-- ALTER TABLE unlocked_slots ENABLE ROW LEVEL SECURITY;
