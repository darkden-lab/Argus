-- Remove hardcoded seed admin user (was in 005_seed_admin_user.up.sql)
-- Only remove if setup wizard has been completed (other admin users exist)
DELETE FROM user_roles WHERE user_id IN (
    SELECT id FROM users WHERE email = 'roco@darkden.net'
);
DELETE FROM users WHERE email = 'roco@darkden.net';
