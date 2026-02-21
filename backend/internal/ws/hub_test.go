package ws

import (
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func TestNewHub(t *testing.T) {
	h := NewHub()
	if h == nil {
		t.Fatal("expected non-nil Hub")
	}
	if h.clients == nil {
		t.Fatal("expected clients map to be initialised")
	}
}

func TestHub_RegisterUnregister(t *testing.T) {
	h := NewHub()
	go h.Run()

	c := &Client{
		ID:     "test-client",
		UserID: "user-1",
		send:   make(chan []byte, 4),
		hub:    h,
	}

	h.Register(c)
	time.Sleep(50 * time.Millisecond)

	h.mu.RLock()
	_, ok := h.clients[c.ID]
	h.mu.RUnlock()
	if !ok {
		t.Fatal("client should be registered in hub")
	}

	h.Unregister(c)
	time.Sleep(50 * time.Millisecond)

	h.mu.RLock()
	_, ok = h.clients[c.ID]
	h.mu.RUnlock()
	if ok {
		t.Fatal("client should have been removed from hub")
	}
}

func TestHub_BroadcastToSubscribers(t *testing.T) {
	h := NewHub()
	go h.Run()

	subKey := subscriptionKey("cluster-1", "pods", "default")

	c := &Client{
		ID:     "subscriber-1",
		UserID: "user-1",
		subscriptions: map[string]bool{
			subKey: true,
		},
		send: make(chan []byte, 4),
		hub:  h,
	}

	// Register the client directly to avoid race with buffered channel.
	h.mu.Lock()
	h.clients[c.ID] = c
	h.mu.Unlock()

	event := WatchEvent{
		Cluster:   "cluster-1",
		Resource:  "pods",
		Namespace: "default",
		Type:      "ADDED",
		Object:    json.RawMessage(`{"metadata":{"name":"test-pod"}}`),
	}

	h.BroadcastToSubscribers(subKey, event)

	select {
	case msg := <-c.send:
		var received WatchEvent
		if err := json.Unmarshal(msg, &received); err != nil {
			t.Fatalf("failed to unmarshal broadcast message: %v", err)
		}
		if received.Type != "ADDED" {
			t.Errorf("expected event type ADDED, got %q", received.Type)
		}
		if received.Cluster != "cluster-1" {
			t.Errorf("expected cluster cluster-1, got %q", received.Cluster)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for broadcast message")
	}
}

func TestHub_BroadcastNotSentToNonSubscribers(t *testing.T) {
	h := NewHub()
	go h.Run()

	subKey := subscriptionKey("cluster-1", "pods", "default")
	otherKey := subscriptionKey("cluster-2", "services", "kube-system")

	c := &Client{
		ID:     "non-subscriber",
		UserID: "user-2",
		subscriptions: map[string]bool{
			otherKey: true,
		},
		send: make(chan []byte, 4),
		hub:  h,
	}

	h.mu.Lock()
	h.clients[c.ID] = c
	h.mu.Unlock()

	event := WatchEvent{
		Cluster:   "cluster-1",
		Resource:  "pods",
		Namespace: "default",
		Type:      "MODIFIED",
		Object:    json.RawMessage(`{}`),
	}

	h.BroadcastToSubscribers(subKey, event)

	// Give the broadcast goroutine time to process.
	time.Sleep(100 * time.Millisecond)

	if len(c.send) != 0 {
		t.Fatal("non-subscriber should not have received the broadcast")
	}
}

func TestSubscriptionKey(t *testing.T) {
	key := subscriptionKey("cluster-abc", "deployments", "production")
	expected := "cluster-abc/deployments/production"
	if key != expected {
		t.Errorf("expected %q, got %q", expected, key)
	}
}

func TestClient_IsSubscribed(t *testing.T) {
	c := &Client{
		subscriptions: make(map[string]bool),
		subMu:         sync.RWMutex{},
	}

	key := subscriptionKey("c1", "pods", "ns1")
	if c.IsSubscribed(key) {
		t.Fatal("should not be subscribed initially")
	}

	c.subMu.Lock()
	c.subscriptions[key] = true
	c.subMu.Unlock()

	if !c.IsSubscribed(key) {
		t.Fatal("should be subscribed after adding key")
	}
}
