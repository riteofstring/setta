package scriptablechat

import (
	"context"
	"errors"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/llmconfig"
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
	if created.ID == "" {
		t.Fatal("expected created chat id")
	}
	if created.Name != "Hello listener history" {
		t.Fatalf("unexpected chat name %q", created.Name)
	}
	if created.LLMConfig.ID != scriptableLLMConfigID || !created.LLMConfig.Temporary {
		t.Fatalf("expected scriptable llm config, got %#v", created.LLMConfig)
	}
	if created.ProjectConfigID != nil {
		t.Fatalf("expected nil project config id, got %#v", created.ProjectConfigID)
	}
	if len(created.Messages) != 1 {
		t.Fatalf("expected one created message, got %#v", created.Messages)
	}
	if created.SystemPrompt != nil {
		t.Fatalf("expected nil system prompt, got %#v", created.SystemPrompt)
	}

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
	if len(appended.Messages) != 2 {
		t.Fatalf("expected two messages after append, got %#v", appended.Messages)
	}
	if !appended.LastUpdated.Equal(currentTime) {
		t.Fatalf("expected append to update lastUpdated to %v, got %v", currentTime, appended.LastUpdated)
	}

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
	if len(unchanged.Messages) != 2 {
		t.Fatalf("expected duplicate append to keep two messages, got %#v", unchanged.Messages)
	}
	if !unchanged.LastUpdated.Equal(appended.LastUpdated) {
		t.Fatalf("expected duplicate append to preserve lastUpdated %v, got %v", appended.LastUpdated, unchanged.LastUpdated)
	}

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
	if !withPrompt.LastUpdated.Equal(appended.LastUpdated) {
		t.Fatalf("expected system prompt write to preserve lastUpdated %v, got %v", appended.LastUpdated, withPrompt.LastUpdated)
	}

	metadata, err := fixture.service.GetAllMetadata(GetAllMetadataRequest{})
	if err != nil {
		t.Fatalf("get all metadata: %v", err)
	}
	if len(metadata) != 1 {
		t.Fatalf("expected one chat metadata entry, got %#v", metadata)
	}
	if metadata[0].ID != created.ID {
		t.Fatalf("expected metadata id %q, got %q", created.ID, metadata[0].ID)
	}
	if metadata[0].ProjectConfigID != nil {
		t.Fatalf("expected metadata to keep nil project config id, got %#v", metadata[0].ProjectConfigID)
	}

	if err := fixture.service.DeleteChat(DeleteChatRequest{ChatID: created.ID}); err != nil {
		t.Fatalf("delete chat: %v", err)
	}
	_, err = fixture.service.GetChat(GetChatRequest{ChatID: created.ID})
	if !errors.Is(err, ErrChatNotFound) {
		t.Fatalf("expected deleted chat lookup to return ErrChatNotFound, got %v", err)
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

type serviceFixture struct {
	service *Service
	engines *agentruns.EngineStore
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
		MCPServers: map[string]llmconfig.ServerConfig{},
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
	}
}

func stringPointer(value string) *string {
	return &value
}
