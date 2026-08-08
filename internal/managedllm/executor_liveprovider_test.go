//go:build liveprovider

package managedllm

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/realtime"
)

// parity-evidence: proof-mode=live-provider; evidence-tags=persisted-messages,usage,streaming-deltas,live-state-finalized
func TestManagedChatOpenAILiveProviderCompletionParity(t *testing.T) {
	apiKey := requireLiveProviderAPIKey(t, "OPENAI_API_KEY", "api.openai.com:443")

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	run.ID = "run-openai-live-provider"
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{Live: live})
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	result, err := executor.Execute(ctx, agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "gpt-4o-mini",
			Provider:  "openai",
			APIKeyEnv: "OPENAI_API_KEY",
		},
		RequestParams: map[string]any{
			"temperature": 0,
		},
		APIKeys: map[string]string{
			"OPENAI_API_KEY": apiKey,
		},
		SystemPrompt:    "Reply with exactly HELLO and nothing else.",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{
							"type": "text",
							"text": "Reply with exactly HELLO and nothing else.",
						},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute openai live-provider managed chat: %v", err)
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
	if text := strings.TrimSpace(collectAssistantText(state.Messages[1])); text != "HELLO" {
		t.Fatalf("unexpected live assistant text %q", text)
	}
	if !hasManagedTextDelta(broadcaster.Messages()) {
		t.Fatalf("expected streamed text delta broadcasts, got %#v", broadcaster.Messages())
	}

	outputMessages, ok := result.Outputs["messages"].([]any)
	if !ok || len(outputMessages) != 2 {
		t.Fatalf("expected persisted user and assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := outputMessages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", outputMessages[1])
	}
	if text := strings.TrimSpace(collectAssistantText(assistant)); text != "HELLO" {
		t.Fatalf("unexpected persisted assistant text %q", text)
	}

	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload, got %#v", result.Outputs["usage"])
	}
	assertPositiveUsageField(t, usage, "prompt_tokens")
	assertPositiveUsageField(t, usage, "completion_tokens")
	assertPositiveUsageField(t, usage, "total_tokens")
}

// parity-evidence: proof-mode=live-provider; evidence-tags=persisted-messages,usage,streaming-deltas,live-state-finalized,thinking-blocks
func TestManagedChatAnthropicLiveProviderCompletionParity(t *testing.T) {
	apiKey := requireLiveProviderAPIKey(t, "ANTHROPIC_API_KEY", "api.anthropic.com:443")

	broadcaster := &captureBroadcaster{}
	live := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatTestRun()
	run.ID = "run-anthropic-live-provider"
	live.ActivateRun(run)

	executor := NewExecutor(ExecutorOptions{Live: live})
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	result, err := executor.Execute(ctx, agentruns.ExecutionRequest{
		Run: run,
		LLMConfig: llmconfig.Config{
			ID:        "primary",
			Model:     "claude-sonnet-4-5-20250929",
			Provider:  "anthropic",
			APIKeyEnv: "ANTHROPIC_API_KEY",
		},
		RequestParams: map[string]any{
			"max_tokens": 4096,
			"thinking": map[string]any{
				"type":          "enabled",
				"budget_tokens": 1024,
			},
		},
		APIKeys: map[string]string{
			"ANTHROPIC_API_KEY": apiKey,
		},
		SystemPrompt:    "Think through the answer, then reply with exactly HELLO and nothing else.",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		Thinking:        true,
		Inputs: map[string]any{
			"runType": "llm_chat",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{
							"type": "text",
							"text": "Think through the answer, then reply with exactly HELLO and nothing else.",
						},
					},
					"attachments": []any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("execute anthropic live-provider managed chat: %v", err)
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
	if text := strings.TrimSpace(collectAssistantText(state.Messages[1])); text != "HELLO" {
		t.Fatalf("unexpected live assistant text %q", text)
	}
	if thinking := firstThinkingBlock(state.Messages[1]); thinking == nil {
		t.Fatalf("expected persisted thinking block in live state, got %#v", state.Messages[1])
	}
	if !hasManagedTextDelta(broadcaster.Messages()) {
		t.Fatalf("expected streamed text delta broadcasts, got %#v", broadcaster.Messages())
	}
	if !hasManagedThinkingDelta(broadcaster.Messages()) {
		t.Fatalf("expected streamed thinking delta broadcasts, got %#v", broadcaster.Messages())
	}

	outputMessages, ok := result.Outputs["messages"].([]any)
	if !ok || len(outputMessages) != 2 {
		t.Fatalf("expected persisted user and assistant messages, got %#v", result.Outputs["messages"])
	}
	assistant, ok := outputMessages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", outputMessages[1])
	}
	if text := strings.TrimSpace(collectAssistantText(assistant)); text != "HELLO" {
		t.Fatalf("unexpected persisted assistant text %q", text)
	}
	if thinking := firstThinkingBlock(assistant); thinking == nil {
		t.Fatalf("expected persisted thinking block, got %#v", assistant)
	}

	usage, ok := result.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload, got %#v", result.Outputs["usage"])
	}
	assertPositiveUsageField(t, usage, "prompt_tokens")
	assertPositiveUsageField(t, usage, "completion_tokens")
	assertPositiveUsageField(t, usage, "total_tokens")
}

