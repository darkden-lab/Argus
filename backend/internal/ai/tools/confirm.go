package tools

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
)

const confirmationTimeout = 60 * time.Second

// ConfirmationStatus represents the state of a confirmation request.
type ConfirmationStatus string

const (
	ConfirmationPending  ConfirmationStatus = "pending"
	ConfirmationApproved ConfirmationStatus = "approved"
	ConfirmationRejected ConfirmationStatus = "rejected"
	ConfirmationTimedOut ConfirmationStatus = "timed_out"
)

// ConfirmationRequest represents a pending request for user approval of a
// destructive tool call.
type ConfirmationRequest struct {
	ID        string             `json:"id"`
	ToolCall  ToolCall            `json:"tool_call"`
	Status    ConfirmationStatus `json:"status"`
	UserID    string             `json:"user_id"`
	CreatedAt time.Time          `json:"created_at"`
}

// ConfirmationManager tracks pending confirmation requests and coordinates
// approval between the AI service and the WebSocket frontend.
type ConfirmationManager struct {
	pending map[string]*pendingConfirmation
	mu      sync.Mutex
}

type pendingConfirmation struct {
	request  ConfirmationRequest
	resultCh chan ConfirmationStatus
}

// NewConfirmationManager creates a new confirmation manager.
func NewConfirmationManager() *ConfirmationManager {
	return &ConfirmationManager{
		pending: make(map[string]*pendingConfirmation),
	}
}

// RequestConfirmation creates a new confirmation request and blocks until
// the user responds or the timeout expires. Returns the confirmation status.
func (m *ConfirmationManager) RequestConfirmation(ctx context.Context, userID string, call ToolCall) (ConfirmationStatus, error) {
	reqID := uuid.New().String()

	pc := &pendingConfirmation{
		request: ConfirmationRequest{
			ID:        reqID,
			ToolCall:  call,
			Status:    ConfirmationPending,
			UserID:    userID,
			CreatedAt: time.Now(),
		},
		resultCh: make(chan ConfirmationStatus, 1),
	}

	m.mu.Lock()
	m.pending[reqID] = pc
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		delete(m.pending, reqID)
		m.mu.Unlock()
	}()

	log.Printf("ai: confirmation requested for tool %s (id=%s, user=%s)", call.Name, reqID, userID)

	select {
	case status := <-pc.resultCh:
		return status, nil
	case <-time.After(confirmationTimeout):
		return ConfirmationTimedOut, nil
	case <-ctx.Done():
		return ConfirmationTimedOut, ctx.Err()
	}
}

// Approve marks a pending confirmation as approved and unblocks the waiting
// goroutine.
func (m *ConfirmationManager) Approve(requestID string) error {
	return m.resolve(requestID, ConfirmationApproved)
}

// Reject marks a pending confirmation as rejected.
func (m *ConfirmationManager) Reject(requestID string) error {
	return m.resolve(requestID, ConfirmationRejected)
}

func (m *ConfirmationManager) resolve(requestID string, status ConfirmationStatus) error {
	m.mu.Lock()
	pc, ok := m.pending[requestID]
	m.mu.Unlock()

	if !ok {
		return fmt.Errorf("confirmation %s not found or already resolved", requestID)
	}

	pc.request.Status = status
	pc.resultCh <- status
	log.Printf("ai: confirmation %s resolved as %s", requestID, status)
	return nil
}

// GetPending returns the pending confirmation request for a given ID, if any.
func (m *ConfirmationManager) GetPending(requestID string) (*ConfirmationRequest, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()

	pc, ok := m.pending[requestID]
	if !ok {
		return nil, false
	}
	return &pc.request, true
}

// GetPendingForUser returns all pending confirmations for a user.
func (m *ConfirmationManager) GetPendingForUser(userID string) []ConfirmationRequest {
	m.mu.Lock()
	defer m.mu.Unlock()

	var requests []ConfirmationRequest
	for _, pc := range m.pending {
		if pc.request.UserID == userID && pc.request.Status == ConfirmationPending {
			requests = append(requests, pc.request)
		}
	}
	return requests
}
