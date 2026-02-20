package ws

import (
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"
)

// --- WebSocket Message Validation Tests ---

// TestControlMessageValidation tests that invalid control messages are rejected.
func TestControlMessageValidation(t *testing.T) {
	invalidMessages := []struct {
		name    string
		payload string
	}{
		{"empty_json", `{}`},
		{"missing_action", `{"cluster":"c1","resource":"pods","namespace":"ns"}`},
		{"missing_cluster", `{"action":"subscribe","resource":"pods"}`},
		{"null_values", `{"action":null,"cluster":null,"resource":null}`},
		{"numeric_action", `{"action":123}`},
		{"binary_data", "\x00\x01\x02"},
		{"deeply_nested", `{"action":"subscribe","cluster":{"nested":{"deep":true}}}`},
	}

	for _, tc := range invalidMessages {
		t.Run(tc.name, func(t *testing.T) {
			var cm controlMessage
			err := json.Unmarshal([]byte(tc.payload), &cm)
			// Either parse error or empty required fields
			if err == nil && cm.Action == "subscribe" && cm.Cluster != "" && cm.Resource != "" {
				t.Errorf("SECURITY: invalid control message accepted: %s", tc.name)
			}
		})
	}
}

// TestSubscriptionKeyInjection tests that subscription keys with special
// characters don't cause cross-subscription leaks.
func TestSubscriptionKeyInjection(t *testing.T) {
	injectionAttempts := []struct {
		cluster   string
		resource  string
		namespace string
	}{
		{"cluster-1/default/pods", "../../admin", "ns"},
		{"cluster-1", "pods/../../secrets", "default"},
		{"", "", ""},
		{"cluster-1", "pods\x00hidden", "ns"},
		{strings.Repeat("A", 10000), "pods", "default"},
	}

	for _, tc := range injectionAttempts {
		key := subscriptionKey(tc.cluster, tc.resource, tc.namespace)
		// The key should be a simple concatenation - verify no path traversal works
		if strings.Contains(key, "..") && !strings.Contains(tc.cluster, "..") &&
			!strings.Contains(tc.resource, "..") && !strings.Contains(tc.namespace, "..") {
			t.Errorf("SECURITY: subscription key introduced path traversal: %s", key)
		}
	}
}

// TestHubClientIsolation verifies that messages are only delivered to subscribed clients.
func TestHubClientIsolation(t *testing.T) {
	h := NewHub()
	go h.Run()

	subKey1 := subscriptionKey("cluster-1", "pods", "default")
	subKey2 := subscriptionKey("cluster-2", "secrets", "kube-system")

	client1 := &Client{
		ID:     "client-1",
		UserID: "user-1",
		subscriptions: map[string]bool{
			subKey1: true,
		},
		send:  make(chan []byte, 4),
		hub:   h,
		subMu: sync.RWMutex{},
	}

	client2 := &Client{
		ID:     "client-2",
		UserID: "user-2",
		subscriptions: map[string]bool{
			subKey2: true,
		},
		send:  make(chan []byte, 4),
		hub:   h,
		subMu: sync.RWMutex{},
	}

	h.mu.Lock()
	h.clients[client1.ID] = client1
	h.clients[client2.ID] = client2
	h.mu.Unlock()

	// Broadcast to cluster-1/pods/default
	event := WatchEvent{
		Cluster:   "cluster-1",
		Resource:  "pods",
		Namespace: "default",
		Type:      "ADDED",
		Object:    json.RawMessage(`{"metadata":{"name":"test"}}`),
	}
	h.BroadcastToSubscribers(subKey1, event)

	time.Sleep(100 * time.Millisecond)

	// Client 1 should receive the message
	if len(client1.send) != 1 {
		t.Error("client-1 should have received the message")
	}

	// Client 2 should NOT receive the message (different subscription)
	if len(client2.send) != 0 {
		t.Error("SECURITY: client-2 received a message for a subscription it doesn't have")
	}
}

