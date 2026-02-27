-- Remove seeded permissions for built-in roles
DELETE FROM role_permissions WHERE role_id IN (
    SELECT id FROM roles WHERE name IN ('operator', 'developer', 'viewer')
);
