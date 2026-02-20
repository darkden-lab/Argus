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

// Ollama implements ai.LLMProvider using the Ollama HTTP API for local models.
type Ollama struct {
	baseURL string
	model   string
	client  *http.Client
}

// NewOllama creates a new Ollama provider.
func NewOllama(baseURL, model string) *Ollama {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	if model == "" {
		model = "llama3.1"
	}
	return &Ollama{
		baseURL: strings.TrimRight(baseURL, "/"),
		model:   model,
		client:  &http.Client{},
	}
}

func (o *Ollama) Name() string { return "ollama" }

type ollamaRequest struct {
	Model    string       `json:"model"`
	Messages []ollamaMsg  `json:"messages"`
	Tools    []ollamaTool `json:"tools,omitempty"`
	Stream   bool         `json:"stream"`
	Options  *ollamaOpts  `json:"options,omitempty"`
}

type ollamaMsg struct {
	Role       string          `json:"role"`
	Content    string          `json:"content"`
	ToolCalls  []ollamaToolCall `json:"tool_calls,omitempty"`
}

type ollamaToolCall struct {
	Function struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	} `json:"function"`
}

type ollamaTool struct {
	Type     string `json:"type"`
	Function struct {
		Name        string       `json:"name"`
		Description string       `json:"description"`
		Parameters  ai.ToolParams `json:"parameters"`
	} `json:"function"`
}

type ollamaOpts struct {
	Temperature float64 `json:"temperature,omitempty"`
	NumPredict  int     `json:"num_predict,omitempty"`
}

type ollamaResponse struct {
	Message struct {
		Role      string           `json:"role"`
		Content   string           `json:"content"`
		ToolCalls []ollamaToolCall `json:"tool_calls,omitempty"`
	} `json:"message"`
	Done               bool `json:"done"`
	TotalDuration      int  `json:"total_duration"`
	PromptEvalCount    int  `json:"prompt_eval_count"`
	EvalCount          int  `json:"eval_count"`
}

func (o *Ollama) Chat(ctx context.Context, req ai.ChatRequest) (*ai.ChatResponse, error) {
	body := o.buildRequest(req)
	body.Stream = false

	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("ollama: marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/api/chat", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("ollama: create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("ollama: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama: API error %d: %s", resp.StatusCode, string(respBody))
	}

	var or ollamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&or); err != nil {
		return nil, fmt.Errorf("ollama: decode: %w", err)
	}

	msg := ai.Message{
		Role:    ai.RoleAssistant,
		Content: or.Message.Content,
	}
	for _, tc := range or.Message.ToolCalls {
		msg.ToolCalls = append(msg.ToolCalls, ai.ToolCall{
			Name:      tc.Function.Name,
			Arguments: string(tc.Function.Arguments),
		})
	}

	finishReason := "stop"
	if len(msg.ToolCalls) > 0 {
		finishReason = "tool_calls"
	}

	return &ai.ChatResponse{
		Message:      msg,
		FinishReason: finishReason,
		Usage: ai.Usage{
			PromptTokens:     or.PromptEvalCount,
			CompletionTokens: or.EvalCount,
			TotalTokens:      or.PromptEvalCount + or.EvalCount,
		},
	}, nil
}

func (o *Ollama) ChatStream(ctx context.Context, req ai.ChatRequest) (ai.StreamReader, error) {
	body := o.buildRequest(req)
	body.Stream = true

	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("ollama: marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/api/chat", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("ollama: create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("ollama: stream failed: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("ollama: API error %d: %s", resp.StatusCode, string(respBody))
	}

	return &ollamaStreamReader{body: resp.Body, decoder: json.NewDecoder(resp.Body)}, nil
}

func (o *Ollama) Embed(ctx context.Context, req ai.EmbedRequest) (*ai.EmbedResponse, error) {
	model := req.Model
	if model == "" {
		model = o.model
	}

	// Ollama embeddings endpoint accepts one input at a time
	var embeddings [][]float32
	for _, input := range req.Input {
		body := struct {
			Model string `json:"model"`
			Input string `json:"input"`
		}{Model: model, Input: input}

		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("ollama: marshal embed: %w", err)
		}

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/api/embed", bytes.NewReader(data))
		if err != nil {
			return nil, fmt.Errorf("ollama: create embed request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := o.client.Do(httpReq)
		if err != nil {
			return nil, fmt.Errorf("ollama: embed request failed: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			respBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("ollama: embed API error %d: %s", resp.StatusCode, string(respBody))
		}

		var er struct {
			Embeddings [][]float32 `json:"embeddings"`
		}
		err = json.NewDecoder(resp.Body).Decode(&er)
		resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("ollama: decode embed: %w", err)
		}

		if len(er.Embeddings) > 0 {
			embeddings = append(embeddings, er.Embeddings[0])
		}
	}

	return &ai.EmbedResponse{Embeddings: embeddings}, nil
}

func (o *Ollama) buildRequest(req ai.ChatRequest) ollamaRequest {
	or := ollamaRequest{
		Model: o.model,
	}
	if req.Model != "" {
		or.Model = req.Model
	}
	if req.MaxTokens > 0 || req.Temperature > 0 {
		or.Options = &ollamaOpts{
			Temperature: req.Temperature,
			NumPredict:  req.MaxTokens,
		}
	}

	for _, msg := range req.Messages {
		om := ollamaMsg{Role: string(msg.Role), Content: msg.Content}
		for _, tc := range msg.ToolCalls {
			om.ToolCalls = append(om.ToolCalls, ollamaToolCall{
				Function: struct {
					Name      string          `json:"name"`
					Arguments json.RawMessage `json:"arguments"`
				}{Name: tc.Name, Arguments: json.RawMessage(tc.Arguments)},
			})
		}
		or.Messages = append(or.Messages, om)
	}

	for _, t := range req.Tools {
		ot := ollamaTool{Type: "function"}
		ot.Function.Name = t.Name
		ot.Function.Description = t.Description
		ot.Function.Parameters = t.Parameters
		or.Tools = append(or.Tools, ot)
	}

	return or
}

type ollamaStreamReader struct {
	body    io.ReadCloser
	decoder *json.Decoder
}

func (r *ollamaStreamReader) Next() (*ai.StreamDelta, error) {
	var resp ollamaResponse
	if err := r.decoder.Decode(&resp); err != nil {
		if err == io.EOF {
			return nil, io.EOF
		}
		return nil, err
	}

	if resp.Done {
		return nil, io.EOF
	}

	delta := &ai.StreamDelta{
		Content: resp.Message.Content,
	}
	for _, tc := range resp.Message.ToolCalls {
		delta.ToolCalls = append(delta.ToolCalls, ai.ToolCall{
			Name:      tc.Function.Name,
			Arguments: string(tc.Function.Arguments),
		})
	}

	return delta, nil
}

func (r *ollamaStreamReader) Close() error {
	return r.body.Close()
}
