# Argus Continuous Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement global namespace selector, projects feature, complete all plugins, polish UX, improve real-time performance, and enter a continuous quality loop.

**Architecture:** Extend the Zustand cluster store with namespace/project state; add a backend project aggregation endpoint; wire all 27 plugin components to respect the selected namespace; add a new Projects page and sidebar section.

**Tech Stack:** Go 1.25 (backend), Next.js 16 / React 19 / TypeScript (frontend), Zustand (state), Tailwind CSS 4 + shadcn/ui, gorilla/mux, pgx/v5, Socket.IO

---

## PHASE 1 — Global Namespace Selector

### Task 1: Extend cluster store with namespace state

**Files:**
- Modify: `frontend/src/stores/cluster.ts`

**Step 1: Read the current store**

Read `frontend/src/stores/cluster.ts` to understand existing state shape.

**Step 2: Add namespace fields**

Add to the store interface and implementation:
```typescript
// Interface additions:
selectedNamespace: string | null   // null = "all namespaces"
namespaces: string[]               // cached list for current cluster
setSelectedNamespace: (ns: string | null) => void
setNamespaces: (nsList: string[]) => void
```

Persist `selectedNamespace` per cluster using key `argus_ns_${clusterID}` in localStorage. When `setSelectedClusterId` is called, restore the saved namespace for that cluster (or null if none saved).

**Step 3: Update the store implementation**

In `create<ClusterStore>`, initialize `selectedNamespace: null, namespaces: []`.

In `setSelectedClusterId`: after updating `selectedClusterId`, also load the saved namespace:
```typescript
setSelectedClusterId: (id) => {
  const saved = typeof window !== 'undefined'
    ? localStorage.getItem(`argus_ns_${id}`) ?? null
    : null
  set({ selectedClusterId: id, selectedNamespace: saved, namespaces: [] })
  if (typeof window !== 'undefined') {
    localStorage.setItem('argus_selected_cluster_id', id)
  }
}
```

In `setSelectedNamespace`:
```typescript
setSelectedNamespace: (ns) => {
  const { selectedClusterId } = get()
  set({ selectedNamespace: ns })
  if (typeof window !== 'undefined' && selectedClusterId) {
    if (ns) {
      localStorage.setItem(`argus_ns_${selectedClusterId}`, ns)
    } else {
      localStorage.removeItem(`argus_ns_${selectedClusterId}`)
    }
  }
}
```

**Step 4: Run existing store tests**
```bash
cd frontend && npm test -- --testPathPattern="stores/cluster" --no-coverage
```
Expected: All pass (no behavior changed for existing functionality).

**Step 5: Commit**
```bash
git add frontend/src/stores/cluster.ts
git commit -m "task(store): add namespace selector state to cluster store"
```

---

### Task 2: Create NamespaceSelector component

**Files:**
- Create: `frontend/src/components/layout/namespace-selector.tsx`

**Step 1: Create the component**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from 'cmdk'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useClusterStore } from '@/stores/cluster'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Namespace {
  name: string
  status: string
}

