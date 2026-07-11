package conversation

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/agent"
)

func (service *Service) persistTerminalEvent(ctx context.Context, snapshot ConversationSnapshot, turn ConversationTurn, result agent.TurnResult) error {
	mutation, err := terminalMutation(service, snapshot, turn, result)
	if err != nil {
		return err
	}
	return service.persistAgentMutation(ctx, snapshot, mutation)
}

func terminalMutation(service *Service, snapshot ConversationSnapshot, turn ConversationTurn, result agent.TurnResult) (agentEventMutation, error) {
	now := service.timestampAfterSnapshot(snapshot)
	if result.ProviderTurnID != "" {
		turn.ProviderTurnID = stringPointerValue(result.ProviderTurnID)
		if turn.ResolvedInvocation != nil {
			turn.ResolvedInvocation.ProviderReferences.TurnID = stringPointerValue(result.ProviderTurnID)
		}
	}
	turn.EndedAt = &now
	if turn.ResolvedInvocation != nil {
		turn.ResolvedInvocation.EndedAt = &now
	}
	providerEvent := agent.Event{ProviderThreadID: result.ProviderThreadID, ProviderTurnID: result.ProviderTurnID}
	switch result.Outcome {
	case agent.TurnOutcomeCompleted:
		if turn.ResolvedInvocation == nil {
			return agentEventMutation{}, errors.New("completed provider turn has no resolved invocation")
		}
		turn.Status = TurnStatusCompleted
		turn.ResolvedInvocation.Outcome = InvocationOutcomeSucceeded
		trajectory := baseProviderTrajectory(snapshot, turn.ID, providerEvent, TrajectoryEventTurnCompleted, TrajectoryActorAgent, now)
		trajectory.TurnCompleted = &TrajectoryTurnCompleted{Usage: TokenUsage{}}
		return agentEventMutation{trajectory: trajectory, turn: &turn, conversationStatus: ConversationStatusIdle, updateConversation: true}, nil
	case agent.TurnOutcomeInterrupted:
		if turn.ResolvedInvocation == nil {
			return agentEventMutation{}, errors.New("interrupted provider turn has no resolved invocation")
		}
		turn.Status = TurnStatusCancelled
		turn.ResolvedInvocation.Outcome = InvocationOutcomeCancelled
		trajectory := baseProviderTrajectory(snapshot, turn.ID, providerEvent, TrajectoryEventTurnInterrupted, TrajectoryActorSystem, now)
		trajectory.TurnInterrupted = &TrajectoryTurnInterrupted{Reason: TurnInterruptionProviderInterrupted}
		return agentEventMutation{trajectory: trajectory, turn: &turn, conversationStatus: ConversationStatusIdle, updateConversation: true}, nil
	case agent.TurnOutcomeFailed:
		failure := providerFailure("provider_turn_failed", failureMessage(result.Error), diagnosticTurnReference(turn))
		turn.Status = TurnStatusFailed
		turn.Error = &failure
		if turn.ResolvedInvocation != nil {
			turn.ResolvedInvocation.Outcome = InvocationOutcomeFailed
			turn.ResolvedInvocation.Failure = &failure
		}
		trajectory := baseProviderTrajectory(snapshot, turn.ID, providerEvent, TrajectoryEventTurnFailed, TrajectoryActorProvider, now)
		trajectory.TurnFailed = &TrajectoryTurnFailed{Failure: failure}
		return agentEventMutation{trajectory: trajectory, turn: &turn, conversationStatus: ConversationStatusFailed, updateConversation: true}, nil
	default:
		return agentEventMutation{}, fmt.Errorf("unsupported agent turn outcome %q", result.Outcome)
	}
}

func failureMessage(message *string) string {
	if message == nil || *message == "" {
		return "Provider turn failed"
	}
	return *message
}

func diagnosticTurnReference(turn ConversationTurn) string {
	if turn.ProviderTurnID != nil {
		return *turn.ProviderTurnID
	}
	return turn.ID
}

func (service *Service) persistSteering(ctx context.Context, snapshot ConversationSnapshot, turn ConversationTurn, input AuthoredInput) error {
	now := service.timestampAfterSnapshot(snapshot)
	trajectory := newTrajectoryEvent(service, snapshot, turn.ID, TrajectoryEventTurnSteered, TrajectoryActorUser)
	trajectory.EmittedAt = now
	trajectory.ProviderThreadID = providerThreadPointer(snapshot)
	trajectory.ProviderTurnID = cloneStringPointer(turn.ProviderTurnID)
	trajectory.TurnSteered = &TrajectoryTurnSteered{Input: input}
	return service.persistAgentMutation(ctx, snapshot, agentEventMutation{
		trajectory: trajectory, conversationStatus: ConversationStatusWorking, updateConversation: true,
	})
}

