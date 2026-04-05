package managedllm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
)

func TestAppendContextUsageFromRawJSONCanonicalizesProviderFields(t *testing.T) {
	t.Parallel()

	payload := appendContextUsageFromRawJSON(
		map[string]any{
			"prompt_tokens":     11,
			"completion_tokens": 2,
			"total_tokens":      13,
		},
		`{"context_window":258400,"context_used_tokens":24766}`,
	)
	if payload == nil {
		t.Fatal("expected payload")
	}
	if got := int(payload["contextWindowTokens"].(int)); got != 258400 {
		t.Fatalf("expected contextWindowTokens=258400, got %d", got)
	}
	if got := int(payload["contextUsedTokens"].(int)); got != 24766 {
		t.Fatalf("expected contextUsedTokens=24766, got %d", got)
	}
}

func TestExecutorExecuteStreamsManagedChatResolvesContextWindowFromOpenAIModelMetadata(t *testing.T) {
	t.Parallel()

	var modelLookups int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/chat/completions":
			w.Header().Set("Content-Type", "text/event-stream")
			flusher, ok := w.(http.Flusher)
			if !ok {
				t.Fatal("expected flusher")
			}
			fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"}}]}\n\n")
			flusher.Flush()
			fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\" world\"},\"finish_reason\":\"stop\"}]}\n\n")
			flusher.Flush()
			fmt.Fprint(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":11,\"completion_tokens\":2,\"total_tokens\":13}}\n\n")
			flusher.Flush()
			fmt.Fprint(w, "data: [DONE]\n\n")
		case "/v1/models/gpt-4o-mini":
			modelLookups++
			w.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(w).Encode(map[string]any{
				"id":             "gpt-4o-mini",
				"object":         "model",
				"created":        1,
				"owned_by":       "openai",
				"context_length": 128000,
			}); err != nil {
				t.Fatalf("encode model metadata: %v", err)
			}
		default:
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
	}))
	defer server.Close()

	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{
		Broadcaster: &captureBroadcaster{},
	})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), managedExecutionRequest(
		run,
		llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		map[string]string{
			"OPENAI_API_KEY": "secret",
		},
	))
	if err != nil {
		t.Fatalf("execute managed llm stream: %v", err)
	}

	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload, got %#v", result.Outputs["usage"])
	}
	if got := int(usage["contextWindowTokens"].(float64)); got != 128000 {
		t.Fatalf("expected contextWindowTokens=128000, got %d", got)
	}
	if modelLookups != 1 {
		t.Fatalf("expected exactly one model lookup, got %d", modelLookups)
	}
}

func TestExecutorExecuteStreamsGeminiManagedChatResolvesContextWindowFromModelMetadata(t *testing.T) {
	t.Parallel()

	var modelLookups int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1beta/models/gemini-2.5-pro:streamGenerateContent":
			w.Header().Set("Content-Type", "text/event-stream")
			flusher, ok := w.(http.Flusher)
			if !ok {
				t.Fatal("expected flusher")
			}
			fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Hello\"}]}}]}\n\n")
			flusher.Flush()
			fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\" world\"}]}}],\"usageMetadata\":{\"promptTokenCount\":11,\"candidatesTokenCount\":2,\"totalTokenCount\":13}}\n\n")
			flusher.Flush()
		case "/v1beta/models/gemini-2.5-pro":
			modelLookups++
			w.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(w).Encode(map[string]any{
				"name":            "models/gemini-2.5-pro",
				"displayName":     "Gemini 2.5 Pro",
				"inputTokenLimit": 1048576,
			}); err != nil {
				t.Fatalf("encode model metadata: %v", err)
			}
		default:
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
	}))
	defer server.Close()

	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{
		Broadcaster: &captureBroadcaster{},
	})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), managedExecutionRequest(
		run,
		llmconfig.Config{
			ID:        "primary",
			Model:     "gemini-2.5-pro",
			Provider:  "gemini",
			BaseURL:   server.URL,
			APIKeyEnv: "GEMINI_API_KEY",
		},
		map[string]string{
			"GEMINI_API_KEY": "secret",
		},
	))
	if err != nil {
		t.Fatalf("execute managed gemini stream: %v", err)
	}

	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload, got %#v", result.Outputs["usage"])
	}
	if got := int(usage["contextWindowTokens"].(float64)); got != 1048576 {
		t.Fatalf("expected contextWindowTokens=1048576, got %d", got)
	}
	if modelLookups != 1 {
		t.Fatalf("expected exactly one model lookup, got %d", modelLookups)
	}
}

func TestExecutorExecuteStreamsAnthropicManagedChatResolvesContextWindowFromModelMetadata(t *testing.T) {
	t.Parallel()

	var modelLookups int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/messages":
			w.Header().Set("Content-Type", "text/event-stream")
			flusher, ok := w.(http.Flusher)
			if !ok {
				t.Fatal("expected flusher")
			}
			fmt.Fprint(w, anthropicMessageStartEvent("msg-text", "claude-sonnet-4-5-20250929", 11, 0))
			flusher.Flush()
			fmt.Fprint(w, anthropicTextBlockStartEvent(0))
			flusher.Flush()
			fmt.Fprint(w, anthropicTextDeltaEvent(0, "Hello"))
			flusher.Flush()
			fmt.Fprint(w, anthropicTextDeltaEvent(0, " world"))
			flusher.Flush()
			fmt.Fprint(w, anthropicContentBlockStopEvent(0))
			flusher.Flush()
			fmt.Fprint(w, anthropicMessageDeltaEvent("end_turn", 11, 2))
			flusher.Flush()
			fmt.Fprint(w, anthropicMessageStopEvent())
			flusher.Flush()
		case "/v1/models/claude-sonnet-4-5-20250929":
			modelLookups++
			w.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(w).Encode(map[string]any{
				"id":               "claude-sonnet-4-5-20250929",
				"type":             "model",
				"display_name":     "Claude Sonnet 4.5",
				"created_at":       "2026-01-01T00:00:00Z",
				"max_input_tokens": 200000,
				"max_tokens":       64000,
			}); err != nil {
				t.Fatalf("encode model metadata: %v", err)
			}
		default:
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
	}))
	defer server.Close()

	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{
		Broadcaster: &captureBroadcaster{},
	})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), managedExecutionRequest(
		run,
		llmconfig.Config{
			ID:        "primary",
			Model:     "claude-sonnet-4-5-20250929",
			Provider:  "anthropic",
			BaseURL:   server.URL,
			APIKeyEnv: "ANTHROPIC_API_KEY",
		},
		map[string]string{
			"ANTHROPIC_API_KEY": "secret",
		},
	))
	if err != nil {
		t.Fatalf("execute managed anthropic stream: %v", err)
	}

	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload, got %#v", result.Outputs["usage"])
	}
	if got := int(usage["contextWindowTokens"].(float64)); got != 200000 {
		t.Fatalf("expected contextWindowTokens=200000, got %d", got)
	}
	if modelLookups != 1 {
		t.Fatalf("expected exactly one model lookup, got %d", modelLookups)
	}
}

func managedExecutionRequest(
	run agentruns.Run,
	config llmconfig.Config,
	apiKeys map[string]string,
) agentruns.ExecutionRequest {
	return agentruns.ExecutionRequest{
		Run:             run,
		LLMConfig:       config,
		APIKeys:         apiKeys,
		SystemPrompt:    "System prompt",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       testStringPtr("section-chat"),
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Hello from the user"},
					},
					"attachments": []any{},
				},
			},
		},
	}
}
