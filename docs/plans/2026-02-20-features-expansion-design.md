# K8s Dashboard - Features Expansion Design

**Date:** 2026-02-20
**Status:** Approved

## Overview

Cuatro nuevas features para el dashboard de administracion K8s. Cada una es independiente y puede implementarse en paralelo.

---

## Feature 1: Sistema de Notificaciones Async (Kafka)

### Arquitectura

```
K8s Watches / Audit Middleware / Health Checks
                    |
              EventProducer
                    |
            MessageBroker (interfaz)
            /               \
     KafkaBroker        InMemoryBroker
     (produccion)       (dev/fallback)
                    |
        Topics: alerts.critical, alerts.security,
                alerts.operations, alerts.info, digest
                    |
            NotificationConsumer (goroutine)
                    |
            NotificationRouter
           /    |     |    \     \
        Email Teams Slack Telegram Webhook
                    |
            PostgreSQL (inbox + preferences)
```

### Decisiones

| Aspecto | Decision |
|---|---|
| Message broker | Interfaz pluggable: KafkaBroker (prod) + InMemoryBroker (dev/fallback) |
| Consumer | Goroutine consumer group dentro del backend Go |
| Preferencias usuario | Por categoria + canal + frecuencia |
| Canales | Email (SMTP/SendGrid), Teams (webhook), Slack (webhook), Telegram (Bot API), Webhook custom |
| Integracion Teams/Slack | Webhooks ahora, preparado para bots en el futuro |
| Inbox | Si, notificaciones almacenadas en PostgreSQL con estado read/unread |

### Componentes Backend

- `internal/notifications/broker.go` - Interfaz MessageBroker:
  ```go
  type MessageBroker interface {
      Publish(ctx context.Context, topic string, event Event) error
      Subscribe(ctx context.Context, topic string, handler EventHandler) error
      Close() error
  }
  ```
  Implementaciones: KafkaBroker (segmentio/kafka-go), InMemoryBroker (Go channels)

- `internal/notifications/producer.go` - EventProducer: convierte eventos del sistema en mensajes al broker
- `internal/notifications/consumer.go` - Consumer group que procesa mensajes y los enruta a canales
- `internal/notifications/router.go` - NotificationRouter: evalua preferencias del usuario y envia al canal correspondiente
- `internal/notifications/digest.go` - Agregador para digests diarios/semanales (cron-like goroutine)
- `internal/notifications/preferences.go` - CRUD preferencias por usuario
- `internal/notifications/handlers.go` - API REST: preferencias, historial, marcar leido

### Canales (internal/notifications/channels/)

- `email.go` - SMTP directo o SendGrid/SES API
- `teams.go` - Microsoft Teams Incoming Webhook (Adaptive Cards)
- `slack.go` - Slack Incoming Webhook (Block Kit)
- `telegram.go` - Telegram Bot API (sendMessage)
- `webhook.go` - HTTP POST custom con payload JSON configurable

### Categorias de Eventos

| Categoria | Eventos | Frecuencia default |
|---|---|---|
| critical | CrashLoopBackOff, OOMKilled, nodo NotReady, PVC pending | Inmediata |
| security | Login fallido x3, cambios RBAC, certificados expirando | Inmediata |
| operations | Deploy fallido, Job fallido, Helm error, backup CNPG fallido | Inmediata |
| info | Cluster anadido, plugin habilitado, nuevo usuario | Digest diario |
| digest | Resumen periodico: health clusters, metricas clave, top eventos | Diario/semanal |

### Nuevas Tablas PostgreSQL

```sql
CREATE TABLE notification_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,           -- 'email', 'teams', 'slack', 'telegram', 'webhook'
    name VARCHAR(255) NOT NULL,
    config_enc BYTEA NOT NULL,           -- AES-256: SMTP creds, webhook URLs, bot tokens
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    category VARCHAR(50) NOT NULL,       -- 'critical', 'security', 'operations', 'info', 'digest'
    channel_id UUID REFERENCES notification_channels(id),
    frequency VARCHAR(20) NOT NULL,      -- 'immediate', 'daily', 'weekly', 'disabled'
    UNIQUE(user_id, category, channel_id)
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    category VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    metadata JSONB,                      -- cluster_id, resource, severity, etc.
    read BOOLEAN DEFAULT false,
    channels_sent TEXT[],                -- canales a los que se envio
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read) WHERE read = false;
```

### Frontend

