package providers

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/darkden-lab/argus/backend/internal/ai"
)

const (
	claudeAPIURL    = "https://api.anthropic.com/v1/messages"
	claudeAPIVersion = "2023-06-01"
)

// Claude implements ai.LLMProvider using the Anthropic Messages API.
type Claude struct {
	apiKey        string
	model         string
	baseURL       string
	customHeaders map[string]string
	client        *http.Client
}

// NewClaude creates a new Claude provider.
func NewClaude(apiKey, model, baseURL string, customHeaders map[string]string) *Claude {
	if model == "" {
		model = "claude-sonnet-4-20250514"
	}
	if baseURL == "" {
		baseURL = claudeAPIURL
	}
	return &Claude{
		apiKey:        apiKey,
		model:         model,
		baseURL:       strings.TrimRight(baseURL, "/"),
		customHeaders: customHeaders,
		client:        &http.Client{Timeout: 5 * time.Minute},
	}
}

func (c *Claude) Name() string { return "claude" }

// claudeRequest is the Anthropic Messages API request body.
type claudeRequest struct {
	Model     string         `json:"model"`
	MaxTokens int            `json:"max_tokens"`
	System    string         `json:"system,omitempty"`
	Messages  []claudeMsg    `json:"messages"`
	Tools     []claudeTool   `json:"tools,omitempty"`
	Stream    bool           `json:"stream,omitempty"`
}

type claudeMsg struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"` // string or []claudeContentBlock
}

type claudeContentBlock struct {
	Type      string `json:"type"`                // "text", "tool_use", "tool_result"
	Text      string `json:"text,omitempty"`
	ID        string `json:"id,omitempty"`         // tool_use ID
	Name      string `json:"name,omitempty"`       // tool_use name
	Input     any    `json:"input,omitempty"`      // tool_use input
	ToolUseID string `json:"tool_use_id,omitempty"` // tool_result
	Content   string `json:"content,omitempty"`     // tool_result content
}

type claudeTool struct {
	Name        string       `json:"name"`
	Description string       `json:"description"`
	InputSchema ai.ToolParams `json:"input_schema"`
}

// claudeResponse is the Anthropic Messages API response.
type claudeResponse struct {
	ID           string               `json:"id"`
	Type         string               `json:"type"`
	Role         string               `json:"role"`
	Content      []claudeContentBlock `json:"content"`
	StopReason   string               `json:"stop_reason"`
	Usage        claudeUsage          `json:"usage"`
}

type claudeUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

func (c *Claude) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {
	body, err := c.buildRequest(req)
	if err != nil {
		return nil, err
	}
	body.Stream = false

	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("claude: marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("claude: create request: %w", err)
	}
	c.setHeaders(httpReq)

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("claude: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
		return nil, fmt.Errorf("claude: API error %d: %s", resp.StatusCode, string(respBody))
	}

	var cr claudeResponse
	if err := json.NewDecoder(resp.Body).Decode(&cr); err != nil {
		return nil, fmt.Errorf("claude: decode response: %w", err)
	}

	return c.toResponse(cr), nil
}

func (c *Claude) ChatStream(ctx context.Context, req ai.ChatRequest) (ai.StreamReader, error) {
	body, err := c.buildRequest(req)
	if err != nil {
		return nil, err
	}
	body.Stream = true

	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("claude: marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("claude: create request: %w", err)
	}
	c.setHeaders(httpReq)

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("claude: stream request failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
		resp.Body.Close()
		return nil, fmt.Errorf("claude: API error %d: %s", resp.StatusCode, string(respBody))
	}

	return &claudeStreamReader{body: resp.Body, scanner: bufio.NewScanner(resp.Body)}, nil
}

func (c *Claude) Embed(_ context.Context, _ ai.EmbedRequest) (*ai.EmbedResponse, error) {
	return nil, fmt.Errorf("claude: embedding not supported natively, use OpenAI or Ollama for embeddings")
}

func (c *Claude) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("x-api-key", c.apiKey)
	}
	req.Header.Set("anthropic-version", claudeAPIVersion)
	for k, v := range c.customHeaders {
		req.Header.Set(k, v)
	}
}

