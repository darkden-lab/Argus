package cluster

import (
	_ "embed"
	"net/http"

	"github.com/gorilla/mux"
)

//go:embed install.sh
var installScript []byte

type AgentHandlers struct {
	manager *Manager
}

func NewAgentHandlers(manager *Manager) *AgentHandlers {
	return &AgentHandlers{manager: manager}
}

func (h *AgentHandlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/agents/install.sh", h.handleInstallScript).Methods("GET")
}

func (h *AgentHandlers) handleInstallScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/x-shellscript")
	w.Header().Set("Content-Disposition", "attachment; filename=\"install.sh\"")
	w.WriteHeader(http.StatusOK)
	w.Write(installScript)
}
