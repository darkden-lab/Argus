# Architecture

## System Overview

Argus is a multi-cluster Kubernetes dashboard with a plugin-based architecture. The system consists of a Go backend, a Next.js frontend, PostgreSQL with pgvector, an optional Kafka message broker, and lightweight gRPC agents deployed into target clusters.

```mermaid
graph TB
    subgraph "Browser"
        FE[Frontend<br/>Next.js 16 + React 19]
    end

    subgraph "Backend Server"
        API[REST API<br/>gorilla/mux :8080]
        WS[WebSocket Hub<br/>K8s events, terminal, AI]
        GRPC[gRPC Server<br/>:9090]
        MW[Middleware Stack<br/>CORS, Rate Limit, Auth,<br/>RBAC, Audit]
        PE[Plugin Engine<br/>8 built-in plugins]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL 16<br/>+ pgvector)]
        KF[Kafka<br/>optional]
    end

    subgraph "Target Clusters"
        A1[Cluster Agent]
        A2[Cluster Agent]
    end

    FE -->|HTTP/WS| API
    FE -->|WebSocket| WS
    API --> MW
    MW --> PE
    API --> PG
    WS --> PG
    API --> KF
    A1 -->|gRPC stream| GRPC
    A2 -->|gRPC stream| GRPC
    GRPC --> PG
```

## Request Flow

Every HTTP request passes through a layered middleware stack:

```mermaid
sequenceDiagram
    participant C as Client
    participant SH as Security Headers
    participant CO as CORS
    participant RL as Rate Limiter
    participant AU as Auth (JWT)
    participant SG as Setup Guard
    participant AD as Audit Logger
    participant RB as RBAC
    participant H as Handler

    C->>SH: Request
    SH->>CO: Add security headers
    CO->>RL: CORS validation
    RL->>AU: Rate limit check (100 req/s)
    AU->>SG: Validate JWT
    SG->>AD: Check setup status
    AD->>RB: Log mutating operations
    RB->>H: Check permissions
    H->>C: Response
```

**Middleware order (outermost to innermost):**

1. **Security Headers** -- X-Frame-Options: DENY, HSTS, CSP, X-Content-Type-Options
2. **CORS** -- Validates `Origin` against `ALLOWED_ORIGINS`
3. **Rate Limiter** -- 100 req/s per IP (burst 200); auth routes: 10 req/s (burst 20)
4. **Auth** -- Validates JWT from `Authorization: Bearer` header
5. **Setup Guard** -- Returns 503 if initial setup is not completed
6. **Audit** -- Logs all POST/PUT/DELETE operations to `audit_logs` table
7. **Handler** -- Business logic

## OIDC Authentication Flow

```mermaid
sequenceDiagram
    participant U as User Browser
    participant FE as Frontend
    participant BE as Backend
    participant OP as OIDC Provider

    U->>FE: Click "Login with SSO"
    FE->>BE: GET /api/auth/oidc/authorize
    BE->>BE: Generate state parameter
    BE->>OP: Redirect to authorization endpoint
    OP->>U: Login page
    U->>OP: Enter credentials
    OP->>BE: GET /api/auth/oidc/callback?code=...&state=...
    BE->>BE: Validate state
    BE->>OP: Exchange code for tokens
    OP->>BE: ID token + access token
    BE->>BE: Verify ID token, extract claims
    BE->>BE: Upsert user, map OIDC groups to roles
    BE->>BE: Generate JWT (access + refresh)
    BE->>FE: Redirect to /auth/oidc/callback#access_token=...
    FE->>FE: Store tokens, redirect to dashboard
```

## WebSocket Event Flow

```mermaid
graph LR
    subgraph "Kubernetes Cluster"
        W[Watch API]
    end

    subgraph "Backend"
        WH[Watch Handler]
        HUB[WebSocket Hub]
        EP[Event Producer]
        KB[Kafka Broker]
    end

    subgraph "Clients"
        C1[Browser 1]
        C2[Browser 2]
    end

    W -->|watch events| WH
    WH -->|publish| HUB
    HUB -->|broadcast| C1
    HUB -->|broadcast| C2
    HUB -->|hook| EP
    EP -->|publish| KB
```

The WebSocket Hub is a pub/sub system. When a Kubernetes watch event fires (ADDED, MODIFIED, DELETED), it is:
1. Published to the Hub for real-time delivery to connected browsers
2. Hooked by the EventProducer for async notification processing via Kafka

## Plugin System Architecture

```mermaid
graph TB
    subgraph "Plugin Engine"
        E[Engine<br/>register, enable, disable]
        R[Route Registration]
        W[Watcher Registration]
    end

    subgraph "Plugin Interface"
        P[Plugin<br/>ID, Manifest,<br/>RegisterRoutes,<br/>RegisterWatchers,<br/>OnEnable, OnDisable]
    end

    subgraph "Built-in Plugins"
        I[Istio]
        PR[Prometheus]
        CA[Calico]
        CN[CNPG]
        MA[MariaDB]
        KE[KEDA]
        CE[Ceph]
        HE[Helm]
    end

    I --> P
    PR --> P
    CA --> P
    CN --> P
    MA --> P
    KE --> P
    CE --> P
    HE --> P
    P --> E
    E --> R
    E --> W
```

Each plugin provides:
- **manifest.json** -- Metadata, routes, watchers, frontend navigation
- **Go implementation** -- Implements the `Plugin` interface
- **Frontend components** -- React pages and dashboard widgets

Plugins are registered at startup in `main.go` and can be enabled/disabled per cluster at runtime via the API.

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `users` | User accounts (local + OIDC) |
| `refresh_tokens` | JWT refresh token tracking and revocation |
| `clusters` | Registered Kubernetes clusters |
| `roles` | RBAC role definitions |
| `role_permissions` | Permissions attached to roles |
| `user_roles` | User-role assignments (scoped to cluster/namespace) |
| `oidc_role_mappings` | OIDC group to RBAC role mappings |
| `settings` | Key-value application settings (OIDC config, setup status) |
| `audit_logs` | Audit trail for all mutating API operations |
| `notifications` | Stored notifications per user |
| `notification_preferences` | Per-user notification preferences |
| `notification_channels` | Configured notification channels (Slack, email, etc.) |
| `agent_tokens` | Agent registration tokens |
| `plugin_config` | Per-cluster plugin enable/disable state |
| `ai_config` | AI provider configuration |
| `ai_conversations` | AI chat conversation history |
| `ai_embeddings` | pgvector embeddings for RAG |

## Component Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Zustand, xterm.js |
| Backend | Go 1.25, gorilla/mux, gorilla/websocket, pgx/v5, golang-jwt/v5, client-go, gRPC |
| Database | PostgreSQL 16 + pgvector 0.8.0 |
| Agent | Go, gRPC bidirectional streaming, in-cluster ServiceAccount |
| Notifications | Kafka (async) or in-memory broker (dev), SMTP, Slack, Teams, Telegram, Webhook |
| AI | Claude / OpenAI / Ollama, RAG with pgvector, tool-use with confirmation |
| CI/CD | GitHub Actions, Jenkins, Docker, Helm |
