package channels

import (
	"encoding/json"
	"time"
)

// Message represents a notification payload to be delivered through a channel.
// It is channel-independent and mapped from the internal Event type by the router.
type Message struct {
	ID        string          `json:"id"`
	Topic     string          `json:"topic"`
	Category  string          `json:"category"`
	Severity  string          `json:"severity"`
	Title     string          `json:"title"`
	Body      string          `json:"body"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
	Timestamp time.Time       `json:"timestamp"`
}

// Channel defines the interface for delivering notification messages through
// an external channel (email, Slack, Teams, Telegram, webhook, etc.).
type Channel interface {
	// Send delivers a notification message to the specified recipients.
	Send(msg Message, recipients []string) error

	// Name returns the human-readable name of this channel instance.
	Name() string

	// Type returns the channel type identifier (e.g. "email", "slack").
	Type() string
}
