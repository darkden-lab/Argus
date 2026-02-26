-- Setup system: mark existing deployments as setup-complete
-- If an admin user already exists (from seed or prior setup), we consider
-- setup already done and insert the flag so the wizard is skipped.
INSERT INTO settings (key, value, updated_at)
SELECT 'system_setup_completed', 'true'::jsonb, NOW()
WHERE EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE r.name = 'admin'
)
ON CONFLICT (key) DO NOTHING;
