DELETE FROM role_permissions rp
USING roles r
WHERE rp.role_id = r.id
  AND r.name = 'admin'
  AND rp.resource = '*'
  AND rp.action = '*'
  AND rp.scope_type = 'global';
