package narration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/conversation/conversationpalette"
	"setta/internal/speech"
	"setta/internal/workspace"
)

func TestServiceSubmitsTerminalProjectionBeforeRawBacklogCheckpoint(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, terminal := seedTerminalProjectorConversation(t, store)
	retryStarted := make(chan time.Duration, 1)
	provider := &projectorTestAgentRuntime{failProjectionCalls: 1}
	service := newProjectorTestService(t, store, provider, WithServiceRetryWait(
		func(ctx context.Context, delay time.Duration) error {
			select {
			case retryStarted <- delay:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		},
	))

	service.ObserveCommittedTrajectory(projectorTerminalObservation(conversationID, turnID, terminal))

	select {
	case delay := <-retryStarted:
		if delay != time.Second {
			t.Fatalf("first projector retry delay = %s, want 1s", delay)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for projector retry")
	}
	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.ObservedThroughSequence == current.Conversation.LastTrajectorySequence &&
			latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	assertTerminalProjectorState(t, snapshot, turnID)
	assertTerminalBypassesBacklogCheckpoint(t, provider.snapshotCalls(), terminal.Sequence)
}

func stringPointerForProjectorTest(value string) *string {
	return &value
}

func TestServiceRecoversInterruptedRunningTerminalProjection(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, terminal := seedTerminalProjectorConversation(t, store)
	state, err := store.ReadNarratorState(context.Background(), conversationID)
	if err != nil {
		t.Fatalf("ReadNarratorState: %v", err)
	}
	if _, err := store.CommitNarratorInvocationStarted(context.Background(), conversation.NarratorInvocationStartedCommit{
		ConversationID:   conversationID,
		Expected:         projectorNarratorExpectation(state),
		CommittedEventID: "recovered-terminal-start-marker",
		StartedAt:        "2026-07-12T12:01:30Z",
	}); err != nil {
		t.Fatalf("CommitNarratorInvocationStarted: %v", err)
	}
	provider := &projectorTestAgentRuntime{}
	service := newProjectorTestService(t, store, provider)

	if err := service.RecoverTerminalProjections(context.Background()); err != nil {
		t.Fatalf("RecoverTerminalProjections: %v", err)
	}

	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.Status == conversation.NarratorStatusReady &&
			current.NarratorState.ObservedThroughSequence == terminal.Sequence &&
			latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	assertTerminalProjectorState(t, snapshot, turnID)
	assertTerminalBypassesBacklogCheckpoint(t, provider.snapshotCalls(), terminal.Sequence)
}

func TestServiceWaitsForAcceptedInputFocusBeforeTerminalProjection(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, terminal := seedTerminalProjectorConversation(t, store)
	snapshot, err := store.ReadSnapshot(context.Background(), "workspace-status-service", conversationID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	accepted := snapshot.Trajectory.Events[0]
	focusIDRequested := make(chan struct{})
	releaseFocusID := make(chan struct{})
	var focusIDOnce sync.Once
	var idMu sync.Mutex
	idCounts := map[string]int{}
	provider := &projectorTestAgentRuntime{}
	service, err := NewService(
		store,
		statusServiceWorkspaceResolver{summary: workspace.WorkspaceSummary{
			ID:       "workspace-status-service",
			RootPath: filepath.Clean(t.TempDir()),
		}},
		provider,
		WithServiceIDGenerator(func(prefix string) (string, error) {
			if prefix == "narrator_focus" {
				focusIDOnce.Do(func() {
					close(focusIDRequested)
					<-releaseFocusID
				})
			}
			idMu.Lock()
			defer idMu.Unlock()
			idCounts[prefix]++
			return fmt.Sprintf("%s-%d", prefix, idCounts[prefix]), nil
		}),
	)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := service.Shutdown(ctx); err != nil {
			t.Errorf("Shutdown: %v", err)
		}
	})

	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         turnID,
		Trajectory:     []conversation.TrajectoryEvent{accepted},
	})
	select {
	case <-focusIDRequested:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for focus request admission")
	}
	service.ObserveCommittedTrajectory(projectorTerminalObservation(conversationID, turnID, terminal))
	service.lifecycleMu.Lock()
	queuedBeforeFocus := service.terminal[conversationID] != nil
	service.lifecycleMu.Unlock()
	if queuedBeforeFocus {
		t.Fatal("terminal projection was admitted before accepted-input focus completed")
	}
	close(releaseFocusID)

	snapshot = waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.CurrentFocusSourceSequence == accepted.Sequence &&
			current.NarratorState.ObservedThroughSequence == terminal.Sequence &&
			latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	if snapshot.NarratorState.CurrentFocus != "Keep the primary turn running." ||
		snapshot.NarratorState.CurrentFocusRevision != 1 {
		t.Fatalf("focus state after terminal projection = %+v", snapshot.NarratorState)
	}
	for _, call := range provider.snapshotCalls() {
		if call.requestedChannel != ProjectionChannelTerminal {
			continue
		}
		if call.currentFocus != snapshot.NarratorState.CurrentFocus || call.preCallFocusRevision != 1 {
			t.Fatalf("terminal call did not see stable focus: call=%+v state=%+v", call, snapshot.NarratorState)
		}
		return
	}
	t.Fatalf("terminal projection call was not recorded: %+v", provider.snapshotCalls())
}

