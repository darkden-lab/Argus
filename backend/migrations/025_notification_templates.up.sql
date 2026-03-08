CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_type TEXT NOT NULL,
    name TEXT NOT NULL,
    subject_template TEXT NOT NULL DEFAULT '',
    body_template TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_templates_channel_type ON notification_templates(channel_type);
CREATE UNIQUE INDEX idx_notification_templates_default ON notification_templates(channel_type) WHERE is_default = true;

-- Insert the default email template (matches the previously hardcoded HTML)
INSERT INTO notification_templates (channel_type, name, subject_template, body_template, is_default)
VALUES (
    'email',
    'Default Email',
    '[{{.Severity | upper}}] {{.Title}}',
    '<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
.card { background: #fff; border-radius: 8px; padding: 24px; max-width: 600px; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.severity-info { border-left: 4px solid #3b82f6; }
.severity-warning { border-left: 4px solid #f59e0b; }
.severity-critical { border-left: 4px solid #ef4444; }
.title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.body { color: #555; line-height: 1.6; }
.meta { color: #999; font-size: 12px; margin-top: 16px; }
</style></head>
<body>
<div class="card severity-{{.Severity}}">
  <div class="title">{{.Title}}</div>
  <div class="body">{{.Body}}</div>
  <div class="meta">Category: {{.Category}} | {{.Timestamp}}</div>
</div>
</body>
</html>',
    true
);
