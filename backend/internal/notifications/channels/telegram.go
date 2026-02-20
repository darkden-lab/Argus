package channels

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// TelegramConfig holds the configuration for a Telegram Bot channel.
type TelegramConfig struct {
	BotToken string `json:"bot_token"`
	ChatID   string `json:"chat_id"` // channel, group, or user chat ID
}

// TelegramChannel sends notifications via the Telegram Bot API.
type TelegramChannel struct {
	name    string
	config  TelegramConfig
	client  *http.Client
	baseURL string // overridable for testing
}

// NewTelegramChannel creates a TelegramChannel from the given config.
func NewTelegramChannel(name string, config TelegramConfig) (*TelegramChannel, error) {
	if config.BotToken == "" {
		return nil, fmt.Errorf("bot_token is required for Telegram channel")
	}
	if config.ChatID == "" {
		return nil, fmt.Errorf("chat_id is required for Telegram channel")
	}
	return &TelegramChannel{
		name:    name,
		config:  config,
		client:  &http.Client{},
		baseURL: "https://api.telegram.org",
	}, nil
}

func (c *TelegramChannel) Send(msg Message, _ []string) error {
	text := formatTelegramMessage(msg)

	url := fmt.Sprintf("%s/bot%s/sendMessage", c.baseURL, c.config.BotToken)

	payload := map[string]interface{}{
		"chat_id":    c.config.ChatID,
		"text":       text,
		"parse_mode": "HTML",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal telegram payload: %w", err)
	}

	resp, err := c.client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("telegram api request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("telegram api returned status %d", resp.StatusCode)
	}
	return nil
}

func (c *TelegramChannel) Name() string { return c.name }
func (c *TelegramChannel) Type() string { return "telegram" }

func formatTelegramMessage(msg Message) string {
	icon := telegramSeverityIcon(msg.Severity)

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%s <b>%s</b>\n\n", icon, msg.Title))
	sb.WriteString(msg.Body)
	sb.WriteString(fmt.Sprintf("\n\n<i>Category:</i> %s | <i>Severity:</i> %s\n",
		msg.Category,
		strings.ToUpper(msg.Severity)))
	sb.WriteString(fmt.Sprintf("<i>%s</i>", msg.Timestamp.Format("2006-01-02 15:04:05 UTC")))

	return sb.String()
}

func telegramSeverityIcon(severity string) string {
	switch severity {
	case "critical":
		return "\xE2\x9B\x94" // no entry
	case "warning":
		return "\xE2\x9A\xA0\xEF\xB8\x8F" // warning
	default:
		return "\xE2\x84\xB9\xEF\xB8\x8F" // info
	}
}
