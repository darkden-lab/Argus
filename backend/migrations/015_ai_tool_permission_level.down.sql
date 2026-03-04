-- Revert to boolean tools_enabled
ALTER TABLE ai_config ADD COLUMN tools_enabled BOOLEAN NOT NULL DEFAULT true;
UPDATE ai_config SET tools_enabled = (tool_permission_level != 'disabled');
ALTER TABLE ai_config DROP COLUMN tool_permission_level;
