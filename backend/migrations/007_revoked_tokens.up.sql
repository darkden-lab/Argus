-- Refresh token revocation table for secure logout support.
-- Stores JTIs (JWT IDs) of revoked refresh tokens until they expire.
CREATE TABLE IF NOT EXISTS revoked_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_jti  VARCHAR(255) NOT NULL,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ  NOT NULL
);

-- Fast lookup by JTI when validating refresh tokens.
CREATE INDEX idx_revoked_tokens_jti ON revoked_tokens (token_jti);

-- Cleanup job index: find and delete expired entries efficiently.
CREATE INDEX idx_revoked_tokens_expires_at ON revoked_tokens (expires_at);
