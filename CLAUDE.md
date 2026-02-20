# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Argus - Multi-cluster Kubernetes admin dashboard with plugin-based architecture. Go backend (REST + gRPC + WebSocket) + Next.js 16 frontend + PostgreSQL. Includes AI chat assistant, cluster agent system, web terminal, and async notification system with Kafka.

## Build & Run Commands

```bash
# Full stack with Docker Compose
make dev                    # docker compose up
make build                  # docker compose build

# Backend (Go 1.25)
cd backend && go build ./cmd/server/
cd backend && go test ./...            # all backend tests
cd backend && go test ./internal/auth/ # single package
cd backend && go test -v -run TestFunctionName ./internal/auth/ # single test
cd backend && go vet ./...

# Frontend (Next.js 16, Node)
cd frontend && npm install
cd frontend && npm run dev             # dev server on :3000
cd frontend && npm test                # Jest unit tests
cd frontend && npm run test:coverage
cd frontend && npm run test:e2e        # Playwright
cd frontend && npm run lint            # ESLint

# Protobuf generation
make proto                  # generates Go code from proto/agent/v1/agent.proto
```

## Architecture

### Backend (`backend/`)

- **Entry point**: `cmd/server/main.go` — wires all services, starts HTTP (:8080) and gRPC (:9090)
- **Router**: gorilla/mux with CORS middleware, auth middleware on protected subrouter
- **Database**: PostgreSQL via pgx/v5, migrations in `backend/migrations/` (golang-migrate)
- **Auth**: JWT (golang-jwt/v5) + optional OIDC (coreos/go-oidc/v3). Auth middleware in `internal/middleware/`
- **Config**: All via env vars with defaults in `internal/config/config.go` — `Load()` reads from `os.Getenv`

Key internal packages:
| Package | Purpose |
|---------|---------|
| `auth` | JWT service, auth handlers, OIDC integration |
| `cluster` | ClusterManager (multi-cluster), AgentServer (gRPC), encrypted kubeconfig storage |
| `core` | Generic K8s resource CRUD handler, convenience handlers (namespaces, nodes, events) |
| `plugin` | Plugin interface, Engine (register/enable/disable), per-cluster plugin config |
| `ws` | WebSocket Hub (pub/sub), K8s watch event multiplexing |
| `rbac` | RBAC engine with per-cluster/namespace granularity, in-memory cache |
| `audit` | Audit log store + middleware (auto-logs all mutating API calls) |
| `notifications` | MessageBroker interface, KafkaBroker, InMemoryBroker, channels (email, Slack, Teams, Telegram, webhook) |
| `terminal` | WebSocket terminal handler, smart mode (kubectl parser), raw shell (SPDY exec) |
| `ai` | LLM providers (Claude, OpenAI, Ollama), RAG with pgvector, tool-use with confirmation flow |
| `proxy` | K8s reverse proxy for kubectl auth |
| `crypto` | AES-256-GCM encrypt/decrypt for kubeconfig and API keys |
| `agentpb` | Generated protobuf/gRPC code for cluster agent |

### Frontend (`frontend/`)

- **Framework**: Next.js 16 (App Router, React 19, TypeScript)
- **Styling**: Tailwind CSS 4 + shadcn/ui (radix-ui)
- **State**: Zustand stores in `src/stores/` (auth, notifications, ai-chat, plugins, permissions, toast)
- **Testing**: Jest + React Testing Library (unit), Playwright (e2e)

Route structure (`src/app/`):
- `(dashboard)/` — main layout with sidebar: clusters, dashboard, plugins, settings, notifications, terminal
- `auth/`, `login/` — authentication pages

Component organization (`src/components/`):
- `ui/` — shadcn/ui primitives
- `layout/` — sidebar, header
- `resources/` — K8s resource views
- `plugins/` — plugin config/detail
- `terminal/` — web terminal
- `ai/` — chat panel, messages, code blocks, confirmation dialog
- `notifications/` — bell, preferences, history
- `auth/` — login forms

### Plugin System

Plugins implement the `Plugin` interface (`internal/plugin/plugin.go`):
```go
type Plugin interface {
    ID() string
    Manifest() Manifest
    RegisterRoutes(router *mux.Router, cm *cluster.Manager)
    RegisterWatchers(hub *ws.Hub, cm *cluster.Manager)
    OnEnable(ctx context.Context, pool *pgxpool.Pool) error
    OnDisable(ctx context.Context, pool *pgxpool.Pool) error
}
```

8 plugins in `backend/plugins/`: istio, prometheus, calico, cnpg, mariadb, keda, ceph, helm. Each has a JSON manifest and Go implementation.

### Cluster Agent (`agent/`)

Standalone Go binary that connects to dashboard via gRPC bidirectional streaming. Agents run inside target clusters, eliminating the need for kubeconfig upload. Proto definitions in `proto/agent/v1/agent.proto`.

### CLI (`cli/`)

`argus` CLI tool for managing clusters from terminal. Supports login, cluster listing, and kubeconfig download.

### Deployment (`deploy/`)

- `deploy/docker/` — Multi-stage Dockerfiles (Go alpine builder + alpine runtime for backend, Next.js for frontend)
- `deploy/helm/` — Helm charts: `argus` (main app) and `argus-agent` (cluster agent)
- `Jenkinsfile` + `jenkins/` — Jenkins CI/CD pipeline (lint, test, docker build/push to ghcr.io, Helm deploy)
- `.github/workflows/` — GitHub Actions CI (ci.yml, release.yml)

## Environment Variables

Key variables (see `internal/config/config.go` for all):
- `PORT` (8080), `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`
- `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URL`
- `KAFKA_BROKERS`, `SMTP_HOST/PORT/USER/PASS/FROM`
- `GRPC_PORT` (9090), `GRPC_TLS_CERT`, `GRPC_TLS_KEY`

## Testing

- **Backend tests**: `*_test.go` files alongside source. Run with `go test ./...`
- **Frontend unit tests**: `src/__tests__/**/*.test.{ts,tsx}`, setup in `src/__tests__/setup.ts`
- **Frontend e2e**: `e2e/` directory, Playwright config targets `http://localhost:3000`

## Conventions

- Backend routes follow REST pattern: `/api/<resource>` with gorilla/mux
- Frontend API client in `src/lib/api.ts` — wraps fetch with JWT auto-refresh, retry logic (408/429/5xx), and error toasts
- Frontend state via Zustand stores — each store exports a `use<Name>Store` hook with `create<Name>Store` pattern
- WebSocket connections at `/ws` (events) and `/ws/terminal` (terminal)
- Migrations numbered sequentially: `00N_description.{up,down}.sql`
- Plugins registered in `main.go` `registerPlugins()` — use `registerPluginWithError` generic helper for constructors that return errors
- All encrypted secrets use AES-256-GCM via `internal/crypto`
- Frontend env: `NEXT_PUBLIC_API_URL` for API base URL
