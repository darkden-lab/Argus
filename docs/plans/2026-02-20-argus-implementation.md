# Argus - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Argus, a multi-cluster Kubernetes admin dashboard with a plugin-based architecture (Istio, Prometheus Operator, Calico) using Next.js 16 frontend and Go backend.

**Architecture:** Monorepo with two main services: a Next.js 16 App Router frontend (TypeScript, Tailwind, shadcn/ui) and a Go REST/WebSocket backend (client-go, PostgreSQL). Plugins are manifest-driven: backend implements a Go `Plugin` interface, frontend renders UI dynamically from manifests.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Zustand, Go 1.22+, client-go, gorilla/mux, gorilla/websocket, pgx, PostgreSQL 16, Docker, Helm

**Design doc:** `docs/plans/2026-02-20-argus-design.md`

---

## Phase 0: Project Scaffolding

### Task 0.1: Initialize monorepo structure

**Agent:** DevOps/CI-CD
**Files:**
- Create: `package.json` (root workspace)
- Create: `frontend/` (Next.js 16 app)
- Create: `backend/` (Go module)
- Create: `docker-compose.yml`
- Create: `.gitignore`
- Create: `Makefile`

**Step 1: Initialize git repo**
```bash
cd /mnt/c/Users/49244373Q/WebstormProjects/test-reactjs
git init
```

**Step 2: Create root structure**
```
test-reactjs/
├── frontend/           # Next.js 16
├── backend/            # Go API
├── deploy/
│   ├── docker/         # Dockerfiles
│   └── helm/           # Helm chart
├── docs/
│   └── plans/          # (already exists)
├── docker-compose.yml  # Local dev (PostgreSQL, backend, frontend)
├── Makefile            # Top-level commands
├── .gitignore
└── README.md
```

**Step 3: Create .gitignore**
```
node_modules/
.next/
.env*.local
*.exe
bin/
tmp/
vendor/
dist/
coverage/
```

**Step 4: Commit**
```bash
git add -A && git commit -m "chore: initialize monorepo structure"
```

---

### Task 0.2: Scaffold Next.js 16 frontend

**Agent:** Frontend Developer
**Files:**
- Create: `frontend/` via create-next-app

**Step 1: Create Next.js 16 app**
```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

**Step 2: Install core dependencies**
```bash
npm install zustand
npx shadcn@latest init
```

**Step 3: Verify it builds**
```bash
npm run build
```

**Step 4: Commit**
```bash
git add frontend/ && git commit -m "chore: scaffold Next.js 16 frontend"
```

---

### Task 0.3: Scaffold Go backend

**Agent:** Backend Developer
**Files:**
- Create: `backend/go.mod`
- Create: `backend/cmd/server/main.go`
- Create: `backend/internal/` (package structure)

**Step 1: Initialize Go module**
```bash
cd backend
go mod init github.com/your-org/argus/backend
```

**Step 2: Create package structure**
```
backend/
├── cmd/
│   └── server/
│       └── main.go          # Entry point
├── internal/
│   ├── auth/                 # Auth service (JWT, OIDC, LDAP)
│   ├── rbac/                 # RBAC engine
│   ├── cluster/              # Cluster manager (client-go)
│   ├── core/                 # Core K8s resource handlers
│   ├── plugin/               # Plugin engine
│   ├── ws/                   # WebSocket hub
│   ├── db/                   # Database layer (pgx, migrations)
│   ├── middleware/            # HTTP middleware
│   ├── config/               # App config
│   └── crypto/               # Encryption utils (AES-256)
├── plugins/
│   ├── istio/                # Istio plugin
│   ├── prometheus/           # Prometheus Operator plugin
│   └── calico/               # Calico plugin
├── migrations/               # SQL migrations
├── go.mod
└── go.sum
```

**Step 3: Write minimal main.go**
```go
package main

