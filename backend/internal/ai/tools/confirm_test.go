package tools

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestRequestConfirmation_Approve(t *testing.T) {
	mgr := NewConfirmationManager()
	ctx := context.Background()
	call := ToolCall{ID: "tc-1", Name: "delete_pod", Arguments: `{"name":"nginx"}`}

	var status ConfirmationStatus
	var err error
	done := make(chan struct{})

	go func() {
		status, err = mgr.RequestConfirmation(ctx, "user-1", call)
		close(done)
	}()

	// Wait for the request to appear
	time.Sleep(20 * time.Millisecond)

	// Find the pending request and approve it
	pending := mgr.GetPendingForUser("user-1")
	if len(pending) != 1 {
		t.Fatalf("expected 1 pending request, got %d", len(pending))
	}
	if err := mgr.Approve(pending[0].ID); err != nil {
		t.Fatalf("Approve failed: %v", err)
	}

	<-done
	if err != nil {
		t.Fatalf("RequestConfirmation returned error: %v", err)
	}
	if status != ConfirmationApproved {
		t.Errorf("expected Approved, got %s", status)
	}
}

func TestRequestConfirmation_Reject(t *testing.T) {
	mgr := NewConfirmationManager()
	ctx := context.Background()
	call := ToolCall{ID: "tc-2", Name: "scale_deployment", Arguments: `{"replicas":0}`}

	var status ConfirmationStatus
	var err error
	done := make(chan struct{})

	go func() {
		status, err = mgr.RequestConfirmation(ctx, "user-1", call)
		close(done)
	}()

	time.Sleep(20 * time.Millisecond)

	pending := mgr.GetPendingForUser("user-1")
	if len(pending) != 1 {
		t.Fatalf("expected 1 pending request, got %d", len(pending))
	}
	if err := mgr.Reject(pending[0].ID); err != nil {
		t.Fatalf("Reject failed: %v", err)
	}

	<-done
	if err != nil {
		t.Fatalf("RequestConfirmation returned error: %v", err)
	}
	if status != ConfirmationRejected {
		t.Errorf("expected Rejected, got %s", status)
	}
}

func TestRequestConfirmation_Timeout(t *testing.T) {
	mgr := NewConfirmationManager()
	// Use a context with a very short deadline to simulate timeout
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	call := ToolCall{ID: "tc-3", Name: "drain_node", Arguments: `{"node":"worker-1"}`}

	status, err := mgr.RequestConfirmation(ctx, "user-1", call)
	if status != ConfirmationTimedOut {
		t.Errorf("expected TimedOut, got %s", status)
	}
	if err == nil {
		t.Error("expected context error, got nil")
	}
}

func TestRequestConfirmation_ContextCancel(t *testing.T) {
	mgr := NewConfirmationManager()
	ctx, cancel := context.WithCancel(context.Background())
	call := ToolCall{ID: "tc-4", Name: "delete_namespace", Arguments: `{"name":"test"}`}

	var status ConfirmationStatus
	var err error
	done := make(chan struct{})

	go func() {
		status, err = mgr.RequestConfirmation(ctx, "user-1", call)
		close(done)
	}()

	time.Sleep(20 * time.Millisecond)
	cancel()

	<-done
	if status != ConfirmationTimedOut {
		t.Errorf("expected TimedOut on cancel, got %s", status)
	}
	if err == nil {
		t.Error("expected context.Canceled error, got nil")
	}
}

func TestResolve_NotFound(t *testing.T) {
	mgr := NewConfirmationManager()

	if err := mgr.Approve("nonexistent-id"); err == nil {
		t.Error("expected error for Approve on unknown ID, got nil")
	}
	if err := mgr.Reject("nonexistent-id"); err == nil {
		t.Error("expected error for Reject on unknown ID, got nil")
	}
}

func TestCreateRequest_WaitForRequest(t *testing.T) {
	mgr := NewConfirmationManager()
	ctx := context.Background()
	call := ToolCall{ID: "tc-5", Name: "restart_pod", Arguments: `{"name":"api"}`}

	req := mgr.CreateRequest("user-2", call)
	if req.ID == "" {
		t.Fatal("CreateRequest returned empty ID")
	}
	if req.Status != ConfirmationPending {
		t.Errorf("expected Pending status, got %s", req.Status)
	}

	var status ConfirmationStatus
	var err error
	done := make(chan struct{})

	go func() {
		status, err = mgr.WaitForRequest(ctx, req.ID)
		close(done)
	}()

	time.Sleep(20 * time.Millisecond)
	if approveErr := mgr.Approve(req.ID); approveErr != nil {
		t.Fatalf("Approve failed: %v", approveErr)
	}

	<-done
	if err != nil {
		t.Fatalf("WaitForRequest returned error: %v", err)
	}
	if status != ConfirmationApproved {
		t.Errorf("expected Approved, got %s", status)
	}
}

func TestGetPendingForUser(t *testing.T) {
	mgr := NewConfirmationManager()

	// Create requests for different users
	call1 := ToolCall{ID: "tc-a1", Name: "tool-a", Arguments: "{}"}
	call2 := ToolCall{ID: "tc-a2", Name: "tool-b", Arguments: "{}"}
	call3 := ToolCall{ID: "tc-b1", Name: "tool-c", Arguments: "{}"}

	mgr.CreateRequest("user-a", call1)
	mgr.CreateRequest("user-a", call2)
	mgr.CreateRequest("user-b", call3)

	userA := mgr.GetPendingForUser("user-a")
	if len(userA) != 2 {
		t.Errorf("expected 2 pending for user-a, got %d", len(userA))
	}

	userB := mgr.GetPendingForUser("user-b")
	if len(userB) != 1 {
		t.Errorf("expected 1 pending for user-b, got %d", len(userB))
	}

	userC := mgr.GetPendingForUser("user-c")
	if len(userC) != 0 {
		t.Errorf("expected 0 pending for user-c, got %d", len(userC))
	}
}

func TestConcurrentApprovals(t *testing.T) {
	mgr := NewConfirmationManager()
	ctx := context.Background()
	const N = 20

	var wg sync.WaitGroup
	errors := make(chan error, N)
	statuses := make(chan ConfirmationStatus, N)

	for i := 0; i < N; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			call := ToolCall{
				ID:        "tc-conc-" + string(rune('A'+idx)),
				Name:      "tool-conc",
				Arguments: "{}",
			}

			req := mgr.CreateRequest("user-conc", call)

			// Approve from another goroutine
			go func() {
				time.Sleep(10 * time.Millisecond)
				if err := mgr.Approve(req.ID); err != nil {
					errors <- err
				}
			}()

			status, err := mgr.WaitForRequest(ctx, req.ID)
			if err != nil {
				errors <- err
				return
			}
			statuses <- status
		}(i)
	}

	wg.Wait()
	close(errors)
	close(statuses)

	for err := range errors {
		t.Errorf("concurrent error: %v", err)
	}

	count := 0
	for s := range statuses {
		if s != ConfirmationApproved {
			t.Errorf("expected Approved, got %s", s)
		}
		count++
	}
	if count != N {
		t.Errorf("expected %d approvals, got %d", N, count)
	}
}
