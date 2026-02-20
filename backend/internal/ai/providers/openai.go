package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/darkden-lab/argus/backend/internal/ai"
)

const openaiAPIURL = "https://api.openai.com/v1"

// OpenAI implements ai.LLMProvider using the OpenAI Chat Completions API.
type OpenAI struct {
	apiKey  string
	model   string
	baseURL string
	client  *http.Client
}

// NewOpenAI creates a new OpenAI provider.
func NewOpenAI(apiKey, model, baseURL string) *OpenAI {
	if model == "" {
		model = "gpt-4o"
	}
	if baseURL == "" {
		baseURL = openaiAPIURL
	}
	return &OpenAI{
		apiKey:  apiKey,
		model:   model,
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{},
	}
}

func (o *OpenAI) Name() string { return "openai" }

// OpenAI API request/response types
type openaiRequest struct {
	Model       string           `json:"model"`
	Messages    []openaiMsg      `json:"messages"`
	Tools       []openaiTool     `json:"tools,omitempty"`
	MaxTokens   int              `json:"max_tokens,omitempty"`
	Temperature float64          `json:"temperature,omitempty"`
	Stream      bool             `json:"stream,omitempty"`
}

type openaiMsg struct {
	Role       string         `json:"role"`
	Content    string         `json:"content,omitempty"`
	ToolCalls  []openaiToolCall `json:"tool_calls,omitempty"`
	ToolCallID string         `json:"tool_call_id,omitempty"`
}

type openaiToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type openaiTool struct {
	Type     string `json:"type"`
	Function struct {
		Name        string       `json:"name"`
		Description string       `json:"description"`
		Parameters  ai.ToolParams `json:"parameters"`
	} `json:"function"`
}

