package chat

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"setta/internal/workspace"
)

type resolver map[string]workspace.WorkspaceSummary

type failingApprovalHarness struct {
	*FakeHarness
}

func (harness failingApprovalHarness) SubmitApproval(context.Context, ApprovalResponse) error {
	return errors.New("approval transport failed")
}

type approvalCompletesBeforeSubmitReturnsHarness struct {
	service *Service

	mu          sync.Mutex
	workspaceID string
	submitted   chan ApprovalResponse
}

func newApprovalCompletesBeforeSubmitReturnsHarness() *approvalCompletesBeforeSubmitReturnsHarness {
	return &approvalCompletesBeforeSubmitReturnsHarness{submitted: make(chan ApprovalResponse, 1)}
}

func (harness *approvalCompletesBeforeSubmitReturnsHarness) StartTurn(ctx context.Context, request TurnRequest, sink TurnSink) (TurnCompletion, error) {
	harness.mu.Lock()
	harness.workspaceID = request.Workspace.ID
	harness.mu.Unlock()
	if err := sink.ApprovalRequested(ApprovalRequest{Kind: ApprovalKindCommand, Title: "Run command", Command: "go test ./..."}); err != nil {
		return TurnCompletion{}, err
	}
	select {
	case <-harness.submitted:
		if err := sink.AssistantTextDelta("", "approved"); err != nil {
			return TurnCompletion{}, err
		}
		return TurnCompletion{Outcome: TurnOutcomeCompleted}, nil
	case <-ctx.Done():
		return TurnCompletion{}, ctx.Err()
	}
}

func (harness *approvalCompletesBeforeSubmitReturnsHarness) CancelTurn(context.Context, CancelRequest) error {
	return nil
}

func (harness *approvalCompletesBeforeSubmitReturnsHarness) SteerTurn(context.Context, SteerRequest) error {
	return nil
}

func (harness *approvalCompletesBeforeSubmitReturnsHarness) SubmitApproval(ctx context.Context, response ApprovalResponse) error {
	select {
	case harness.submitted <- response:
	case <-ctx.Done():
		return ctx.Err()
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		harness.mu.Lock()
		workspaceID := harness.workspaceID
		harness.mu.Unlock()
		run, err := harness.service.store.LoadRun(workspaceID, response.RunID)
		if err != nil {
			return err
		}
		if run.Status == RunStatusCompleted {
			return nil
		}
		time.Sleep(10 * time.Millisecond)
	}
	return errors.New("timed out waiting for approval run completion")
}

func (harness *approvalCompletesBeforeSubmitReturnsHarness) ResolveCodexEffectiveSettings(context.Context, workspace.WorkspaceSummary, Conversation) (*ChatCodexEffectiveSettings, error) {
	return nil, nil
}

type unavailableRefHarness struct{}

func (harness unavailableRefHarness) StartTurn(context.Context, TurnRequest, TurnSink) (TurnCompletion, error) {
	return TurnCompletion{}, &HarnessRefUnavailableError{
		Harness:  HarnessCodex,
		ThreadID: "thread_missing",
		Message:  "resume codex thread thread_missing: not found",
	}
}

func (harness unavailableRefHarness) CancelTurn(context.Context, CancelRequest) error {
	return nil
}

func (harness unavailableRefHarness) SteerTurn(context.Context, SteerRequest) error {
	return nil
}

func (harness unavailableRefHarness) SubmitApproval(context.Context, ApprovalResponse) error {
	return nil
}

func (harness unavailableRefHarness) ResolveCodexEffectiveSettings(context.Context, workspace.WorkspaceSummary, Conversation) (*ChatCodexEffectiveSettings, error) {
	return nil, nil
}

type preStartCancelHarness struct {
	started chan struct{}
}

func newPreStartCancelHarness() *preStartCancelHarness {
	return &preStartCancelHarness{started: make(chan struct{})}
}

