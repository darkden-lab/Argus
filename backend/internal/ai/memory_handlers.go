package ai

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/darkden-lab/argus/backend/internal/auth"
)

// MemoryHandlers provides REST endpoints for AI memory CRUD.
type MemoryHandlers struct {
	store *MemoryStore
}

// NewMemoryHandlers creates memory API handlers.
func NewMemoryHandlers(pool *pgxpool.Pool) *MemoryHandlers {
	return &MemoryHandlers{
		store: NewMemoryStore(pool),
	}
}

// RegisterRoutes wires the AI memory REST endpoints.
func (h *MemoryHandlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/ai/memories", h.listMemories).Methods(http.MethodGet)
	r.HandleFunc("/api/ai/memories", h.createMemory).Methods(http.MethodPost)
	r.HandleFunc("/api/ai/memories/{id}", h.updateMemory).Methods(http.MethodPut)
	r.HandleFunc("/api/ai/memories/{id}", h.deleteMemory).Methods(http.MethodDelete)
}

func (h *MemoryHandlers) listMemories(w http.ResponseWriter, r *http.Request) {
	userID := getMemoryUserID(r)
	if userID == "" {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	memories, err := h.store.List(r.Context(), userID)
	if err != nil {
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list memories"})
		return
	}
	if memories == nil {
		memories = []Memory{}
	}
	writeAIJSON(w, http.StatusOK, memories)
}

type createMemoryRequest struct {
	Content  string `json:"content"`
	Category string `json:"category"`
}

func (h *MemoryHandlers) createMemory(w http.ResponseWriter, r *http.Request) {
	userID := getMemoryUserID(r)
	if userID == "" {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req createMemoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Content == "" {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "content is required"})
		return
	}

	memory, err := h.store.Create(r.Context(), userID, req.Content, req.Category)
	if err != nil {
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create memory"})
		return
	}
	writeAIJSON(w, http.StatusCreated, memory)
}

func (h *MemoryHandlers) updateMemory(w http.ResponseWriter, r *http.Request) {
	userID := getMemoryUserID(r)
	if userID == "" {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id := mux.Vars(r)["id"]

	var req createMemoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Content == "" {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "content is required"})
		return
	}

	if err := h.store.Update(r.Context(), id, userID, req.Content, req.Category); err != nil {
		writeAIJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeAIJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *MemoryHandlers) deleteMemory(w http.ResponseWriter, r *http.Request) {
	userID := getMemoryUserID(r)
	if userID == "" {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id := mux.Vars(r)["id"]

	if err := h.store.Delete(r.Context(), id, userID); err != nil {
		writeAIJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeAIJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// getMemoryUserID extracts the user ID from the JWT claims in the request context.
func getMemoryUserID(r *http.Request) string {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		return ""
	}
	return claims.UserID
}
