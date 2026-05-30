package chat

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/workspace"
)

func TestServicePersistsConversationMessagesAndRunsAcrossRestart(t *testing.T) {
	appDataDir := t.TempDir()
	resolver := testResolver(t)
	harness := NewFakeHarness(nil)
	service := newTestService(t, appDataDir, resolver, harness)

	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "Explain Phase 3")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	run := waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	if run.Error != "" {
		t.Fatalf("completed run error = %q, want empty", run.Error)
	}

	restarted := newTestService(t, appDataDir, resolver, NewFakeHarness(nil))
	conversations, err := restarted.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations after restart: %v", err)
	}
	if len(conversations) != 1 {
		t.Fatalf("conversation count = %d, want 1", len(conversations))
	}
	if conversations[0].MessageCount != 2 {
		t.Fatalf("message count = %d, want 2", conversations[0].MessageCount)
	}

	latest, err := restarted.LoadMessagePage("workspace_api", conversation.ID, 0, 1)
	if err != nil {
		t.Fatalf("load latest page: %v", err)
	}
	if len(latest.Messages) != 1 || latest.Messages[0].Role != RoleAssistant {
		t.Fatalf("latest messages = %+v, want assistant only", latest.Messages)
	}
	if !strings.Contains(latest.Messages[0].Parts[0].Text, "Explain Phase 3") {
		t.Fatalf("assistant text = %q, want streamed fake response", latest.Messages[0].Parts[0].Text)
	}
	if !latest.HasMoreOlder {
		t.Fatal("latest page hasMoreOlder = false, want true")
	}

	older, err := restarted.LoadMessagePage("workspace_api", conversation.ID, latest.OlderBeforeOrdinal, 1)
	if err != nil {
		t.Fatalf("load older page: %v", err)
	}
	if len(older.Messages) != 1 || older.Messages[0].Role != RoleUser {
		t.Fatalf("older messages = %+v, want user only", older.Messages)
	}
}

func TestServiceKeepsUserMessageWhenHarnessFails(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventError, Error: "codex app-server failed to start"}})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "Will this persist?")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	run := waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusFailed)
	if !strings.Contains(run.Error, "codex app-server failed") {
		t.Fatalf("run error = %q, want harness failure", run.Error)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if len(page.Messages) != 2 {
		t.Fatalf("message count = %d, want user and assistant placeholder", len(page.Messages))
	}
	if page.Messages[0].Role != RoleUser || page.Messages[0].Parts[0].Text != "Will this persist?" {
		t.Fatalf("user message = %+v, want persisted prompt", page.Messages[0])
	}
	if page.Messages[1].Status != MessageStatusError {
		t.Fatalf("assistant status = %q, want error", page.Messages[1].Status)
	}
}

func TestServiceCancelsActiveRunThroughHarness(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventAssistantDelta, Text: "partial"},
		{Type: FakeEventWaitForCancel},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "stop")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	run, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("cancel run: %v", err)
	}
	if run.ID != result.Run.ID || run.Status != RunStatusCancelled {
		t.Fatalf("cancelled run = %+v, want %s cancelled", run, result.Run.ID)
	}
	cancelled := harness.CancelledRequests()
	if len(cancelled) != 1 || cancelled[0].RunID != result.Run.ID {
		t.Fatalf("cancelled requests = %+v, want run %s", cancelled, result.Run.ID)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if page.Messages[1].Status != MessageStatusCancelled {
		t.Fatalf("assistant status = %q, want cancelled", page.Messages[1].Status)
	}
}

