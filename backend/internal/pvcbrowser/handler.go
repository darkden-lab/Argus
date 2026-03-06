package pvcbrowser

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"

	"github.com/gorilla/mux"

	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/httputil"
)

const maxUploadSize = 100 * 1024 * 1024 // 100 MB

// Handlers provides HTTP handlers for the PVC file browser.
type Handlers struct {
	sm *SessionManager
	cm *cluster.Manager
}

// NewHandlers creates PVC browser handlers.
func NewHandlers(sm *SessionManager, cm *cluster.Manager) *Handlers {
	return &Handlers{sm: sm, cm: cm}
}

// RegisterRoutes registers all PVC browser routes on the given router.
func (h *Handlers) RegisterRoutes(r *mux.Router) {
	sub := r.PathPrefix("/api/clusters/{clusterID}/pvc-browser/sessions").Subrouter()

	sub.HandleFunc("", h.handleStartSession).Methods("POST")
	sub.HandleFunc("/{sessionID}", h.handleStopSession).Methods("DELETE")
	sub.HandleFunc("/{sessionID}/ls", h.handleListDir).Methods("GET")
	sub.HandleFunc("/{sessionID}/stat", h.handleStat).Methods("GET")
	sub.HandleFunc("/{sessionID}/read", h.handleRead).Methods("GET")
	sub.HandleFunc("/{sessionID}/download", h.handleDownload).Methods("GET")
	sub.HandleFunc("/{sessionID}/write", h.handleWrite).Methods("PUT")
	sub.HandleFunc("/{sessionID}/mkdir", h.handleMkdir).Methods("POST")
	sub.HandleFunc("/{sessionID}/rm", h.handleRemove).Methods("DELETE")
	sub.HandleFunc("/{sessionID}/upload", h.handleUpload).Methods("POST")
	sub.HandleFunc("/{sessionID}/rename", h.handleRename).Methods("POST")
}

type startSessionRequest struct {
	Namespace string `json:"namespace"`
	PVCName   string `json:"pvc_name"`
}

func (h *Handlers) handleStartSession(w http.ResponseWriter, r *http.Request) {
	var req startSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Namespace == "" || req.PVCName == "" {
		httputil.WriteError(w, http.StatusBadRequest, "namespace and pvc_name are required")
		return
	}

	clusterID := mux.Vars(r)["clusterID"]
	userID := getUserID(r)

	session, err := h.sm.StartSession(r.Context(), h.cm, clusterID, req.Namespace, req.PVCName, userID)
	if err != nil {
		log.Printf("pvcbrowser: start session error: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, session) //nolint:errcheck
}

func (h *Handlers) handleStopSession(w http.ResponseWriter, r *http.Request) {
	sessionID := mux.Vars(r)["sessionID"]

	if err := h.sm.StopSession(r.Context(), h.cm, sessionID); err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "stopped"}) //nolint:errcheck
}

func (h *Handlers) handleListDir(w http.ResponseWriter, r *http.Request) {
	session, err := h.getSession(r)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}

	files, err := ListDir(r.Context(), h.cm, session, path)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, files) //nolint:errcheck
}

func (h *Handlers) handleStat(w http.ResponseWriter, r *http.Request) {
	session, err := h.getSession(r)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		httputil.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}

	info, err := StatFile(r.Context(), h.cm, session, path)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, info) //nolint:errcheck
}

func (h *Handlers) handleRead(w http.ResponseWriter, r *http.Request) {
	session, err := h.getSession(r)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		httputil.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}

	content, isBinary, err := ReadFile(r.Context(), h.cm, session, path)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{ //nolint:errcheck
		"content":   string(content),
		"is_binary": isBinary,
		"size":      len(content),
	})
}

func (h *Handlers) handleDownload(w http.ResponseWriter, r *http.Request) {
	session, err := h.getSession(r)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		httputil.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}

	content, _, err := ReadFile(r.Context(), h.cm, session, path)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	filename := filepath.Base(path)
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(content)))
	w.WriteHeader(http.StatusOK)
	w.Write(content) //nolint:errcheck
}

func (h *Handlers) handleWrite(w http.ResponseWriter, r *http.Request) {
	session, err := h.getSession(r)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		httputil.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}

	content, err := io.ReadAll(r.Body)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "failed to read body")
		return
	}

	if err := WriteFile(r.Context(), h.cm, session, path, content); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "written"}) //nolint:errcheck
}

func (h *Handlers) handleMkdir(w http.ResponseWriter, r *http.Request) {
	session, err := h.getSession(r)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		httputil.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}

	if err := MkDir(r.Context(), h.cm, session, path); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"status": "created"}) //nolint:errcheck
}

func (h *Handlers) handleRemove(w http.ResponseWriter, r *http.Request) {
	session, err := h.getSession(r)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		httputil.WriteError(w, http.StatusBadRequest, "path is required")
		return
	}

	recursive := r.URL.Query().Get("recursive") == "true"

	if err := Remove(r.Context(), h.cm, session, path, recursive); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "removed"}) //nolint:errcheck
}

func (h *Handlers) handleUpload(w http.ResponseWriter, r *http.Request) {
	session, err := h.getSession(r)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "file too large or invalid multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "missing file field")
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to read uploaded file")
		return
	}

	targetPath := filepath.Join(path, header.Filename)
	if err := WriteFile(r.Context(), h.cm, session, targetPath, content); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, map[string]string{ //nolint:errcheck
		"status":   "uploaded",
		"filename": header.Filename,
	})
}

type renameRequest struct {
	OldPath string `json:"old_path"`
	NewPath string `json:"new_path"`
}

func (h *Handlers) handleRename(w http.ResponseWriter, r *http.Request) {
	session, err := h.getSession(r)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	var req renameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.OldPath == "" || req.NewPath == "" {
		httputil.WriteError(w, http.StatusBadRequest, "old_path and new_path are required")
		return
	}

	if err := Rename(r.Context(), h.cm, session, req.OldPath, req.NewPath); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "renamed"}) //nolint:errcheck
}

// getSession retrieves the session from the URL and validates it.
func (h *Handlers) getSession(r *http.Request) (*Session, error) {
	sessionID := mux.Vars(r)["sessionID"]
	return h.sm.GetSession(sessionID)
}

// getUserID extracts user ID from the auth claims in context.
func getUserID(r *http.Request) string {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		return ""
	}
	return claims.UserID
}
