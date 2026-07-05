package chat

import "testing"

func TestServiceMarksRunningRunsFailedAfterRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	conversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "conversation_api",
		WorkspaceID:   "workspace_api",
		Title:         "API",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs:   []HarnessThreadRef{},
	}
	if err := store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
	if err := store.SaveMessage("workspace_api", ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_user",
		ConversationID: conversation.ID,
		RunID:          "run_api",
		Role:           RoleUser,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        1,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			ID:   "part_user",
			Type: MessagePartText,
			Text: &MessageTextPart{Text: "prompt", Format: TextFormatPlain},
		}},
	}); err != nil {
		t.Fatalf("save user message: %v", err)
	}
	if err := store.SaveMessage("workspace_api", ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_assistant",
		ConversationID: conversation.ID,
		RunID:          "run_api",
		Role:           RoleAssistant,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        2,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         MessageStatusStreaming,
		Parts: []MessagePart{{
			ID:   "part_assistant",
			Type: MessagePartText,
			Text: &MessageTextPart{Text: "partial", Format: TextFormatMarkdown},
		}},
	}); err != nil {
		t.Fatalf("save message: %v", err)
	}
	if err := store.SaveRun(Run{
		SchemaVersion:      SchemaVersion,
		ID:                 "run_api",
		WorkspaceID:        "workspace_api",
		ConversationID:     conversation.ID,
		TriggerMessageID:   "message_user",
		AssistantMessageID: "message_assistant",
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          "2026-05-29T20:00:00Z",
		PromptSummary:      "prompt",
	}); err != nil {
		t.Fatalf("save run: %v", err)
	}

	restarted := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	run, err := restarted.store.LoadRun("workspace_api", "run_api")
	if err != nil {
		t.Fatalf("load recovered run: %v", err)
	}
	if run.Status != RunStatusFailed || run.Error != "run interrupted by backend restart" {
		t.Fatalf("recovered run = %+v, want failed restart error", run)
	}
	page, err := restarted.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load recovered page: %v", err)
	}
	if len(page.Messages) != 2 {
		t.Fatalf("message count = %d, want 2", len(page.Messages))
	}
	if page.Messages[0].ID != "message_user" || page.Messages[0].Status != MessageStatusComplete {
		t.Fatalf("user message = %+v, want complete user message", page.Messages[0])
	}
	if page.Messages[1].ID != "message_assistant" || page.Messages[1].Status != MessageStatusError {
		t.Fatalf("assistant message = %+v, want error assistant message", page.Messages[1])
	}
}
