# API Reference

Argus exposes a REST API on port **8080** (configurable via `PORT`) and a gRPC agent server on port **9090** (configurable via `GRPC_PORT`).

All protected endpoints require a valid JWT in the `Authorization: Bearer <token>` header. Responses are JSON unless otherwise noted.

---

## Global Middleware

| Middleware | Scope | Description |
|-----------|-------|-------------|
| Rate Limit | All routes | 100 req/s per IP, burst 200 |
| CORS | All routes | Configurable via `ALLOWED_ORIGINS` |
| Security Headers | All routes | X-Frame-Options, HSTS, CSP, etc. |
| Strict Rate Limit | Auth routes | 10 req/s per IP, burst 20 |
| Auth (JWT) | Protected routes | Validates `Authorization: Bearer <token>` |
| Setup Guard | Protected routes | Returns 503 if initial setup is pending |
| Audit | Protected routes | Logs all mutating operations |

---

## Setup

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/setup/status` | No | Check if initial setup is required |
| POST | `/api/setup/init` | No | Create admin user and complete setup |

### GET /api/setup/status

**Response:**
```json
{ "setup_required": true }
```

### POST /api/setup/init

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "securepassword",
  "display_name": "Admin"
}
```

**Response (201):**
```json
{
  "user": { "id": "uuid", "email": "admin@example.com", "display_name": "Admin" },
  "access_token": "eyJ...",
  "refresh_token": "eyJ..."
}
```

---

## Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Login with email/password |
| POST | `/api/auth/refresh` | No | Refresh access token |
| GET | `/api/auth/me` | Yes | Get current user info |
| POST | `/api/auth/logout` | Yes | Revoke refresh token |

### POST /api/auth/login

**Request Body:**
```json
{ "email": "admin@example.com", "password": "securepassword" }
```

**Response (200):**
```json
{ "access_token": "eyJ...", "refresh_token": "eyJ..." }
```

### POST /api/auth/refresh

**Request Body:**
```json
{ "refresh_token": "eyJ..." }
```

**Response (200):**
```json
{ "access_token": "eyJ..." }
```

### POST /api/auth/logout

**Request Body:**
```json
{ "refresh_token": "eyJ..." }
```

---

## OIDC Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/oidc/authorize` | No | Redirect to OIDC provider |
| GET | `/api/auth/oidc/callback` | No | OIDC callback (exchanges code for tokens) |
| GET | `/api/auth/oidc/info` | No | OIDC provider info for frontend |

### GET /api/auth/oidc/authorize

Redirects the browser to the configured OIDC provider's authorization endpoint.

### GET /api/auth/oidc/callback

Handles the OIDC callback. On success, redirects to `FRONTEND_URL/auth/oidc/callback#access_token=...&refresh_token=...`.

### GET /api/auth/oidc/info

**Response (200):**
```json
{
  "enabled": true,
  "authorize_url": "/api/auth/oidc/authorize",
  "provider_name": "Microsoft Entra ID"
}
```

---

## User Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | Yes (admin) | List all users |
| POST | `/api/users` | Yes (admin) | Create a new user |
| DELETE | `/api/users/{id}` | Yes (admin) | Delete a user |

### POST /api/users

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "display_name": "New User"
}
```

---

## Clusters

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/clusters` | Yes | Add a cluster (kubeconfig upload) |
| GET | `/api/clusters` | Yes | List all clusters |
| GET | `/api/clusters/{id}` | Yes | Get cluster details |
| DELETE | `/api/clusters/{id}` | Yes | Remove a cluster |
| POST | `/api/clusters/{id}/health` | Yes | Trigger cluster health check |

### POST /api/clusters

**Request Body:**
```json
{
  "name": "production",
  "api_server_url": "https://k8s.example.com:6443",
  "kubeconfig": "<base64 kubeconfig content>"
}
```

---

