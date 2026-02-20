package plugin

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

type Handlers struct {
	engine *Engine
}

func NewHandlers(engine *Engine) *Handlers {
	return &Handlers{engine: engine}
}

func (h *Handlers) RegisterRoutes(r *mux.Router) {
	api := r.PathPrefix("/api/plugins").Subrouter()
	api.HandleFunc("", h.handleList).Methods("GET")
	api.HandleFunc("/enabled", h.handleListEnabled).Methods("GET")
	api.HandleFunc("/{id}/enable", h.handleEnable).Methods("POST")
	api.HandleFunc("/{id}/disable", h.handleDisable).Methods("POST")
}

func (h *Handlers) handleList(w http.ResponseWriter, r *http.Request) {
	plugins := h.engine.ListAll()
	if plugins == nil {
		plugins = []PluginInfo{}
	}
	writeJSON(w, http.StatusOK, plugins)
}

func (h *Handlers) handleListEnabled(w http.ResponseWriter, r *http.Request) {
	manifests := h.engine.ListEnabled(r.Context())
	if manifests == nil {
		manifests = []Manifest{}
	}
	writeJSON(w, http.StatusOK, manifests)
}

func (h *Handlers) handleEnable(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := h.engine.Enable(r.Context(), id); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "enabled"})
}

func (h *Handlers) handleDisable(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := h.engine.Disable(r.Context(), id); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "disabled"})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
