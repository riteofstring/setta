package conversation

import (
	"context"
	"fmt"

	"setta/internal/agent"
)

func (service *Service) persistSteering(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	turnID string,
	text string,
) error {
	acceptedID, err := service.newID("trajectory")
	if err != nil {
		return err
	}
	steeredID, err := service.newID("trajectory")
	if err != nil {
		return err
	}
	return service.persistControlTrajectory(
		ctx,
		workspaceID,
		conversationID,
		turnID,
		ConversationStatusWorking,
		[]TrajectoryEvent{
			{
				ID:    acceptedID,
				Kind:  TrajectoryEventUserInputAccepted,
				Actor: TrajectoryActorUser,
				UserInputAccepted: &TrajectoryUserInputAccepted{
					Input:    AuthoredInput{Text: text},
					Delivery: TurnDeliverySteering,
				},
			},
			{
				ID:          steeredID,
				Kind:        TrajectoryEventTurnSteered,
				Actor:       TrajectoryActorUser,
				TurnSteered: &TrajectoryTurnSteered{Input: AuthoredInput{Text: text}},
			},
		},
	)
}

func (service *Service) persistInterruption(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	turnID string,
	reason TurnInterruptionReason,
) error {
	eventID, err := service.newID("trajectory")
	if err != nil {
		return err
	}
	return service.persistControlTrajectory(
		ctx,
		workspaceID,
		conversationID,
		turnID,
		ConversationStatusWorking,
		[]TrajectoryEvent{{
			ID:              eventID,
			Kind:            TrajectoryEventTurnInterrupted,
			Actor:           TrajectoryActorUser,
			TurnInterrupted: &TrajectoryTurnInterrupted{Reason: reason},
		}},
	)
}

func (service *Service) persistApprovalResolution(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	turnID string,
	response ConversationApprovalResponse,
) error {
	snapshot, err := service.snapshotLocked(ctx, workspaceID, conversationID)
	if err != nil {
		return err
	}
	if !snapshotHasPendingApproval(snapshot, response.ApprovalID) {
		return &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "approval is not pending: " + response.ApprovalID,
		}
	}
	eventID, err := service.newID("trajectory")
	if err != nil {
		return err
	}
	answers := cloneConversationApprovalAnswers(response.Answers)
	return service.persistControlTrajectoryFromSnapshot(
		ctx,
		snapshot,
		turnID,
		ConversationStatusWorking,
		[]TrajectoryEvent{{
			ID:    eventID,
			Kind:  TrajectoryEventApprovalResolved,
			Actor: TrajectoryActorUser,
			ApprovalResolved: &TrajectoryApprovalResolved{Resolution: TrajectoryApprovalResolution{
				ApprovalID: response.ApprovalID,
				Decision:   response.Decision,
				Response:   response.Response,
				Answers:    answers,
			}},
		}},
	)
}

func cloneConversationApprovalAnswers(answers []ConversationApprovalAnswer) []ConversationApprovalAnswer {
	result := make([]ConversationApprovalAnswer, 0, len(answers))
	for _, answer := range answers {
		result = append(result, ConversationApprovalAnswer{
			QuestionID: answer.QuestionID,
			Answers:    append([]string{}, answer.Answers...),
		})
	}
	return result
}

func (service *Service) persistControlTrajectory(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	turnID string,
	status ConversationStatus,
	events []TrajectoryEvent,
) error {
	snapshot, err := service.snapshotLocked(ctx, workspaceID, conversationID)
	if err != nil {
		return err
	}
	return service.persistControlTrajectoryFromSnapshot(ctx, snapshot, turnID, status, events)
}

func (service *Service) persistControlTrajectoryFromSnapshot(
	ctx context.Context,
	snapshot ConversationSnapshot,
	turnID string,
	status ConversationStatus,
	events []TrajectoryEvent,
) error {
	turn, err := findConversationTurn(snapshot, turnID)
	if err != nil {
		return err
	}
	if turn.Status != TurnStatusRunning {
		return &CommandConflictError{
			ConversationID: snapshot.Conversation.ID,
			Reason:         fmt.Sprintf("turn %s is %s", turn.ID, turn.Status),
		}
	}
	now := advanceTimestamp(snapshot.Conversation.UpdatedAt, service.timestamp())
	providerThreadID := snapshot.ThreadBinding.ThreadID
	providerTurnID := *turn.ProviderTurnID
	for index := range events {
		events[index].ConversationID = snapshot.Conversation.ID
		events[index].TurnID = &turn.ID
		events[index].Sequence = snapshot.Conversation.LastTrajectorySequence + index + 1
		events[index].EmittedAt = now
		events[index].ProviderThreadID = &providerThreadID
		events[index].ProviderTurnID = &providerTurnID
		if events[index].ApprovalResolved != nil {
			events[index].ApprovalResolved.Resolution.ResolvedAt = now
		}
	}
	conversation := snapshot.Conversation
	conversation.Status = status
	conversation.UpdatedAt = now
	publishedConversation := conversation
	publishedConversation.LastTrajectorySequence += len(events)
	payloads := []ConversationEventPayload{
		ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: publishedConversation},
	}
	for _, event := range events {
		payloads = append(payloads, ConversationTrajectoryAppendedEventPayload{
			Type:  ConversationEventTypeTrajectoryAppended,
			Event: event,
		})
	}
	publications, err := service.publications(conversation.ID, now, payloads...)
	if err != nil {
		return err
	}
	_, err = service.store.Transact(ctx, "persist topic conversation control", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateConversation(
			ConversationExpectation{
				UpdatedAt:              snapshot.Conversation.UpdatedAt,
				LastTrajectorySequence: snapshot.Conversation.LastTrajectorySequence,
			},
			conversation,
		); err != nil {
			return err
		}
		for _, event := range events {
			if err := transaction.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		return appendPublications(transaction, publications)
	})
	return err
}

func snapshotHasPendingApproval(snapshot ConversationSnapshot, approvalID string) bool {
	pending := false
	for _, event := range snapshot.Trajectory.Events {
		if event.ApprovalRequested != nil && event.ApprovalRequested.Approval.ID == approvalID {
			pending = true
		}
		if event.ApprovalResolved != nil && event.ApprovalResolved.Resolution.ApprovalID == approvalID {
			pending = false
		}
	}
	return pending
}

func agentApprovalResponse(response ConversationApprovalResponse) (agent.ApprovalResponse, error) {
	result := agent.ApprovalResponse{RequestID: response.ApprovalID}
	switch response.Decision {
	case TrajectoryApprovalDecisionApproved, TrajectoryApprovalDecisionAnswered:
		result.Decision = agent.ApprovalDecisionAccept
	case TrajectoryApprovalDecisionDenied:
		result.Decision = agent.ApprovalDecisionDecline
	case TrajectoryApprovalDecisionCancelled:
		result.Decision = agent.ApprovalDecisionCancel
	default:
		return agent.ApprovalResponse{}, fmt.Errorf("unsupported approval decision %q", response.Decision)
	}
	for _, answer := range response.Answers {
		result.Answers = append(result.Answers, agent.ApprovalAnswer{
			QuestionID: answer.QuestionID,
			Answers:    append([]string{}, answer.Answers...),
		})
	}
	return result, nil
}
