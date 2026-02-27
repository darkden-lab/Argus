package terminal

import (
	"testing"
)

func TestHandleInput_NoEcho(t *testing.T) {
	// Create a session with a nil clusterMgr — HandleInput will send an error
	// because no cluster is selected, but the important thing is it does NOT
	// echo "$ <input>\r\n".
	s := &Session{
		ID:      "test-session",
		UserID:  "test-user",
		History: make([]string, 0, 100),
		output:  make(chan TerminalMessage, 256),
		done:    make(chan struct{}),
		cols:    80,
		rows:    24,
	}

	s.HandleInput("get pods")

	msg := <-s.output
	// Should get an error about no cluster selected (since ClusterID is empty)
	if msg.Type != "error" {
		t.Fatalf("expected error type, got %q", msg.Type)
	}

	// Verify command was added to history
	if len(s.History) != 1 || s.History[0] != "get pods" {
		t.Errorf("expected history [get pods], got %v", s.History)
	}
}

func TestHandleInput_EmptyInput(t *testing.T) {
	s := &Session{
		ID:      "test-session",
		UserID:  "test-user",
		History: make([]string, 0, 100),
		output:  make(chan TerminalMessage, 256),
		done:    make(chan struct{}),
	}

	s.HandleInput("")

	// Channel should be empty — no message sent
	select {
	case msg := <-s.output:
		t.Fatalf("expected no message for empty input, got %+v", msg)
	default:
		// OK
	}

	if len(s.History) != 0 {
		t.Errorf("expected empty history, got %v", s.History)
	}
}

func TestHandleInput_OutputDoesNotContainPrompt(t *testing.T) {
	// This test verifies that HandleInput does NOT include "$ <command>" echo.
	// Without a cluster selected, it sends an error — but crucially not "$ get pods\r\n".
	s := &Session{
		ID:      "test-session",
		UserID:  "test-user",
		History: make([]string, 0, 100),
		output:  make(chan TerminalMessage, 256),
		done:    make(chan struct{}),
		cols:    80,
		rows:    24,
	}

	// No cluster set → HandleInput sends error about no cluster
	s.HandleInput("get pods")

	msg := <-s.output
	if msg.Data == "$ get pods\r\n" {
		t.Fatal("HandleInput should not echo the command with '$ ' prefix")
	}
	if msg.Type != "error" {
		t.Fatalf("expected error type (no cluster set), got %q: %s", msg.Type, msg.Data)
	}
}

func TestSetContext(t *testing.T) {
	s := &Session{
		ID:     "test-session",
		UserID: "test-user",
	}

	s.SetContext("cluster-1", "kube-system")

	cid, ns := s.GetContext()
	if cid != "cluster-1" {
		t.Errorf("expected cluster-1, got %q", cid)
	}
	if ns != "kube-system" {
		t.Errorf("expected kube-system, got %q", ns)
	}
}
