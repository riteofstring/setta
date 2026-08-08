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

func TestExecutorExecuteStreamsGeminiManagedChatAndReturnsOutputs(t *testing.T) {
	t.Parallel()

	var seenRequest map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if handledManagedLLMModelLookupTestRequest(t, w, r) {
			return
		}
		if r.URL.Path != "/v1beta/models/gemini-2.5-pro:streamGenerateContent" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		if r.URL.RawQuery != "alt=sse" {
			t.Fatalf("unexpected query %q", r.URL.RawQuery)
		}
		if got := r.Header.Get("X-Goog-Api-Key"); got != "secret" {
			t.Fatalf("unexpected api key header %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&seenRequest); err != nil {
			t.Fatalf("decode provider request: %v", err)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			t.Fatal("expected flusher")
		}
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\"Hello\"}]}}]}\n\n")
		flusher.Flush()
		fmt.Fprint(w, "data: {\"candidates\":[{\"content\":{\"role\":\"model\",\"parts\":[{\"text\":\" world\"}]}}],\"usageMetadata\":{\"promptTokenCount\":11,\"candidatesTokenCount\":2,\"totalTokenCount\":13}}\n\n")
		flusher.Flush()
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
			Model:     "gemini-2.5-pro",
			Provider:  "gemini",
			BaseURL:   server.URL,
			APIKeyEnv: "GEMINI_API_KEY",
		},
		RequestParams: map[string]any{
			"temperature": 0.2,
		},
		APIKeys: map[string]string{
			"GEMINI_API_KEY": "secret",
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
		t.Fatalf("execute managed gemini stream: %v", err)
	}

	assertManagedChatTextStreamResult(t, live, run, broadcaster, result, "Hello world", 5, 11)

	contents, ok := seenRequest["contents"].([]any)
	if !ok || len(contents) != 1 {
		t.Fatalf("unexpected gemini contents %#v", seenRequest["contents"])
	}
	generationConfig, ok := seenRequest["generationConfig"].(map[string]any)
	if !ok || generationConfig["temperature"] != 0.2 {
		t.Fatalf("unexpected generation config %#v", seenRequest["generationConfig"])
	}
	systemInstruction, ok := seenRequest["systemInstruction"].(map[string]any)
	if !ok {
		t.Fatalf("expected system instruction, got %#v", seenRequest["systemInstruction"])
	}
	systemParts, ok := systemInstruction["parts"].([]any)
	if !ok || len(systemParts) != 1 {
		t.Fatalf("unexpected system instruction parts %#v", seenRequest["systemInstruction"])
	}
}