func TestServiceKeepsTerminalProjectionBehindRetriedFocus(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, terminal := seedTerminalProjectorConversation(t, store)
	snapshot, err := store.ReadSnapshot(context.Background(), "workspace-status-service", conversationID)
	if err != nil {
		t.Fatalf("ReadSnapshot: %v", err)
	}
	accepted := snapshot.Trajectory.Events[0]
	retryStarted := make(chan time.Duration, 1)
	releaseRetry := make(chan struct{})
	projectionStarted := make(chan struct{})
	releaseProjection := make(chan struct{})
	projectionReleased := false
	releaseProjectionOnce := func() {
		if projectionReleased {
			return
		}
		projectionReleased = true
		close(releaseProjection)
	}
	defer releaseProjectionOnce()
	provider := &projectorTestAgentRuntime{
		failFocusCalls:       1,
		blockFirstProjection: true,
		firstCallStarted:     projectionStarted,
		releaseFirstCall:     releaseProjection,
	}
	service := newProjectorTestService(t, store, provider, WithServiceRetryWait(
		func(ctx context.Context, delay time.Duration) error {
			select {
			case retryStarted <- delay:
			default:
			}
			select {
			case <-releaseRetry:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		},
	))

	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         turnID,
		Trajectory:     []conversation.TrajectoryEvent{accepted},
	})
	select {
	case delay := <-retryStarted:
		if delay != time.Second {
			t.Fatalf("focus retry delay = %s, want 1s", delay)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for focus retry")
	}
	service.ObserveCommittedTrajectory(projectorTerminalObservation(conversationID, turnID, terminal))
	select {
	case <-projectionStarted:
		releaseProjectionOnce()
		t.Fatalf("terminal projection started before retried focus completed: %+v", provider.snapshotCalls())
	case <-time.After(200 * time.Millisecond):
	}

	close(releaseRetry)
	select {
	case <-projectionStarted:
		releaseProjectionOnce()
	case <-time.After(2 * time.Second):
		t.Fatalf("terminal projection did not start after retried focus completed: %+v", provider.snapshotCalls())
	}
	snapshot = waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.CurrentFocusSourceSequence == accepted.Sequence &&
			current.NarratorState.ObservedThroughSequence == terminal.Sequence &&
			latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	for _, call := range provider.snapshotCalls() {
		if call.requestedChannel != ProjectionChannelTerminal {
			continue
		}
		if call.currentFocus != snapshot.NarratorState.CurrentFocus || call.preCallFocusRevision != 1 {
			t.Fatalf("terminal call did not wait for retried focus: call=%+v state=%+v", call, snapshot.NarratorState)
		}
		return
	}
	t.Fatalf("terminal projection call was not recorded: %+v", provider.snapshotCalls())
}

func TestServiceFinalizesTerminalProjectionAtObservedCursor(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, terminal := seedFailedTerminalProjectorConversation(t, store)
	markNarratorCaughtUpAtTerminal(t, store, conversationID, terminal.Sequence)
	materializer, err := NewContextMaterializer(store)
	if err != nil {
		t.Fatalf("new materializer: %v", err)
	}
	if _, err := materializer.Projection(context.Background(), ProjectionContextRequest{
		ConversationID:  conversationID,
		TurnID:          turnID,
		Trigger:         conversation.NarrationTriggerTurnTerminal,
		ThroughSequence: terminal.Sequence,
		Limits: ContextLimits{
			MaxInputBytes:        1 << 20,
			MaxTrajectoryEvents:  conversation.MaxNarratorContextTrajectoryEvents,
			RecentFinalSummaries: projectionRecentFinalSummaries,
		},
	}); err != nil {
		t.Fatalf("materialize caught-up terminal projection: %T %v", err, err)
	}
	provider := &projectorTestAgentRuntime{}
	service := newProjectorTestService(t, store, provider)

	service.ObserveCommittedTrajectory(projectorTerminalObservation(conversationID, turnID, terminal))

	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		if current.NarratorState.Degradation != nil {
			t.Fatalf("terminal finalization degraded narrator: degradation=%+v calls=%+v",
				*current.NarratorState.Degradation,
				provider.snapshotCalls(),
			)
		}
		return latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	assertTerminalProjectorState(t, snapshot, turnID)
	final := latestNarrationOfKind(snapshot, conversation.NarrationEventKindFinalSummary)
	if final.SourceSequenceStart != terminal.Sequence || final.SourceSequenceEnd != terminal.Sequence {
		t.Fatalf("terminal finalization source range = %d..%d, want %d..%d",
			final.SourceSequenceStart,
			final.SourceSequenceEnd,
			terminal.Sequence,
			terminal.Sequence,
		)
	}
	calls := provider.snapshotCalls()
	if len(calls) != 1 || calls[0].requestedChannel != ProjectionChannelTerminal ||
		calls[0].preCallObserved != terminal.Sequence ||
		calls[0].evaluationStart != terminal.Sequence ||
		calls[0].evaluationEnd != terminal.Sequence {
		t.Fatalf("terminal finalization calls = %+v", calls)
	}
}

func TestServiceProgressProjectionDoesNotBackfillHistoricalTerminal(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, _ := seedFailedTerminalProjectorConversation(t, store)
	provider := &projectorTestAgentRuntime{emitProjectionMilestones: true}
	service := newProjectorTestService(t, store, provider, WithServiceRetryWait(
		func(ctx context.Context, _ time.Duration) error {
			return ctx.Err()
		},
	))
	service.submitProjection(
		conversationID,
		ProjectionOperation{
			WorkspaceID:     "workspace-status-service",
			TurnID:          turnID,
			ThroughSequence: 14,
			SemanticEvents: []conversation.NarratorSemanticEvent{
				projectorProgressSemantic(conversationID, turnID, 14),
			},
		},
		conversation.NarrationTriggerProgressWindowElapsed,
	)
	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		if current.NarratorState.Degradation != nil {
			t.Fatalf("historical terminal projection degraded narrator: degradation=%+v calls=%+v",
				*current.NarratorState.Degradation,
				provider.snapshotCalls(),
			)
		}
		return current.NarratorState.ObservedThroughSequence == 14
	})
	if final := latestNarrationOfKind(snapshot, conversation.NarrationEventKindFinalSummary); final != nil {
		t.Fatalf("historical terminal was backfilled without a live terminal observation: %+v", final)
	}
	calls := provider.snapshotCalls()
	terminalCalls := []projectorTestCall{}
	coveredThrough := 0
	for _, call := range calls {
		if call.requestedChannel == ProjectionChannelTerminal {
			terminalCalls = append(terminalCalls, call)
		}
		if call.requestedChannel == ProjectionChannelWorking && call.evaluationEnd > coveredThrough {
			coveredThrough = call.evaluationEnd
		}
	}
	if len(terminalCalls) != 0 || coveredThrough != 14 {
		t.Fatalf("historical terminal progress calls = %+v", calls)
	}
}

func TestServiceReadmitsTerminalProjectionAfterRetryExhaustion(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, terminal := seedTerminalProjectorConversation(t, store)
	provider := &projectorTestAgentRuntime{failProjectionCalls: 4}
	service := newProjectorTestService(t, store, provider, WithServiceRetryWait(
		func(ctx context.Context, _ time.Duration) error {
			return ctx.Err()
		},
	))

	observation := projectorTerminalObservation(conversationID, turnID, terminal)
	service.ObserveCommittedTrajectory(observation)
	waitForTerminalProjectorIdle(t, service, provider, conversationID, 4)
	provider.setProjectionFailures(0)

	// A replay or later durable observation is an explicit push signal to try
	// the oldest terminal boundary again; no polling or unbounded retry loop is
	// needed after the finite retry policy is exhausted.
	service.ObserveCommittedTrajectory(observation)
	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.ObservedThroughSequence == terminal.Sequence &&
			latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	assertTerminalProjectorState(t, snapshot, turnID)
}

