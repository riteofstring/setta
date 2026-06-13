package semanticgraph

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"setta/internal/chat"
)

func TestAutomaticCartographerProcessingEnqueuesClosedWindowAndAppliesReviewRequiredPatch(t *testing.T) {
	runner := &scriptedAutomaticCartographerRunner{reviewRequired: true, confidence: 0.22}
	service, _ := newAutomaticCartographerTestService(t, runner, AutomaticCartographerProcessingConfig{})
	ctx := context.Background()
	if err := service.StartAutomaticCartographerProcessing(ctx); err != nil {
		t.Fatalf("start automatic cartographer processing: %v", err)
	}
	defer service.StopAutomaticCartographerProcessing()

	if _, err := service.ObserveCartographerChatEvent(ctx, cartographerChatEvent(t, 1, chat.EventTypeRunItemUpdated, chat.RunItemUpdatedPayload{
		Item: cartographerRunItem("run_item_auto", chat.RunItemTypeCommandExecution, chat.RunItemStatusCompleted),
	})); err != nil {
		t.Fatalf("observe terminal run item: %v", err)
	}
	waitForAutomaticCartographerIdle(t, service)

	detail, ok, err := service.ReadNodeDetail(ctx, testWorkspaceID, "node_auto_001")
	if err != nil || !ok || len(detail.Evidence) == 0 {
		t.Fatalf("automatic cartographer node detail = %+v ok=%v err=%v, want evidence-backed node", detail, ok, err)
	}
	patches, err := service.ListCartographerPatches(ctx, CartographerPatchFilter{
		WorkspaceID:      testWorkspaceID,
		SemanticTargetID: "node_auto_001",
		Limit:            10,
	})
	if err != nil {
		t.Fatalf("list automatic cartographer patches: %v", err)
	}
	if len(patches.Patches) != 1 ||
		patches.Patches[0].Status != CartographerPatchApplied ||
		!cartographerDiagnosticsContain(nil, patches.Patches, "review_required_auto_applied") ||
		!cartographerDiagnosticsContain(nil, patches.Patches, "low_confidence_auto_applied") {
		t.Fatalf("automatic patch records = %+v, want applied review-required metadata diagnostics", patches.Patches)
	}
	state, err := service.ReadCartographerProcessingState(ctx)
	if err != nil {
		t.Fatalf("read automatic cartographer state: %v", err)
	}
	if !state.Enabled ||
		state.QueuedWindowCount != 0 ||
		state.RunningWindowCount != 0 ||
		state.LastProcessedWindowID == "" ||
		len(state.CreatedSemanticEventIDs) == 0 {
		t.Fatalf("automatic cartographer state = %+v, want completed default-on processing state", state)
	}
}

func TestAutomaticCartographerProcessingPreservesPerSourceOrdering(t *testing.T) {
	runner := newBlockingCartographerRunner()
	service, _ := newAutomaticCartographerTestService(t, runner, AutomaticCartographerProcessingConfig{
		MaxConcurrent:       2,
		PerSourceConcurrent: 1,
	})
	ctx := context.Background()
	if err := service.StartAutomaticCartographerProcessing(ctx); err != nil {
		t.Fatalf("start automatic cartographer processing: %v", err)
	}
	defer service.StopAutomaticCartographerProcessing()

	first := buildAutomaticManualWindow(t, service, "node_same_source")
	second := buildAutomaticManualWindow(t, service, "node_same_source")
	service.enqueueClosedCartographerWindow(first, testTimestamp(80))
	service.enqueueClosedCartographerWindow(second, testTimestamp(81))
	runner.waitForStarted(t, 1)

	state, err := service.ReadCartographerProcessingState(ctx)
	if err != nil {
		t.Fatalf("read automatic state: %v", err)
	}
	if state.RunningWindowCount != 1 || state.QueuedWindowCount != 1 {
		t.Fatalf("automatic state while first source window runs = %+v, want one running and one queued", state)
	}
	runner.releaseAll()
	waitForAutomaticCartographerIdle(t, service)
	if got := runner.maxConcurrentObserved(); got != 1 {
		t.Fatalf("max concurrent tasks for same source = %d, want 1", got)
	}
	firstRead, ok, err := service.ReadCartographerWindow(ctx, testWorkspaceID, first.ID)
	if err != nil || !ok || firstRead.Status != CartographerWindowProcessed {
		t.Fatalf("first window after automatic processing = %+v ok=%v err=%v", firstRead, ok, err)
	}
	secondRead, ok, err := service.ReadCartographerWindow(ctx, testWorkspaceID, second.ID)
	if err != nil || !ok || secondRead.Status != CartographerWindowProcessed {
		t.Fatalf("second window after automatic processing = %+v ok=%v err=%v", secondRead, ok, err)
	}
}

