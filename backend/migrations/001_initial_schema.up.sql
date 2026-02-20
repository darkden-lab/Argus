CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    display_name VARCHAR(255) NOT NULL,
    auth_provider VARCHAR(50) NOT NULL DEFAULT 'local',
    oidc_subject VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    resource VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    scope_type VARCHAR(50) NOT NULL DEFAULT 'global',
    scope_id VARCHAR(255)
);

CREATE TABLE clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    api_server_url VARCHAR(500) NOT NULL,
    kubeconfig_enc BYTEA NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'disconnected',
    labels JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_health TIMESTAMPTZ
);

CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
    namespace VARCHAR(255)
);

CREATE TABLE plugins (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    manifest JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plugin_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plugin_id VARCHAR(100) NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'installed',
    config JSONB DEFAULT '{}',
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(plugin_id, cluster_id)
);

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    cluster_id UUID REFERENCES clusters(id),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(255),
    details JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_cluster_id ON user_roles(cluster_id);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_plugin_state_plugin_id ON plugin_state(plugin_id);
CREATE INDEX idx_plugin_state_cluster_id ON plugin_state(cluster_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);

-- Seed default roles
INSERT INTO roles (name, description) VALUES
    ('admin', 'Full access to all clusters and resources'),
    ('operator', 'Can manage workloads and configurations'),
    ('developer', 'Can view and manage workloads in assigned namespaces'),
    ('viewer', 'Read-only access to assigned resources');
