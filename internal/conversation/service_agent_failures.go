package conversation

import (
	"context"
	"errors"

	"setta/internal/agent"
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
		mutation.trajectory.EmittedAt,
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
	trajectory     TrajectoryEvent
	turn           ConversationTurn
}

func (service *Service) unexpectedTurnState(
	ctx context.Context,
	active *activeConversationTurn,
) (ConversationSnapshot, ConversationTurn, bool, error) {
	snapshot, err := service.store.ReadSnapshot(ctx, active.workspaceID, active.conversationID)
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
	trajectoryID, err := service.newID("trajectory")
	if err != nil {
		return unexpectedTurnEndMutation{}, err
	}
	trajectory := TrajectoryEvent{
		ID:             trajectoryID,
		ConversationID: active.conversationID,
		TurnID:         &turn.ID,
		Sequence:       snapshot.Conversation.LastTrajectorySequence + 1,
		EmittedAt:      now,
		Actor:          TrajectoryActorSystem,
	}
	expectedStatus := turn.Status
	conversationStatus := applyUnexpectedTurnOutcome(&turn, &trajectory, runErr, now)
	applyUnexpectedProviderReferences(&trajectory, active, turn)
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
		trajectory:     trajectory,
		turn:           turn,
	}, nil
}

func applyUnexpectedTurnOutcome(
	turn *ConversationTurn,
	trajectory *TrajectoryEvent,
	runErr error,
	now string,
) ConversationStatus {
	if errors.Is(runErr, context.Canceled) {
		turn.Status = TurnStatusCancelled
		turn.Error = nil
		trajectory.Kind = TrajectoryEventTurnInterrupted
		trajectory.TurnInterrupted = &TrajectoryTurnInterrupted{Reason: TurnInterruptionRuntimeShutdown}
		if turn.ResolvedInvocation != nil {
			turn.ResolvedInvocation = invocationPointerValue(
				terminalInvocation(*turn.ResolvedInvocation, InvocationOutcomeCancelled, now, nil),
			)
		}
		turn.EndedAt = &now
		return ConversationStatusIdle
	}
	code, retryable := classifyAgentRuntimeFailure(runErr, "agent_runtime_failed")
	failure := Failure{Code: code, Message: runErr.Error(), Retryable: retryable}
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

func classifyAgentRuntimeFailure(runErr error, fallbackCode string) (string, bool) {
	if code, retryable, ok := agent.TurnAdmissionFailure(runErr); ok {
		return code, retryable
	}
	return fallbackCode, true
}

func applyUnexpectedProviderReferences(
	trajectory *TrajectoryEvent,
	active *activeConversationTurn,
	turn ConversationTurn,
) {
	if turn.ProviderTurnID != nil {
		trajectory.ProviderThreadID = &active.providerThreadID
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
	publishedConversation.LastTrajectorySequence++
	payloads := []ConversationEventPayload{
		ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: publishedConversation},
		ConversationTurnUpdatedEventPayload{Type: ConversationEventTypeTurnUpdated, Turn: mutation.turn},
	}
	if mutation.removeQueue {
		payloads = append(payloads, ConversationQueueUpdatedEventPayload{Type: ConversationEventTypeQueueUpdated, Queue: mutation.queue})
	}
	return append(payloads, ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: mutation.trajectory})
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
		if err := transaction.AppendTrajectoryEvent(mutation.trajectory); err != nil {
			return err
		}
		return appendPublications(transaction, publications)
	})
	if err == nil {
		service.observeCommittedTrajectory(
			mutation.conversation,
			mutation.turn.ID,
			[]TrajectoryEvent{mutation.trajectory},
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
