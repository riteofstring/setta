package conversation

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/agent"
)

type conversationAgentEventSink struct {
	invocationID string
	resolved     agent.ResolvedInvocation
	service      *Service
	turn         *activeConversationTurn
}

func (sink *conversationAgentEventSink) HandleAgentEvent(event agent.Event) error {
	return sink.service.handleAgentEvent(
		sink.service.lifecycleCtx,
		sink.turn,
		sink.invocationID,
		sink.resolved,
		event,
	)
}

func (service *Service) runTurn(active *activeConversationTurn) {
	defer service.turns.Done()
	invocationID, err := service.newID("invocation")
	if err != nil {
		service.finishRunTurn(active, err)
		return
	}
	resolved, err := service.agent.ResolveInvocation(service.lifecycleCtx, active.request.Invocation)
	if err != nil {
		service.finishRunTurn(active, fmt.Errorf("resolve agent invocation: %w", err))
		return
	}
	_, err = service.agent.RunTurn(
		service.lifecycleCtx,
		active.request,
		&conversationAgentEventSink{
			invocationID: invocationID,
			resolved:     resolved,
			service:      service,
			turn:         active,
		},
	)
	service.finishRunTurn(active, err)
}

func (service *Service) finishRunTurn(active *activeConversationTurn, runErr error) {
	lock := service.conversationLock(active.conversationID)
	lock.Lock()
	if runErr == nil {
		runErr = errors.New("agent runtime ended without a durable terminal event")
	}
	// The provider result is not the durable source of truth. Re-read the turn
	// even on a nil runtime error so a missing terminal notification is made
	// explicit instead of leaving a running record behind while queued work is
	// promoted.
	persisted := service.persistUnexpectedTurnEnd(context.Background(), active, runErr) == nil
	service.activeMu.Lock()
	if current := service.active[active.conversationID]; current != nil && current.turnID == active.turnID {
		delete(service.active, active.conversationID)
	}
	service.activeMu.Unlock()
	lock.Unlock()
	if agent.IsProviderThreadMissing(runErr) {
		// The carrier is gone, not the conversation. Dropping it means the next
		// turn replays Setta's record into a fresh one instead of addressing a
		// thread the provider no longer has.
		service.carriers.Forget(active.conversationID)
	}
	if persisted {
		service.promoteNextTurn(active.workspaceID, active.conversationID)
	}
}

func (service *Service) promoteNextTurn(workspaceID string, conversationID string) {
	_ = service.promoteNextTurnWithResult(context.Background(), workspaceID, conversationID)
}

func (service *Service) promoteNextTurnWithResult(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) error {
	if err := service.requireOpen(); err != nil {
		return err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	if service.activeFor(conversationID) != nil {
		return nil
	}
	snapshot, err := service.store.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil {
		return err
	}
	if len(snapshot.Queue) == 0 {
		return nil
	}
	queued := snapshot.Queue[0]
	turn, err := findConversationTurn(snapshot, queued.TurnID)
	if err != nil {
		return err
	}
	workspaceSummary, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		persistErr := service.persistUnexpectedTurnEnd(ctx, &activeConversationTurn{
			conversationID: conversationID,
			queueOrdinal:   queued.Ordinal,
			turnID:         turn.ID,
			workspaceID:    workspaceID,
		}, err)
		if persistErr != nil {
			return errors.Join(err, fmt.Errorf("persist queued turn workspace recovery failure: %w", persistErr))
		}
		return nil
	}
	if err := service.launchTurnLocked(ctx, workspaceSummary.RootPath, workspaceID, turn, queued.Ordinal); err != nil {
		persistErr := service.persistUnexpectedTurnEnd(ctx, &activeConversationTurn{
			conversationID: conversationID,
			queueOrdinal:   queued.Ordinal,
			turnID:         turn.ID,
			workspaceID:    workspaceID,
		}, err)
		if persistErr != nil {
			return errors.Join(err, fmt.Errorf("persist queued turn launch recovery failure: %w", persistErr))
		}
	}
	return nil
}

