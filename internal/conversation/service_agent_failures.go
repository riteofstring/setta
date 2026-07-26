package conversation

import (
	"context"
	"errors"

	"setta/internal/agent"
)

const (
	agentRuntimeFailureMessage          = "The run stopped unexpectedly. Try again."
	providerUnavailableFailureMessage   = "Provider is temporarily unavailable. Try again."
	providerThreadMissingFailureMessage = "This run cannot continue because its provider session is no longer available. Start a new run."
)

func (service *Service) persistUnexpectedTurnEnd(
	ctx context.Context,
	active *activeConversationTurn,
	runErr error,
) error {
	snapshot, turn, terminal, err := service.unexpectedTurnState(ctx, active)
	if err != nil {
		return err
	}
	if terminal {
		return nil
	}
	mutation, err := service.buildUnexpectedTurnEnd(active, snapshot, turn, runErr)
	if err != nil {
		return err
	}
	publications, err := service.publications(
		active.conversationID,
		mutation.conversation.UpdatedAt,
		unexpectedTurnEndPayloads(mutation)...,
	)
	if err != nil {
		return err
	}
	return service.commitUnexpectedTurnEnd(ctx, mutation, publications)
}

type unexpectedTurnEndMutation struct {
	conversation   TopicConversation
	expectedStatus TurnStatus
	queue          []QueuedConversationTurn
	queueOrdinal   int
	removeQueue    bool
	snapshot       ConversationSnapshot
	trajectories   []TrajectoryEvent
	turn           ConversationTurn
}

func (service *Service) unexpectedTurnState(
	ctx context.Context,
	active *activeConversationTurn,
) (ConversationSnapshot, ConversationTurn, bool, error) {
	snapshot, err := service.snapshotByIDLocked(ctx, active.conversationID)
	if err != nil {
		return ConversationSnapshot{}, ConversationTurn{}, false, err
	}
	turn, err := findConversationTurn(snapshot, active.turnID)
	if err != nil {
		return ConversationSnapshot{}, ConversationTurn{}, false, err
	}
	return snapshot, turn, terminalTurnStatus(turn.Status), nil
}

func terminalTurnStatus(status TurnStatus) bool {
	switch status {
	case TurnStatusCompleted, TurnStatusCancelled, TurnStatusFailed:
		return true
	case TurnStatusQueued, TurnStatusRunning:
		return false
	default:
		return false
	}
}

func (service *Service) buildUnexpectedTurnEnd(
	active *activeConversationTurn,
	snapshot ConversationSnapshot,
	turn ConversationTurn,
	runErr error,
) (unexpectedTurnEndMutation, error) {
	now := advanceTimestamp(snapshot.Conversation.UpdatedAt, service.timestamp())
	trajectories, err := service.unexpectedApprovalCancellationEvents(active, snapshot, turn, now)
	if err != nil {
		return unexpectedTurnEndMutation{}, err
	}
	trajectoryID, err := service.newID("trajectory")
	if err != nil {
		return unexpectedTurnEndMutation{}, err
	}
	trajectory := TrajectoryEvent{
		ID:             trajectoryID,
		ConversationID: active.conversationID,
		TurnID:         &turn.ID,
		Sequence:       snapshot.Conversation.LastTrajectorySequence + len(trajectories) + 1,
		EmittedAt:      now,
		Actor:          TrajectoryActorSystem,
	}
	expectedStatus := turn.Status
	conversationStatus := applyUnexpectedTurnOutcome(&turn, &trajectory, active.interruptionReason, runErr, now)
	applyUnexpectedProviderReferences(&trajectory, active, turn)
	trajectories = append(trajectories, trajectory)
	queue, removeQueue, err := unexpectedQueueAfterTurn(snapshot.Queue, active, turn.ID, expectedStatus)
	if err != nil {
		return unexpectedTurnEndMutation{}, err
	}
	if len(queue) > 0 {
		conversationStatus = ConversationStatusWorking
	}
	conversation := snapshot.Conversation
	conversation.Status = conversationStatus
	conversation.UpdatedAt = now
	return unexpectedTurnEndMutation{
		conversation:   conversation,
		expectedStatus: expectedStatus,
		queue:          queue,
		queueOrdinal:   active.queueOrdinal,
		removeQueue:    removeQueue,
		snapshot:       snapshot,
		trajectories:   trajectories,
		turn:           turn,
	}, nil
}

