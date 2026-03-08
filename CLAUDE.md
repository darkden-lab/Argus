# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Argus - Multi-cluster Kubernetes admin dashboard with plugin-based architecture. Go backend (REST + gRPC + Socket.IO + WebSocket) + Next.js 16 frontend + PostgreSQL. Includes AI chat assistant, cluster agent system, web terminal, and async notification system with Kafka.

## Build & Run Commands

```bash
# Full stack with Docker Compose
make dev                    # docker compose up (foreground)
make docker-up              # docker compose up -d (background)
make docker-down            # docker compose down
make build                  # docker compose build

# Backend (Go 1.25)
cd backend && go build ./cmd/server/
cd backend && go test ./...            # all backend tests
cd backend && go test ./internal/auth/ # single package
cd backend && go test -v -run TestFunctionName ./internal/auth/ # single test
cd backend && go vet ./...
make cli-build              # build argus CLI to bin/argus
make agent-build            # build cluster agent to bin/argus-agent

# Frontend (Next.js 16, Node 22+)
cd frontend && npm install
cd frontend && npm run dev             # dev server on :3000
cd frontend && npm test                # Jest unit tests
cd frontend && npm run test:coverage
cd frontend && npm run test:e2e        # Playwright
cd frontend && npm run lint            # ESLint

# Protobuf generation
make proto                  # generates Go code from proto/agent/v1/agent.proto

# All tests
make test                   # backend go test + frontend jest

# Linting
make lint                   # backend go vet + frontend eslint
make lint-backend           # go vet
make lint-frontend          # eslint
# CI uses golangci-lint (config: backend/.golangci.yml) — includes errcheck, staticcheck, gocritic, misspell

# Coverage
make coverage               # backend + frontend coverage reports
make coverage-backend       # go test with coverage
make coverage-frontend      # jest with coverage

# Database migrations
make migrate-up             # run all pending migrations
make migrate-down           # rollback last migration

# Helm
make helm-lint              # lint all Helm charts

# Cleanup
make clean                  # remove build artifacts and caches

# E2E smoke test
make e2e-smoke              # full Docker Compose stack test

# Kafka (optional)
docker compose --profile kafka up     # start with Kafka + Zookeeper
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
| `socketio` | Socket.IO server with namespaces: `/k8s`, `/ai`, `/terminal`, `/notifications` |
| `ws` | WebSocket Hub (pub/sub), K8s watch event multiplexing (legacy, used by Socket.IO k8s namespace) |
| `rbac` | RBAC engine with per-cluster/namespace granularity, in-memory cache |
| `audit` | Audit log store + middleware (auto-logs all mutating API calls) |
| `notifications` | MessageBroker interface, KafkaBroker, InMemoryBroker, channels (email, Slack, Teams, Telegram, webhook) |
| `terminal` | WebSocket terminal handler, smart mode (kubectl parser), raw shell (SPDY exec) |
| `ai` | LLM providers (Claude, OpenAI, Ollama), RAG with pgvector, tool-use with confirmation flow |
| `setup` | First-run setup wizard: checks if initial admin exists, handles onboarding |
| `settings` | System settings key-value store (admin-only) |
| `proxy` | K8s reverse proxy for kubectl auth |
| `crypto` | AES-256-GCM encrypt/decrypt for kubeconfig and API keys |
| `pvcbrowser` | PVC file browser: HTTP endpoints, file operations, session management |
| `agentpb` | Generated protobuf/gRPC code for cluster agent (in `pkg/agentpb`) |

**API docs**: OpenAPI spec at `backend/docs/openapi.yaml`, served via Swagger handler in `backend/docs/handler.go`

### Frontend (`frontend/`)

- **Framework**: Next.js 16 (App Router, React 19, TypeScript)
- **Styling**: Tailwind CSS 4 + shadcn/ui (radix-ui)
- **State**: Zustand stores in `src/stores/` (auth, cluster, dashboard, notifications, ai-chat, plugins, permissions, toast, ui, pvc-browser)
- **i18n**: next-intl v4 — messages in `frontend/messages/en.json` (800+ strings)
- **Testing**: Jest 30 + React Testing Library (unit), Playwright (e2e)

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

`argus` CLI tool for managing clusters from terminal. Supports login, cluster listing, kubeconfig generate/list/remove, logout, and version. Uses cobra for commands, config at `~/.argus/config.json`.

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
- `APP_ENV` (development) — set to "production" to enforce secret validation

See `.env.example` for a complete list with descriptions.

## Security

- **Production mode**: Set `APP_ENV=production` to block startup with default dev secrets
- **Secret validation**: `config.Validate()` checks JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL
- **See `SECURITY.md`** for vulnerability reporting and security features

## Testing

- **Backend tests**: `*_test.go` files alongside source. Run with `go test ./...`
- **Frontend unit tests**: `src/__tests__/**/*.test.{ts,tsx}`, setup in `src/__tests__/setup.ts`
- **Frontend e2e**: `e2e/` directory, Playwright config targets `http://localhost:3000`
- **Frontend scope**: 51 test files, ~973 tests (17/37 pages tested, 14/105 components tested)
- **Backend scope**: 65 test files, 587 test functions, 20/22 packages covered
- **Backend gaps**: `socketio/` and `pvcbrowser/` have zero tests; `ai/service.go` mostly untested
- **Jest config**: `jest.config.mjs` (ESM `.mjs`, not `.ts` — avoids ts-node dependency with Jest 30)
- **Coverage reporters**: text, json-summary, lcov
- **E2E smoke test**: `scripts/e2e-smoke.sh` (Docker Compose integration test)

