package channels

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// TeamsConfig holds the configuration for a Microsoft Teams webhook channel.
type TeamsConfig struct {
	WebhookURL string `json:"webhook_url"`
}

// TeamsChannel sends notifications via MS Teams Incoming Webhooks using
// Adaptive Cards format.
type TeamsChannel struct {
	name   string
	config TeamsConfig
	client *http.Client
}

// NewTeamsChannel creates a TeamsChannel from the given config.
func NewTeamsChannel(name string, config TeamsConfig) (*TeamsChannel, error) {
	if config.WebhookURL == "" {
		return nil, fmt.Errorf("webhook_url is required for Teams channel")
	}
	return &TeamsChannel{
		name:   name,
		config: config,
		client: &http.Client{},
	}, nil
}

func (c *TeamsChannel) Send(msg Message, _ []string) error {
	payload := buildTeamsPayload(msg)

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal teams payload: %w", err)
	}

	resp, err := c.client.Post(c.config.WebhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("teams webhook request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("teams webhook returned status %d", resp.StatusCode)
	}
	return nil
}

func (c *TeamsChannel) Name() string { return c.name }
func (c *TeamsChannel) Type() string { return "teams" }

func buildTeamsPayload(msg Message) map[string]interface{} {
	color := teamsSeverityColor(msg.Severity)

	return map[string]interface{}{
		"type": "message",
		"attachments": []map[string]interface{}{
			{
				"contentType": "application/vnd.microsoft.card.adaptive",
				"content": map[string]interface{}{
					"$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
					"type":    "AdaptiveCard",
					"version": "1.4",
					"body": []map[string]interface{}{
						{
							"type":  "Container",
							"style": color,
							"bleed": true,
							"items": []map[string]interface{}{
								{
									"type":   "TextBlock",
									"text":   msg.Title,
									"weight": "Bolder",
									"size":   "Medium",
									"color":  "Default",
								},
							},
						},
						{
							"type": "TextBlock",
							"text": msg.Body,
							"wrap": true,
						},
						{
							"type":      "ColumnSet",
							"separator": true,
							"columns": []map[string]interface{}{
								{
									"type":  "Column",
									"width": "auto",
									"items": []map[string]interface{}{
										{
											"type":     "TextBlock",
											"text":     fmt.Sprintf("**Category:** %s", msg.Category),
											"isSubtle": true,
											"size":     "Small",
										},
									},
								},
								{
									"type":  "Column",
									"width": "auto",
									"items": []map[string]interface{}{
										{
											"type":     "TextBlock",
											"text":     fmt.Sprintf("**Severity:** %s", strings.ToUpper(msg.Severity)),
											"isSubtle": true,
											"size":     "Small",
										},
									},
								},
								{
									"type":  "Column",
									"width": "auto",
									"items": []map[string]interface{}{
										{
											"type":     "TextBlock",
											"text":     msg.Timestamp.Format("2006-01-02 15:04:05 UTC"),
											"isSubtle": true,
											"size":     "Small",
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}
}

func teamsSeverityColor(severity string) string {
	switch severity {
	case "critical":
		return "attention"
	case "warning":
		return "warning"
	default:
		return "accent"
	}
}
