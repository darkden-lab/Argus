# Deployment Guide

## Docker Compose (Development)

The fastest way to get Argus running locally.

### Prerequisites

- Docker and Docker Compose
- Make (optional)

### Quick Start

```bash
git clone https://github.com/darkden-lab/argus.git
cd argus

# Copy env file and start
cp .env.example .env
make dev
```

This starts three containers:
- **PostgreSQL** (pgvector/pgvector:0.8.0-pg16) on port 5432
- **Backend** (Go) on port 8080
- **Frontend** (Next.js) on port 3000

Open http://localhost:3000 to access the dashboard. The setup wizard will guide you through creating the first admin account.

### Background Mode

```bash
make docker-up     # Start in background
make docker-down   # Stop all containers
make build         # Rebuild images
```

### With Kafka (Optional)

Enable async notifications via Kafka:

```bash
docker compose --profile kafka up
```

This adds Zookeeper and Kafka containers. Set `KAFKA_BROKERS=kafka:9092` in the backend environment.

---

## Docker Compose (Production)

For production deployments using Docker Compose, update `.env` with production values:

```bash
# Required - change these from defaults
APP_ENV=production
JWT_SECRET=<generate-a-strong-secret>
ENCRYPTION_KEY=<64-char-hex-string>
DATABASE_URL=postgres://dashboard:<strong-password>@postgres:5432/argus?sslmode=require

# OIDC (optional)
OIDC_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_CLIENT_ID=<client-id>
OIDC_CLIENT_SECRET=<client-secret>
OIDC_REDIRECT_URL=https://argus.yourdomain.com/api/auth/oidc/callback

# CORS
ALLOWED_ORIGINS=https://argus.yourdomain.com
FRONTEND_URL=https://argus.yourdomain.com
```

Generate secure secrets:

```bash
# JWT secret
openssl rand -base64 48

# Encryption key (64-char hex = 32 bytes)
openssl rand -hex 32
```

Place a reverse proxy (nginx, Caddy, Traefik) in front to handle TLS termination.

---

## Kubernetes with Helm

### Prerequisites

- Kubernetes cluster (1.25+)
- Helm 3
- `kubectl` configured

### Install

```bash
helm install argus deploy/helm/argus \
  --namespace argus --create-namespace \
  --set backend.env.jwtSecret="$(openssl rand -base64 48)" \
  --set backend.env.encryptionKey="$(openssl rand -hex 32)" \
  --set postgresql.env.password="strong-db-password" \
  --set ingress.enabled=true \
  --set ingress.host=argus.yourdomain.com
```

### Helm Values Reference

#### Backend

| Value | Default | Description |
|-------|---------|-------------|
| `backend.image.repository` | `argus/backend` | Backend Docker image |
| `backend.image.tag` | `latest` | Image tag |
| `backend.replicas` | `2` | Number of replicas |
| `backend.resources.requests.cpu` | `100m` | CPU request |
| `backend.resources.requests.memory` | `128Mi` | Memory request |
| `backend.resources.limits.cpu` | `500m` | CPU limit |
| `backend.resources.limits.memory` | `256Mi` | Memory limit |
| `backend.env.databaseURL` | `""` | PostgreSQL connection string (auto-generated if `postgresql.enabled`) |
| `backend.env.jwtSecret` | `""` | JWT signing secret |
| `backend.env.encryptionKey` | `""` | AES-256-GCM encryption key (64-char hex) |
| `backend.autoscaling.enabled` | `false` | Enable HPA |
| `backend.autoscaling.minReplicas` | `2` | Min replicas for HPA |
| `backend.autoscaling.maxReplicas` | `10` | Max replicas for HPA |
| `backend.autoscaling.targetCPUUtilization` | `70` | CPU threshold (%) |

#### Frontend

| Value | Default | Description |
|-------|---------|-------------|
| `frontend.image.repository` | `argus/frontend` | Frontend Docker image |
| `frontend.image.tag` | `latest` | Image tag |
| `frontend.replicas` | `2` | Number of replicas |
| `frontend.env.apiUrl` | `http://argus-backend:8080` | Backend API URL (internal) |
| `frontend.autoscaling.enabled` | `false` | Enable HPA |
| `frontend.autoscaling.maxReplicas` | `5` | Max replicas for HPA |

#### PostgreSQL

| Value | Default | Description |
|-------|---------|-------------|
| `postgresql.enabled` | `true` | Deploy PostgreSQL StatefulSet |
| `postgresql.image.repository` | `pgvector/pgvector` | Image (must support pgvector for AI/RAG) |
| `postgresql.image.tag` | `0.8.0-pg16` | Image tag |
| `postgresql.persistence.size` | `10Gi` | PVC size |
| `postgresql.persistence.storageClass` | `""` | Storage class (empty = default) |
| `postgresql.env.database` | `argus` | Database name |
| `postgresql.env.username` | `dashboard` | Database user |
| `postgresql.env.password` | `devpassword` | Database password |

