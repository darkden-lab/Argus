ALTER TABLE ai_conversations
    ADD COLUMN summary TEXT,
    ADD COLUMN summarized_up_to UUID;
