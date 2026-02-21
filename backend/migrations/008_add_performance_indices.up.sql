-- Performance indices for frequently queried columns.

-- Audit log: queries often filter by action type and resource name.
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log (resource);

-- User roles: prevent duplicate role assignments for the same user/role/cluster/namespace.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique
    ON user_roles (user_id, role_id, cluster_id, namespace);

-- Notification preferences: quick lookup of enabled preferences per user.
CREATE INDEX IF NOT EXISTS idx_notification_preferences_enabled
    ON notification_preferences (enabled);
