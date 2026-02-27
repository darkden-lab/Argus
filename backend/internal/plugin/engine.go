package plugin

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

type Engine struct {
	plugins map[string]Plugin
	enabled map[string]bool
	pool    *pgxpool.Pool
	mu      sync.RWMutex
	hub     *ws.Hub
	cm      *cluster.Manager
	router  *mux.Router
}

func NewEngine(pool *pgxpool.Pool) *Engine {
	return &Engine{
		plugins: make(map[string]Plugin),
		enabled: make(map[string]bool),
		pool:    pool,
	}
}

// SetDependencies stores references needed for hot-reload (registering watchers
// and routes when a plugin is enabled at runtime).
func (e *Engine) SetDependencies(hub *ws.Hub, cm *cluster.Manager, router *mux.Router) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.hub = hub
	e.cm = cm
	e.router = router
}

// IsEnabled returns whether the plugin with the given ID is currently enabled.
func (e *Engine) IsEnabled(id string) bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.enabled[id]
}

// PluginGateMiddleware returns an HTTP middleware that blocks requests to
// disabled plugins. It extracts the plugin ID from the URL path pattern
// /api/plugins/{pluginID}/... and returns 404 if the plugin is not enabled.
func (e *Engine) PluginGateMiddleware() mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract plugin ID from URL: /api/plugins/{pluginID}/...
			path := r.URL.Path
			const prefix = "/api/plugins/"
			if strings.HasPrefix(path, prefix) {
				rest := path[len(prefix):]
				pluginID := rest
				if idx := strings.Index(rest, "/"); idx >= 0 {
					pluginID = rest[:idx]
				}
				if pluginID != "" && !e.IsEnabled(pluginID) {
					http.NotFound(w, r)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (e *Engine) Register(p Plugin) error {
	m := p.Manifest()
	if m.ID == "" {
		return fmt.Errorf("plugin manifest must have an ID")
	}
	if m.Name == "" {
		return fmt.Errorf("plugin manifest must have a name")
	}
	if m.Version == "" {
		return fmt.Errorf("plugin manifest must have a version")
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	if _, exists := e.plugins[m.ID]; exists {
		return fmt.Errorf("plugin %q is already registered", m.ID)
	}

	e.plugins[m.ID] = p
	return nil
}

func (e *Engine) Enable(ctx context.Context, pluginID string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	p, ok := e.plugins[pluginID]
	if !ok {
		return fmt.Errorf("plugin %q not found", pluginID)
	}

	if err := p.OnEnable(ctx, e.pool); err != nil {
		return fmt.Errorf("failed to enable plugin %q: %w", pluginID, err)
	}

	e.enabled[pluginID] = true

	if e.pool != nil {
		store := NewStore(e.pool)
		m := p.Manifest()
		_ = store.SavePlugin(ctx, m)
		_ = store.UpdatePluginStatus(ctx, pluginID, true)
	}

	// Hot-reload: register watchers for newly enabled plugin
	if e.hub != nil && e.cm != nil {
		p.RegisterWatchers(e.hub, e.cm)
	}

	return nil
}

func (e *Engine) Disable(ctx context.Context, pluginID string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	p, ok := e.plugins[pluginID]
	if !ok {
		return fmt.Errorf("plugin %q not found", pluginID)
	}

	if err := p.OnDisable(ctx, e.pool); err != nil {
		return fmt.Errorf("failed to disable plugin %q: %w", pluginID, err)
	}

	e.enabled[pluginID] = false

	if e.pool != nil {
		store := NewStore(e.pool)
		_ = store.UpdatePluginStatus(ctx, pluginID, false)
	}

	return nil
}

func (e *Engine) GetManifest(pluginID string) (*Manifest, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	p, ok := e.plugins[pluginID]
	if !ok {
		return nil, fmt.Errorf("plugin %q not found", pluginID)
	}

	m := p.Manifest()
	return &m, nil
}

func (e *Engine) ListEnabled(_ context.Context) []Manifest {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var manifests []Manifest
	for id, p := range e.plugins {
		if e.enabled[id] {
			manifests = append(manifests, p.Manifest())
		}
	}
	return manifests
}

func (e *Engine) ListAll() []PluginInfo {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var infos []PluginInfo
	for id, p := range e.plugins {
		m := p.Manifest()
		infos = append(infos, PluginInfo{
			Manifest: m,
			Enabled:  e.enabled[id],
		})
	}
	return infos
}

type PluginInfo struct {
	Manifest Manifest `json:"manifest"`
	Enabled  bool     `json:"enabled"`
}

func (e *Engine) RegisterAllRoutes(router *mux.Router, cm *cluster.Manager) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	for _, p := range e.plugins {
		p.RegisterRoutes(router, cm)
	}
}

func (e *Engine) RegisterAllWatchers(hub *ws.Hub, cm *cluster.Manager) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	for id, p := range e.plugins {
		if e.enabled[id] {
			p.RegisterWatchers(hub, cm)
		}
	}
}
