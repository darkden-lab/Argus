package ai

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/auth"
)

// AgentHandlers provides REST endpoints for agent CRUD and task management.
type AgentHandlers struct {
	store      *AgentStore
	taskRunner *TaskRunner
}

// NewAgentHandlers creates new agent REST handlers.
func NewAgentHandlers(store *AgentStore, taskRunner *TaskRunner) *AgentHandlers {
	return &AgentHandlers{
		store:      store,
		taskRunner: taskRunner,
	}
}

// RegisterRoutes wires agent REST endpoints onto the given router.
func (h *AgentHandlers) RegisterRoutes(r *mux.Router) {
	ai := r.PathPrefix("/api/ai").Subrouter()

	// Agent CRUD
	ai.HandleFunc("/agents", h.listAgents).Methods(http.MethodGet)
	ai.HandleFunc("/agents/{id}", h.getAgent).Methods(http.MethodGet)
	ai.HandleFunc("/agents", h.createAgent).Methods(http.MethodPost)
	ai.HandleFunc("/agents/{id}", h.updateAgent).Methods(http.MethodPut)
	ai.HandleFunc("/agents/{id}", h.deleteAgent).Methods(http.MethodDelete)

	// Task management
	ai.HandleFunc("/tasks", h.listTasks).Methods(http.MethodGet)
	ai.HandleFunc("/tasks/{id}", h.getTask).Methods(http.MethodGet)
	ai.HandleFunc("/tasks", h.createTask).Methods(http.MethodPost)
	ai.HandleFunc("/tasks/{id}/cancel", h.cancelTask).Methods(http.MethodPost)
}

func (h *AgentHandlers) listAgents(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	agents, err := h.store.List(r.Context(), claims.UserID)
	if err != nil {
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if agents == nil {
		agents = []Agent{}
	}
	writeAIJSON(w, http.StatusOK, agents)
}

func (h *AgentHandlers) getAgent(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	agent, err := h.store.GetByID(r.Context(), id)
	if err != nil {
		writeAIJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
		return
	}
	writeAIJSON(w, http.StatusOK, agent)
}

type createAgentRequest struct {
	Slug                string          `json:"slug"`
	Name                string          `json:"name"`
	Description         string          `json:"description"`
	Icon                string          `json:"icon"`
	Category            string          `json:"category"`
	SystemPrompt        string          `json:"system_prompt"`
	AllowedTools        []string        `json:"allowed_tools"`
	ToolPermissionLevel string          `json:"tool_permission_level"`
	WorkflowSteps       json.RawMessage `json:"workflow_steps"`
	WorkflowMode        string          `json:"workflow_mode"`
	IsPublic            bool            `json:"is_public"`
}

func (h *AgentHandlers) createAgent(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req createAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.Slug == "" || req.Name == "" || req.SystemPrompt == "" {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "slug, name, and system_prompt are required"})
		return
	}

	agent := &Agent{
		Slug:                req.Slug,
		Name:                req.Name,
		Description:         req.Description,
		Icon:                req.Icon,
		Category:            req.Category,
		SystemPrompt:        req.SystemPrompt,
		AllowedTools:        req.AllowedTools,
		ToolPermissionLevel: req.ToolPermissionLevel,
		WorkflowSteps:       req.WorkflowSteps,
		WorkflowMode:        req.WorkflowMode,
		IsBuiltin:           false,
		OwnerUserID:         &claims.UserID,
		IsPublic:            req.IsPublic,
	}

	if err := h.store.Create(r.Context(), agent); err != nil {
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeAIJSON(w, http.StatusCreated, agent)
}

func (h *AgentHandlers) updateAgent(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	var req createAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	agent := &Agent{
		ID:                  id,
		Slug:                req.Slug,
		Name:                req.Name,
		Description:         req.Description,
		Icon:                req.Icon,
		Category:            req.Category,
		SystemPrompt:        req.SystemPrompt,
		AllowedTools:        req.AllowedTools,
		ToolPermissionLevel: req.ToolPermissionLevel,
		WorkflowSteps:       req.WorkflowSteps,
		WorkflowMode:        req.WorkflowMode,
		IsPublic:            req.IsPublic,
	}

	if err := h.store.Update(r.Context(), agent); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeAIJSON(w, http.StatusOK, agent)
}

func (h *AgentHandlers) deleteAgent(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	id := mux.Vars(r)["id"]
	if err := h.store.Delete(r.Context(), id, claims.UserID); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeAIJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// --- Task endpoints ---

func (h *AgentHandlers) listTasks(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	tasks, err := h.store.ListTasks(r.Context(), claims.UserID)
	if err != nil {
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if tasks == nil {
		tasks = []AgentTask{}
	}
	writeAIJSON(w, http.StatusOK, tasks)
}

func (h *AgentHandlers) getTask(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	task, err := h.store.GetTask(r.Context(), id)
	if err != nil {
		writeAIJSON(w, http.StatusNotFound, map[string]string{"error": "task not found"})
		return
	}
	writeAIJSON(w, http.StatusOK, task)
}

type createTaskRequest struct {
	AgentID     string          `json:"agent_id"`
	Title       string          `json:"title"`
	InputParams json.RawMessage `json:"input_params"`
}

func (h *AgentHandlers) createTask(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeAIJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var req createTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.AgentID == "" || req.Title == "" {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "agent_id and title are required"})
		return
	}

	// Verify agent exists
	agent, err := h.store.GetByID(r.Context(), req.AgentID)
	if err != nil {
		writeAIJSON(w, http.StatusNotFound, map[string]string{"error": "agent not found"})
		return
	}

	task := &AgentTask{
		UserID:      claims.UserID,
		AgentID:     req.AgentID,
		Title:       req.Title,
		InputParams: req.InputParams,
		Status:      "pending",
	}

	if err := h.store.CreateTask(r.Context(), task); err != nil {
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Start task execution in background if runner is available
	if h.taskRunner != nil {
		go h.taskRunner.RunTask(r.Context(), task, agent, claims.UserID)
	}

	writeAIJSON(w, http.StatusCreated, task)
}

func (h *AgentHandlers) cancelTask(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if h.taskRunner != nil {
		h.taskRunner.CancelTask(id)
	}

	writeAIJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}
