package scriptablechat

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/realtime"
)

type captureStreamBroadcaster struct {
	message   any
	selection realtime.Selection
	delivered int
}

func (c *captureStreamBroadcaster) BroadcastJSON(_ context.Context, message any, selection realtime.Selection) (int, error) {
	c.message = message
	c.selection = selection
	c.delivered++
	return 1, nil
}

type stubToolCaller struct {
	descriptors map[string]mcpx.ToolDescriptor
	call        func(context.Context, string, map[string]any, map[string]any) (mcpx.ToolCallResult, error)
}

func (s *stubToolCaller) ToolDescriptorsForServers(serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor {
	if len(s.descriptors) == 0 {
		return map[string]mcpx.ToolDescriptor{}
	}
	filtered := make(map[string]mcpx.ToolDescriptor)
	for name, descriptor := range s.descriptors {
		if serverIDs != nil {
			if _, ok := serverIDs[descriptor.ServerID]; !ok {
				continue
			}
		}
		filtered[name] = descriptor
	}
	return filtered
}

func (s *stubToolCaller) CallToolWithMeta(ctx context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (mcpx.ToolCallResult, error) {
	if s.call == nil {
		return mcpx.ToolCallResult{}, nil
	}
	return s.call(ctx, namespacedToolName, arguments, meta)
}

func TestServiceCRUDRoundTrip(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)
	currentTime := time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)
	fixture.service.now = func() time.Time {
		return currentTime
	}

	created, err := fixture.service.CreateChat(CreateChatRequest{
		FirstMessage: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Hello listener history"},
			},
		},
	})
	if err != nil {
		t.Fatalf("create chat: %v", err)
	}
	assertCreatedScriptableChat(t, created, "Hello listener history")

	loaded, err := fixture.service.GetChat(GetChatRequest{ChatID: created.ID})
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if loaded.ID != created.ID {
		t.Fatalf("expected loaded chat id %q, got %q", created.ID, loaded.ID)
	}

	currentTime = currentTime.Add(time.Minute)
	appended, err := fixture.service.AppendMessages(AppendMessagesRequest{
		ChatID: created.ID,
		Messages: []map[string]any{
			{
				"id":   "assistant-1",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Reply"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("append messages: %v", err)
	}
	assertScriptableChatMessageCount(t, appended, 2, "after append")
	assertScriptableChatLastUpdated(t, appended, currentTime, "after append")

	currentTime = currentTime.Add(time.Minute)
	unchanged, err := fixture.service.AppendMessages(AppendMessagesRequest{
		ChatID: created.ID,
		Messages: []map[string]any{
			{
				"id":   "assistant-1",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Reply"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("append duplicate message: %v", err)
	}
	assertScriptableChatMessageCount(t, unchanged, 2, "after duplicate append")
	assertScriptableChatLastUpdated(t, unchanged, appended.LastUpdated, "after duplicate append")

	currentTime = currentTime.Add(time.Minute)
	withPrompt, err := fixture.service.SetSystemPrompt(SetSystemPromptRequest{
		ChatID:       created.ID,
		SystemPrompt: "System prompt",
	})
	if err != nil {
		t.Fatalf("set system prompt: %v", err)
	}
	if withPrompt.SystemPrompt == nil || *withPrompt.SystemPrompt != "System prompt" {
		t.Fatalf("expected system prompt to round-trip, got %#v", withPrompt.SystemPrompt)
	}
	assertScriptableChatLastUpdated(t, withPrompt, appended.LastUpdated, "after system prompt write")

	metadata, err := fixture.service.GetAllMetadata(GetAllMetadataRequest{})
	if err != nil {
		t.Fatalf("get all metadata: %v", err)
	}
	assertSingleScriptableChatMetadata(t, metadata, created.ID)

	if err := fixture.service.DeleteChat(DeleteChatRequest{ChatID: created.ID}); err != nil {
		t.Fatalf("delete chat: %v", err)
	}
	_, err = fixture.service.GetChat(GetChatRequest{ChatID: created.ID})
	if !errors.Is(err, ErrChatNotFound) {
		t.Fatalf("expected deleted chat lookup to return ErrChatNotFound, got %v", err)
	}
}

func assertCreatedScriptableChat(t *testing.T, chat Chat, wantName string) {
	t.Helper()

	if chat.ID == "" {
		t.Fatal("expected created chat id")
	}
	if chat.Name != wantName {
		t.Fatalf("unexpected chat name %q", chat.Name)
	}
	if chat.LLMConfig.ID != scriptableLLMConfigID || !chat.LLMConfig.Temporary {
		t.Fatalf("expected scriptable llm config, got %#v", chat.LLMConfig)
	}
	if chat.ProjectConfigID != nil {
		t.Fatalf("expected nil project config id, got %#v", chat.ProjectConfigID)
	}
	assertScriptableChatMessageCount(t, chat, 1, "after create")
	if chat.SystemPrompt != nil {
		t.Fatalf("expected nil system prompt, got %#v", chat.SystemPrompt)
	}
}

func assertScriptableChatMessageCount(t *testing.T, chat Chat, want int, contextLabel string) {
	t.Helper()

	if len(chat.Messages) != want {
		t.Fatalf("expected %d messages %s, got %#v", want, contextLabel, chat.Messages)
	}
}

func assertScriptableChatLastUpdated(t *testing.T, chat Chat, want time.Time, contextLabel string) {
	t.Helper()

	if !chat.LastUpdated.Equal(want) {
		t.Fatalf("expected lastUpdated %s to be %v, got %v", contextLabel, want, chat.LastUpdated)
	}
}

func assertSingleScriptableChatMetadata(t *testing.T, metadata []ChatMetadata, wantID string) {
	t.Helper()

	if len(metadata) != 1 {
		t.Fatalf("expected one chat metadata entry, got %#v", metadata)
	}
	if metadata[0].ID != wantID {
		t.Fatalf("expected metadata id %q, got %q", wantID, metadata[0].ID)
	}
	if metadata[0].ProjectConfigID != nil {
		t.Fatalf("expected metadata to keep nil project config id, got %#v", metadata[0].ProjectConfigID)
	}
}

func TestServiceCreateChatResolvesManagedEngineConfig(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)
	engineLLMID := "primary"
	if err := fixture.engines.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-primary",
			Name:             "Primary",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &engineLLMID,
		},
	}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}

	created, err := fixture.service.CreateChat(CreateChatRequest{
		EngineConfigID: stringPointer("engine-primary"),
		FirstMessage: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Managed engine"},
			},
		},
	})
	if err != nil {
		t.Fatalf("create chat with engine config: %v", err)
	}
	if created.LLMConfig.ID != "primary" {
		t.Fatalf("expected managed llm config id primary, got %#v", created.LLMConfig)
	}
}

