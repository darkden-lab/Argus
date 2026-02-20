package plugin

import (
	"context"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

// Plugin defines the interface that all plugins must implement.
type Plugin interface {
	ID() string
	Manifest() Manifest
	RegisterRoutes(router *mux.Router, cm *cluster.Manager)
	RegisterWatchers(hub *ws.Hub, cm *cluster.Manager)
	OnEnable(ctx context.Context, pool *pgxpool.Pool) error
	OnDisable(ctx context.Context, pool *pgxpool.Pool) error
}