func TestServiceProactiveCheckpointUsesCurrentTurnAuthority(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, firstTurnID, firstTerminal := seedTerminalProjectorConversation(t, store)
	secondTurnID, _, _ := appendSecondTerminalProjectorTurn(t, store, conversationID)
	provider := &projectorTestAgentRuntime{}
	service := newProjectorTestService(t, store, provider)
	service.checkpointWindowEvents = 1

	service.ObserveCommittedTrajectory(projectorTerminalObservation(conversationID, firstTurnID, firstTerminal))
	waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.ObservedThroughSequence >= firstTerminal.Sequence &&
			current.NarratorState.CheckpointThroughSequence >= firstTerminal.Sequence
	})

	for _, call := range provider.snapshotCalls() {
		if call.kind == ContextKindCheckpoint && call.checkpointRangeEnd == firstTerminal.Sequence {
			if call.turnID != secondTurnID {
				t.Fatalf("proactive checkpoint turn = %s, want current turn %s: %+v", call.turnID, secondTurnID, call)
			}
			return
		}
	}
	t.Fatalf("proactive checkpoint through %d was not called: %+v", firstTerminal.Sequence, provider.snapshotCalls())
}

func TestObservationTriggerDefersActivityCompletionToProgressWindow(t *testing.T) {
	trigger, immediate := observationTrigger(conversation.NarrationTrajectoryObservation{
		Semantic: []conversation.NarratorSemanticEvent{
			projectorActivityFailedSemantic("conversation-trigger", "turn-trigger", 1),
		},
	})
	if immediate || trigger != conversation.NarrationTriggerProgressWindowElapsed {
		t.Fatalf("failed activity trigger = %s, immediate %t", trigger, immediate)
	}
}

func TestServiceSchedulesProgressWindowWithoutPolling(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID := "conversation-progress-window"
	seedStatusServiceConversation(t, store, conversationID)
	waitStarted := make(chan time.Duration, 1)
	release := make(chan struct{})
	provider := &projectorTestAgentRuntime{}
	service := newProjectorTestService(t, store, provider, WithServiceProgressWait(
		func(ctx context.Context, delay time.Duration) error {
			select {
			case waitStarted <- delay:
			case <-ctx.Done():
				return ctx.Err()
			}
			select {
			case <-release:
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		},
	))
	turnID := "primary-agent-turn"
	started := conversation.TrajectoryEvent{
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       2,
		Kind:           conversation.TrajectoryEventTurnStarted,
	}
	service.ObserveCommittedTrajectory(projectorSemanticObservation(
		conversationID,
		turnID,
		started,
		projectorTaskStartedSemantic(conversationID, turnID, started.Sequence),
		false,
	))
	select {
	case delay := <-waitStarted:
		if delay != defaultProgressWindow {
			t.Fatalf("progress window delay = %s, want %s", delay, defaultProgressWindow)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for progress window")
	}
	if calls := provider.snapshotCalls(); len(calls) != 0 {
		t.Fatalf("progress projection ran before window elapsed: %+v", calls)
	}
	close(release)
	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.ObservedThroughSequence == 2
	})
	if snapshot.NarratorState.CheckpointThroughSequence != 0 {
		t.Fatalf("short progress window unexpectedly checkpointed: %+v", snapshot.NarratorState)
	}
	calls := provider.snapshotCalls()
	if len(calls) != 1 || calls[0].kind != ContextKindProjection ||
		calls[0].trigger != conversation.NarrationTriggerProgressWindowElapsed {
		t.Fatalf("progress calls = %+v", calls)
	}
}

func TestServiceSerializesTerminalSummariesAcrossPromotedTurns(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, firstTurnID, firstTerminal := seedTerminalProjectorConversation(t, store)
	secondTurnID, plan, secondTerminal := appendSecondTerminalProjectorTurn(t, store, conversationID)
	firstCallStarted := make(chan struct{})
	releaseFirstCall := make(chan struct{})
	provider := &projectorTestAgentRuntime{
		blockFirstProjection: true,
		firstCallStarted:     firstCallStarted,
		releaseFirstCall:     releaseFirstCall,
	}
	service := newProjectorTestService(t, store, provider)

	service.ObserveCommittedTrajectory(projectorTerminalObservation(conversationID, firstTurnID, firstTerminal))
	select {
	case <-firstCallStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first terminal projection")
	}
	service.ObserveCommittedTrajectory(projectorPlanObservation(conversationID, secondTurnID, plan))
	service.ObserveCommittedTrajectory(projectorTerminalObservation(conversationID, secondTurnID, secondTerminal))
	close(releaseFirstCall)

	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.ObservedThroughSequence == secondTerminal.Sequence &&
			len(finalNarrationTurnIDs(current)) == 2
	})
	finalTurnIDs := finalNarrationTurnIDs(snapshot)
	if len(finalTurnIDs) != 2 || finalTurnIDs[0] != firstTurnID || finalTurnIDs[1] != secondTurnID {
		t.Fatalf("terminal summaries committed out of order: %v", finalTurnIDs)
	}
	assertTerminalCallOrder(t, provider.snapshotCalls(), firstTurnID, secondTurnID)
}

type projectorTestCall struct {
	kind                 ContextKind
	trigger              conversation.NarrationTrigger
	evaluationStart      int
	evaluationEnd        int
	preCallObserved      int
	preCallFocusRevision int
	priorMilestoneCount  int
	requestedChannel     ProjectionChannel
	checkpointRangeStart int
	checkpointRangeEnd   int
	sourceThrough        int
	currentFocus         string
	turnID               string
	semanticSequences    []int
}

type projectorTestAgentRuntime struct {
	mu                                sync.Mutex
	calls                             []projectorTestCall
	failFocusCalls                    int
	failProjectionCalls               int
	blockFirstProjection              bool
	emitProjectionMilestones          bool
	emitProjectionMilestonesWithPrior bool
	firstCallStarted                  chan struct{}
	releaseFirstCall                  chan struct{}
	firstCallReturned                 chan struct{}
}

func (*projectorTestAgentRuntime) ResolveInvocation(
	_ context.Context,
	request agent.Invocation,
) (agent.ResolvedInvocation, error) {
	return agent.ResolvedInvocation{
		Requested:       request,
		Model:           request.Model,
		ReasoningEffort: request.ReasoningEffort,
		ServiceTier:     request.ServiceTier,
		PermissionMode:  request.PermissionMode,
		ApprovalMode:    request.ApprovalMode,
	}, nil
}

