-- Re-create the non-unique index
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_source ON ai_embeddings(source_type, source_id);

-- Drop the unique constraint
DROP INDEX IF EXISTS uq_ai_embeddings_source;

-- Remove tools_enabled column
ALTER TABLE ai_config DROP COLUMN IF EXISTS tools_enabled;