type openaiResponse struct {
	ID      string `json:"id"`
	Choices []struct {
		Message      openaiMsg `json:"message"`
		FinishReason string    `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

type openaiEmbedResponse struct {
	Data  []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
	Usage struct {
		PromptTokens int `json:"prompt_tokens"`
		TotalTokens  int `json:"total_tokens"`
	} `json:"usage"`
}

func (o *OpenAI) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {
	body := o.buildRequest(req)
	body.Stream = false

	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("openai: marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("openai: create request: %w", err)
	}
	o.setHeaders(httpReq)

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("openai: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("openai: API error %d: %s", resp.StatusCode, string(respBody))
	}

	var or openaiResponse
	if err := json.NewDecoder(resp.Body).Decode(&or); err != nil {
		return nil, fmt.Errorf("openai: decode: %w", err)
	}

	if len(or.Choices) == 0 {
		return nil, fmt.Errorf("openai: no choices in response")
	}

	choice := or.Choices[0]
	msg := ai.Message{
		Role:    ai.RoleAssistant,
		Content: choice.Message.Content,
	}
	for _, tc := range choice.Message.ToolCalls {
		msg.ToolCalls = append(msg.ToolCalls, ai.ToolCall{
			ID:        tc.ID,
			Name:      tc.Function.Name,
			Arguments: tc.Function.Arguments,
		})
	}

	finishReason := "stop"
	if choice.FinishReason == "tool_calls" {
		finishReason = "tool_calls"
	} else if choice.FinishReason == "length" {
		finishReason = "length"
	}

	return &ai.ChatResponse{
		Message:      msg,
		FinishReason: finishReason,
		Usage: ai.Usage{
			PromptTokens:     or.Usage.PromptTokens,
			CompletionTokens: or.Usage.CompletionTokens,
			TotalTokens:      or.Usage.TotalTokens,
		},
	}, nil
}

func (o *OpenAI) ChatStream(ctx context.Context, req ai.ChatRequest) (ai.StreamReader, error) {
	body := o.buildRequest(req)
	body.Stream = true

	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("openai: marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("openai: create request: %w", err)
	}
	o.setHeaders(httpReq)

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("openai: stream failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("openai: API error %d: %s", resp.StatusCode, string(respBody))
	}

	return &openaiStreamReader{body: resp.Body}, nil
}

func (o *OpenAI) Embed(ctx context.Context, req ai.EmbedRequest) (*ai.EmbedResponse, error) {
	model := req.Model
	if model == "" {
		model = "text-embedding-3-small"
	}

	body := struct {
		Input []string `json:"input"`
		Model string   `json:"model"`
	}{Input: req.Input, Model: model}

	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("openai: marshal embed: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/embeddings", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("openai: create embed request: %w", err)
	}
	o.setHeaders(httpReq)

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("openai: embed request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("openai: embed API error %d: %s", resp.StatusCode, string(respBody))
	}

	var er openaiEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&er); err != nil {
		return nil, fmt.Errorf("openai: decode embed: %w", err)
	}

	embeddings := make([][]float32, len(er.Data))
	for i, d := range er.Data {
		embeddings[i] = d.Embedding
	}

	return &ai.EmbedResponse{
		Embeddings: embeddings,
		Usage: ai.Usage{
			PromptTokens: er.Usage.PromptTokens,
			TotalTokens:  er.Usage.TotalTokens,
		},
	}, nil
}

func (o *OpenAI) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+o.apiKey)
}

func (o *OpenAI) buildRequest(req ai.ChatRequest) openaiRequest {
	or := openaiRequest{
		Model:       o.model,
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
	}
	if req.Model != "" {
		or.Model = req.Model
	}

	for _, msg := range req.Messages {
		om := openaiMsg{Role: string(msg.Role), Content: msg.Content}
		if msg.ToolCallID != "" {
			om.ToolCallID = msg.ToolCallID
		}
		for _, tc := range msg.ToolCalls {
			om.ToolCalls = append(om.ToolCalls, openaiToolCall{
				ID:   tc.ID,
				Type: "function",
				Function: struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				}{Name: tc.Name, Arguments: tc.Arguments},
			})
		}
		or.Messages = append(or.Messages, om)
	}

	for _, t := range req.Tools {
		ot := openaiTool{Type: "function"}
		ot.Function.Name = t.Name
		ot.Function.Description = t.Description
		ot.Function.Parameters = t.Parameters
		or.Tools = append(or.Tools, ot)
	}

	return or
}

// openaiStreamReader implements ai.StreamReader for OpenAI SSE streams.
type openaiStreamReader struct {
	body io.ReadCloser
}

func (r *openaiStreamReader) Next() (*ai.StreamDelta, error) {
	buf := make([]byte, 0, 4096)
	single := make([]byte, 1)

	for {
		buf = buf[:0]
		for {
			_, err := r.body.Read(single)
			if err != nil {
				return nil, err
			}
			if single[0] == '\n' {
				break
			}
			buf = append(buf, single[0])
		}

		line := strings.TrimSpace(string(buf))
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			return nil, io.EOF
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string           `json:"content"`
					ToolCalls []openaiToolCall  `json:"tool_calls"`
				} `json:"delta"`
				FinishReason *string `json:"finish_reason"`
			} `json:"choices"`
		}

		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if len(chunk.Choices) == 0 {
			continue
		}

		choice := chunk.Choices[0]
		delta := &ai.StreamDelta{}

		if choice.Delta.Content != "" {
			delta.Content = choice.Delta.Content
		}
		for _, tc := range choice.Delta.ToolCalls {
			delta.ToolCalls = append(delta.ToolCalls, ai.ToolCall{
				ID:        tc.ID,
				Name:      tc.Function.Name,
				Arguments: tc.Function.Arguments,
			})
		}
		if choice.FinishReason != nil {
			delta.FinishReason = *choice.FinishReason
		}

		if delta.Content != "" || len(delta.ToolCalls) > 0 || delta.FinishReason != "" {
			return delta, nil
		}
	}
}

func (r *openaiStreamReader) Close() error {
	return r.body.Close()
}
