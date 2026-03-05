# Helm Deploy Fixes Design

## Problems

1. **Kubeconfig cluster addition fails silently** - Error swallowed in handler, cluster stored as zombie in DB
2. **Helm charts not published to OCI registry** - `helm install oci://ghcr.io/...` doesn't work
3. **No HTTPRoute support** - Only nginx Ingress hardcoded
4. **Docs outdated** - Don't reflect OCI install or HTTPRoute option

## Solution

### 1. Fix kubeconfig cluster addition

**Files:** `backend/internal/cluster/handlers.go`, `backend/internal/cluster/manager.go`

Changes:
- Return actual error message to user instead of generic "failed to add cluster"
- If cluster stored but client fails: return 201 with cluster (status=disconnected) + warning field, NOT 500
- Detect exec-based kubeconfig auth providers and return clear error
- Run immediate connectivity test (`ServerVersion()`) and include result in response
- Log the real error server-side for debugging

### 2. Publish Helm charts to ghcr.io OCI

**Files:** `.github/workflows/release.yml`

Changes:
- Add `helm-push` job after `helm-charts` job
- Login to ghcr.io, push both charts as OCI to `oci://ghcr.io/darkden-lab/helm-charts/`
- Charts available as `oci://ghcr.io/darkden-lab/helm-charts/argus` and `oci://ghcr.io/darkden-lab/helm-charts/argus-agent`

### 3. Add HTTPRoute support

**Files:** `deploy/helm/argus/templates/httproute.yaml` (new), `deploy/helm/argus/values.yaml`

Changes:
- New `gateway` section in values.yaml (disabled by default)
- HTTPRoute template with rules for /api, /ws, / paths
- Gateway API v1 (gateway.networking.k8s.io/v1)
- WebSocket support via HTTPRoute backendRefs
- Mutual exclusion: warn if both ingress and gateway enabled

### 4. Update docs

**Files:** `docs/deployment-guide.md`, `docs/cluster-agent.md`

Changes:
- Add OCI Helm install instructions for both argus and argus-agent
- Add HTTPRoute configuration section
- Add Gateway values reference table
- Update cluster-agent install to use OCI registry
- Fix values reference tables (backend.image.repository shows wrong default)
