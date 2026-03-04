ALTER TABLE ai_conversations ADD COLUMN agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL;
