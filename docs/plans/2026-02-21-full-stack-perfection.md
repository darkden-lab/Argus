# Full Stack Perfection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Argus production-perfect: fix security gaps, complete stub implementations, harden infrastructure, and validate everything builds and deploys.

**Architecture:** Parallel streams - backend security/completeness, infrastructure hardening, and validation. Each stream is independent and can be executed concurrently by different agents.

**Tech Stack:** Go 1.25, Next.js 16, PostgreSQL 16 + pgvector, Docker Compose, Helm 3, GitHub Actions

---

## Task 1: Add refresh token revocation (migration)

**Files:**
- Create: `backend/migrations/007_revoked_tokens.up.sql`
- Create: `backend/migrations/007_revoked_tokens.down.sql`

**Step 1: Create up migration**

```sql
-- 007_revoked_tokens.up.sql
CREATE TABLE revoked_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_jti VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_revoked_tokens_jti ON revoked_tokens(token_jti);
CREATE INDEX idx_revoked_tokens_expires ON revoked_tokens(expires_at);
```

**Step 2: Create down migration**

```sql
-- 007_revoked_tokens.down.sql
DROP TABLE IF EXISTS revoked_tokens;
```

---

## Task 2: Add JTI to JWT tokens and implement revocation service

**Files:**
- Modify: `backend/internal/auth/jwt.go`
- Modify: `backend/internal/auth/service.go`

**Step 1: Add JTI (JWT ID) to token generation**

In `jwt.go`, add `"github.com/google/uuid"` to imports and add JTI to both `GenerateToken` and `GenerateRefreshToken`:

```go
// In GenerateToken - add ID to RegisteredClaims:
RegisteredClaims: jwt.RegisteredClaims{
    ID:        uuid.NewString(),
    Subject:   userID,
    IssuedAt:  jwt.NewNumericDate(now),
    ExpiresAt: jwt.NewNumericDate(now.Add(j.accessDuration)),
},

// In GenerateRefreshToken - add ID to RegisteredClaims:
RegisteredClaims: jwt.RegisteredClaims{
    ID:        uuid.NewString(),
    Subject:   userID,
    IssuedAt:  jwt.NewNumericDate(now),
    ExpiresAt: jwt.NewNumericDate(now.Add(j.refreshDuration)),
},
```

**Step 2: Add revocation methods to AuthService**

In `service.go`, replace the TODO comment with:

```go
// RevokeRefreshToken marks a refresh token as revoked so it cannot be reused.
func (s *AuthService) RevokeRefreshToken(ctx context.Context, tokenString string) error {
    if s.db == nil || s.db.Pool == nil {
        return nil // graceful degradation when DB unavailable
    }
    claims, err := s.jwt.ValidateRefreshToken(tokenString)
    if err != nil {
        return nil // invalid tokens are effectively revoked
    }
    jti := claims.RegisteredClaims.ID
    if jti == "" {
        return nil // legacy tokens without JTI cannot be individually revoked
    }
    _, err = s.db.Pool.Exec(ctx,
        `INSERT INTO revoked_tokens (token_jti, user_id, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        jti, claims.UserID, claims.ExpiresAt.Time,
    )
    return err
}

// IsTokenRevoked checks if a token JTI has been revoked.
func (s *AuthService) IsTokenRevoked(ctx context.Context, jti string) bool {
    if s.db == nil || s.db.Pool == nil || jti == "" {
        return false
    }
    var exists bool
    err := s.db.Pool.QueryRow(ctx,
        `SELECT EXISTS(SELECT 1 FROM revoked_tokens WHERE token_jti = $1)`,
        jti,
    ).Scan(&exists)
    if err != nil {
        return false
    }
    return exists
}

// CleanupExpiredTokens removes revoked token entries that have expired (housekeeping).
func (s *AuthService) CleanupExpiredTokens(ctx context.Context) error {
    if s.db == nil || s.db.Pool == nil {
        return nil
    }
    _, err := s.db.Pool.Exec(ctx,
        `DELETE FROM revoked_tokens WHERE expires_at < NOW()`,
    )
    return err
}
```

**Step 3: Update RefreshToken to check revocation**

In `service.go`, update `RefreshToken` method to check if token is revoked:

```go
func (s *AuthService) RefreshToken(ctx context.Context, refreshToken string) (string, error) {
    claims, err := s.jwt.ValidateRefreshToken(refreshToken)
    if err != nil {
        return "", fmt.Errorf("invalid refresh token: %w", err)
    }

    // Check if token has been revoked
    if s.IsTokenRevoked(ctx, claims.RegisteredClaims.ID) {
        return "", fmt.Errorf("refresh token has been revoked")
    }

    var email string
    err = s.db.Pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, claims.UserID).Scan(&email)
    if err != nil {
        return "", fmt.Errorf("user not found")
    }

    accessToken, err := s.jwt.GenerateToken(claims.UserID, email)
    if err != nil {
        return "", fmt.Errorf("failed to generate access token: %w", err)
    }

    return accessToken, nil
}
```

**Step 4: Run `go get github.com/google/uuid` if not already in go.mod**

Run: `cd backend && go mod tidy`

---

## Task 3: Add logout endpoint with token revocation

**Files:**
- Modify: `backend/internal/auth/handlers.go`

**Step 1: Add logout request type and handler**

Add after the `refreshRequest` struct:

```go
type logoutRequest struct {
    RefreshToken string `json:"refresh_token"`
}
```

Add the handler method:

```go
func (h *Handlers) handleLogout(w http.ResponseWriter, r *http.Request) {
    var req logoutRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
        return
    }

    if req.RefreshToken != "" {
        _ = h.service.RevokeRefreshToken(r.Context(), req.RefreshToken)
    }

    writeJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}