func (harness *preStartCancelHarness) StartTurn(ctx context.Context, _ TurnRequest, _ TurnSink) (TurnCompletion, error) {
	close(harness.started)
	<-ctx.Done()
	return TurnCompletion{}, ctx.Err()
}

func (harness *preStartCancelHarness) CancelTurn(context.Context, CancelRequest) error {
	return ErrTurnNotStarted
}

func (harness *preStartCancelHarness) SteerTurn(context.Context, SteerRequest) error {
	return ErrTurnNotStarted
}

func (harness *preStartCancelHarness) SubmitApproval(context.Context, ApprovalResponse) error {
	return nil
}

func (harness *preStartCancelHarness) ResolveCodexEffectiveSettings(context.Context, workspace.WorkspaceSummary, Conversation) (*ChatCodexEffectiveSettings, error) {
	return nil, nil
}

func (harness *preStartCancelHarness) waitForStart(t *testing.T) {
	t.Helper()
	select {
	case <-harness.started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for harness start")
	}
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

func waitForRunStatus(t *testing.T, service *Service, workspaceID string, conversationID string, runID string, status RunStatus) Run {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		run, err := service.store.LoadRun(workspaceID, runID)
		if err != nil {
			t.Fatalf("load run: %v", err)
		}
		if run.Status == status {
			waitForTerminalRunCompletion(t, service, status)
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

func waitForTerminalRunCompletion(t *testing.T, service *Service, status RunStatus) {
	t.Helper()

	switch status {
	case RunStatusCancelled, RunStatusCompleted, RunStatusFailed:
		service.mu.Lock()
		service.mu.Unlock()
	}
}

func waitForPendingApproval(t *testing.T, service *Service, workspaceID string, conversationID string) Run {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		run, ok, err := service.ActiveRun(workspaceID, conversationID)
		if err != nil {
			t.Fatalf("active run: %v", err)
		}
		if ok && run.PendingApproval != nil {
			return run
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for pending approval")
	return Run{}
}

func waitForHarnessRef(t *testing.T, service *Service, workspaceID string, conversationID string, turnID string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		conversation, err := service.store.LoadConversation(workspaceID, conversationID)
		if err != nil {
			t.Fatalf("load conversation: %v", err)
		}
		for _, ref := range conversation.HarnessRefs {
			if ref.LastTurnID == turnID {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for harness turn %s", turnID)
}

func conversationIDs(items []ConversationListItem) []string {
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.Conversation.ID)
	}
	return ids
}

func waitForDiagnostic(t *testing.T, service *Service, code string) Diagnostic {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		diagnostics, err := service.store.ListDiagnostics()
		if err != nil {
			t.Fatalf("list diagnostics: %v", err)
		}
		for _, diagnostic := range diagnostics {
			if diagnostic.Code == code {
				return diagnostic
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	diagnostics, err := service.store.ListDiagnostics()
	if err != nil {
		t.Fatalf("list final diagnostics: %v", err)
	}
	t.Fatalf("diagnostics = %+v, want code %s", diagnostics, code)
	return Diagnostic{}
}

func steerWhenReady(t *testing.T, service *Service, workspaceID string, conversationID string, prompt string) SteerMessageResult {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		result, err := service.SteerActiveRun(workspaceID, conversationID, prompt)
		if err == nil {
			return result
		}
		lastErr = err
		if !errors.Is(err, ErrTurnNotStarted) {
			t.Fatalf("steer active: %v", err)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting to steer active turn: %v", lastErr)
	return SteerMessageResult{}
}

func waitForAssistantText(t *testing.T, service *Service, workspaceID string, conversationID string, text string) MessagePage {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		page, err := service.LoadMessagePage(workspaceID, conversationID, 0, 20)
		if err != nil {
			t.Fatalf("load message page: %v", err)
		}
		if len(page.Messages) > 1 && page.Messages[1].Parts[0].Text == text {
			return page
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for assistant text %q", text)
	return MessagePage{}
}
