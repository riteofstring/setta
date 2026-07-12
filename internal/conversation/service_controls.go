package conversation

import (
	"context"
	"fmt"

	"setta/internal/agent"
)

func (service *Service) persistSteering(
	ctx context.Context,
	snapshot ConversationSnapshot,
	turnID string,
	text string,
	routeDecisionID string,
) error {
	acceptedID, steeredID, err := service.steeringTrajectoryEventIDs(routeDecisionID)
	if err != nil {
		return err
	}
	return service.persistControlTrajectoryFromSnapshot(
		ctx,
		snapshot,
		turnID,
		snapshot.Conversation.Status,
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

func (service *Service) steeringTrajectoryEventIDs(routeDecisionID string) (string, string, error) {
	if routeDecisionID != "" {
		ids, err := conversationRouteSteeringTrajectoryEventIDs(routeDecisionID)
		return ids[0], ids[1], err
	}
	acceptedID, err := service.newID("trajectory")
	if err != nil {
		return "", "", err
	}
	steeredID, err := service.newID("trajectory")
	return acceptedID, steeredID, err
}

func (service *Service) persistInterruption(
	ctx context.Context,
	snapshot ConversationSnapshot,
	turnID string,
	reason TurnInterruptionReason,
) error {
	eventID, err := service.newID("trajectory")
	if err != nil {
		return err
	}
	return service.persistControlTrajectoryFromSnapshot(
		ctx,
		snapshot,
		turnID,
		snapshot.Conversation.Status,
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
	snapshot ConversationSnapshot,
	turnID string,
	request TrajectoryApprovalRequest,
	response ConversationApprovalResponse,
	otherApprovalsPending bool,
) error {
	eventID, err := service.newID("trajectory")
	if err != nil {
		return err
	}
	answers, secretsRedacted := durableConversationApprovalAnswers(request, response.Answers)
	status := ConversationStatusWorking
	if otherApprovalsPending {
		status = ConversationStatusWaitingForApproval
	}
	return service.persistControlTrajectoryFromSnapshot(
		ctx,
		snapshot,
		turnID,
		status,
		[]TrajectoryEvent{{
			ID:    eventID,
			Kind:  TrajectoryEventApprovalResolved,
			Actor: TrajectoryActorUser,
			ApprovalResolved: &TrajectoryApprovalResolved{Resolution: TrajectoryApprovalResolution{
				ApprovalID:      response.ApprovalID,
				Decision:        response.Decision,
				Response:        response.Response,
				Answers:         answers,
				SecretsRedacted: secretsRedacted,
			}},
		}},
	)
}

func durableConversationApprovalAnswers(
	request TrajectoryApprovalRequest,
	answers []ConversationApprovalAnswer,
) ([]ConversationApprovalAnswer, bool) {
	secret := map[string]bool{}
	for _, question := range request.Questions {
		secret[question.ID] = question.Secret
	}
	result := make([]ConversationApprovalAnswer, 0, len(answers))
	secretsRedacted := false
	for _, answer := range answers {
		// Secret values are delivered to the provider but never copied into the
		// durable trajectory that later renderer and narrator projections read.
		if secret[answer.QuestionID] {
			secretsRedacted = true
			continue
		}
		result = append(result, ConversationApprovalAnswer{
			QuestionID: answer.QuestionID,
			Answers:    append([]string{}, answer.Answers...),
		})
	}
	return result, secretsRedacted
}

func (service *Service) persistControlTrajectoryFromSnapshot(
	ctx context.Context,
	snapshot ConversationSnapshot,
	turnID string,
	status ConversationStatus,
	events []TrajectoryEvent,
) error {
	turn, err := controlTrajectoryTurn(snapshot, turnID)
	if err != nil {
		return err
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
	if err == nil {
		service.observeCommittedTrajectory(
			conversation,
			turn.ID,
			events,
			false,
		)
	}
	return err
}

func controlTrajectoryTurn(snapshot ConversationSnapshot, turnID string) (ConversationTurn, error) {
	turn, err := findConversationTurn(snapshot, turnID)
	if err != nil {
		return ConversationTurn{}, err
	}
	if turn.Status != TurnStatusRunning {
		return ConversationTurn{}, &CommandConflictError{
			ConversationID: snapshot.Conversation.ID,
			Reason:         fmt.Sprintf("turn %s is %s", turn.ID, turn.Status),
		}
	}
	if snapshot.ThreadBinding == nil || turn.ProviderTurnID == nil {
		return ConversationTurn{}, &CommandConflictError{
			ConversationID: snapshot.Conversation.ID,
			Reason:         "running turn is missing durable provider references",
		}
	}
	return turn, nil
}

func pendingApprovalsForTurn(
	snapshot ConversationSnapshot,
	turnID string,
) map[string]TrajectoryApprovalRequest {
	pending := map[string]TrajectoryApprovalRequest{}
	for _, event := range snapshot.Trajectory.Events {
		if event.TurnID == nil || *event.TurnID != turnID {
			continue
		}
		if event.ApprovalRequested != nil {
			request := event.ApprovalRequested.Approval
			pending[request.ID] = request
		}
		if event.ApprovalResolved != nil {
			delete(pending, event.ApprovalResolved.Resolution.ApprovalID)
		}
	}
	return pending
}

func validateApprovalResponseForRequest(
	request TrajectoryApprovalRequest,
	response ConversationApprovalResponse,
) error {
	switch request.Kind {
	case TrajectoryApprovalKindStructuredInput, TrajectoryApprovalKindUserInput:
		if response.Decision == TrajectoryApprovalDecisionCancelled {
			return nil
		}
		if response.Decision != TrajectoryApprovalDecisionAnswered {
			return fmt.Errorf("%s approval requires an answered or cancelled decision", request.Kind)
		}
		return validateStructuredApprovalAnswers(request, response.Answers)
	case TrajectoryApprovalKindCommand,
		TrajectoryApprovalKindFileChange,
		TrajectoryApprovalKindPermission:
		switch response.Decision {
		case TrajectoryApprovalDecisionApproved,
			TrajectoryApprovalDecisionDenied,
			TrajectoryApprovalDecisionCancelled:
			return nil
		default:
			return fmt.Errorf("%s approval does not accept decision %s", request.Kind, response.Decision)
		}
	case TrajectoryApprovalKindMCPElicitation:
		return nil
	default:
		return fmt.Errorf("unsupported conversation approval kind %q", request.Kind)
	}
}

func validateStructuredApprovalAnswers(
	request TrajectoryApprovalRequest,
	answers []ConversationApprovalAnswer,
) error {
	byQuestion := make(map[string]ConversationApprovalAnswer, len(answers))
	for _, answer := range answers {
		byQuestion[answer.QuestionID] = answer
	}
	if len(byQuestion) != len(request.Questions) {
		return fmt.Errorf("structured approval requires one answer for each question")
	}
	for _, question := range request.Questions {
		answer, ok := byQuestion[question.ID]
		if !ok {
			return fmt.Errorf("structured approval answer is required for question %s", question.ID)
		}
		if question.AllowsOther || len(question.Options) == 0 {
			continue
		}
		allowed := map[string]bool{}
		for _, option := range question.Options {
			allowed[option] = true
		}
		for _, value := range answer.Answers {
			if !allowed[value] {
				if question.Secret {
					return fmt.Errorf("structured approval answer is not an option for secret question %s", question.ID)
				}
				return fmt.Errorf("structured approval answer %q is not an option for question %s", value, question.ID)
			}
		}
	}
	return nil
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