func TestAutomaticCartographerProcessingHonorsGlobalConcurrencyLimit(t *testing.T) {
	runner := newBlockingCartographerRunner()
	service, _ := newAutomaticCartographerTestService(t, runner, AutomaticCartographerProcessingConfig{
		MaxConcurrent:       1,
		PerSourceConcurrent: 1,
	})
	ctx := context.Background()
	if err := service.StartAutomaticCartographerProcessing(ctx); err != nil {
		t.Fatalf("start automatic cartographer processing: %v", err)
	}
	defer service.StopAutomaticCartographerProcessing()

	first := buildAutomaticManualWindow(t, service, "node_source_a")
	second := buildAutomaticManualWindow(t, service, "node_source_b")
	service.enqueueClosedCartographerWindow(first, testTimestamp(80))
	service.enqueueClosedCartographerWindow(second, testTimestamp(81))
	runner.waitForStarted(t, 1)

	state, err := service.ReadCartographerProcessingState(ctx)
	if err != nil {
		t.Fatalf("read automatic state: %v", err)
	}
	if state.RunningWindowCount != 1 || state.QueuedWindowCount != 1 {
		t.Fatalf("automatic state with global limit = %+v, want one running and one queued", state)
	}
	runner.releaseAll()
	waitForAutomaticCartographerIdle(t, service)
	if got := runner.maxConcurrentObserved(); got != 1 {
		t.Fatalf("max concurrent tasks with global limit = %d, want 1", got)
	}
}

func TestAutomaticCartographerRecoveryProcessesClosedPendingWindowsOnce(t *testing.T) {
	store := newTestStore(t)
	resolver := associationWorkspaceResolver{root: t.TempDir()}
	builder := newAutomaticCartographerServiceForStore(t, store, resolver, &emptyCartographerRunner{}, AutomaticCartographerProcessingConfig{})
	processable := buildAutomaticManualWindow(t, builder, "node_recovery_process")
	running := buildAutomaticManualWindow(t, builder, "node_recovery_running")
	processed := buildAutomaticManualWindow(t, builder, "node_recovery_processed")
	markCartographerRunStatus(t, builder, running.RunID, CartographerRunRunning)
	markCartographerWindowStatus(t, builder, processed.ID, CartographerWindowProcessed)

	runner := &emptyCartographerRunner{}
	restarted := newAutomaticCartographerServiceForStore(t, store, resolver, runner, AutomaticCartographerProcessingConfig{})
	if err := restarted.StartAutomaticCartographerProcessing(context.Background()); err != nil {
		t.Fatalf("start automatic recovery: %v", err)
	}
	defer restarted.StopAutomaticCartographerProcessing()
	waitForAutomaticCartographerIdle(t, restarted)

	if got := runner.count(); got != 1 {
		t.Fatalf("recovered task count = %d, want exactly one pending closed window", got)
	}
	read, ok, err := restarted.ReadCartographerWindow(context.Background(), testWorkspaceID, processable.ID)
	if err != nil || !ok || read.Status != CartographerWindowProcessed {
		t.Fatalf("recovered window = %+v ok=%v err=%v, want processed", read, ok, err)
	}
	runningRead, ok, err := restarted.ReadCartographerWindow(context.Background(), testWorkspaceID, running.ID)
	if err != nil || !ok || runningRead.Status != CartographerWindowClosed {
		t.Fatalf("running window recovery state = %+v ok=%v err=%v, want still closed/unprocessed", runningRead, ok, err)
	}
	processedRead, ok, err := restarted.ReadCartographerWindow(context.Background(), testWorkspaceID, processed.ID)
	if err != nil || !ok || processedRead.Status != CartographerWindowProcessed {
		t.Fatalf("processed window recovery state = %+v ok=%v err=%v, want unchanged processed", processedRead, ok, err)
	}
}

func TestAutomaticCartographerValidationFailureRecordsAuditWithoutGraphMutation(t *testing.T) {
	runner := &invalidCartographerRunner{}
	service, store := newAutomaticCartographerTestService(t, runner, AutomaticCartographerProcessingConfig{})
	ctx := context.Background()
	if err := service.StartAutomaticCartographerProcessing(ctx); err != nil {
		t.Fatalf("start automatic cartographer processing: %v", err)
	}
	defer service.StopAutomaticCartographerProcessing()
	before := semanticEventCount(t, store)

	window := buildAutomaticManualWindow(t, service, "node_invalid_auto")
	service.enqueueClosedCartographerWindow(window, testTimestamp(82))
	waitForAutomaticCartographerIdle(t, service)

	if after := semanticEventCount(t, store); after != before {
		t.Fatalf("semantic event count after invalid automatic patch = %d, want %d", after, before)
	}
	run, ok, err := service.ReadCartographerRun(ctx, testWorkspaceID, window.RunID)
	if err != nil || !ok || run.Status != CartographerRunRejected {
		t.Fatalf("invalid automatic run = %+v ok=%v err=%v, want rejected audit", run, ok, err)
	}
	state, err := service.ReadCartographerProcessingState(ctx)
	if err != nil {
		t.Fatalf("read automatic state: %v", err)
	}
	if state.LastFailure == nil || state.LastFailure.WindowID != window.ID {
		t.Fatalf("automatic state after rejected patch = %+v, want last failure diagnostic", state)
	}
}

