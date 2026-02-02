-- ===================================================================
-- HITL Interactive Form: Pending Form Runs Table
-- ===================================================================
-- This table stores temporary state for paused agent runs that are
-- waiting for user form submissions (Human-in-the-Loop).
-- 
-- Records are automatically cleaned up after expiration to prevent
-- storage bloat.
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
    user_id UUID,
    agent_model TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes') NOT NULL,
    
    -- Optional: track if the form was submitted
    submitted_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'expired'))
);

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
-- Automatic cleanup function
-- ===================================================================
-- This function deletes expired records to prevent table bloat

CREATE OR REPLACE FUNCTION cleanup_expired_form_runs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM pending_form_runs 
    WHERE expires_at < NOW() 
       OR (status = 'pending' AND created_at < NOW() - INTERVAL '1 hour');
    
    RAISE NOTICE 'Cleaned up % expired form runs', 
        (SELECT COUNT(*) FROM pending_form_runs WHERE expires_at < NOW());
END;
$$;

-- ===================================================================
-- Optional: Create a trigger to auto-update status on expiration
-- ===================================================================
-- This is useful for debugging but can be omitted in production

CREATE OR REPLACE FUNCTION mark_expired_form_runs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.expires_at < NOW() AND NEW.status = 'pending' THEN
        NEW.status := 'expired';
    END IF;
    RETURN NEW;
END;
$$;

-- Uncomment below to enable auto-expiration marking
-- CREATE TRIGGER trigger_mark_expired_form_runs
--     BEFORE UPDATE ON pending_form_runs
--     FOR EACH ROW
--     EXECUTE FUNCTION mark_expired_form_runs();

-- ===================================================================
-- Manual cleanup command (run periodically via cron or scheduled job)
-- ===================================================================
-- SELECT cleanup_expired_form_runs();

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
