ALTER TABLE ai_conversations
    DROP COLUMN IF EXISTS summary,
    DROP COLUMN IF EXISTS summarized_up_to;
