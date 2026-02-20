package channels

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/k8s-dashboard/backend/internal/notifications"
)

// SlackConfig holds the configuration for a Slack webhook channel.
type SlackConfig struct {
	WebhookURL string `json:"webhook_url"`
}

// SlackChannel sends notifications via Slack Incoming Webhooks using Block Kit.
type SlackChannel struct {
	name   string
	config SlackConfig
	client *http.Client
}

// NewSlackChannel creates a SlackChannel from the given config.
func NewSlackChannel(name string, config SlackConfig) (*SlackChannel, error) {
	if config.WebhookURL == "" {
		return nil, fmt.Errorf("webhook_url is required for Slack channel")
	}
	return &SlackChannel{
		name:   name,
		config: config,
		client: &http.Client{},
	}, nil
}

func (c *SlackChannel) Send(event notifications.Event, _ []string) error {
	payload := buildSlackPayload(event)

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal slack payload: %w", err)
	}

	resp, err := c.client.Post(c.config.WebhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("slack webhook request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("slack webhook returned status %d", resp.StatusCode)
	}
	return nil
}

func (c *SlackChannel) Name() string { return c.name }
func (c *SlackChannel) Type() string { return "slack" }

func buildSlackPayload(event notifications.Event) map[string]interface{} {
	emoji := severityEmoji(event.Severity)
	color := severityColor(event.Severity)

	return map[string]interface{}{
		"blocks": []map[string]interface{}{
			{
				"type": "header",
				"text": map[string]interface{}{
					"type": "plain_text",
					"text": fmt.Sprintf("%s %s", emoji, event.Title),
				},
			},
			{
				"type": "section",
				"text": map[string]interface{}{
					"type": "mrkdwn",
					"text": event.Body,
				},
			},
			{
				"type": "context",
				"elements": []map[string]interface{}{
					{
						"type": "mrkdwn",
						"text": fmt.Sprintf("*Category:* %s | *Severity:* %s | *Time:* %s",
							event.Category,
							strings.ToUpper(string(event.Severity)),
							event.Timestamp.Format("2006-01-02 15:04:05 UTC")),
					},
				},
			},
		},
		"attachments": []map[string]interface{}{
			{"color": color},
		},
	}
}

func severityEmoji(s notifications.Severity) string {
	switch s {
	case notifications.SeverityCritical:
		return "\xF0\x9F\x94\xB4" // red circle
	case notifications.SeverityWarning:
		return "\xF0\x9F\x9F\xA1" // yellow circle
	default:
		return "\xF0\x9F\x94\xB5" // blue circle
	}
}

func severityColor(s notifications.Severity) string {
	switch s {
	case notifications.SeverityCritical:
		return "#ef4444"
	case notifications.SeverityWarning:
		return "#f59e0b"
	default:
		return "#3b82f6"
	}
}
