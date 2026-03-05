package ai

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"sync"
	"time"

	"github.com/darkden-lab/argus/backend/internal/ai/tools"
)

// TaskRunner executes agent tasks autonomously in the background.
type TaskRunner struct {
	service    *Service
	agentStore *AgentStore
	tasks      map[string]context.CancelFunc
	mu         sync.Mutex
}

// NewTaskRunner creates a new TaskRunner.
func NewTaskRunner(service *Service, agentStore *AgentStore) *TaskRunner {
	return &TaskRunner{
		service:    service,
		agentStore: agentStore,
		tasks:      make(map[string]context.CancelFunc),
	}
}

// TaskProgressFunc is called when a task makes progress.
type TaskProgressFunc func(taskID string, progress int, step string, completedSteps int)

// TaskCompleteFunc is called when a task completes successfully.
type TaskCompleteFunc func(taskID string, result string)

// TaskFailFunc is called when a task fails.
type TaskFailFunc func(taskID string, errMsg string)

// RunTaskWithCallbacks executes an agent task with Socket.IO event callbacks.
func (tr *TaskRunner) RunTaskWithCallbacks(parentCtx context.Context, task *AgentTask, agent *Agent, userID string, onProgress TaskProgressFunc, onComplete TaskCompleteFunc, onFail TaskFailFunc) {
	tr.runTaskInternal(parentCtx, task, agent, userID, onProgress, onComplete, onFail)
}

// RunTask executes an agent task autonomously. It should be called in a goroutine.
func (tr *TaskRunner) RunTask(parentCtx context.Context, task *AgentTask, agent *Agent, userID string) {
	tr.runTaskInternal(parentCtx, task, agent, userID, nil, nil, nil)
}

