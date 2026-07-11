package conversation

import (
	"context"
	"database/sql"
	"errors"

	"setta/internal/agent"
)

func (service *Service) Send(ctx context.Context, request SendConversationInputRequest) (ConversationSnapshot, error) {
	if err := validateConversationInputRequest(request.WorkspaceID, request.ConversationID, request.Input); err != nil {
		return ConversationSnapshot{}, err
	}
	actor := service.actor(request.ConversationID)
	actor.mu.Lock()
	defer actor.mu.Unlock()
	snapshot, err := service.ReadSnapshot(ctx, request.WorkspaceID, request.ConversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if runningTurn(snapshot) != nil || actor.active {
		return service.queueTurn(ctx, snapshot, request.Input)
	}
	return service.startTurn(ctx, actor, snapshot, request.Input, TurnDeliveryNormal)
}

func (service *Service) Steer(ctx context.Context, request SteerConversationRequest) (ConversationSnapshot, error) {
	if err := validateConversationInputRequest(request.WorkspaceID, request.ConversationID, request.Input); err != nil {
		return ConversationSnapshot{}, err
	}
	actor := service.actor(request.ConversationID)
	actor.mu.Lock()
	defer actor.mu.Unlock()
	snapshot, err := service.ReadSnapshot(ctx, request.WorkspaceID, request.ConversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	turn := runningTurn(snapshot)
	if turn == nil || turn.ProviderTurnID == nil || snapshot.ThreadBinding == nil {
		return ConversationSnapshot{}, errors.New("conversation has no steerable provider turn")
	}
	inputID, err := service.newID("steering_input")
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.agent.SteerTurn(ctx, agent.TurnControlRequest{
		ConversationID: request.ConversationID, ProviderThreadID: snapshot.ThreadBinding.ThreadID,
		ProviderTurnID: *turn.ProviderTurnID, ClientInputID: inputID, Text: request.Input.Text,
	}); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.persistSteering(ctx, snapshot, *turn, request.Input); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.ReadSnapshot(ctx, request.WorkspaceID, request.ConversationID)
}

func (service *Service) Stop(ctx context.Context, request StopConversationRequest) (ConversationSnapshot, error) {
	if err := validateConversationIdentity(request.WorkspaceID, request.ConversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	actor := service.actor(request.ConversationID)
	actor.mu.Lock()
	defer actor.mu.Unlock()
	snapshot, err := service.ReadSnapshot(ctx, request.WorkspaceID, request.ConversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	turn := runningTurn(snapshot)
	if turn == nil || turn.ProviderTurnID == nil || snapshot.ThreadBinding == nil {
		return ConversationSnapshot{}, errors.New("conversation has no interruptible provider turn")
	}
	err = service.agent.InterruptTurn(ctx, agent.TurnControlRequest{
		ConversationID:   request.ConversationID,
		ProviderThreadID: snapshot.ThreadBinding.ThreadID,
		ProviderTurnID:   *turn.ProviderTurnID,
	})
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return snapshot, nil
}

func (service *Service) SubmitApproval(ctx context.Context, request SubmitConversationApprovalRequest) (ConversationSnapshot, error) {
	if err := validateConversationIdentity(request.WorkspaceID, request.ConversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	if request.ApprovalID == "" {
		return ConversationSnapshot{}, errors.New("approval id is required")
	}
	actor := service.actor(request.ConversationID)
	actor.mu.Lock()
	defer actor.mu.Unlock()
	snapshot, err := service.ReadSnapshot(ctx, request.WorkspaceID, request.ConversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.agent.SubmitApproval(agent.ApprovalResponse{RequestID: request.ApprovalID, Decision: agent.ApprovalDecision(request.Decision), Answers: providerApprovalAnswers(request.Answers)}); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.persistApprovalResolution(ctx, snapshot, request); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.ReadSnapshot(ctx, request.WorkspaceID, request.ConversationID)
}

func providerApprovalAnswers(answers []ApprovalSubmissionAnswer) []agent.ApprovalAnswer {
	result := make([]agent.ApprovalAnswer, 0, len(answers))
	for _, answer := range answers {
		result = append(result, agent.ApprovalAnswer{QuestionID: answer.QuestionID, Answers: append([]string{}, answer.Answers...)})
	}
	return result
}

func (service *Service) queueTurn(ctx context.Context, snapshot ConversationSnapshot, input AuthoredInput) (ConversationSnapshot, error) {
	profile, _, err := service.resolveRole(ctx, RoleAgent, snapshot.Conversation.WorkspaceID, snapshot.Conversation.ID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	turnID, err := service.newID("turn")
	if err != nil {
		return ConversationSnapshot{}, err
	}
	now := timestampAfter(snapshot.Conversation.UpdatedAt, service.timestamp())
	turn := ConversationTurn{
		ID: turnID, ConversationID: snapshot.Conversation.ID, AuthoredInput: input,
		Delivery: TurnDeliveryQueued, Status: TurnStatusQueued, AcceptedAt: now,
		RequestedRoleProfile: profile,
	}
	queued := QueuedConversationTurn{
		TurnID: turnID, ConversationID: snapshot.Conversation.ID,
		Ordinal: len(snapshot.Queue) + 1, QueuedAt: now,
	}
	if err := service.persistAcceptedTurn(ctx, snapshot, turn, &queued); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.ReadSnapshot(ctx, snapshot.Conversation.WorkspaceID, snapshot.Conversation.ID)
}

func (service *Service) startTurn(ctx context.Context, actor *conversationActor, snapshot ConversationSnapshot, input AuthoredInput, delivery TurnDelivery) (ConversationSnapshot, error) {
	profile, resolved, err := service.resolveRole(ctx, RoleAgent, snapshot.Conversation.WorkspaceID, snapshot.Conversation.ID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	turnID, err := service.newID("turn")
	if err != nil {
		return ConversationSnapshot{}, err
	}
	now := timestampAfter(snapshot.Conversation.UpdatedAt, service.timestamp())
	turn := ConversationTurn{
		ID: turnID, ConversationID: snapshot.Conversation.ID, AuthoredInput: input,
		Delivery: delivery, Status: TurnStatusQueued, AcceptedAt: now,
		RequestedRoleProfile: profile,
	}
	if err := service.persistAcceptedTurn(ctx, snapshot, turn, nil); err != nil {
		return ConversationSnapshot{}, err
	}
	actor.resolved[turn.ID] = resolved
	actor.active = true
	go service.executeTurn(snapshot.Conversation.WorkspaceID, turn.ID)
	return service.ReadSnapshot(ctx, snapshot.Conversation.WorkspaceID, snapshot.Conversation.ID)
}

func (service *Service) persistAcceptedTurn(ctx context.Context, snapshot ConversationSnapshot, turn ConversationTurn, queued *QueuedConversationTurn) error {
	conversation := snapshot.Conversation
	conversation.UpdatedAt = timestampAfter(conversation.UpdatedAt, turn.AcceptedAt)
	conversation.Status = ConversationStatusWorking
	accepted := newTrajectoryEvent(service, snapshot, turn.ID, TrajectoryEventUserInputAccepted, TrajectoryActorUser)
	accepted.EmittedAt = turn.AcceptedAt
	accepted.UserInputAccepted = &TrajectoryUserInputAccepted{Input: turn.AuthoredInput, Delivery: turn.Delivery}
	events := []TrajectoryEvent{accepted}
	if queued != nil {
		queuedEvent := newTrajectoryEvent(service, snapshot, turn.ID, TrajectoryEventTurnQueued, TrajectoryActorSystem)
		queuedEvent.Sequence = accepted.Sequence + 1
		queuedEvent.ID = trajectoryEventID(snapshot.Conversation.ID, queuedEvent.Sequence)
		queuedEvent.EmittedAt = turn.AcceptedAt
		queuedEvent.TurnQueued = &TrajectoryTurnQueued{QueueOrdinal: queued.Ordinal}
		events = append(events, queuedEvent)
	}
	_, err := service.store.Transact(ctx, "accept topic conversation input", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateConversation(ConversationExpectation{UpdatedAt: snapshot.Conversation.UpdatedAt, LastTrajectorySequence: snapshot.Conversation.LastTrajectorySequence}, conversation); err != nil {
			return err
		}
		if err := transaction.InsertTurn(turn); err != nil {
			return err
		}
		if err := transaction.AppendTopicIndexKeywords(turn.ConversationID, turn.AuthoredInput.Text, conversation.UpdatedAt); err != nil {
			return err
		}
		if queued != nil {
			if err := transaction.InsertQueuedTurn(*queued); err != nil {
				return err
			}
		}
		for _, event := range events {
			if err := transaction.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		conversation.LastTrajectorySequence += len(events)
		if err := service.appendCommittedPayload(transaction, conversation, ConversationTurnUpdatedEventPayload{Type: ConversationEventTypeTurnUpdated, Turn: turn}); err != nil {
			return err
		}
		if queued != nil {
			queue := append([]QueuedConversationTurn{}, snapshot.Queue...)
			queue = append(queue, *queued)
			if err := service.appendCommittedPayload(transaction, conversation, ConversationQueueUpdatedEventPayload{Type: ConversationEventTypeQueueUpdated, Queue: queue}); err != nil {
				return err
			}
		}
		for _, event := range events {
			if err := service.appendCommittedPayload(transaction, conversation, ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: event}); err != nil {
				return err
			}
		}
		return service.appendCommittedPayload(transaction, conversation, ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: conversation})
	})
	if err != nil {
		return err
	}
	for _, event := range events {
		service.observeTrajectory(ctx, event)
	}
	return nil
}

func (service *Service) executeTurn(workspaceID string, turnID string) {
	conversationID, snapshot, turn, err := service.executionSnapshot(workspaceID, turnID)
	if err != nil {
		return
	}
	workspaceSummary, err := service.workspaceResolver.ResolveWorkspace(workspaceID)
	if err == nil {
		_, err = service.agent.RunTurn(context.Background(), agent.TurnRequest{
			ConversationID: conversationID, TurnID: turn.ID,
			ProviderThreadID: snapshot.ThreadBinding.ThreadID,
			ClientInputID:    turn.ID + "_input", Text: turn.AuthoredInput.Text,
			WorkspaceRoot: workspaceSummary.RootPath,
			Invocation:    AgentInvocation(turn.RequestedRoleProfile),
		}, &conversationAgentSink{service: service})
	}
	service.finishRuntimeTurn(workspaceID, conversationID, turnID, err)
}

func (service *Service) executionSnapshot(workspaceID string, turnID string) (string, ConversationSnapshot, ConversationTurn, error) {
	conversationID, err := service.conversationIDForTurn(context.Background(), turnID)
	if err != nil {
		return "", ConversationSnapshot{}, ConversationTurn{}, err
	}
	snapshot, err := service.ReadSnapshot(context.Background(), workspaceID, conversationID)
	if err != nil {
		return "", ConversationSnapshot{}, ConversationTurn{}, err
	}
	turn := snapshotTurn(snapshot, turnID)
	if turn == nil || snapshot.ThreadBinding == nil {
		return "", ConversationSnapshot{}, ConversationTurn{}, errors.New("accepted turn has no provider binding")
	}
	return conversationID, snapshot, *turn, nil
}

func (service *Service) conversationIDForTurn(ctx context.Context, turnID string) (string, error) {
	var conversationID string
	err := service.store.read(ctx, "resolve topic conversation turn", func(ctx context.Context, reader *sql.Conn) error {
		return reader.QueryRowContext(ctx, `SELECT conversation_id FROM conversation_turns WHERE id = ?`, turnID).Scan(&conversationID)
	})
	return conversationID, err
}

func (service *Service) finishRuntimeTurn(workspaceID string, conversationID string, turnID string, runtimeErr error) {
	actor := service.actor(conversationID)
	actor.mu.Lock()
	defer actor.mu.Unlock()
	snapshot, err := service.ReadSnapshot(context.Background(), workspaceID, conversationID)
	if err == nil {
		turn := snapshotTurn(snapshot, turnID)
		if turn != nil && (turn.Status == TurnStatusRunning || activeUnqueuedTurn(snapshot, *turn)) {
			result := agent.TurnResult{Outcome: agent.TurnOutcomeFailed}
			if runtimeErr != nil {
				message := runtimeErr.Error()
				result.Error = &message
			}
			_ = service.persistTerminalEvent(context.Background(), snapshot, *turn, result)
		}
	}
	actor.active = false
	_ = service.promoteQueuedTurn(context.Background(), actor, workspaceID, conversationID)
}

func activeUnqueuedTurn(snapshot ConversationSnapshot, turn ConversationTurn) bool {
	if turn.Status != TurnStatusQueued {
		return false
	}
	for _, queued := range snapshot.Queue {
		if queued.TurnID == turn.ID {
			return false
		}
	}
	return true
}

func validateConversationInputRequest(workspaceID string, conversationID string, input AuthoredInput) error {
	if err := validateConversationIdentity(workspaceID, conversationID); err != nil {
		return err
	}
	return input.Validate()
}

func validateConversationIdentity(workspaceID string, conversationID string) error {
	if err := validateIdentifier("conversation workspace id", workspaceID); err != nil {
		return err
	}
	return validateIdentifier("conversation id", conversationID)
}

func runningTurn(snapshot ConversationSnapshot) *ConversationTurn {
	for index := range snapshot.Turns.Turns {
		if snapshot.Turns.Turns[index].Status == TurnStatusRunning {
			return &snapshot.Turns.Turns[index]
		}
	}
	return nil
}

func snapshotTurn(snapshot ConversationSnapshot, turnID string) *ConversationTurn {
	for index := range snapshot.Turns.Turns {
		if snapshot.Turns.Turns[index].ID == turnID {
			return &snapshot.Turns.Turns[index]
		}
	}
	return nil
}

func runningDomainInvocation(id string, startedAt string, profile RoleProfile, resolved agent.ResolvedInvocation, binding *AgentThreadBinding) ResolvedInvocation {
	settings := ResolvedInvocationSettings{
		ModelID: resolved.Model, ReasoningEffort: resolved.ReasoningEffort,
		ServiceTier: cloneStringPointer(resolved.ServiceTier), PermissionProfile: profile.PermissionProfile,
	}
	references := InvocationProviderReferences{}
	if binding != nil {
		references.ThreadID = stringPointerValue(binding.ThreadID)
	}
	return ResolvedInvocation{
		ID: id, Role: profile.Role, Provider: profile.Provider, Requested: profile,
		Resolved: settings, ProviderReferences: references, ModelReroutes: []InvocationModelReroute{},
		StartedAt: startedAt, Outcome: InvocationOutcomeRunning,
	}
}
