-- Replace boolean tools_enabled with granular tool_permission_level
ALTER TABLE ai_config ADD COLUMN tool_permission_level VARCHAR(20) NOT NULL DEFAULT 'all';
UPDATE ai_config SET tool_permission_level = CASE WHEN tools_enabled THEN 'all' ELSE 'disabled' END;
ALTER TABLE ai_config DROP COLUMN tools_enabled;