- Icono campana en header con badge de no leidas (WebSocket push para actualizar en real-time)
- Dropdown con notificaciones recientes al hacer click
- `/settings/notifications` - Pagina de preferencias: matriz categoria x canal con selector de frecuencia
- `/notifications` - Historial completo con filtros por categoria, fecha, estado

### Config (variables de entorno)

```
KAFKA_BROKERS=kafka:9092           # Si vacio, usa InMemoryBroker
KAFKA_CONSUMER_GROUP=k8s-dashboard
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
```

---

## Feature 2: Agente de Conexion a Clusters

### Arquitectura

```
                    DASHBOARD (Go Backend)
                           |
                    gRPC Server (TLS)
                    /      |       \
            Agent A    Agent B    Agent N
            (prod)     (dev)      (staging)
               |          |          |
            K8s API    K8s API    K8s API
```

### Decisiones

| Aspecto | Decision |
|---|---|
| Protocolo | gRPC bidireccional (protobuf, streaming) |
| Registro | Token pre-generado de un solo uso (expira 24h) |
| Permisos | Configurable por ServiceAccount (doble capa RBAC) |
| Coexistencia | Dos metodos: kubeconfig (actual) + agente |

### Flujo de Registro

1. Admin en dashboard: "Add Cluster" > tab "Agent" > selecciona nombre y permisos
2. Dashboard genera token de un solo uso (JWT, 24h expiry) y muestra comando:
   ```bash
   curl -sfL https://dashboard.example.com/api/agents/install.sh | bash -s -- \
     --token eyJhbGci... \
     --dashboard grpc.dashboard.example.com:443 \
     --name "production-cluster"
   ```
   O alternativa Helm:
   ```bash
   helm install dashboard-agent oci://dashboard.example.com/charts/dashboard-agent \
     --set token=eyJhbGci... \
     --set dashboard.url=grpc.dashboard.example.com:443 \
     --set cluster.name=production-cluster
   ```
3. Usuario copia y ejecuta en su cluster
4. Agente se conecta con token > gRPC Handshake > Dashboard valida y registra cluster
5. Agente recibe credenciales permanentes (JWT long-lived)
6. Stream gRPC bidireccional activo

### Proto Definitions

```protobuf
syntax = "proto3";
package dashboard.agent.v1;

service ClusterAgent {
  rpc Register(RegisterRequest) returns (RegisterResponse);
  rpc Stream(stream AgentMessage) returns (stream DashboardMessage);
}

message RegisterRequest {
  string token = 1;
  string cluster_name = 2;
  ClusterInfo cluster_info = 3;
}

message RegisterResponse {
  string agent_id = 1;
  string permanent_token = 2;
}

message ClusterInfo {
  string k8s_version = 1;
  int32 node_count = 2;
  repeated string namespaces = 3;
  repeated string installed_crds = 4;
}

message DashboardMessage {
  string request_id = 1;
  oneof payload {
    K8sRequest k8s_request = 2;
    WatchRequest watch_start = 3;
    WatchStopRequest watch_stop = 4;
    Ping ping = 5;
  }
}

message AgentMessage {
  string request_id = 1;
  oneof payload {
    K8sResponse k8s_response = 2;
    WatchEvent watch_event = 3;
    Pong pong = 4;
    ClusterInfo cluster_info = 5;
  }
}

message K8sRequest {
  string verb = 1;           // get, list, create, update, delete
  string group = 2;
  string version = 3;
  string resource = 4;
  string namespace = 5;
  string name = 6;
  bytes body = 7;            // JSON payload para create/update
}

message K8sResponse {
  int32 status_code = 1;
  bytes body = 2;
  string error = 3;
}

message WatchRequest {
  string group = 1;
  string version = 2;
  string resource = 3;
  string namespace = 4;
}

message WatchStopRequest {
  string watch_id = 1;
}

message WatchEvent {
  string watch_id = 1;
  string event_type = 2;    // ADDED, MODIFIED, DELETED
  bytes object = 3;
}

message Ping {}
message Pong {}
```

### Componentes

**Agent (binario Go independiente, ~15MB):**
- `cmd/agent/main.go` - Entrypoint, carga config, conecta a dashboard
- `internal/agent/connector.go` - gRPC client con reconnect automatico y backoff exponencial
- `internal/agent/proxy.go` - Recibe K8sRequest del dashboard, ejecuta via client-go local (ServiceAccount)
- `internal/agent/watcher.go` - Gestiona watches K8s y envia WatchEvents al dashboard
- `internal/agent/discovery.go` - Al registrarse, envia ClusterInfo
- `internal/agent/heartbeat.go` - Ping/Pong periodico