func (service *Service) persistApprovalResolution(ctx context.Context, snapshot ConversationSnapshot, request SubmitConversationApprovalRequest) error {
	turn := runningTurn(snapshot)
	if turn == nil {
		return errors.New("conversation has no running turn for approval resolution")
	}
	now := service.timestampAfterSnapshot(snapshot)
	trajectory := newTrajectoryEvent(service, snapshot, turn.ID, TrajectoryEventApprovalResolved, TrajectoryActorUser)
	trajectory.EmittedAt = now
	trajectory.ProviderThreadID = providerThreadPointer(snapshot)
	trajectory.ProviderTurnID = cloneStringPointer(turn.ProviderTurnID)
	trajectory.ApprovalResolved = &TrajectoryApprovalResolved{Resolution: TrajectoryApprovalResolution{
		ApprovalID: request.ApprovalID, Decision: conversationApprovalDecision(request.Decision, request.Answers),
		Answers: approvalAnswerMap(request.Answers), ResolvedAt: now,
	}}
	return service.persistAgentMutation(ctx, snapshot, agentEventMutation{
		trajectory: trajectory, conversationStatus: ConversationStatusWorking, updateConversation: true,
	})
}

func conversationApprovalDecision(decision ApprovalSubmissionDecision, answers []ApprovalSubmissionAnswer) TrajectoryApprovalDecision {
	if len(answers) > 0 {
		return TrajectoryApprovalDecisionAnswered
	}
	switch decision {
	case ApprovalSubmissionAccept:
		return TrajectoryApprovalDecisionApproved
	case ApprovalSubmissionDecline:
		return TrajectoryApprovalDecisionDenied
	case ApprovalSubmissionCancel:
		return TrajectoryApprovalDecisionCancelled
	default:
		return TrajectoryApprovalDecisionDenied
	}
}

func approvalAnswerMap(answers []ApprovalSubmissionAnswer) map[string]string {
	result := map[string]string{}
	for _, answer := range answers {
		if len(answer.Answers) > 0 {
			result[answer.QuestionID] = answer.Answers[0]
		}
	}
	return result
}

func providerThreadPointer(snapshot ConversationSnapshot) *string {
	if snapshot.ThreadBinding == nil {
		return nil
	}
	return stringPointerValue(snapshot.ThreadBinding.ThreadID)
}

func (service *Service) promoteQueuedTurn(ctx context.Context, actor *conversationActor, workspaceID string, conversationID string) error {
	snapshot, err := service.ReadSnapshot(ctx, workspaceID, conversationID)
	if err != nil || len(snapshot.Queue) == 0 {
		return err
	}
	queued := snapshot.Queue[0]
	turn := snapshotTurn(snapshot, queued.TurnID)
	if turn == nil {
		return fmt.Errorf("queued turn %s is outside the snapshot window", queued.TurnID)
	}
	resolved, err := service.agent.ResolveInvocation(ctx, AgentInvocation(turn.RequestedRoleProfile))
	if err != nil {
		return err
	}
	now := service.timestampAfterSnapshot(snapshot)
	queue := shiftedQueue(snapshot.Queue[1:])
	trajectory := newTrajectoryEvent(service, snapshot, turn.ID, TrajectoryEventTurnPromoted, TrajectoryActorSystem)
	trajectory.EmittedAt = now
	trajectory.TurnPromoted = &TrajectoryTurnPromoted{FormerQueueOrdinal: queued.Ordinal, Input: turn.AuthoredInput}
	if err := service.persistPromotion(ctx, snapshot, *turn, queued, queue, trajectory); err != nil {
		return err
	}
	actor.resolved[turn.ID] = resolved
	actor.active = true
	go service.executeTurn(workspaceID, turn.ID)
	return nil
}

func shiftedQueue(queue []QueuedConversationTurn) []QueuedConversationTurn {
	result := make([]QueuedConversationTurn, len(queue))
	for index, queued := range queue {
		queued.Ordinal = index + 1
		result[index] = queued
	}
	return result
}

func (service *Service) persistPromotion(ctx context.Context, snapshot ConversationSnapshot, turn ConversationTurn, removed QueuedConversationTurn, queue []QueuedConversationTurn, trajectory TrajectoryEvent) error {
	conversation := snapshot.Conversation
	conversation.UpdatedAt = timestampAfter(conversation.UpdatedAt, trajectory.EmittedAt)
	conversation.Status = ConversationStatusWorking
	_, err := service.store.Transact(ctx, "promote queued topic conversation turn", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateConversation(ConversationExpectation{UpdatedAt: snapshot.Conversation.UpdatedAt, LastTrajectorySequence: snapshot.Conversation.LastTrajectorySequence}, conversation); err != nil {
			return err
		}
		if err := transaction.DeleteQueuedTurn(removed.TurnID, removed.ConversationID, removed.Ordinal); err != nil {
			return err
		}
		for index, queued := range queue {
			if err := transaction.UpdateQueuedTurn(index+2, queued); err != nil {
				return err
			}
		}
		if err := transaction.AppendTrajectoryEvent(trajectory); err != nil {
			return err
		}
		conversation.LastTrajectorySequence++
		if err := service.appendCommittedPayload(transaction, conversation, ConversationTurnUpdatedEventPayload{Type: ConversationEventTypeTurnUpdated, Turn: turn}); err != nil {
			return err
		}
		if err := service.appendCommittedPayload(transaction, conversation, ConversationQueueUpdatedEventPayload{Type: ConversationEventTypeQueueUpdated, Queue: queue}); err != nil {
			return err
		}
		if err := service.appendCommittedPayload(transaction, conversation, ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: trajectory}); err != nil {
			return err
		}
		return service.appendCommittedPayload(transaction, conversation, ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: conversation})
	})
	if err != nil {
		return err
	}
	service.observeTrajectory(ctx, trajectory)
	return nil
}