import (
    "log"
    "net/http"
)

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("ok"))
    })
    log.Println("Starting server on :8080")
    log.Fatal(http.ListenAndServe(":8080", mux))
}
```

**Step 4: Install core dependencies**
```bash
go get github.com/gorilla/mux
go get github.com/gorilla/websocket
go get github.com/jackc/pgx/v5
go get github.com/golang-jwt/jwt/v5
go get k8s.io/client-go@latest
go get k8s.io/apimachinery@latest
```

**Step 5: Verify it builds**
```bash
go build ./cmd/server/
```

**Step 6: Commit**
```bash
git add backend/ && git commit -m "chore: scaffold Go backend"
```

---

### Task 0.4: Docker Compose for local dev

**Agent:** DevOps/CI-CD
**Files:**
- Create: `docker-compose.yml`
- Create: `deploy/docker/Dockerfile.backend`
- Create: `deploy/docker/Dockerfile.frontend`

**Step 1: Write docker-compose.yml**
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: argus
      POSTGRES_USER: dashboard
      POSTGRES_PASSWORD: devpassword
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build:
      context: ./backend
      dockerfile: ../deploy/docker/Dockerfile.backend
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgres://dashboard:devpassword@postgres:5432/argus?sslmode=disable
      JWT_SECRET: dev-secret-change-in-prod
      ENCRYPTION_KEY: 0123456789abcdef0123456789abcdef
    depends_on:
      - postgres

  frontend:
    build:
      context: ./frontend
      dockerfile: ../deploy/docker/Dockerfile.frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080
```

**Step 2: Write Dockerfiles** (multi-stage builds)

**Step 3: Verify**
```bash
docker compose build
```

**Step 4: Commit**
```bash
git add docker-compose.yml deploy/ && git commit -m "chore: add Docker Compose and Dockerfiles"
```

---

## Phase 1: Database & Auth (Backend)

### Task 1.1: Database migrations

**Agent:** Backend Developer
**Files:**
- Create: `backend/migrations/001_initial_schema.up.sql`
- Create: `backend/migrations/001_initial_schema.down.sql`
- Create: `backend/internal/db/db.go`

**Step 1: Write the migration SQL**

Full schema from design doc: users, roles, role_permissions, user_roles, clusters, plugins, plugin_state, audit_log.

**Step 2: Write db connection pool**
```go
// backend/internal/db/db.go
package db

import (
    "context"
    "github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
    Pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*DB, error) {
    pool, err := pgxpool.New(ctx, databaseURL)
    if err != nil {
        return nil, err
    }
    return &DB{Pool: pool}, nil
}
```

**Step 3: Write migration runner** using golang-migrate or embed SQL

**Step 4: Test** - run migration against local PostgreSQL
```bash
docker compose up postgres -d
go test ./internal/db/... -v
```

**Step 5: Commit**
```bash
git commit -m "feat(backend): add database schema and migrations"
```

---

### Task 1.2: Auth service - JWT

**Agent:** Backend Developer
**Files:**
- Create: `backend/internal/auth/jwt.go`
- Create: `backend/internal/auth/service.go`
- Create: `backend/internal/auth/handlers.go`
- Test: `backend/internal/auth/jwt_test.go`

**Step 1: Write failing test for JWT generation/validation**
```go
func TestGenerateAndValidateJWT(t *testing.T) {
    svc := auth.NewJWTService("test-secret")
    token, err := svc.GenerateToken("user-id-123", "admin@test.com")
    require.NoError(t, err)
    claims, err := svc.ValidateToken(token)
    require.NoError(t, err)
    assert.Equal(t, "user-id-123", claims.UserID)
}
```

**Step 2: Run test to verify it fails**
```bash
go test ./internal/auth/... -v -run TestGenerateAndValidateJWT
```

**Step 3: Implement JWT service** (GenerateToken, ValidateToken, RefreshToken)

**Step 4: Run tests, verify pass**

**Step 5: Write auth HTTP handlers** (POST /api/auth/login, POST /api/auth/refresh, POST /api/auth/register)

**Step 6: Write handler tests**