```

**Step 2: Register logout route**

In `RegisterProtectedRoutes`, add:

```go
r.HandleFunc("/api/auth/logout", h.handleLogout).Methods("POST")
```

---

## Task 4: Implement Prometheus plugin watchers

**Files:**
- Modify: `backend/plugins/prometheus/plugin.go`

**Step 1: Replace stub RegisterWatchers with real implementation**

```go
func (p *PrometheusPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
    resources := manifest.Backend.Watchers
    for _, wd := range resources {
        cm.RegisterCRDWatcher(hub, wd.Group, wd.Version, wd.Resource, "prometheus")
    }
    log.Printf("prometheus: registered %d CRD watchers", len(resources))
}
```

Note: This depends on `cluster.Manager` having a `RegisterCRDWatcher` method. If it doesn't exist, we need to add it (see Task 6).

---

## Task 5: Implement Calico plugin watchers

**Files:**
- Modify: `backend/plugins/calico/plugin.go`

**Step 1: Replace stub RegisterWatchers with real implementation**

```go
func (p *CalicoPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
    resources := manifest.Backend.Watchers
    for _, wd := range resources {
        cm.RegisterCRDWatcher(hub, wd.Group, wd.Version, wd.Resource, "calico")
    }
    log.Printf("calico: registered %d CRD watchers", len(resources))
}
```

---

## Task 6: Add RegisterCRDWatcher to ClusterManager (if missing)

**Files:**
- Modify: `backend/internal/cluster/manager.go`

**Step 1: Check if RegisterCRDWatcher exists. If not, add it.**

The method should register a dynamic watcher for a CRD resource across all connected clusters:

```go
// RegisterCRDWatcher starts a watch for a custom resource across all connected
// clusters and broadcasts events through the WebSocket hub.
func (m *Manager) RegisterCRDWatcher(hub *ws.Hub, group, version, resource, pluginID string) {
    m.mu.RLock()
    defer m.mu.RUnlock()

    for clusterID, entry := range m.clusters {
        if entry.client == nil {
            continue
        }
        go m.watchCRD(hub, clusterID, entry.client, group, version, resource, pluginID)
    }
}

func (m *Manager) watchCRD(hub *ws.Hub, clusterID string, client dynamic.Interface, group, version, resource, pluginID string) {
    gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
    watcher, err := client.Resource(gvr).Namespace("").Watch(context.Background(), metav1.ListOptions{})
    if err != nil {
        log.Printf("%s: failed to watch %s/%s/%s on cluster %s: %v", pluginID, group, version, resource, clusterID, err)
        return
    }
    defer watcher.Stop()

    for event := range watcher.ResultChan() {
        raw, err := json.Marshal(event.Object)
        if err != nil {
            continue
        }
        subKey := ws.SubscriptionKey(clusterID, resource, "")
        hub.BroadcastToSubscribers(subKey, ws.WatchEvent{
            Cluster:  clusterID,
            Resource: resource,
            Type:     string(event.Type),
            Object:   raw,
        })
    }
}
```

Note: Check existing imports and patterns in manager.go. The dynamic client may already be available. Adapt to existing code patterns.

---

## Task 7: Docker Compose hardening

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Add health check to frontend, restart policies, and resource limits**

The complete updated docker-compose.yml should include:

For the `frontend` service, add:
```yaml
    healthcheck:
      test: ["CMD-SHELL", "wget -qO /dev/null http://localhost:3000/login || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 30s
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
```

For the `backend` service, add:
```yaml
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
```

For the `postgres` service, add:
```yaml
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
```

---

## Task 8: Fix Helm frontend liveness probe path

**Files:**
- Modify: `deploy/helm/argus/templates/frontend-deployment.yaml`

**Step 1: Change liveness and readiness probe paths from `/` to `/login`**

```yaml
          livenessProbe:
            httpGet:
              path: /login
              port: http
            initialDelaySeconds: 15
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /login
              port: http
            initialDelaySeconds: 10
            periodSeconds: 10
```

---

## Task 9: Add HorizontalPodAutoscaler templates to Helm

**Files:**
- Create: `deploy/helm/argus/templates/backend-hpa.yaml`
- Create: `deploy/helm/argus/templates/frontend-hpa.yaml`
- Modify: `deploy/helm/argus/values.yaml`

**Step 1: Create backend HPA**

```yaml
{{- if .Values.backend.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "argus.fullname" . }}-backend
  labels:
    {{- include "argus.labels" . | nindent 4 }}
    app.kubernetes.io/component: backend
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "argus.fullname" . }}-backend
  minReplicas: {{ .Values.backend.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.backend.autoscaling.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.backend.autoscaling.targetCPUUtilization }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.backend.autoscaling.targetMemoryUtilization }}
{{- end }}
```

**Step 2: Create frontend HPA (same pattern)**

```yaml
{{- if .Values.frontend.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "argus.fullname" . }}-frontend
  labels:
    {{- include "argus.labels" . | nindent 4 }}
    app.kubernetes.io/component: frontend
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "argus.fullname" . }}-frontend
  minReplicas: {{ .Values.frontend.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.frontend.autoscaling.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.frontend.autoscaling.targetCPUUtilization }}
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: {{ .Values.frontend.autoscaling.targetMemoryUtilization }}
{{- end }}
```

**Step 3: Add autoscaling values to values.yaml**

Under `backend:` add:
```yaml
  autoscaling:
    enabled: false
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilization: 70
    targetMemoryUtilization: 80
