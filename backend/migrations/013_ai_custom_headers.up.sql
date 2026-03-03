ALTER TABLE ai_config ADD COLUMN custom_headers JSONB DEFAULT '{}';
ALTER TABLE ai_config ADD COLUMN encrypted_api_key BYTEA;
