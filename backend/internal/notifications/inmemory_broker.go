package notifications

import (
	"fmt"
	"sync"

	"github.com/google/uuid"
)

type subscription struct {
	id      string
	handler EventHandler
}

// InMemoryBroker is a simple, single-process MessageBroker backed by Go
// channels. It is suitable for development and single-node deployments.
type InMemoryBroker struct {
	mu      sync.RWMutex
	subs    map[string][]subscription // topic -> subscriptions
	closed  bool
	eventCh chan topicEvent
	done    chan struct{}
}

type topicEvent struct {
	topic string
	event Event
}

// NewInMemoryBroker creates and starts an InMemoryBroker. The broker starts a
// background goroutine to dispatch events; call Close() to stop it.
func NewInMemoryBroker() *InMemoryBroker {
	b := &InMemoryBroker{
		subs:    make(map[string][]subscription),
		eventCh: make(chan topicEvent, 1024),
		done:    make(chan struct{}),
	}
	go b.dispatch()
	return b
}

// Publish enqueues an event for asynchronous delivery to all subscribers of the
// given topic.
func (b *InMemoryBroker) Publish(topic string, event Event) error {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.closed {
		return fmt.Errorf("broker is closed")
	}

	b.eventCh <- topicEvent{topic: topic, event: event}
	return nil
}

// Subscribe registers a handler for the given topic and returns a subscription
// ID.
func (b *InMemoryBroker) Subscribe(topic string, handler EventHandler) (string, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed {
		return "", fmt.Errorf("broker is closed")
	}

	id := uuid.New().String()
	b.subs[topic] = append(b.subs[topic], subscription{id: id, handler: handler})
	return id, nil
}

// Close stops the dispatch goroutine and prevents further Publish/Subscribe
// calls.
func (b *InMemoryBroker) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.closed {
		return nil
	}

	b.closed = true
	close(b.eventCh)
	<-b.done
	return nil
}

// dispatch runs in a goroutine and fans out published events to the matching
// subscribers.
func (b *InMemoryBroker) dispatch() {
	defer close(b.done)

	for te := range b.eventCh {
		b.mu.RLock()
		subs := b.subs[te.topic]
		// Copy the slice so we can release the lock before calling handlers.
		handlers := make([]EventHandler, len(subs))
		for i, s := range subs {
			handlers[i] = s.handler
		}
		b.mu.RUnlock()

		for _, h := range handlers {
			h(te.event)
		}
	}
}
