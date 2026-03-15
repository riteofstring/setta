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

func TestServiceGetChatReturnsAppGenerationProvenanceFromRunInputs(t *testing.T) {
	t.Parallel()

	store, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-app-generation",
		"projectConfigId": "project-alpha",
		"appGenerationByMessageId": map[string]any{
			"user-app":   agentruns.ChatAppGenerationMessageModeJSONRenderWithImage,
			"user-plain": agentruns.ChatAppGenerationMessageModePlainChat,
			"user-bad":   "invalid_mode",
		},
		"messages": []any{
			map[string]any{
				"id":   "user-app",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Build app"},
				},
			},
		},
	}, time.Date(2026, 3, 8, 12, 5, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusCompleted
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{"id": "user-app", "role": "user", "content": []any{map[string]any{"type": "text", "text": "Build app"}}},
			map[string]any{"id": "assistant-1", "role": "assistant", "content": []any{map[string]any{"type": "text", "text": "Done"}}},
		},
	}
	if err := store.Save(run); err != nil {
		t.Fatalf("save run: %v", err)
	}

	service, err := NewService(ServiceOptions{Runs: store})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	hydrated, err := service.GetChat("chat-app-generation", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if len(hydrated.AppGenerationByMessageID) != 2 {
		t.Fatalf("expected two hydrated app-generation entries, got %#v", hydrated.AppGenerationByMessageID)
	}
	if hydrated.AppGenerationByMessageID["user-app"] != agentruns.ChatAppGenerationMessageModeJSONRenderWithImage {
		t.Fatalf("expected image-generation provenance, got %#v", hydrated.AppGenerationByMessageID)
	}
	if hydrated.AppGenerationByMessageID["user-plain"] != agentruns.ChatAppGenerationMessageModePlainChat {
		t.Fatalf("expected plain-chat provenance, got %#v", hydrated.AppGenerationByMessageID)
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

func TestServiceGetChatOverlaysActiveLiveStateFromRuntime(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-live",
		"projectConfigId": "project-alpha",
		"messages": []any{
			map[string]any{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Persisted"},
				},
			},
		},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.ID = "run-live"
	run.Status = agentruns.RunStatusRunning
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{"id": "user-1", "role": "user", "content": []any{map[string]any{"type": "text", "text": "Persisted"}}},
		},
	}
	if err := store.Save(run); err != nil {
		t.Fatalf("save persisted run: %v", err)
	}
	if err := runtime.ActivateRun(run.ID, &stubRunController{}); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.SetLiveChatState(run.ID, ChatState{
		Messages: []map[string]any{
			{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Persisted"},
				},
			},
			{
				"id":   "assistant-live",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Live overlay"},
				},
			},
		},
		WaitingForResponse: true,
		ToolCallArguments: map[string]string{
			"tool-call-1": "{\"path\":\"internal/externalagents/runtime.go\"}",
		},
	}); err != nil {
		t.Fatalf("set live chat state: %v", err)
	}

	service, err := NewService(ServiceOptions{
		Runs: store,
		Live: runtime,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	hydrated, err := service.GetChat("chat-live", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if len(hydrated.Messages) != 2 {
		t.Fatalf("expected live overlay to add second message, got %d", len(hydrated.Messages))
	}
	lastMessage := hydrated.Messages[1]
	content := lastMessage["content"].([]any)
	textPayload := content[0].(map[string]any)
	if textPayload["text"] != "Live overlay" {
		t.Fatalf("expected live overlay content, got %#v", textPayload["text"])
	}
	if got := hydrated.ToolCallArguments["tool-call-1"]; got != "{\"path\":\"internal/externalagents/runtime.go\"}" {
		t.Fatalf("unexpected tool call arguments %q", got)
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

func TestResolveContextUsageAcceptsCodexAliasesAndPrefersExplicitContextUsedTokens(t *testing.T) {
	t.Parallel()

	run := agentruns.NewRun(nil, map[string]any{
		"runType": RunTypeExternalAgent,
		"chatId":  "chat-usage-aliases",
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Outputs = map[string]any{
		"usage": map[string]any{
			"usedTokens":        88,
			"contextUsedTokens": 24766,
			"windowTokens":      258400,
		},
	}

	usage := resolveContextUsage(run)
	if usage == nil {
		t.Fatal("expected usage from codex aliases")
	}
	if usage.ContextUsedTokens == nil || *usage.ContextUsedTokens != 24766 {
		t.Fatalf("unexpected context used tokens %#v", usage.ContextUsedTokens)
	}
	if usage.ContextWindowTokens == nil || *usage.ContextWindowTokens != 258400 {
		t.Fatalf("unexpected context window tokens %#v", usage.ContextWindowTokens)
	}
	if usage.Estimated {
		t.Fatalf("expected explicit context window to disable estimation, got %#v", usage)
	}
}

func TestResolveContextUsageRejectsFractionalValuesAndKeepsValidStringWindow(t *testing.T) {
	t.Parallel()

	run := agentruns.NewRun(nil, map[string]any{
		"runType": RunTypeExternalAgent,
		"chatId":  "chat-usage-fractional",
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Outputs = map[string]any{
		"usage": map[string]any{
			"promptTokens":        -0.5,
			"inputTokens":         "1.9",
			"completionTokens":    1.9,
			"contextWindowTokens": "4096",
		},
	}

	usage := resolveContextUsage(run)
	if usage == nil {
		t.Fatal("expected valid context window usage")
	}
	if usage.ContextUsedTokens != nil {
		t.Fatalf("expected invalid used token values to be ignored, got %#v", usage.ContextUsedTokens)
	}
	if usage.ContextWindowTokens == nil || *usage.ContextWindowTokens != 4096 {
		t.Fatalf("unexpected context window tokens %#v", usage.ContextWindowTokens)
	}
	if usage.Estimated {
		t.Fatalf("expected valid context window to disable estimation, got %#v", usage)
	}
}
