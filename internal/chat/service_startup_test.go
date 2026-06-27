package chat

import (
	"strings"
	"testing"
	"time"
)

func TestServiceStartupRecordsMissingAssistantMessageAndContinues(t *testing.T) {
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
			Format: TextFormatPlain,
			ID:     "part_user",
			Text:   "prompt",
			Type:   MessagePartText,
		}},
	}); err != nil {
		t.Fatalf("save user message: %v", err)
	}
	if err := store.SaveRun(Run{
		SchemaVersion:      SchemaVersion,
		ID:                 "run_api",
		WorkspaceID:        "workspace_api",
		ConversationID:     conversation.ID,
		TriggerMessageID:   "message_user",
		AssistantMessageID: "message_missing",
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          "2026-05-29T20:00:00Z",
		PromptSummary:      "prompt",
	}); err != nil {
		t.Fatalf("save run: %v", err)
	}

	service, err := NewService(
		store,
		testResolver(t),
		NewFakeHarness(nil),
		WithClock(func() time.Time {
			return mustTime(t, "2026-05-29T20:00:00Z")
		}),
		WithIDGenerator(func(prefix string) (string, error) {
			return prefix + "_test", nil
		}),
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	list, err := service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	if !list.Corruption.HasCorruption || list.Corruption.Total != 1 {
		t.Fatalf("corruption = %+v, want missing assistant message", list.Corruption)
	}
	if len(list.Diagnostics) != 1 || !strings.Contains(list.Diagnostics[0].Message, "assistant message message_missing was not found") {
		t.Fatalf("diagnostics = %+v, want missing assistant message", list.Diagnostics)
	}
	diagnostics, err := store.ListDiagnostics()
	if err != nil {
		t.Fatalf("list diagnostics: %v", err)
	}
	if len(diagnostics) == 0 || !strings.Contains(diagnostics[0].Message, "assistant message message_missing was not found") {
		t.Fatalf("diagnostics = %+v, want missing assistant message", diagnostics)
	}
}
