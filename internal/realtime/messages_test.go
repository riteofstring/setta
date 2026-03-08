package realtime

import "testing"

func TestNewLLMStreamingResponseMessage(t *testing.T) {
	t.Parallel()

	message := NewLLMStreamingResponseMessage(LLMStreamingResponseContent{
		ChatID: "chat-alpha",
		Chunk: MessageStopEvent{
			Type:      StreamingEventTypeMessageStop,
			MessageID: "assistant-1",
		},
		SectionID:       stringPtr("section-chat"),
		ProjectConfigID: stringPtr("project-alpha"),
	})
	if message.MessageType != MessageTypeLLMStreamingResponse {
		t.Fatalf("expected llm streaming message type, got %q", message.MessageType)
	}
	if message.Content.ChatID != "chat-alpha" {
		t.Fatalf("expected chat-alpha chat id, got %q", message.Content.ChatID)
	}
	if message.Content.SectionID == nil || *message.Content.SectionID != "section-chat" {
		t.Fatalf("expected section id section-chat, got %#v", message.Content.SectionID)
	}
}

func stringPtr(value string) *string {
	return &value
}