func (service *Service) handleAgentEvent(
	ctx context.Context,
	active *activeConversationTurn,
	invocationID string,
	resolved agent.ResolvedInvocation,
	event agent.Event,
) error {
	if event.ConversationID != active.conversationID || event.TurnID != active.turnID {
		return fmt.Errorf("agent event scope %s/%s does not match %s/%s", event.ConversationID, event.TurnID, active.conversationID, active.turnID)
	}
	if event.ProviderThreadID != active.providerThreadID {
		return fmt.Errorf(
			"agent event provider thread %s does not match %s",
			event.ProviderThreadID,
			active.providerThreadID,
		)
	}
	if event.ProviderTurnID == "" {
		return errors.New("agent event provider turn id is required")
	}
	if event.Kind != agent.EventKindTurnStarted {
		if active.providerTurnID == "" {
			return errors.New("agent progress arrived before the provider turn started")
		}
		if event.ProviderTurnID != active.providerTurnID {
			return fmt.Errorf(
				"agent event provider turn %s does not match %s",
				event.ProviderTurnID,
				active.providerTurnID,
			)
		}
	}
	lock := service.conversationLock(active.conversationID)
	lock.Lock()
	defer lock.Unlock()
	switch event.Kind {
	case agent.EventKindTurnStarted:
		return service.persistTurnStarted(ctx, active, invocationID, resolved, event)
	case agent.EventKindTurnTerminal:
		return service.persistTurnTerminal(ctx, active, event)
	case agent.EventKindAgentTextDelta,
		agent.EventKindAgentTextCompleted,
		agent.EventKindReasoningSummary,
		agent.EventKindPlanChanged,
		agent.EventKindActivityStarted,
		agent.EventKindActivityUpdated,
		agent.EventKindActivityCompleted,
		agent.EventKindApprovalRequested,
		agent.EventKindApprovalSuperseded,
		agent.EventKindValidationRecorded,
		agent.EventKindModelRerouted,
		agent.EventKindLifecycleChanged:
		return service.persistAgentProgress(ctx, active, event)
	default:
		return fmt.Errorf("unsupported topic agent event kind %q", event.Kind)
	}
}

func (service *Service) persistTurnStarted(
	ctx context.Context,
	active *activeConversationTurn,
	invocationID string,
	resolved agent.ResolvedInvocation,
	event agent.Event,
) error {
	mutation, err := service.prepareTurnStart(active, invocationID, resolved, event)
	if err != nil {
		return err
	}
	publications, err := service.publications(
		active.conversationID,
		mutation.now,
		turnStartPayloads(mutation)...,
	)
	if err != nil {
		return err
	}
	if err := service.commitTurnStart(ctx, mutation, publications); err != nil {
		return err
	}
	service.setActiveProviderTurn(active, event.ProviderTurnID)
	return nil
}

type turnStartMutation struct {
	events       []TrajectoryEvent
	now          string
	queue        []QueuedConversationTurn
	queueOrdinal int
	snapshot     ConversationSnapshot
	turn         ConversationTurn
}

func (service *Service) prepareTurnStart(
	active *activeConversationTurn,
	invocationID string,
	resolved agent.ResolvedInvocation,
	event agent.Event,
) (turnStartMutation, error) {
	ctx := service.lifecycleCtx
	snapshot, err := service.snapshotLocked(ctx, active.workspaceID, active.conversationID)
	if err != nil {
		return turnStartMutation{}, err
	}
	turn, err := findConversationTurn(snapshot, active.turnID)
	if err != nil {
		return turnStartMutation{}, err
	}
	if turn.Status != TurnStatusQueued {
		return turnStartMutation{}, &CommandConflictError{ConversationID: active.conversationID, Reason: "provider started a non-queued turn"}
	}
	now := advanceTimestamp(turn.AcceptedAt, service.timestamp())
	invocation := resolvedConversationInvocation(
		invocationID,
		active.roleProfile,
		resolved,
		event.ProviderTurnID,
		now,
	)
	turn.Status = TurnStatusRunning
	turn.StartedAt = &now
	turn.ResolvedInvocation = &invocation
	turn.ProviderTurnID = &event.ProviderTurnID
	events, err := service.turnStartTrajectories(active, snapshot, turn, invocation, event, now)
	if err != nil {
		return turnStartMutation{}, err
	}
	queue, err := queueAfterTurnStart(snapshot.Queue, turn.ID, active.queueOrdinal)
	if err != nil {
		return turnStartMutation{}, err
	}
	return turnStartMutation{
		events:       events,
		now:          now,
		queue:        queue,
		queueOrdinal: active.queueOrdinal,
		snapshot:     snapshot,
		turn:         turn,
	}, nil
}

