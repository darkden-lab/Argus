CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    color VARCHAR(7) DEFAULT '#6366f1',
    cluster_id VARCHAR(255) NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, cluster_id)
);

CREATE TABLE IF NOT EXISTS project_namespaces (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    namespace VARCHAR(255) NOT NULL,
    PRIMARY KEY (project_id, namespace)
);