func TestServiceCreateChatPersistsProjectConfigID(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)

	created, err := fixture.service.CreateChat(CreateChatRequest{
		ProjectConfigID: stringPointer(" project-alpha "),
		FirstMessage: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Scoped chat"},
			},
		},
	})
	if err != nil {
		t.Fatalf("create chat with project config id: %v", err)
	}
	if created.ProjectConfigID == nil || *created.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected projectConfigId project-alpha, got %#v", created.ProjectConfigID)
	}

	loaded, err := fixture.service.GetChat(GetChatRequest{ChatID: created.ID})
	if err != nil {
		t.Fatalf("get scoped chat: %v", err)
	}
	if loaded.ProjectConfigID == nil || *loaded.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected loaded projectConfigId project-alpha, got %#v", loaded.ProjectConfigID)
	}
}

func TestServiceGetChatReturnsClonedMessages(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)

	created, err := fixture.service.CreateChat(CreateChatRequest{
		FirstMessage: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "hello"},
			},
		},
	})
	if err != nil {
		t.Fatalf("create chat: %v", err)
	}

	loaded, err := fixture.service.GetChat(GetChatRequest{ChatID: created.ID})
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	content, ok := loaded.Messages[0]["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected one content block, got %#v", loaded.Messages[0]["content"])
	}
	block, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected text content block map, got %#v", content[0])
	}
	block["text"] = "changed"

	reloaded, err := fixture.service.GetChat(GetChatRequest{ChatID: created.ID})
	if err != nil {
		t.Fatalf("reload chat: %v", err)
	}
	if firstMessageText(reloaded.Messages[0]) != "hello" {
		t.Fatalf("expected original text to remain hello, got %#v", reloaded.Messages[0])
	}
}

