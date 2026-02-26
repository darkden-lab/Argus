# Cluster Agent

## Overview

The Argus Cluster Agent is a lightweight Go binary that runs inside a target Kubernetes cluster and connects back to the Argus dashboard via gRPC bidirectional streaming. It eliminates the need to upload kubeconfig files by acting as an in-cluster proxy.

**When to use the agent:**
- The target cluster is behind a firewall or NAT (no inbound connectivity)
- You want to avoid storing kubeconfig files on the dashboard server
- You need real-time watch events from the cluster
- You want minimal permissions via RBAC presets

**When kubeconfig upload is sufficient:**
- The dashboard server has direct network access to the K8s API
- You need a quick setup without deploying an agent

## How It Works

```
+-------------------+          gRPC stream          +-------------------+
|   Argus Dashboard |<----------------------------->|   Cluster Agent   |
|   (backend:9090)  |                               |   (in-cluster)    |
+-------------------+                               +-------------------+
                                                            |
                                                    K8s API (via ServiceAccount)
                                                            |
                                                    +-------------------+
                                                    |  Target Cluster   |
                                                    +-------------------+
```

1. The agent registers with the dashboard using a one-time token
2. A bidirectional gRPC stream is established
3. The dashboard sends K8s API requests through the stream
4. The agent executes them locally and returns responses
5. The agent sends watch events and heartbeat pings

## Deployment

### Step 1: Generate a Registration Token

In the Argus dashboard, go to **Settings > Clusters > Add Agent** or use the API:

```bash
curl -X POST https://argus.yourdomain.com/api/clusters/agent-token \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"cluster_name": "production", "permissions": "read-only"}'
```

The response includes:
- `token` -- One-time registration JWT
- `install_command` -- Ready-to-use install command

### Step 2: Deploy with Helm

```bash
helm install argus-agent deploy/helm/argus-agent \
  --namespace argus-system --create-namespace \
  --set dashboard.url="argus-backend.argus.svc.cluster.local:9090" \
  --set dashboard.clusterName="production" \
  --set dashboard.token="<registration-token>"
```

Or with TLS:

```bash
helm install argus-agent deploy/helm/argus-agent \
  --namespace argus-system --create-namespace \
  --set dashboard.url="argus.yourdomain.com:9090" \
  --set dashboard.clusterName="production" \
  --set dashboard.token="<registration-token>" \
  --set dashboard.tlsEnabled=true
```

### Step 3: One-liner Install Script

Alternatively, use the install script provided by the dashboard:

```bash
curl -sSL https://argus.yourdomain.com/api/agents/install.sh | bash -s -- \
  --dashboard-url https://argus.yourdomain.com \
  --cluster-name "production" \
  --token <registration-token>
```

## Helm Values Reference

| Value | Default | Description |
|-------|---------|-------------|
| `image.repository` | `argus/agent` | Agent Docker image |
| `image.tag` | `latest` | Image tag |
| `replicas` | `1` | Number of agent replicas |
| `dashboard.url` | `""` | gRPC endpoint of the dashboard (required) |
| `dashboard.token` | `""` | Registration token (required) |
| `dashboard.clusterName` | `""` | Cluster display name |
| `dashboard.tlsEnabled` | `false` | Enable TLS for gRPC |
| `rbac.preset` | `read-only` | RBAC preset: `read-only`, `operator`, `admin`, `custom` |
| `rbac.customRules` | `[]` | Custom RBAC rules (when preset is `custom`) |
| `resources.requests.cpu` | `50m` | CPU request |
| `resources.requests.memory` | `64Mi` | Memory request |
| `resources.limits.cpu` | `200m` | CPU limit |
| `resources.limits.memory` | `128Mi` | Memory limit |

### RBAC Presets

| Preset | Description |
|--------|-------------|
| `read-only` | GET/LIST/WATCH on all resources (default) |
| `operator` | Read-only + create/update/delete on common workloads |
| `admin` | Full cluster-admin permissions |
| `custom` | User-defined rules via `rbac.customRules` |

**Custom rules example:**

```yaml
rbac:
  preset: custom
  customRules:
    - apiGroups: [""]
      resources: ["pods", "services", "configmaps"]
      verbs: ["get", "list", "watch"]
    - apiGroups: ["apps"]
      resources: ["deployments", "statefulsets"]
      verbs: ["get", "list", "watch", "update", "patch"]
```

## gRPC Protocol

The agent communicates with the dashboard via the `ClusterAgent` gRPC service defined in `proto/agent/v1/agent.proto`.

### Registration

```protobuf
rpc Register(RegisterRequest) returns (RegisterResponse);
```

- Called once on first connection
- Exchanges a one-time registration token for permanent agent credentials
- Returns a `cluster_id` and permanent `agent_token`

### Streaming

```protobuf
rpc Stream(stream AgentMessage) returns (stream DashboardMessage);
```

Bidirectional stream carrying:

**Dashboard to Agent:**
- `K8sRequest` -- HTTP method + path + body to execute against the local K8s API
- `WatchSubscribe` / `WatchUnsubscribe` -- Start/stop watching resources
- `Ping` -- Heartbeat

**Agent to Dashboard:**
- `K8sResponse` -- HTTP status + body from the local K8s API
- `WatchEvent` -- ADDED/MODIFIED/DELETED events from watches
- `Pong` -- Heartbeat reply
- `ClusterInfo` -- Cluster metadata (K8s version, node count, namespaces, CRDs)

## TLS Configuration

For production deployments, enable TLS on the gRPC server:

**Dashboard side** (backend environment variables):
```
GRPC_TLS_CERT=/path/to/tls.crt
GRPC_TLS_KEY=/path/to/tls.key
```

**Agent side** (Helm values):
```yaml
dashboard:
  tlsEnabled: true
```

The gRPC server enforces TLS 1.2+ when certificates are configured.

## Security

- Registration tokens are one-time use JWTs signed with the dashboard's `JWT_SECRET`
- After registration, the agent receives a permanent long-lived JWT
- The agent runs as non-root (UID 65534) with a read-only filesystem
- The agent's ServiceAccount permissions are controlled by the RBAC preset
- seccomp profile `RuntimeDefault` is enforced
- All capabilities are dropped

## Troubleshooting

### Agent cannot connect to dashboard

1. Verify the dashboard URL is reachable from inside the cluster:
   ```bash
   kubectl -n argus-system exec deploy/argus-agent -- wget -qO- http://dashboard-url:9090 || echo "unreachable"
   ```

2. Check if the gRPC port (9090) is exposed. For cross-cluster connections, ensure the port is accessible through any firewalls or load balancers.

3. If using TLS, verify the certificate is valid and `dashboard.tlsEnabled=true` is set.

### Token rejected

- Registration tokens are single-use. If the token was already used, generate a new one.
- Tokens expire after a set period. Generate a fresh token if the old one has expired.
- Verify the dashboard's `JWT_SECRET` hasn't changed since token generation.

### Agent keeps reconnecting

1. Check agent logs:
   ```bash
   kubectl -n argus-system logs deploy/argus-agent
   ```

2. Verify the agent has sufficient RBAC permissions for the operations being requested.

3. Check network stability between the agent and dashboard.

### Agent shows "unhealthy" in dashboard

The dashboard pings agents every 30 seconds. If a pong is not received, the agent is marked unhealthy.

- Check agent pod status: `kubectl -n argus-system get pods`
- Check for OOM kills: `kubectl -n argus-system describe pod <agent-pod>`
- Increase memory limits if needed