## Agent Tokens

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/agents/install.sh` | No | Download agent install script |
| POST | `/api/clusters/agent-token` | Yes | Generate agent registration token |
| GET | `/api/clusters/agent-token` | Yes | List agent tokens |
| GET | `/api/clusters/agent-token/{id}` | Yes | Get token details |
| GET | `/api/clusters/agent-token/{id}/install-command` | Yes | Get install command for token |
| DELETE | `/api/clusters/agent-token/{id}` | Yes | Revoke an agent token |

### POST /api/clusters/agent-token

**Request Body:**
```json
{
  "cluster_name": "staging",
  "permissions": "read-only"
}
```

**Response (201):**
```json
{
  "token_id": "uuid",
  "install_command": "curl -sSL .../install.sh | bash -s -- ...",
  "token": "eyJ...",
  "token_info": { ... }
}
```

---

## Kubernetes Resources (Generic CRUD)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/clusters/{clusterID}/resources/{group}/{version}/{resource}` | Yes | List resources |
| POST | `/api/clusters/{clusterID}/resources/{group}/{version}/{resource}` | Yes | Create resource |
| GET | `/api/clusters/{clusterID}/resources/{group}/{version}/{resource}/{name}` | Yes | Get resource |
| PUT | `/api/clusters/{clusterID}/resources/{group}/{version}/{resource}/{name}` | Yes | Update resource |
| DELETE | `/api/clusters/{clusterID}/resources/{group}/{version}/{resource}/{name}` | Yes | Delete resource |

Use `_` as the group for core API group resources (e.g., `_/v1/pods`).

**Query Parameters:**
- `namespace` - Filter by namespace (optional)

### Convenience Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/clusters/{clusterID}/namespaces` | Yes | List namespaces |
| GET | `/api/clusters/{clusterID}/nodes` | Yes | List nodes |
| GET | `/api/clusters/{clusterID}/events` | Yes | List events (`?namespace=`) |

---

## K8s Reverse Proxy

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| ANY | `/api/proxy/k8s/{cluster_id}/**` | Yes | Proxy to K8s API server |

Forwards any request to the target cluster's Kubernetes API server. RBAC is enforced before proxying.

---

## Plugins

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/plugins` | Yes | List all registered plugins |
| GET | `/api/plugins/enabled` | Yes | List enabled plugins (manifests) |
| POST | `/api/plugins/{id}/enable` | Yes | Enable a plugin |
| POST | `/api/plugins/{id}/disable` | Yes | Disable a plugin |

Each plugin also registers its own routes under `/api/plugins/{plugin_id}/...`. See individual plugin manifests for details.

---

## Settings

### OIDC Configuration

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/settings/oidc/providers` | No | List OIDC provider presets |
| GET | `/api/settings/oidc` | Yes | Get current OIDC configuration |
| PUT | `/api/settings/oidc` | Yes | Update OIDC configuration |
| POST | `/api/settings/oidc/test` | Yes | Test OIDC provider discovery |

### OIDC Group Mappings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/settings/oidc/mappings` | Yes | List OIDC group-to-role mappings |
| POST | `/api/settings/oidc/mappings` | Yes | Create a mapping |
| DELETE | `/api/settings/oidc/mappings/{id}` | Yes | Delete a mapping |
| GET | `/api/settings/oidc/default-role` | Yes | Get default role for OIDC users |
| PUT | `/api/settings/oidc/default-role` | Yes | Set default role for OIDC users |

### POST /api/settings/oidc/mappings

**Request Body:**
```json
{
  "oidc_group": "k8s-admins",
  "role_name": "admin",
  "cluster_id": "uuid (optional)",
  "namespace": "default (optional)"
}
```

---

## RBAC

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/permissions` | Yes | Get current user's permissions |
| GET | `/api/roles` | Yes | List all roles with permissions |
| GET | `/api/roles/assignments` | Yes | List all user-role assignments |
| POST | `/api/roles/assign` | Yes | Assign a role to a user |
| DELETE | `/api/roles/revoke/{id}` | Yes | Revoke a role assignment |

### POST /api/roles/assign

**Request Body:**
```json
{
  "user_email": "user@example.com",
  "role_name": "viewer",
  "cluster_id": "uuid (optional)",
  "namespace": "default (optional)"
}
```

---

## Audit Log

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/audit-log` | Yes | List audit log entries |

