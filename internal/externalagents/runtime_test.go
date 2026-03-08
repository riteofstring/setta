package externalagents

import (
	"errors"
	"testing"
	"time"

	"setta/internal/agentruns"
)

type stubRunController struct {
	cancelCalls   int
	cancelErr     error
	approvalCalls []stubApprovalCall
	approvalErr   error
}

type stubApprovalCall struct {
	ApprovalID string
	Approved   bool
}

func (s *stubRunController) Cancel() error {
	s.cancelCalls++
	return s.cancelErr
}

func (s *stubRunController) SendApprovalResponse(approvalID string, approved bool) error {
	s.approvalCalls = append(s.approvalCalls, stubApprovalCall{
		ApprovalID: approvalID,
		Approved:   approved,
	})
	return s.approvalErr
}

func TestRuntimeActivatesRunAndStoresLiveChatState(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	_, _ = store, runtime
	controller := &stubRunController{}
	if err := runtime.ActivateRun("run-active", controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.SetLiveChatState("run-active", ChatState{
		Messages: []map[string]any{
			{"id": "assistant-1", "role": "assistant", "content": []any{map[string]any{"type": "text", "text": "live"}}},
		},
		WaitingForResponse: true,
		ToolCallArguments:  map[string]string{"tool-call-1": "{\"path\":\"README.md\"}"},
	}); err != nil {
		t.Fatalf("set live chat state: %v", err)
	}
	state, err := runtime.GetLiveChatState("run-active")
	if err != nil {
		t.Fatalf("get live chat state: %v", err)
	}
	if state == nil || !state.WaitingForResponse {
		t.Fatalf("expected live waiting state, got %#v", state)
	}
	if got := state.ToolCallArguments["tool-call-1"]; got != "{\"path\":\"README.md\"}" {
		t.Fatalf("unexpected tool call arguments %q", got)
	}
}

func TestRuntimeStopRunCancelsControllerAndPersistsCancelledRun(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-stop", agentruns.RunStatusRunning)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.RegisterApproval(ApprovalState{
		ApprovalID:      "approval-stop",
		RunID:           run.ID,
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	}); err != nil {
		t.Fatalf("register approval: %v", err)
	}

	stopped, err := runtime.StopRun(run.ID)
	if err != nil {
		t.Fatalf("stop run: %v", err)
	}
	if stopped.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled run, got %q", stopped.Status)
	}
	if stopped.FinishedAt == nil {
		t.Fatal("expected finishedAt to be set")
	}
	if controller.cancelCalls != 1 {
		t.Fatalf("expected one cancel call, got %d", controller.cancelCalls)
	}
	persisted, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load stopped run: %v", err)
	}
	if persisted.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected persisted cancelled status, got %q", persisted.Status)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "run_cancelled" {
		t.Fatalf("expected run_cancelled event, got %#v", lastEvent)
	}
	state, err := runtime.GetLiveChatState(run.ID)
	if err != nil {
		t.Fatalf("get live chat state after stop: %v", err)
	}
	if state != nil {
		t.Fatalf("expected live state cleanup after stop, got %#v", state)
	}
	if err := runtime.RespondToApproval("approval-stop", true); !errors.Is(err, ErrApprovalNotFound) {
		t.Fatalf("expected approval cleanup after stop, got %v", err)
	}
}

func TestRuntimeStopRunMarksPersistedRunningRunCancelledWithoutActiveController(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-persisted", agentruns.RunStatusRunning)

	stopped, err := runtime.StopRun(run.ID)
	if err != nil {
		t.Fatalf("stop run without active controller: %v", err)
	}
	if stopped.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled status, got %q", stopped.Status)
	}
}

func TestRuntimeRespondToApprovalDispatchesAndPersistsEvent(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-approval", agentruns.RunStatusRunning)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := runtime.RegisterApproval(ApprovalState{
		ApprovalID:      "approval-1",
		RunID:           run.ID,
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	}); err != nil {
		t.Fatalf("register approval: %v", err)
	}

	if err := runtime.RespondToApproval("approval-1", true); err != nil {
		t.Fatalf("respond to approval: %v", err)
	}
	if len(controller.approvalCalls) != 1 {
		t.Fatalf("expected one approval dispatch, got %#v", controller.approvalCalls)
	}
	if controller.approvalCalls[0].ApprovalID != "approval-1" || !controller.approvalCalls[0].Approved {
		t.Fatalf("unexpected approval dispatch %#v", controller.approvalCalls[0])
	}
	persisted, err := store.Load(run.ID)
	if err != nil {
		t.Fatalf("load run after approval response: %v", err)
	}
	lastEvent := persisted.Events[len(persisted.Events)-1]
	if lastEvent.Type != "approval_response" {
		t.Fatalf("expected approval_response event, got %#v", lastEvent)
	}
	if err := runtime.RespondToApproval("approval-1", true); !errors.Is(err, ErrApprovalNotFound) {
		t.Fatalf("expected approval to be removed after response, got %v", err)
	}
}

func TestRuntimeRejectsApprovalRegistrationForInactiveRun(t *testing.T) {
	t.Parallel()

	_, runtime := buildRuntimeFixture(t)
	err := runtime.RegisterApproval(ApprovalState{
		ApprovalID:      "approval-missing",
		RunID:           "run-missing",
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	})
	if !errors.Is(err, ErrRunNotActive) {
		t.Fatalf("expected ErrRunNotActive, got %v", err)
	}
}

func TestRuntimeReturnsPersistedTerminalRunWithoutCancel(t *testing.T) {
	t.Parallel()

	store, runtime := buildRuntimeFixture(t)
	run := newPersistedRuntimeRun(t, store, "run-complete", agentruns.RunStatusCompleted)
	controller := &stubRunController{}
	if err := runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}

	stopped, err := runtime.StopRun(run.ID)
	if err != nil {
		t.Fatalf("stop completed run: %v", err)
	}
	if stopped.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run to remain completed, got %q", stopped.Status)
	}
	if controller.cancelCalls != 0 {
		t.Fatalf("expected no cancel call for completed run, got %d", controller.cancelCalls)
	}
}

func buildRuntimeFixture(t *testing.T) (*agentruns.RunStore, *Runtime) {
	t.Helper()

	store, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	runtime, err := NewRuntime(RuntimeOptions{
		Runs: store,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	return store, runtime
}

func newPersistedRuntimeRun(t *testing.T, store *agentruns.RunStore, runID string, status agentruns.RunStatus) agentruns.Run {
	t.Helper()

	now := time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC)
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         RunTypeExternalAgent,
		"chatId":          "chat-alpha",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-alpha",
		"messages":        []any{},
	}, now)
	run.ID = runID
	run.Status = status
	if status != agentruns.RunStatusRunning {
		finishedAt := now.Add(time.Minute)
		run.FinishedAt = &finishedAt
	}
	if err := store.Save(run); err != nil {
		t.Fatalf("save persisted runtime run: %v", err)
	}
	return run
}
