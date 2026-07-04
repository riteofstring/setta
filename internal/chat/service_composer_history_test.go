package chat

import "testing"

func TestLoadComposerPromptHistoryProjectsPersistedUserInputsNewestFirst(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventAssistantDelta, Text: "done"}})
	harness.model = "scripted-fast"
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "History")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	attachment, err := service.CreateImageAttachmentFromBytes("workspace_api", conversation.ID, "fixture.png", testPNG(t, 3, 2))
	if err != nil {
		t.Fatalf("create image attachment: %v", err)
	}
	detail := ImageDetailHigh

	first, err := service.SendUserInput("workspace_api", conversation.ID, ChatInput{Parts: []ChatInputPart{
		{Type: MessagePartText, Text: &ChatTextInput{Text: "describe image", Format: TextFormatPlain}},
		{Type: MessagePartImage, Image: &ChatImageInput{AttachmentID: attachment.ID, Detail: &detail}},
	}})
	if err != nil {
		t.Fatalf("send first prompt: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, first.Run.ID, RunStatusCompleted)
	second, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("latest prompt"))
	if err != nil {
		t.Fatalf("send second prompt: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, second.Run.ID, RunStatusCompleted)

	page, err := service.LoadComposerPromptHistory("workspace_api", conversation.ID, 0, 1)
	if err != nil {
		t.Fatalf("load history page: %v", err)
	}
	assertLatestComposerPromptHistoryEntry(t, page, conversation.ID, second.UserMessage)

	older, err := service.LoadComposerPromptHistory("workspace_api", conversation.ID, page.OlderBeforeOrdinal, 10)
	if err != nil {
		t.Fatalf("load older history page: %v", err)
	}
	assertOlderComposerPromptHistoryEntry(t, older, first.UserMessage, attachment)
}

func assertLatestComposerPromptHistoryEntry(t *testing.T, page ComposerPromptHistoryPage, conversationID string, message ChatMessage) {
	t.Helper()

	if page.ConversationID != conversationID || !page.HasMoreOlder || page.OlderBeforeOrdinal != message.Ordinal {
		t.Fatalf("history page cursor = %+v, want conversation, more older, second ordinal", page)
	}
	if len(page.Entries) != 1 || page.Entries[0].MessageID != message.ID {
		t.Fatalf("history entries = %+v, want newest second prompt", page.Entries)
	}
	if got := page.Entries[0].Input.Parts[0].Text.Text; got != "latest prompt" {
		t.Fatalf("latest entry text = %q, want latest prompt", got)
	}
	if len(page.Entries[0].Attachments) != 0 {
		t.Fatalf("latest entry attachments = %+v, want none", page.Entries[0].Attachments)
	}
}

func assertOlderComposerPromptHistoryEntry(t *testing.T, older ComposerPromptHistoryPage, message ChatMessage, attachment ImageAttachment) {
	t.Helper()

	if older.HasMoreOlder || older.OlderBeforeOrdinal != message.Ordinal {
		t.Fatalf("older cursor = %+v, want terminal first ordinal", older)
	}
	if len(older.Entries) != 1 || older.Entries[0].MessageID != message.ID {
		t.Fatalf("older entries = %+v, want first prompt", older.Entries)
	}
	if len(older.Entries[0].Input.Parts) != 2 || older.Entries[0].Input.Parts[1].Image == nil {
		t.Fatalf("older input = %+v, want text and image parts", older.Entries[0].Input)
	}
	if older.Entries[0].Input.Parts[1].Image.AttachmentID != attachment.ID {
		t.Fatalf("older image input = %+v, want attachment %s", older.Entries[0].Input.Parts[1].Image, attachment.ID)
	}
	if len(older.Entries[0].Attachments) != 1 || older.Entries[0].Attachments[0].ID != attachment.ID {
		t.Fatalf("older attachments = %+v, want attachment descriptor", older.Entries[0].Attachments)
	}
	if len(older.Entries[0].Attachments[0].Variants) != len(imageAttachmentVariantKindValues) {
		t.Fatalf("older attachment variants = %+v, want typed variants", older.Entries[0].Attachments[0].Variants)
	}
}
