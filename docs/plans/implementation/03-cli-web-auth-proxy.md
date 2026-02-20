# Implementation Plan: CLI Web + Kubectl Auth Proxy

**Feature:** Terminal web integrada y proxy de autenticacion para kubectl
**Design doc:** ../2026-02-20-features-expansion-design.md#feature-3
**Date:** 2026-02-20
**Status:** Pendiente
**Priority:** 3

---

## Phase 1: Terminal Web Backend

### Task 1.1: Terminal WebSocket handler
**Files to create:**
- `backend/internal/terminal/handler.go` - WebSocket handler: authenticate JWT, create terminal session, manage read/write pumps
- `backend/internal/terminal/session.go` - TerminalSession: manages state, command history, active cluster/namespace context

**Files to modify:**
- `backend/cmd/server/main.go` - Wire terminal WebSocket route

### Task 1.2: Smart mode - kubectl command parser
**Files to create:**
- `backend/internal/terminal/smart.go` - Parses kubectl-like commands and translates to client-go API calls
  - Supported: get, describe, logs, apply, delete, scale, rollout, top, exec, edit
  - Output formatted like kubectl (table, YAML, JSON)
- `backend/internal/terminal/smart_test.go` - Test command parsing and output formatting
- `backend/internal/terminal/formatter.go` - Output formatters (table, yaml, json, wide)

### Task 1.3: Raw shell mode - exec in pod
**Files to create:**
- `backend/internal/terminal/exec.go` - Raw shell: uses remotecommand.NewSPDYExecutor for exec in cluster pod
  - Finds pod by label `app=dashboard-tools` or creates one on-demand
  - Manages PTY resize events from frontend
  - Configurable image (default: bitnami/kubectl)
- `backend/internal/terminal/exec_test.go`

**RBAC:** Requires `terminal:exec` permission

---

## Phase 2: Kubectl Auth Proxy

### Task 2.1: K8s reverse proxy
**Files to create:**
- `backend/internal/proxy/k8s_proxy.go` - HTTP reverse proxy:
  - Intercepts requests to /api/proxy/k8s/{cluster_id}/*
  - Extracts JWT, evaluates RBAC
  - Forwards to cluster API server via client-go rest.Config
  - Returns response as-is (kubectl expects standard K8s API responses)
- `backend/internal/proxy/k8s_proxy_test.go`

**Files to modify:**
- `backend/cmd/server/main.go` - Wire proxy routes

### Task 2.2: Kubeconfig generator endpoint
**Files to create:**
- `backend/internal/proxy/kubeconfig.go` - Generates kubeconfig YAML:
  - server: https://dashboard.example.com/api/proxy/k8s/{cluster_id}
  - auth: token-based (user's JWT)
  - Endpoint: GET /api/proxy/kubeconfig?cluster_id=xxx
- `backend/internal/proxy/kubeconfig_test.go`

---

## Phase 3: CLI Binary (argus)

### Task 3.1: CLI core and login command
**Files to create:**
- `cli/cmd/argus/main.go` - Cobra CLI entrypoint
- `cli/cmd/argus/login.go` - `argus login --server URL`:
  - Opens browser for dashboard login (OAuth callback on localhost)
  - Receives JWT token
  - Fetches available clusters from dashboard API
  - Generates kubeconfig entries for each cluster
- `cli/cmd/argus/config.go` - CLI config store (~/.argus/config.json)
- `cli/go.mod`, `cli/go.sum`

**Go dependencies:** `github.com/spf13/cobra`, `github.com/pkg/browser`

### Task 3.2: CLI context and logout commands
**Files to create:**
- `cli/cmd/argus/contexts.go` - `argus contexts`: list available clusters from dashboard
- `cli/cmd/argus/use.go` - `argus use <cluster>`: switch kubectl context
- `cli/cmd/argus/logout.go` - `argus logout`: clean tokens and kubeconfig entries
- `cli/cmd/argus/version.go` - Version info

**Dependencies:** Task 3.1

---

## Phase 4: Frontend

### Task 4.1: Web terminal component
**Files to create:**
- `frontend/src/components/terminal/web-terminal.tsx` - xterm.js terminal component:
  - WebSocket connection to backend
  - Cluster/namespace selector bar
  - Mode toggle: Smart / Raw Shell
  - Resize handling (xterm-addon-fit)
  - Command history (localStorage)
  - Copy/paste support
- `frontend/src/app/(dashboard)/terminal/page.tsx` - Terminal page

**Frontend dependencies:** `xterm`, `xterm-addon-fit`, `xterm-addon-web-links`

**Files to modify:**
- `frontend/src/components/layout/sidebar.tsx` - Add "Terminal" nav item

### Task 4.2: Kubeconfig download UI
**Files to modify:**
- `frontend/src/app/(dashboard)/clusters/[id]/page.tsx` - Add "Download kubeconfig" button and "CLI Setup" instructions section showing argus commands

---

## Phase 5: Security and Rate Limiting

### Task 5.1: Terminal security middleware
**Files to create:**
- `backend/internal/terminal/middleware.go`:
  - Rate limiting: max 10 commands/second per user
  - Command timeout: 30s default, 5min max
  - Input sanitization for raw shell mode
  - Audit logging for all terminal commands

**Files to modify:**
- `backend/migrations/001_initial_schema.up.sql` or new migration - Add terminal:read and terminal:exec to default permissions

---

## Task Summary

| # | Task | Dependencies | Agent |
|---|---|---|---|
| 1.1 | Terminal WebSocket handler | - | backend |
| 1.2 | Smart mode parser | 1.1 | backend |
| 1.3 | Raw shell exec | 1.1 | backend |
| 2.1 | K8s reverse proxy | - | backend |
| 2.2 | Kubeconfig generator | 2.1 | backend |
| 3.1 | CLI login command | 2.2 | backend |
| 3.2 | CLI contexts/use/logout | 3.1 | backend |
| 4.1 | Web terminal component | 1.x | frontend |
| 4.2 | Kubeconfig download UI | 2.2 | frontend |
| 5.1 | Security middleware | 1.x, 2.x | backend |

**Total: 10 tasks**
