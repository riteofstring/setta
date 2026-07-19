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
	"setta/internal/speech"
	"setta/internal/workspace"
	"setta/internal/workspaceui/conversationpalette"
)

func TestServiceProjectsTerminalBacklogInOrderAndCheckpointsBeforeResuming(t *testing.T) {
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

	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         turnID,
		Trajectory:     []conversation.TrajectoryEvent{terminal},
		Terminal:       true,
	})

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
	assertTerminalProjectorCalls(t, provider.snapshotCalls(), terminal.Sequence)
}

func TestServiceRecoversCommittedTerminalBacklogAfterRestart(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, terminal := seedTerminalProjectorConversation(t, store)
	provider := &projectorTestAgentRuntime{}
	service := newProjectorTestService(t, store, provider)
	if err := service.RecoverCommittedTrajectory(context.Background()); err != nil {
		t.Fatalf("RecoverCommittedTrajectory: %v", err)
	}

	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.ObservedThroughSequence == terminal.Sequence &&
			latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	assertTerminalProjectorState(t, snapshot, turnID)
	if calls := provider.snapshotCalls(); len(calls) == 0 ||
		calls[len(calls)-1].requestedChannel != ProjectionChannelTerminal {
		t.Fatalf("recovered projector calls = %+v", calls)
	}
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
	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         turnID,
		Trajectory:     []conversation.TrajectoryEvent{terminal},
		Terminal:       true,
	})
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
	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         turnID,
		Trajectory:     []conversation.TrajectoryEvent{terminal},
		Terminal:       true,
	})
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

func TestServiceResumesFailedTerminalProjectionAfterCatchUpCheckpoint(t *testing.T) {
	store := newProjectorTestStore(t)
	conversationID, turnID, terminal := seedFailedTerminalProjectorConversation(t, store)
	progressStarted := make(chan struct{})
	releaseProgress := make(chan struct{})
	provider := &projectorTestAgentRuntime{
		blockFirstProjection: true,
		firstCallStarted:     progressStarted,
		releaseFirstCall:     releaseProgress,
	}
	service := newProjectorTestService(t, store, provider, WithServiceProgressWait(
		func(ctx context.Context, _ time.Duration) error {
			return ctx.Err()
		},
	))

	progress := conversation.TrajectoryEvent{
		ConversationID: conversationID,
		TurnID:         &turnID,
		Sequence:       14,
		Kind:           conversation.TrajectoryEventAgentPublicTextDelta,
	}
	service.submitProjection(
		conversationID,
		ProjectionOperation{
			WorkspaceID:     "workspace-status-service",
			TurnID:          turnID,
			ThroughSequence: progress.Sequence,
		},
		conversation.NarrationTriggerProgressWindowElapsed,
	)
	select {
	case <-progressStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for active progress projection")
	}

	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         turnID,
		Trajectory:     []conversation.TrajectoryEvent{terminal},
		Terminal:       true,
	})
	close(releaseProgress)

	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		return current.NarratorState.ObservedThroughSequence == terminal.Sequence &&
			latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	assertTerminalProjectorState(t, snapshot, turnID)
}

func TestServiceFinalizesTerminalProjectionAfterCheckpointCaughtUp(t *testing.T) {
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

	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         turnID,
		Trajectory:     []conversation.TrajectoryEvent{terminal},
		Terminal:       true,
	})

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

func TestServiceTerminalCatchUpSurvivesWorkingMilestoneCadence(t *testing.T) {
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
		},
		conversation.NarrationTriggerProgressWindowElapsed,
	)
	snapshot := waitForProjectorSnapshot(t, store, conversationID, func(current conversation.ConversationSnapshot) bool {
		if current.NarratorState.Degradation != nil {
			t.Fatalf("terminal catch-up degraded narrator: degradation=%+v calls=%+v",
				*current.NarratorState.Degradation,
				provider.snapshotCalls(),
			)
		}
		return latestNarrationOfKind(current, conversation.NarrationEventKindFinalSummary) != nil
	})
	assertTerminalProjectorState(t, snapshot, turnID)
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

	observation := conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         turnID,
		Trajectory:     []conversation.TrajectoryEvent{terminal},
		Terminal:       true,
	}
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

	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         firstTurnID,
		Trajectory:     []conversation.TrajectoryEvent{firstTerminal},
		Terminal:       true,
	})
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
		Trajectory: []conversation.TrajectoryEvent{{
			Kind: conversation.TrajectoryEventActivityFailed,
		}},
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
	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         turnID,
		Trajectory: []conversation.TrajectoryEvent{{
			ConversationID: conversationID,
			TurnID:         &turnID,
			Sequence:       2,
			Kind:           conversation.TrajectoryEventTurnStarted,
		}},
	})
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

