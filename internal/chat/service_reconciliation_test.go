package chat

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
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

func TestServiceSnapshotReconcilePreservesAttachedLivenessWithoutPublishingReconnect(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{
		ThreadStatus: HarnessThreadRuntimeActive,
		TurnFound:    true,
		TurnStatus:   HarnessTurnRuntimeInProgress,
	}, nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, result := startLinkedReconciliationRun(t, service)
	subscription := subscribeFromCurrentEvent(t, service)
	defer subscription.Unsubscribe()

	snapshot, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonSnapshotLoad)
	if err != nil {
		t.Fatalf("snapshot reconcile: %v", err)
	}
	if len(snapshot.Runs) != 1 {
		t.Fatalf("snapshot liveness count = %d, want 1", len(snapshot.Runs))
	}
	if snapshot.Runs[0].Status != RunLivenessAttached ||
		snapshot.Runs[0].Reason != RunLivenessReasonProviderTurnLinked ||
		snapshot.Runs[0].RunID != result.Run.ID {
		t.Fatalf("snapshot liveness = %+v, want attached provider-linked run %s", snapshot.Runs[0], result.Run.ID)
	}
	assertNoImmediateEvent(t, subscription)

	_, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run after snapshot ok=%v err=%v", ok, err)
	}
	if liveness.Status != RunLivenessAttached || liveness.Reason != RunLivenessReasonProviderTurnLinked {
		t.Fatalf("active liveness after snapshot = %+v, want attached", *liveness)
	}
}

func TestServiceSnapshotReconcileProviderUnavailableMarksLostFromAttached(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{}, errors.New("thread/read unavailable"))
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, result := startLinkedReconciliationRun(t, service)

	snapshot, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonSnapshotLoad)
	if err != nil {
		t.Fatalf("snapshot reconcile: %v", err)
	}
	if len(snapshot.Runs) != 1 {
		t.Fatalf("snapshot liveness count = %d, want 1", len(snapshot.Runs))
	}
	liveness := snapshot.Runs[0]
	if liveness.Status != RunLivenessLost ||
		liveness.Reason != RunLivenessReasonProviderUnavailable ||
		liveness.RunID != result.Run.ID ||
		liveness.Error != "thread/read unavailable" {
		t.Fatalf("snapshot unavailable liveness = %+v, want lost provider unavailable", liveness)
	}
	_, activeLiveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run after snapshot loss ok=%v err=%v", ok, err)
	}
	if activeLiveness.Status != RunLivenessLost || activeLiveness.Reason != RunLivenessReasonProviderUnavailable {
		t.Fatalf("active liveness after snapshot loss = %+v, want lost provider unavailable", *activeLiveness)
	}
}

func TestServiceSnapshotReconcileDoesNotDowngradeFreshProviderEvent(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{}, errors.New("thread/read unavailable"))
	harness.resume = make(chan struct{})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, result := startLinkedReconciliationRun(t, service)

	done := make(chan error, 1)
	go func() {
		_, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonSnapshotLoad)
		done <- err
	}()
	<-harness.called
	if err := service.appendAssistantDelta("workspace_api", conversation.ID, result.Run.ID, "answer", "fresh"); err != nil {
		t.Fatalf("append fresh provider delta: %v", err)
	}
	close(harness.resume)
	if err := <-done; err != nil {
		t.Fatalf("snapshot reconcile: %v", err)
	}

	_, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run after stale snapshot ok=%v err=%v", ok, err)
	}
	if liveness.Status != RunLivenessAttached || liveness.Reason != RunLivenessReasonProviderTurnLinked {
		t.Fatalf("liveness after fresh-event snapshot race = %+v, want attached", *liveness)
	}
}

func TestServiceSnapshotReconcileDoesNotInterruptAfterFreshProviderEvent(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{
		ThreadStatus: HarnessThreadRuntimeIdle,
		TurnFound:    false,
	}, nil)
	harness.resume = make(chan struct{})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, result := startLinkedReconciliationRun(t, service)

	done := make(chan error, 1)
	go func() {
		_, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonSnapshotLoad)
		done <- err
	}()
	<-harness.called
	if err := service.appendAssistantDelta("workspace_api", conversation.ID, result.Run.ID, "answer", "fresh"); err != nil {
		t.Fatalf("append fresh provider delta: %v", err)
	}
	close(harness.resume)
	if err := <-done; err != nil {
		t.Fatalf("snapshot reconcile: %v", err)
	}

	run, err := service.store.LoadRun("workspace_api", result.Run.ID)
	if err != nil {
		t.Fatalf("load run: %v", err)
	}
	if run.Status != RunStatusRunning || run.Error != "" {
		t.Fatalf("run after stale missing-turn snapshot = %+v, want running", run)
	}
	_, liveness, ok, err := service.ActiveRunWithLiveness("workspace_api", conversation.ID)
	if err != nil || !ok {
		t.Fatalf("active run after stale missing-turn snapshot ok=%v err=%v", ok, err)
	}
	if liveness.Status != RunLivenessAttached || liveness.Reason != RunLivenessReasonProviderTurnLinked {
		t.Fatalf("liveness after stale missing-turn snapshot = %+v, want attached", *liveness)
	}
}