func TestServiceGetAllMetadataReturnsCopiedLLMConfig(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)

	created, err := fixture.service.CreateChat(CreateChatRequest{
		FirstMessage: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "hello"},
			},
		},
	})
	if err != nil {
		t.Fatalf("create chat: %v", err)
	}

	metadata, err := fixture.service.GetAllMetadata(GetAllMetadataRequest{})
	if err != nil {
		t.Fatalf("get all metadata: %v", err)
	}
	if len(metadata) != 1 {
		t.Fatalf("expected one metadata entry, got %#v", metadata)
	}
	metadata[0].LLMConfig.Model = "mutated-model"

	reloaded, err := fixture.service.GetChat(GetChatRequest{ChatID: created.ID})
	if err != nil {
		t.Fatalf("reload chat: %v", err)
	}
	if reloaded.LLMConfig.Model != scriptableLLMConfigID {
		t.Fatalf("expected original llm config model %q, got %#v", scriptableLLMConfigID, reloaded.LLMConfig)
	}
}

func TestIsScriptableChatRunUsesInputsOnly(t *testing.T) {
	t.Parallel()

	run := agentruns.Run{
		Inputs: map[string]any{
			"runType": " scriptable_chat ",
		},
		Events: []agentruns.RunEvent{
			agentruns.NewRunEvent("run_started", map[string]any{"runType": "llm_chat"}, time.Date(2026, 3, 13, 10, 6, 0, 0, time.UTC)),
		},
	}
	if !isScriptableChatRun(run) {
		t.Fatal("expected scriptable run type from inputs")
	}

	runWithoutInputs := agentruns.Run{
		Events: []agentruns.RunEvent{
			agentruns.NewRunEvent("run_started", map[string]any{"runType": "scriptable_chat"}, time.Date(2026, 3, 13, 10, 7, 0, 0, time.UTC)),
		},
	}
	if isScriptableChatRun(runWithoutInputs) {
		t.Fatal("expected event payload alone not to classify run as scriptable")
	}
}

func TestServiceCreateChatDerivesTruncatedNameFromFirstMessage(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)
	messageText := strings.Repeat("0123456789", 4)

	created, err := fixture.service.CreateChat(CreateChatRequest{
		FirstMessage: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": messageText},
			},
		},
	})
	if err != nil {
		t.Fatalf("create chat: %v", err)
	}
	if created.Name != messageText[:30] {
		t.Fatalf("expected truncated chat name %q, got %q", messageText[:30], created.Name)
	}
}

func TestServiceCreateAndAppendDoNotPersistNameSource(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)

	created, err := fixture.service.CreateChat(CreateChatRequest{
		FirstMessage: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "External titles stay caller-owned"},
			},
		},
	})
	if err != nil {
		t.Fatalf("create chat: %v", err)
	}

	persisted, err := fixture.runs.Load(created.ID)
	if err != nil {
		t.Fatalf("load created chat run: %v", err)
	}
	if persisted.Outputs["name"] != created.Name {
		t.Fatalf("expected persisted name %q, got %#v", created.Name, persisted.Outputs["name"])
	}
	if _, ok := persisted.Outputs["nameSource"]; ok {
		t.Fatalf("expected create chat not to persist nameSource, got %#v", persisted.Outputs["nameSource"])
	}

	_, err = fixture.service.AppendMessages(AppendMessagesRequest{
		ChatID: created.ID,
		Messages: []map[string]any{
			{
				"id":   "assistant-1",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Reply"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("append messages: %v", err)
	}

	updated, err := fixture.runs.Load(created.ID)
	if err != nil {
		t.Fatalf("load appended chat run: %v", err)
	}
	if updated.Outputs["name"] != created.Name {
		t.Fatalf("expected append to keep persisted name %q, got %#v", created.Name, updated.Outputs["name"])
	}
	if _, ok := updated.Outputs["nameSource"]; ok {
		t.Fatalf("expected append messages not to persist nameSource, got %#v", updated.Outputs["nameSource"])
	}
}

func TestServiceGetAllMetadataUsesCachedNamesAndSortsByLastUpdated(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)
	// Cached names must avoid reparsing legacy message payloads while metadata
	// ordering still follows the persisted lastUpdated value.
	saveScriptableChatRun(t, fixture.runs, agentruns.Run{
		ID:         "chat-cached",
		Status:     agentruns.RunStatusCompleted,
		StartedAt:  timePointer(time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)),
		FinishedAt: timePointer(time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)),
		Inputs: map[string]any{
			"runType": RunTypeScriptableChat,
			"chatId":  "chat-cached",
			"llmConfig": map[string]any{
				"id":        "primary",
				"model":     "gpt-test",
				"provider":  "openai",
				"apiKeyEnv": "OPENAI_API_KEY",
			},
		},
		Outputs: map[string]any{
			"name":        "Cached Chat",
			"lastUpdated": "2026-03-13T10:00:00Z",
			"messages":    []any{map[string]any{"unexpected": "payload"}},
		},
	})
	saveScriptableChatRun(t, fixture.runs, agentruns.Run{
		ID:         "chat-derived",
		Status:     agentruns.RunStatusCompleted,
		StartedAt:  timePointer(time.Date(2026, 3, 13, 10, 5, 0, 0, time.UTC)),
		FinishedAt: timePointer(time.Date(2026, 3, 13, 10, 5, 0, 0, time.UTC)),
		Inputs: map[string]any{
			"runType": RunTypeScriptableChat,
			"chatId":  "chat-derived",
			"llmConfig": map[string]any{
				"id":        "primary",
				"model":     "gpt-test",
				"provider":  "openai",
				"apiKeyEnv": "OPENAI_API_KEY",
			},
		},
		Outputs: map[string]any{
			"lastUpdated": "2026-03-13T10:05:00Z",
			"messages": []any{
				map[string]any{
					"id":   "user-1",
					"role": "user",
					"content": []any{
						map[string]any{"type": "text", "text": "Derived chat name"},
					},
				},
			},
		},
	})

	metadata, err := fixture.service.GetAllMetadata(GetAllMetadataRequest{})
	if err != nil {
		t.Fatalf("get all metadata: %v", err)
	}
	if len(metadata) != 2 {
		t.Fatalf("expected two metadata entries, got %#v", metadata)
	}
	if metadata[0].ID != "chat-cached" || metadata[0].Name != "Cached Chat" {
		t.Fatalf("expected cached metadata entry first, got %#v", metadata[0])
	}
	if metadata[1].ID != "chat-derived" || metadata[1].Name != "Derived chat name" {
		t.Fatalf("expected derived metadata entry second, got %#v", metadata[1])
	}
}

