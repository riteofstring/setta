package managedllm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/realtime"
)

type captureBroadcaster struct {
	mu       sync.Mutex
	messages []realtime.LLMStreamingResponseMessage
}

func (c *captureBroadcaster) BroadcastJSON(_ context.Context, message any, _ realtime.Selection) (int, error) {
	typed, ok := message.(realtime.LLMStreamingResponseMessage)
	if !ok {
		return 0, nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.messages = append(c.messages, typed)
	return 1, nil
}

func (c *captureBroadcaster) Count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.messages)
}

func TestExecutorExecuteStreamsManagedChatAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Fatalf("unexpected auth header %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
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
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	result, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			BaseURL:   server.URL + "/v1",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		RequestParams: map[string]any{
			"temperature": 0.2,
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
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
	})
	if err != nil {
		t.Fatalf("execute managed llm stream: %v", err)
	}

	state, err := live.GetLiveChatState(run.ID)
	if err != nil {
		t.Fatalf("get live state: %v", err)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected finalized live state, got %#v", state)
	}
	if len(state.Messages) != 2 {
		t.Fatalf("expected user and assistant messages, got %#v", state.Messages)
	}
	if assistantText(state.Messages[1]) != "Hello world" {
		t.Fatalf("unexpected assistant text %#v", state.Messages[1])
	}
	if broadcaster.Count() != 5 {
		t.Fatalf("expected 5 streaming broadcasts, got %d", broadcaster.Count())
	}

	messages, ok := result.Outputs["messages"].([]any)
	if !ok || len(messages) != 2 {
		t.Fatalf("expected two output messages, got %#v", result.Outputs["messages"])
	}
	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok || int(usage["prompt_tokens"].(float64)) != 11 {
		t.Fatalf("unexpected usage payload %#v", result.Outputs["usage"])
	}

	if seenRequest["model"] != "gpt-4o-mini" {
		t.Fatalf("unexpected provider model %#v", seenRequest["model"])
	}
	if seenRequest["stream"] != true {
		t.Fatalf("expected provider stream=true, got %#v", seenRequest["stream"])
	}
	streamOptions, ok := seenRequest["stream_options"].(map[string]any)
	if !ok || streamOptions["include_usage"] != true {
		t.Fatalf("unexpected stream options %#v", seenRequest["stream_options"])
	}
	if seenRequest["temperature"] != 0.2 {
		t.Fatalf("expected request param passthrough, got %#v", seenRequest["temperature"])
	}
	providerMessages, ok := seenRequest["messages"].([]any)
	if !ok || len(providerMessages) != 2 {
		t.Fatalf("unexpected provider messages %#v", seenRequest["messages"])
	}
	first, ok := providerMessages[0].(map[string]any)
	if !ok || first["role"] != "system" || first["content"] != "System prompt" {
		t.Fatalf("unexpected system message %#v", providerMessages[0])
	}
}

func TestExecutorExecuteReturnsPartialResultOnCancellation(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Partial\"}}]}\n\n")
		flusher.Flush()
		<-r.Context().Done()
	}))
	defer server.Close()

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{
		Live:       live,
		HTTPClient: server.Client(),
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	type executionOutcome struct {
		result agentruns.ExecutionResult
		err    error
	}
	outcomeCh := make(chan executionOutcome, 1)
	go func() {
		result, err := executor.Execute(ctx, agentruns.ExecutionRequest{
			Run: run,
			LLMConfig: llmconfig.Config{
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
			APIKeys: map[string]string{
				"OPENAI_API_KEY": "secret",
			},
			SystemPrompt:    "System prompt",
			ProjectConfigID: "project-alpha",
			ChatID:          "chat-alpha",
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
		})
		outcomeCh <- executionOutcome{result: result, err: err}
	}()

	waitForCondition(t, 2*time.Second, func() bool {
		state, err := live.GetLiveChatState(run.ID)
		if err != nil || state == nil || len(state.Messages) != 2 {
			return false
		}
		return assistantText(state.Messages[1]) == "Partial"
	})
	cancel()

	select {
	case outcome := <-outcomeCh:
		if !errors.Is(outcome.err, context.Canceled) {
			t.Fatalf("expected context canceled, got %v", outcome.err)
		}
		messages, ok := outcome.result.Outputs["messages"].([]any)
		if !ok || len(messages) != 2 {
			t.Fatalf("expected partial result messages, got %#v", outcome.result.Outputs["messages"])
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for cancelled execution")
	}

	state, err := live.GetLiveChatState(run.ID)
	if err != nil {
		t.Fatalf("get live state after cancel: %v", err)
	}
	if state == nil || state.WaitingForResponse {
		t.Fatalf("expected cancelled live state to clear waiting flag, got %#v", state)
	}
	if assistantText(state.Messages[1]) != "Partial" {
		t.Fatalf("unexpected partial assistant state %#v", state.Messages[1])
	}
	if broadcaster.Count() != 4 {
		t.Fatalf("expected start, delta, stop, finalized broadcasts, got %d", broadcaster.Count())
	}
}

func TestExecutorRejectsAttachments(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	_, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Hello"},
					},
					"attachments": []any{
						map[string]any{"id": "attachment-1"},
					},
				},
			},
		},
	})
	if !errors.Is(err, ErrAttachmentsUnsupported) {
		t.Fatalf("expected attachments unsupported, got %v", err)
	}
}

func TestExecutorRejectsThinkingWithoutExplicitProviderConfig(t *testing.T) {
	t.Parallel()

	executor := NewExecutor(ExecutorOptions{})
	_, err := executor.Execute(context.Background(), agentruns.ExecutionRequest{
		Run: agentruns.Run{ID: "run-alpha"},
		LLMConfig: llmconfig.Config{
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": "secret",
		},
		SystemPrompt: "System prompt",
		ChatID:       "chat-alpha",
		Thinking:     true,
		Inputs: map[string]any{
			"runType": "llm_chat",
		},
	})
	if !errors.Is(err, ErrReasoningUnsupported) {
		t.Fatalf("expected reasoning unsupported, got %v", err)
	}
}

func newManagedChatTestRun() agentruns.Run {
	now := time.Date(2026, 3, 9, 22, 0, 0, 0, time.UTC)
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         "llm_chat",
		"chatId":          "chat-alpha",
		"projectConfigId": "project-alpha",
		"sectionId":       "section-chat",
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
	}, now)
	run.ID = "run-alpha"
	run.Status = agentruns.RunStatusRunning
	return run
}

func assistantText(message map[string]any) string {
	content, ok := message["content"].([]any)
	if !ok || len(content) == 0 {
		return ""
	}
	block, ok := content[0].(map[string]any)
	if !ok {
		return ""
	}
	text, _ := block["text"].(string)
	return text
}

func waitForCondition(t *testing.T, timeout time.Duration, check func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for condition")
}

func testStringPtr(value string) *string {
	return &value
}
