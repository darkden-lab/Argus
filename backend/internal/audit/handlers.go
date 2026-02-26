package audit

import (
	"net/http"
	"strconv"

	"github.com/gorilla/mux"

	"github.com/darkden-lab/argus/backend/internal/httputil"
)

// Handlers provides HTTP handlers for the audit log.
type Handlers struct {
	store         *Store
	rbacReadGuard mux.MiddlewareFunc
}

// NewHandlers creates a new Handlers.
func NewHandlers(store *Store, rbacReadGuard mux.MiddlewareFunc) *Handlers {
	return &Handlers{store: store, rbacReadGuard: rbacReadGuard}
}

// RegisterRoutes wires the audit log endpoints onto the provided router.
func (h *Handlers) RegisterRoutes(r *mux.Router) {
	// Audit log requires audit:read RBAC
	auditRoutes := r.PathPrefix("").Subrouter()
	if h.rbacReadGuard != nil {
		auditRoutes.Use(h.rbacReadGuard)
	}
	auditRoutes.HandleFunc("/api/audit-log", h.List).Methods("GET")
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
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"entries": entries,
		"total":   total,
		"limit":   params.Limit,
		"offset":  params.Offset,
	})
}
