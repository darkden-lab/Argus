-- AI Chat Feature: pgvector + conversations + messages + embeddings

CREATE EXTENSION IF NOT EXISTS vector;

-- AI provider configuration (stored in DB for admin UI)
CREATE TABLE ai_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL DEFAULT 'claude',
    api_key_enc BYTEA,
    model VARCHAR(100) NOT NULL DEFAULT 'claude-sonnet-4-20250514',
    embed_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
    base_url VARCHAR(500),
    max_tokens INT NOT NULL DEFAULT 4096,
    temperature NUMERIC(3,2) NOT NULL DEFAULT 0.10,
    enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a single config row
INSERT INTO ai_config (provider, enabled) VALUES ('claude', false);

-- Conversations
CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
    cluster_id UUID REFERENCES clusters(id) ON DELETE SET NULL,
    namespace VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX idx_ai_conversations_updated_at ON ai_conversations(updated_at);

-- Messages
CREATE TABLE ai_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL, -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,
    tool_calls JSONB,
    tool_call_id VARCHAR(255),
    tokens_used INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conversation_id ON ai_messages(conversation_id);
CREATE INDEX idx_ai_messages_created_at ON ai_messages(created_at);

-- Vector embeddings for RAG
CREATE TABLE ai_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type VARCHAR(50) NOT NULL, -- 'k8s_docs', 'crd', 'plugin', 'cluster_resource'
    source_id VARCHAR(500) NOT NULL,  -- unique identifier for the source
    chunk_index INT NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    embedding vector(1536),           -- OpenAI text-embedding-3-small dimension
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_embeddings_source ON ai_embeddings(source_type, source_id);

-- IVFFlat index for approximate nearest neighbor search
-- Note: requires at least some rows before creating; create after initial indexing
-- For now, use exact search (no index). The indexer will create the IVFFlat index
-- after inserting initial data.
CREATE INDEX idx_ai_embeddings_vector ON ai_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