func newAutomaticCartographerTestService(t *testing.T, runner chat.HarnessTaskRunner, config AutomaticCartographerProcessingConfig) (*Service, *Store) {
	t.Helper()
	store := newTestStore(t)
	return newAutomaticCartographerServiceForStore(t, store, associationWorkspaceResolver{root: t.TempDir()}, runner, config), store
}

func newAutomaticCartographerServiceForStore(t *testing.T, store *Store, resolver associationWorkspaceResolver, runner chat.HarnessTaskRunner, config AutomaticCartographerProcessingConfig) *Service {
	t.Helper()
	now, err := time.Parse(time.RFC3339Nano, testTimestamp(50))
	if err != nil {
		t.Fatalf("parse automatic cartographer clock: %v", err)
	}
	service, err := NewService(
		store,
		resolver,
		WithIDGenerator(countingIDGenerator()),
		WithClock(func() time.Time { return now }),
		WithCartographerHarnessTaskRunner(runner, chat.HarnessCodex),
		WithCartographerObservationConfig(CartographerObservationConfig{
			MaxWindowEvents:         10,
			MaxWindowContentBytes:   4000,
			AssistantThresholdBytes: 4000,
			OutputThresholdBytes:    4000,
		}),
		WithAutomaticCartographerProcessingConfig(config),
	)
	if err != nil {
		t.Fatalf("new automatic cartographer service: %v", err)
	}
	return service
}

func buildAutomaticManualWindow(t *testing.T, service *Service, targetEntityID string) CartographerWindow {
	t.Helper()
	window, err := service.BuildManualCartographerWindow(context.Background(), CartographerManualWindowRequest{
		WorkspaceID:    testWorkspaceID,
		TriggerKind:    CartographerTriggerWorkflowWindow,
		TargetEntityID: targetEntityID,
		SourceRefs: SemanticContextSourceRefs{
			WorkflowExecutionID: "workflow_execution_" + targetEntityID,
		},
		Summary: "Closed automatic cartographer test window.",
	})
	if err != nil {
		t.Fatalf("build automatic manual window: %v", err)
	}
	return window
}

func markCartographerRunStatus(t *testing.T, service *Service, runID string, status CartographerRunStatus) {
	t.Helper()
	run, ok, err := service.ReadCartographerRun(context.Background(), testWorkspaceID, runID)
	if err != nil || !ok {
		t.Fatalf("read cartographer run %s: ok=%v err=%v", runID, ok, err)
	}
	run.Status = status
	if _, err := service.SaveCartographerRun(context.Background(), run); err != nil {
		t.Fatalf("save cartographer run status %s: %v", status, err)
	}
}

func markCartographerWindowStatus(t *testing.T, service *Service, windowID string, status CartographerWindowStatus) {
	t.Helper()
	window, ok, err := service.ReadCartographerWindow(context.Background(), testWorkspaceID, windowID)
	if err != nil || !ok {
		t.Fatalf("read cartographer window %s: ok=%v err=%v", windowID, ok, err)
	}
	window.Status = status
	if _, err := service.SaveCartographerWindow(context.Background(), window); err != nil {
		t.Fatalf("save cartographer window status %s: %v", status, err)
	}
}

func waitForAutomaticCartographerIdle(t *testing.T, service *Service) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := service.WaitForAutomaticCartographerIdle(ctx); err != nil {
		t.Fatalf("wait for automatic cartographer idle: %v", err)
	}
}

type scriptedAutomaticCartographerRunner struct {
	reviewRequired bool
	confidence     float64
}

func (runner *scriptedAutomaticCartographerRunner) RunTask(_ context.Context, request chat.HarnessTaskRequest) (chat.HarnessTaskResult, error) {
	bundle, err := decodeAutomaticRunnerBundle(request)
	if err != nil {
		return chat.HarnessTaskResult{}, err
	}
	sourceID := firstAutomaticRunnerRunItemID(bundle)
	patch := cartographerRecordFindingPatch("cartographer_patch_auto_001", "node_auto_001", "Automatic cartographer finding", runner.confidence)
	patch.WorkspaceID = bundle.WorkspaceID
	patch.SourceRefs = bundle.SourceRefs
	patch.ReviewRequired = runner.reviewRequired
	patch.EvidenceRefs = []CartographerPatchEvidenceRef{{
		SourceKind: EvidenceSourceRunItem,
		SourceID:   sourceID,
	}}
	raw, err := json.Marshal(CartographerPatchEnvelope{Patches: []CartographerPatch{patch}})
	if err != nil {
		return chat.HarnessTaskResult{}, err
	}
	return automaticRunnerTaskResult(raw), nil
}

