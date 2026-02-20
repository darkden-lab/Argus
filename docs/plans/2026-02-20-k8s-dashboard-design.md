# K8s Admin Dashboard - Design Document

**Date:** 2026-02-20
**Status:** Approved

## Overview

Dashboard de administracion multi-cluster de Kubernetes con sistema de plugins extensible. Permite gestionar recursos nativos de K8s y extender funcionalidad via plugins (Istio, Prometheus Operator, Calico).

## Requirements

| Aspecto | Decision |
|---|---|
| Framework frontend | Next.js 16 (App Router, RSC) |
| Backend | Go (client-go, gorilla/mux) |
| Base de datos | PostgreSQL |
| Auth | JWT propio + OIDC/LDAP |
| RBAC | Granular (por cluster/namespace) |
| Clusters | Multi-cluster dinamico |
| Real-time | WebSockets (watch K8s resources) |
| Plugins | API + manifiestos |

## Team

| Rol | Responsabilidad |
|---|---|
| UX Designer | Sistema de diseno, wireframes, flujos de usuario |
| Frontend Developer | Next.js 16, React, TypeScript, WebSocket client, plugin UI renderer |
| Backend Developer | API Go, client-go, motor de plugins, WebSocket hub, auth/RBAC |
| Kubernetes Expert | Arquitectura K8s, manifiestos plugins, multi-cluster, CRDs |
| QA / Testing | Tests E2E, unitarios (Go + TS), integracion |
| DevOps/CI-CD | Pipelines, Dockerfiles, Helm charts, despliegue |

## Architecture

```
                        USUARIO (Browser)
                             |
                        HTTPS / WSS
                             |
                   +---------v----------+
                   |  NEXT.JS 16        |
                   |  FRONTEND          |
                   |                    |
                   |  App Router (RSC)  |
                   |  Plugin UI Render  |
                   |  WebSocket Client  |
                   +---------+----------+
                             |
                        REST + WS
                             |
                   +---------v----------+
                   |  GO BACKEND API    |
                   |                    |
                   |  Auth Service      |
                   |  (JWT + OIDC)      |
                   |                    |
                   |  RBAC Engine       |
                   |                    |
                   |  Cluster Manager   |
                   |  (client-go)       |
                   |                    |
                   |  Plugin Engine     |
                   |  (manifests)       |
                   |                    |
                   |  WebSocket Hub     |
                   |                    |
                   |  PostgreSQL -------+---> DB
                   +----+----+----+----+
                        |    |    |
                   client-go connections
                        |    |    |
                   +----v-+--v-+--v----+
                   |Cl. A |Cl. B|Cl. N |
                   +------+-----+------+
```

### Frontend (Next.js 16)

**Rutas principales:**
- `/dashboard` - Overview global (health de clusters, metricas, eventos recientes)
- `/clusters` - Lista, add/remove clusters
- `/clusters/[id]` - Detalle de cluster (nodos, workloads, networking, storage, config, RBAC K8s)
- `/clusters/[id]/[resource-type]` - Lista de recursos (pods, deployments, services, etc.)
- `/clusters/[id]/[resource-type]/[name]` - Detalle de recurso con YAML editor
- `/plugins/*` - Rutas dinamicas cargadas desde manifiesto de plugins
- `/settings` - Usuarios, roles, OIDC config, gestion de plugins
- `/login` - Autenticacion

**Componentes clave:**
- `PluginRouter` - Mapea rutas de manifiesto a componentes React
- `PluginNavigation` - Genera menu lateral segun plugins habilitados y permisos
- `ResourceTable` - Tabla generica reutilizable para listar recursos K8s
- `ResourceDetail` - Vista de detalle con YAML editor y acciones
- `WebSocketProvider` - Context provider para eventos real-time
- `RBACGate` - Wrapper que oculta/muestra UI segun permisos del usuario

### Backend (Go)

**Modulos:**

1. **Auth Service**
   - JWT: generacion, validacion, refresh tokens
   - OIDC: discovery, callback, session mapping
   - LDAP: bind, search, group mapping
   - Middleware de autenticacion para todas las rutas

2. **RBAC Engine**
   - Evaluacion de permisos: usuario + accion + recurso + scope (cluster/namespace)
   - Cache de permisos en memoria con invalidacion
   - Middleware que inyecta permisos evaluados en el contexto de la request

3. **Cluster Manager**
   - Pool de conexiones client-go por cluster
   - Add/remove clusters dinamico
   - Health check periodico de clusters
   - Kubeconfig cifrado (AES-256) almacenado en PostgreSQL
   - API generica para CRUD de cualquier recurso K8s (GET/LIST/CREATE/UPDATE/DELETE)

4. **Core K8s Module**
   Gestion de recursos nativos de Kubernetes (no es plugin):

   | Categoria | Recursos |
   |---|---|
   | Workloads | Pods, Deployments, StatefulSets, DaemonSets, Jobs, CronJobs, ReplicaSets |
   | Networking | Services, Ingresses, Endpoints |
   | Config | ConfigMaps, Secrets, ResourceQuotas, LimitRanges |
   | Storage | PersistentVolumes, PersistentVolumeClaims, StorageClasses |
   | Cluster | Nodes, Namespaces, Events, ServiceAccounts |
   | RBAC K8s | Roles, ClusterRoles, RoleBindings, ClusterRoleBindings |
   | CRDs | Listado y exploracion de Custom Resource Definitions |

