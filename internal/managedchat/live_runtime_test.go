package managedchat

import (
	"context"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/realtime"
)

type captureStreamBroadcaster struct {
	messages   []realtime.LLMStreamingResponseMessage
	selections []realtime.Selection
}

func (c *captureStreamBroadcaster) BroadcastJSON(_ context.Context, message any, selection realtime.Selection) (int, error) {
	typed, ok := message.(realtime.LLMStreamingResponseMessage)
	if !ok {
		return 0, nil
	}
	c.messages = append(c.messages, typed)
	c.selections = append(c.selections, selection)
	return 1, nil
}

func TestLiveRuntimeApplyChunkBroadcastsAndStoresState(t *testing.T) {
	t.Parallel()

	broadcaster := &captureStreamBroadcaster{}
	runtime := NewLiveRuntime(LiveRuntimeOptions{Broadcaster: broadcaster})
	run := newManagedChatRun(t, managedChatRunOptions{
		chatID:          "chat-live",
		projectConfigID: "project-alpha",
		engineConfigID:  "engine-managed",
		startedAt:       time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC),
		status:          agentruns.RunStatusRunning,
		inputMessages:   []map[string]any{userMessage("user-1", "Hello")},
	})
	runtime.ActivateRun(run)

	if err := runtime.ApplyChunk(context.Background(), StreamChunkParams{
		RunID:           run.ID,
		ChatID:          "chat-live",
		ProjectConfigID: stringPtr("project-alpha"),
		SectionID:       stringPtr("section-chat"),
		Chunk: realtime.MessageStartEvent{
			Type:    realtime.StreamingEventTypeMessageStart,
			Message: assistantMessage("assistant-1", ""),
		},
	}); err != nil {
		t.Fatalf("apply message start: %v", err)
	}
	if err := runtime.ApplyChunk(context.Background(), StreamChunkParams{
		RunID:  run.ID,
		ChatID: "chat-live",
		Chunk: realtime.MessageDeltaEvent{
			Type:      realtime.StreamingEventTypeDelta,
			MessageID: "assistant-1",
			Content: []any{
				realtime.MessageTextDelta{
					Type:  realtime.MessageContentTypeTextDelta,
					Index: 0,
					Text:  "Streaming reply",
				},
			},
		},
	}); err != nil {
		t.Fatalf("apply message delta: %v", err)
	}
	if err := runtime.ApplyChunk(context.Background(), StreamChunkParams{
		RunID:  run.ID,
		ChatID: "chat-live",
		Chunk: realtime.MessageFinalizedEvent{
			Type:    realtime.StreamingEventTypeMessageFinalized,
			Message: assistantMessage("assistant-1", "Streaming reply"),
		},
	}); err != nil {
		t.Fatalf("apply message finalized: %v", err)
	}

	state, err := runtime.GetLiveChatState(run.ID)
	if err != nil {
		t.Fatalf("get live chat state: %v", err)
	}
	if state == nil {
		t.Fatal("expected live state")
	}
	if state.WaitingForResponse {
		t.Fatal("expected finalized live state to clear waiting flag")
	}
	if len(state.Messages) != 2 {
		t.Fatalf("expected two messages in live state, got %#v", state.Messages)
	}
	if state.Messages[1]["id"] != "assistant-1" {
		t.Fatalf("expected assistant message in live state, got %#v", state.Messages[1])
	}
	if len(broadcaster.messages) != 3 {
		t.Fatalf("expected three broadcast messages, got %d", len(broadcaster.messages))
	}
	if broadcaster.messages[0].MessageType != realtime.MessageTypeLLMStreamingResponse {
		t.Fatalf("expected llm streaming response message type, got %q", broadcaster.messages[0].MessageType)
	}
	if broadcaster.messages[0].Content.ChatID != "chat-live" {
		t.Fatalf("expected broadcast chat id chat-live, got %q", broadcaster.messages[0].Content.ChatID)
	}
	if broadcaster.messages[0].Content.ProjectConfigID == nil || *broadcaster.messages[0].Content.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected broadcast project config id, got %#v", broadcaster.messages[0].Content.ProjectConfigID)
	}
	if len(broadcaster.selections) == 0 || broadcaster.selections[0].Type != realtime.ConnectionTypeFrontend {
		t.Fatalf("expected frontend broadcast selection, got %#v", broadcaster.selections)
	}
}

func TestServiceGetChatUsesConcreteLiveRuntimeOverlay(t *testing.T) {
	t.Parallel()

	liveRuntime := NewLiveRuntime(LiveRuntimeOptions{})
	fixture := newManagedChatFixture(t, liveRuntime)
	run := newManagedChatRun(t, managedChatRunOptions{
		chatID:          "chat-live-runtime",
		projectConfigID: "project-alpha",
		engineConfigID:  "engine-managed",
		startedAt:       time.Date(2026, 3, 9, 10, 0, 0, 0, time.UTC),
		status:          agentruns.RunStatusRunning,
		inputMessages:   []map[string]any{userMessage("user-1", "Hello")},
		outputMessages:  []map[string]any{userMessage("user-1", "Hello")},
	})
	saveManagedChatRun(t, fixture.runs, run)
	liveRuntime.ActivateRun(run)
	if err := liveRuntime.ApplyChunk(context.Background(), StreamChunkParams{
		RunID:  run.ID,
		ChatID: "chat-live-runtime",
		Chunk: realtime.MessageFinalizedEvent{
			Type:    realtime.StreamingEventTypeMessageFinalized,
			Message: assistantMessage("assistant-1", "Live overlay reply"),
		},
	}); err != nil {
		t.Fatalf("apply finalized chunk: %v", err)
	}

	hydrated, err := fixture.service.GetChat("chat-live-runtime", stringPtr("project-alpha"))
	if err != nil {
		t.Fatalf("get chat: %v", err)
	}
	if len(hydrated.Messages) != 2 {
		t.Fatalf("expected hydrated overlay messages, got %#v", hydrated.Messages)
	}
	if hydrated.Messages[1]["id"] != "assistant-1" {
		t.Fatalf("expected overlaid assistant message, got %#v", hydrated.Messages[1])
	}
	if hydrated.WaitingForResponse {
		t.Fatal("expected finalized live overlay to clear waiting state")
	}
}
