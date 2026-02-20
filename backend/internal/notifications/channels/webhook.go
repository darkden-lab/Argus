package channels

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"text/template"

	"github.com/k8s-dashboard/backend/internal/notifications"
)

// WebhookConfig holds the configuration for a generic webhook channel.
type WebhookConfig struct {
	URL             string            `json:"url"`
	Method          string            `json:"method"`           // GET, POST, PUT (default POST)
	Headers         map[string]string `json:"headers"`          // custom headers
	PayloadTemplate string            `json:"payload_template"` // Go template for JSON body
}

// WebhookChannel sends notifications via a generic HTTP webhook with a
// configurable payload template.
type WebhookChannel struct {
	name     string
	config   WebhookConfig
	client   *http.Client
	tmpl     *template.Template
}

// NewWebhookChannel creates a WebhookChannel from the given config.
func NewWebhookChannel(name string, config WebhookConfig) (*WebhookChannel, error) {
	if config.URL == "" {
		return nil, fmt.Errorf("url is required for webhook channel")
	}
	if config.Method == "" {
		config.Method = "POST"
	}
	config.Method = strings.ToUpper(config.Method)

	ch := &WebhookChannel{
		name:   name,
		config: config,
		client: &http.Client{},
	}

	if config.PayloadTemplate != "" {
		tmpl, err := template.New("webhook").Parse(config.PayloadTemplate)
		if err != nil {
			return nil, fmt.Errorf("invalid payload template: %w", err)
		}
		ch.tmpl = tmpl
	}

	return ch, nil
}

func (c *WebhookChannel) Send(event notifications.Event, _ []string) error {
	var body []byte
	var err error

	if c.tmpl != nil {
		var buf bytes.Buffer
		if err := c.tmpl.Execute(&buf, event); err != nil {
			return fmt.Errorf("execute payload template: %w", err)
		}
		body = buf.Bytes()
	} else {
		body, err = json.Marshal(defaultWebhookPayload(event))
		if err != nil {
			return fmt.Errorf("marshal default payload: %w", err)
		}
	}

	req, err := http.NewRequest(c.config.Method, c.config.URL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	for k, v := range c.config.Headers {
		req.Header.Set(k, v)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}
	return nil
}

func (c *WebhookChannel) Name() string { return c.name }
func (c *WebhookChannel) Type() string { return "webhook" }

func defaultWebhookPayload(event notifications.Event) map[string]interface{} {
	return map[string]interface{}{
		"id":        event.ID,
		"topic":     event.Topic,
		"category":  string(event.Category),
		"severity":  string(event.Severity),
		"title":     event.Title,
		"body":      event.Body,
		"metadata":  event.Metadata,
		"timestamp": event.Timestamp.Format("2006-01-02T15:04:05Z"),
	}
}
