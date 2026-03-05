INSERT INTO role_permissions (role_id, resource, action, scope_type, scope_id)
SELECT r.id, '*', '*', 'global', NULL
FROM roles r WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;