**Dashboard side (backend):**
- `internal/cluster/agent_server.go` - gRPC server que acepta conexiones de agentes
- `internal/cluster/agent_registry.go` - Gestion de tokens de registro (generacion, validacion, un solo uso)
- Extension de ClusterManager: connection_type 'agent' vs 'kubeconfig'

### DB Changes

```sql
ALTER TABLE clusters ADD COLUMN connection_type VARCHAR(20) DEFAULT 'kubeconfig';
ALTER TABLE clusters ADD COLUMN agent_id VARCHAR(255);
ALTER TABLE clusters ALTER COLUMN kubeconfig_enc DROP NOT NULL;

CREATE TABLE agent_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(255) NOT NULL,
    cluster_name VARCHAR(255) NOT NULL,
    permissions JSONB,
    used BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Helm Chart del Agente (deploy/helm/dashboard-agent/)

- ServiceAccount con ClusterRole/ClusterRoleBinding configurable
- Deployment 1 replica
- ConfigMap: dashboard URL
- Secret: token de registro
- Values: rbac.rules[] para configurar permisos del ServiceAccount

### Frontend

- "Add Cluster" dialog con dos tabs: "Kubeconfig" (actual) y "Deploy Agent"
- Tab "Deploy Agent": campo nombre, selector de permisos preset (read-only / operator / admin / custom), boton "Generate Command"
- Muestra el comando con boton de copiar al portapapeles
- Lista de clusters: icono diferente para agente vs kubeconfig
- Indicador de estado del agente (connected/reconnecting/offline)

---

## Feature 3: CLI Web + Kubectl Auth Proxy

### Arquitectura

```
BROWSER                          USUARIO LOCAL
   |                                  |
xterm.js (WebSocket)           CLI "k8s-dash" (Go binary)
   |                                  |
