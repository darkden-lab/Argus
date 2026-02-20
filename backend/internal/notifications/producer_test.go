package notifications

import (
	"encoding/json"
	"sync"
	"testing"

	"github.com/darkden-lab/argus/backend/internal/ws"
)

// collectingBroker is a test double that records published events.
type collectingBroker struct {
	mu     sync.Mutex
	events []Event
}

func (b *collectingBroker) Publish(topic string, event Event) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.events = append(b.events, event)
	return nil
}

func (b *collectingBroker) Subscribe(topic string, handler EventHandler) (string, error) {
	return "sub-1", nil
}

func (b *collectingBroker) Close() error { return nil }

func (b *collectingBroker) getEvents() []Event {
	b.mu.Lock()
	defer b.mu.Unlock()
	cp := make([]Event, len(b.events))
	copy(cp, b.events)
	return cp
}

func TestEventProducer_PublishClusterHealthEvent(t *testing.T) {
	broker := &collectingBroker{}
	producer := NewEventProducer(broker)

	producer.PublishClusterHealthEvent("cluster-1", "prod-1", "disconnected")

	events := broker.getEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	e := events[0]
	if e.Topic != TopicClusterHealth {
		t.Errorf("expected topic %s, got %s", TopicClusterHealth, e.Topic)
	}
	if e.Severity != SeverityCritical {
		t.Errorf("expected severity critical, got %s", e.Severity)
	}
	if e.Title != "Cluster unhealthy" {
		t.Errorf("expected title 'Cluster unhealthy', got %q", e.Title)
	}
}

func TestEventProducer_PublishClusterHealthEvent_Healthy(t *testing.T) {
	broker := &collectingBroker{}
	producer := NewEventProducer(broker)

	producer.PublishClusterHealthEvent("cluster-1", "prod-1", "connected")

	events := broker.getEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	if events[0].Severity != SeverityInfo {
		t.Errorf("expected severity info, got %s", events[0].Severity)
	}
}

func TestEventProducer_PublishAuditEvent(t *testing.T) {
	broker := &collectingBroker{}
	producer := NewEventProducer(broker)

	details := json.RawMessage(`{"user":"admin"}`)
	producer.PublishAuditEvent("delete", "deployment/nginx", details)

	events := broker.getEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	e := events[0]
	if e.Topic != TopicAuditAction {
		t.Errorf("expected topic %s, got %s", TopicAuditAction, e.Topic)
	}
	if e.Category != CategoryAudit {
		t.Errorf("expected category audit, got %s", e.Category)
	}
}

func TestEventProducer_HandleWatchEvent_Deployment(t *testing.T) {
	broker := &collectingBroker{}
	producer := NewEventProducer(broker)

	we := ws.WatchEvent{
		Cluster:   "prod-1",
		Resource:  "deployments",
		Namespace: "default",
		Type:      "MODIFIED",
		Object:    json.RawMessage(`{}`),
	}

	producer.handleWatchEvent(we)

	events := broker.getEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	if events[0].Topic != TopicWorkloadDeploy {
		t.Errorf("expected topic %s, got %s", TopicWorkloadDeploy, events[0].Topic)
	}
	if events[0].Category != CategoryWorkload {
		t.Errorf("expected category workload, got %s", events[0].Category)
	}
}

func TestEventProducer_HandleWatchEvent_UnknownResource(t *testing.T) {
	broker := &collectingBroker{}
	producer := NewEventProducer(broker)

	we := ws.WatchEvent{
		Cluster:   "prod-1",
		Resource:  "configmaps",
		Namespace: "default",
		Type:      "ADDED",
	}

	producer.handleWatchEvent(we)

	events := broker.getEvents()
	if len(events) != 0 {
		t.Errorf("expected 0 events for unknown resource, got %d", len(events))
	}
}

func TestEventProducer_HandleWatchEvent_NodeDeleted(t *testing.T) {
	broker := &collectingBroker{}
	producer := NewEventProducer(broker)

	we := ws.WatchEvent{
		Cluster:  "prod-1",
		Resource: "nodes",
		Type:     "DELETED",
	}

	producer.handleWatchEvent(we)

	events := broker.getEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}

	if events[0].Topic != TopicNodeNotReady {
		t.Errorf("expected topic %s, got %s", TopicNodeNotReady, events[0].Topic)
	}
	if events[0].Severity != SeverityCritical {
		t.Errorf("expected severity critical, got %s", events[0].Severity)
	}
}

func TestEventProducer_HookIntoHub(t *testing.T) {
	broker := &collectingBroker{}
	producer := NewEventProducer(broker)
	hub := ws.NewHub()

	producer.HookIntoHub(hub)

	// Simulate a broadcast through the hub
	we := ws.WatchEvent{
		Cluster:   "prod-1",
		Resource:  "deployments",
		Namespace: "kube-system",
		Type:      "MODIFIED",
		Object:    json.RawMessage(`{}`),
	}
	hub.BroadcastToSubscribers("prod-1/kube-system/deployments", we)

	events := broker.getEvents()
	if len(events) != 1 {
		t.Fatalf("expected 1 event from hook, got %d", len(events))
	}
}

func TestClassifyWatchEvent(t *testing.T) {
	tests := []struct {
		name     string
		event    ws.WatchEvent
		topic    string
		category Category
		severity Severity
	}{
		{
			name:     "node modified",
			event:    ws.WatchEvent{Resource: "nodes", Type: "MODIFIED"},
			topic:    TopicNodeReady,
			category: CategoryNode,
			severity: SeverityWarning,
		},
		{
			name:     "pod deleted",
			event:    ws.WatchEvent{Resource: "pods", Type: "DELETED"},
			topic:    TopicWorkloadCrash,
			category: CategoryWorkload,
			severity: SeverityWarning,
		},
		{
			name:     "deployment added",
			event:    ws.WatchEvent{Resource: "deployments", Type: "ADDED"},
			topic:    TopicWorkloadScale,
			category: CategoryWorkload,
			severity: SeverityInfo,
		},
		{
			name:  "unknown",
			event: ws.WatchEvent{Resource: "services", Type: "ADDED"},
			topic: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			topic, category, severity := classifyWatchEvent(tt.event)
			if topic != tt.topic {
				t.Errorf("expected topic %q, got %q", tt.topic, topic)
			}
			if tt.topic != "" {
				if category != tt.category {
					t.Errorf("expected category %s, got %s", tt.category, category)
				}
				if severity != tt.severity {
					t.Errorf("expected severity %s, got %s", tt.severity, severity)
				}
			}
		})
	}
}