**Step 7: Commit**
```bash
git commit -m "feat(backend): add JWT auth service and login endpoints"
```

---

### Task 1.3: Auth service - OIDC

**Agent:** Backend Developer
**Files:**
- Create: `backend/internal/auth/oidc.go`
- Test: `backend/internal/auth/oidc_test.go`

**Endpoints:** GET /api/auth/oidc/authorize, GET /api/auth/oidc/callback

Uses `coreos/go-oidc` for provider discovery and token exchange. Maps OIDC subject to local user, creates user on first login.

**Step 1: Write OIDC provider configuration**
**Step 2: Write authorize redirect handler**
**Step 3: Write callback handler** (exchange code, validate ID token, upsert user, issue JWT)
**Step 4: Test with mock OIDC provider**
**Step 5: Commit**

---

### Task 1.4: RBAC engine

**Agent:** Backend Developer
**Files:**
- Create: `backend/internal/rbac/engine.go`
- Create: `backend/internal/rbac/middleware.go`
- Test: `backend/internal/rbac/engine_test.go`

**Step 1: Write failing test**
```go
func TestRBACEvaluate(t *testing.T) {
    engine := rbac.NewEngine(db)
    // User has "developer" role scoped to cluster-A, namespace "prod"
    allowed := engine.Evaluate(ctx, rbac.Request{
        UserID:    "user-1",
        Action:    "read",
        Resource:  "pods",
        ClusterID: "cluster-A",
        Namespace: "prod",
    })
    assert.True(t, allowed)
}
```

**Step 2: Implement RBAC engine**
- Load user roles + permissions from DB
- Evaluate: check if any role grants the requested action on the resource within scope
- In-memory cache with TTL (invalidate on role changes)

**Step 3: Write RBAC middleware** - injects permissions check before handler

**Step 4: Test edge cases** (no permission, wildcard, global scope, namespace scope)

**Step 5: Commit**
```bash
git commit -m "feat(backend): add granular RBAC engine with scope evaluation"
```

---

### Task 1.5: Auth middleware

**Agent:** Backend Developer
**Files:**
- Create: `backend/internal/middleware/auth.go`

