-- OIDC group to RBAC role mappings
CREATE TABLE IF NOT EXISTS oidc_role_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oidc_group VARCHAR(500) NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    namespace VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(oidc_group, role_id, cluster_id, namespace)
);

CREATE INDEX IF NOT EXISTS idx_oidc_role_mappings_group ON oidc_role_mappings(oidc_group);
