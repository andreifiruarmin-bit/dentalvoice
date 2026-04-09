-- Run in Supabase SQL editor or via CLI migration.
-- Bug #1: normalized phone for lookups
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS phone_normalized TEXT;
UPDATE appointments SET phone_normalized = RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 9)
  WHERE phone_normalized IS NULL AND phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_phone_normalized ON appointments(phone_normalized);

-- Bug #3: optimistic lock / prevent double booking same slot
ALTER TABLE appointments
  ADD CONSTRAINT unique_slot_per_doctor
  UNIQUE (clinic_id, doctor_id, date, time);