func (tr *TaskRunner) runTaskInternal(parentCtx context.Context, task *AgentTask, agent *Agent, userID string, onProgress TaskProgressFunc, onComplete TaskCompleteFunc, onFail TaskFailFunc) {
	ctx, cancel := context.WithTimeout(parentCtx, 10*time.Minute)
	defer cancel()

	tr.mu.Lock()
	tr.tasks[task.ID] = cancel
	tr.mu.Unlock()

	defer func() {
		tr.mu.Lock()
		delete(tr.tasks, task.ID)
		tr.mu.Unlock()
	}()

	// Mark as running
	now := time.Now()
	task.Status = "running"
	task.StartedAt = &now
	if err := tr.agentStore.UpdateTask(ctx, task); err != nil {
		log.Printf("task runner: failed to update task status: %v", err)
		return
	}

	// Determine workflow steps from agent
	var steps []map[string]string
	if len(agent.WorkflowSteps) > 0 {
		if err := json.Unmarshal(agent.WorkflowSteps, &steps); err != nil {
			log.Printf("ai/task_runner: failed to parse workflow steps for agent %s: %v", agent.ID, err)
		}
	}
	task.TotalSteps = len(steps)
	task.Steps = agent.WorkflowSteps

	// Resolve tools for the agent — only read-only tools in autonomous mode for safety
	agentTools := tr.resolveAgentTools(agent, "read_only")

	// Build initial messages — use BuildAgentSystemPrompt to inject memories + context
	messages := []Message{
		{Role: RoleSystem, Content: tr.service.BuildAgentSystemPrompt(ctx, userID, agent, ChatContext{})},
	}

	// Add task context
	var inputStr string
	if task.InputParams != nil {
		inputStr = string(task.InputParams)
	}
	taskPrompt := "Execute the following task autonomously. For each workflow step, execute it immediately without asking for confirmation. Present findings after each step.\n\nTask: " + task.Title
	if inputStr != "" && inputStr != "{}" {
		taskPrompt += "\nParameters: " + inputStr
	}
	messages = append(messages, Message{Role: RoleUser, Content: taskPrompt})

	provider, cfg := tr.service.Snapshot()
	if !cfg.Enabled {
		errMsg := "AI assistant is not enabled"
		task.Status = "failed"
		task.Error = &errMsg
		completedAt := time.Now()
		task.CompletedAt = &completedAt
		_ = tr.agentStore.UpdateTask(ctx, task)
		if onFail != nil {
			onFail(task.ID, errMsg)
		}
		return
	}

	// Execute step by step
	for i, step := range steps {
		select {
		case <-ctx.Done():
			errMsg := "task cancelled or timed out"
			task.Status = "cancelled"
			task.Error = &errMsg
			completedAt := time.Now()
			task.CompletedAt = &completedAt
			_ = tr.agentStore.UpdateTask(context.Background(), task)
			if onFail != nil {
				onFail(task.ID, errMsg)
			}
			return
		default:
		}

		stepName := step["name"]
		task.CurrentStep = stepName
		task.CompletedSteps = i
		task.Progress = (i * 100) / max(len(steps), 1)
		_ = tr.agentStore.UpdateTask(ctx, task)
		if onProgress != nil {
			onProgress(task.ID, task.Progress, stepName, i)
		}

		// Add step instruction
		stepMsg := Message{
			Role:    RoleUser,
			Content: "Execute step " + strconv.Itoa(i+1) + ": " + stepName + ". " + step["description"],
		}
		messages = append(messages, stepMsg)

		// LLM call with tools
		req := ChatRequest{
			Messages:    messages,
			Tools:       agentTools,
			MaxTokens:   cfg.MaxTokens,
			Temperature: cfg.Temperature,
		}

		resp, err := provider.Chat(ctx, req)
		if err != nil {
			log.Printf("task runner: LLM call failed at step %d: %v", i, err)
			errMsg := "LLM call failed: " + err.Error()
			task.Status = "failed"
			task.Error = &errMsg
			completedAt := time.Now()
			task.CompletedAt = &completedAt
			_ = tr.agentStore.UpdateTask(ctx, task)
			if onFail != nil {
				onFail(task.ID, errMsg)
			}
			return
		}

		// Handle tool calls (single round for simplicity in autonomous mode)
		if resp.FinishReason == "tool_calls" && len(resp.Message.ToolCalls) > 0 {
			messages = append(messages, resp.Message)
			for _, call := range resp.Message.ToolCalls {
				result := tr.service.executor.ExecuteForUser(ctx, call, userID)
				messages = append(messages, Message{
					Role:       RoleTool,
					Content:    result.Content,
					ToolCallID: call.ID,
				})
			}

			// Re-invoke LLM with tool results
			req.Messages = messages
			resp, err = provider.Chat(ctx, req)
			if err != nil {
				log.Printf("task runner: follow-up LLM call failed at step %d: %v", i, err)
				continue
			}
		}

		// Add assistant response to conversation
		messages = append(messages, resp.Message)
	}

	// Final: mark as completed
	task.Status = "completed"
	task.CompletedSteps = len(steps)
	task.Progress = 100
	completedAt := time.Now()
	task.CompletedAt = &completedAt

	// Use last message as result
	if len(messages) > 0 {
		lastMsg := messages[len(messages)-1]
		if lastMsg.Role == RoleAssistant {
			task.Result = &lastMsg.Content
		}
	}

	if err := tr.agentStore.UpdateTask(ctx, task); err != nil {
		log.Printf("task runner: failed to update completed task: %v", err)
	}

	if onComplete != nil {
		result := ""
		if task.Result != nil {
			result = *task.Result
		}
		onComplete(task.ID, result)
	}
}

// CancelTask cancels a running task.
func (tr *TaskRunner) CancelTask(taskID string) {
	tr.mu.Lock()
	defer tr.mu.Unlock()
	if cancel, ok := tr.tasks[taskID]; ok {
		cancel()
	}
}

// resolveAgentTools returns the tools available for an agent, intersecting the agent's
// allowed tools with the global permission level. Autonomous mode is always capped at read_only.
func (tr *TaskRunner) resolveAgentTools(agent *Agent, levelOverride string) []Tool {
	level := levelOverride
	if level == "" {
		level = agent.ToolPermissionLevel
	}

	allTools := tools.ToolsForLevel(level)
	if len(agent.AllowedTools) == 0 {
		return allTools
	}

	allowed := make(map[string]bool, len(agent.AllowedTools))
	for _, t := range agent.AllowedTools {
		allowed[t] = true
	}

	var filtered []Tool
	for _, t := range allTools {
		if allowed[t.Name] {
			filtered = append(filtered, t)
		}
	}
	return filtered
}