## Conventions

- Backend routes follow REST pattern: `/api/<resource>` with gorilla/mux
- Frontend API client in `src/lib/api.ts` — wraps fetch with JWT auto-refresh, retry logic (408/429/5xx), and error toasts
- Frontend state via Zustand stores — each store exports a `use<Name>Store` hook with `create<Name>Store` pattern
- Real-time connections via Socket.IO at `/socket.io/` with namespaces (`/k8s`, `/ai`, `/terminal`, `/notifications`). Auth via handshake `{ auth: { token: "jwt" } }`
- Migrations numbered sequentially: `00N_description.{up,down}.sql`
- Plugins registered in `main.go` `registerPlugins()` — use `registerPluginWithError` generic helper for constructors that return errors
- All encrypted secrets use AES-256-GCM via `internal/crypto`
- Frontend env: `NEXT_PUBLIC_API_URL` for API base URL
- Plugins use `//go:embed` for manifest.json loading (not runtime.Caller)
- Dependabot configured for Go, npm, GitHub Actions, Docker (`.github/dependabot.yml`)
- Database uses `pgvector/pgvector:0.8.0-pg16` image (PostgreSQL 16 with pgvector for AI embeddings)
- Backend auto-runs migrations on startup via `db.RunMigrations()` — no need to run `make migrate-up` for dev
- Backend handlers follow `NewHandlers() + RegisterRoutes(router)` pattern — each package self-registers its routes

## Gotchas

- **Docker healthcheck**: Use `127.0.0.1` not `localhost` in Alpine containers (wget resolves to IPv6 `[::1]` which fails)
- **K8s runAsNonRoot**: Must use numeric UID (not user names like "appuser"). Backend: `65534` (nobody), Frontend: `1001` (nextjs)
- **Docker Desktop K8s**: Images loaded via `docker load` appear as `docker.io/library/<name>` — use `imagePullPolicy: IfNotPresent`
- **PGDATA in StatefulSet**: Needs subpath to avoid `lost+found` conflict
- **ESLint 10**: Breaks `eslint-plugin-react` — do not upgrade past ESLint 9
- **ts-jest 29.x with Jest 30**: Works currently but may break — monitor compatibility
- **React Compiler lint rules**: Disabled in `eslint.config.mjs` (set-state-in-effect, static-components, refs, purity, immutability) — re-enable only when adopting React Compiler
- **Frontend path alias**: `@/*` maps to `./src/*` — use `@/` imports in all frontend code
- **golangci-lint exclusions**: `pkg/agentpb` is excluded (generated code); errcheck and gocritic relaxed in `_test.go`
- **Socket.IO + WebSocket coexistence**: The `ws` package (Hub) still exists as the internal event bus, but clients connect via Socket.IO namespaces in `socketio` package. Legacy `/ws` WebSocket endpoint is still wired for backward compat but new features should use Socket.IO namespaces
- **Go module paths**: Three separate Go modules — `backend/`, `agent/`, `cli/` — each with their own `go.mod`. The CI lints and tests `backend` and `agent` separately
- **AI system scope**: 38 tools (25 read-only + 8 write + memory), 7 builtin agents, confirmation flow for destructive ops. Tools defined in `ai/tools/definitions.go`, executor in `ai/tools/executor.go`
- **OpenAPI spec**: `backend/docs/openapi.yaml` has 155+ paths (4,432 lines) — keep in sync when adding endpoints
- **Plugin endpoint counts**: Prometheus(23), Calico(13), Istio(17), CNPG(17), MariaDB(23), KEDA(18), Ceph(23), Helm(8) = 142 total
- **Notification system**: 5 channels, digest aggregator (daily/weekly), routing by category, preferences per-user. Templates in `notifications/channels/` are currently hardcoded
- **Terminal security**: Command sanitization blocks dangerous patterns (rm -rf /, fork bombs, mkfs, pipe-to-shell). Rate limit: 10 cmd/s per user. Middleware in `terminal/middleware.go`
