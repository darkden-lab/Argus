-- Seed default permissions for built-in roles
-- operator: broad access except admin functions
INSERT INTO role_permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action FROM roles r
CROSS JOIN (VALUES
    ('clusters', 'read'), ('apps', 'read'), ('apps', 'write'),
    ('jobs', 'read'), ('jobs', 'write'), ('databases', 'read'),
    ('plugins', 'read'), ('terminal', 'write'), ('monitoring', 'read'),
    ('notifications', 'read')
) AS p(resource, action)
WHERE r.name = 'operator'
ON CONFLICT DO NOTHING;

-- developer: read access + terminal
INSERT INTO role_permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action FROM roles r
CROSS JOIN (VALUES
    ('clusters', 'read'), ('apps', 'read'), ('jobs', 'read'),
    ('databases', 'read'), ('monitoring', 'read'), ('terminal', 'write')
) AS p(resource, action)
WHERE r.name = 'developer'
ON CONFLICT DO NOTHING;

-- viewer: read-only access
INSERT INTO role_permissions (role_id, resource, action)
SELECT r.id, p.resource, p.action FROM roles r
CROSS JOIN (VALUES
    ('clusters', 'read'), ('apps', 'read'), ('jobs', 'read'),
    ('databases', 'read'), ('monitoring', 'read'), ('plugins', 'read')
) AS p(resource, action)
WHERE r.name = 'viewer'
ON CONFLICT DO NOTHING;
