-- Seed clinic_config with current .env values for beautiful-smile-demo
-- After verifying this data is correct in DB, env vars can be deprecated

INSERT INTO clinic_config (clinic_id, key, value) VALUES
  ('beautiful-smile-demo', 'CLINIC_NAME',       'Beautiful Smile Demo'),
  ('beautiful-smile-demo', 'CLINIC_ADDRESS',    'Strada Exemplului Nr. 10, Slatina, Olt'),
  ('beautiful-smile-demo', 'CLINIC_PHONE',      '+40700000000'),
  ('beautiful-smile-demo', 'CLINIC_MAPS_LINK',  '[https://maps.google.com/?q=LocatiaTa](https://maps.google.com/?q=LocatiaTa)'),
  ('beautiful-smile-demo', 'CLINIC_WAZE_LINK',  '[https://www.waze.com/ul?ll=](https://www.waze.com/ul?ll=)...'),
  ('beautiful-smile-demo', 'CLINIC_START_HOUR', '09:00'),
  ('beautiful-smile-demo', 'CLINIC_END_HOUR',   '18:00'),
  ('beautiful-smile-demo', 'SLOT_INTERVAL_MIN', '60'),
  ('beautiful-smile-demo', 'DEFAULT_SERVICE_DURATION', '60')
ON CONFLICT (clinic_id, key) DO UPDATE SET value = EXCLUDED.value;

-- Seed services table (currently hardcoded in BUSINESS_CONFIG)
INSERT INTO services (id, clinic_id, name, duration_minutes, description, is_active) VALUES
  ('consultatie', 'beautiful-smile-demo', 'Consultație',               60, 'Evaluare inițială și plan de tratament.', true),
  ('igienizare',  'beautiful-smile-demo', 'Igienizare',                60, 'Detartraj, periaj profesional și airflow.', true),
  ('albire',      'beautiful-smile-demo', 'Albire Profesională',      120, 'Albire dentară cu lampă ZOOM.', true),
  ('control',     'beautiful-smile-demo', 'Control Periodic',          60, 'Verificarea stării de sănătate orală la 6 luni.', true),
  ('urgenta',     'beautiful-smile-demo', 'Urgență Stomatologică',     60, 'Intervenție rapidă pentru dureri acute.', true),
  ('implant',     'beautiful-smile-demo', 'Implant Dentar',            60, 'Restaurare dentară prin implant.', true)
ON CONFLICT (id, clinic_id) DO NOTHING;
