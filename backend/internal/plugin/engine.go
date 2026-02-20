package plugin

import (
	"context"
	"fmt"
	"sync"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/k8s-dashboard/backend/internal/cluster"
	"github.com/k8s-dashboard/backend/internal/ws"
)

type Engine struct {
	plugins map[string]Plugin
	enabled map[string]bool
	pool    *pgxpool.Pool
	mu      sync.RWMutex
}

func NewEngine(pool *pgxpool.Pool) *Engine {
	return &Engine{
		plugins: make(map[string]Plugin),
		enabled: make(map[string]bool),
		pool:    pool,
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

	for id, p := range e.plugins {
		if e.enabled[id] {
			p.RegisterRoutes(router, cm)
		}
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