```

Under `frontend:` add:
```yaml
  autoscaling:
    enabled: false
    minReplicas: 2
    maxReplicas: 5
    targetCPUUtilization: 70
    targetMemoryUtilization: 80
```

---

## Task 10: Add PostgreSQL resource limits in Helm

**Files:**
- Modify: `deploy/helm/argus/templates/postgresql-statefulset.yaml`
- Modify: `deploy/helm/argus/values.yaml`

**Step 1: Add resources to PostgreSQL values**

Under `postgresql:` add:
```yaml
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: "1"
      memory: 1Gi
```

**Step 2: Add resources block to PostgreSQL StatefulSet template container spec**

Add under the PostgreSQL container:
```yaml
          resources:
            {{- toYaml .Values.postgresql.resources | nindent 12 }}
```

---

## Task 11: Add missing database indices (performance)

**Files:**
- Create: `backend/migrations/008_add_performance_indices.up.sql`
- Create: `backend/migrations/008_add_performance_indices.down.sql`

**Step 1: Create up migration**

```sql
-- 008_add_performance_indices.up.sql
-- Performance indices for frequently queried columns

-- audit_log: queries by action and resource type
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource);

-- user_roles: unique constraint to prevent duplicate assignments
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique
    ON user_roles(user_id, role_id, cluster_id, namespace)
    WHERE cluster_id IS NOT NULL AND namespace IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_unique_global
    ON user_roles(user_id, role_id)
    WHERE cluster_id IS NULL AND namespace IS NULL;

-- notification_config: filter by enabled status
CREATE INDEX IF NOT EXISTS idx_notification_config_enabled
    ON notification_config(enabled) WHERE enabled = true;
```

**Step 2: Create down migration**

```sql
-- 008_add_performance_indices.down.sql
DROP INDEX IF EXISTS idx_audit_log_action;
DROP INDEX IF EXISTS idx_audit_log_resource;
DROP INDEX IF EXISTS idx_user_roles_unique;
DROP INDEX IF EXISTS idx_user_roles_unique_global;
DROP INDEX IF EXISTS idx_notification_config_enabled;
```

---

## Task 12: Add Makefile convenience targets

**Files:**
- Modify: `Makefile`

**Step 1: Add help, cli-build, agent-build, and docker-logs targets**

```makefile
.PHONY: help
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: cli-build
cli-build: ## Build the Argus CLI binary
	cd cli && go build -o ../bin/argus .

.PHONY: agent-build
agent-build: ## Build the cluster agent binary
	cd agent && go build -o ../bin/argus-agent .

.PHONY: docker-logs
docker-logs: ## Show Docker Compose logs (follow mode)
	docker compose logs -f
```

---

## Task 13: Update Jenkinsfile Go version

**Files:**
- Modify: `jenkins/backend.Jenkinsfile`
- Modify: `jenkins/frontend.Jenkinsfile`

**Step 1: Update Go version from 1.22 to 1.25 in jenkins/backend.Jenkinsfile**

Find `golang:1.22` and replace with `golang:1.25`.

---

## Task 14: Validate everything builds and tests pass

**Step 1:** Run `cd backend && go build ./cmd/server/`
**Step 2:** Run `cd backend && go vet ./...`
**Step 3:** Run `cd backend && go test ./...`
**Step 4:** Run `cd frontend && npm run lint`
**Step 5:** Run `cd frontend && npm test`
**Step 6:** Run `make helm-lint`

All must pass with zero errors.

---

## Task 15: Build Docker images

**Step 1:** Run `docker compose build`
**Step 2:** Verify all 3 images built successfully (backend, frontend, postgres)

---

## Task 16: Docker Compose smoke test

**Step 1:** Run `docker compose up -d`
**Step 2:** Wait for health checks to pass
**Step 3:** Test backend: `curl http://localhost:8080/healthz`
**Step 4:** Test frontend: `curl -L http://localhost:3000/login`
**Step 5:** Test login: `curl -X POST http://localhost:8080/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@argus.local","password":"admin"}'`
**Step 6:** Run `docker compose down`
