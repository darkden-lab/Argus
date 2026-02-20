package notifications

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/darkden-lab/argus/backend/internal/notifications/channels"
)

// DigestAggregator collects notification events and periodically sends
// aggregated digests via email or other channels. It supports daily and
// weekly digest frequencies.
type DigestAggregator struct {
	prefStore  *PreferencesStore
	chanStore  *ChannelStore
	notifStore *NotificationStore
	channels   map[string]channels.Channel

	mu      sync.Mutex
	buffer  map[string][]Event // userID -> events pending digest
	ctx     context.Context
	cancel  context.CancelFunc
}

// NewDigestAggregator creates a new DigestAggregator.
func NewDigestAggregator(
	prefStore *PreferencesStore,
	chanStore *ChannelStore,
	notifStore *NotificationStore,
	chs map[string]channels.Channel,
) *DigestAggregator {
	ctx, cancel := context.WithCancel(context.Background())
	return &DigestAggregator{
		prefStore:  prefStore,
		chanStore:  chanStore,
		notifStore: notifStore,
		channels:   chs,
		buffer:     make(map[string][]Event),
		ctx:        ctx,
		cancel:     cancel,
	}
}

// AddEvent buffers an event for future digest delivery.
func (d *DigestAggregator) AddEvent(userID string, event Event) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.buffer[userID] = append(d.buffer[userID], event)
}

// Start begins the digest tick loops: daily at midnight UTC and weekly on
// Mondays at midnight UTC.
func (d *DigestAggregator) Start() {
	go d.tickLoop("daily", 24*time.Hour)
	go d.tickLoop("weekly", 7*24*time.Hour)
	log.Println("notifications: digest aggregator started")
}

// Stop cancels the digest loops.
func (d *DigestAggregator) Stop() {
	d.cancel()
}

func (d *DigestAggregator) tickLoop(frequency string, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-d.ctx.Done():
			return
		case <-ticker.C:
			d.flush(frequency)
		}
	}
}

// flush drains the buffer and sends digest messages for the given frequency.
func (d *DigestAggregator) flush(frequency string) {
	d.mu.Lock()
	snapshot := make(map[string][]Event, len(d.buffer))
	for uid, events := range d.buffer {
		snapshot[uid] = events
	}
	d.buffer = make(map[string][]Event)
	d.mu.Unlock()

	for userID, events := range snapshot {
		if len(events) == 0 {
			continue
		}

		prefs, err := d.prefStore.GetByUser(d.ctx, userID)
		if err != nil {
			log.Printf("notifications: digest: failed to get prefs for user %s: %v", userID, err)
			continue
		}

		for _, pref := range prefs {
			if pref.Frequency != frequency || !pref.Enabled || pref.ChannelID == nil {
				continue
			}

			ch, ok := d.channels[*pref.ChannelID]
			if !ok {
				continue
			}

			// Filter events matching this preference's category
			var matching []Event
			for _, e := range events {
				if string(e.Category) == pref.Category {
					matching = append(matching, e)
				}
			}

			if len(matching) == 0 {
				continue
			}

			msg := buildDigestMessage(frequency, matching)
			if err := ch.Send(msg, []string{userID}); err != nil {
				log.Printf("notifications: digest: failed to send %s digest to user %s: %v",
					frequency, userID, err)
			}
		}
	}
}

func buildDigestMessage(frequency string, events []Event) channels.Message {
	title := "Your " + frequency + " notification digest"
	body := buildDigestBody(events)

	meta, _ := json.Marshal(map[string]interface{}{
		"event_count": len(events),
		"frequency":   frequency,
	})

	return channels.Message{
		ID:        "digest-" + time.Now().Format("2006-01-02"),
		Topic:     "digest." + frequency,
		Category:  "digest",
		Severity:  "info",
		Title:     title,
		Body:      body,
		Metadata:  meta,
		Timestamp: time.Now().UTC(),
	}
}

func buildDigestBody(events []Event) string {
	body := ""
	categoryCounts := make(map[Category]int)
	for _, e := range events {
		categoryCounts[e.Category]++
	}

	for cat, count := range categoryCounts {
		body += string(cat) + ": " + intToStr(count) + " events\n"
	}

	body += "\nRecent:\n"
	limit := 10
	if len(events) < limit {
		limit = len(events)
	}
	for i := 0; i < limit; i++ {
		e := events[len(events)-1-i] // most recent first
		body += "- [" + string(e.Severity) + "] " + e.Title + "\n"
	}

	return body
}

func intToStr(n int) string {
	if n == 0 {
		return "0"
	}
	if n < 10 {
		return string(rune('0' + n))
	}
	return intToStr(n/10) + string(rune('0'+n%10))
}
