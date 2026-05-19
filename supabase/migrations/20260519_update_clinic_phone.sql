-- Update clinic phone number for beautiful-smile-demo
UPDATE clinic_config
SET value = '+40771731839', updated_at = NOW()
WHERE clinic_id = 'beautiful-smile-demo' AND key = 'CLINIC_PHONE';

INSERT INTO clinic_config (clinic_id, key, value)
VALUES ('beautiful-smile-demo', 'CLINIC_PHONE', '+40771731839')
ON CONFLICT (clinic_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
