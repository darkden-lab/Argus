package channels

import "github.com/k8s-dashboard/backend/internal/notifications"

// Channel defines the interface for delivering notification events through
// an external channel (email, Slack, Teams, Telegram, webhook, etc.).
type Channel interface {
	// Send delivers a notification event to the specified recipients.
	Send(event notifications.Event, recipients []string) error

	// Name returns the human-readable name of this channel instance.
	Name() string

	// Type returns the channel type identifier (e.g. "email", "slack").
	Type() string
}
