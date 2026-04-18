-- Add group_id column to blocked_slots table for linking vacation blocks
ALTER TABLE blocked_slots ADD COLUMN IF NOT EXISTS group_id UUID;

-- Create index for efficient group_id queries
CREATE INDEX IF NOT EXISTS idx_blocked_slots_group_id ON blocked_slots(group_id);