func (runtime *projectorTestAgentRuntime) RunFreshStructuredCall(
	_ context.Context,
	request agent.FreshStructuredCallRequest,
) (agent.FreshStructuredCallResult, error) {
	var envelope struct {
		Kind ContextKind `json:"kind"`
	}
	if err := json.Unmarshal(request.Input, &envelope); err != nil {
		return agent.FreshStructuredCallResult{}, err
	}
	call, output, err := runtime.projectorOutput(envelope.Kind, request.Input)
	if err != nil {
		return agent.FreshStructuredCallResult{}, err
	}
	runtime.mu.Lock()
	runtime.calls = append(runtime.calls, call)
	callNumber := len(runtime.calls)
	block := call.kind == ContextKindProjection && runtime.blockFirstProjection
	if block {
		runtime.blockFirstProjection = false
	}
	if call.kind == ContextKindFocus && runtime.failFocusCalls > 0 {
		runtime.failFocusCalls--
		runtime.mu.Unlock()
		return agent.FreshStructuredCallResult{}, errors.New("scripted narrator focus outage")
	}
	if call.kind == ContextKindProjection && runtime.failProjectionCalls > 0 {
		runtime.failProjectionCalls--
		runtime.mu.Unlock()
		return agent.FreshStructuredCallResult{}, errors.New("scripted narrator outage")
	}
	runtime.mu.Unlock()
	if block {
		close(runtime.firstCallStarted)
		<-runtime.releaseFirstCall
		if runtime.firstCallReturned != nil {
			close(runtime.firstCallReturned)
		}
	}
	return agent.FreshStructuredCallResult{
		ProviderThreadID: fmt.Sprintf("projector-thread-%d", callNumber),
		ProviderTurnID:   fmt.Sprintf("projector-turn-%d", callNumber),
		Output:           output,
	}, nil
}

func (runtime *projectorTestAgentRuntime) projectorOutput(
	kind ContextKind,
	input json.RawMessage,
) (projectorTestCall, json.RawMessage, error) {
	switch kind {
	case ContextKindFocus:
		var bundle FocusContextBundle
		if err := json.Unmarshal(input, &bundle); err != nil {
			return projectorTestCall{}, nil, err
		}
		output := map[string]any{
			"kind":                  string(CallOutputFocusProjection),
			"sourceThroughSequence": bundle.SourceThroughSequence,
			"currentFocus":          "Keep the primary turn running.",
			"topicDescriptor":       nil,
		}
		encoded, err := json.Marshal(output)
		return projectorTestCall{
			kind:                 kind,
			trigger:              bundle.Trigger,
			preCallFocusRevision: bundle.PreCallCursor.CurrentFocusRevision,
			sourceThrough:        bundle.SourceThroughSequence,
			currentFocus:         bundle.Authoritative.CurrentFocus,
		}, encoded, err
	case ContextKindProjection:
		var bundle ProjectionContextBundle
		if err := json.Unmarshal(input, &bundle); err != nil {
			return projectorTestCall{}, nil, err
		}
		call := projectorTestCall{
			kind:                 kind,
			trigger:              bundle.Trigger,
			evaluationStart:      bundle.EvaluationRange.Start,
			evaluationEnd:        bundle.EvaluationRange.End,
			preCallObserved:      bundle.PreCallCursor.ObservedThroughSequence,
			preCallFocusRevision: bundle.PreCallCursor.CurrentFocusRevision,
			priorMilestoneCount:  len(bundle.PriorMilestones),
			requestedChannel:     bundle.RequestedChannel,
			currentFocus:         bundle.Authoritative.CurrentFocus,
			semanticSequences:    projectorSemanticSequences(bundle.SemanticEvents),
		}
		if bundle.Authoritative.CurrentInstructions != nil {
			call.turnID = bundle.Authoritative.CurrentInstructions.TurnID
		}
		output := map[string]any{
			"kind":       string(CallOutputWorkingProjection),
			"milestones": []string{},
		}
		if runtime.emitProjectionMilestones &&
			bundle.RequestedChannel == ProjectionChannelWorking &&
			(runtime.emitProjectionMilestonesWithPrior || len(bundle.PriorMilestones) == 0) {
			output["milestones"] = []string{
				fmt.Sprintf("The working projection now covers event %d.", bundle.EvaluationRange.End),
			}
		}
		if bundle.RequestedChannel == ProjectionChannelTerminal {
			output["kind"] = string(CallOutputTerminalProjection)
			delete(output, "milestones")
			output["finalSummary"] = "The terminal projector result is summarized immediately."
		}
		encoded, err := json.Marshal(output)
		return call, encoded, err
	case ContextKindStatus:
		var bundle StatusContextBundle
		if err := json.Unmarshal(input, &bundle); err != nil {
			return projectorTestCall{}, nil, err
		}
		encoded, err := json.Marshal(map[string]any{
			"kind":                  string(CallOutputStatusReply),
			"sourceThroughSequence": bundle.SourceThroughSequence,
			"statusReply":           "The projector test status is available.",
		})
		return projectorTestCall{kind: kind, trigger: bundle.Trigger}, encoded, err
	case ContextKindCheckpoint:
		var bundle CheckpointContextBundle
		if err := json.Unmarshal(input, &bundle); err != nil {
			return projectorTestCall{}, nil, err
		}
		encoded, err := json.Marshal(CheckpointOutput{
			CoveredThroughSequence: bundle.RequestedRange.End,
			HistoricalSummary:      fmt.Sprintf("History through sequence %d.", bundle.RequestedRange.End),
		})
		call := projectorTestCall{
			kind:                 kind,
			trigger:              bundle.Trigger,
			checkpointRangeStart: bundle.RequestedRange.Start,
			checkpointRangeEnd:   bundle.RequestedRange.End,
		}
		if bundle.Authoritative.CurrentInstructions != nil {
			call.turnID = bundle.Authoritative.CurrentInstructions.TurnID
		}
		return call, encoded, err
	default:
		return projectorTestCall{}, nil, fmt.Errorf("unsupported projector context %q", kind)
	}
}

func (runtime *projectorTestAgentRuntime) snapshotCalls() []projectorTestCall {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	return append([]projectorTestCall{}, runtime.calls...)
}

func (runtime *projectorTestAgentRuntime) setProjectionFailures(count int) {
	runtime.mu.Lock()
	runtime.failProjectionCalls = count
	runtime.mu.Unlock()
}

func projectorSemanticObservation(conversationID, turnID string, event conversation.TrajectoryEvent, semantic conversation.NarratorSemanticEvent, terminal bool) conversation.NarrationTrajectoryObservation {
	return conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         turnID,
		Trajectory:     []conversation.TrajectoryEvent{event},
		Semantic:       []conversation.NarratorSemanticEvent{semantic},
		Terminal:       terminal,
	}
}

