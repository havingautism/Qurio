-- ===================================================================
-- HITL Interactive Form: Pending Form Runs Table
-- ===================================================================
-- This table stores pending state for paused agent runs that are
-- waiting for user form submissions (Human-in-the-Loop).
-- 
-- Retention policy:
-- - Keep rows until form flow completes (backend deletes by run_id), or
-- - conversation is removed (ON DELETE CASCADE via conversation_id FK).
-- No automatic expiration cleanup is required.
-- ===================================================================

-- Create the pending_form_runs table
CREATE TABLE IF NOT EXISTS pending_form_runs (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Run identification
    run_id TEXT UNIQUE NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Serialized Agno requirements object (JSONB for efficient querying)
    requirements_data JSONB NOT NULL,
    
    -- Metadata
    user_id TEXT,
    agent_model TEXT,
    messages JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes') NOT NULL,
    
    -- Optional: track if the form was submitted
    submitted_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted'))
);

-- -------------------------------------------------------------------
-- Backward-compatible upgrades for existing tables
-- -------------------------------------------------------------------
ALTER TABLE pending_form_runs
    ADD COLUMN IF NOT EXISTS messages JSONB;

-- Some deployments used UUID here; convert to TEXT so non-UUID user ids
-- (e.g. "default-user") can be stored without write failures.
ALTER TABLE pending_form_runs
    ALTER COLUMN user_id TYPE TEXT USING user_id::text;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pending_form_runs_run_id 
    ON pending_form_runs(run_id);

CREATE INDEX IF NOT EXISTS idx_pending_form_runs_expires_at 
    ON pending_form_runs(expires_at);

CREATE INDEX IF NOT EXISTS idx_pending_form_runs_conversation_id 
    ON pending_form_runs(conversation_id);

CREATE INDEX IF NOT EXISTS idx_pending_form_runs_status 
    ON pending_form_runs(status);

-- ===================================================================
-- Note on expires_at
-- ===================================================================
-- expires_at is kept for backward compatibility and observability only.
-- Runtime logic does not auto-expire pending runs.

-- ===================================================================
-- Row Level Security (RLS) - Optional but recommended
-- ===================================================================
-- Uncomment if you want to enable RLS for this table

-- ALTER TABLE pending_form_runs ENABLE ROW LEVEL SECURITY;

-- -- Policy: Users can only see their own pending forms
-- CREATE POLICY select_own_pending_forms ON pending_form_runs
--     FOR SELECT
--     USING (auth.uid() = user_id);

-- -- Policy: Service role can do anything (backend operations)
-- CREATE POLICY service_role_all ON pending_form_runs
--     FOR ALL
--     TO service_role
--     USING (true)
--     WITH CHECK (true);
