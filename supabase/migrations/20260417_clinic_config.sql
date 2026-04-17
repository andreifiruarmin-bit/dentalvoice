-- Create clinic_config table for storing clinic settings
CREATE TABLE IF NOT EXISTS clinic_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for clinic_config table
ALTER TABLE clinic_config ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to read clinic config
CREATE POLICY "Allow authenticated users to read clinic config" ON clinic_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- Create policy for service role to manage clinic config
CREATE POLICY "Allow service role to manage clinic config" ON clinic_config
  FOR ALL USING (auth.role() = 'service_role');

-- Insert default clinic configuration values
INSERT INTO clinic_config (key, value) VALUES
  ('CLINIC_PHONE', '+40722334455'),
  ('CLINIC_ADDRESS', 'Str. Principală Nr. 1, București'),
  ('CLINIC_START_HOUR', '09:00'),
  ('CLINIC_END_HOUR', '18:00'),
  ('REMINDER_MESSAGE_TEMPLATE', 'Bună ziua {nume}, vă reamintim de programarea dvs. pe data de {data} la ora {ora} la medicul {doctor} pentru {serviciu}. Vă așteptăm!')
ON CONFLICT (key) DO NOTHING;