func TestServiceEmitStreamDeltaBroadcastsFrontendMessage(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)
	broadcaster := &captureStreamBroadcaster{}
	fixture.service.broadcaster = broadcaster

	err := fixture.service.EmitStreamDelta(context.Background(), EmitStreamDeltaRequest{
		ProjectConfigID: "project-alpha",
		SectionID:       "chat-section",
		ChatID:          "chat-1",
		Chunk: map[string]any{
			"type":       "message_stop",
			"message_id": "assistant-1",
		},
		ShareSessionID: "share-session-1",
	})
	if err != nil {
		t.Fatalf("emit stream delta: %v", err)
	}
	if broadcaster.delivered != 1 {
		t.Fatalf("expected one frontend broadcast, got %d", broadcaster.delivered)
	}
	if broadcaster.selection.Type != realtime.ConnectionTypeFrontend || broadcaster.selection.ShareSessionID != "share-session-1" {
		t.Fatalf("unexpected frontend selection %#v", broadcaster.selection)
	}

	message, ok := broadcaster.message.(realtime.LLMStreamingResponseMessage)
	if !ok {
		t.Fatalf("expected LLMStreamingResponseMessage, got %T", broadcaster.message)
	}
	if message.Content.ChatID != "chat-1" {
		t.Fatalf("expected chat id chat-1, got %#v", message.Content)
	}
	if message.Content.SectionID == nil || *message.Content.SectionID != "chat-section" {
		t.Fatalf("expected section id chat-section, got %#v", message.Content.SectionID)
	}
	if message.Content.ProjectConfigID == nil || *message.Content.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project config id project-alpha, got %#v", message.Content.ProjectConfigID)
	}
	chunk, ok := message.Content.Chunk.(map[string]any)
	if !ok {
		t.Fatalf("expected chunk payload map, got %#v", message.Content.Chunk)
	}
	if chunk["type"] != "message_stop" || chunk["message_id"] != "assistant-1" {
		t.Fatalf("unexpected streamed chunk %#v", chunk)
	}
}