#### Ingress

| Value | Default | Description |
|-------|---------|-------------|
| `ingress.enabled` | `false` | Enable Ingress resource |
| `ingress.className` | `nginx` | Ingress class |
| `ingress.host` | `argus.local` | Hostname |
| `ingress.tls` | `[]` | TLS configuration |

#### OIDC

| Value | Default | Description |
|-------|---------|-------------|
| `oidc.enabled` | `false` | Enable OIDC authentication |
| `oidc.issuerURL` | `""` | OIDC provider issuer URL |
| `oidc.clientID` | `""` | OAuth2 client ID |
| `oidc.clientSecret` | `""` | OAuth2 client secret |
| `oidc.redirectURL` | `""` | Redirect URI |
| `oidc.groupsClaim` | `groups` | JWT claim for group memberships |

#### Network Policy

| Value | Default | Description |
|-------|---------|-------------|
| `networkPolicy.enabled` | `false` | Enable network policies |

#### Plugins

Each plugin can be individually enabled/disabled:

| Value | Default | Description |
|-------|---------|-------------|
| `plugins.istio.enabled` | `true` | Istio service mesh plugin |
| `plugins.prometheus.enabled` | `true` | Prometheus metrics plugin |
| `plugins.calico.enabled` | `true` | Calico network policy plugin |
| `plugins.cnpg.enabled` | `false` | CloudNativePG plugin |
| `plugins.mariadb.enabled` | `false` | MariaDB operator plugin |
| `plugins.keda.enabled` | `false` | KEDA autoscaler plugin |
| `plugins.ceph.enabled` | `false` | Rook-Ceph storage plugin |
| `plugins.helm.enabled` | `false` | Helm release plugin |

### Upgrade

```bash
helm upgrade argus deploy/helm/argus \
  --namespace argus \
  --reuse-values
```

### Uninstall

```bash
helm uninstall argus --namespace argus
```

> **Note:** The PostgreSQL PVC is not deleted on uninstall. Delete it manually if you want to remove all data.

---

## Environment Variables

Complete list of backend environment variables (from `backend/internal/config/config.go`):

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | Set to `production` to enforce secret validation |
| `PORT` | `8080` | HTTP server port |
| `DATABASE_URL` | `postgres://dashboard:devpassword@localhost:5432/argus?sslmode=disable` | PostgreSQL connection string |
| `JWT_SECRET` | `dev-secret-change-in-prod` | JWT signing secret |
| `ENCRYPTION_KEY` | `0123456789...` (64-char hex) | AES-256-GCM key for encrypting kubeconfigs and secrets |
| `MIGRATIONS_PATH` | `migrations` | Path to SQL migration files |
| `OIDC_ISSUER` | `""` | OIDC provider issuer URL |
| `OIDC_CLIENT_ID` | `""` | OIDC client ID |
| `OIDC_CLIENT_SECRET` | `""` | OIDC client secret |
| `OIDC_REDIRECT_URL` | `http://localhost:8080/api/auth/oidc/callback` | OIDC redirect URI |
| `KAFKA_BROKERS` | `""` | Kafka brokers (empty = in-memory broker) |
| `KAFKA_CONSUMER_GROUP` | `argus-notifications` | Kafka consumer group |
| `SMTP_HOST` | `""` | SMTP server host |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | `""` | SMTP username |
| `SMTP_PASS` | `""` | SMTP password |
| `SMTP_FROM` | `""` | Sender email address |
| `NOTIFICATION_FROM_NAME` | `K8s Dashboard` | Sender display name |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL (for OIDC redirects) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS allowed origins (comma-separated) |
| `GRPC_PORT` | `9090` | gRPC agent server port |
| `GRPC_TLS_CERT` | `""` | Path to gRPC TLS certificate |
| `GRPC_TLS_KEY` | `""` | Path to gRPC TLS private key |

**Frontend environment:**

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Backend API URL |

---

## Production Checklist

Before deploying to production, verify:

- [ ] `APP_ENV=production` -- blocks startup with default dev secrets
- [ ] `JWT_SECRET` -- changed from default, strong random value
- [ ] `ENCRYPTION_KEY` -- changed from default, 64-char hex string
- [ ] `DATABASE_URL` -- strong password, `sslmode=require`
- [ ] `ALLOWED_ORIGINS` -- set to your actual frontend domain(s)
- [ ] `FRONTEND_URL` -- set to your actual frontend URL
- [ ] TLS termination configured (reverse proxy or ingress)
- [ ] PostgreSQL backups configured
- [ ] Ingress/reverse proxy rate limiting enabled
- [ ] gRPC TLS enabled (`GRPC_TLS_CERT`, `GRPC_TLS_KEY`) if agents connect over the internet
- [ ] Network policies enabled (`networkPolicy.enabled=true` in Helm)
- [ ] Container images pinned to specific tags (not `latest`)
- [ ] Resource limits set for all pods
- [ ] Pod security context configured (non-root, read-only filesystem)