func (service *Service) turnStartTrajectories(
	active *activeConversationTurn,
	snapshot ConversationSnapshot,
	turn ConversationTurn,
	invocation ResolvedInvocation,
	event agent.Event,
	now string,
) ([]TrajectoryEvent, error) {
	events := make([]TrajectoryEvent, 0, 2)
	if active.queueOrdinal > 0 {
		promotedID, err := service.newID("trajectory")
		if err != nil {
			return nil, err
		}
		events = append(events, TrajectoryEvent{
			ID:           promotedID,
			Kind:         TrajectoryEventTurnPromoted,
			Actor:        TrajectoryActorSystem,
			TurnPromoted: &TrajectoryTurnPromoted{FormerQueueOrdinal: active.queueOrdinal},
		})
	}
	startedID, err := service.newID("trajectory")
	if err != nil {
		return nil, err
	}
	events = append(events, TrajectoryEvent{
		ID:          startedID,
		Kind:        TrajectoryEventTurnStarted,
		Actor:       TrajectoryActorAgent,
		TurnStarted: &TrajectoryTurnStarted{Invocation: invocation},
	})
	for index := range events {
		events[index].ConversationID = active.conversationID
		events[index].TurnID = &turn.ID
		events[index].Sequence = snapshot.Conversation.LastTrajectorySequence + index + 1
		events[index].EmittedAt = now
		events[index].ProviderTurnID = &event.ProviderTurnID
	}
	return events, nil
}

func queueAfterTurnStart(
	snapshotQueue []QueuedConversationTurn,
	turnID string,
	queueOrdinal int,
) ([]QueuedConversationTurn, error) {
	queue := append([]QueuedConversationTurn{}, snapshotQueue...)
	if queueOrdinal > 0 {
		return queueAfterRemoval(queue, turnID, queueOrdinal)
	}
	return queue, nil
}

func turnStartPayloads(mutation turnStartMutation) []ConversationEventPayload {
	payloads := []ConversationEventPayload{
		ConversationTurnUpdatedEventPayload{Type: ConversationEventTypeTurnUpdated, Turn: mutation.turn},
	}
	if mutation.queueOrdinal > 0 {
		payloads = append(payloads, ConversationQueueUpdatedEventPayload{Type: ConversationEventTypeQueueUpdated, Queue: mutation.queue})
	}
	for _, trajectory := range mutation.events {
		payloads = append(payloads, ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: trajectory})
	}
	return payloads
}

func (service *Service) commitTurnStart(
	ctx context.Context,
	mutation turnStartMutation,
	publications []preparedPublication,
) error {
	_, err := service.store.Transact(ctx, "start topic conversation turn", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateTurn(TurnStatusQueued, mutation.turn); err != nil {
			return err
		}
		if err := applyTurnStartQueueMutation(transaction, mutation); err != nil {
			return err
		}
		for _, trajectory := range mutation.events {
			if err := transaction.AppendTrajectoryEvent(trajectory); err != nil {
				return err
			}
		}
		return appendPublications(transaction, publications)
	})
	if err == nil {
		service.observeCommittedTrajectory(
			mutation.snapshot.Conversation,
			mutation.turn,
			mutation.events,
			nil,
			false,
		)
	}
	return err
}

func applyTurnStartQueueMutation(transaction *WriteTransaction, mutation turnStartMutation) error {
	if mutation.queueOrdinal <= 0 {
		return nil
	}
	if err := transaction.DeleteQueuedTurn(mutation.turn.ID, mutation.turn.ConversationID, mutation.queueOrdinal); err != nil {
		return err
	}
	return transaction.CompactQueuedTurns(mutation.turn.ConversationID, mutation.queueOrdinal)
}

func (service *Service) setActiveProviderTurn(active *activeConversationTurn, providerTurnID string) {
	service.activeMu.Lock()
	if current := service.active[active.conversationID]; current != nil && current.turnID == active.turnID {
		current.providerTurnID = providerTurnID
	}
	service.activeMu.Unlock()
}

