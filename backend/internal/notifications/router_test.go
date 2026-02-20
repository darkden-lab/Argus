package notifications

import (
	"testing"

	"github.com/darkden-lab/argus/backend/internal/notifications/channels"
)

func TestNewRouter(t *testing.T) {
	router := NewRouter(nil, nil, nil)
	if router == nil {
		t.Fatal("expected non-nil router")
	}
	if router.channels == nil {
		t.Error("expected channels map to be initialized")
	}
}

// mockChannel is a test double for channels.Channel.
type mockChannel struct {
	sentMessages []channels.Message
	sendErr      error
	channelType  string
}

func (m *mockChannel) Type() string { return m.channelType }
func (m *mockChannel) Name() string { return "mock-" + m.channelType }
func (m *mockChannel) Send(msg channels.Message, recipients []string) error {
	m.sentMessages = append(m.sentMessages, msg)
	return m.sendErr
}

func TestRouter_RegisterChannel(t *testing.T) {
	router := NewRouter(nil, nil, nil)
	ch := &mockChannel{channelType: "email"}

	router.RegisterChannel("ch-1", ch)

	chs := router.GetChannels()
	if len(chs) != 1 {
		t.Fatalf("expected 1 channel, got %d", len(chs))
	}
	if _, ok := chs["ch-1"]; !ok {
		t.Error("expected channel 'ch-1' to be registered")
	}
}

func TestRouter_RegisterMultipleChannels(t *testing.T) {
	router := NewRouter(nil, nil, nil)
	ch1 := &mockChannel{channelType: "email"}
	ch2 := &mockChannel{channelType: "slack"}
	ch3 := &mockChannel{channelType: "webhook"}

	router.RegisterChannel("email-1", ch1)
	router.RegisterChannel("slack-1", ch2)
	router.RegisterChannel("webhook-1", ch3)

	chs := router.GetChannels()
	if len(chs) != 3 {
		t.Fatalf("expected 3 channels, got %d", len(chs))
	}
}

func TestRouter_GetChannels_Empty(t *testing.T) {
	router := NewRouter(nil, nil, nil)
	chs := router.GetChannels()
	if len(chs) != 0 {
		t.Errorf("expected 0 channels, got %d", len(chs))
	}
}

func TestRouter_Route_NilPrefStore(t *testing.T) {
	// Router with nil prefStore should not panic
	router := NewRouter(nil, nil, nil)
	event := NewEvent(TopicClusterHealth, CategoryCluster, SeverityWarning, "Test", "Body", nil)

	// Should not panic
	router.Route(nil, event)
}

func TestRouter_Route_NilPoolInPrefStore(t *testing.T) {
	// Router with a prefStore that has nil pool should skip gracefully
	router := NewRouter(
		NewNotificationStore(nil),
		NewPreferencesStore(nil),
		NewChannelStore(nil),
	)
	event := NewEvent(TopicClusterHealth, CategoryCluster, SeverityWarning, "Test", "Body", nil)

	// Should not panic
	router.Route(nil, event)
}

func TestNewHandlers_Notifications(t *testing.T) {
	h := NewHandlers(
		NewNotificationStore(nil),
		NewPreferencesStore(nil),
		NewChannelStore(nil),
		NewRouter(nil, nil, nil),
	)
	if h == nil {
		t.Fatal("expected non-nil handlers")
	}
}

func TestNewBroker_InMemoryFallback(t *testing.T) {
	// InMemoryBroker should implement MessageBroker
	var _ MessageBroker = (*InMemoryBroker)(nil)
}

func TestInMemoryBroker_ConcurrentPublishSubscribe(t *testing.T) {
	broker := NewInMemoryBroker()
	defer broker.Close()

	const numSubscribers = 5
	const numMessages = 10
	received := make([]chan Event, numSubscribers)

	for i := 0; i < numSubscribers; i++ {
		received[i] = make(chan Event, numMessages)
		ch := received[i]
		_, err := broker.Subscribe(TopicClusterHealth, func(e Event) {
			ch <- e
		})
		if err != nil {
			t.Fatalf("subscribe %d failed: %v", i, err)
		}
	}

	for i := 0; i < numMessages; i++ {
		event := NewEvent(TopicClusterHealth, CategoryCluster, SeverityInfo, "Test", "Body", nil)
		if err := broker.Publish(TopicClusterHealth, event); err != nil {
			t.Fatalf("publish %d failed: %v", i, err)
		}
	}

	// Verify all subscribers got all messages
	for i := 0; i < numSubscribers; i++ {
		for j := 0; j < numMessages; j++ {
			select {
			case <-received[i]:
				// ok
			case <-make(chan struct{}):
				// use a blocking channel that never triggers as timeout fallback
			}
		}
	}
}
