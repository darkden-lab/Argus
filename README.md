# Argus

![CI](https://github.com/darkden-lab/argus/actions/workflows/ci.yml/badge.svg)

**The all-seeing Kubernetes dashboard.** Multi-cluster management with a plugin-based architecture, AI assistant, web terminal, and async notifications.

> **Project Status**: Active development. The core platform (multi-cluster management, plugin system, AI assistant, web terminal, notifications) is feature-complete. See [Releases](https://github.com/darkden-lab/argus/releases) for the latest version.

---

## Features

- **Multi-cluster management** - Connect unlimited clusters via kubeconfig upload or lightweight gRPC agent
- **Plugin system** - Extensible architecture with 8 built-in plugins (Istio, Prometheus, Calico, CNPG, MariaDB, KEDA, Ceph, Helm)
- **AI chat assistant** - Integrated RAG + tool-use with multi-provider support (Claude, OpenAI, Ollama)
- **Web terminal** - Smart mode (kubectl command parser) and raw shell (exec into pods)
- **Real-time updates** - WebSocket-based K8s watch event streaming
- **Async notifications** - Kafka-backed multi-channel alerts (Email, Slack, Teams, Telegram, Webhook)
- **RBAC** - Granular per-cluster/namespace permissions with in-memory cache
- **Auth** - JWT + OIDC/SSO support
- **Audit logging** - Automatic audit trail for all mutating operations
- **CLI** - `argus` command-line tool for login, cluster management, and kubeconfig download

## Architecture

```
                          +-------------------+
                          |    Frontend        |
                          |  Next.js 16 + React 19  |
                          |  Tailwind + shadcn/ui   |
                          +---------+---------+
                                    |
                          +---------+---------+
                          |     Backend        |
                          |   Go (gorilla/mux) |
                          |  REST + WebSocket  |
                          +---------+---------+
                           /        |        \
              +-----------+   +-----+-----+   +-----------+
              | PostgreSQL |   |   gRPC    |   |   Kafka   |
              | + pgvector |   |  Agent    |   | (optional)|
              +------------+  |  Server   |   +-----------+
                              +-----+-----+
                                    |
                          +---------+---------+
                          |   Cluster Agent    |
                          | (runs in target K8s)|
                          +-------------------+
```

| Component | Tech |
|-----------|------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Zustand, xterm.js |
| Backend | Go 1.25, gorilla/mux, gorilla/websocket, pgx/v5, golang-jwt/v5, client-go, gRPC |
| Database | PostgreSQL 16 + pgvector (AI embeddings) |
| Agent | Go binary, gRPC bidirectional streaming, in-cluster ServiceAccount |
| CLI | Go binary, Cobra, cross-platform |
| Notifications | Kafka (async) or in-memory broker (dev), multi-channel |
| AI | LLM providers (Claude/OpenAI/Ollama), RAG with pgvector, K8s tool-use |

## Quick Start

### Docker Compose (development)

```bash
# Clone the repository
git clone https://github.com/darkden-lab/argus.git
cd argus

# Copy environment file
cp .env.example .env

# Start with Docker Compose
make dev
```

Open http://localhost:3000 to access the dashboard. This starts PostgreSQL, backend (:8080), and frontend (:3000).

### Helm (production)

```bash
helm install argus deploy/helm/argus \
  --set backend.config.jwtSecret=your-secret \
  --set backend.config.encryptionKey=your-32-char-key \
  --set ingress.enabled=true \
  --set ingress.host=argus.yourdomain.com
```

### Connect a Cluster

**Option A: Kubeconfig upload** - Upload via the dashboard UI.

**Option B: Agent** - Deploy the lightweight agent in your target cluster:

```bash
helm install argus-agent deploy/helm/argus-agent \
  --set agent.dashboardURL=https://argus.yourdomain.com \
  --set agent.token=YOUR_AGENT_TOKEN
```

Or use the one-liner from the dashboard UI (Settings > Clusters > Add Agent).

## CLI

Install the `argus` CLI for terminal-based management:

```bash
# Login
argus login --server https://argus.yourdomain.com

# List clusters
argus get clusters

# Download kubeconfig
argus get kubeconfig my-cluster
```

Pre-built binaries available for Linux, macOS, and Windows in [Releases](https://github.com/darkden-lab/argus/releases). Also available as `.deb`, `.rpm`, and `.exe` packages.

## Plugins

| Plugin | Description |
|--------|-------------|
| Istio | Service mesh visualization and traffic management |
| Prometheus | Metrics dashboards and alerting rules |
| Calico | Network policy management |
| CNPG | CloudNativePG PostgreSQL operator management |
| MariaDB | MariaDB operator management |
| KEDA | Event-driven autoscaler configuration |
| Ceph | Rook-Ceph storage management |
| Helm | Helm release management and history |

Plugins are auto-detected and can be enabled/disabled per cluster.

## Development

### Prerequisites

- **Go** 1.25+
- **Node.js** 20+
- **Docker** and Docker Compose
- **Make** (optional, for convenience targets)

### Running Locally

```bash
# Backend
cd backend && go build ./cmd/server/
cd backend && go test ./...        # Run tests
cd backend && go vet ./...         # Lint

# Frontend
cd frontend && npm install
cd frontend && npm run dev         # Dev server (:3000)
cd frontend && npm test            # Unit tests (Jest)
cd frontend && npm run test:e2e    # E2E tests (Playwright)
cd frontend && npm run lint        # ESLint

# Protobuf
make proto                         # Regenerate gRPC code
```

### Make Targets

| Target | Description |
|--------|-------------|
| `make dev` | Start full stack with Docker Compose |
| `make build` | Build all Docker images |
| `make test` | Run all backend and frontend tests |
| `make lint` | Run linters (go vet + ESLint) |
| `make coverage` | Generate test coverage reports |
| `make e2e-smoke` | Run E2E smoke tests |
| `make proto` | Regenerate gRPC code from proto files |
| `make helm-lint` | Lint Helm charts |
| `make clean` | Remove build artifacts and caches |

## Configuration

All backend configuration via environment variables. See [`backend/internal/config/config.go`](backend/internal/config/config.go) for defaults.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP server port |
| `DATABASE_URL` | `postgres://...` | PostgreSQL connection string |
| `JWT_SECRET` | - | Secret for JWT signing |
| `ENCRYPTION_KEY` | - | 32-byte hex key for AES-256-GCM |
| `GRPC_PORT` | `9090` | gRPC agent server port |
| `OIDC_ISSUER` | - | OIDC provider URL (optional) |
| `KAFKA_BROKERS` | - | Kafka brokers (optional, uses in-memory if empty) |

## Security

See [SECURITY.md](SECURITY.md) for the security policy, vulnerability reporting process, and detailed documentation of Argus security architecture (authentication, RBAC, encryption, API security, WebSocket security, terminal sandboxing, and deployment best practices).

## License

[Business Source License 1.1](LICENSE)

- **Free**: Production use with up to 1 managed cluster
- **Commercial license**: Required for 2+ clusters in production
- **Change date**: Converts to Apache 2.0 on 2030-02-20

## Documentation

- [API Reference](docs/api-reference.md)
- [Deployment Guide](docs/deployment-guide.md)
- [Architecture](docs/architecture.md)
- [Plugin Development](docs/plugin-development.md)
- [Cluster Agent](docs/cluster-agent.md)
- OIDC Setup Guides:
  - [Microsoft Entra ID](docs/oidc-setup/entraid.md)
  - [Google](docs/oidc-setup/google.md)
  - [Okta](docs/oidc-setup/okta.md)
  - [Keycloak](docs/oidc-setup/keycloak.md)
  - [Auth0](docs/oidc-setup/auth0.md)

---

Built by [darkden-lab](https://github.com/darkden-lab)