func queueAfterRemoval(
	queue []QueuedConversationTurn,
	turnID string,
	ordinal int,
) ([]QueuedConversationTurn, error) {
	removed := -1
	for index, queued := range queue {
		if queued.TurnID == turnID && queued.Ordinal == ordinal {
			removed = index
			break
		}
	}
	if removed < 0 {
		return nil, fmt.Errorf("queued turn %s at ordinal %d is missing", turnID, ordinal)
	}
	queue = append(queue[:removed], queue[removed+1:]...)
	for index := range queue {
		queue[index].Ordinal = index + 1
	}
	return queue, nil
}

func (service *Service) persistTurnTerminal(
	ctx context.Context,
	active *activeConversationTurn,
	event agent.Event,
) error {
	if event.Terminal == nil {
		return errors.New("terminal agent event is missing terminal payload")
	}
	mutation, err := service.prepareTurnTerminal(active, event)
	if err != nil {
		return err
	}
	publications, err := service.publications(
		active.conversationID,
		mutation.trajectory.EmittedAt,
		turnTerminalPayloads(mutation)...,
	)
	if err != nil {
		return err
	}
	return service.commitTurnTerminal(ctx, mutation, publications)
}

type turnTerminalMutation struct {
	conversation TopicConversation
	snapshot     ConversationSnapshot
	trajectory   TrajectoryEvent
	turn         ConversationTurn
}

func (service *Service) prepareTurnTerminal(
	active *activeConversationTurn,
	event agent.Event,
) (turnTerminalMutation, error) {
	snapshot, err := service.snapshotLocked(service.lifecycleCtx, active.workspaceID, active.conversationID)
	if err != nil {
		return turnTerminalMutation{}, err
	}
	turn, err := findConversationTurn(snapshot, active.turnID)
	if err != nil {
		return turnTerminalMutation{}, err
	}
	if turn.Status != TurnStatusRunning || turn.ResolvedInvocation == nil {
		return turnTerminalMutation{}, &CommandConflictError{ConversationID: active.conversationID, Reason: "terminal event requires a running turn"}
	}
	now := advanceTimestamp(snapshot.Conversation.UpdatedAt, service.timestamp())
	trajectoryID, err := service.newID("trajectory")
	if err != nil {
		return turnTerminalMutation{}, err
	}
	artifactAttempt, err := service.store.readArtifactDeliveryAttempt(service.lifecycleCtx, active.conversationID, turn.ID)
	if err != nil {
		return turnTerminalMutation{}, err
	}
	trajectory := TrajectoryEvent{
		ID:             trajectoryID,
		ConversationID: active.conversationID,
		TurnID:         &turn.ID,
		Sequence:       snapshot.Conversation.LastTrajectorySequence + 1,
		EmittedAt:      now,
		Actor:          TrajectoryActorProvider,
		ProviderTurnID: &event.ProviderTurnID,
	}
	conversationStatus := ConversationStatusIdle
	if len(snapshot.Queue) > 0 {
		conversationStatus = ConversationStatusWorking
	}
	interruptionReason := active.interruptionReason
	if interruptionReason == "" {
		interruptionReason = TurnInterruptionProviderInterrupted
	}
	conversationStatus, err = applyProviderTerminalOutcome(
		&turn,
		&trajectory,
		event,
		now,
		conversationStatus,
		interruptionReason,
		artifactAttempt,
	)
	if err != nil {
		return turnTerminalMutation{}, err
	}
	if len(snapshot.Queue) > 0 {
		// A failed active turn is terminal for that turn, not for already
		// accepted queued work. Keep the aggregate working while promotion is
		// pending so the renderer and navigator do not present a false terminal.
		conversationStatus = ConversationStatusWorking
	}
	turn.EndedAt = &now
	conversation := snapshot.Conversation
	conversation.Status = conversationStatus
	conversation.UpdatedAt = advanceTimestamp(conversation.UpdatedAt, now)
	return turnTerminalMutation{
		conversation: conversation,
		snapshot:     snapshot,
		trajectory:   trajectory,
		turn:         turn,
	}, nil
}