**Step 1: Write middleware** that extracts JWT from Authorization header, validates, injects user context
**Step 2: Wire into router for all /api/* routes except /api/auth/*
**Step 3: Test with integration test
**Step 4: Commit**

---

## Phase 2: Cluster Manager (Backend + K8s Expert)

### Task 2.1: Encryption utilities

**Agent:** Backend Developer
**Files:**
- Create: `backend/internal/crypto/aes.go`
- Test: `backend/internal/crypto/aes_test.go`

AES-256-GCM encrypt/decrypt for kubeconfig storage.

**Step 1: Write failing test** - encrypt then decrypt, assert equal
**Step 2: Implement**
**Step 3: Test**
**Step 4: Commit**

---

### Task 2.2: Cluster CRUD endpoints

**Agent:** Backend Developer + Kubernetes Expert
**Files:**
- Create: `backend/internal/cluster/manager.go`
- Create: `backend/internal/cluster/handlers.go`
- Create: `backend/internal/cluster/store.go`
- Test: `backend/internal/cluster/manager_test.go`

**Endpoints:**
- POST /api/clusters - Register new cluster (receives kubeconfig, encrypts, stores)
- GET /api/clusters - List clusters with health status
- GET /api/clusters/{id} - Cluster detail
- PUT /api/clusters/{id} - Update cluster config
- DELETE /api/clusters/{id} - Remove cluster

**Step 1: Write ClusterManager**
```go
type ClusterManager struct {
    store   ClusterStore
    clients map[string]*ClusterClient // cluster_id -> client-go clientset
    mu      sync.RWMutex
}

type ClusterClient struct {
    Clientset  kubernetes.Interface
    DynClient  dynamic.Interface
    RestConfig *rest.Config
}

func (m *ClusterManager) AddCluster(ctx context.Context, name, apiServer string, kubeconfig []byte) error
func (m *ClusterManager) RemoveCluster(ctx context.Context, id string) error
func (m *ClusterManager) GetClient(clusterID string) (*ClusterClient, error)
func (m *ClusterManager) HealthCheck(ctx context.Context) map[string]string
```

**Step 2: Write failing tests**
**Step 3: Implement ClusterManager** (decrypt kubeconfig, build rest.Config, create clientset)
**Step 4: Write HTTP handlers**
**Step 5: Wire to router**
**Step 6: Test**
**Step 7: Commit**

---

### Task 2.3: Core K8s resource API (generic)

**Agent:** Backend Developer + Kubernetes Expert
**Files:**
- Create: `backend/internal/core/resources.go`
- Create: `backend/internal/core/handlers.go`
- Test: `backend/internal/core/resources_test.go`

**Endpoints (generic, resource-type is a path param):**
- GET /api/clusters/{id}/resources/{group}/{version}/{resource} - List
- GET /api/clusters/{id}/resources/{group}/{version}/{resource}/{name} - Get
- POST /api/clusters/{id}/resources/{group}/{version}/{resource} - Create
- PUT /api/clusters/{id}/resources/{group}/{version}/{resource}/{name} - Update
- DELETE /api/clusters/{id}/resources/{group}/{version}/{resource}/{name} - Delete
- GET /api/clusters/{id}/namespaces - List namespaces (convenience)
- GET /api/clusters/{id}/nodes - List nodes (convenience)

**Uses dynamic client** to handle any resource type generically:
```go
func (h *ResourceHandler) List(w http.ResponseWriter, r *http.Request) {
    vars := mux.Vars(r)
    clusterID := vars["clusterID"]
    group := vars["group"]      // "" for core resources
    version := vars["version"]  // "v1"
    resource := vars["resource"] // "pods"
    namespace := r.URL.Query().Get("namespace")

    client, err := h.clusterMgr.GetClient(clusterID)
    // ... use client.DynClient.Resource(gvr).Namespace(ns).List(...)
}
```

**Step 1: Write failing test with mock dynamic client**
**Step 2: Implement generic resource handler**
**Step 3: Add convenience endpoints for common resources**
**Step 4: Test CRUD operations**
**Step 5: Commit**

---

## Phase 3: WebSocket Hub (Backend)

### Task 3.1: WebSocket hub implementation

**Agent:** Backend Developer
**Files:**
- Create: `backend/internal/ws/hub.go`
- Create: `backend/internal/ws/client.go`
- Create: `backend/internal/ws/handlers.go`
- Test: `backend/internal/ws/hub_test.go`

**Step 1: Write Hub**
```go
type Hub struct {
    clients    map[string]*Client       // conn_id -> Client
    watchers   map[string]*K8sWatcher   // "cluster:gvr:namespace" -> watcher
    register   chan *Client
    unregister chan *Client
    mu         sync.RWMutex
}

type Client struct {
    ID            string
    UserID        string
    conn          *websocket.Conn
    subscriptions map[string]bool // "cluster:gvr:namespace"
    send          chan []byte
}

type WatchEvent struct {
    Cluster   string          `json:"cluster"`
    Resource  string          `json:"resource"`
    Type      string          `json:"type"` // ADDED, MODIFIED, DELETED
    Object    json.RawMessage `json:"object"`
    Namespace string          `json:"namespace"`
}
```

**Step 2: Implement subscribe/unsubscribe messages**
Client sends: `{"action":"subscribe","cluster":"id","resource":"pods","namespace":"default"}`
Hub starts a K8s Watch if not already running, forwards events to subscribed clients.

**Step 3: Multiplexing** - one K8s watch per unique cluster+resource+namespace feeds N clients

**Step 4: Test with mock WebSocket connections**

**Step 5: Commit**

---

## Phase 4: Plugin Engine (Backend)

### Task 4.1: Plugin engine core

**Agent:** Backend Developer
**Files:**
- Create: `backend/internal/plugin/engine.go`
- Create: `backend/internal/plugin/manifest.go`
- Create: `backend/internal/plugin/registry.go`
- Test: `backend/internal/plugin/engine_test.go`

**Step 1: Define Plugin interface and Manifest structs**
```go
type Plugin interface {
    ID() string
    Manifest() Manifest
    RegisterRoutes(router *mux.Router, cm *cluster.ClusterManager)
    RegisterWatchers(hub *ws.Hub, cm *cluster.ClusterManager)
    OnEnable(ctx context.Context, db *db.DB) error
    OnDisable(ctx context.Context, db *db.DB) error
}

type Manifest struct {
    ID          string          `json:"id"`
    Name        string          `json:"name"`
    Version     string          `json:"version"`
    Description string          `json:"description"`
    Permissions []string        `json:"permissions"`
    Backend     BackendManifest `json:"backend"`
    Frontend    FrontendManifest `json:"frontend"`
}
```

**Step 2: Write PluginEngine** (register, enable, disable, list)
**Step 3: Write HTTP handlers** (GET /api/plugins, POST /api/plugins/{id}/enable, etc.)
**Step 4: Test lifecycle**
**Step 5: Commit**

---

### Task 4.2: Istio plugin (backend)

**Agent:** Kubernetes Expert + Backend Developer
**Files:**
- Create: `backend/plugins/istio/plugin.go`
- Create: `backend/plugins/istio/handlers.go`
- Create: `backend/plugins/istio/manifest.json`
- Test: `backend/plugins/istio/plugin_test.go`

**Step 1: Write manifest.json** for Istio (VirtualServices, Gateways, DestinationRules, ServiceEntries)

**Step 2: Implement IstioPlugin** struct that satisfies Plugin interface:
- RegisterRoutes: CRUD for each Istio CRD via dynamic client
- RegisterWatchers: Watch Istio CRDs and forward to WebSocket hub
- GVRs: networking.istio.io/v1 (virtualservices, gateways, destinationrules, serviceentries)

**Step 3: Test with mock K8s client**
**Step 4: Commit**

---

### Task 4.3: Prometheus Operator plugin (backend)

**Agent:** Kubernetes Expert + Backend Developer
**Files:**
- Create: `backend/plugins/prometheus/plugin.go`
- Create: `backend/plugins/prometheus/handlers.go`
- Create: `backend/plugins/prometheus/manifest.json`

Same pattern as Istio. GVRs: monitoring.coreos.com/v1 (servicemonitors, podmonitors, prometheusrules, alertmanagers)

**Step 1-4: Same TDD flow as Task 4.2**
**Commit**

---

### Task 4.4: Calico plugin (backend)

**Agent:** Kubernetes Expert + Backend Developer
**Files:**
- Create: `backend/plugins/calico/plugin.go`
- Create: `backend/plugins/calico/handlers.go`
- Create: `backend/plugins/calico/manifest.json`

GVRs: crd.projectcalico.org/v1 (networkpolicies, globalnetworkpolicies, hostendpoints, ippools)

**Step 1-4: Same TDD flow**
**Commit**

---

## Phase 5: Frontend Foundation

### Task 5.1: Design system and layout

**Agent:** UX Designer + Frontend Developer
**Files:**
- Create: `frontend/src/app/layout.tsx` (root layout)
- Create: `frontend/src/components/layout/sidebar.tsx`
- Create: `frontend/src/components/layout/header.tsx`
- Create: `frontend/src/components/layout/main-content.tsx`
- Create: `frontend/src/lib/themes.ts`

**Step 1: Set up shadcn/ui components** (Button, Card, Table, Dialog, Input, Select, Badge, Tabs, Sheet)
```bash
npx shadcn@latest add button card table dialog input select badge tabs sheet
```

**Step 2: Build app shell layout**
- Collapsible sidebar with navigation
- Top header with cluster selector, user menu
- Main content area

**Step 3: Build dark/light theme toggle**

**Step 4: Verify layout renders**
```bash
npm run build && npm run dev
```

**Step 5: Commit**

---

### Task 5.2: API client and auth store

**Agent:** Frontend Developer
**Files:**
- Create: `frontend/src/lib/api.ts` (fetch wrapper for Go backend)
- Create: `frontend/src/lib/ws.ts` (WebSocket client)
- Create: `frontend/src/stores/auth.ts` (Zustand store)
- Create: `frontend/src/middleware.ts` (Next.js route protection)

**Step 1: Write API client**
```typescript
// Typed fetch wrapper with JWT injection
const api = {
    get: <T>(path: string) => fetchWithAuth<T>(path, 'GET'),
    post: <T>(path: string, body: unknown) => fetchWithAuth<T>(path, 'POST', body),
    put: <T>(path: string, body: unknown) => fetchWithAuth<T>(path, 'PUT', body),
    delete: <T>(path: string) => fetchWithAuth<T>(path, 'DELETE'),
}
```

**Step 2: Write auth Zustand store** (login, logout, token refresh, user state)

**Step 3: Write Next.js middleware** for route protection (redirect to /login if no token)

**Step 4: Write WebSocket client** with auto-reconnect and subscription management
```typescript
class K8sWebSocket {
    subscribe(cluster: string, resource: string, namespace?: string): void
    unsubscribe(cluster: string, resource: string, namespace?: string): void
    onEvent(callback: (event: WatchEvent) => void): void
}
```

**Step 5: Commit**

---

### Task 5.3: Login page

**Agent:** Frontend Developer + UX Designer
**Files:**
- Create: `frontend/src/app/login/page.tsx`

**Step 1: Build login form** (email/password + OIDC button)
**Step 2: Connect to auth store and API
**Step 3: Commit**

---

### Task 5.4: Dashboard overview page

**Agent:** Frontend Developer + UX Designer
**Files:**
- Create: `frontend/src/app/(dashboard)/dashboard/page.tsx`
- Create: `frontend/src/components/dashboard/cluster-health-card.tsx`
- Create: `frontend/src/components/dashboard/recent-events.tsx`
- Create: `frontend/src/components/dashboard/resource-summary.tsx`

**Step 1: Build dashboard page** with grid of cards:
- Cluster health overview (connected/disconnected per cluster)
- Resource summary (total pods, deployments, services across clusters)
- Recent events (real-time via WebSocket)
- Plugin widget slots (rendered from plugin manifests)

**Step 2: Connect to API and WebSocket**
**Step 3: Commit**

---

### Task 5.5: Cluster management pages

**Agent:** Frontend Developer
**Files:**
- Create: `frontend/src/app/(dashboard)/clusters/page.tsx` (list)
- Create: `frontend/src/app/(dashboard)/clusters/[id]/page.tsx` (detail)
- Create: `frontend/src/app/(dashboard)/clusters/[id]/[resourceType]/page.tsx` (resource list)
- Create: `frontend/src/app/(dashboard)/clusters/[id]/[resourceType]/[name]/page.tsx` (resource detail)
- Create: `frontend/src/components/clusters/add-cluster-dialog.tsx`
- Create: `frontend/src/components/resources/resource-table.tsx`
- Create: `frontend/src/components/resources/resource-detail.tsx`
- Create: `frontend/src/components/resources/yaml-editor.tsx`

**Step 1: Build cluster list page** (table with name, status, node count, add button)
**Step 2: Build add cluster dialog** (paste kubeconfig, name, labels)
**Step 3: Build cluster detail page** (tabs: Overview, Workloads, Networking, Storage, Config, RBAC, Events)
**Step 4: Build generic ResourceTable** component (sortable, filterable, real-time updates)
**Step 5: Build ResourceDetail** with YAML editor (view/edit YAML, delete action)
**Step 6: Commit**

---

### Task 5.6: Plugin UI renderer

**Agent:** Frontend Developer
**Files:**
- Create: `frontend/src/lib/plugins/registry.ts`
- Create: `frontend/src/lib/plugins/loader.ts`
- Create: `frontend/src/components/plugins/plugin-router.tsx`
- Create: `frontend/src/components/plugins/plugin-navigation.tsx`

**Step 1: Write plugin registry** - fetches manifests from GET /api/plugins, caches in Zustand
**Step 2: Write plugin loader** - maps manifest component names to React components from `frontend/src/plugins/`
**Step 3: Write PluginRouter** - dynamic route component that renders the right plugin page
**Step 4: Write PluginNavigation** - generates sidebar menu items from enabled plugin manifests
**Step 5: Commit**

---

### Task 5.7: Istio plugin (frontend)

**Agent:** Frontend Developer + UX Designer
**Files:**
- Create: `frontend/src/plugins/istio/overview.tsx`
- Create: `frontend/src/plugins/istio/virtual-services.tsx`
- Create: `frontend/src/plugins/istio/gateways.tsx`
- Create: `frontend/src/plugins/istio/index.ts` (component registry)

**Step 1: Build Istio overview page** (mesh status, virtual service count, gateway count)
**Step 2: Build VirtualService list/detail** using ResourceTable
**Step 3: Build Gateway list/detail**
**Step 4: Commit**

---

### Task 5.8: Prometheus Operator plugin (frontend)

**Agent:** Frontend Developer + UX Designer
**Files:**
- Create: `frontend/src/plugins/prometheus/overview.tsx`
- Create: `frontend/src/plugins/prometheus/service-monitors.tsx`
- Create: `frontend/src/plugins/prometheus/rules.tsx`
- Create: `frontend/src/plugins/prometheus/index.ts`

**Step 1: Build Prometheus overview** (active alerts, monitors count)
**Step 2: Build ServiceMonitor/PodMonitor list**
**Step 3: Build PrometheusRules list**
**Step 4: Commit**

---

### Task 5.9: Calico plugin (frontend)

**Agent:** Frontend Developer + UX Designer
**Files:**
- Create: `frontend/src/plugins/calico/overview.tsx`
- Create: `frontend/src/plugins/calico/network-policies.tsx`
- Create: `frontend/src/plugins/calico/ip-pools.tsx`
- Create: `frontend/src/plugins/calico/index.ts`

**Step 1: Build Calico overview** (policy count, pool status)
**Step 2: Build NetworkPolicy list/detail**
**Step 3: Build IPPool list**
**Step 4: Commit**

---

### Task 5.10: Settings pages

**Agent:** Frontend Developer
**Files:**
- Create: `frontend/src/app/(dashboard)/settings/page.tsx`
- Create: `frontend/src/app/(dashboard)/settings/users/page.tsx`
- Create: `frontend/src/app/(dashboard)/settings/roles/page.tsx`
- Create: `frontend/src/app/(dashboard)/settings/plugins/page.tsx`
- Create: `frontend/src/app/(dashboard)/settings/oidc/page.tsx`

**Step 1: Build settings layout** (sidebar nav: Users, Roles, Plugins, OIDC)
**Step 2: Build users management** (list, create, assign roles)
**Step 3: Build roles management** (list, create, assign permissions with scope)
**Step 4: Build plugins management** (list installed, enable/disable per cluster)
**Step 5: Build OIDC configuration** page
**Step 6: Commit**

---

### Task 5.11: RBAC gate component

**Agent:** Frontend Developer
**Files:**
- Create: `frontend/src/components/auth/rbac-gate.tsx`
- Create: `frontend/src/hooks/use-permissions.ts`
- Create: `frontend/src/stores/permissions.ts`

**Step 1: Write usePermissions hook** - fetches user permissions from API, caches in Zustand
**Step 2: Write RBACGate component** - wraps children, only renders if user has required permission
```tsx
<RBACGate resource="pods" action="delete" cluster={clusterId}>
    <DeleteButton />
</RBACGate>
```
**Step 3: Integrate into resource pages**
**Step 4: Commit**

---

## Phase 6: DevOps & Infrastructure

### Task 6.1: Helm chart

**Agent:** DevOps/CI-CD + Kubernetes Expert
**Files:**
- Create: `deploy/helm/argus/Chart.yaml`
- Create: `deploy/helm/argus/values.yaml`
- Create: `deploy/helm/argus/templates/` (deployment, service, ingress, configmap, secret, serviceaccount, rbac)

**Step 1: Write Chart.yaml** with frontend + backend as subcharts or single chart
**Step 2: Write values.yaml** with configurable: replicas, image tags, ingress, PostgreSQL, auth config
**Step 3: Write K8s manifests** (Deployment for backend, Deployment for frontend, Service, Ingress, ConfigMap, Secret)
**Step 4: Write ServiceAccount + RBAC** for the dashboard pod to access K8s API
**Step 5: Test** with `helm template` and `helm lint`
**Step 6: Commit**

---

### Task 6.2: CI/CD pipeline

**Agent:** DevOps/CI-CD
**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

**Step 1: Write CI pipeline**
- On push/PR: lint, test (Go + TS), build Docker images
- Go: `go test ./...`, `go vet ./...`
- TS: `npm run lint`, `npm run test`, `npm run build`

**Step 2: Write release pipeline**
- On tag: build + push Docker images, package Helm chart

**Step 3: Commit**

---

## Phase 7: Testing & QA

### Task 7.1: Backend unit tests

**Agent:** QA / Testing
**Files:**
- Verify: all `*_test.go` files from previous phases
- Create: additional edge case tests

**Step 1: Ensure coverage** > 80% for auth, rbac, cluster, core, plugin packages
```bash
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out
```

---

### Task 7.2: Frontend unit tests

**Agent:** QA / Testing
**Files:**
- Create: `frontend/src/__tests__/` (component tests with React Testing Library)

**Step 1: Test critical components** - ResourceTable, RBACGate, PluginRouter, auth flow
```bash
npm run test
```

---

### Task 7.3: E2E tests

**Agent:** QA / Testing
**Files:**
- Create: `frontend/e2e/` (Playwright tests)

**Step 1: Install Playwright**
```bash
npx playwright install
```

**Step 2: Write E2E flows:**
- Login flow (local + OIDC)
- Add cluster
- Browse pods in a namespace
- Enable/disable plugin
- RBAC: verify restricted views

**Step 3: Commit**

---

## Execution Order & Parallelism

```
Phase 0 (scaffolding) ──── sequential, all agents setup

Phase 1 + Phase 5.1 ────── parallel
  Backend: DB + Auth        Frontend: Design system + Layout
  (Tasks 1.1-1.5)          (Task 5.1)

Phase 2 + Phase 5.2-5.3 ── parallel
  Backend: Cluster Mgr      Frontend: API client + Login
  (Tasks 2.1-2.3)          (Tasks 5.2-5.3)

Phase 3 + Phase 5.4-5.5 ── parallel
  Backend: WebSocket Hub     Frontend: Dashboard + Clusters
  (Task 3.1)               (Tasks 5.4-5.5)

Phase 4 + Phase 5.6 ────── parallel
  Backend: Plugin Engine     Frontend: Plugin UI renderer
  (Tasks 4.1-4.4)          (Task 5.6)

Phase 5.7-5.11 ─────────── Frontend plugin UIs + Settings + RBAC

Phase 6 ─────────────────── DevOps (can start after Phase 0)

Phase 7 ─────────────────── QA (starts after Phases 1-5 complete)
```

## Agent Assignment Summary

| Agent | Tasks |
|---|---|
| **DevOps/CI-CD** | 0.1, 0.4, 6.1, 6.2 |
| **Frontend Developer** | 0.2, 5.1-5.11 |
| **Backend Developer** | 0.3, 1.1-1.5, 2.1-2.3, 3.1, 4.1 |
| **Kubernetes Expert** | 2.2, 2.3, 4.2-4.4, 6.1 |
| **UX Designer** | 5.1, 5.3, 5.4, 5.7-5.9 |
| **QA / Testing** | 7.1-7.3 |
