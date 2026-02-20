package channels

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
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

func (c *SlackChannel) Send(msg Message, _ []string) error {
	payload := buildSlackPayload(msg)

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

func buildSlackPayload(msg Message) map[string]interface{} {
	emoji := severityEmoji(msg.Severity)
	color := severityColor(msg.Severity)

	return map[string]interface{}{
		"blocks": []map[string]interface{}{
			{
				"type": "header",
				"text": map[string]interface{}{
					"type": "plain_text",
					"text": fmt.Sprintf("%s %s", emoji, msg.Title),
				},
			},
			{
				"type": "section",
				"text": map[string]interface{}{
					"type": "mrkdwn",
					"text": msg.Body,
				},
			},
			{
				"type": "context",
				"elements": []map[string]interface{}{
					{
						"type": "mrkdwn",
						"text": fmt.Sprintf("*Category:* %s | *Severity:* %s | *Time:* %s",
							msg.Category,
							strings.ToUpper(msg.Severity),
							msg.Timestamp.Format("2006-01-02 15:04:05 UTC")),
					},
				},
			},
		},
		"attachments": []map[string]interface{}{
			{"color": color},
		},
	}
}

func severityEmoji(severity string) string {
	switch severity {
	case "critical":
		return "\xF0\x9F\x94\xB4" // red circle
	case "warning":
		return "\xF0\x9F\x9F\xA1" // yellow circle
	default:
		return "\xF0\x9F\x94\xB5" // blue circle
	}
}

func severityColor(severity string) string {
	switch severity {
	case "critical":
		return "#ef4444"
	case "warning":
		return "#f59e0b"
	default:
		return "#3b82f6"
	}
}