export function NamespaceSelector() {
  const { selectedClusterId, selectedNamespace, setSelectedNamespace, setNamespaces } =
    useClusterStore()
  const [open, setOpen] = useState(false)
  const [nsList, setNsList] = useState<Namespace[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedClusterId) return
    setLoading(true)
    api
      .get<{ items: Array<{ metadata: { name: string }; status: { phase: string } }> }>(
        `/api/clusters/${selectedClusterId}/namespaces`
      )
      .then((data) => {
        const items = (data.items ?? []).map((ns) => ({
          name: ns.metadata.name,
          status: ns.status?.phase ?? 'Active',
        }))
        setNsList(items)
        setNamespaces(items.map((n) => n.name))
      })
      .catch(() => setNsList([]))
      .finally(() => setLoading(false))
  }, [selectedClusterId, setNamespaces])

  if (!selectedClusterId) return null

  const label = selectedNamespace ?? 'All Namespaces'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-sm h-8 px-2 bg-background/50"
          disabled={loading}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search namespace..." className="h-8" />
          <CommandList>
            <CommandEmpty>No namespaces found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => {
                  setSelectedNamespace(null)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn('mr-2 h-4 w-4', selectedNamespace === null ? 'opacity-100' : 'opacity-0')}
                />
                <Globe className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                All Namespaces
              </CommandItem>
              {nsList.map((ns) => (
                <CommandItem
                  key={ns.name}
                  value={ns.name}
                  onSelect={() => {
                    setSelectedNamespace(ns.name)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', selectedNamespace === ns.name ? 'opacity-100' : 'opacity-0')}
                  />
                  <span
                    className={cn(
                      'mr-2 h-2 w-2 rounded-full shrink-0',
                      ns.status === 'Active' ? 'bg-green-500' : 'bg-yellow-500'
                    )}
                  />
                  <span className="truncate">{ns.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

**Step 2: Check that cmdk is available**
```bash
cd frontend && grep -r '"cmdk"' package.json
```
If missing: `npm install cmdk`

**Step 3: Commit**
```bash
git add frontend/src/components/layout/namespace-selector.tsx
git commit -m "task(ui): create NamespaceSelector component"
```

---

### Task 3: Integrate NamespaceSelector into sidebar

**Files:**
- Modify: `frontend/src/components/layout/sidebar.tsx`

**Step 1: Read current sidebar**

Read `frontend/src/components/layout/sidebar.tsx` to understand structure.

**Step 2: Add NamespaceSelector below ClusterSelector**

Import `NamespaceSelector` and render it below `<ClusterSelector />` in the sidebar, with a small label:
```tsx
import { NamespaceSelector } from './namespace-selector'

// After <ClusterSelector ... />:
<div className="px-3 pt-1 pb-2">
  <p className="text-xs text-muted-foreground mb-1 px-1">Namespace</p>
  <NamespaceSelector />
</div>
```

**Step 3: Run lint**
```bash
cd frontend && npm run lint 2>&1 | head -40
```
Fix any lint errors.

**Step 4: Commit**
```bash
git add frontend/src/components/layout/sidebar.tsx
git commit -m "task(sidebar): integrate NamespaceSelector below cluster selector"
```

---

### Task 4: Connect all plugin components to use selectedNamespace

**Files:**
- Modify: All 27 files in `frontend/src/plugins/`

**Step 1: Create a helper hook**

Add to `frontend/src/hooks/use-cluster-selection.ts` (file already exists — read it first):

```typescript
// Add/export this convenience selector:
export function useNamespace() {
  return useClusterStore((s) => s.selectedNamespace)
}
```

**Step 2: Update each plugin component**

For every `.tsx` file in `frontend/src/plugins/`, do the following pattern:

Find where `namespace` is currently set (e.g., `const namespace = 'default'` or `const namespace = undefined`), replace with:
```typescript
import { useClusterStore } from '@/stores/cluster'

// Inside component:
const namespace = useClusterStore((s) => s.selectedNamespace)

// In API call URL:
const url = namespace
  ? `/api/plugins/${PLUGIN}/${clusterID}/RESOURCE?namespace=${namespace}`
  : `/api/plugins/${PLUGIN}/${clusterID}/RESOURCE`
```

Do this for each of the 8 plugins × their list components. Overview components should show counts per-namespace when a namespace is selected.

**Step 3: Verify no hardcoded "default" namespace remains**
```bash
cd frontend && grep -r "namespace.*default" src/plugins/ --include="*.tsx"
```
Fix any remaining hardcodes.

**Step 4: Commit**
```bash
git add frontend/src/plugins/
git commit -m "task(plugins): connect all plugin views to global namespace selector"
```

---

## PHASE 2 — Projects Feature

### Task 5: Backend — project_handlers.go

**Files:**
- Create: `backend/internal/core/project_handlers.go`

**Step 1: Write the handler file**

```go
package core

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const projectLabel = "argus.darkden.net/projects"

type ProjectSummary struct {
	Name        string   `json:"name"`
	Namespaces  []string `json:"namespaces"`
	WorkloadCount int    `json:"workloadCount"`
	PodsRunning int      `json:"podsRunning"`
	PodsTotal   int      `json:"podsTotal"`
	Health      string   `json:"health"` // "healthy", "degraded", "unknown"
}

type ProjectDetail struct {
	ProjectSummary
	Deployments  []map[string]interface{} `json:"deployments"`
	StatefulSets []map[string]interface{} `json:"statefulSets"`
	Services     []map[string]interface{} `json:"services"`
}

// ListProjects aggregates namespaces and workloads by argus.darkden.net/projects label
func (h *ConvenienceHandlers) ListProjects(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["clusterID"]

	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		http.Error(w, "cluster not found", http.StatusNotFound)
		return
	}

	ctx := r.Context()
	projectMap := map[string]*ProjectSummary{}

	// 1. Scan namespaces
	nsList, err := client.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil && !errors.IsNotFound(err) {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if nsList != nil {
		for _, ns := range nsList.Items {
			projectsLabel := ns.Labels[projectLabel]
			if projectsLabel == "" {
				continue
			}
			for _, proj := range splitProjects(projectsLabel) {
				if _, ok := projectMap[proj]; !ok {
					projectMap[proj] = &ProjectSummary{Name: proj}
				}
				projectMap[proj].Namespaces = appendUnique(projectMap[proj].Namespaces, ns.Name)
			}
		}
	}

	// 2. Scan workloads for the label (deployments across all namespaces)
	deployGVR := schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	dynClient, err := h.cm.GetDynamicClient(clusterID)
	if err == nil {
		deploys, err2 := dynClient.Resource(deployGVR).Namespace("").List(ctx, metav1.ListOptions{})
		if err2 == nil {
			for _, d := range deploys.Items {
				labels := d.GetLabels()
				projectsLabel := labels[projectLabel]
				if projectsLabel == "" {
					continue
				}
				for _, proj := range splitProjects(projectsLabel) {
					if _, ok := projectMap[proj]; !ok {
						projectMap[proj] = &ProjectSummary{Name: proj}
					}
					projectMap[proj].WorkloadCount++
				}
			}
		}
	}

	// 3. Count pods per project namespace
	for _, ps := range projectMap {
		for _, ns := range ps.Namespaces {
			pods, err2 := client.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
			if err2 != nil {
				continue
			}
			for _, pod := range pods.Items {
				ps.PodsTotal++
				if pod.Status.Phase == "Running" {
					ps.PodsRunning++
				}
			}
		}
		// Health score
		if ps.PodsTotal == 0 {
			ps.Health = "unknown"
		} else if ps.PodsRunning == ps.PodsTotal {
			ps.Health = "healthy"
		} else {
			ps.Health = "degraded"
		}
	}

	// Convert map to slice
	projects := make([]*ProjectSummary, 0, len(projectMap))
	for _, ps := range projectMap {
		projects = append(projects, ps)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"projects": projects})
}

// GetProject returns all resources for a specific project
func (h *ConvenienceHandlers) GetProject(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["clusterID"]
	projectName := vars["project"]

	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		http.Error(w, "cluster not found", http.StatusNotFound)
		return
	}
	ctx := r.Context()

	// Find namespaces for this project
	nsList, _ := client.CoreV1().Namespaces().List(ctx, metav1.ListOptions{
		LabelSelector: projectLabel + "=" + projectName,
	})

	// Also find namespaces that contain the project in a multi-value label
	allNsList, _ := client.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	var projectNamespaces []string
	if nsList != nil {
		for _, ns := range nsList.Items {
			projectNamespaces = appendUnique(projectNamespaces, ns.Name)
		}
	}
	if allNsList != nil {
		for _, ns := range allNsList.Items {
			pLabel := ns.Labels[projectLabel]
			if containsProject(pLabel, projectName) {
				projectNamespaces = appendUnique(projectNamespaces, ns.Name)
			}
		}
	}

	detail := &ProjectDetail{
		ProjectSummary: ProjectSummary{Name: projectName, Namespaces: projectNamespaces},
	}

	// Collect deployments
	dynClient, err := h.cm.GetDynamicClient(clusterID)
	if err == nil {
		deployGVR := schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
		for _, ns := range projectNamespaces {
			deploys, err2 := dynClient.Resource(deployGVR).Namespace(ns).List(ctx, metav1.ListOptions{})
			if err2 == nil {
				for _, d := range deploys.Items {
					detail.Deployments = append(detail.Deployments, d.Object)
				}
			}
		}
		ssGVR := schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}
		for _, ns := range projectNamespaces {
			ss, err2 := dynClient.Resource(ssGVR).Namespace(ns).List(ctx, metav1.ListOptions{})
			if err2 == nil {
				for _, s := range ss.Items {
					detail.StatefulSets = append(detail.StatefulSets, s.Object)
				}
			}
		}
	}

	// Services
	for _, ns := range projectNamespaces {
		svcs, err2 := client.CoreV1().Services(ns).List(ctx, metav1.ListOptions{})
		if err2 == nil {
			for _, svc := range svcs.Items {
				svcMap := map[string]interface{}{
					"name":      svc.Name,
					"namespace": svc.Namespace,
					"type":      string(svc.Spec.Type),
					"clusterIP": svc.Spec.ClusterIP,
				}
				detail.Services = append(detail.Services, svcMap)
			}
		}
		pods, _ := client.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
		if pods != nil {
			for _, pod := range pods.Items {
				detail.PodsTotal++
				if pod.Status.Phase == "Running" {
					detail.PodsRunning++
				}
			}
		}
	}

	detail.WorkloadCount = len(detail.Deployments) + len(detail.StatefulSets)
	if detail.PodsTotal == 0 {
		detail.Health = "unknown"
	} else if detail.PodsRunning == detail.PodsTotal {
		detail.Health = "healthy"
	} else {
		detail.Health = "degraded"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

func splitProjects(label string) []string {
	parts := strings.Split(label, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

func containsProject(label, project string) bool {
	for _, p := range splitProjects(label) {
		if p == project {
			return true
		}
	}
	return false
}

func appendUnique(slice []string, s string) []string {
	for _, v := range slice {
		if v == s {
			return slice
		}
	}
	return append(slice, s)
}
```

**Step 2: Register routes in core.go or handlers.go**

Read `backend/internal/core/handlers.go` to find `RegisterRoutes` or equivalent. Add:
```go
// In RegisterRoutes for ConvenienceHandlers:
router.HandleFunc("/api/clusters/{clusterID}/projects", h.ListProjects).Methods("GET")
router.HandleFunc("/api/clusters/{clusterID}/projects/{project}", h.GetProject).Methods("GET")
```

**Step 3: Check that GetDynamicClient exists on ClusterManager**

Read `backend/internal/cluster/manager.go`. If `GetDynamicClient` doesn't exist, check what method is used to get a dynamic client for a cluster (may be `GetClient` returning a typed client or a different method). Adapt accordingly.

**Step 4: Build to catch compile errors**
```bash
cd backend && go build ./internal/core/... 2>&1
```
Fix any compile errors.

**Step 5: Run backend tests**
```bash
cd backend && go test ./internal/core/... -v 2>&1 | tail -20
```

**Step 6: Commit**
```bash
git add backend/internal/core/project_handlers.go backend/internal/core/handlers.go
git commit -m "task(backend): add projects endpoint aggregating by argus.darkden.net/projects label"
```

---

### Task 6: Frontend — Projects store state

**Files:**
- Modify: `frontend/src/stores/cluster.ts`

**Step 1: Add project state**

Add to the cluster store:
```typescript
selectedProject: string | null
setSelectedProject: (project: string | null) => void
```

When `setSelectedProject` is called, also set `selectedNamespace: null` (a project encompasses multiple namespaces, so namespace filter is cleared).

**Step 2: Commit**
```bash
git add frontend/src/stores/cluster.ts
git commit -m "task(store): add selectedProject state to cluster store"
```

---

### Task 7: Frontend — Projects page

**Files:**
- Create: `frontend/src/app/(dashboard)/projects/page.tsx`

**Step 1: Create the page**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useClusterStore } from '@/stores/cluster'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FolderOpen, Layers, Activity, AlertCircle, HelpCircle } from 'lucide-react'
import Link from 'next/link'

interface ProjectSummary {
  name: string
  namespaces: string[]
  workloadCount: number
  podsRunning: number
  podsTotal: number
  health: 'healthy' | 'degraded' | 'unknown'
}

const healthConfig = {
  healthy:  { label: 'Healthy',  variant: 'default'      as const, icon: Activity,     className: 'text-green-500' },
  degraded: { label: 'Degraded', variant: 'destructive'  as const, icon: AlertCircle,  className: 'text-red-500'   },
  unknown:  { label: 'Unknown',  variant: 'secondary'    as const, icon: HelpCircle,   className: 'text-gray-400'  },
}

export default function ProjectsPage() {
  const { selectedClusterId, setSelectedProject } = useClusterStore()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedClusterId) return
    setLoading(true)
    setError(null)
    api
      .get<{ projects: ProjectSummary[] }>(`/api/clusters/${selectedClusterId}/projects`)
      .then((d) => setProjects(d.projects ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedClusterId])

  if (!selectedClusterId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <FolderOpen className="h-12 w-12 opacity-30" />
        <p>Select a cluster to view projects</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-40 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p>Failed to load projects: {error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-8">
        <FolderOpen className="h-16 w-16 opacity-20" />
        <div>
          <p className="text-lg font-medium">No projects found</p>
          <p className="text-sm text-muted-foreground mt-1">
            Label namespaces or workloads with{' '}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">argus.darkden.net/projects: &lt;name&gt;</code>{' '}
            to create projects.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Badge variant="outline">{projects.length} projects</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => {
          const hc = healthConfig[project.health]
          const HealthIcon = hc.icon
          return (
            <Link
              key={project.name}
              href={`/projects/${project.name}`}
              onClick={() => setSelectedProject(project.name)}
            >
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-primary" />
                      {project.name}
                    </span>
                    <Badge variant={hc.variant} className="text-xs">
                      <HealthIcon className={`h-3 w-3 mr-1 ${hc.className}`} />
                      {hc.label}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" />
                    <span>{project.namespaces.length} namespace{project.namespaces.length !== 1 ? 's' : ''}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{project.workloadCount} workloads</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Pods</span>
                      <span>{project.podsRunning}/{project.podsTotal}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${project.health === 'healthy' ? 'bg-green-500' : project.health === 'degraded' ? 'bg-red-500' : 'bg-gray-400'}`}
                        style={{ width: project.podsTotal ? `${(project.podsRunning / project.podsTotal) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {project.namespaces.slice(0, 3).map((ns) => (
                      <Badge key={ns} variant="outline" className="text-xs py-0">{ns}</Badge>
                    ))}
                    {project.namespaces.length > 3 && (
                      <Badge variant="outline" className="text-xs py-0">+{project.namespaces.length - 3}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 2: Commit**
```bash
git add frontend/src/app/(dashboard)/projects/
git commit -m "task(projects): add projects list page"
```

---

### Task 8: Frontend — Project detail page

**Files:**
- Create: `frontend/src/app/(dashboard)/projects/[name]/page.tsx`

**Step 1: Create the detail page**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useClusterStore } from '@/stores/cluster'
import { api } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Layers, Server, Network } from 'lucide-react'
import Link from 'next/link'

interface ProjectDetail {
  name: string
  namespaces: string[]
  workloadCount: number
  podsRunning: number
  podsTotal: number
  health: string
  deployments: Record<string, unknown>[]
  statefulSets: Record<string, unknown>[]
  services: { name: string; namespace: string; type: string; clusterIP: string }[]
}

export default function ProjectDetailPage() {
  const { name } = useParams<{ name: string }>()
  const { selectedClusterId } = useClusterStore()
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedClusterId || !name) return
    setLoading(true)
    api
      .get<ProjectDetail>(`/api/clusters/${selectedClusterId}/projects/${name}`)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedClusterId, name])

  if (loading || !detail) {
    return <div className="p-6 space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}</div>
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-2xl font-semibold">{detail.name}</h1>
        <Badge variant={detail.health === 'healthy' ? 'default' : 'destructive'}>{detail.health}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{detail.namespaces.length}</div><div className="text-xs text-muted-foreground">Namespaces</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{detail.workloadCount}</div><div className="text-xs text-muted-foreground">Workloads</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{detail.podsRunning}</div><div className="text-xs text-muted-foreground">Pods Running</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{detail.services.length}</div><div className="text-xs text-muted-foreground">Services</div></CardContent></Card>
      </div>

      <Tabs defaultValue="deployments">
        <TabsList>
          <TabsTrigger value="deployments"><Server className="h-3.5 w-3.5 mr-1.5" />Deployments ({detail.deployments.length})</TabsTrigger>
          <TabsTrigger value="statefulsets"><Layers className="h-3.5 w-3.5 mr-1.5" />StatefulSets ({detail.statefulSets.length})</TabsTrigger>
          <TabsTrigger value="services"><Network className="h-3.5 w-3.5 mr-1.5" />Services ({detail.services.length})</TabsTrigger>
          <TabsTrigger value="namespaces"><Layers className="h-3.5 w-3.5 mr-1.5" />Namespaces</TabsTrigger>
        </TabsList>
        <TabsContent value="deployments">
          <ResourceList items={detail.deployments} />
        </TabsContent>
        <TabsContent value="statefulsets">
          <ResourceList items={detail.statefulSets} />
        </TabsContent>
        <TabsContent value="services">
          <div className="space-y-2 mt-2">
            {detail.services.map((svc) => (
              <Card key={`${svc.namespace}/${svc.name}`}>
                <CardContent className="py-3 px-4 flex items-center justify-between">
                  <div>
                    <span className="font-medium">{svc.name}</span>
                    <Badge variant="outline" className="ml-2 text-xs">{svc.namespace}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">{svc.type} · {svc.clusterIP}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="namespaces">
          <div className="flex flex-wrap gap-2 mt-2">
            {detail.namespaces.map((ns) => (
              <Badge key={ns} variant="outline" className="text-sm py-1 px-3">{ns}</Badge>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ResourceList({ items }: { items: Record<string, unknown>[] }) {
  if (items.length === 0) return <p className="text-muted-foreground text-sm mt-4 text-center">No resources found</p>
  return (
    <div className="space-y-2 mt-2">
      {items.map((item, i) => {
        const meta = item.metadata as Record<string, string> | undefined
        const name = meta?.name ?? `item-${i}`
        const namespace = meta?.namespace ?? ''
        return (
          <Card key={`${namespace}/${name}`}>
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <span className="font-medium">{name}</span>
              {namespace && <Badge variant="outline" className="text-xs">{namespace}</Badge>}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
```

**Step 2: Commit**
```bash
git add frontend/src/app/(dashboard)/projects/[name]/
git commit -m "task(projects): add project detail page"
```

---

### Task 9: Sidebar — Projects section

**Files:**
- Modify: `frontend/src/components/layout/sidebar.tsx`

**Step 1: Read sidebar again after namespace changes**

**Step 2: Add Projects link to navigation items**

In the nav items array, add:
```typescript
{ href: '/projects', label: 'Projects', icon: FolderOpen }
```

**Step 3: Add dynamic projects sub-section**

Below the nav items, add a "Projects" section that:
- Fetches `/api/clusters/{id}/projects` on cluster change
- Shows up to 8 projects as clickable items in a collapsible section
- Clicking a project navigates to `/projects/{name}` and calls `setSelectedProject`
- Active project highlighted
- "View all" link if more than 8

```typescript
// Sidebar projects section (collapsed by default)
<SidebarProjectsSection />
```

Create `components/layout/sidebar-projects.tsx` for this component to keep sidebar clean.

**Step 4: Commit**
```bash
git add frontend/src/components/layout/sidebar.tsx frontend/src/components/layout/sidebar-projects.tsx
git commit -m "task(sidebar): add Projects section with dynamic project list"
```

---

## PHASE 3 — Plugin Completeness

### Task 10: Istio — Add DestinationRules, ServiceEntries, PeerAuthentications

**Files:**
- Modify: `frontend/src/plugins/istio/overview.tsx`
- Create: `frontend/src/plugins/istio/destination-rules.tsx`
- Create: `frontend/src/plugins/istio/service-entries.tsx`
- Modify: `backend/plugins/istio/handlers.go`
- Modify: `backend/plugins/istio/plugin.go`
- Modify: `frontend/src/plugins/istio/index.ts`

**Step 1: Read backend/plugins/istio/handlers.go and plugin.go**

Check what GVRs are registered and what's missing.

**Step 2: Add missing backend handlers for DestinationRules and ServiceEntries**

In `handlers.go`, add list/get/create/delete handlers following the same pattern as VirtualServices:
- DestinationRule GVR: `networking.istio.io/v1alpha3/destinationrules`
- ServiceEntry GVR: `networking.istio.io/v1alpha3/serviceentries`

**Step 3: Register routes**

In `plugin.go` RegisterRoutes, add:
```go
r.HandleFunc("/api/plugins/istio/{cluster}/destination-rules", h.ListDestinationRules).Methods("GET")
r.HandleFunc("/api/plugins/istio/{cluster}/destination-rules/{namespace}/{name}", h.GetDestinationRule).Methods("GET", "PUT", "DELETE")
r.HandleFunc("/api/plugins/istio/{cluster}/service-entries", h.ListServiceEntries).Methods("GET")
r.HandleFunc("/api/plugins/istio/{cluster}/service-entries/{namespace}/{name}", h.GetServiceEntry).Methods("GET", "PUT", "DELETE")
```

**Step 4: Create frontend DestinationRules component**

Follow the same pattern as `virtual-services.tsx` — table with name, namespace, host, load balancing. Create/Delete actions.

**Step 5: Create frontend ServiceEntries component**

Follow the same pattern — table with name, namespace, hosts, ports, resolution.

**Step 6: Register new tabs in index.ts**

Add tabs for DestinationRules and ServiceEntries.

**Step 7: Build and verify**
```bash
cd backend && go build ./plugins/istio/... 2>&1
cd frontend && npm run lint 2>&1 | grep -E "error|Error" | head -20
```

**Step 8: Commit**
```bash
git add backend/plugins/istio/ frontend/src/plugins/istio/
git commit -m "task(istio): add DestinationRules and ServiceEntries UI and backend handlers"
```

---

### Task 11: Calico — Add GlobalNetworkPolicies and HostEndpoints tabs

**Files:**
- Modify: `backend/plugins/calico/handlers.go`
- Modify: `backend/plugins/calico/plugin.go`
- Create: `frontend/src/plugins/calico/host-endpoints.tsx`
- Modify: `frontend/src/plugins/calico/index.ts`

**Step 1: Read calico plugin to understand current state**

**Step 2: Verify GlobalNetworkPolicies endpoint exists in backend**

GVR: `crd.projectcalico.org/v1/globalnetworkpolicies` (cluster-scoped)

Add if missing, including list/get/delete.

**Step 3: Add HostEndpoints backend handler**

GVR: `crd.projectcalico.org/v1/hostendpoints` (cluster-scoped)

**Step 4: Create frontend HostEndpoints component**

Table: name, node, interface name, expected IPs. Read-only view initially.

**Step 5: Commit**
```bash
git add backend/plugins/calico/ frontend/src/plugins/calico/
git commit -m "task(calico): add HostEndpoints UI and verify GlobalNetworkPolicies"
```

---

### Task 12: MariaDB — Add Users, Grants, Connections tabs

**Files:**
- Modify: `frontend/src/plugins/mariadb/index.ts`
- Create: `frontend/src/plugins/mariadb/users.tsx`
- Create: `frontend/src/plugins/mariadb/connections.tsx`

**Step 1: Read mariadb handlers.go to verify endpoints exist**

The backend has 21 endpoints — check that users, grants, connections endpoints are implemented.

**Step 2: Create Users component**

Table: name, namespace, username, roles, database, creation time. Delete action.

**Step 3: Create Connections component**

Table: name, namespace, database, host, port, status. View YAML action.

**Step 4: Register new tabs in index.ts**

**Step 5: Commit**
```bash
git add frontend/src/plugins/mariadb/
git commit -m "task(mariadb): add Users and Connections tabs"
```

---

### Task 13: Ceph — Add ObjectStores tab

**Files:**
- Modify: `frontend/src/plugins/ceph/index.ts`
- Create: `frontend/src/plugins/ceph/object-stores.tsx`

**Step 1: Read ceph handlers.go to verify objectstore endpoints**

GVR: `ceph.rook.io/v1/cephobjectstores`

**Step 2: Create ObjectStores component**

Table: name, namespace, gateway instances, health, data pool, metadata pool.

**Step 3: Commit**
```bash
git add frontend/src/plugins/ceph/
git commit -m "task(ceph): add ObjectStores tab"
```

---

### Task 14: KEDA — Add TriggerAuthentications tab

**Files:**
- Modify: `frontend/src/plugins/keda/index.ts`
- Create: `frontend/src/plugins/keda/trigger-authentications.tsx`

**Step 1: Read keda handlers.go to verify TriggerAuthentication endpoints**

GVR: `keda.sh/v1alpha1/triggerauthentications` (namespaced)
GVR: `keda.sh/v1alpha1/clustertriggerauthentications` (cluster-scoped)

**Step 2: Create TriggerAuthentications component**

Two-tab component: Namespaced / Cluster-scoped. Table: name, namespace/cluster, type, secret targets.

**Step 3: Commit**
```bash
git add frontend/src/plugins/keda/
git commit -m "task(keda): add TriggerAuthentications tab"
```

---

### Task 15: Helm — Add values editor and release history

**Files:**
- Modify: `frontend/src/plugins/helm/release-detail.tsx`
- Modify: `frontend/src/plugins/helm/releases.tsx`

**Step 1: Read current release-detail.tsx**

**Step 2: Add full history view**

In release-detail: show full history table (revision, status, chart, app version, description, updated). Each row has rollback button.

**Step 3: Add values YAML editor**

Below history: `GET /api/plugins/helm/{cluster}/releases/{name}/values` → display in read-only CodeMirror/textarea. "Edit & Upgrade" button opens a textarea to modify values and POST to upgrade endpoint.

**Step 4: Build backend endpoint if missing**

In `backend/plugins/helm/handlers.go` — add GET values handler if not present:
```go
r.HandleFunc("/api/plugins/helm/{cluster}/releases/{name}/values", h.GetValues).Methods("GET")
```

**Step 5: Commit**
```bash
git add backend/plugins/helm/ frontend/src/plugins/helm/
git commit -m "task(helm): add full history view and values editor"
```

---

### Task 16: CNPG — Add ScheduledBackups tab

**Files:**
- Modify: `frontend/src/plugins/cnpg/index.ts`
- Create: `frontend/src/plugins/cnpg/scheduled-backups.tsx`

**Step 1: Read cnpg handlers.go to verify scheduledbackups endpoint**

GVR: `postgresql.cnpg.io/v1/scheduledbackups`

**Step 2: Create ScheduledBackups component**

Table: name, namespace, cluster, schedule (cron), last backup, next backup, suspend toggle.

**Step 3: Commit**
```bash
git add frontend/src/plugins/cnpg/
git commit -m "task(cnpg): add ScheduledBackups tab"
```

---

### Task 17: Prometheus — Add AlertManager instances tab

**Files:**
- Modify: `frontend/src/plugins/prometheus/index.ts`
- Create: `frontend/src/plugins/prometheus/alertmanagers.tsx`

**Step 1: Read prometheus handlers.go to verify alertmanager endpoint**

GVR: `monitoring.coreos.com/v1/alertmanagers`

**Step 2: Create AlertManagers component**

Table: name, namespace, replicas, version, status. Read-only with View YAML.

**Step 3: Commit**
```bash
git add frontend/src/plugins/prometheus/
git commit -m "task(prometheus): add AlertManagers tab"
```

---

## PHASE 4 — Resource Views & UX Polish

### Task 18: Improve resource-detail.tsx

**Files:**
- Modify: `frontend/src/components/resources/resource-detail.tsx`

**Step 1: Read current resource-detail.tsx**

**Step 2: Add collapsible sections**

Use shadcn Accordion or manual collapsible for: Overview, Labels & Annotations, Spec, Status, Events.

**Step 3: Add related Events section**

Fetch `GET /api/clusters/{id}/events?namespace={ns}&fieldSelector=involvedObject.name={name}` and show in a table below the resource detail.

**Step 4: Add relative time display**

Use a `formatRelativeTime(date: string)` helper: "3h ago", "2d ago", etc.

**Step 5: Add copy-to-clipboard for name and namespace**

**Step 6: Commit**
```bash
git add frontend/src/components/resources/resource-detail.tsx
git commit -m "task(ux): improve resource detail with sections, events, relative time"
```

---

### Task 19: Improve log-viewer.tsx

**Files:**
- Modify: `frontend/src/components/resources/log-viewer.tsx`

**Step 1: Read current log-viewer.tsx**

**Step 2: Add multi-container selector tabs**

If a pod has multiple containers, show tab per container.

**Step 3: Add follow mode toggle**

Auto-scroll to bottom. `useEffect` on logs change scrolls to ref.

**Step 4: Add search/filter**

Input that highlights matching lines. Non-matching lines dimmed.

**Step 5: Add download button**

Creates a Blob and triggers download of log text file.

**Step 6: Commit**
```bash
git add frontend/src/components/resources/log-viewer.tsx
git commit -m "task(ux): improve log viewer with multi-container, follow mode, search, download"
```

---

### Task 20: Dashboard improvements

**Files:**
- Modify: `frontend/src/components/dashboard/resource-summary.tsx`
- Modify: `frontend/src/components/dashboard/cluster-health-card.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/page.tsx`

**Step 1: Add Projects health widget to dashboard**

If cluster has projects, show a widget: "X projects, Y healthy, Z degraded".

**Step 2: Improve resource-summary to respect namespace filter**

When a namespace is selected, counts should be namespace-scoped.

**Step 3: Add trending indicators**

Cluster health card: show arrow up/down if pod count changed (compare to cached previous value in sessionStorage).

**Step 4: Commit**
```bash
git add frontend/src/components/dashboard/ frontend/src/app/(dashboard)/dashboard/
git commit -m "task(dashboard): add projects widget and namespace-aware resource summary"
```

---

### Task 21: Consistent loading skeletons across plugins

**Files:**
- Modify: `frontend/src/components/skeletons.tsx`

**Step 1: Read current skeletons.tsx**

**Step 2: Add reusable plugin skeleton variants**

```typescript
export function PluginTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
      ))}
    </div>
  )
}

export function PluginOverviewSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  )
}
```

**Step 3: Replace ad-hoc spinner divs in plugins with these skeletons**

Search for `animate-spin` or `Loading...` in plugin files and replace with `<PluginTableSkeleton />`.

**Step 4: Commit**
```bash
git add frontend/src/components/skeletons.tsx frontend/src/plugins/
git commit -m "task(ux): consistent loading skeletons across all plugin views"
```

---

## PHASE 5 — Real-time & Performance

### Task 22: Add namespace and project watchers to Socket.IO

**Files:**
- Modify: `backend/internal/socketio/k8s_namespace.go`

**Step 1: Read k8s_namespace.go**

**Step 2: Add namespace watch**

When a client joins `/k8s` and subscribes to `namespace:watch:{clusterID}`, start a K8s watch on namespaces. Emit `namespace:updated` events when labels change. This allows the sidebar projects section to refresh automatically.

**Step 3: Frontend — subscribe in NamespaceSelector**

In `namespace-selector.tsx`, add Socket.IO subscription:
```typescript
socket.on('namespace:updated', () => {
  // refetch namespaces list
})
```

**Step 4: Commit**
```bash
git add backend/internal/socketio/ frontend/src/components/layout/namespace-selector.tsx
git commit -m "task(realtime): add namespace label watch for projects auto-refresh"
```

---

### Task 23: Improve useApiQuery with stale time and deduplication

**Files:**
- Modify: `frontend/src/hooks/use-api-query.ts`

**Step 1: Read current use-api-query.ts**

**Step 2: Add staleTime option**

```typescript
interface UseApiQueryOptions<T> {
  enabled?: boolean
  staleTime?: number   // ms — don't refetch if data is fresh
  onSuccess?: (data: T) => void
}
```

Cache last fetch time per URL. If `Date.now() - lastFetch < staleTime`, skip refetch.

**Step 3: Add request deduplication**

Maintain a `pendingRequests = new Map<string, Promise<T>>()` in module scope. If the same URL is being fetched, return the existing promise.

**Step 4: Add optimistic delete helper**

Export `removeFromCache(url: string)` to invalidate cached data after a delete operation.

**Step 5: Commit**
```bash
git add frontend/src/hooks/use-api-query.ts
git commit -m "task(perf): add staleTime and request deduplication to useApiQuery"
```

---

### Task 24: Socket.IO reconnection with exponential backoff

**Files:**
- Modify: `frontend/src/lib/socket.ts`

**Step 1: Read current socket.ts**

**Step 2: Configure Socket.IO reconnection**

```typescript
const socket = io(SOCKET_URL, {
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  reconnectionAttempts: Infinity,
  // exponential backoff via reconnectionDelayMax + randomizationFactor
  randomizationFactor: 0.5,
})
```

**Step 3: Add reconnect status event**

Emit to a Zustand `uiStore.setSocketStatus('connected' | 'reconnecting' | 'disconnected')`.

**Step 4: Show reconnect indicator in header**

In `components/layout/header.tsx`, show a small yellow dot with "Reconnecting..." when status is `reconnecting`.

**Step 5: Commit**
```bash
git add frontend/src/lib/socket.ts frontend/src/components/layout/header.tsx
git commit -m "task(realtime): exponential backoff reconnection with status indicator"
```

---

## PHASE 6 — Continuous Quality Loop

### Task 25: Fix all backend linter warnings

**Step 1: Run golangci-lint**
```bash
cd backend && golangci-lint run ./... 2>&1 | grep -v "^#" | head -60
```

**Step 2: Fix each issue**

Common issues to fix:
- Unhandled errors → add `_ =` or proper error handling
- Unused variables
- Missing error checks on `json.Encode`
- Misspelled identifiers

**Step 3: Commit**
```bash
git add backend/
git commit -m "task(quality): fix golangci-lint warnings across backend"
```

---

### Task 26: Fix all frontend lint warnings

**Step 1: Run ESLint**
```bash
cd frontend && npm run lint 2>&1 | grep -E "warning|error" | head -40
```

**Step 2: Fix each warning**

Common issues:
- Missing `key` props in lists
- `useEffect` with missing dependencies
- TypeScript `any` types that can be typed properly
- Unused imports

**Step 3: Commit**
```bash
git add frontend/
git commit -m "task(quality): fix eslint warnings across frontend"
```

---

### Task 27: Update OpenAPI spec for new endpoints

**Files:**
- Modify: `backend/docs/openapi.yaml`

**Step 1: Add projects endpoints to spec**

Add paths:
```yaml
/api/clusters/{clusterID}/projects:
  get:
    summary: List projects (aggregated by argus.darkden.net/projects label)
    ...

/api/clusters/{clusterID}/projects/{project}:
  get:
    summary: Get project detail
    ...
```

**Step 2: Add namespace selector documentation note**

All resource endpoints accept `?namespace=` — ensure this is documented in the spec.

**Step 3: Commit**
```bash
git add backend/docs/openapi.yaml
git commit -m "task(docs): update OpenAPI spec with projects endpoints"
```

---

### Task 28: Add tests for new backend functionality

**Files:**
- Create: `backend/internal/core/project_handlers_test.go`

**Step 1: Write unit test for splitProjects helper**

```go
func TestSplitProjects(t *testing.T) {
    tests := []struct {
        input    string
        expected []string
    }{
        {"frontend,backend", []string{"frontend", "backend"}},
        {"single", []string{"single"}},
        {"", []string{}},
        {"  frontend , backend ", []string{"frontend", "backend"}},
    }
    for _, tc := range tests {
        result := splitProjects(tc.input)
        // assert equality
    }
}
```

**Step 2: Write test for containsProject**

```go
func TestContainsProject(t *testing.T) {
    assert.True(t, containsProject("frontend,backend", "frontend"))
    assert.False(t, containsProject("frontend,backend", "monitoring"))
    assert.False(t, containsProject("", "anything"))
}
```

**Step 3: Run tests**
```bash
cd backend && go test ./internal/core/... -v -run TestSplit -run TestContains 2>&1
```

**Step 4: Commit**
```bash
git add backend/internal/core/project_handlers_test.go
git commit -m "task(tests): add unit tests for project handler helpers"
```

---

### Task 29: Add frontend test for NamespaceSelector

**Files:**
- Create: `frontend/src/__tests__/components/namespace-selector.test.tsx`

**Step 1: Write test**

```typescript
import { render, screen } from '@testing-library/react'
import { NamespaceSelector } from '@/components/layout/namespace-selector'
import { useClusterStore } from '@/stores/cluster'

jest.mock('@/stores/cluster')
jest.mock('@/lib/api')

describe('NamespaceSelector', () => {
  it('renders nothing when no cluster selected', () => {
    (useClusterStore as jest.Mock).mockReturnValue({ selectedClusterId: null })
    const { container } = render(<NamespaceSelector />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows "All Namespaces" when no namespace selected', () => {
    (useClusterStore as jest.Mock).mockReturnValue({
      selectedClusterId: 'cluster-1',
      selectedNamespace: null,
      setSelectedNamespace: jest.fn(),
      setNamespaces: jest.fn(),
    })
    render(<NamespaceSelector />)
    expect(screen.getByText('All Namespaces')).toBeInTheDocument()
  })
})
```

**Step 2: Run test**
```bash
cd frontend && npm test -- --testPathPattern="namespace-selector" --no-coverage 2>&1 | tail -20
```

**Step 3: Commit**
```bash
git add frontend/src/__tests__/components/namespace-selector.test.tsx
git commit -m "task(tests): add NamespaceSelector unit tests"
```

---

### Task 30: Save memory and create git tag

**Step 1: Save key patterns to memory**
```bash
mkdir -p /root/.claude/projects/-mnt-d-Proyectos-Argus---K8s-Dashboard/memory/
```

Write to `MEMORY.md`:
- Projects label: `argus.darkden.net/projects`
- Namespace store: `useClusterStore(s => s.selectedNamespace)`
- New endpoints: `/api/clusters/{id}/projects`, `/api/clusters/{id}/projects/{name}`
- Plugin namespace pattern: `?namespace=${ns}` query param

**Step 2: Final build check**
```bash
cd backend && go build ./... 2>&1
cd frontend && npm run lint 2>&1 | grep "error" | head -10
```

**Step 3: Create phase tag**
```bash
git tag v1.1.0-improvements
git push origin main v1.1.0-improvements
```
