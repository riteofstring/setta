package chat

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
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
	raw := `{"schemaVersion":2,"id":"run_bad","workspaceId":"workspace_api","conversationId":"conversation_corrupt","triggerMessageId":"message_user","assistantMessageId":"message_assistant","harness":"codex","status":"cancelled","startedAt":"2026-05-29T20:00:00Z","completedAt":"2026-05-29T20:00:01Z","promptSummary":"prompt","error":"turn cancelled","pendingApproval":{"id":"approval_bad","runId":"run_bad","kind":"permission","title":"Permission","status":"pending","createdAt":"2026-05-29T20:00:00Z"}}`
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
	cleanList, err := service.ListConversations("workspace_clean")
	if err != nil {
		t.Fatalf("list clean workspace conversations: %v", err)
	}
	if len(cleanList.Conversations) != 1 || cleanList.Conversations[0].Conversation.ID != "conversation_valid" {
		t.Fatalf("clean conversations = %+v, want valid conversation", cleanList.Conversations)
	}
	corruptList, err := service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list corrupt workspace conversations: %v", err)
	}
	if !corruptList.Corruption.HasCorruption || corruptList.Corruption.Total != 1 {
		t.Fatalf("corruption = %+v, want one corrupt run", corruptList.Corruption)
	}
	diagnostics, err := store.ListDiagnostics()
	if err != nil {
		t.Fatalf("list diagnostics: %v", err)
	}
	if len(diagnostics) == 0 || !strings.Contains(diagnostics[0].Message, "has pendingApproval while status is cancelled") {
		t.Fatalf("diagnostics = %+v, want stale pending approval", diagnostics)
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
			ID:   "part_user",
			Type: MessagePartText,
			Text: &MessageTextPart{
				Text:   "prompt",
				Format: TextFormatPlain,
			},
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

func TestServicePostCommitStartupFailureFailsNormalRunAndAllowsNextSend(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newPostCommitStartupFailureService(t, harness, func(prefix string, ordinal int) error {
		if prefix == "transcript_block" && ordinal == 1 {
			return errors.New("injected transcript block id failure")
		}
		return nil
	})
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	_, err = service.SendUserInput("workspace_api", conversation.ID, TextChatInput("post commit failure"))
	if err == nil || !strings.Contains(err.Error(), "injected transcript block id failure") {
		t.Fatalf("send error = %v, want injected transcript block failure", err)
	}
	failed := assertSingleFailedStartupRun(t, service, "workspace_api", conversation.ID, "injected transcript block id failure")
	assertNoActiveRunOrLiveness(t, service, "workspace_api", conversation.ID)
	assertAssistantMessageStatus(t, service, "workspace_api", conversation.ID, failed.AssistantMessageID, MessageStatusError)
	if requests := harness.TurnRequests(); len(requests) != 0 {
		t.Fatalf("harness requests = %+v, want none before failed startup launch", requests)
	}

	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("after startup failure"))
	if err != nil {
		t.Fatalf("send after startup failure: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	if requests := harness.TurnRequests(); len(requests) != 1 || requests[0].Run.ID != result.Run.ID {
		t.Fatalf("harness requests after retry = %+v, want only successful retry", requests)
	}
}

func TestServicePostCommitStartupFailureFailsWorkflowAgentRun(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newPostCommitStartupFailureService(t, harness, func(prefix string, ordinal int) error {
		if prefix == "transcript_block" && ordinal == 1 {
			return errors.New("injected workflow transcript block id failure")
		}
		return nil
	})

	_, err := service.SendWorkflowAgentTurn("workspace_api", WorkflowAgentTurnRequest{
		DefinitionID:        "definition_startup_failure",
		DefinitionVersionID: "version_startup_failure",
		ExecutionID:         "execution_startup_failure",
		NodeID:              "node_startup_failure",
		NodeExecutionID:     "node_execution_startup_failure",
		Prompt:              "workflow post commit failure",
	})
	if err == nil || !strings.Contains(err.Error(), "injected workflow transcript block id failure") {
		t.Fatalf("workflow send error = %v, want injected transcript block failure", err)
	}
	conversations, err := service.ListWorkflowConversations("workspace_api")
	if err != nil {
		t.Fatalf("list workflow conversations: %v", err)
	}
	if len(conversations) != 1 {
		t.Fatalf("workflow conversations = %+v, want one failed conversation", conversations)
	}
	conversationID := conversations[0].ID
	failed := assertSingleFailedStartupRun(t, service, "workspace_api", conversationID, "injected workflow transcript block id failure")
	assertNoActiveRunOrLiveness(t, service, "workspace_api", conversationID)
	assertAssistantMessageStatus(t, service, "workspace_api", conversationID, failed.AssistantMessageID, MessageStatusError)
	if requests := harness.TurnRequests(); len(requests) != 0 {
		t.Fatalf("harness requests = %+v, want none before failed workflow startup launch", requests)
	}
}

func TestServicePostCommitStartupFailureFailsPromotedQueuedRunAndAllowsNextSend(t *testing.T) {
	harness := newBlockingCompletionHarness()
	service := newPostCommitStartupFailureService(t, harness, func(prefix string, ordinal int) error {
		if prefix == "transcript_block" && ordinal == 2 {
			return errors.New("injected queued promotion transcript block id failure")
		}
		return nil
	})
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("active before queued failure"))
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	harness.waitForStarts(t, 1)
	queued, err := service.QueueUserInput("workspace_api", conversation.ID, TextChatInput("queued promotion failure"))
	if err != nil {
		t.Fatalf("queue input: %v", err)
	}

	harness.releaseAll()
	waitForRunStatus(t, service, "workspace_api", conversation.ID, active.Run.ID, RunStatusCompleted)
	failed := waitForRunStatus(t, service, "workspace_api", conversation.ID, queued.Run.ID, RunStatusFailed)
	if !strings.Contains(failed.Error, "injected queued promotion transcript block id failure") {
		t.Fatalf("queued failure error = %q, want injected startup failure", failed.Error)
	}
	assertNoActiveRunOrLiveness(t, service, "workspace_api", conversation.ID)
	assertAssistantMessageStatus(t, service, "workspace_api", conversation.ID, failed.AssistantMessageID, MessageStatusError)
	if requests := harness.TurnRequests(); len(requests) != 1 || requests[0].Run.ID != active.Run.ID {
		t.Fatalf("harness requests = %+v, want only original active run", requests)
	}

	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("after queued startup failure"))
	if err != nil {
		t.Fatalf("send after queued startup failure: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	if requests := harness.TurnRequests(); len(requests) != 2 || requests[1].Run.ID != result.Run.ID {
		t.Fatalf("harness requests after retry = %+v, want successful retry after queued failure", requests)
	}
}

