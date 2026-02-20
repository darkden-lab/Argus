package notifications

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/notifications/channels"
)

// Handlers provides HTTP handlers for the notifications API.
type Handlers struct {
	notifStore *NotificationStore
	prefStore  *PreferencesStore
	chanStore  *ChannelStore
	router     *Router
}

// NewHandlers creates a new Handlers.
func NewHandlers(notifStore *NotificationStore, prefStore *PreferencesStore, chanStore *ChannelStore, router *Router) *Handlers {
	return &Handlers{
		notifStore: notifStore,
		prefStore:  prefStore,
		chanStore:  chanStore,
		router:     router,
	}
}

// RegisterRoutes wires the notification endpoints onto the provided router.
func (h *Handlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/notifications", h.ListNotifications).Methods("GET")
	r.HandleFunc("/api/notifications/unread-count", h.UnreadCount).Methods("GET")
	r.HandleFunc("/api/notifications/{id}/read", h.MarkRead).Methods("PUT")
	r.HandleFunc("/api/notifications/read-all", h.MarkAllRead).Methods("PUT")
	r.HandleFunc("/api/notifications/preferences", h.GetPreferences).Methods("GET")
	r.HandleFunc("/api/notifications/preferences", h.UpdatePreferences).Methods("PUT")
	r.HandleFunc("/api/notifications/channels", h.ListChannels).Methods("GET")
	r.HandleFunc("/api/notifications/channels", h.CreateChannel).Methods("POST")
	r.HandleFunc("/api/notifications/channels/{id}", h.UpdateChannel).Methods("PUT")
	r.HandleFunc("/api/notifications/channels/{id}", h.DeleteChannel).Methods("DELETE")
	r.HandleFunc("/api/notifications/channels/{id}/test", h.TestChannel).Methods("POST")
}

// getUserID extracts the user ID from the request context (set by auth middleware).
func getUserID(r *http.Request) string {
	if uid, ok := r.Context().Value("user_id").(string); ok {
		return uid
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// ListNotifications handles GET /api/notifications
func (h *Handlers) ListNotifications(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	var readOnly *bool
	if q.Get("read") != "" {
		v := q.Get("read") == "true"
		readOnly = &v
	}

	params := NotificationListParams{
		UserID:   userID,
		Category: q.Get("category"),
		ReadOnly: readOnly,
		Limit:    limit,
		Offset:   offset,
	}

	notifications, total, err := h.notifStore.List(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"notifications": notifications,
		"total":         total,
		"limit":         params.Limit,
		"offset":        params.Offset,
	})
}

// UnreadCount handles GET /api/notifications/unread-count
func (h *Handlers) UnreadCount(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	count, err := h.notifStore.GetUnreadCount(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"unread_count": count,
	})
}

// MarkRead handles PUT /api/notifications/:id/read
func (h *Handlers) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := mux.Vars(r)["id"]
	if err := h.notifStore.MarkRead(r.Context(), userID, id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// MarkAllRead handles PUT /api/notifications/read-all
func (h *Handlers) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if err := h.notifStore.MarkAllRead(r.Context(), userID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GetPreferences handles GET /api/notifications/preferences
func (h *Handlers) GetPreferences(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	prefs, err := h.prefStore.GetByUser(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"preferences": prefs,
	})
}

// UpdatePreferences handles PUT /api/notifications/preferences
func (h *Handlers) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Preferences []struct {
			Category  string  `json:"category"`
			ChannelID *string `json:"channel_id"`
			Frequency string  `json:"frequency"`
			Enabled   bool    `json:"enabled"`
		} `json:"preferences"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	for _, p := range req.Preferences {
		pref := &Preference{
			UserID:    userID,
			Category:  p.Category,
			ChannelID: p.ChannelID,
			Frequency: p.Frequency,
			Enabled:   p.Enabled,
		}
		if err := h.prefStore.Set(r.Context(), pref); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ListChannels handles GET /api/notifications/channels
func (h *Handlers) ListChannels(w http.ResponseWriter, r *http.Request) {
	chs, err := h.chanStore.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"channels": chs,
	})
}

// CreateChannel handles POST /api/notifications/channels
func (h *Handlers) CreateChannel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Type    string          `json:"type"`
		Name    string          `json:"name"`
		Config  json.RawMessage `json:"config"`
		Enabled bool            `json:"enabled"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Type == "" || req.Name == "" {
		writeError(w, http.StatusBadRequest, "type and name are required")
		return
	}

	ch := &ChannelConfig{
		Type:      req.Type,
		Name:      req.Name,
		ConfigEnc: req.Config, // In production this would be encrypted with AES-256
		Enabled:   req.Enabled,
	}

	if err := h.chanStore.Create(r.Context(), ch); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, ch)
}

// UpdateChannel handles PUT /api/notifications/channels/:id
func (h *Handlers) UpdateChannel(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	var req struct {
		Type    string          `json:"type"`
		Name    string          `json:"name"`
		Config  json.RawMessage `json:"config"`
		Enabled bool            `json:"enabled"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ch := &ChannelConfig{
		ID:        id,
		Type:      req.Type,
		Name:      req.Name,
		ConfigEnc: req.Config,
		Enabled:   req.Enabled,
	}

	if err := h.chanStore.Update(r.Context(), ch); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DeleteChannel handles DELETE /api/notifications/channels/:id
func (h *Handlers) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := h.chanStore.Delete(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// TestChannel handles POST /api/notifications/channels/:id/test
func (h *Handlers) TestChannel(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	chConfig, err := h.chanStore.GetByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "channel not found")
		return
	}

	testMsg := channels.Message{
		ID:       "test",
		Topic:    "test",
		Category: "test",
		Severity: "info",
		Title:    "Test notification",
		Body:     "This is a test notification from K8s Dashboard",
	}

	ch, ok := h.router.channels[id]
	if !ok {
		writeError(w, http.StatusBadRequest, "channel type '"+chConfig.Type+"' is not loaded")
		return
	}

	if err := ch.Send(testMsg, nil); err != nil {
		writeError(w, http.StatusInternalServerError, "test send failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}
