# Plugin Development Guide

Argus uses a plugin-based architecture that allows extending the dashboard with support for new Kubernetes operators and tools. This guide explains how to create a new plugin.

## Plugin Interface

Every plugin must implement the `Plugin` interface defined in `backend/internal/plugin/plugin.go`:

```go
type Plugin interface {
    ID() string
    Manifest() Manifest
    RegisterRoutes(router *mux.Router, cm *cluster.Manager)
    RegisterWatchers(hub *ws.Hub, cm *cluster.Manager)
    OnEnable(ctx context.Context, pool *pgxpool.Pool) error
    OnDisable(ctx context.Context, pool *pgxpool.Pool) error
}
```

| Method | Purpose |
|--------|---------|
| `ID()` | Unique plugin identifier (e.g., `"istio"`) |
| `Manifest()` | Returns the plugin manifest with metadata, routes, and frontend config |
| `RegisterRoutes()` | Registers HTTP handler routes on the mux router |
| `RegisterWatchers()` | Registers K8s watch event subscriptions on the WebSocket hub |
| `OnEnable()` | Called when the plugin is enabled (run migrations, etc.) |
| `OnDisable()` | Called when the plugin is disabled (cleanup) |

## Manifest Structure

Each plugin includes a `manifest.json` embedded via `//go:embed`. The manifest describes the plugin's metadata, API routes, K8s watchers, and frontend integration.

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Short description of what this plugin does",
  "permissions": ["myplugin:*"],
  "backend": {
    "routes": [
      {
        "method": "GET",
        "path": "/api/plugins/my-plugin/resources",
        "handler": "ListResources"
      },
      {
        "method": "GET",
        "path": "/api/plugins/my-plugin/resources/{name}",
        "handler": "GetResource"
      }
    ],
    "watchers": [
      {
        "group": "myoperator.io",
        "version": "v1",
        "resource": "myresources"
      }
    ]
  },
  "frontend": {
    "navigation": [
      {
        "label": "My Plugin",
        "icon": "puzzle",
        "path": "/plugins/my-plugin"
      }
    ],
    "routes": [
      {
        "path": "/plugins/my-plugin",
        "component": "MyPluginOverview"
      }
    ],
    "widgets": [
      {
        "id": "my-plugin-status",
        "type": "dashboard-card",
        "component": "MyPluginStatus"
      }
    ]
  }
}
```

### Manifest Fields

**Top-level:**
- `id` -- Unique identifier (lowercase, hyphenated)
- `name` -- Human-readable name
- `version` -- Semantic version
- `description` -- Brief description
- `permissions` -- Required RBAC permissions

**Backend:**
- `routes` -- API endpoint definitions (method, path, handler name)
- `watchers` -- K8s resources to watch (group, version, resource)

**Frontend:**
- `navigation` -- Sidebar menu items (label, icon, path)
- `routes` -- Frontend page routes (path, component name)
- `widgets` -- Dashboard widgets (id, type, component name)

## Step-by-Step: Creating a Plugin

### 1. Create the plugin directory

```
backend/plugins/my-plugin/
  manifest.json
  plugin.go
```

### 2. Write the manifest

Create `manifest.json` as shown above.

### 3. Implement the plugin

```go
package myplugin

import (
    "context"
    _ "embed"
    "encoding/json"
    "net/http"

    "github.com/gorilla/mux"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/darkden-lab/argus/backend/internal/cluster"
    "github.com/darkden-lab/argus/backend/internal/plugin"
    "github.com/darkden-lab/argus/backend/internal/ws"
)

//go:embed manifest.json
var manifestJSON []byte

type MyPlugin struct {
    manifest plugin.Manifest
}

func New() (*MyPlugin, error) {
    var m plugin.Manifest
    if err := json.Unmarshal(manifestJSON, &m); err != nil {
        return nil, err
    }
    return &MyPlugin{manifest: m}, nil
}

func (p *MyPlugin) ID() string              { return p.manifest.ID }
func (p *MyPlugin) Manifest() plugin.Manifest { return p.manifest }

func (p *MyPlugin) RegisterRoutes(router *mux.Router, cm *cluster.Manager) {
    router.HandleFunc("/api/plugins/my-plugin/resources", func(w http.ResponseWriter, r *http.Request) {
        clusterID := r.URL.Query().Get("cluster")
        client, err := cm.GetClient(clusterID)
        if err != nil {
            http.Error(w, "cluster not found", http.StatusNotFound)
            return
        }

        // Use client.DynClient to query CRDs
        _ = client
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode([]string{})
    }).Methods("GET")
}

func (p *MyPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
    // Register watch subscriptions for real-time updates
    // hub.Subscribe() for each watcher in the manifest
}

func (p *MyPlugin) OnEnable(ctx context.Context, pool *pgxpool.Pool) error {
    // Run any setup needed when the plugin is enabled
    // e.g., create plugin-specific database tables
    return nil
}

func (p *MyPlugin) OnDisable(ctx context.Context, pool *pgxpool.Pool) error {
    // Cleanup when the plugin is disabled
    return nil
}
```

### 4. Register the plugin

In `backend/cmd/server/main.go`, add the plugin to the `registerPlugins` function:

```go
import pluginMyPlugin "github.com/darkden-lab/argus/backend/plugins/my-plugin"

func registerPlugins(engine *plugin.Engine) {
    // ... existing plugins ...

    // For constructors that return (plugin, error):
    registerPluginWithError(engine, "my-plugin", pluginMyPlugin.New)

    // For simple constructors (no error):
    // if err := engine.Register(pluginMyPlugin.New()); err != nil {
    //     log.Printf("WARNING: failed to register my-plugin: %v", err)
    // }
}
```

### 5. Add frontend components

Create frontend components in `frontend/src/components/plugins/my-plugin/`:

```
frontend/src/components/plugins/my-plugin/
  MyPluginOverview.tsx
  MyPluginStatus.tsx
```

The plugin's frontend navigation and routes are declared in the manifest and rendered by the dashboard's plugin system.

## Built-in Plugins Reference

| Plugin | ID | Description | CRD Group |
|--------|----|-------------|-----------|
| Istio | `istio` | Service mesh management | `networking.istio.io` |
| Prometheus | `prometheus` | Metrics and alerting | `monitoring.coreos.com` |
| Calico | `calico` | Network policy | `projectcalico.org` |
| CNPG | `cnpg` | PostgreSQL operator | `postgresql.cnpg.io` |
| MariaDB | `mariadb` | MariaDB operator | `k8s.mariadb.com` |
| KEDA | `keda` | Event-driven autoscaling | `keda.sh` |
| Ceph | `ceph` | Rook-Ceph storage | `ceph.rook.io` |
| Helm | `helm` | Helm release management | `helm.toolkit.fluxcd.io` |

## Tips

- Use `//go:embed` for the manifest file (not `runtime.Caller` or `os.ReadFile`)
- Plugin routes are mounted on the protected router, so JWT auth is automatically enforced
- Use the `cluster.Manager` to get K8s clients for any cluster
- Use the dynamic client (`client.DynClient`) to work with CRDs
- Watchers registered via `RegisterWatchers` will broadcast events to all connected WebSocket clients
- Plugins can be enabled/disabled per cluster at runtime via `POST /api/plugins/{id}/enable`