func TestServiceSerializesTerminalCatchUpAcrossPromotedTurns(t *testing.T) {
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

	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         firstTurnID,
		Trajectory:     []conversation.TrajectoryEvent{firstTerminal},
		Terminal:       true,
	})
	select {
	case <-firstCallStarted:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first terminal projection")
	}
	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         secondTurnID,
		Trajectory:     []conversation.TrajectoryEvent{plan},
	})
	service.ObserveCommittedTrajectory(conversation.NarrationTrajectoryObservation{
		WorkspaceID:    "workspace-status-service",
		ConversationID: conversationID,
		TurnID:         secondTurnID,
		Trajectory:     []conversation.TrajectoryEvent{secondTerminal},
		Terminal:       true,
	})
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
}

type projectorTestAgentRuntime struct {
	mu                       sync.Mutex
	calls                    []projectorTestCall
	failFocusCalls           int
	failProjectionCalls      int
	blockFirstProjection     bool
	emitProjectionMilestones bool
	firstCallStarted         chan struct{}
	releaseFirstCall         chan struct{}
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
		}
		if bundle.Authoritative.CurrentInstructions != nil {
			call.turnID = bundle.Authoritative.CurrentInstructions.TurnID
		}
		output := map[string]any{
			"kind":                    string(CallOutputWorkingProjection),
			"observedThroughSequence": bundle.EvaluationRange.End,
			"milestones":              []string{},
		}
		if runtime.emitProjectionMilestones && bundle.RequestedChannel == ProjectionChannelWorking &&
			len(bundle.PriorMilestones) == 0 {
			output["milestones"] = []string{
				fmt.Sprintf("The backlog now covers event %d.", bundle.EvaluationRange.End),
			}
		}
		if bundle.RequestedChannel == ProjectionChannelTerminal {
			output["kind"] = string(CallOutputTerminalProjection)
			output["finalSummary"] = "The terminal backlog is fully caught up."
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
	turn, binding, trajectory := statusServiceActiveTurn(conversationID)
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
		WorkspaceID:     "workspace-status-service",
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
		if err := tx.UpsertAgentThreadBinding(binding); err != nil {
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
	turn, binding, trajectory := statusServiceActiveTurn(conversationID)
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
		WorkspaceID:     "workspace-status-service",
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
		if err := tx.UpsertAgentThreadBinding(binding); err != nil {
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
		t.Fatalf("read narrator state before catch-up: %v", err)
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
	turn, _, events := statusServiceActiveTurn(conversationID)
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
	deadline := time.Now().Add(5 * time.Second)
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
	if state.CheckpointThroughSequence <= 0 ||
		state.CheckpointThroughSequence > state.ObservedThroughSequence ||
		state.Status != conversation.NarratorStatusReady || state.Degradation != nil {
		t.Fatalf("terminal projector state = %+v", state)
	}
	final := latestNarrationOfKind(snapshot, conversation.NarrationEventKindFinalSummary)
	if final == nil || final.TurnID == nil || *final.TurnID != turnID ||
		final.Trigger != conversation.NarrationTriggerTurnTerminal ||
		final.SourceSequenceEnd != snapshot.Conversation.LastTrajectorySequence ||
		final.FinalSummary == nil ||
		final.FinalSummary.Text != "The terminal backlog is fully caught up." {
		t.Fatalf("terminal final summary = %+v", final)
	}
}

func assertTerminalProjectorCalls(
	t *testing.T,
	calls []projectorTestCall,
	terminalSequence int,
) {
	t.Helper()
	if len(calls) < 4 {
		t.Fatalf("projector calls = %+v, want retry, catch-up, checkpoint, and terminal", calls)
	}
	checkpointSeen := false
	successfulProjectionSeen := false
	for index, call := range calls {
		switch call.kind {
		case ContextKindCheckpoint:
			checkpointSeen = true
			if call.checkpointRangeStart <= 0 || call.checkpointRangeEnd < call.checkpointRangeStart {
				t.Fatalf("checkpoint call %d has invalid range: %+v", index, call)
			}
		case ContextKindProjection:
			if index > 0 {
				successfulProjectionSeen = true
				if call.evaluationStart != call.preCallObserved+1 {
					t.Fatalf("projection call %d skipped trajectory: %+v", index, call)
				}
			}
		}
	}
	last := calls[len(calls)-1]
	if !checkpointSeen || !successfulProjectionSeen ||
		last.kind != ContextKindProjection || last.requestedChannel != ProjectionChannelTerminal ||
		last.trigger != conversation.NarrationTriggerTurnTerminal ||
		last.evaluationEnd != terminalSequence {
		t.Fatalf("terminal projector call order = %+v", calls)
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
