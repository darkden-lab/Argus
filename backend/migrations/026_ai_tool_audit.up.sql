CREATE TABLE IF NOT EXISTS ai_tool_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tool_name TEXT NOT NULL,
    arguments TEXT,
    result TEXT,
    is_error BOOLEAN DEFAULT FALSE,
    duration_ms BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_tool_audit_user ON ai_tool_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tool_audit_tool ON ai_tool_audit(tool_name, created_at DESC);
