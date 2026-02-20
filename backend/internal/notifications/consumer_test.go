package notifications

import (
	"sync"
	"testing"
	"time"
)

// trackingBroker records which topics were subscribed to.
type trackingBroker struct {
	mu     sync.Mutex
	topics []string
	handlers map[string]EventHandler
}

func newTrackingBroker() *trackingBroker {
	return &trackingBroker{
		handlers: make(map[string]EventHandler),
	}
}

func (b *trackingBroker) Publish(topic string, event Event) error {
	b.mu.Lock()
	h, ok := b.handlers[topic]
	b.mu.Unlock()
	if ok {
		h(event)
	}
	return nil
}

func (b *trackingBroker) Subscribe(topic string, handler EventHandler) (string, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.topics = append(b.topics, topic)
	b.handlers[topic] = handler
	return "sub-" + topic, nil
}

func (b *trackingBroker) Close() error { return nil }

func (b *trackingBroker) getTopics() []string {
	b.mu.Lock()
	defer b.mu.Unlock()
	cp := make([]string, len(b.topics))
	copy(cp, b.topics)
	return cp
}

func TestConsumer_SubscribesAllTopics(t *testing.T) {
	broker := newTrackingBroker()
	router := NewRouter(nil, nil, nil)
	consumer := NewConsumer(broker, router)

	if err := consumer.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer consumer.Stop()

	topics := broker.getTopics()
	if len(topics) != len(AllTopics) {
		t.Errorf("expected %d subscriptions, got %d", len(AllTopics), len(topics))
	}

	topicSet := make(map[string]bool)
	for _, t := range topics {
		topicSet[t] = true
	}
	for _, expected := range AllTopics {
		if !topicSet[expected] {
			t.Errorf("missing subscription for topic %s", expected)
		}
	}
}

func TestConsumer_RoutesEventsToRouter(t *testing.T) {
	broker := NewInMemoryBroker()
	defer broker.Close()

	// We don't have a real DB, so the router will fail on DB calls,
	// but we can verify the consumer wiring by checking it doesn't panic
	// and handles the event.
	router := NewRouter(
		NewNotificationStore(nil),
		NewPreferencesStore(nil),
		NewChannelStore(nil),
	)
	consumer := NewConsumer(broker, router)

	if err := consumer.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer consumer.Stop()

	event := NewEvent(TopicClusterHealth, CategoryCluster, SeverityWarning, "Test", "Body", nil)
	if err := broker.Publish(TopicClusterHealth, event); err != nil {
		t.Fatalf("Publish failed: %v", err)
	}

	// Give time for async delivery. Router will fail on DB call (nil pool)
	// but should not panic.
	time.Sleep(100 * time.Millisecond)
}

func TestConsumer_Stop(t *testing.T) {
	broker := NewInMemoryBroker()
	defer broker.Close()

	router := NewRouter(nil, nil, nil)
	consumer := NewConsumer(broker, router)

	if err := consumer.Start(); err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	// Stop should not panic
	consumer.Stop()
}

func TestAllTopics_ContainsExpectedTopics(t *testing.T) {
	expected := []string{
		TopicClusterHealth, TopicClusterAdded, TopicClusterRemoved,
		TopicWorkloadCrash, TopicWorkloadScale, TopicWorkloadDeploy,
		TopicNodeReady, TopicNodeNotReady,
		TopicSecurityRBAC, TopicSecuritySecret,
		TopicPluginInstall, TopicPluginError,
		TopicAuditAction,
	}

	if len(AllTopics) != len(expected) {
		t.Errorf("expected %d topics, got %d", len(expected), len(AllTopics))
	}

	topicSet := make(map[string]bool)
	for _, t := range AllTopics {
		topicSet[t] = true
	}
	for _, e := range expected {
		if !topicSet[e] {
			t.Errorf("missing topic %s in AllTopics", e)
		}
	}
}