**Query Parameters:**
- `user_id` - Filter by user
- `cluster_id` - Filter by cluster
- `action` - Filter by action (GET, POST, PUT, DELETE)
- `from_date` - Start date (ISO 8601)
- `to_date` - End date (ISO 8601)
- `limit` - Page size (default: 50)
- `offset` - Pagination offset

---

## Notifications

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/notifications` | Yes | List notifications |
| GET | `/api/notifications/unread-count` | Yes | Get unread count |
| PUT | `/api/notifications/{id}/read` | Yes | Mark notification as read |
| PUT | `/api/notifications/read-all` | Yes | Mark all as read |
| GET | `/api/notifications/preferences` | Yes | Get notification preferences |
| PUT | `/api/notifications/preferences` | Yes | Update preferences |
| GET | `/api/notifications/channels` | Yes | List notification channels |
| POST | `/api/notifications/channels` | Yes | Create a channel |
| PUT | `/api/notifications/channels/{id}` | Yes | Update a channel |
| DELETE | `/api/notifications/channels/{id}` | Yes | Delete a channel |
| POST | `/api/notifications/channels/{id}/test` | Yes | Send test notification |

### POST /api/notifications/channels

**Request Body:**
```json
{
  "type": "slack",
  "name": "ops-channel",
  "config": { "webhook_url": "https://hooks.slack.com/..." },
  "enabled": true
}
```

Supported channel types: `email`, `slack`, `teams`, `telegram`, `webhook`.

---

## AI Chat

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ai/config` | Yes | Get AI configuration |
| PUT | `/api/ai/config` | Yes | Update AI configuration |
| POST | `/api/ai/config/test` | Yes | Test AI provider connection |
| GET | `/api/ai/rag/status` | Yes | Get RAG indexer status |
| POST | `/api/ai/rag/reindex` | Yes | Trigger RAG reindex |

---

## WebSocket Endpoints

All WebSocket endpoints authenticate via `?token=<JWT>` query parameter or `Authorization: Bearer <token>` header.

| Path | Auth | Description |
|------|------|-------------|
| `/ws` | Yes (via query/header) | K8s watch events (real-time resource updates) |
| `/ws/terminal` | Yes (via query/header) | Web terminal (kubectl/exec) |
| `/ws/ai/chat` | Yes (via query/header) | AI chat streaming |
| `/ws/notifications` | Yes (via query/header) | Real-time notification push |

### /ws - K8s Watch Events

Subscribe to real-time Kubernetes resource change events. The hub broadcasts ADDED, MODIFIED, and DELETED events.

### /ws/terminal

Interactive terminal session. Supports two modes:
- **Smart mode** - kubectl command parser
- **Raw shell** - Direct exec into pods via SPDY

**Client messages:**
```json
{ "type": "input", "data": "kubectl get pods" }
{ "type": "resize", "cols": 120, "rows": 40 }
```

### /ws/ai/chat

Streaming AI chat with tool-use and confirmation flow.

**Client messages:**
```json
{ "type": "user_message", "content": "List all pods in default namespace" }
{ "type": "confirm_action", "confirmation_id": "uuid", "approved": true }
{ "type": "context_update", "context": { "cluster_id": "uuid", "namespace": "default" } }
{ "type": "new_conversation" }
```

**Server messages:**
```json
{ "type": "stream_delta", "content": "Here are the pods..." }
{ "type": "stream_end" }
{ "type": "confirm_request", "confirmation_id": "uuid", "tool_name": "delete_pod", "tool_args": "..." }
{ "type": "error", "content": "..." }
```

### /ws/notifications

Real-time push notifications for the current user.

---

## Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | No | Server health check |

**Response (200):**
```json
{ "status": "ok" }
```

---

## gRPC Agent Service (Port 9090)

The gRPC service `ClusterAgent` is defined in `proto/agent/v1/agent.proto`.

| RPC | Type | Description |
|-----|------|-------------|
| `Register` | Unary | Exchange one-time token for permanent agent credentials |
| `Stream` | Bidirectional streaming | K8s API proxy, watch events, heartbeat |

See [Cluster Agent](cluster-agent.md) for details.