func projectorTerminalObservation(conversationID, turnID string, terminal conversation.TrajectoryEvent) conversation.NarrationTrajectoryObservation {
	return projectorSemanticObservation(conversationID, turnID, terminal, projectorTerminalSemantic(conversationID, turnID, terminal), true)
}

func projectorPlanObservation(conversationID, turnID string, plan conversation.TrajectoryEvent) conversation.NarrationTrajectoryObservation {
	return projectorSemanticObservation(conversationID, turnID, plan, projectorPlanSemantic(conversationID, turnID, plan), false)
}

func projectorProgressSemantic(
	conversationID string,
	turnID string,
	sequence int,
) conversation.NarratorSemanticEvent {
	return conversation.NarratorSemanticEvent{
		ConversationID:   conversationID,
		TurnID:           turnID,
		SemanticSequence: sequence,
		Kind:             conversation.NarratorSemanticEventMeaningfulProgress,
		SourceTrajectoryRange: conversation.TrajectorySequenceRange{
			Start: sequence,
			End:   sequence,
		},
		CreatedAt: serviceTestTimestamp,
		MeaningfulProgress: &conversation.NarratorSemanticProgress{
			AssistantMessage: &conversation.NarratorSemanticAssistantMessage{
				ProviderItemID: fmt.Sprintf("projector-semantic-message-%d", sequence),
				Text:           fmt.Sprintf("Projector semantic progress %d completed.", sequence),
			},
		},
	}
}

func projectorPlanSemantic(
	conversationID string,
	turnID string,
	plan conversation.TrajectoryEvent,
) conversation.NarratorSemanticEvent {
	event := projectorProgressSemantic(conversationID, turnID, plan.Sequence)
	if plan.PlanChanged != nil {
		planPayload := *plan.PlanChanged
		planPayload.Steps = append([]conversation.PlanStep{}, plan.PlanChanged.Steps...)
		event.MeaningfulProgress = &conversation.NarratorSemanticProgress{Plan: &planPayload}
	}
	return event
}

func projectorTaskStartedSemantic(
	conversationID string,
	turnID string,
	sequence int,
) conversation.NarratorSemanticEvent {
	return conversation.NarratorSemanticEvent{
		ConversationID:   conversationID,
		TurnID:           turnID,
		SemanticSequence: sequence,
		Kind:             conversation.NarratorSemanticEventTaskStarted,
		SourceTrajectoryRange: conversation.TrajectorySequenceRange{
			Start: sequence,
			End:   sequence,
		},
		CreatedAt: serviceTestTimestamp,
		TaskStarted: &conversation.NarratorSemanticTaskStarted{
			Objective:   conversation.AuthoredInput{Text: "Keep the primary turn running."},
			Delivery:    conversation.TurnDeliveryQueued,
			RoleProfile: conversation.DefaultAgentRoleProfile(),
		},
	}
}

func projectorActivityFailedSemantic(
	conversationID string,
	turnID string,
	sequence int,
) conversation.NarratorSemanticEvent {
	event := projectorProgressSemantic(conversationID, turnID, sequence)
	event.MeaningfulProgress = &conversation.NarratorSemanticProgress{
		ActivityFailed: &conversation.TrajectoryActivityFailed{
			Activity: conversation.TrajectoryActivity{
				ID:    fmt.Sprintf("projector-activity-%d", sequence),
				Kind:  conversation.TrajectoryActivityCommand,
				Title: "Run the projector test command.",
			},
			Failure: conversation.Failure{
				Code:    "projector_activity_failed",
				Message: "The projector activity failed.",
			},
		},
	}
	return event
}

func projectorTerminalSemantic(
	conversationID string,
	turnID string,
	terminal conversation.TrajectoryEvent,
) conversation.NarratorSemanticEvent {
	event := conversation.NarratorSemanticEvent{
		ConversationID:   conversationID,
		TurnID:           turnID,
		SemanticSequence: terminal.Sequence,
		SourceTrajectoryRange: conversation.TrajectorySequenceRange{
			Start: terminal.Sequence,
			End:   terminal.Sequence,
		},
		CreatedAt: terminal.EmittedAt,
	}
	objective := conversation.AuthoredInput{Text: "Keep the primary turn running."}
	switch terminal.Kind {
	case conversation.TrajectoryEventTurnFailed:
		event.Kind = conversation.NarratorSemanticEventTaskFailed
		failure := conversation.Failure{
			Code:    "provider_turn_failed",
			Message: "scripted terminal failure",
		}
		if terminal.TurnFailed != nil {
			failure = terminal.TurnFailed.Failure
		}
		event.TaskFailed = &conversation.NarratorSemanticTaskFailed{
			Objective: objective,
			Status:    conversation.TurnStatusFailed,
			Failure:   failure,
			Artifacts: []conversation.ArtifactMetadata{},
		}
	case conversation.TrajectoryEventTurnInterrupted:
		event.Kind = conversation.NarratorSemanticEventTaskCanceled
		reason := conversation.TurnInterruptionUserRequested
		if terminal.TurnInterrupted != nil {
			reason = terminal.TurnInterrupted.Reason
		}
		event.TaskCanceled = &conversation.NarratorSemanticTaskCanceled{
			Objective: objective,
			Status:    conversation.TurnStatusCancelled,
			Reason:    reason,
			Artifacts: []conversation.ArtifactMetadata{},
		}
	default:
		event.Kind = conversation.NarratorSemanticEventTaskCompleted
		event.TaskCompleted = &conversation.NarratorSemanticTaskCompleted{
			Objective: objective,
			Status:    conversation.TurnStatusCompleted,
			Artifacts: []conversation.ArtifactMetadata{},
		}
	}
	return event
}

func newProjectorTestStore(t *testing.T) *conversation.Store {
	t.Helper()
	store, err := conversation.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Errorf("Close store: %v", err)
		}
	})
	return store
}

func newProjectorTestService(
	t *testing.T,
	store *conversation.Store,
	provider *projectorTestAgentRuntime,
	options ...ServiceOption,
) *Service {
	t.Helper()
	var idMu sync.Mutex
	idCounts := map[string]int{}
	options = append(options, WithServiceIDGenerator(func(prefix string) (string, error) {
		idMu.Lock()
		defer idMu.Unlock()
		idCounts[prefix]++
		return fmt.Sprintf("%s-%d", prefix, idCounts[prefix]), nil
	}))
	service, err := NewService(
		store,
		statusServiceWorkspaceResolver{summary: workspace.WorkspaceSummary{
			ID:       "workspace-status-service",
			RootPath: filepath.Clean(t.TempDir()),
		}},
		provider,
		options...,
	)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := service.Shutdown(ctx); err != nil {
			t.Errorf("Shutdown: %v", err)
		}
	})
	return service
}

