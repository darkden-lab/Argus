# Argus — Continuous Improvement Design
**Date:** 2026-03-05
**Status:** Approved

## Overview

Six-phase continuous improvement plan covering: global namespace selector, project-based resource grouping, plugin completeness, UX polish, real-time enhancements, and ongoing quality loop.

---

## Phase 1 — Global Namespace Selector

### Problem
All plugin views and resource tables ignore the selected namespace or hardcode `default`. There is no global UI element to switch namespaces.

### Design

**Zustand store (`stores/cluster.ts`):**
- Add `selectedNamespace: string | null` (null = all namespaces)
- Add `setSelectedNamespace(ns: string | null): void`
- Persist per cluster: key `argus_ns_{clusterID}` in localStorage

**New component: `NamespaceSelector`**
- Located in `components/layout/namespace-selector.tsx`
- Rendered in sidebar below ClusterSelector
- Fetches `GET /api/clusters/{id}/namespaces` on cluster change
- Combobox with search, "All Namespaces" option first
- Shows namespace status (Active/Terminating) with colored dots

**Plugin integration:**
- Each plugin's list components read `useClusterStore(s => s.selectedNamespace)`
- Pass as `?namespace={ns}` query param (omit if null → all namespaces)
- Affects: all 8 plugins (27 .tsx files), core resource tables

---

## Phase 2 — Projects Feature

### Concept
Projects group namespaces and workloads via Kubernetes label:
```
argus.darkden.net/projects: "frontend,backend,monitoring"
```
Multiple project values per resource (comma-separated). A resource belongs to all listed projects.

### Backend

**New endpoint: `GET /api/clusters/{id}/projects`**
- Lists all namespaces, reads `argus.darkden.net/projects` label
- Also scans Deployments, StatefulSets, DaemonSets for the label
- Returns aggregated project map:
```json
{
  "projects": [
    {
      "name": "frontend",
      "namespaces": ["web", "cdn"],
      "workloads": 12,
      "podsRunning": 8,
      "podsTotal": 10,
      "health": "degraded"
    }
  ]
}
```

**New endpoint: `GET /api/clusters/{id}/projects/{name}`**
- Returns all resources (namespaces, deployments, statefulsets, services, pods) for a project
- Resources matched if their namespace OR the resource itself has the label

**New handler: `backend/internal/core/project_handlers.go`**

### Frontend — `/projects` page

- Grid of project cards: name, health badge, namespace count, pod ratio, quick-access buttons
- Click → `/projects/{name}` detail: resource tree grouped by type, filtered by project
- Empty state: guide to add `argus.darkden.net/projects` label

### Frontend — Sidebar

- New section "Projects" in sidebar navigation
- Dynamically populated from projects endpoint
- Click project → sets global project filter (new store field)
- Project filter coexists with namespace filter (project expands to N namespaces)

---

## Phase 3 — Plugin Completeness Audit

### Per-plugin gaps and fixes

| Plugin | Backend gaps | Frontend gaps |
|--------|-------------|---------------|
| **Istio** | Update endpoints for VirtualServices/Gateways | Add DestinationRules, ServiceEntries, PeerAuthentications tabs |
| **Prometheus** | — | Add AlertManager instances UI, improve rules detail |
| **Calico** | — | Add GlobalNetworkPolicies tab, HostEndpoints tab |
| **CNPG** | — | Add ScheduledBackups UI, cluster detail with metrics |
| **MariaDB** | — | Add Users, Grants, Connections tabs |
| **Ceph** | — | Add ObjectStores UI, better health visualization |
| **KEDA** | — | Add TriggerAuthentications (namespaced + cluster-scoped) tabs |
| **Helm** | — | Add values YAML editor in upgrade dialog, full history with diff |

All plugins will also: respect the global namespace selector, show proper empty states, handle errors gracefully with retry.

---

## Phase 4 — Resource Views & UX Polish

### Resource Detail (`resource-detail.tsx`)
- Collapsible sections: Overview, Spec, Status, Labels/Annotations, Events
- Related Events section fetching `GET /api/clusters/{id}/events?namespace=&involvedObject=`
- Age display with relative time (e.g., "3h ago")
- Copy-to-clipboard for resource name/namespace

### Log Viewer (`log-viewer.tsx`)
- Multi-container selector (tabs per container)
- Follow mode toggle (auto-scroll)
- Search/filter with highlight
- Download logs button
- Line count badge

### Dashboard
- Project health widget (if projects are configured)
- Better cluster health cards with trend indicators
- Real workload counts from cluster store

### Global UX
- Consistent loading skeletons across all plugins (replace ad-hoc spinners)
- Better error banners with retry buttons
- Command palette: add "New Namespace", "Label Resource", "Open Project" commands
- Keyboard shortcut `N` to open namespace selector

---

## Phase 5 — Real-time & Performance

### Socket.IO Watchers for Projects
- When namespace labels change → emit `project:updated` on `/k8s` namespace
- Frontend subscribes and refreshes project list/sidebar

### API Query Improvements (`use-api-query.ts`)
- Add `staleTime` per query type (namespaces: 30s, pods: 5s)
- Request deduplication for concurrent identical requests
- Optimistic updates for delete operations (remove from list immediately)

### Code Splitting
- Dynamic imports for each plugin's components
- Reduces initial bundle size

### Socket.IO Reconnection
- Exponential backoff: 1s → 2s → 4s → 8s → 30s max
- Reconnect indicator in UI

---

## Phase 6 — Continuous Loop

Each iteration:
1. Grep for TODO/FIXME → address them
2. Run linter, fix warnings
3. Review openapi.yaml for missing/stale endpoints
4. Add/improve tests for untested paths
5. Visual consistency audit
6. Performance profiling of slow queries

---

## Data Flow Diagram

```
User selects namespace ──► NamespaceSelector ──► clusterStore.selectedNamespace
                                                        │
                              ┌─────────────────────────┘
                              ▼
                     All plugin components
                     append ?namespace={ns}
                              │
                              ▼
                     Backend endpoints
                     filter K8s resources

User selects project ──► Sidebar projects ──► clusterStore.selectedProject
                                                        │
                              ┌─────────────────────────┘
                              ▼
                     /projects/{name} page
                     + all views filter by project's namespaces
```

---

## File Impact Summary

**New files:**
- `frontend/src/components/layout/namespace-selector.tsx`
- `frontend/src/app/(dashboard)/projects/page.tsx`
- `frontend/src/app/(dashboard)/projects/[name]/page.tsx`
- `backend/internal/core/project_handlers.go`

**Modified files (major):**
- `frontend/src/stores/cluster.ts` (add namespace + project state)
- `frontend/src/components/layout/sidebar.tsx` (namespace selector + projects section)
- All 27 plugin `.tsx` files (namespace awareness)
- `frontend/src/components/resources/log-viewer.tsx` (improvements)
- `frontend/src/components/resources/resource-detail.tsx` (improvements)
- `backend/internal/core/handlers.go` (register project routes)

**New backend files:**
- `backend/internal/core/project_handlers.go`
