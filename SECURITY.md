# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

Only the latest release receives security updates. We recommend always running the most recent version.

## Reporting Vulnerabilities

**Do not open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability in Argus, please report it responsibly:

1. **Email**: Send a detailed report to the project maintainers via a private channel (see repository contact info).
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
3. **Response time**: We aim to acknowledge reports within 48 hours and provide a fix timeline within 7 days.
4. **Disclosure**: We follow coordinated disclosure. Please allow us reasonable time to patch before public disclosure.

## Security Architecture

### Authentication

- **JWT tokens**: Access tokens (short-lived) and refresh tokens (long-lived) using HMAC-SHA256 signing via `golang-jwt/v5`.
- **Password hashing**: Passwords are hashed using bcrypt with the default cost factor. Plaintext passwords are never stored or logged.
- **OIDC integration**: Optional SSO via OpenID Connect (`coreos/go-oidc/v3`). OIDC state tokens are single-use and time-limited to prevent CSRF replay attacks.
- **Token refresh**: Expired access tokens can be refreshed using valid refresh tokens. Expired refresh tokens are rejected.

### Authorization (RBAC)

- **Granular permissions**: Role-based access control with three scope levels: global, cluster, and namespace.
- **Default deny**: Users with no permissions are denied all access.
- **Cluster isolation**: Cluster-scoped permissions are strictly isolated; access to one cluster does not grant access to another.
- **In-memory cache**: RBAC evaluations use a time-limited cache with automatic expiration and invalidation.

### Encryption

- **AES-256-GCM**: All sensitive data at rest (kubeconfigs, API keys) is encrypted using AES-256-GCM via the `internal/crypto` package.
- **Non-deterministic**: Each encryption operation uses a random nonce, ensuring identical plaintext produces different ciphertext.
- **Key validation**: Only valid AES key sizes (16, 24, or 32 bytes) are accepted.

### API Security

- **Parameterized queries**: All database queries use parameterized statements (`$1`, `$2`, etc.) to prevent SQL injection.
- **JSON Content-Type**: All API responses use `application/json` Content-Type, preventing XSS via content sniffing.
- **Input validation**: Request bodies are validated for required fields before processing.
- **CORS**: Cross-Origin Resource Sharing is configured via middleware with explicit origin allowlisting.
- **Retry with backoff**: The API client implements retry logic with exponential backoff for transient errors (408, 429, 5xx), preventing cascade failures.

### WebSocket Security

- **Authentication required**: WebSocket connections require a valid JWT token.
- **Message size limits**: Inbound WebSocket messages are limited to 4096 bytes.
- **Subscription isolation**: Clients only receive events for resources they have explicitly subscribed to.
- **Ping/pong heartbeat**: Connections are monitored with ping/pong frames; idle connections are closed.

### Terminal Security

- **Command sanitization**: Dangerous shell patterns (e.g., `rm -rf /`, fork bombs, `mkfs`, pipe-to-shell) are blocked.
- **Case-insensitive blocking**: Command pattern matching is case-insensitive to prevent evasion.
- **Rate limiting**: Per-user rate limiting prevents abuse (default: 10 commands/second).
- **Timeout capping**: Command timeouts are capped at 5 minutes to prevent resource exhaustion.
- **Audit logging**: All terminal commands are logged with user ID, session ID, and cluster ID.

### Cluster Agent

- **gRPC with TLS**: Agent-to-dashboard communication uses gRPC with optional TLS encryption.
- **Bidirectional streaming**: Agents run inside target clusters, eliminating the need to upload kubeconfigs to the dashboard.

## Deployment Best Practices

### Secrets Management

- Set a strong, random `JWT_SECRET` (at least 32 characters).
- Set a strong `ENCRYPTION_KEY` (64 hex characters = 32 bytes for AES-256).
- Never commit secrets to version control. Use environment variables or a secrets manager.
- Rotate secrets periodically and after any suspected compromise.

### Network Security

- Deploy behind a reverse proxy (e.g., NGINX, Traefik) with TLS termination.
- Enable TLS for gRPC connections using `GRPC_TLS_CERT` and `GRPC_TLS_KEY`.
- Restrict network access to the PostgreSQL database to internal-only.
- Use Kubernetes NetworkPolicies to isolate Argus components.

### Database Security

- Use a dedicated PostgreSQL user with minimal privileges.
- Enable SSL connections to PostgreSQL.
- Apply database migrations in order; do not skip or reorder them.
- Back up the database regularly and test restore procedures.

### Container Security

- Run containers as non-root users (the provided Dockerfiles use alpine with minimal packages).
- Keep base images updated to patch OS-level vulnerabilities.
- Scan container images for vulnerabilities before deployment.
- Use read-only root filesystems where possible.

### OIDC Configuration

- Always use HTTPS for `OIDC_ISSUER` and `OIDC_REDIRECT_URL`.
- Validate that the OIDC provider is trusted before enabling integration.
- Keep `OIDC_CLIENT_SECRET` confidential; never expose it in frontend code.

### Monitoring and Audit

- Enable audit logging to track all mutating API operations.
- Monitor terminal session logs for suspicious activity.
- Set up alerting on repeated authentication failures.
- Review RBAC permissions periodically; follow the principle of least privilege.

## Security Headers

When deploying behind a reverse proxy, configure the following security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; connect-src 'self' ws: wss:
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Dependencies

- Dependencies are managed via Go modules (`go.sum`) and npm (`package-lock.json`).
- Run `go vet ./...` and `npm run lint` regularly to catch potential issues.
- Use `npm audit` and `govulncheck` to scan for known vulnerabilities in dependencies.