func (c *Claude) buildRequest(req ai.ChatRequest) (*claudeRequest, error) {
	cr := &claudeRequest{
		Model:     c.model,
		MaxTokens: req.MaxTokens,
	}
	if cr.MaxTokens <= 0 {
		cr.MaxTokens = 4096
	}
	if req.Model != "" {
		cr.Model = req.Model
	}

	for _, msg := range req.Messages {
		if msg.Role == ai.RoleSystem {
			cr.System = msg.Content
			continue
		}

		if msg.Role == ai.RoleTool {
			cr.Messages = append(cr.Messages, claudeMsg{
				Role: "user",
				Content: []claudeContentBlock{{
					Type:      "tool_result",
					ToolUseID: msg.ToolCallID,
					Content:   msg.Content,
				}},
			})
			continue
		}

		if msg.Role == ai.RoleAssistant && len(msg.ToolCalls) > 0 {
			blocks := make([]claudeContentBlock, 0, len(msg.ToolCalls)+1)
			if msg.Content != "" {
				blocks = append(blocks, claudeContentBlock{Type: "text", Text: msg.Content})
			}
			for _, tc := range msg.ToolCalls {
				var input any
				_ = json.Unmarshal([]byte(tc.Arguments), &input)
				blocks = append(blocks, claudeContentBlock{
					Type:  "tool_use",
					ID:    tc.ID,
					Name:  tc.Name,
					Input: input,
				})
			}
			cr.Messages = append(cr.Messages, claudeMsg{Role: "assistant", Content: blocks})
			continue
		}

		cr.Messages = append(cr.Messages, claudeMsg{
			Role:    string(msg.Role),
			Content: msg.Content,
		})
	}

	for _, t := range req.Tools {
		cr.Tools = append(cr.Tools, claudeTool{
			Name:        t.Name,
			Description: t.Description,
			InputSchema: t.Parameters,
		})
	}

	return cr, nil
}

func (c *Claude) toResponse(cr claudeResponse) *ai.ChatResponse {
	msg := ai.Message{Role: ai.RoleAssistant}

	var textParts []string
	for _, block := range cr.Content {
		switch block.Type {
		case "text":
			textParts = append(textParts, block.Text)
		case "tool_use":
			args, _ := json.Marshal(block.Input)
			msg.ToolCalls = append(msg.ToolCalls, ai.ToolCall{
				ID:        block.ID,
				Name:      block.Name,
				Arguments: string(args),
			})
		}
	}
	msg.Content = strings.Join(textParts, "")

	finishReason := "stop"
	if cr.StopReason == "tool_use" {
		finishReason = "tool_calls"
	} else if cr.StopReason == "max_tokens" {
		finishReason = "length"
	}

	return &ai.ChatResponse{
		Message:      msg,
		FinishReason: finishReason,
		Usage: ai.Usage{
			PromptTokens:     cr.Usage.InputTokens,
			CompletionTokens: cr.Usage.OutputTokens,
			TotalTokens:      cr.Usage.InputTokens + cr.Usage.OutputTokens,
		},
	}
}

// claudeStreamReader implements ai.StreamReader for SSE streams.
type claudeStreamReader struct {
	body            io.ReadCloser
	scanner         *bufio.Scanner
	currentToolID   string
	currentToolName string
	toolArgs        strings.Builder
}

func (r *claudeStreamReader) Next() (*ai.StreamDelta, error) {
	// Claude SSE format: "event: ...\ndata: {...}\n\n"
	for {
		if !r.scanner.Scan() {
			if err := r.scanner.Err(); err != nil {
				return nil, err
			}
			return nil, io.EOF
		}

		line := strings.TrimSpace(r.scanner.Text())
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			return nil, io.EOF
		}

		var event struct {
			Type  string `json:"type"`
			Index int    `json:"index"`
			Delta struct {
				Type        string `json:"type"`
				Text        string `json:"text"`
				PartialJSON string `json:"partial_json"`
				StopReason  string `json:"stop_reason"`
			} `json:"delta"`
			ContentBlock struct {
				Type  string `json:"type"`
				ID    string `json:"id"`
				Name  string `json:"name"`
				Input any    `json:"input"`
			} `json:"content_block"`
		}

		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event.Type {
		case "content_block_start":
			if event.ContentBlock.Type == "tool_use" {
				r.currentToolID = event.ContentBlock.ID
				r.currentToolName = event.ContentBlock.Name
				r.toolArgs.Reset()
			}
		case "content_block_delta":
			if event.Delta.Type == "text_delta" {
				return &ai.StreamDelta{Content: event.Delta.Text}, nil
			}
			if event.Delta.Type == "input_json_delta" {
				r.toolArgs.WriteString(event.Delta.PartialJSON)
			}
		case "content_block_stop":
			if r.currentToolID != "" {
				tc := ai.ToolCall{
					ID:        r.currentToolID,
					Name:      r.currentToolName,
					Arguments: r.toolArgs.String(),
				}
				r.currentToolID = ""
				r.currentToolName = ""
				r.toolArgs.Reset()
				return &ai.StreamDelta{ToolCalls: []ai.ToolCall{tc}}, nil
			}
		case "message_delta":
			if event.Delta.StopReason != "" {
				reason := "stop"
				if event.Delta.StopReason == "tool_use" {
					reason = "tool_calls"
				}
				return &ai.StreamDelta{FinishReason: reason}, nil
			}
		case "message_stop":
			return nil, io.EOF
		}
	}
}

func (r *claudeStreamReader) Close() error {
	return r.body.Close()
}
