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

func TestNewAIFollowToolResultUpdateMessage(t *testing.T) {
	t.Parallel()

	message := NewAIFollowToolResultUpdateMessage(AIFollowToolResultUpdateContent{
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		IDsByType: map[string][]string{
			"section": {"section-1"},
		},
	})
	if message.MessageType != MessageTypeAIFollowToolResultUpdate {
		t.Fatalf("expected ai follow tool result update message type, got %q", message.MessageType)
	}
	if message.Content.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha project id, got %q", message.Content.ProjectConfigID)
	}
	if got := message.Content.IDsByType["section"]; len(got) != 1 || got[0] != "section-1" {
		t.Fatalf("unexpected result-follow ids %#v", message.Content.IDsByType)
	}
}

func stringPtr(value string) *string {
	return &value
}
