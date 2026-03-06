package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Agent represents an AI agent with a specific personality, system prompt, and tool set.
type Agent struct {
	ID                  string          `json:"id"`
	Slug                string          `json:"slug"`
	Name                string          `json:"name"`
	Description         string          `json:"description"`
	Icon                string          `json:"icon"`
	Category            string          `json:"category"`
	SystemPrompt        string          `json:"system_prompt"`
	AllowedTools        []string        `json:"allowed_tools"`
	ToolPermissionLevel string          `json:"tool_permission_level,omitempty"`
	WorkflowSteps       json.RawMessage `json:"workflow_steps"`
	WorkflowMode        string          `json:"workflow_mode"`
	IsBuiltin           bool            `json:"is_builtin"`
	OwnerUserID         *string         `json:"owner_user_id,omitempty"`
	IsPublic            bool            `json:"is_public"`
	CreatedAt           time.Time       `json:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at"`
}

// AgentTask represents an autonomous task being executed by an agent.
type AgentTask struct {
	ID             string          `json:"id"`
	UserID         string          `json:"user_id"`
	AgentID        string          `json:"agent_id"`
	ConversationID *string         `json:"conversation_id,omitempty"`
	Title          string          `json:"title"`
	InputParams    json.RawMessage `json:"input_params"`
	Status         string          `json:"status"`
	Progress       int             `json:"progress"`
	CurrentStep    string          `json:"current_step"`
	TotalSteps     int             `json:"total_steps"`
	CompletedSteps int             `json:"completed_steps"`
	Steps          json.RawMessage `json:"steps"`
	Result         *string         `json:"result,omitempty"`
	Error          *string         `json:"error,omitempty"`
	StartedAt      *time.Time      `json:"started_at,omitempty"`
	CompletedAt    *time.Time      `json:"completed_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
}

// AgentStore provides CRUD operations for agents and tasks.
type AgentStore struct {
	pool *pgxpool.Pool
}

// NewAgentStore creates a new AgentStore.
func NewAgentStore(pool *pgxpool.Pool) *AgentStore {
	return &AgentStore{pool: pool}
}

// List returns all agents visible to the given user: builtin + user's custom + public agents.
func (s *AgentStore) List(ctx context.Context, userID string) ([]Agent, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, slug, name, description, icon, category, system_prompt,
		        allowed_tools, COALESCE(tool_permission_level, ''), workflow_steps,
		        COALESCE(workflow_mode, 'interactive'), is_builtin, owner_user_id,
		        is_public, created_at, updated_at
		 FROM ai_agents
		 WHERE is_builtin = true
		    OR owner_user_id = $1
		    OR is_public = true
		 ORDER BY is_builtin DESC, name ASC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("agent store: list: %w", err)
	}
	defer rows.Close()

	var agents []Agent
	for rows.Next() {
		var a Agent
		if err := rows.Scan(
			&a.ID, &a.Slug, &a.Name, &a.Description, &a.Icon, &a.Category,
			&a.SystemPrompt, &a.AllowedTools, &a.ToolPermissionLevel,
			&a.WorkflowSteps, &a.WorkflowMode, &a.IsBuiltin, &a.OwnerUserID,
			&a.IsPublic, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("agent store: scan: %w", err)
		}
		agents = append(agents, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("agent store: rows iteration: %w", err)
	}
	return agents, nil
}

// GetByID returns a single agent by its UUID.
func (s *AgentStore) GetByID(ctx context.Context, id string) (*Agent, error) {
	var a Agent
	err := s.pool.QueryRow(ctx,
		`SELECT id, slug, name, description, icon, category, system_prompt,
		        allowed_tools, COALESCE(tool_permission_level, ''), workflow_steps,
		        COALESCE(workflow_mode, 'interactive'), is_builtin, owner_user_id,
		        is_public, created_at, updated_at
		 FROM ai_agents WHERE id = $1`,
		id,
	).Scan(
		&a.ID, &a.Slug, &a.Name, &a.Description, &a.Icon, &a.Category,
		&a.SystemPrompt, &a.AllowedTools, &a.ToolPermissionLevel,
		&a.WorkflowSteps, &a.WorkflowMode, &a.IsBuiltin, &a.OwnerUserID,
		&a.IsPublic, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("agent store: get by id: %w", err)
	}
	return &a, nil
}

// GetBySlug returns a single agent by its slug.
func (s *AgentStore) GetBySlug(ctx context.Context, slug string) (*Agent, error) {
	var a Agent
	err := s.pool.QueryRow(ctx,
		`SELECT id, slug, name, description, icon, category, system_prompt,
		        allowed_tools, COALESCE(tool_permission_level, ''), workflow_steps,
		        COALESCE(workflow_mode, 'interactive'), is_builtin, owner_user_id,
		        is_public, created_at, updated_at
		 FROM ai_agents WHERE slug = $1`,
		slug,
	).Scan(
		&a.ID, &a.Slug, &a.Name, &a.Description, &a.Icon, &a.Category,
		&a.SystemPrompt, &a.AllowedTools, &a.ToolPermissionLevel,
		&a.WorkflowSteps, &a.WorkflowMode, &a.IsBuiltin, &a.OwnerUserID,
		&a.IsPublic, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("agent store: get by slug: %w", err)
	}
	return &a, nil
}

// Create inserts a new custom agent.
func (s *AgentStore) Create(ctx context.Context, a *Agent) error {
	if a.WorkflowSteps == nil {
		a.WorkflowSteps = json.RawMessage("[]")
	}
	err := s.pool.QueryRow(ctx,
		`INSERT INTO ai_agents (slug, name, description, icon, category, system_prompt,
		        allowed_tools, tool_permission_level, workflow_steps, workflow_mode,
		        is_builtin, owner_user_id, is_public)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), $9, $10, $11, $12, $13)
		 RETURNING id, created_at, updated_at`,
		a.Slug, a.Name, a.Description, a.Icon, a.Category, a.SystemPrompt,
		a.AllowedTools, a.ToolPermissionLevel, a.WorkflowSteps, a.WorkflowMode,
		a.IsBuiltin, a.OwnerUserID, a.IsPublic,
	).Scan(&a.ID, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return fmt.Errorf("agent store: create: %w", err)
	}
	return nil
}

// Update modifies an existing custom agent. Builtin agents cannot be updated.
func (s *AgentStore) Update(ctx context.Context, a *Agent) error {
	if a.WorkflowSteps == nil {
		a.WorkflowSteps = json.RawMessage("[]")
	}
	tag, err := s.pool.Exec(ctx,
		`UPDATE ai_agents SET
		    slug = $2, name = $3, description = $4, icon = $5, category = $6,
		    system_prompt = $7, allowed_tools = $8, tool_permission_level = NULLIF($9, ''),
		    workflow_steps = $10, workflow_mode = $11, is_public = $12, updated_at = NOW()
		 WHERE id = $1 AND is_builtin = false`,
		a.ID, a.Slug, a.Name, a.Description, a.Icon, a.Category,
		a.SystemPrompt, a.AllowedTools, a.ToolPermissionLevel,
		a.WorkflowSteps, a.WorkflowMode, a.IsPublic,
	)
	if err != nil {
		return fmt.Errorf("agent store: update: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("agent not found or is a builtin agent")
	}
	return nil
}

// Delete removes a custom agent. Builtin agents cannot be deleted.
func (s *AgentStore) Delete(ctx context.Context, id, userID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM ai_agents WHERE id = $1 AND is_builtin = false AND owner_user_id = $2`,
		id, userID,
	)
	if err != nil {
		return fmt.Errorf("agent store: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("agent not found, is builtin, or not owned by user")
	}
	return nil
}

