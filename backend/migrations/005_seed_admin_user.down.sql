-- Remove admin user role assignment
DELETE FROM user_roles
WHERE user_id = (SELECT id FROM users WHERE email = 'roco@darkden.net')
  AND role_id = (SELECT id FROM roles WHERE name = 'admin');

-- Remove default admin user
DELETE FROM users WHERE email = 'roco@darkden.net';

-- Remove admin role wildcard permissions
DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE name = 'admin')
  AND resource = '*' AND action = '*';
