package ai

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
)

// ConversationHandlers provides REST endpoints for AI conversation CRUD.
type ConversationHandlers struct {
	store *HistoryStore
}

// NewConversationHandlers creates conversation API handlers.
func NewConversationHandlers(store *HistoryStore) *ConversationHandlers {
	return &ConversationHandlers{
		store: store,
	}
}

// RegisterRoutes wires the AI conversation REST endpoints.
func (h *ConversationHandlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/ai/conversations", h.listConversations).Methods(http.MethodGet)
	r.HandleFunc("/api/ai/conversations/{id}", h.getConversation).Methods(http.MethodGet)
	r.HandleFunc("/api/ai/conversations/{id}", h.updateConversation).Methods(http.MethodPut)
	r.HandleFunc("/api/ai/conversations/{id}", h.deleteConversation).Methods(http.MethodDelete)
}

func (h *ConversationHandlers) listConversations(w http.ResponseWriter, r *http.Request) {
	userID := getMemoryUserID(r)
	if userID == "" {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if limit > 200 {
		limit = 200
	}

	conversations, err := h.store.ListConversations(r.Context(), userID, limit)
	if err != nil {
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list conversations"})
		return
	}
	if conversations == nil {
		conversations = []Conversation{}
	}
	writeAIJSON(w, http.StatusOK, conversations)
}

type conversationWithMessages struct {
	Conversation
	Messages []Message `json:"messages"`
}

func (h *ConversationHandlers) getConversation(w http.ResponseWriter, r *http.Request) {
	userID := getMemoryUserID(r)
	if userID == "" {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id := mux.Vars(r)["id"]

	found, err := h.store.GetConversation(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeAIJSON(w, http.StatusNotFound, map[string]string{"error": "conversation not found"})
		} else {
			writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch conversation"})
		}
		return
	}

	messages, err := h.store.GetMessages(r.Context(), id, 0)
	if err != nil {
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch messages"})
		return
	}
	if messages == nil {
		messages = []Message{}
	}

	writeAIJSON(w, http.StatusOK, conversationWithMessages{
		Conversation: *found,
		Messages:     messages,
	})
}

type updateTitleRequest struct {
	Title string `json:"title"`
}

func (h *ConversationHandlers) updateConversation(w http.ResponseWriter, r *http.Request) {
	userID := getMemoryUserID(r)
	if userID == "" {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id := mux.Vars(r)["id"]

	var req updateTitleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Title == "" {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "title is required"})
		return
	}

	// Verify ownership via direct lookup (O(1) instead of listing all conversations)
	if _, err := h.store.GetConversation(r.Context(), id, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeAIJSON(w, http.StatusNotFound, map[string]string{"error": "conversation not found"})
		} else {
			writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to verify ownership"})
		}
		return
	}

	if err := h.store.UpdateTitle(r.Context(), id, req.Title, userID); err != nil {
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update title"})
		return
	}
	writeAIJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *ConversationHandlers) deleteConversation(w http.ResponseWriter, r *http.Request) {
	userID := getMemoryUserID(r)
	if userID == "" {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id := mux.Vars(r)["id"]

	if err := h.store.DeleteConversation(r.Context(), id, userID); err != nil {
		writeAIJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeAIJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