func TestServiceSnapshotReconcilePreservesStreamResyncReason(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{
		ThreadStatus: HarnessThreadRuntimeActive,
		TurnFound:    true,
		TurnStatus:   HarnessTurnRuntimeInProgress,
	}, nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, _ := startLinkedReconciliationRun(t, service)

	if _, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonStreamResync); err != nil {
		t.Fatalf("stream resync reconcile: %v", err)
	}
	snapshot, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonSnapshotLoad)
	if err != nil {
		t.Fatalf("snapshot reconcile: %v", err)
	}
	if len(snapshot.Runs) != 1 || snapshot.Runs[0].Reason != RunLivenessReasonStreamResync {
		t.Fatalf("snapshot reconcile liveness = %+v, want stream resync reason preserved", snapshot.Runs)
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

func TestServiceListConversationsSnapshotsActiveRunLivenessUnderLock(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{
		ThreadStatus: HarnessThreadRuntimeActive,
		TurnFound:    true,
		TurnStatus:   HarnessTurnRuntimeInProgress,
	}, nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, result := startLinkedReconciliationRun(t, service)

	const iterations = 200
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		<-start
		for index := 0; index < iterations; index++ {
			list, err := service.ListConversations("workspace_api")
			if err != nil {
				errs <- err
				return
			}
			item, ok := conversationListItemByID(list.Conversations, conversation.ID)
			if !ok {
				errs <- fmt.Errorf("conversation %s was missing from list", conversation.ID)
				return
			}
			if item.ActiveRunID != result.Run.ID {
				errs <- fmt.Errorf("active run id = %q, want %q", item.ActiveRunID, result.Run.ID)
				return
			}
			if item.ActiveRunLiveness == nil || item.ActiveRunLiveness.RunID != result.Run.ID {
				errs <- fmt.Errorf("active run liveness = %+v, want run %s", item.ActiveRunLiveness, result.Run.ID)
				return
			}
		}
	}()

	go func() {
		defer wg.Done()
		<-start
		for index := 0; index < iterations; index++ {
			if _, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonWakeRecheck); err != nil {
				errs <- err
				return
			}
		}
	}()

	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
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

func TestServiceReconcileActiveRunByIDRejectsDifferentActiveRunBeforeProviderReconcile(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{
		ThreadStatus: HarnessThreadRuntimeActive,
		TurnFound:    true,
		TurnStatus:   HarnessTurnRuntimeInProgress,
	}, nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, result := startLinkedReconciliationRun(t, service)

	_, err := service.ReconcileActiveRunByID(context.Background(), "workspace_api", conversation.ID, "run_other", RunLivenessReasonUserRetry)
	if err == nil || !strings.Contains(err.Error(), "does not match requested run run_other") {
		t.Fatalf("reconcile wrong run error = %v, want exact-run mismatch", err)
	}
	select {
	case <-harness.called:
		t.Fatal("provider liveness reconciliation was called for wrong run id")
	default:
	}

	reconciled, err := service.ReconcileActiveRunByID(context.Background(), "workspace_api", conversation.ID, result.Run.ID, RunLivenessReasonUserRetry)
	if err != nil {
		t.Fatalf("reconcile exact run: %v", err)
	}
	if len(reconciled.Runs) != 1 || reconciled.Runs[0].RunID != result.Run.ID || reconciled.Runs[0].Reason != RunLivenessReasonUserRetry {
		t.Fatalf("reconciled liveness = %+v, want user retry for %s", reconciled.Runs, result.Run.ID)
	}
}

func TestServiceReconcileMissingProviderTurnFailsRun(t *testing.T) {
	harness := newLivenessReconcileHarness(HarnessRunLivenessResult{
		ThreadStatus: HarnessThreadRuntimeIdle,
		TurnFound:    false,
	}, nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, result := startLinkedReconciliationRun(t, service)

	reconciled, err := service.ReconcileActiveRuns(context.Background(), "workspace_api", conversation.ID, RunLivenessReasonWakeRecheck)
	if err != nil {
		t.Fatalf("reconcile active runs: %v", err)
	}
	if len(reconciled.Runs) != 1 {
		t.Fatalf("reconciled liveness count = %d, want 1: %+v", len(reconciled.Runs), reconciled.Runs)
	}
	liveness := reconciled.Runs[0]
	failedStatus := runActiveStatus(RunActiveStatusFinished, "Finished", RunActiveHeadlineTerminal)
	failedStatus.Detail = providerTurnInactiveRunError
	if liveness.Status != RunLivenessTerminal ||
		liveness.Phase != RunLivenessPhaseTerminal ||
		liveness.ActiveStatus != failedStatus ||
		liveness.Steerable ||
		liveness.SteeringDisabled != "The run has finished." ||
		liveness.LastVisibleActivityAt == "" {
		t.Fatalf("reconciled terminal liveness = %+v, want projected terminal payload", liveness)
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

func subscribeFromCurrentEvent(t *testing.T, service *Service) *EventSubscription {
	t.Helper()
	service.events.mu.Lock()
	cursor := EventCursor{StreamID: service.events.streamID, Sequence: service.events.nextSequence - 1}
	service.events.mu.Unlock()
	subscription, err := service.SubscribeEvents(cursor)
	if err != nil {
		t.Fatalf("subscribe events: %v", err)
	}
	return subscription
}

func conversationListItemByID(items []ConversationListItem, conversationID string) (ConversationListItem, bool) {
	for _, item := range items {
		if item.Conversation.ID == conversationID {
			return item, true
		}
	}
	return ConversationListItem{}, false
}
