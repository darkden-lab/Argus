-- Remove hardcoded seed admin user (was in 005_seed_admin_user.up.sql)
DELETE FROM user_roles WHERE user_id IN (
    SELECT id FROM users WHERE email = 'roco@darkden.net'
);
DELETE FROM users WHERE email = 'roco@darkden.net';

-- If no admin users remain, reset setup completion flag
-- so the setup wizard is triggered on fresh installs.
DELETE FROM settings
WHERE key = 'system_setup_completed'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE r.name = 'admin'
  );