// unexpectedApprovalCancellationEvents withdraws every prompt owned by a run
// before that run's terminal fact is committed. The provider cannot answer
// after an unexpected end, and leaving a durable pending approval would make
// the Director offer an action against a dead run.
func (service *Service) unexpectedApprovalCancellationEvents(
	active *activeConversationTurn,
	snapshot ConversationSnapshot,
	turn ConversationTurn,
	now string,
) ([]TrajectoryEvent, error) {
	pending := pendingApprovalsForTurn(snapshot, turn.ID)
	if len(pending) == 0 {
		return []TrajectoryEvent{}, nil
	}
	events := make([]TrajectoryEvent, 0, len(pending))
	recorded := map[string]bool{}
	for _, event := range snapshot.Trajectory.Events {
		if event.TurnID == nil || *event.TurnID != turn.ID || event.ApprovalRequested == nil {
			continue
		}
		approvalID := event.ApprovalRequested.Approval.ID
		if _, stillPending := pending[approvalID]; !stillPending || recorded[approvalID] {
			continue
		}
		eventID, err := service.newID("trajectory")
		if err != nil {
			return nil, err
		}
		cancellation := TrajectoryEvent{
			ID:             eventID,
			ConversationID: active.conversationID,
			TurnID:         &turn.ID,
			Sequence:       snapshot.Conversation.LastTrajectorySequence + len(events) + 1,
			EmittedAt:      now,
			Kind:           TrajectoryEventApprovalResolved,
			Actor:          TrajectoryActorSystem,
			ApprovalResolved: &TrajectoryApprovalResolved{Resolution: TrajectoryApprovalResolution{
				ApprovalID: approvalID,
				Decision:   TrajectoryApprovalDecisionCancelled,
				Answers:    []ConversationApprovalAnswer{},
				ResolvedAt: now,
			}},
		}
		applyUnexpectedProviderReferences(&cancellation, active, turn)
		events = append(events, cancellation)
		recorded[approvalID] = true
	}
	return events, nil
}

// applyUnexpectedTurnOutcome decides whether a run that ended outside the
// provider's terminal event was interrupted or failed. An interruption reason
// supplied by the caller wins: work Setta itself stopped — a shutdown, a
// restart — is not a failure the user should be asked to interpret.
func applyUnexpectedTurnOutcome(
	turn *ConversationTurn,
	trajectory *TrajectoryEvent,
	interruptionReason TurnInterruptionReason,
	runErr error,
	now string,
) ConversationStatus {
	if errors.Is(runErr, context.Canceled) {
		interruptionReason = TurnInterruptionRuntimeShutdown
	}
	if interruptionReason != "" {
		turn.Status = TurnStatusCancelled
		turn.Error = nil
		trajectory.Kind = TrajectoryEventTurnInterrupted
		trajectory.TurnInterrupted = &TrajectoryTurnInterrupted{Reason: interruptionReason}
		if turn.ResolvedInvocation != nil {
			turn.ResolvedInvocation = invocationPointerValue(
				terminalInvocation(*turn.ResolvedInvocation, InvocationOutcomeCancelled, now, nil),
			)
		}
		turn.EndedAt = &now
		return ConversationStatusIdle
	}
	failure := unexpectedTurnFailure(runErr)
	turn.Status = TurnStatusFailed
	turn.Error = &failure
	trajectory.Kind = TrajectoryEventTurnFailed
	trajectory.TurnFailed = &TrajectoryTurnFailed{Failure: failure}
	if turn.ResolvedInvocation != nil {
		turn.ResolvedInvocation = invocationPointerValue(
			terminalInvocation(*turn.ResolvedInvocation, InvocationOutcomeFailed, now, &failure),
		)
	}
	turn.EndedAt = &now
	return ConversationStatusFailed
}