func TestServiceSurfacesAndResolvesApprovalRequests(t *testing.T) {
	approval := ApprovalRequest{
		Kind:       ApprovalKindCommand,
		Title:      "Run command",
		Body:       "Codex wants to run a command",
		Command:    "go test ./...",
		Options:    []string{},
		FilePath:   "",
		Permission: "",
		Question:   "",
	}
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventApproval, Approval: approval, WaitForApproval: true},
		{Type: FakeEventAssistantDelta, Text: "approved"},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "needs approval")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	run := waitForPendingApproval(t, service, "workspace_api", conversation.ID)
	if run.PendingApproval.Command != "go test ./..." {
		t.Fatalf("approval command = %q, want go test", run.PendingApproval.Command)
	}

	if _, err := service.SubmitApproval("workspace_api", conversation.ID, run.PendingApproval.ID, true, "", false); err != nil {
		t.Fatalf("submit approval: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	responses := harness.ApprovalResponses()
	if len(responses) != 1 || !responses[0].Approved {
		t.Fatalf("approval responses = %+v, want approved response", responses)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if page.Messages[1].Parts[0].Text != "approved" {
		t.Fatalf("assistant text = %q, want approved", page.Messages[1].Parts[0].Text)
	}
}

func TestServiceKeepsApprovalPendingWhenHarnessRejectsResponse(t *testing.T) {
	approval := ApprovalRequest{
		Kind:    ApprovalKindCommand,
		Title:   "Run command",
		Command: "go test ./...",
	}
	harness := failingApprovalHarness{FakeHarness: NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventApproval, Approval: approval, WaitForApproval: true},
	})}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.SendUserMessage("workspace_api", conversation.ID, "needs approval"); err != nil {
		t.Fatalf("send message: %v", err)
	}
	run := waitForPendingApproval(t, service, "workspace_api", conversation.ID)

	if _, err := service.SubmitApproval("workspace_api", conversation.ID, run.PendingApproval.ID, true, "", false); err == nil {
		t.Fatal("submit approval succeeded, want harness error")
	}
	run, ok, err := service.ActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("active run after failed approval: %v", err)
	}
	if !ok || !run.HasPendingApproval {
		t.Fatalf("active run = %+v ok=%v, want approval still pending", run, ok)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel cleanup: %v", err)
	}
}

