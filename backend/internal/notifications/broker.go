package notifications

// MessageBroker defines the interface for publishing and subscribing to
// notification events. Implementations include InMemoryBroker (for single-node)
// and KafkaBroker (for distributed setups).
type MessageBroker interface {
	// Publish sends an event to the given topic. Subscribers registered for
	// that topic will receive the event asynchronously.
	Publish(topic string, event Event) error

	// Subscribe registers a handler that will be called for every event
	// published to the given topic. Returns a subscription ID that can be
	// used for tracking purposes.
	Subscribe(topic string, handler EventHandler) (string, error)

	// Close shuts down the broker, releasing any resources (connections,
	// goroutines, channels). After Close returns, Publish and Subscribe
	// must not be called.
	Close() error
}
