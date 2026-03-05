CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(20) NOT NULL DEFAULT 'system'
        CHECK (theme IN ('dark', 'light', 'system')),
    language VARCHAR(10) NOT NULL DEFAULT 'en'
        CHECK (language IN ('en')),
    sidebar_compact BOOLEAN NOT NULL DEFAULT false,
    animations_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
