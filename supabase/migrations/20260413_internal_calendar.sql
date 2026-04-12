-- Tabel appointments: adaugä coloana notes, eliminä dependenþa de google_event_id
-- google_event_id rämâne în schemä ca nullable pentru backward compat, dar nu mai e folosit

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- Tabel doctors: configurare medici persistatä în DB (parametrizare completä)
CREATE TABLE IF NOT EXISTS doctors (
  id            TEXT PRIMARY KEY,         -- 'dr1', 'dr2', etc.
  clinic_id     TEXT NOT NULL,
  name          TEXT NOT NULL,
  working_days  INTEGER[] NOT NULL,       -- [1,2,3,4,5] = Luni-Vineri
  start_hour    TEXT NOT NULL DEFAULT '09:00',
  end_hour      TEXT NOT NULL DEFAULT '18:00',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel services: servicii configurate per clinicä
CREATE TABLE IF NOT EXISTS services (
  id                TEXT PRIMARY KEY,
  clinic_id         TEXT NOT NULL,
  name              TEXT NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 30,
  description       TEXT,
  price_range       TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel blocked_slots: zile libere, vacanþe, pauze manuale
CREATE TABLE IF NOT EXISTS blocked_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   TEXT NOT NULL,
  doctor_id   TEXT,                       -- NULL = blocat pentru toatä clinica
  date        TEXT NOT NULL,              -- YYYY-MM-DD
  time_start  TEXT NOT NULL,              -- HH:mm
  time_end    TEXT NOT NULL,              -- HH:mm
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_clinic_date
  ON blocked_slots(clinic_id, date);

CREATE INDEX IF NOT EXISTS idx_doctors_clinic
  ON doctors(clinic_id);

CREATE INDEX IF NOT EXISTS idx_services_clinic
  ON services(clinic_id);
