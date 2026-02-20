package rbac

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Request struct {
	UserID    string
	Action    string // "read", "write", "delete"
	Resource  string // "pods", "deployments", "istio:virtualservices"
	ClusterID string // optional - empty means any cluster
	Namespace string // optional - empty means any namespace
}

type Permission struct {
	Resource  string
	Action    string
	ScopeType string // "global", "cluster", "namespace"
	ScopeID   string
}

type Engine struct {
	pool  *pgxpool.Pool
	cache map[string]*cachedPermissions
	mu    sync.RWMutex
	ttl   time.Duration
}

type cachedPermissions struct {
	permissions []Permission
	expiresAt   time.Time
}

func NewEngine(pool *pgxpool.Pool) *Engine {
	return &Engine{
		pool:  pool,
		cache: make(map[string]*cachedPermissions),
		ttl:   5 * time.Minute,
	}
}

func (e *Engine) Evaluate(ctx context.Context, req Request) (bool, error) {
	perms, err := e.getPermissions(ctx, req.UserID)
	if err != nil {
		return false, err
	}

	for _, perm := range perms {
		if e.matchPermission(perm, req) {
			return true, nil
		}
	}

	return false, nil
}

func (e *Engine) getPermissions(ctx context.Context, userID string) ([]Permission, error) {
	e.mu.RLock()
	cached, ok := e.cache[userID]
	e.mu.RUnlock()

	if ok && time.Now().Before(cached.expiresAt) {
		return cached.permissions, nil
	}

	perms, err := e.LoadPermissions(ctx, userID)
	if err != nil {
		return nil, err
	}

	e.mu.Lock()
	e.cache[userID] = &cachedPermissions{
		permissions: perms,
		expiresAt:   time.Now().Add(e.ttl),
	}
	e.mu.Unlock()

	return perms, nil
}

func (e *Engine) LoadPermissions(ctx context.Context, userID string) ([]Permission, error) {
	query := `
		SELECT rp.resource, rp.action, rp.scope_type, COALESCE(rp.scope_id, '')
		FROM user_roles ur
		JOIN role_permissions rp ON ur.role_id = rp.role_id
		WHERE ur.user_id = $1
	`

	rows, err := e.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to load permissions: %w", err)
	}
	defer rows.Close()

	var perms []Permission
	for rows.Next() {
		var p Permission
		if err := rows.Scan(&p.Resource, &p.Action, &p.ScopeType, &p.ScopeID); err != nil {
			return nil, fmt.Errorf("failed to scan permission: %w", err)
		}
		perms = append(perms, p)
	}

	return perms, rows.Err()
}

func (e *Engine) InvalidateCache(userID string) {
	e.mu.Lock()
	delete(e.cache, userID)
	e.mu.Unlock()
}

func (e *Engine) matchPermission(perm Permission, req Request) bool {
	// Check resource match
	if perm.Resource != "*" && perm.Resource != req.Resource {
		return false
	}

	// Check action match
	if perm.Action != "*" && perm.Action != req.Action {
		return false
	}

	// Check scope
	switch perm.ScopeType {
	case "global":
		return true
	case "cluster":
		if req.ClusterID == "" {
			return true
		}
		return perm.ScopeID == req.ClusterID
	case "namespace":
		if req.ClusterID != "" && req.Namespace != "" {
			// ScopeID format for namespace: "clusterID/namespace"
			expected := req.ClusterID + "/" + req.Namespace
			return perm.ScopeID == expected
		}
		if req.Namespace != "" {
			return perm.ScopeID == req.Namespace
		}
		return false
	default:
		return false
	}
}
