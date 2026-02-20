# Implementation Plan: Cluster Agent (gRPC)

**Feature:** Agente de conexion a clusters sin kubeconfig
**Design doc:** ../2026-02-20-features-expansion-design.md#feature-2
**Date:** 2026-02-20
**Status:** Pendiente
**Priority:** 2

---

## Phase 1: Proto Definitions + gRPC Server

### Task 1.1: Proto definitions and code generation
**Files to create:**
- `proto/agent/v1/agent.proto` - Full proto definitions (ClusterAgent service, all messages)
- `Makefile` update - Add `proto` target for code generation with protoc

**Go dependencies:** `google.golang.org/grpc`, `google.golang.org/protobuf`

**Acceptance criteria:**
- Proto compiles and generates Go code
- All message types defined: Register, Stream, K8sRequest/Response, Watch, Ping/Pong, ClusterInfo

### Task 1.2: gRPC server in dashboard backend
**Files to create:**
- `backend/internal/cluster/agent_server.go` - gRPC server implementing ClusterAgent service
  - Register(): validate token, create cluster entry, return permanent credentials
  - Stream(): bidirectional stream handler, routes K8s requests to connected agents
- `backend/internal/cluster/agent_server_test.go`

**Files to modify:**
- `backend/cmd/server/main.go` - Start gRPC server alongside HTTP server (separate port)
- `backend/internal/config/config.go` - Add GRPC_PORT, GRPC_TLS_CERT, GRPC_TLS_KEY

**Dependencies:** Task 1.1

### Task 1.3: Agent token management
**Files to create:**
- `backend/internal/cluster/agent_registry.go` - Token generation (JWT, 24h expiry, single-use), validation, storage
- `backend/internal/cluster/agent_handlers.go` - REST endpoints:
  - POST /api/clusters/agent-token - Generate registration token
  - GET /api/clusters/agent-token/:id/install-command - Get install command
  - DELETE /api/clusters/agent-token/:id - Revoke token

**Dependencies:** Task 1.2

---

## Phase 2: Database Changes

### Task 2.1: Migration for agent support
**Files to create:**
- `backend/migrations/003_cluster_agents.up.sql`:
  - ALTER clusters: add connection_type, agent_id, make kubeconfig_enc nullable
  - CREATE agent_tokens table
- `backend/migrations/003_cluster_agents.down.sql`

### Task 2.2: Extend ClusterManager for agent connections
**Files to modify:**
- `backend/internal/cluster/manager.go` - Extend to support agent-connected clusters:
  - Route K8s requests through gRPC stream for agent clusters
  - GetClient() returns agent proxy client for connection_type='agent'
- `backend/internal/cluster/store.go` - Update queries for new columns

**Dependencies:** Tasks 1.2, 2.1

---

## Phase 3: Agent Binary

### Task 3.1: Agent core and connector
**Files to create:**
- `agent/cmd/agent/main.go` - Entrypoint: load config, connect to dashboard, handle signals
- `agent/internal/connector.go` - gRPC client: connect, register, maintain stream, auto-reconnect with exponential backoff
- `agent/internal/config.go` - Agent config: dashboard URL, token, cluster name
- `agent/go.mod`, `agent/go.sum` - Go module for agent

**Dependencies:** Task 1.1

### Task 3.2: Agent K8s proxy
**Files to create:**
- `agent/internal/proxy.go` - Receives K8sRequest from dashboard via stream, executes with client-go (ServiceAccount), returns K8sResponse
- `agent/internal/watcher.go` - Manages K8s watches on request from dashboard, sends WatchEvents back through stream
- `agent/internal/proxy_test.go`

**Dependencies:** Task 3.1

### Task 3.3: Agent discovery and heartbeat
**Files to create:**
- `agent/internal/discovery.go` - On register: collect and send ClusterInfo (K8s version, nodes, namespaces, CRDs)
- `agent/internal/heartbeat.go` - Periodic Ping/Pong for health check

**Dependencies:** Task 3.1

---

## Phase 4: Agent Deployment

### Task 4.1: Agent Dockerfile
**Files to create:**
- `deploy/docker/Dockerfile.agent` - Multi-stage Go build, minimal image (~15MB)

### Task 4.2: Agent Helm chart
**Files to create:**
- `deploy/helm/dashboard-agent/Chart.yaml`
- `deploy/helm/dashboard-agent/values.yaml` - dashboard.url, token, rbac.rules[]
- `deploy/helm/dashboard-agent/templates/deployment.yaml`
- `deploy/helm/dashboard-agent/templates/serviceaccount.yaml`
- `deploy/helm/dashboard-agent/templates/clusterrole.yaml` - Configurable RBAC rules
- `deploy/helm/dashboard-agent/templates/clusterrolebinding.yaml`
- `deploy/helm/dashboard-agent/templates/configmap.yaml`
- `deploy/helm/dashboard-agent/templates/secret.yaml`

### Task 4.3: Install script
**Files to create:**
- `agent/install.sh` - Bash script that detects if Helm is installed and runs the Helm install command with provided args

**Files to modify:**
- `backend/internal/cluster/agent_handlers.go` - Serve install.sh at GET /api/agents/install.sh

---

## Phase 5: Frontend

### Task 5.1: Add Cluster dialog - Agent tab
**Files to modify:**
- `frontend/src/app/(dashboard)/clusters/page.tsx` - Add tab "Deploy Agent" in Add Cluster dialog
  - Form: cluster name, permissions preset (read-only/operator/admin/custom)
  - "Generate Command" button
  - Display generated curl/helm command with copy button
  - Status indicator: waiting for agent to connect

### Task 5.2: Cluster list - agent indicators
**Files to modify:**
- `frontend/src/app/(dashboard)/clusters/page.tsx` - Show connection type icon (agent vs kubeconfig)
- `frontend/src/app/(dashboard)/clusters/[id]/page.tsx` - Show agent status (connected/reconnecting/offline) and agent info (version, last heartbeat)

---

## Task Summary

| # | Task | Dependencies | Agent |
|---|---|---|---|
| 1.1 | Proto definitions + codegen | - | backend |
| 1.2 | gRPC server | 1.1 | backend |
| 1.3 | Agent token management | 1.2 | backend |
| 2.1 | DB migration | - | backend |
| 2.2 | Extend ClusterManager | 1.2, 2.1 | backend |
| 3.1 | Agent core + connector | 1.1 | backend |
| 3.2 | Agent K8s proxy | 3.1 | backend |
| 3.3 | Agent discovery + heartbeat | 3.1 | backend |
| 4.1 | Agent Dockerfile | 3.x | devops |
| 4.2 | Agent Helm chart | 3.x | devops |
| 4.3 | Install script | 4.2 | devops |
| 5.1 | Frontend - Agent tab | 1.3 | frontend |
| 5.2 | Frontend - Agent indicators | 2.2 | frontend |

**Total: 13 tasks**