func requireLiveProviderAPIKey(t *testing.T, key string, host string) string {
	t.Helper()

	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		value = strings.TrimSpace(loadRepoDotEnvValue(t, key))
	}
	if value == "" {
		t.Skipf("%s not set in env or repo .env", key)
	}
	t.Setenv(key, value)

	conn, err := net.DialTimeout("tcp", host, 3*time.Second)
	if err != nil {
		t.Skipf("cannot reach %s: %v", host, err)
	}
	if closeErr := conn.Close(); closeErr != nil {
		t.Fatalf("close reachability probe: %v", closeErr)
	}

	return value
}

func loadRepoDotEnvValue(t *testing.T, key string) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatalf("locate current file")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
	content, err := os.ReadFile(filepath.Join(repoRoot, ".env"))
	if err != nil {
		if os.IsNotExist(err) {
			return ""
		}
		t.Fatalf("read repo .env: %v", err)
	}
	prefix := key + "="
	for _, line := range strings.Split(string(content), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, prefix) {
			return strings.TrimSpace(strings.TrimPrefix(trimmed, prefix))
		}
	}
	return ""
}

func collectAssistantText(message map[string]any) string {
	content, ok := message["content"].([]any)
	if !ok {
		return ""
	}
	parts := make([]string, 0, len(content))
	for _, rawBlock := range content {
		block, ok := rawBlock.(map[string]any)
		if !ok || strings.TrimSpace(stringValue(block["type"])) != "text" {
			continue
		}
		text := strings.TrimSpace(stringValue(block["text"]))
		if text == "" {
			continue
		}
		parts = append(parts, text)
	}
	return strings.Join(parts, "\n")
}

func firstThinkingBlock(message map[string]any) map[string]any {
	content, ok := message["content"].([]any)
	if !ok {
		return nil
	}
	for _, rawBlock := range content {
		block, ok := rawBlock.(map[string]any)
		if !ok || strings.TrimSpace(stringValue(block["type"])) != "thinking" {
			continue
		}
		return block
	}
	return nil
}

func hasManagedTextDelta(messages []realtime.LLMStreamingResponseMessage) bool {
	for _, message := range messages {
		deltaEvent, ok := message.Content.Chunk.(realtime.MessageDeltaEvent)
		if !ok {
			continue
		}
		for _, rawContent := range deltaEvent.Content {
			if _, ok := rawContent.(realtime.MessageTextDelta); ok {
				return true
			}
		}
	}
	return false
}

func hasManagedThinkingDelta(messages []realtime.LLMStreamingResponseMessage) bool {
	for _, message := range messages {
		deltaEvent, ok := message.Content.Chunk.(realtime.MessageDeltaEvent)
		if !ok {
			continue
		}
		for _, rawContent := range deltaEvent.Content {
			if _, ok := rawContent.(realtime.MessageThinkingDelta); ok {
				return true
			}
		}
	}
	return false
}

func assertPositiveUsageField(t *testing.T, usage map[string]any, field string) {
	t.Helper()

	switch value := usage[field].(type) {
	case float64:
		if value > 0 {
			return
		}
	case int:
		if value > 0 {
			return
		}
	case int64:
		if value > 0 {
			return
		}
	}
	t.Fatalf("expected positive %s in usage payload, got %#v", field, usage[field])
}
