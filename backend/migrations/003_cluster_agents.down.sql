DROP INDEX IF EXISTS idx_clusters_agent_id;
DROP INDEX IF EXISTS idx_clusters_connection_type;
DROP INDEX IF EXISTS idx_agent_tokens_created_by;
DROP INDEX IF EXISTS idx_agent_tokens_token_hash;
DROP TABLE IF EXISTS agent_tokens;

ALTER TABLE clusters
    ALTER COLUMN kubeconfig_enc SET NOT NULL;

ALTER TABLE clusters
    DROP COLUMN IF EXISTS agent_id,
    DROP COLUMN IF EXISTS connection_type;
