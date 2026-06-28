package chat

import (
	"context"
	"errors"
	"testing"
)

type livenessReconcileHarness struct {
	*FakeHarness
	called chan struct{}
	err    error
	result HarnessRunLivenessResult
	resume chan struct{}
}

func newLivenessReconcileHarness(result HarnessRunLivenessResult, err error) *livenessReconcileHarness {
	return &livenessReconcileHarness{
		FakeHarness: NewFakeHarness([]FakeHarnessEvent{
			{Type: FakeEventThreadLinked, ThreadID: "thread_live", SessionID: "session_live", TurnID: "turn_live"},
			{Type: FakeEventWaitForCancel},
		}),
		called: make(chan struct{}),
		err:    err,
		result: result,
	}
}

func (harness *livenessReconcileHarness) ReconcileRunLiveness(ctx context.Context, request HarnessRunLivenessRequest) (HarnessRunLivenessResult, error) {
	select {
	case <-harness.called:
	default:
		close(harness.called)
	}
	if harness.resume != nil {
		select {
		case <-ctx.Done():
			return HarnessRunLivenessResult{}, ctx.Err()
		case <-harness.resume:
		}
	}
	if harness.err != nil {
		return HarnessRunLivenessResult{}, harness.err
	}
	result := harness.result
	if result.ThreadID == "" {
		result.ThreadID = request.ThreadID
	}
	if result.TurnID == "" {
		result.TurnID = request.TurnID
	}
	return result, nil
}

func TestServiceReconcileInProgressStaysReconcilingUntilFreshProviderEvent(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{
		ThreadStatus: HarnessThreadRuntimeActive,
		TurnFound:    true,
		TurnStatus:   HarnessTurnRuntimeInProgress,
	}, nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, result := startLinkedReconciliationRun(t, service)

	reconciled, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonWakeRecheck)
	if err != nil {
		t.Fatalf("reconcile active runs: %v", err)
	}
	if len(reconciled.Runs) != 1 || reconciled.Runs[0].Status != RunLivenessReconciling || reconciled.Runs[0].Reason != RunLivenessReasonWakeRecheck {
		t.Fatalf("reconciled liveness = %+v, want wake reconciling", reconciled.Runs)
	}
	_, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run after reconcile ok=%v err=%v", ok, err)
	}
	if liveness.Status != RunLivenessReconciling || liveness.Reason != RunLivenessReasonWakeRecheck {
		t.Fatalf("liveness after inProgress reconcile = %+v, want wake reconciling", *liveness)
	}

	if err := service.appendAssistantDelta("workspace_api", conversation.ID, result.Run.ID, "answer", "fresh"); err != nil {
		t.Fatalf("append fresh provider delta: %v", err)
	}
	_, liveness, ok, err = service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run after fresh event ok=%v err=%v", ok, err)
	}
	if liveness.Status != RunLivenessAttached || liveness.Reason != RunLivenessReasonProviderTurnLinked {
		t.Fatalf("liveness after fresh event = %+v, want attached", *liveness)
	}
}

func TestServiceReconcileDoesNotDowngradeFreshProviderEvent(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{
		ThreadStatus: HarnessThreadRuntimeActive,
		TurnFound:    true,
		TurnStatus:   HarnessTurnRuntimeInProgress,
	}, nil)
	harness.resume = make(chan struct{})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, result := startLinkedReconciliationRun(t, service)

	done := make(chan error, 1)
	go func() {
		_, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonStreamResync)
		done <- err
	}()
	<-harness.called
	if err := service.appendAssistantDelta("workspace_api", conversation.ID, result.Run.ID, "answer", "fresh"); err != nil {
		t.Fatalf("append fresh provider delta: %v", err)
	}
	close(harness.resume)
	if err := <-done; err != nil {
		t.Fatalf("reconcile active runs: %v", err)
	}

	_, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run after reconcile ok=%v err=%v", ok, err)
	}
	if liveness.Status != RunLivenessAttached {
		t.Fatalf("liveness after fresh-event race = %+v, want attached", *liveness)
	}
}

func TestServiceReconcileProviderUnavailableMarksLost(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{}, errors.New("thread/read unavailable"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, _ := startLinkedReconciliationRun(t, service)

	reconciled, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonStreamResync)
	if err != nil {
		t.Fatalf("reconcile active runs: %v", err)
	}
	if len(reconciled.Runs) != 1 {
		t.Fatalf("reconciled liveness count = %d, want 1", len(reconciled.Runs))
	}
	liveness := reconciled.Runs[0]
	if liveness.Status != RunLivenessLost ||
		liveness.Reason != RunLivenessReasonProviderUnavailable ||
		!liveness.Retryable ||
		!liveness.Cancellable ||
		liveness.Error != "thread/read unavailable" {
		t.Fatalf("lost liveness = %+v", liveness)
	}
}

func TestServiceReconcileMissingProviderTurnFailsRun(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{
		ThreadStatus: HarnessThreadRuntimeIdle,
		TurnFound:    false,
	}, nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, result := startLinkedReconciliationRun(t, service)

	if _, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonWakeRecheck); err != nil {
		t.Fatalf("reconcile active runs: %v", err)
	}
	run, err := service.store.LoadRun("workspace_api", result.Run.ID)
	if err != nil {
		t.Fatalf("load run: %v", err)
	}
	if run.Status != RunStatusFailed || run.Error != providerTurnInactiveRunError {
		t.Fatalf("run after missing provider turn = %+v, want failed interruption", run)
	}
	if _, _, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID); err != nil || ok {
		t.Fatalf("active run after missing provider turn ok=%v err=%v, want none", ok, err)
	}
}

func TestServiceCancelActiveRunIgnoresProviderInterruptFailure(t *testing.T) {
	harness := &cancelFailsHarness{FakeHarness: NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}})}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("hold"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	cancelled, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
	if cancelled.ID != result.Run.ID || cancelled.Status != RunStatusCancelled {
		t.Fatalf("cancelled run = %+v, want cancelled %s", cancelled, result.Run.ID)
	}
}

type cancelFailsHarness struct {
	*FakeHarness
}

func (harness *cancelFailsHarness) CancelTurn(context.Context, CancelRequest) error {
	return errors.New("stale provider turn")
}

func startLinkedReconciliationRun(t *testing.T, service *Service) (Conversation, SendMessageResult) {
	t.Helper()
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserInput("workspace_api", conversation.ID, TextChatInput("hold"))
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	t.Cleanup(func() {
		_, _ = service.CancelActiveRun("workspace_api", conversation.ID)
	})
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_live")
	return conversation, result
}
