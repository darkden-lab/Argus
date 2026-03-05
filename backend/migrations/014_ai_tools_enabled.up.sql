-- Add tools_enabled column to ai_config
ALTER TABLE ai_config ADD COLUMN IF NOT EXISTS tools_enabled BOOLEAN NOT NULL DEFAULT true;

-- Add unique constraint for RAG upsert (replaces incorrect ON CONFLICT (id))
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_embeddings_source ON ai_embeddings(source_type, source_id, chunk_index);

-- Drop the redundant non-unique index if it exists
DROP INDEX IF EXISTS idx_ai_embeddings_source;