func applyProviderTerminalOutcome(
	turn *ConversationTurn,
	trajectory *TrajectoryEvent,
	event agent.Event,
	now string,
	conversationStatus ConversationStatus,
	interruptionReason TurnInterruptionReason,
	artifactAttempt artifactDeliveryAttempt,
) (ConversationStatus, error) {
	switch event.Terminal.Outcome {
	case agent.TurnOutcomeCompleted:
		if failure, unresolved := unresolvedArtifactDeliveryFailure(artifactAttempt); unresolved {
			turn.Status = TurnStatusFailed
			turn.Error = &failure
			turn.ResolvedInvocation = invocationPointerValue(terminalInvocation(*turn.ResolvedInvocation, InvocationOutcomeFailed, now, &failure))
			trajectory.Actor = TrajectoryActorSystem
			trajectory.Kind = TrajectoryEventTurnFailed
			trajectory.TurnFailed = &TrajectoryTurnFailed{Failure: failure}
			return ConversationStatusFailed, nil
		}
		turn.Status = TurnStatusCompleted
		turn.ResolvedInvocation = invocationPointerValue(terminalInvocation(*turn.ResolvedInvocation, InvocationOutcomeSucceeded, now, nil))
		trajectory.Kind = TrajectoryEventTurnCompleted
		trajectory.TurnCompleted = &TrajectoryTurnCompleted{}
	case agent.TurnOutcomeInterrupted:
		turn.Status = TurnStatusCancelled
		turn.ResolvedInvocation = invocationPointerValue(terminalInvocation(*turn.ResolvedInvocation, InvocationOutcomeCancelled, now, nil))
		trajectory.Kind = TrajectoryEventTurnInterrupted
		trajectory.TurnInterrupted = &TrajectoryTurnInterrupted{Reason: interruptionReason}
	case agent.TurnOutcomeFailed:
		failure := providerFailure("provider_turn_failed")
		turn.Status = TurnStatusFailed
		turn.Error = &failure
		turn.ResolvedInvocation = invocationPointerValue(terminalInvocation(*turn.ResolvedInvocation, InvocationOutcomeFailed, now, &failure))
		trajectory.Kind = TrajectoryEventTurnFailed
		trajectory.TurnFailed = &TrajectoryTurnFailed{Failure: failure}
		return ConversationStatusFailed, nil
	default:
		return "", fmt.Errorf("unsupported provider terminal outcome %q", event.Terminal.Outcome)
	}
	return conversationStatus, nil
}

func turnTerminalPayloads(mutation turnTerminalMutation) []ConversationEventPayload {
	publishedConversation := mutation.conversation
	publishedConversation.LastTrajectorySequence++
	return []ConversationEventPayload{
		ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: publishedConversation},
		ConversationTurnUpdatedEventPayload{Type: ConversationEventTypeTurnUpdated, Turn: mutation.turn},
		ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: mutation.trajectory},
	}
}

func (service *Service) commitTurnTerminal(
	ctx context.Context,
	mutation turnTerminalMutation,
	publications []preparedPublication,
) error {
	_, err := service.store.transactPresentationAware(ctx, "finish topic conversation turn", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateConversation(
			ConversationExpectation{
				UpdatedAt:              mutation.snapshot.Conversation.UpdatedAt,
				LastTrajectorySequence: mutation.snapshot.Conversation.LastTrajectorySequence,
			},
			mutation.conversation,
		); err != nil {
			return err
		}
		if err := transaction.UpdateTurn(TurnStatusRunning, mutation.turn); err != nil {
			return err
		}
		if err := transaction.AppendTrajectoryEvent(mutation.trajectory); err != nil {
			return err
		}
		return appendPublications(transaction, publications)
	})
	if err == nil {
		service.observeCommittedTrajectory(
			mutation.conversation,
			mutation.turn,
			[]TrajectoryEvent{mutation.trajectory},
			artifactMetadataForTurn(mutation.snapshot.Artifacts.Artifacts, mutation.turn.ID),
			true,
		)
	}
	return err
}

func invocationPointerValue(value ResolvedInvocation) *ResolvedInvocation {
	return &value
}

func providerFailure(code string) Failure {
	return Failure{
		Code:      code,
		Message:   "The provider could not complete this run. Try again.",
		Retryable: true,
	}
}