func newPostCommitStartupFailureService(t *testing.T, harness Harness, fail func(prefix string, ordinal int) error) *Service {
	t.Helper()

	idCounter := 0
	prefixCounts := map[string]int{}
	service, err := NewService(
		mustStore(t, t.TempDir()),
		testResolver(t),
		harness,
		WithClock(func() time.Time {
			return mustTime(t, "2026-05-29T20:00:00Z")
		}),
		WithIDGenerator(func(prefix string) (string, error) {
			prefixCounts[prefix]++
			if fail != nil {
				if err := fail(prefix, prefixCounts[prefix]); err != nil {
					return "", err
				}
			}
			idCounter++
			return fmt.Sprintf("%s_%04d", prefix, idCounter), nil
		}),
	)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func assertSingleFailedStartupRun(t *testing.T, service *Service, workspaceID string, conversationID string, wantError string) Run {
	t.Helper()

	runs, err := service.ListRuns(workspaceID, conversationID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs = %+v, want one failed startup run", runs)
	}
	run := runs[0]
	if run.Status != RunStatusFailed || !strings.Contains(run.Error, wantError) {
		t.Fatalf("run = %+v, want failed startup error containing %q", run, wantError)
	}
	return run
}

func assertNoActiveRunOrLiveness(t *testing.T, service *Service, workspaceID string, conversationID string) {
	t.Helper()

	if _, ok, err := service.ActiveRun(workspaceID, conversationID); err != nil || ok {
		t.Fatalf("active run = ok %v err %v, want none", ok, err)
	}
	if _, liveness, ok, err := service.ActiveRunWithLiveness(workspaceID, conversationID); err != nil || ok || liveness != nil {
		t.Fatalf("active run with liveness = ok %v liveness %+v err %v, want none", ok, liveness, err)
	}
}

func assertAssistantMessageStatus(t *testing.T, service *Service, workspaceID string, conversationID string, messageID string, status MessageStatus) {
	t.Helper()

	message, ok, err := service.store.FindMessageByID(workspaceID, conversationID, messageID)
	if err != nil {
		t.Fatalf("find assistant message: %v", err)
	}
	if !ok {
		t.Fatalf("assistant message %s was not found", messageID)
	}
	if message.Status != status {
		t.Fatalf("assistant message status = %s, want %s: %+v", message.Status, status, message)
	}
}

type blockingCompletionHarness struct {
	mu       sync.Mutex
	release  chan struct{}
	requests []TurnRequest
	started  chan TurnRequest
}

func newBlockingCompletionHarness() *blockingCompletionHarness {
	return &blockingCompletionHarness{
		release: make(chan struct{}),
		started: make(chan TurnRequest, 8),
	}
}

func (harness *blockingCompletionHarness) StartTurn(ctx context.Context, request TurnRequest, _ TurnSink) (TurnCompletion, error) {
	harness.mu.Lock()
	harness.requests = append(harness.requests, request)
	harness.mu.Unlock()
	harness.started <- request
	select {
	case <-harness.release:
		return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
	case <-ctx.Done():
		return TurnCompletion{}, ctx.Err()
	}
}

func (harness *blockingCompletionHarness) CancelTurn(context.Context, CancelRequest) error {
	return nil
}

func (harness *blockingCompletionHarness) SteerTurn(context.Context, SteerRequest) error {
	return nil
}

func (harness *blockingCompletionHarness) SubmitApproval(context.Context, ApprovalResponse) error {
	return nil
}

func (harness *blockingCompletionHarness) ResolveCodexEffectiveSettings(context.Context, workspace.WorkspaceSummary, Conversation) (*ChatCodexEffectiveSettings, error) {
	return nil, nil
}

func (harness *blockingCompletionHarness) TurnRequests() []TurnRequest {
	harness.mu.Lock()
	defer harness.mu.Unlock()

	return append([]TurnRequest{}, harness.requests...)
}

func (harness *blockingCompletionHarness) waitForStarts(t *testing.T, count int) {
	t.Helper()

	for index := 0; index < count; index++ {
		select {
		case <-harness.started:
		case <-time.After(2 * time.Second):
			t.Fatalf("timed out waiting for harness start %d", index+1)
		}
	}
}

func (harness *blockingCompletionHarness) releaseAll() {
	close(harness.release)
}
