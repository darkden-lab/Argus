package notifications

import (
	"context"
	"encoding/json"
	"log"

	"github.com/darkden-lab/argus/backend/internal/notifications/channels"
)

// Router routes incoming notification events to the appropriate channels based
// on user preferences. It also stores notifications in the database.
type Router struct {
	notifStore *NotificationStore
	prefStore  *PreferencesStore
	chanStore  *ChannelStore
	channels   map[string]channels.Channel // channel ID -> Channel instance
}

// NewRouter creates a Router. Call LoadChannels() to initialize channel instances.
func NewRouter(notifStore *NotificationStore, prefStore *PreferencesStore, chanStore *ChannelStore) *Router {
	return &Router{
		notifStore: notifStore,
		prefStore:  prefStore,
		chanStore:  chanStore,
		channels:   make(map[string]channels.Channel),
	}
}

// RegisterChannel registers a Channel instance by ID for event delivery.
func (r *Router) RegisterChannel(id string, ch channels.Channel) {
	r.channels[id] = ch
}

// GetChannels returns the registered channels map. Used by DigestAggregator.
func (r *Router) GetChannels() map[string]channels.Channel {
	return r.channels
}

// Route processes a notification event: stores it for all matching users and
// dispatches it to the configured channels based on their preferences.
func (r *Router) Route(ctx context.Context, event Event) {
	if r.prefStore == nil || r.prefStore.pool == nil {
		log.Printf("notifications: router has no database connection, skipping event %s", event.ID)
		return
	}

	// Find all users who have preferences for this category
	prefs, err := r.prefStore.GetByCategory(ctx, string(event.Category))
	if err != nil {
		log.Printf("notifications: failed to get preferences for category %s: %v", event.Category, err)
		return
	}

	// Group preferences by user
	userPrefs := make(map[string][]Preference)
	for _, p := range prefs {
		userPrefs[p.UserID] = append(userPrefs[p.UserID], p)
	}

	for userID, prefs := range userPrefs {
		var sentChannels []string

		for _, pref := range prefs {
			if !pref.Enabled || pref.Frequency == "none" {
				continue
			}

			// For digest frequencies, skip realtime delivery (digest aggregator handles these)
			if pref.Frequency == "daily" || pref.Frequency == "weekly" {
				continue
			}

			if pref.ChannelID != nil {
				ch, ok := r.channels[*pref.ChannelID]
				if !ok {
					continue
				}

				msg := channels.Message{
					ID:        event.ID,
					Topic:     event.Topic,
					Category:  string(event.Category),
					Severity:  string(event.Severity),
					Title:     event.Title,
					Body:      event.Body,
					Metadata:  event.Metadata,
					Timestamp: event.Timestamp,
				}

				if err := ch.Send(msg, []string{userID}); err != nil {
					log.Printf("notifications: failed to send to channel %s for user %s: %v",
						*pref.ChannelID, userID, err)
					continue
				}
				sentChannels = append(sentChannels, ch.Type())
			}
		}

		// Store notification for the user's in-app history
		n := &Notification{
			UserID:       userID,
			Category:     string(event.Category),
			Severity:     string(event.Severity),
			Title:        event.Title,
			Body:         event.Body,
			Metadata:     event.Metadata,
			ChannelsSent: sentChannels,
		}
		if n.Metadata == nil {
			n.Metadata = json.RawMessage("{}")
		}
		if n.ChannelsSent == nil {
			n.ChannelsSent = []string{}
		}

		if err := r.notifStore.Insert(ctx, n); err != nil {
			log.Printf("notifications: failed to store notification for user %s: %v", userID, err)
		}
	}
}
