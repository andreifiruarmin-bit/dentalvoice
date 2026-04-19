-- Add channel column to chat_sessions for multi-channel session isolation
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';

-- Update existing WhatsApp sessions
UPDATE chat_sessions SET channel = 'whatsapp' WHERE channel = 'whatsapp' OR channel IS NULL;

-- Create unique constraint on (user_id, channel) for upsert
ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS chat_sessions_user_id_key;
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_user_id_channel_key UNIQUE (user_id, channel);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_chat_sessions_channel ON chat_sessions(channel);
