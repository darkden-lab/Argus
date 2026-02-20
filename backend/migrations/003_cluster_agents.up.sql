-- Add connection_type and agent_id to clusters table.
-- connection_type distinguishes kubeconfig-based from agent-based clusters.
ALTER TABLE clusters
    ADD COLUMN connection_type VARCHAR(20) NOT NULL DEFAULT 'kubeconfig',
    ADD COLUMN agent_id UUID;

-- Make kubeconfig_enc nullable (agent clusters don't have one).
ALTER TABLE clusters
    ALTER COLUMN kubeconfig_enc DROP NOT NULL;

-- Agent registration tokens table.
-- Tokens are single-use, time-limited, and belong to a user.
CREATE TABLE agent_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    cluster_name VARCHAR(255) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    permissions VARCHAR(50) NOT NULL DEFAULT 'read-only',
    used BOOLEAN NOT NULL DEFAULT false,
    cluster_id UUID REFERENCES clusters(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_tokens_token_hash ON agent_tokens(token_hash);
CREATE INDEX idx_agent_tokens_created_by ON agent_tokens(created_by);
CREATE INDEX idx_clusters_connection_type ON clusters(connection_type);
CREATE INDEX idx_clusters_agent_id ON clusters(agent_id);
