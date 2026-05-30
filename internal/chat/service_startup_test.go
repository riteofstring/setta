package chat

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/workspace"
)

func TestServiceStartupRecordsMalformedRunStateAndContinues(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	corruptConversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "conversation_corrupt",
		WorkspaceID:   "workspace_api",
		Title:         "Corrupt",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs:   []HarnessThreadRef{},
	}
	validConversation := corruptConversation
	validConversation.ID = "conversation_valid"
	validConversation.Title = "Valid"
	validConversation.UpdatedAt = "2026-05-29T20:00:01Z"
	validConversation.WorkspaceID = "workspace_clean"
	if err := store.SaveConversation(corruptConversation); err != nil {
		t.Fatalf("save corrupt conversation: %v", err)
	}
	if err := store.SaveConversation(validConversation); err != nil {
		t.Fatalf("save valid conversation: %v", err)
	}
	path := store.runPath("workspace_api", "run_bad")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create run dir: %v", err)
	}
	raw := `{"schemaVersion":1,"id":"run_bad","workspaceId":"workspace_api","conversationId":"conversation_corrupt","triggerMessageId":"message_user","assistantMessageId":"","harness":"codex","status":"cancelled","startedAt":"2026-05-29T20:00:00Z","completedAt":"2026-05-29T20:00:01Z","promptSummary":"prompt","error":"turn cancelled","hasPendingApproval":false,"pendingApproval":{"id":"","runId":"","runItemId":"","providerItemId":"","kind":"","title":"","body":"","command":"","filePath":"","permission":"","question":"","options":[],"questions":[],"status":"","createdAt":"","resolvedAt":"","response":"","approved":false}}`
	if err := os.WriteFile(path, []byte(raw), 0o644); err != nil {
		t.Fatalf("write malformed run: %v", err)
	}

	resolver := testResolver(t)
	resolver["workspace_clean"] = workspace.WorkspaceSummary{
		ID:           "workspace_clean",
		RootPath:     t.TempDir(),
		DisplayName:  "clean",
		LastOpenedAt: "2026-05-29T20:00:00Z",
	}
	service, err := NewService(
		store,
		resolver,
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
	conversations, err := service.ListConversations("workspace_clean")
	if err != nil {
		t.Fatalf("list clean workspace conversations: %v", err)
	}
	if len(conversations) != 1 || conversations[0].Conversation.ID != "conversation_valid" {
		t.Fatalf("clean conversations = %+v, want valid conversation", conversations)
	}
	_, err = service.ListConversations("workspace_api")
	if err == nil {
		t.Fatal("list corrupt workspace conversations succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
	diagnostics, err := store.ListDiagnostics()
	if err != nil {
		t.Fatalf("list diagnostics: %v", err)
	}
	if len(diagnostics) == 0 || !strings.Contains(diagnostics[0].Message, "assistantMessageId is required unless queued") {
		t.Fatalf("diagnostics = %+v, want missing assistantMessageId", diagnostics)
	}
}

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
	_, err = service.ListConversations("workspace_api")
	if err == nil {
		t.Fatal("list conversations succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("list error = %T %v, want corrupt state", err, err)
	}
	if !strings.Contains(err.Error(), "assistant message message_missing was not found") {
		t.Fatalf("list error = %q, want missing assistant message", err)
	}
	diagnostics, err := store.ListDiagnostics()
	if err != nil {
		t.Fatalf("list diagnostics: %v", err)
	}
	if len(diagnostics) == 0 || !strings.Contains(diagnostics[0].Message, "assistant message message_missing was not found") {
		t.Fatalf("diagnostics = %+v, want missing assistant message", diagnostics)
	}
}