func unexpectedTurnFailure(runErr error) Failure {
	if code, retryable, ok := agent.TurnAdmissionFailure(runErr); ok {
		return Failure{Code: code, Message: runErr.Error(), Retryable: retryable}
	}
	if agent.IsProviderThreadMissing(runErr) {
		return Failure{
			Code:      "provider_thread_missing",
			Message:   providerThreadMissingFailureMessage,
			Retryable: false,
		}
	}
	if agent.IsProviderLifecycleError(runErr) {
		return Failure{
			Code:      "provider_unavailable",
			Message:   providerUnavailableFailureMessage,
			Retryable: true,
		}
	}
	return Failure{Code: "agent_runtime_failed", Message: agentRuntimeFailureMessage, Retryable: true}
}

// applyUnexpectedProviderReferences correlates the terminal event with the run
// the provider was carrying, when Setta still holds the carrier. Recovery after
// a restart does not: the carrier died with the process, so the event names the
// Setta turn alone rather than inventing a provider reference for it.
func applyUnexpectedProviderReferences(
	trajectory *TrajectoryEvent,
	active *activeConversationTurn,
	turn ConversationTurn,
) {
	if turn.ProviderTurnID != nil && active.providerThreadID != "" {
		trajectory.ProviderTurnID = turn.ProviderTurnID
	}
}

func unexpectedQueueAfterTurn(
	snapshotQueue []QueuedConversationTurn,
	active *activeConversationTurn,
	turnID string,
	expectedStatus TurnStatus,
) ([]QueuedConversationTurn, bool, error) {
	queue := append([]QueuedConversationTurn{}, snapshotQueue...)
	removeQueue := active.queueOrdinal > 0 && expectedStatus == TurnStatusQueued
	if removeQueue {
		var err error
		queue, err = queueAfterRemoval(queue, turnID, active.queueOrdinal)
		if err != nil {
			return nil, false, err
		}
	}
	return queue, removeQueue, nil
}

func unexpectedTurnEndPayloads(mutation unexpectedTurnEndMutation) []ConversationEventPayload {
	publishedConversation := mutation.conversation
	publishedConversation.LastTrajectorySequence += len(mutation.trajectories)
	payloads := []ConversationEventPayload{
		ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: publishedConversation},
		ConversationTurnUpdatedEventPayload{Type: ConversationEventTypeTurnUpdated, Turn: mutation.turn},
	}
	if mutation.removeQueue {
		payloads = append(payloads, ConversationQueueUpdatedEventPayload{Type: ConversationEventTypeQueueUpdated, Queue: mutation.queue})
	}
	for _, trajectory := range mutation.trajectories {
		payloads = append(payloads, ConversationTrajectoryAppendedEventPayload{
			Type:  ConversationEventTypeTrajectoryAppended,
			Event: trajectory,
		})
	}
	return payloads
}

func (service *Service) commitUnexpectedTurnEnd(
	ctx context.Context,
	mutation unexpectedTurnEndMutation,
	publications []preparedPublication,
) error {
	_, err := service.store.transactPresentationAware(ctx, "fail topic conversation turn", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateConversation(
			ConversationExpectation{
				UpdatedAt:              mutation.snapshot.Conversation.UpdatedAt,
				LastTrajectorySequence: mutation.snapshot.Conversation.LastTrajectorySequence,
			},
			mutation.conversation,
		); err != nil {
			return err
		}
		if err := transaction.UpdateTurn(mutation.expectedStatus, mutation.turn); err != nil {
			return err
		}
		if err := applyUnexpectedQueueMutation(transaction, mutation); err != nil {
			return err
		}
		for _, trajectory := range mutation.trajectories {
			if err := transaction.AppendTrajectoryEvent(trajectory); err != nil {
				return err
			}
		}
		return appendPublications(transaction, publications)
	})
	if err == nil {
		service.observeCommittedTrajectory(
			mutation.conversation,
			mutation.turn,
			mutation.trajectories,
			artifactMetadataForTurn(mutation.snapshot.Artifacts.Artifacts, mutation.turn.ID),
			true,
		)
	}
	return err
}

func applyUnexpectedQueueMutation(
	transaction *WriteTransaction,
	mutation unexpectedTurnEndMutation,
) error {
	if !mutation.removeQueue {
		return nil
	}
	if err := transaction.DeleteQueuedTurn(mutation.turn.ID, mutation.turn.ConversationID, mutation.queueOrdinal); err != nil {
		return err
	}
	return transaction.CompactQueuedTurns(mutation.turn.ConversationID, mutation.queueOrdinal)
}
