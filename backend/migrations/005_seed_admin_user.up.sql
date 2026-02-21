-- Seed admin role permissions (full wildcard access)
INSERT INTO role_permissions (role_id, resource, action, scope_type, scope_id)
SELECT id, '*', '*', 'global', '*'
FROM roles WHERE name = 'admin'
ON CONFLICT DO NOTHING;

-- Seed default admin user: roco@darkden.net / adminroco
-- Password hashed with bcrypt (cost=10)
INSERT INTO users (email, password_hash, display_name, auth_provider)
VALUES ('roco@darkden.net', '$2a$10$FGNemk6ccTtNn1B/Z8kJ1eNsdDbsWlk8M1NuIr.Fx6HG/1uAD24ee', 'Roco', 'local')
ON CONFLICT (email) DO NOTHING;

-- Assign admin role to the default user
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.email = 'roco@darkden.net' AND r.name = 'admin'
ON CONFLICT DO NOTHING;