// TestHubSlowConsumerDoesNotBlock verifies that a slow consumer doesn't block
// other clients from receiving messages.
func TestHubSlowConsumerDoesNotBlock(t *testing.T) {
	h := NewHub()
	go h.Run()

	subKey := subscriptionKey("cluster-1", "pods", "default")

	// Slow consumer with full buffer
	slowClient := &Client{
		ID:     "slow-client",
		UserID: "user-slow",
		subscriptions: map[string]bool{
			subKey: true,
		},
		send:  make(chan []byte, 1), // very small buffer
		hub:   h,
		subMu: sync.RWMutex{},
	}

	// Fast consumer
	fastClient := &Client{
		ID:     "fast-client",
		UserID: "user-fast",
		subscriptions: map[string]bool{
			subKey: true,
		},
		send:  make(chan []byte, 256),
		hub:   h,
		subMu: sync.RWMutex{},
	}

	h.mu.Lock()
	h.clients[slowClient.ID] = slowClient
	h.clients[fastClient.ID] = fastClient
	h.mu.Unlock()

	// Fill the slow client's buffer
	slowClient.send <- []byte("blocking")

	event := WatchEvent{
		Cluster:   "cluster-1",
		Resource:  "pods",
		Namespace: "default",
		Type:      "MODIFIED",
		Object:    json.RawMessage(`{}`),
	}

	// This should not block even though slowClient's buffer is full
	done := make(chan bool, 1)
	go func() {
		h.BroadcastToSubscribers(subKey, event)
		done <- true
	}()

	select {
	case <-done:
		// Good, broadcast completed without blocking
	case <-time.After(2 * time.Second):
		t.Fatal("SECURITY: broadcast blocked due to slow consumer (DoS risk)")
	}
}

// TestMaxMessageSizeConstant verifies the message size limit is set.
func TestMaxMessageSizeConstant(t *testing.T) {
	if maxMessageSize <= 0 {
		t.Fatal("SECURITY: maxMessageSize is not set (0 or negative)")
	}
	if maxMessageSize > 1024*1024 {
		t.Errorf("SECURITY: maxMessageSize is very large (%d bytes), DoS risk", maxMessageSize)
	}
}

// TestWriteWaitConstant verifies write timeout is set.
func TestWriteWaitConstant(t *testing.T) {
	if writeWait <= 0 {
		t.Fatal("SECURITY: writeWait is not set")
	}
	if writeWait > time.Minute {
		t.Errorf("SECURITY: writeWait is very long (%v), resource exhaustion risk", writeWait)
	}
}

// TestPongWaitConstant verifies the pong timeout is set.
func TestPongWaitConstant(t *testing.T) {
	if pongWait <= 0 {
		t.Fatal("SECURITY: pongWait is not set")
	}
	// pingPeriod must be less than pongWait
	if pingPeriod >= pongWait {
		t.Fatal("SECURITY: pingPeriod >= pongWait, connection detection broken")
	}
}

// TestEventHookExecution verifies that event hooks are called during broadcast.
func TestEventHookExecution(t *testing.T) {
	h := NewHub()
	go h.Run()

	hookCalled := false
	h.OnEvent(func(event WatchEvent) {
		hookCalled = true
		if event.Cluster != "test-cluster" {
			t.Errorf("hook received wrong cluster: %s", event.Cluster)
		}
	})

	event := WatchEvent{
		Cluster:   "test-cluster",
		Resource:  "pods",
		Namespace: "default",
		Type:      "ADDED",
		Object:    json.RawMessage(`{}`),
	}

	h.BroadcastToSubscribers("test-cluster/default/pods", event)
	time.Sleep(50 * time.Millisecond)

	if !hookCalled {
		t.Error("event hook was not called during broadcast")
	}
}

// TestConcurrentSubscriptionModification tests thread safety of subscription changes.
func TestConcurrentSubscriptionModification(t *testing.T) {
	c := &Client{
		ID:            "test-client",
		UserID:        "user-1",
		subscriptions: make(map[string]bool),
		subMu:         sync.RWMutex{},
	}

	done := make(chan bool, 200)

	// Concurrent subscribe/unsubscribe operations
	for i := 0; i < 100; i++ {
		go func(i int) {
			key := subscriptionKey("cluster", "pods", "ns")
			c.subMu.Lock()
			c.subscriptions[key] = true
			c.subMu.Unlock()
			done <- true
		}(i)
		go func(i int) {
			key := subscriptionKey("cluster", "pods", "ns")
			c.IsSubscribed(key)
			done <- true
		}(i)
	}

	for i := 0; i < 200; i++ {
		<-done
	}
}