func TestServiceRunToolsForwardsFrontendAffinityTokenAndContext(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)
	fixture.service.now = func() time.Time {
		return time.Date(2026, 3, 13, 10, 30, 0, 0, time.UTC)
	}

	toolCaller := &stubToolCaller{
		descriptors: map[string]mcpx.ToolDescriptor{
			"setta__list_mcp_tools": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__list_mcp_tools",
			},
		},
	}
	captured := struct {
		name      string
		arguments map[string]any
		meta      map[string]any
	}{}
	toolCaller.call = func(_ context.Context, namespacedToolName string, arguments map[string]any, meta map[string]any) (mcpx.ToolCallResult, error) {
		captured.name = namespacedToolName
		captured.arguments = arguments
		captured.meta = meta
		return mcpx.ToolCallResult{
			StructuredContent: map[string]any{"ok": true},
			Text:              "tool ok",
		}, nil
	}
	fixture.service.tools = toolCaller

	saveScriptableChatRun(t, fixture.runs, agentruns.Run{
		ID:         "chat-1",
		Status:     agentruns.RunStatusCompleted,
		StartedAt:  timePointer(time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)),
		FinishedAt: timePointer(time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)),
		Inputs: map[string]any{
			"runType":         RunTypeScriptableChat,
			"chatId":          "chat-1",
			"projectConfigId": "project-alpha",
			"llmConfig": map[string]any{
				"id":    "primary",
				"model": "gpt-test",
			},
		},
		Outputs: map[string]any{
			"messages":    []any{},
			"lastUpdated": "2026-03-13T10:00:00Z",
			"name":        "Chat",
		},
	})

	results, err := fixture.service.RunTools(context.Background(), RunToolsRequest{
		ChatID:                "chat-1",
		SectionID:             "chat-section",
		FrontendAffinityToken: stringPointer("frontend-1"),
		ToolCalls: []map[string]any{
			{
				"id":   "tool-call-1",
				"type": "function",
				"function": map[string]any{
					"name":      "mcp__setta__list_mcp_tools",
					"arguments": map[string]any{},
				},
			},
		},
		ShareSessionID: "share-session-1",
	})
	if err != nil {
		t.Fatalf("run tools: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected one tool result message, got %#v", results)
	}
	if captured.name != "setta__list_mcp_tools" {
		t.Fatalf("expected normalized tool name setta__list_mcp_tools, got %q", captured.name)
	}
	if captured.meta["projectConfigId"] != "project-alpha" || captured.meta["chatId"] != "chat-1" || captured.meta["sectionId"] != "chat-section" {
		t.Fatalf("unexpected agentic meta %#v", captured.meta)
	}
	if captured.meta["frontendAffinityToken"] != "frontend-1" || captured.meta["shareSessionId"] != "share-session-1" {
		t.Fatalf("expected share/frontend affinity meta, got %#v", captured.meta)
	}

	result := results[0]
	if result["tool_name"] != "setta__list_mcp_tools" {
		t.Fatalf("expected tool result to preserve tool name, got %#v", result["tool_name"])
	}
	if result["is_error"] != false {
		t.Fatalf("expected successful tool result, got %#v", result)
	}
	content, ok := result["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected text content in tool result, got %#v", result["content"])
	}
	textBlock, ok := content[0].(map[string]any)
	if !ok || textBlock["text"] != "tool ok" {
		t.Fatalf("unexpected tool result content %#v", result["content"])
	}
}

func TestServiceRunToolsRejectsBlankFrontendAffinityToken(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)
	fixture.service.tools = &stubToolCaller{}
	saveScriptableChatRun(t, fixture.runs, agentruns.Run{
		ID:         "chat-1",
		Status:     agentruns.RunStatusCompleted,
		StartedAt:  timePointer(time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)),
		FinishedAt: timePointer(time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)),
		Inputs: map[string]any{
			"runType":         RunTypeScriptableChat,
			"chatId":          "chat-1",
			"projectConfigId": "project-alpha",
			"llmConfig": map[string]any{
				"id":    "primary",
				"model": "gpt-test",
			},
		},
		Outputs: map[string]any{
			"messages":    []any{},
			"lastUpdated": "2026-03-13T10:00:00Z",
			"name":        "Chat",
		},
	})

	_, err := fixture.service.RunTools(context.Background(), RunToolsRequest{
		ChatID:                "chat-1",
		SectionID:             "chat-section",
		FrontendAffinityToken: stringPointer("   "),
		ToolCalls:             []map[string]any{},
	})
	if !errors.Is(err, ErrFrontendAffinityTokenInvalid) {
		t.Fatalf("expected ErrFrontendAffinityTokenInvalid, got %v", err)
	}
}

