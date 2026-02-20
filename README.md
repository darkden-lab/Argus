# Argus

**The all-seeing Kubernetes dashboard.** Multi-cluster management with a plugin-based architecture, AI assistant, web terminal, and async notifications.

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
git clone https://github.com/darkden-lab/argus.git
cd argus
make dev
```

This starts PostgreSQL, backend (:8080), and frontend (:3000).

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

```bash
# Backend
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

## License

[Business Source License 1.1](LICENSE)

- **Free**: Production use with up to 1 managed cluster
- **Commercial license**: Required for 2+ clusters in production
- **Change date**: Converts to Apache 2.0 on 2030-02-20

---

Built by [darkden-lab](https://github.com/darkden-lab)