type emptyCartographerRunner struct {
	mu       sync.Mutex
	requests int
}

func (runner *emptyCartographerRunner) RunTask(context.Context, chat.HarnessTaskRequest) (chat.HarnessTaskResult, error) {
	runner.mu.Lock()
	runner.requests++
	runner.mu.Unlock()
	return automaticRunnerTaskResult([]byte(`{"patches":[]}`)), nil
}

func (runner *emptyCartographerRunner) count() int {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	return runner.requests
}

type invalidCartographerRunner struct{}

func (runner *invalidCartographerRunner) RunTask(_ context.Context, request chat.HarnessTaskRequest) (chat.HarnessTaskResult, error) {
	bundle, err := decodeAutomaticRunnerBundle(request)
	if err != nil {
		return chat.HarnessTaskResult{}, err
	}
	patch := cartographerRecordFindingPatch("cartographer_patch_invalid_auto", "node_invalid_auto", "Invalid automatic finding", 0.91)
	patch.WorkspaceID = bundle.WorkspaceID
	patch.SourceRefs = bundle.SourceRefs
	patch.EvidenceRefs = nil
	raw, err := json.Marshal(CartographerPatchEnvelope{Patches: []CartographerPatch{patch}})
	if err != nil {
		return chat.HarnessTaskResult{}, err
	}
	return automaticRunnerTaskResult(raw), nil
}

type blockingCartographerRunner struct {
	mu             sync.Mutex
	started        int
	running        int
	maxConcurrent  int
	startedChanged chan struct{}
	release        chan struct{}
	released       bool
}

func newBlockingCartographerRunner() *blockingCartographerRunner {
	return &blockingCartographerRunner{
		startedChanged: make(chan struct{}, 32),
		release:        make(chan struct{}),
	}
}

func (runner *blockingCartographerRunner) RunTask(ctx context.Context, _ chat.HarnessTaskRequest) (chat.HarnessTaskResult, error) {
	runner.mu.Lock()
	runner.started++
	runner.running++
	if runner.running > runner.maxConcurrent {
		runner.maxConcurrent = runner.running
	}
	runner.startedChanged <- struct{}{}
	release := runner.release
	runner.mu.Unlock()

	select {
	case <-ctx.Done():
		return chat.HarnessTaskResult{}, ctx.Err()
	case <-release:
	}

	runner.mu.Lock()
	runner.running--
	runner.mu.Unlock()
	return automaticRunnerTaskResult([]byte(`{"patches":[]}`)), nil
}

func (runner *blockingCartographerRunner) waitForStarted(t *testing.T, count int) {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		runner.mu.Lock()
		started := runner.started
		runner.mu.Unlock()
		if started >= count {
			return
		}
		select {
		case <-runner.startedChanged:
		case <-deadline:
			t.Fatalf("blocking cartographer runner started %d tasks, want %d", started, count)
		}
	}
}

func (runner *blockingCartographerRunner) releaseAll() {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	if runner.released {
		return
	}
	close(runner.release)
	runner.released = true
}

func (runner *blockingCartographerRunner) maxConcurrentObserved() int {
	runner.mu.Lock()
	defer runner.mu.Unlock()
	return runner.maxConcurrent
}

func automaticRunnerTaskResult(raw json.RawMessage) chat.HarnessTaskResult {
	return chat.HarnessTaskResult{
		Completion:       chat.TurnCompletion{Outcome: chat.TurnOutcomeCompleted},
		StructuredOutput: raw,
		Audit: chat.HarnessAuditMetadata{
			HarnessKind: chat.HarnessCodex,
			Model:       "fake-cartographer",
			RequestID:   "request_cartographer",
			ResponseID:  "response_cartographer",
		},
	}
}

func decodeAutomaticRunnerBundle(request chat.HarnessTaskRequest) (CartographerInputBundle, error) {
	if request.StructuredTask == nil {
		return CartographerInputBundle{}, errors.New("structured task is required")
	}
	var bundle CartographerInputBundle
	if err := json.Unmarshal(request.StructuredTask.Input, &bundle); err != nil {
		return CartographerInputBundle{}, err
	}
	return bundle, nil
}

func firstAutomaticRunnerRunItemID(bundle CartographerInputBundle) string {
	for _, event := range bundle.NewEvents {
		if event.RunItemID != "" {
			return event.RunItemID
		}
	}
	return bundle.SourceRefs.RunItemID
}
