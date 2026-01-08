-- Create user_tools table for custom HTTP tools
CREATE TABLE IF NOT EXISTS user_tools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'http',
  config JSONB NOT NULL,
  input_schema JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_tool_name UNIQUE (user_id, name)
);

-- Create index for faster user tool lookups
CREATE INDEX IF NOT EXISTS idx_user_tools_user_id ON user_tools(user_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_user_tools_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_tools_updated_at
  BEFORE UPDATE ON user_tools
  FOR EACH ROW
  EXECUTE FUNCTION update_user_tools_updated_at();

-- Disable Row Level Security for single-user self-hosted mode
ALTER TABLE user_tools DISABLE ROW LEVEL SECURITY;

-- No policies needed as RLS is disabled