func TestStoreIgnoresTemporaryJSONFiles(t *testing.T) {
	store := mustStore(t, t.TempDir())
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
	if err := os.MkdirAll(store.messagesDir("workspace_api", conversation.ID), 0o755); err != nil {
		t.Fatalf("create messages dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(store.messagesDir("workspace_api", conversation.ID), ".tmp-message.json"), []byte("{"), 0o644); err != nil {
		t.Fatalf("write temp message: %v", err)
	}
	if err := store.SaveMessage("workspace_api", ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_api",
		ConversationID: conversation.ID,
		Role:           RoleUser,
		Ordinal:        1,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			Format: TextFormatPlain,
			ID:     "part_api",
			Text:   "hello",
			Type:   MessagePartText,
		}},
	}); err != nil {
		t.Fatalf("save message: %v", err)
	}
	if err := os.MkdirAll(store.runsDir("workspace_api"), 0o755); err != nil {
		t.Fatalf("create runs dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(store.runsDir("workspace_api"), ".tmp-run.json"), []byte("{"), 0o644); err != nil {
		t.Fatalf("write temp run: %v", err)
	}

	page, err := store.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if len(page.Messages) != 1 {
		t.Fatalf("message count = %d, want 1", len(page.Messages))
	}
	if _, ok, err := store.ActiveRun("workspace_api", conversation.ID); err != nil || ok {
		t.Fatalf("active run = ok %v err %v, want none and no temp-file error", ok, err)
	}
}

func TestStoreRejectsMalformedConversationState(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	conversationPath := store.conversationPath("workspace_api", "conversation_bad")
	if err := os.MkdirAll(filepath.Dir(conversationPath), 0o755); err != nil {
		t.Fatalf("create conversation dir: %v", err)
	}
	if err := os.WriteFile(conversationPath, []byte(`{"schemaVersion":1,"id":"conversation_bad","workspaceId":"workspace_api","title":"Bad","createdAt":"2026-05-29T20:00:00Z","updatedAt":"2026-05-29T20:00:00Z","archivedAt":"","harnessRefs":[],"extra":true}`), 0o644); err != nil {
		t.Fatalf("write malformed conversation: %v", err)
	}

	_, err = store.LoadConversation("workspace_api", "conversation_bad")
	if err == nil {
		t.Fatal("load conversation succeeded, want malformed state error")
	}
	if !strings.Contains(err.Error(), `unknown field "extra"`) {
		t.Fatalf("error = %q, want unknown field", err)
	}
}

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
		ID:             "message_assistant",
		ConversationID: conversation.ID,
		RunID:          "run_api",
		Role:           RoleAssistant,
		Ordinal:        1,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         MessageStatusStreaming,
		Parts: []MessagePart{{
			Format: TextFormatMarkdown,
			ID:     "part_assistant",
			Text:   "partial",
			Type:   MessagePartText,
		}},
	}); err != nil {
		t.Fatalf("save message: %v", err)
	}
	if err := store.SaveRun(Run{
		SchemaVersion:    SchemaVersion,
		ID:               "run_api",
		WorkspaceID:      "workspace_api",
		ConversationID:   conversation.ID,
		TriggerMessageID: "message_user",
		Harness:          HarnessCodex,
		Status:           RunStatusRunning,
		StartedAt:        "2026-05-29T20:00:00Z",
		PromptSummary:    "prompt",
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
	if page.Messages[0].Status != MessageStatusError {
		t.Fatalf("message status = %q, want error", page.Messages[0].Status)
	}
}

type resolver map[string]workspace.WorkspaceSummary

type failingApprovalHarness struct {
	*FakeHarness
}

func (harness failingApprovalHarness) SubmitApproval(context.Context, ApprovalResponse) error {
	return errors.New("approval transport failed")
}

func (resolver resolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	summary, ok := resolver[id]
	if !ok {
		return workspace.WorkspaceSummary{}, os.ErrNotExist
	}
	return summary, nil
}

func testResolver(t *testing.T) resolver {
	t.Helper()

	rootPath := t.TempDir()
	return resolver{
		"workspace_api": {
			ID:           "workspace_api",
			RootPath:     rootPath,
			DisplayName:  "api",
			LastOpenedAt: "2026-05-29T20:00:00Z",
		},
	}
}

func newTestService(t *testing.T, appDataDir string, resolver resolver, harness Harness) *Service {
	t.Helper()

	idCounter := 0
	service, err := NewService(
		mustStore(t, appDataDir),
		resolver,
		harness,
		WithClock(func() time.Time {
			return mustTime(t, "2026-05-29T20:00:00Z")
		}),
		WithIDGenerator(func(prefix string) (string, error) {
			idCounter++
			return fmt.Sprintf("%s_%04d", prefix, idCounter), nil
		}),
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func mustStore(t *testing.T, appDataDir string) *Store {
	t.Helper()

	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return store
}

func waitForRunStatus(t *testing.T, service *Service, workspaceID string, conversationID string, runID string, status string) Run {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		run, err := service.store.LoadRun(workspaceID, runID)
		if err != nil {
			t.Fatalf("load run: %v", err)
		}
		if run.Status == status {
			return run
		}
		time.Sleep(10 * time.Millisecond)
	}
	run, err := service.store.LoadRun(workspaceID, runID)
	if err != nil {
		t.Fatalf("load final run: %v", err)
	}
	t.Fatalf("run status = %q, want %q", run.Status, status)
	return Run{}
}

func waitForPendingApproval(t *testing.T, service *Service, workspaceID string, conversationID string) Run {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		run, ok, err := service.ActiveRun(workspaceID, conversationID)
		if err != nil {
			t.Fatalf("active run: %v", err)
		}
		if ok && run.HasPendingApproval {
			return run
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for pending approval")
	return Run{}
}

func mustTime(t *testing.T, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		t.Fatalf("parse time %q: %v", value, err)
	}
	return parsed
}