Backend: /api/terminal          Backend: /api/proxy/k8s/*
   |                                  |
   +-- Modo Smart:                    +-- k8s-dash login -> JWT
   |   Parsea kubectl                 |   (genera kubeconfig)
   |   -> client-go API call          |
   |                                  +-- kubectl get pods ->
   +-- Modo Raw Shell:                    proxy -> client-go
       exec en pod "tools"
```

### Decisiones

| Aspecto | Decision |
|---|---|
| Terminal web | xterm.js + WebSocket, dos modos (smart + raw shell) |
| Auth proxy | Reverse proxy HTTP en backend, CLI Go para login/config |
| Configuracion cliente | CLI propio `k8s-dash` que genera kubeconfig |

### Componentes Backend

- `internal/terminal/handler.go` - WebSocket handler para terminal web. Autentica JWT, gestiona sesiones
- `internal/terminal/smart.go` - Modo smart: parsea comandos kubectl y los traduce a client-go API calls
  - Soporta: get, describe, logs, apply, delete, scale, rollout, top, exec
  - Output formateado igual que kubectl real
- `internal/terminal/exec.go` - Modo raw shell: usa remotecommand.NewSPDYExecutor para exec en pod del cluster
  - Pod seleccionado por label `app=dashboard-tools` o creado on-demand
  - Imagen configurable (default: bitnami/kubectl con helm, k9s)
- `internal/proxy/k8s_proxy.go` - Reverse proxy HTTP:
  - Recibe requests tipo kubectl (API paths de K8s)
  - Extrae JWT del header Authorization
  - Evalua RBAC del dashboard
  - Reenvía al cluster con client-go
- `internal/proxy/kubeconfig.go` - Genera kubeconfig apuntando al proxy del dashboard

### CLI k8s-dash (binario Go separado, ~10MB)

```
k8s-dash login --server https://dashboard.example.com
    -> Abre browser para login OAuth/JWT
    -> Recibe token, genera kubeconfig en ~/.kube/config (nuevo context)

k8s-dash contexts
    -> Lista clusters disponibles desde el dashboard

k8s-dash use <cluster-name>
    -> Cambia kubectl context al cluster seleccionado

k8s-dash logout
    -> Limpia tokens y contexts generados
```

### Frontend

- `<WebTerminal>` componente usando xterm.js + xterm-addon-fit + xterm-addon-web-links
- Selector de cluster y namespace en barra superior del terminal
- Toggle modo Smart / Raw Shell
- Historial de comandos (localStorage)
- Autocompletado basico (resource types, namespaces)
- Pagina: `/terminal` accesible desde sidebar
- Permiso requerido: `terminal:read` (smart), `terminal:exec` (raw shell)

### Seguridad

- Todo comando pasa por RBAC del dashboard
- Modo raw shell requiere permiso explicito `terminal:exec`
- Rate limiting: max 10 comandos/segundo por usuario
- Timeout configurable por comando (default 30s, max 5min)
- Sanitizacion de input (prevenir inyeccion de comandos en modo raw)
- Logs de comandos ejecutados en audit_log

---

## Feature 4: Chat de IA Integrado

### Arquitectura

```
FRONTEND                              BACKEND
+----------------+              +----------------------------+
| Chat Panel     |  WebSocket   | AI Service                 |
| (drawer)       |<------------>|                            |
|                |              |  +----------------------+  |
| - Messages     |              |  | LLMProvider (interfaz)|  |
| - Code blocks  |              |  |  +- Claude           |  |
| - Confirm      |              |  |  +- OpenAI           |  |
|   dialogs      |              |  |  +- Ollama           |  |
| - Streaming    |              |  +----------------------+  |
+----------------+              |           |                |
                                |  +--------v-------------+  |
                                |  | Context Engine        |  |
                                |  |                       |  |
                                |  | +------+ +----------+ |  |
                                |  | | RAG  | | Tool-use | |  |
                                |  | |(pgvec)| |(k8s api) | |  |
                                |  | +------+ +----------+ |  |
                                |  +-----------------------+  |
                                |           |                |
                                |     K8s clusters           |
                                +----------------------------+
```

### Decisiones

| Aspecto | Decision |
|---|---|
| LLM Provider | Interfaz pluggable: Claude, OpenAI, Ollama |
| Contexto | RAG (pgvector) + Tool-use (function calling) |
| Acciones | Ejecutar con confirmacion del usuario |
| Vector store | pgvector (extension PostgreSQL, sin infra extra) |
| Streaming | Si, token a token via WebSocket |

### LLM Provider Interface

```go
type LLMProvider interface {
    Chat(ctx context.Context, messages []Message, tools []Tool) (*Response, error)
    Embed(ctx context.Context, texts []string) ([][]float64, error)
    Name() string
}
```

Implementaciones:
- `internal/ai/providers/claude.go` - Anthropic API (default: Claude Sonnet)
- `internal/ai/providers/openai.go` - OpenAI API (GPT-4o)
- `internal/ai/providers/ollama.go` - Ollama local (llama3, mistral, etc.)

### RAG Engine

- `internal/ai/rag/indexer.go` - Indexa:
  - Documentacion K8s oficial (embebida o fetcheada)
  - Manifiestos de plugins instalados
  - CRDs del cluster (descripciones, schemas)
  - Historico de eventos relevantes
  - Re-indexa periodicamente o cuando cambian CRDs/plugins
- `internal/ai/rag/store.go` - Vector store con pgvector:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE TABLE ai_embeddings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content TEXT NOT NULL,
      metadata JSONB,          -- source, type, cluster_id, etc.
      embedding vector(1536),  -- dimension segun modelo
      created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX ON ai_embeddings USING ivfflat (embedding vector_cosine_ops);
  ```
- `internal/ai/rag/retriever.go` - Busqueda semantica: query -> embedding -> top-K chunks

### Tool-use (Function Calling)

```go
var K8sTools = []Tool{
    // Read-only tools
    {Name: "get_resources", Desc: "List K8s resources by type", Params: {cluster, namespace, resource_type, label_selector}},
    {Name: "describe_resource", Desc: "Get detailed resource info", Params: {cluster, namespace, type, name}},
    {Name: "get_events", Desc: "Get recent events for a resource", Params: {cluster, namespace, involved_object}},
    {Name: "get_logs", Desc: "Get pod container logs", Params: {cluster, namespace, pod, container, tail_lines}},
    {Name: "get_metrics", Desc: "Get CPU/memory metrics", Params: {cluster, namespace, type, name}},
    {Name: "search_resources", Desc: "Search across resource types", Params: {cluster, namespace, query}},

    // Write tools (RequiresConfirm: true)
    {Name: "apply_yaml", Desc: "Apply a YAML manifest", Params: {cluster, namespace, yaml}, RequiresConfirm: true},
    {Name: "delete_resource", Desc: "Delete a resource", Params: {cluster, namespace, type, name}, RequiresConfirm: true},
    {Name: "scale_resource", Desc: "Scale deployment/statefulset", Params: {cluster, namespace, type, name, replicas}, RequiresConfirm: true},
    {Name: "restart_resource", Desc: "Restart deployment (rollout restart)", Params: {cluster, namespace, type, name}, RequiresConfirm: true},
}
```

Tools con `RequiresConfirm: true`:
1. IA propone la accion con descripcion clara
2. Frontend muestra dialogo de confirmacion inline en el chat
3. Usuario aprueba o rechaza
4. Si aprueba, se ejecuta y se muestra resultado
5. Se registra en audit_log

### Componentes Backend

- `internal/ai/service.go` - Orquestador principal:
  1. Recibe mensaje del usuario
  2. Anade contexto de pagina actual (cluster, namespace, recurso)
  3. Busca contexto RAG relevante
  4. Construye prompt con system message + contexto + historial
  5. Llama a LLMProvider con tools disponibles
  6. Procesa respuesta (texto directo o tool calls)
  7. Si tool call: ejecuta (o pide confirmacion) y re-invoca LLM con resultado
  8. Streaming de respuesta al frontend
- `internal/ai/handlers.go` - WebSocket handler para chat (streaming)
- `internal/ai/history.go` - Almacena conversaciones en PostgreSQL
- `internal/ai/tools/executor.go` - Ejecuta tool calls via ClusterManager respetando RBAC

### Nuevas Tablas

```sql
CREATE TABLE ai_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,       -- 'claude', 'openai', 'ollama'
    api_key_enc BYTEA,                   -- AES-256 cifrado
    model VARCHAR(100) NOT NULL,
    base_url VARCHAR(500),               -- Para Ollama: http://ollama:11434
    temperature FLOAT DEFAULT 0.3,
    max_tokens INT DEFAULT 4096,
    tools_enabled BOOLEAN DEFAULT true,  -- Deshabilitar tools globalmente
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    cluster_id UUID REFERENCES clusters(id),
    title VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,           -- 'user', 'assistant', 'tool'
    content TEXT,
    tool_calls JSONB,                    -- [{name, params, result}]
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Frontend

- `<ChatPanel>` - Drawer lateral derecho, se abre con boton flotante o atajo de teclado
- Streaming de respuestas token a token
- Bloques de codigo con syntax highlight (YAML, JSON) y boton "Apply to cluster"
- Dialogos de confirmacion inline para acciones destructivas
- Contexto automatico: el chat sabe en que cluster/namespace/recurso estas
- Sidebar de conversaciones anteriores
- `/settings/ai` - Configuracion: proveedor, modelo, API key, toggle tools

### Seguridad

- Tools respetan RBAC del dashboard (si no puedes delete pods, la IA tampoco)
- API keys cifradas con AES-256
- Opcion global de deshabilitar tools de escritura (modo read-only para IA)
- Rate limiting por usuario en peticiones al LLM
- No se envian secrets ni kubeconfigs al LLM
- Audit log de todas las acciones ejecutadas por la IA

### Config

```
AI_PROVIDER=claude                     # claude, openai, ollama
AI_API_KEY=sk-ant-...                  # Cifrado en DB, env solo para setup inicial
AI_MODEL=claude-sonnet-4-20250514
AI_BASE_URL=                           # Solo para Ollama
AI_TOOLS_ENABLED=true
```

---

## Dependencias Nuevas

### Backend (Go)

| Dependencia | Feature |
|---|---|
| github.com/segmentio/kafka-go | Notificaciones (Kafka broker) |
| google.golang.org/grpc + protobuf | Agente de clusters |
| github.com/pgvector/pgvector-go | Chat IA (RAG embeddings) |
| github.com/anthropics/anthropic-sdk-go | Chat IA (Claude provider) |
| github.com/sashabaranov/go-openai | Chat IA (OpenAI provider) |

### Frontend

| Dependencia | Feature |
|---|---|
| xterm + xterm-addon-fit + xterm-addon-web-links | CLI Web (terminal) |

### Infra

| Componente | Feature |
|---|---|
| Apache Kafka | Notificaciones (opcional, fallback in-memory) |
| PostgreSQL + pgvector extension | Chat IA (RAG) |

---

## Orden de Implementacion Sugerido

1. **Notificaciones** - Impacto inmediato, infraestructura reutilizable (broker pattern)
2. **Agente de clusters** - Simplifica onboarding de clusters
3. **CLI Web + Auth Proxy** - Power users
4. **Chat IA** - Mas complejo, depende de que el resto este estable