func seedTerminalProjectorConversation(
	t *testing.T,
	store *conversation.Store,
) (string, string, conversation.TrajectoryEvent) {
	t.Helper()
	conversationID := "conversation-terminal-projector"
	turn, trajectory := statusServiceActiveTurn(conversationID)
	endedAt := "2026-07-12T12:01:00Z"
	turn.Status = conversation.TurnStatusCompleted
	turn.EndedAt = &endedAt
	invocation := *turn.ResolvedInvocation
	invocation.Outcome = conversation.InvocationOutcomeSucceeded
	invocation.EndedAt = &endedAt
	turn.ResolvedInvocation = &invocation
	turnID := turn.ID
	for index := 0; index < 12; index++ {
		trajectory = append(trajectory, conversation.TrajectoryEvent{
			ID:             fmt.Sprintf("projector-delta-%d", index+1),
			ConversationID: conversationID,
			TurnID:         &turnID,
			Sequence:       len(trajectory) + 1,
			EmittedAt:      serviceTestTimestamp,
			Kind:           conversation.TrajectoryEventAgentPublicTextDelta,
			Actor:          conversation.TrajectoryActorAgent,
			AgentPublicTextDelta: &conversation.TrajectoryAgentPublicTextDelta{
				ProviderItemID: "projector-message",
				Delta:          strings.Repeat(fmt.Sprintf("window-%02d ", index+1), 900),
			},
		})
	}
	artifactSequence := len(trajectory) + 1
	artifact := conversation.Artifact{
		ID:                 "projector-artifact",
		ConversationID:     conversationID,
		TurnID:             &turnID,
		TrajectorySequence: &artifactSequence,
		Title:              "Terminal projector result",
		Kind:               "Report",
		Summary:            "What the terminal projector produced.",
		CreatedAt:          endedAt,
		Document: conversation.ArtifactDocument{
			Language:  conversation.ArtifactDocumentLanguageOpenUI,
			CatalogID: conversation.ArtifactCatalogSettaV1,
			Source:    `root = Document([Text("The terminal projector produced a deterministic artifact.")])`,
		},
	}
	trajectory = append(trajectory, conversation.TrajectoryEvent{
		ID:             "projector-artifact-emitted",
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       artifactSequence,
		EmittedAt:      endedAt,
		Kind:           conversation.TrajectoryEventArtifactEmitted,
		Actor:          conversation.TrajectoryActorSystem,
		ArtifactEmitted: &conversation.TrajectoryArtifactEmitted{
			ArtifactID: artifact.ID,
			Title:      artifact.Title,
		},
	})
	terminal := conversation.TrajectoryEvent{
		ID:             "projector-terminal",
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       len(trajectory) + 1,
		EmittedAt:      endedAt,
		Kind:           conversation.TrajectoryEventTurnCompleted,
		Actor:          conversation.TrajectoryActorProvider,
		TurnCompleted:  &conversation.TrajectoryTurnCompleted{},
	}
	trajectory = append(trajectory, terminal)
	record := conversation.TopicConversation{
		ID:              conversationID,
		WorkspaceID:     stringPointerForProjectorTest("workspace-status-service"),
		Title:           "Terminal projector topic",
		TopicDescriptor: "Terminal projector topic",
		Status:          conversation.ConversationStatusIdle,
		CreatedAt:       serviceTestTimestamp,
		UpdatedAt:       endedAt,
	}
	narratorState := conversation.NarratorState{
		ConversationID:  conversationID,
		TopicDescriptor: record.TopicDescriptor,
		Status:          conversation.NarratorStatusReady,
		UpdatedAt:       serviceTestTimestamp,
	}
	presentation := conversation.ConversationPresentationProfile{
		ConversationID:          conversationID,
		PaletteSelection:        conversation.PresentationSelectionAutoDistinct,
		ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
		NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
		ResolvedNarratorVoiceID: narrationTestVoiceIDPointer(speech.SpeechVoiceAlloy),
		NarratorSpeechEnabled:   true,
		UpdatedAt:               serviceTestTimestamp,
	}
	_, err := store.Transact(context.Background(), "seed terminal projector", func(tx *conversation.WriteTransaction) error {
		if err := tx.InsertConversation(record); err != nil {
			return err
		}
		if err := tx.InsertNarratorState(narratorState); err != nil {
			return err
		}
		if err := tx.InsertTurn(turn); err != nil {
			return err
		}
		if err := tx.UpsertConversationPresentationProfile(presentation); err != nil {
			return err
		}
		for _, event := range trajectory {
			if err := tx.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		if err := tx.InsertArtifact(artifact); err != nil {
			return err
		}
		_, err := tx.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "terminal-projector-seed-event",
			StreamID:    "conversation:" + conversationID,
			Kind:        string(conversation.ConversationEventTypeConversationUpdated),
			Payload:     map[string]string{"conversationId": conversationID},
			CommittedAt: endedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("seed terminal projector: %v", err)
	}
	return conversationID, turnID, terminal
}

func seedFailedTerminalProjectorConversation(
	t *testing.T,
	store *conversation.Store,
) (string, string, conversation.TrajectoryEvent) {
	t.Helper()
	conversationID := "conversation-failed-terminal-projector"
	turn, trajectory := statusServiceActiveTurn(conversationID)
	endedAt := "2026-07-12T12:01:00Z"
	failure := conversation.Failure{
		Code:      "provider_turn_failed",
		Message:   "scripted terminal failure",
		Retryable: true,
	}
	turn.Status = conversation.TurnStatusFailed
	turn.EndedAt = &endedAt
	turn.Error = &failure
	invocation := *turn.ResolvedInvocation
	invocation.Outcome = conversation.InvocationOutcomeFailed
	invocation.EndedAt = &endedAt
	invocation.Failure = &failure
	turn.ResolvedInvocation = &invocation
	turnID := turn.ID
	for index := 0; index < 18; index++ {
		trajectory = append(trajectory, conversation.TrajectoryEvent{
			ID:             fmt.Sprintf("failed-projector-delta-%d", index+1),
			ConversationID: conversationID,
			TurnID:         &turnID,
			Sequence:       len(trajectory) + 1,
			EmittedAt:      serviceTestTimestamp,
			Kind:           conversation.TrajectoryEventAgentPublicTextDelta,
			Actor:          conversation.TrajectoryActorAgent,
			AgentPublicTextDelta: &conversation.TrajectoryAgentPublicTextDelta{
				ProviderItemID: "failed-projector-message",
				Delta:          strings.Repeat(fmt.Sprintf("failed-window-%02d ", index+1), 900),
			},
		})
	}
	terminal := conversation.TrajectoryEvent{
		ID:             "failed-projector-terminal",
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       len(trajectory) + 1,
		EmittedAt:      endedAt,
		Kind:           conversation.TrajectoryEventTurnFailed,
		Actor:          conversation.TrajectoryActorProvider,
		TurnFailed:     &conversation.TrajectoryTurnFailed{Failure: failure},
	}
	trajectory = append(trajectory, terminal)
	record := conversation.TopicConversation{
		ID:              conversationID,
		WorkspaceID:     stringPointerForProjectorTest("workspace-status-service"),
		Title:           "Failed terminal projector topic",
		TopicDescriptor: "Failed terminal projector topic",
		Status:          conversation.ConversationStatusIdle,
		CreatedAt:       serviceTestTimestamp,
		UpdatedAt:       endedAt,
	}
	narratorState := conversation.NarratorState{
		ConversationID:  conversationID,
		TopicDescriptor: record.TopicDescriptor,
		Status:          conversation.NarratorStatusReady,
		UpdatedAt:       serviceTestTimestamp,
	}
	presentation := conversation.ConversationPresentationProfile{
		ConversationID:          conversationID,
		PaletteSelection:        conversation.PresentationSelectionAutoDistinct,
		ResolvedPaletteID:       conversationpalette.ConversationPaletteSky,
		NarratorVoiceSelection:  speech.VoiceSelectionAutoDistinct,
		ResolvedNarratorVoiceID: narrationTestVoiceIDPointer(speech.SpeechVoiceAlloy),
		NarratorSpeechEnabled:   true,
		UpdatedAt:               serviceTestTimestamp,
	}
	_, err := store.Transact(context.Background(), "seed failed terminal projector", func(tx *conversation.WriteTransaction) error {
		if err := tx.InsertConversation(record); err != nil {
			return err
		}
		if err := tx.InsertNarratorState(narratorState); err != nil {
			return err
		}
		if err := tx.InsertTurn(turn); err != nil {
			return err
		}
		if err := tx.UpsertConversationPresentationProfile(presentation); err != nil {
			return err
		}
		for _, event := range trajectory {
			if err := tx.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		_, err := tx.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "failed-terminal-projector-seed-event",
			StreamID:    "conversation:" + conversationID,
			Kind:        string(conversation.ConversationEventTypeConversationUpdated),
			Payload:     map[string]string{"conversationId": conversationID},
			CommittedAt: endedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("seed failed terminal projector: %v", err)
	}
	return conversationID, turnID, terminal
}

func markNarratorCaughtUpAtTerminal(
	t *testing.T,
	store *conversation.Store,
	conversationID string,
	terminalSequence int,
) {
	t.Helper()
	state, err := store.ReadNarratorState(context.Background(), conversationID)
	if err != nil {
		t.Fatalf("read narrator state before terminal finalization: %v", err)
	}
	updated := state
	updated.ObservedThroughSequence = terminalSequence
	updated.CheckpointThroughSequence = terminalSequence
	updated.CheckpointText = "History through the failed terminal event is already checkpointed."
	updated.UpdatedAt = "2026-07-12T12:01:10Z"
	_, err = store.Transact(context.Background(), "mark narrator caught up at terminal", func(tx *conversation.WriteTransaction) error {
		if err := tx.UpdateNarratorState(conversation.NarratorStateExpectation{
			ObservedThroughSequence:   state.ObservedThroughSequence,
			CheckpointThroughSequence: state.CheckpointThroughSequence,
			CurrentFocusRevision:      state.CurrentFocusRevision,
			UpdatedAt:                 state.UpdatedAt,
		}, updated); err != nil {
			return err
		}
		_, err := tx.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "failed-terminal-caught-up-state-publication",
			StreamID:    "conversation:" + conversationID,
			Kind:        string(conversation.ConversationEventTypeConversationUpdated),
			Payload:     map[string]string{"conversationId": conversationID},
			CommittedAt: updated.UpdatedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("mark narrator caught up at terminal: %v", err)
	}
}

func appendSecondTerminalProjectorTurn(
	t *testing.T,
	store *conversation.Store,
	conversationID string,
) (string, conversation.TrajectoryEvent, conversation.TrajectoryEvent) {
	t.Helper()
	snapshot, err := store.ReadSnapshot(context.Background(), "workspace-status-service", conversationID)
	if err != nil {
		t.Fatalf("read first terminal projector turn: %v", err)
	}
	turn, events := statusServiceActiveTurn(conversationID)
	turn.ID = "primary-agent-turn-two"
	turn.AuthoredInput = conversation.AuthoredInput{Text: "Complete the promoted second turn."}
	turn.AcceptedAt = "2026-07-12T12:02:00Z"
	startedAt := "2026-07-12T12:02:01Z"
	endedAt := "2026-07-12T12:02:02Z"
	turn.StartedAt = &startedAt
	turn.EndedAt = &endedAt
	turn.Status = conversation.TurnStatusCompleted
	providerTurnID := "provider-primary-turn-two"
	turn.ProviderTurnID = &providerTurnID
	invocation := *turn.ResolvedInvocation
	invocation.ID = "primary-agent-invocation-two"
	invocation.StartedAt = startedAt
	invocation.EndedAt = &endedAt
	invocation.Outcome = conversation.InvocationOutcomeSucceeded
	invocation.ProviderReferences.TurnID = &providerTurnID
	turn.ResolvedInvocation = &invocation
	turnID := turn.ID
	accepted := events[0]
	accepted.ID = "second-user-input"
	accepted.TurnID = &turnID
	accepted.Sequence = snapshot.Conversation.LastTrajectorySequence + 1
	accepted.EmittedAt = turn.AcceptedAt
	accepted.UserInputAccepted.Input = turn.AuthoredInput
	started := events[1]
	started.ID = "second-turn-started"
	started.TurnID = &turnID
	started.Sequence = accepted.Sequence + 1
	started.EmittedAt = startedAt
	started.ProviderTurnID = &providerTurnID
	startedInvocation := invocation
	startedInvocation.EndedAt = nil
	startedInvocation.Outcome = conversation.InvocationOutcomeRunning
	started.TurnStarted.Invocation = startedInvocation
	plan := conversation.TrajectoryEvent{
		ID:             "second-plan",
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       started.Sequence + 1,
		EmittedAt:      startedAt,
		Kind:           conversation.TrajectoryEventPlanChanged,
		Actor:          conversation.TrajectoryActorAgent,
		PlanChanged: &conversation.TrajectoryPlanChanged{Steps: []conversation.PlanStep{{
			Text:   "Finish the promoted turn",
			Status: conversation.PlanStepStatusCompleted,
		}}},
	}
	terminal := conversation.TrajectoryEvent{
		ID:             "second-terminal",
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       plan.Sequence + 1,
		EmittedAt:      endedAt,
		Kind:           conversation.TrajectoryEventTurnCompleted,
		Actor:          conversation.TrajectoryActorProvider,
		ProviderTurnID: &providerTurnID,
		TurnCompleted:  &conversation.TrajectoryTurnCompleted{},
	}
	updated := snapshot.Conversation
	updated.UpdatedAt = endedAt
	_, err = store.Transact(context.Background(), "append second terminal projector turn", func(tx *conversation.WriteTransaction) error {
		if err := tx.UpdateConversation(conversation.ConversationExpectation{
			UpdatedAt:              snapshot.Conversation.UpdatedAt,
			LastTrajectorySequence: snapshot.Conversation.LastTrajectorySequence,
		}, updated); err != nil {
			return err
		}
		if err := tx.InsertTurn(turn); err != nil {
			return err
		}
		for _, event := range []conversation.TrajectoryEvent{accepted, started, plan, terminal} {
			if err := tx.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		_, err := tx.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID:          "second-terminal-projector-event",
			StreamID:    "conversation:" + conversationID,
			Kind:        string(conversation.ConversationEventTypeConversationUpdated),
			Payload:     map[string]string{"conversationId": conversationID},
			CommittedAt: endedAt,
		})
		return err
	})
	if err != nil {
		t.Fatalf("append second terminal projector turn: %v", err)
	}
	return turnID, plan, terminal
}

func waitForProjectorSnapshot(
	t *testing.T,
	store *conversation.Store,
	conversationID string,
	ready func(conversation.ConversationSnapshot) bool,
) conversation.ConversationSnapshot {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for {
		snapshot, err := store.ReadSnapshot(context.Background(), "workspace-status-service", conversationID)
		if err != nil {
			t.Fatalf("ReadSnapshot: %v", err)
		}
		if ready(snapshot) {
			return snapshot
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for projector snapshot: %+v", snapshot)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func waitForTerminalProjectorIdle(
	t *testing.T,
	service *Service,
	provider *projectorTestAgentRuntime,
	conversationID string,
	wantCalls int,
) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		service.lifecycleMu.Lock()
		queue := service.terminal[conversationID]
		idle := queue != nil && !queue.activeInFlight
		service.lifecycleMu.Unlock()
		if idle && len(provider.snapshotCalls()) >= wantCalls {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for terminal projector retry exhaustion")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func projectorNarratorExpectation(state conversation.NarratorState) conversation.NarratorStateExpectation {
	return conversation.NarratorStateExpectation{
		ObservedThroughSequence:   state.ObservedThroughSequence,
		CheckpointThroughSequence: state.CheckpointThroughSequence,
		CurrentFocusRevision:      state.CurrentFocusRevision,
		UpdatedAt:                 state.UpdatedAt,
	}
}

func latestNarrationOfKind(
	snapshot conversation.ConversationSnapshot,
	kind conversation.NarrationEventKind,
) *conversation.NarrationEvent {
	for index := len(snapshot.Narration.Events) - 1; index >= 0; index-- {
		if snapshot.Narration.Events[index].Kind == kind {
			return &snapshot.Narration.Events[index]
		}
	}
	return nil
}

func finalNarrationTurnIDs(snapshot conversation.ConversationSnapshot) []string {
	result := []string{}
	for _, event := range snapshot.Narration.Events {
		if event.Kind == conversation.NarrationEventKindFinalSummary && event.TurnID != nil {
			result = append(result, *event.TurnID)
		}
	}
	return result
}

func assertTerminalProjectorState(
	t *testing.T,
	snapshot conversation.ConversationSnapshot,
	turnID string,
) {
	t.Helper()
	state := snapshot.NarratorState
	if state.CheckpointThroughSequence > state.ObservedThroughSequence ||
		state.Status != conversation.NarratorStatusReady || state.Degradation != nil {
		t.Fatalf("terminal projector state = %+v", state)
	}
	final := latestNarrationOfKind(snapshot, conversation.NarrationEventKindFinalSummary)
	if final == nil || final.TurnID == nil || *final.TurnID != turnID ||
		final.Trigger != conversation.NarrationTriggerTurnTerminal ||
		final.SourceSequenceEnd != snapshot.Conversation.LastTrajectorySequence ||
		final.FinalSummary == nil ||
		final.FinalSummary.Text != "The terminal projector result is summarized immediately." {
		t.Fatalf("terminal final summary = %+v", final)
	}
}

func assertTerminalBypassesBacklogCheckpoint(
	t *testing.T,
	calls []projectorTestCall,
	terminalSequence int,
) {
	t.Helper()
	terminalIndex := -1
	for index, call := range calls {
		if call.kind == ContextKindCheckpoint && terminalIndex < 0 {
			t.Fatalf("checkpoint ran before terminal summary request: calls=%+v", calls)
		}
		if call.kind != ContextKindProjection ||
			call.requestedChannel != ProjectionChannelTerminal {
			continue
		}
		if terminalIndex >= 0 {
			continue
		}
		terminalIndex = index
		if call.trigger != conversation.NarrationTriggerTurnTerminal ||
			call.evaluationStart != call.preCallObserved+1 ||
			call.evaluationEnd != terminalSequence {
			t.Fatalf("terminal call %d = %+v, want direct terminal through %d", index, call, terminalSequence)
		}
	}
	if terminalIndex != 0 {
		t.Fatalf("terminal summary request was not first provider call: calls=%+v", calls)
	}
}

func assertTerminalCallOrder(
	t *testing.T,
	calls []projectorTestCall,
	firstTurnID string,
	secondTurnID string,
) {
	t.Helper()
	terminalTurns := []string{}
	for _, call := range calls {
		if call.requestedChannel == ProjectionChannelTerminal {
			terminalTurns = append(terminalTurns, call.turnID)
		}
	}
	if len(terminalTurns) != 2 || terminalTurns[0] != firstTurnID || terminalTurns[1] != secondTurnID {
		t.Fatalf("terminal provider calls ran out of order: calls=%+v terminalTurns=%v", calls, terminalTurns)
	}
}
