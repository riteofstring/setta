package externalagents

import (
	"errors"
	"math"
	"testing"
	"time"

	"setta/internal/agentruns"
)

func TestServiceGetChatHydratesMergedMessagesFromLatestExternalRun(t *testing.T) {
	t.Parallel()

	store, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-external",
		"projectConfigId": "project-alpha",
		"messages": []any{
			map[string]any{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello external"},
				},
				"attachments": []any{},
			},
		},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusRunning
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello external"},
				},
				"attachments": []any{},
			},
			map[string]any{
				"id":   "assistant-1",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Hi"},
				},
				"attachments": []any{},
				"tool_calls":  nil,
			},
		},
	}
	run.Events = append(run.Events, agentruns.NewRunEvent("run_started", nil, time.Date(2026, 3, 8, 12, 0, 2, 0, time.UTC)))
	if err := store.Save(run); err != nil {
		t.Fatalf("save run: %v", err)
	}

	service, err := NewService(ServiceOptions{Runs: store})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	hydrated, err := service.GetChat("chat-external", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if !hydrated.WaitingForResponse {
		t.Fatal("expected waitingForResponse to be true for running run")
	}
	if len(hydrated.Messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(hydrated.Messages))
	}
	if hydrated.ToolCallArguments == nil || len(hydrated.ToolCallArguments) != 0 {
		t.Fatalf("expected empty toolCallArguments, got %#v", hydrated.ToolCallArguments)
	}
}

func TestServiceGetChatSelectsLatestRunByLastUpdatedTimestamp(t *testing.T) {
	t.Parallel()

	store, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	first := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-same",
		"projectConfigId": "project-alpha",
		"messages": []any{
			map[string]any{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "First"},
				},
			},
		},
	}, time.Date(2026, 3, 8, 11, 0, 0, 0, time.UTC))
	first.Status = agentruns.RunStatusCompleted
	first.Outputs = map[string]any{
		"messages": []any{
			map[string]any{"id": "user-1", "role": "user", "content": []any{map[string]any{"type": "text", "text": "First"}}},
			map[string]any{"id": "assistant-1", "role": "assistant", "content": []any{map[string]any{"type": "text", "text": "Older"}}},
		},
	}
	first.Events = append(first.Events, agentruns.NewRunEvent("run_completed", nil, time.Date(2026, 3, 8, 11, 0, 3, 0, time.UTC)))

	second := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-same",
		"projectConfigId": "project-alpha",
		"messages": []any{
			map[string]any{
				"id":   "user-2",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Second"},
				},
			},
		},
	}, time.Date(2026, 3, 8, 11, 5, 0, 0, time.UTC))
	second.Status = agentruns.RunStatusCompleted
	second.Outputs = map[string]any{
		"messages": []any{
			map[string]any{"id": "user-2", "role": "user", "content": []any{map[string]any{"type": "text", "text": "Second"}}},
			map[string]any{"id": "assistant-2", "role": "assistant", "content": []any{map[string]any{"type": "text", "text": "Latest"}}},
		},
	}
	second.Events = append(second.Events, agentruns.NewRunEvent("run_completed", nil, time.Date(2026, 3, 8, 11, 5, 3, 0, time.UTC)))

	if err := store.Save(first); err != nil {
		t.Fatalf("save first run: %v", err)
	}
	if err := store.Save(second); err != nil {
		t.Fatalf("save second run: %v", err)
	}

	service, err := NewService(ServiceOptions{Runs: store})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	hydrated, err := service.GetChat("chat-same", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	lastMessage := hydrated.Messages[len(hydrated.Messages)-1]
	content := lastMessage["content"].([]any)
	textPayload := content[0].(map[string]any)
	if textPayload["text"] != "Latest" {
		t.Fatalf("expected latest run hydration, got %#v", textPayload["text"])
	}
}

func TestServiceGetChatResolvesExternalContextUsage(t *testing.T) {
	t.Parallel()

	store, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-usage",
		"projectConfigId": "project-alpha",
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusCompleted
	run.Outputs = map[string]any{
		"messages": []any{},
		"usage": map[string]any{
			"promptTokens":        69941,
			"contextUsedTokens":   24766,
			"contextWindowTokens": 258400,
		},
	}
	if err := store.Save(run); err != nil {
		t.Fatalf("save run: %v", err)
	}

	service, err := NewService(ServiceOptions{Runs: store})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	hydrated, err := service.GetChat("chat-usage", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if hydrated.ContextUsage == nil {
		t.Fatal("expected context usage")
	}
	if hydrated.ContextUsage.Estimated {
		t.Fatal("expected explicit context window to disable estimation")
	}
	if hydrated.ContextUsage.ContextUsedTokens == nil || *hydrated.ContextUsage.ContextUsedTokens != 24766 {
		t.Fatalf("unexpected context used tokens %#v", hydrated.ContextUsage.ContextUsedTokens)
	}
	if hydrated.ContextUsage.ContextWindowTokens == nil || *hydrated.ContextUsage.ContextWindowTokens != 258400 {
		t.Fatalf("unexpected context window tokens %#v", hydrated.ContextUsage.ContextWindowTokens)
	}
}

func TestServiceGetChatFiltersResponsePlaceholderMessages(t *testing.T) {
	t.Parallel()

	run := agentruns.NewRun(nil, map[string]any{
		"runType": RunTypeExternalAgent,
		"chatId":  "chat-placeholder",
		"messages": []any{
			map[string]any{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "hello"},
				},
			},
		},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{"id": "user-1", "role": "user", "content": []any{map[string]any{"type": "text", "text": "hello"}}},
			map[string]any{"id": "resp_1", "role": "assistant", "content": []any{}, "tool_calls": []any{}},
			map[string]any{"id": "assistant-1", "role": "assistant", "content": []any{map[string]any{"type": "text", "text": "done"}}},
		},
	}

	state, err := buildChatStateFromRun(run)
	if err != nil {
		t.Fatalf("build chat state: %v", err)
	}
	if len(state.Messages) != 2 {
		t.Fatalf("expected placeholder response to be filtered, got %d messages", len(state.Messages))
	}
}

func TestServiceGetChatReturnsNotFound(t *testing.T) {
	t.Parallel()

	store, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	service, err := NewService(ServiceOptions{Runs: store})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	_, err = service.GetChat("missing-chat", stringPtr("project-alpha"))
	if !errors.Is(err, ErrChatNotFound) {
		t.Fatalf("expected ErrChatNotFound, got %v", err)
	}
}

func TestResolveContextUsageIgnoresNonFiniteUsageValues(t *testing.T) {
	t.Parallel()

	run := agentruns.NewRun(nil, map[string]any{
		"runType": RunTypeExternalAgent,
		"chatId":  "chat-usage-invalid",
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Outputs = map[string]any{
		"usage": map[string]any{
			"promptTokens":        math.Inf(1),
			"inputTokens":         21,
			"contextWindowTokens": math.NaN(),
		},
	}

	usage := resolveContextUsage(run)
	if usage == nil {
		t.Fatal("expected usage fallback from inputTokens")
	}
	if !usage.Estimated {
		t.Fatal("expected usage to remain estimated without a valid context window")
	}
	if usage.ContextUsedTokens == nil || *usage.ContextUsedTokens != 21 {
		t.Fatalf("unexpected context used tokens %#v", usage.ContextUsedTokens)
	}
	if usage.ContextWindowTokens != nil {
		t.Fatalf("expected invalid context window token to be ignored, got %#v", usage.ContextWindowTokens)
	}
}
