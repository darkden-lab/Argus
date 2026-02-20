DROP INDEX IF EXISTS idx_ai_embeddings_vector;
DROP INDEX IF EXISTS idx_ai_embeddings_source;
DROP TABLE IF EXISTS ai_embeddings;

DROP INDEX IF EXISTS idx_ai_messages_created_at;
DROP INDEX IF EXISTS idx_ai_messages_conversation_id;
DROP TABLE IF EXISTS ai_messages;

DROP INDEX IF EXISTS idx_ai_conversations_updated_at;
DROP INDEX IF EXISTS idx_ai_conversations_user_id;
DROP TABLE IF EXISTS ai_conversations;

DROP TABLE IF EXISTS ai_config;

-- Note: we do not drop the vector extension as other tables may use it.
