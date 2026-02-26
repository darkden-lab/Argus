package plugin

import (
	"net/http"

	"github.com/gorilla/mux"

	"github.com/darkden-lab/argus/backend/internal/httputil"
)

type Handlers struct {
	engine         *Engine
	rbacWriteGuard mux.MiddlewareFunc
}

func NewHandlers(engine *Engine, rbacWriteGuard mux.MiddlewareFunc) *Handlers {
	return &Handlers{engine: engine, rbacWriteGuard: rbacWriteGuard}
}

func (h *Handlers) RegisterRoutes(r *mux.Router) {
	api := r.PathPrefix("/api/plugins").Subrouter()
	api.HandleFunc("", h.handleList).Methods("GET")
	api.HandleFunc("/enabled", h.handleListEnabled).Methods("GET")

	// Write endpoints require plugins:write RBAC
	writeAPI := api.PathPrefix("").Subrouter()
	if h.rbacWriteGuard != nil {
		writeAPI.Use(h.rbacWriteGuard)
	}
	writeAPI.HandleFunc("/{id}/enable", h.handleEnable).Methods("POST")
	writeAPI.HandleFunc("/{id}/disable", h.handleDisable).Methods("POST")
}

func (h *Handlers) handleList(w http.ResponseWriter, r *http.Request) {
	plugins := h.engine.ListAll()
	if plugins == nil {
		plugins = []PluginInfo{}
	}
	httputil.WriteJSON(w, http.StatusOK, plugins)
}

func (h *Handlers) handleListEnabled(w http.ResponseWriter, r *http.Request) {
	manifests := h.engine.ListEnabled(r.Context())
	if manifests == nil {
		manifests = []Manifest{}
	}
	httputil.WriteJSON(w, http.StatusOK, manifests)
}

func (h *Handlers) handleEnable(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := h.engine.Enable(r.Context(), id); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "enabled"})
}

func (h *Handlers) handleDisable(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := h.engine.Disable(r.Context(), id); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "disabled"})
}