func TestServiceRunToolsRequiresChatProjectForSettaTools(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)
	fixture.service.tools = &stubToolCaller{
		descriptors: map[string]mcpx.ToolDescriptor{
			"setta__list_mcp_tools": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__list_mcp_tools",
			},
		},
	}
	saveScriptableChatRun(t, fixture.runs, agentruns.Run{
		ID:         "chat-1",
		Status:     agentruns.RunStatusCompleted,
		StartedAt:  timePointer(time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)),
		FinishedAt: timePointer(time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)),
		Inputs: map[string]any{
			"runType": RunTypeScriptableChat,
			"chatId":  "chat-1",
			"llmConfig": map[string]any{
				"id":    "primary",
				"model": "gpt-test",
			},
		},
		Outputs: map[string]any{
			"messages":    []any{},
			"lastUpdated": "2026-03-13T10:00:00Z",
			"name":        "Chat",
		},
	})

	_, err := fixture.service.RunTools(context.Background(), RunToolsRequest{
		ChatID:    "chat-1",
		SectionID: "chat-section",
		ToolCalls: []map[string]any{
			{
				"id": "tool-call-1",
				"function": map[string]any{
					"name":      "mcp__setta__list_mcp_tools",
					"arguments": map[string]any{},
				},
			},
		},
	})
	if !errors.Is(err, ErrChatProjectRequired) {
		t.Fatalf("expected ErrChatProjectRequired, got %v", err)
	}
}

func TestServiceRunToolsReturnsErrorMessageForUnknownTool(t *testing.T) {
	t.Parallel()

	fixture := newServiceFixture(t)
	fixture.service.tools = &stubToolCaller{
		descriptors: map[string]mcpx.ToolDescriptor{
			"setta__list_mcp_tools": {
				ServerID:       mcpx.DefaultServerID,
				NamespacedName: "setta__list_mcp_tools",
			},
		},
	}
	saveScriptableChatRun(t, fixture.runs, agentruns.Run{
		ID:         "chat-1",
		Status:     agentruns.RunStatusCompleted,
		StartedAt:  timePointer(time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)),
		FinishedAt: timePointer(time.Date(2026, 3, 13, 10, 0, 0, 0, time.UTC)),
		Inputs: map[string]any{
			"runType":         RunTypeScriptableChat,
			"chatId":          "chat-1",
			"projectConfigId": "project-alpha",
			"llmConfig": map[string]any{
				"id":           scriptableLLMConfigID,
				"model":        scriptableLLMConfigID,
				"mcpServerIds": []any{},
				"temporary":    true,
			},
		},
		Outputs: map[string]any{
			"messages":    []any{},
			"lastUpdated": "2026-03-13T10:00:00Z",
			"name":        "Chat",
		},
	})

	results, err := fixture.service.RunTools(context.Background(), RunToolsRequest{
		ChatID:    "chat-1",
		SectionID: "chat-section",
		ToolCalls: []map[string]any{
			{
				"id": "tool-call-1",
				"function": map[string]any{
					"name":      "setta__list_mcp_tools",
					"arguments": map[string]any{},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("run tools: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected one tool error message, got %#v", results)
	}
	if results[0]["is_error"] != true {
		t.Fatalf("expected tool result to be an error, got %#v", results[0])
	}
	content, ok := results[0]["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected one error text block, got %#v", results[0]["content"])
	}
	block, ok := content[0].(map[string]any)
	if !ok {
		t.Fatalf("expected error content block map, got %#v", content[0])
	}
	text, _ := block["text"].(string)
	if text == "" || !containsAll(text, "setta__list_mcp_tools", "not allowed") {
		t.Fatalf("expected disallowed-tool text, got %q", text)
	}
}

type serviceFixture struct {
	service *Service
	engines *agentruns.EngineStore
	runs    *agentruns.RunStore
}

func newServiceFixture(t *testing.T) serviceFixture {
	t.Helper()

	root := t.TempDir()
	runs, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	runtime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-test",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{
			mcpx.DefaultServerID: {
				Transport: llmconfig.TransportStreamableHTTP,
				URL:       "http://127.0.0.1:9999/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	service, err := NewService(ServiceOptions{
		Runs:    runs,
		Engines: engines,
		LLM:     runtime,
	})
	if err != nil {
		t.Fatalf("new scriptable chat service: %v", err)
	}
	return serviceFixture{
		service: service,
		engines: engines,
		runs:    runs,
	}
}

func stringPointer(value string) *string {
	return &value
}

func timePointer(value time.Time) *time.Time {
	return &value
}

func saveScriptableChatRun(t *testing.T, store *agentruns.RunStore, run agentruns.Run) {
	t.Helper()
	if err := store.Save(run); err != nil {
		t.Fatalf("save scriptable chat run: %v", err)
	}
}

func containsAll(value string, parts ...string) bool {
	for _, part := range parts {
		if !strings.Contains(value, part) {
			return false
		}
	}
	return true
}
