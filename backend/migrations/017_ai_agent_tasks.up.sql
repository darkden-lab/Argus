CREATE TABLE ai_agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    input_params JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    progress INT NOT NULL DEFAULT 0,
    current_step VARCHAR(500) DEFAULT '',
    total_steps INT NOT NULL DEFAULT 0,
    completed_steps INT NOT NULL DEFAULT 0,
    steps JSONB NOT NULL DEFAULT '[]',
    result TEXT,
    error TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_agent_tasks_user ON ai_agent_tasks(user_id);
CREATE INDEX idx_ai_agent_tasks_agent ON ai_agent_tasks(agent_id);
CREATE INDEX idx_ai_agent_tasks_status ON ai_agent_tasks(status);
