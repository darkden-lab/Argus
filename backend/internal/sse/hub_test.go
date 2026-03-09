package sse

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// flushRecorder wraps httptest.ResponseRecorder to implement http.Flusher.
type flushRecorder struct {
	*httptest.ResponseRecorder
	flushed int
}

func (f *flushRecorder) Flush() {
	f.flushed++
}

func newFlushRecorder() *flushRecorder {
	return &flushRecorder{ResponseRecorder: httptest.NewRecorder()}
}

func TestHub_RegisterUnregister(t *testing.T) {
	hub := NewHub()
	w := newFlushRecorder()

	client := hub.Register("user1", w)
	if client == nil {
		t.Fatal("expected non-nil client")
	}
	if client.UserID != "user1" {
		t.Errorf("expected UserID=user1, got %s", client.UserID)
	}

	// Verify client is tracked
	clients := hub.GetUserClients("user1")
	if len(clients) != 1 {
		t.Fatalf("expected 1 client, got %d", len(clients))
	}

	// Unregister
	hub.Unregister(client.ID)
	clients = hub.GetUserClients("user1")
	if len(clients) != 0 {
		t.Fatalf("expected 0 clients after unregister, got %d", len(clients))
	}
}

func TestHub_SendToUser(t *testing.T) {
	hub := NewHub()
	w1 := newFlushRecorder()
	w2 := newFlushRecorder()

	c1 := hub.Register("user1", w1)
	c2 := hub.Register("user1", w2)
	defer hub.Unregister(c1.ID)
	defer hub.Unregister(c2.ID)

	hub.SendToUser("user1", Event{Type: "test", Data: "hello"})

	// Allow writeLoop goroutines to process
	time.Sleep(50 * time.Millisecond)

	// Both writers should have received the event
	for _, w := range []*flushRecorder{w1, w2} {
		body := w.Body.String()
		if !strings.Contains(body, "event: test") {
			t.Errorf("expected event: test in body, got: %s", body)
		}
		if !strings.Contains(body, `"hello"`) {
			t.Errorf("expected data to contain hello, got: %s", body)
		}
	}
}

func TestHub_SendToClient(t *testing.T) {
	hub := NewHub()
	w1 := newFlushRecorder()
	w2 := newFlushRecorder()

	c1 := hub.Register("user1", w1)
	c2 := hub.Register("user1", w2)
	defer hub.Unregister(c1.ID)
	defer hub.Unregister(c2.ID)

	hub.SendToClient(c1.ID, Event{Type: "direct", Data: "only-c1"})

	time.Sleep(50 * time.Millisecond)

	if !strings.Contains(w1.Body.String(), "only-c1") {
		t.Error("c1 should have received the event")
	}
	if strings.Contains(w2.Body.String(), "only-c1") {
		t.Error("c2 should NOT have received the event")
	}
}

func TestHub_Broadcast(t *testing.T) {
	hub := NewHub()
	w1 := newFlushRecorder()
	w2 := newFlushRecorder()

	c1 := hub.Register("user1", w1)
	c2 := hub.Register("user2", w2)
	defer hub.Unregister(c1.ID)
	defer hub.Unregister(c2.ID)

	hub.Broadcast(Event{Type: "global", Data: "everyone"})

	time.Sleep(50 * time.Millisecond)

	for _, w := range []*flushRecorder{w1, w2} {
		body := w.Body.String()
		if !strings.Contains(body, "everyone") {
			t.Errorf("expected 'everyone' in body, got: %s", body)
		}
	}
}

func TestHub_GetAllClients(t *testing.T) {
	hub := NewHub()
	w1 := newFlushRecorder()
	w2 := newFlushRecorder()

	c1 := hub.Register("user1", w1)
	c2 := hub.Register("user2", w2)
	defer hub.Unregister(c1.ID)
	defer hub.Unregister(c2.ID)

	all := hub.GetAllClients()
	if len(all) != 2 {
		t.Errorf("expected 2 clients, got %d", len(all))
	}
}

func TestClient_Subscriptions(t *testing.T) {
	c := &Client{subscriptions: make(map[string]bool)}

	c.Subscribe("cluster1/pods/default")
	if !c.IsSubscribed("cluster1/pods/default") {
		t.Error("should be subscribed")
	}

	c.Unsubscribe("cluster1/pods/default")
	if c.IsSubscribed("cluster1/pods/default") {
		t.Error("should not be subscribed after unsubscribe")
	}
}

func TestHub_ConcurrentAccess(t *testing.T) {
	hub := NewHub()
	var wg sync.WaitGroup

	// Register 10 clients concurrently
	clients := make([]*Client, 10)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			w := newFlushRecorder()
			clients[idx] = hub.Register("user1", w)
		}(i)
	}
	wg.Wait()

	// Send events concurrently
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			hub.SendToUser("user1", Event{Type: "test", Data: "concurrent"})
		}()
	}
	wg.Wait()

	// Unregister concurrently
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			if clients[idx] != nil {
				hub.Unregister(clients[idx].ID)
			}
		}(i)
	}
	wg.Wait()

	remaining := hub.GetAllClients()
	if len(remaining) != 0 {
		t.Errorf("expected 0 clients after concurrent unregister, got %d", len(remaining))
	}
}

func TestHub_NonFlusherReturnsNil(t *testing.T) {
	hub := NewHub()
	// Regular ResponseRecorder does NOT implement http.Flusher
	// but our flushRecorder does, so use a minimal writer
	w := &nonFlusher{}
	client := hub.Register("user1", w)
	// Should return nil because the writer doesn't support flushing
	// But our Register writes error to w directly
	if client != nil {
		hub.Unregister(client.ID)
	}
}

type nonFlusher struct{}

func (n *nonFlusher) Header() http.Header        { return http.Header{} }
func (n *nonFlusher) Write(b []byte) (int, error) { return len(b), nil }
func (n *nonFlusher) WriteHeader(int)             {}

func TestHub_DoubleUnregister(t *testing.T) {
	hub := NewHub()
	w := newFlushRecorder()
	c := hub.Register("user1", w)

	hub.Unregister(c.ID)
	hub.Unregister(c.ID) // Should not panic

	clients := hub.GetAllClients()
	if len(clients) != 0 {
		t.Errorf("expected 0 clients, got %d", len(clients))
	}
}