5. **Plugin Engine**
   - Registro de plugins al arrancar
   - Validacion de manifiestos
   - Registro dinamico de rutas y watchers
   - API: `GET /api/plugins` (lista manifiestos habilitados para el frontend)
   - Lifecycle: install -> enable -> disable -> remove

6. **WebSocket Hub**
   - Conexion por usuario con suscripciones a recursos
   - Multiplexacion: un watch K8s alimenta a N clientes
   - Formato de mensaje: `{ cluster, resource, type (ADDED/MODIFIED/DELETED), object }`

## Plugin System

### Manifest Schema

```json
{
  "id": "string",
  "name": "string",
  "version": "semver",
  "description": "string",
  "permissions": ["resource:action"],
  "backend": {
    "routes": [
      { "method": "GET|POST|PUT|DELETE", "path": "/api/plugins/{id}/...", "handler": "HandlerName" }
    ],
    "watchers": [
      { "group": "string", "version": "string", "resource": "string" }
    ]
  },
  "frontend": {
    "navigation": [
      { "label": "string", "icon": "string", "path": "string" }
    ],
    "routes": [
      { "path": "string", "component": "ComponentName" }
    ],
    "widgets": [
      { "id": "string", "type": "dashboard-card", "component": "ComponentName" }
    ]
  }
}
```

### Plugin Interface (Go)

```go
type Plugin interface {
    ID() string
    Manifest() Manifest
    RegisterRoutes(router *mux.Router)
    RegisterWatchers(cm *ClusterManager)
    OnEnable(ctx context.Context) error
    OnDisable(ctx context.Context) error
}
```

### Initial Plugins

| Plugin | CRDs / Resources |
|---|---|
| Istio | VirtualServices, Gateways, DestinationRules, ServiceEntries |
| Prometheus Operator | ServiceMonitors, PodMonitors, PrometheusRules, Alertmanagers |
| Calico | NetworkPolicies, GlobalNetworkPolicies, HostEndpoints, IPPools |

## Data Model (PostgreSQL)

### users
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| email | VARCHAR(255) | UNIQUE |
| password_hash | VARCHAR(255) | nullable (OIDC users) |
| display_name | VARCHAR(255) | |
| auth_provider | VARCHAR(50) | 'local', 'oidc', 'ldap' |
| oidc_subject | VARCHAR(255) | nullable |
| created_at | TIMESTAMPTZ | |
| last_login | TIMESTAMPTZ | |

### roles
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | VARCHAR(100) | UNIQUE (admin, operator, developer, viewer) |
| description | TEXT | |
| created_at | TIMESTAMPTZ | |

### role_permissions
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| role_id | UUID | FK -> roles |
| resource | VARCHAR(100) | e.g. 'pods', 'deployments', 'istio:virtualservices' |
| action | VARCHAR(50) | 'read', 'write', 'delete', '*' |
| scope_type | VARCHAR(50) | 'global', 'cluster', 'namespace' |
| scope_id | VARCHAR(255) | nullable - cluster_id or namespace |

### user_roles
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK -> users |
| role_id | UUID | FK -> roles |
| cluster_id | UUID | FK -> clusters, nullable (null = all clusters) |
| namespace | VARCHAR(255) | nullable (null = all namespaces) |

### clusters
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | VARCHAR(255) | |
| api_server_url | VARCHAR(500) | |
| kubeconfig_enc | BYTEA | AES-256 encrypted |
| status | VARCHAR(50) | 'connected', 'disconnected', 'error' |
| labels | JSONB | |
| created_at | TIMESTAMPTZ | |
| last_health | TIMESTAMPTZ | |

### plugins
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(100) | PK |
| name | VARCHAR(255) | |
| version | VARCHAR(50) | |
| manifest | JSONB | full manifest |
| enabled | BOOLEAN | |
| installed_at | TIMESTAMPTZ | |

### plugin_state
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| plugin_id | VARCHAR(100) | FK -> plugins |
| cluster_id | UUID | FK -> clusters |
| status | VARCHAR(50) | 'installed', 'enabled', 'disabled', 'error' |
| config | JSONB | plugin-specific config per cluster |
| installed_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### audit_log
| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK -> users |
| cluster_id | UUID | FK -> clusters, nullable |
| action | VARCHAR(100) | e.g. 'create_deployment', 'delete_pod' |
| resource | VARCHAR(255) | e.g. 'deployment/nginx' |
| details | JSONB | request/response metadata |
| timestamp | TIMESTAMPTZ | |

### Security Notes

- `kubeconfig_enc`: cifrado AES-256-GCM. La clave se obtiene de variable de entorno o K8s Secret, nunca de la DB.
- `password_hash`: bcrypt con cost 12+.
- `audit_log`: inmutable, append-only.
- Secrets de K8s se muestran ofuscados en el frontend por defecto.

## Tech Stack Summary

**Frontend:**
- Next.js 16 (App Router, Server Components, Server Actions)
- TypeScript
- Tailwind CSS + shadcn/ui
- WebSocket (native API)
- Zustand (client state)

**Backend:**
- Go 1.22+
- client-go (K8s API)
- gorilla/mux (HTTP router)
- gorilla/websocket (WS)
- sqlc o pgx (PostgreSQL)
- golang-jwt (JWT)
- coreos/go-oidc (OIDC)

**Infra:**
- PostgreSQL 16
- Docker (multi-stage builds)
- Helm chart para despliegue en K8s
- GitHub Actions (CI/CD)