// --- Task operations ---

// CreateTask inserts a new agent task.
func (s *AgentStore) CreateTask(ctx context.Context, t *AgentTask) error {
	if t.InputParams == nil {
		t.InputParams = json.RawMessage("{}")
	}
	if t.Steps == nil {
		t.Steps = json.RawMessage("[]")
	}
	err := s.pool.QueryRow(ctx,
		`INSERT INTO ai_agent_tasks (user_id, agent_id, conversation_id, title, input_params,
		        status, progress, current_step, total_steps, completed_steps, steps)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 RETURNING id, created_at`,
		t.UserID, t.AgentID, t.ConversationID, t.Title, t.InputParams,
		t.Status, t.Progress, t.CurrentStep, t.TotalSteps, t.CompletedSteps, t.Steps,
	).Scan(&t.ID, &t.CreatedAt)
	if err != nil {
		return fmt.Errorf("agent store: create task: %w", err)
	}
	return nil
}

// UpdateTask updates an existing task's mutable fields.
func (s *AgentStore) UpdateTask(ctx context.Context, t *AgentTask) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE ai_agent_tasks SET
		    status = $2, progress = $3, current_step = $4, total_steps = $5,
		    completed_steps = $6, steps = $7, result = $8, error = $9,
		    started_at = $10, completed_at = $11, conversation_id = $12
		 WHERE id = $1`,
		t.ID, t.Status, t.Progress, t.CurrentStep, t.TotalSteps,
		t.CompletedSteps, t.Steps, t.Result, t.Error,
		t.StartedAt, t.CompletedAt, t.ConversationID,
	)
	if err != nil {
		return fmt.Errorf("agent store: update task: %w", err)
	}
	return nil
}

// GetTask returns a single task by ID.
func (s *AgentStore) GetTask(ctx context.Context, id string) (*AgentTask, error) {
	var t AgentTask
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, agent_id, conversation_id, title, input_params,
		        status, progress, current_step, total_steps, completed_steps, steps,
		        result, error, started_at, completed_at, created_at
		 FROM ai_agent_tasks WHERE id = $1`,
		id,
	).Scan(
		&t.ID, &t.UserID, &t.AgentID, &t.ConversationID, &t.Title, &t.InputParams,
		&t.Status, &t.Progress, &t.CurrentStep, &t.TotalSteps, &t.CompletedSteps,
		&t.Steps, &t.Result, &t.Error, &t.StartedAt, &t.CompletedAt, &t.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("agent store: get task: %w", err)
	}
	return &t, nil
}

// ListTasks returns all tasks for a given user.
func (s *AgentStore) ListTasks(ctx context.Context, userID string) ([]AgentTask, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, agent_id, conversation_id, title, input_params,
		        status, progress, current_step, total_steps, completed_steps, steps,
		        result, error, started_at, completed_at, created_at
		 FROM ai_agent_tasks
		 WHERE user_id = $1
		 ORDER BY created_at DESC
		 LIMIT 100`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("agent store: list tasks: %w", err)
	}
	defer rows.Close()

	var tasks []AgentTask
	for rows.Next() {
		var t AgentTask
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.AgentID, &t.ConversationID, &t.Title, &t.InputParams,
			&t.Status, &t.Progress, &t.CurrentStep, &t.TotalSteps, &t.CompletedSteps,
			&t.Steps, &t.Result, &t.Error, &t.StartedAt, &t.CompletedAt, &t.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("agent store: scan task: %w", err)
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("agent store: rows iteration: %w", err)
	}
	return tasks, nil
}
