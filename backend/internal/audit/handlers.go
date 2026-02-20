package audit

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

// Handlers provides HTTP handlers for the audit log.
type Handlers struct {
	store *Store
}

// NewHandlers creates a new Handlers.
func NewHandlers(store *Store) *Handlers {
	return &Handlers{store: store}
}

// RegisterRoutes wires the audit log endpoints onto the provided router.
func (h *Handlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/audit-log", h.List).Methods("GET")
}

// List handles GET /api/audit-log with query filters and pagination.
func (h *Handlers) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	params := ListParams{
		UserID:    q.Get("user_id"),
		ClusterID: q.Get("cluster_id"),
		Action:    q.Get("action"),
		FromDate:  q.Get("from_date"),
		ToDate:    q.Get("to_date"),
		Limit:     limit,
		Offset:    offset,
	}

	entries, total, err := h.store.List(r.Context(), params)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"entries": entries,
		"total":   total,
		"limit":   params.Limit,
		"offset":  params.Offset,
	})
}
