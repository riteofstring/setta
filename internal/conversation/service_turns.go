package conversation

import (
	"context"
	"fmt"

	"setta/internal/agent"
)

func (service *Service) SendTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateAuthoredText(text); err != nil {
		return ConversationSnapshot{}, err
	}
	workspaceSummary, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.snapshotLocked(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if service.activeFor(conversationID) != nil ||
		snapshot.Conversation.Status == ConversationStatusWorking ||
		snapshot.Conversation.Status == ConversationStatusWaitingForApproval {
		return ConversationSnapshot{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "send requires an idle conversation; queue or steer active work",
		}
	}
	turn, err := service.acceptTurn(ctx, snapshot, text, TurnDeliveryNormal, 0)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.launchTurnLocked(workspaceSummary.RootPath, workspaceID, turn, 0); err != nil {
		_ = service.persistUnexpectedTurnEnd(context.Background(), &activeConversationTurn{
			conversationID: conversationID,
			turnID:         turn.ID,
			workspaceID:    workspaceID,
		}, err)
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) QueueTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateAuthoredText(text); err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.snapshotLocked(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if service.activeFor(conversationID) == nil {
		return ConversationSnapshot{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "queue requires an active turn",
		}
	}
	if len(snapshot.Queue) >= MaxSnapshotQueuedTurns {
		return ConversationSnapshot{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         fmt.Sprintf("queue is limited to %d turns", MaxSnapshotQueuedTurns),
		}
	}
	ordinal := len(snapshot.Queue) + 1
	if _, err := service.acceptTurn(ctx, snapshot, text, TurnDeliveryQueued, ordinal); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) acceptTurn(
	ctx context.Context,
	snapshot ConversationSnapshot,
	text string,
	delivery TurnDelivery,
	queueOrdinal int,
) (ConversationTurn, error) {
	ids, err := service.newAcceptedTurnIDs(queueOrdinal > 0)
	if err != nil {
		return ConversationTurn{}, err
	}
	now := advanceTimestamp(snapshot.Conversation.UpdatedAt, service.timestamp())
	mutation := buildAcceptedTurnMutation(snapshot, text, delivery, queueOrdinal, now, ids)
	publications, err := service.publications(
		mutation.turn.ConversationID,
		now,
		acceptedTurnPayloads(mutation)...,
	)
	if err != nil {
		return ConversationTurn{}, err
	}
	err = service.commitAcceptedTurn(ctx, mutation, publications)
	return mutation.turn, err
}

type acceptedTurnIDs struct {
	acceptedTrajectoryID string
	queuedTrajectoryID   string
	turnID               string
}

type acceptedTurnMutation struct {
	conversation TopicConversation
	queue        []QueuedConversationTurn
	queueOrdinal int
	snapshot     ConversationSnapshot
	trajectory   []TrajectoryEvent
	turn         ConversationTurn
}

func (service *Service) newAcceptedTurnIDs(queued bool) (acceptedTurnIDs, error) {
	turnID, err := service.newID("turn")
	if err != nil {
		return acceptedTurnIDs{}, err
	}
	acceptedID, err := service.newID("trajectory")
	if err != nil {
		return acceptedTurnIDs{}, err
	}
	ids := acceptedTurnIDs{acceptedTrajectoryID: acceptedID, turnID: turnID}
	if queued {
		ids.queuedTrajectoryID, err = service.newID("trajectory")
	}
	return ids, err
}

func buildAcceptedTurnMutation(
	snapshot ConversationSnapshot,
	text string,
	delivery TurnDelivery,
	queueOrdinal int,
	now string,
	ids acceptedTurnIDs,
) acceptedTurnMutation {
	turn := ConversationTurn{
		ID:                   ids.turnID,
		ConversationID:       snapshot.Conversation.ID,
		AuthoredInput:        AuthoredInput{Text: text},
		Delivery:             delivery,
		Status:               TurnStatusQueued,
		AcceptedAt:           now,
		RequestedRoleProfile: roleProfileForTurn(snapshot),
	}
	conversation := snapshot.Conversation
	conversation.Status = ConversationStatusWorking
	conversation.UpdatedAt = now
	accepted := TrajectoryEvent{
		ID:             ids.acceptedTrajectoryID,
		ConversationID: turn.ConversationID,
		TurnID:         &turn.ID,
		Sequence:       snapshot.Conversation.LastTrajectorySequence + 1,
		EmittedAt:      now,
		Kind:           TrajectoryEventUserInputAccepted,
		Actor:          TrajectoryActorUser,
		UserInputAccepted: &TrajectoryUserInputAccepted{
			Input:    turn.AuthoredInput,
			Delivery: delivery,
		},
	}
	mutation := acceptedTurnMutation{
		conversation: conversation,
		queue:        append([]QueuedConversationTurn{}, snapshot.Queue...),
		queueOrdinal: queueOrdinal,
		snapshot:     snapshot,
		trajectory:   []TrajectoryEvent{accepted},
		turn:         turn,
	}
	if queueOrdinal > 0 {
		appendQueuedTurnMutation(&mutation, ids.queuedTrajectoryID, now)
	}
	return mutation
}

func appendQueuedTurnMutation(mutation *acceptedTurnMutation, trajectoryID string, now string) {
	queued := QueuedConversationTurn{
		TurnID:         mutation.turn.ID,
		ConversationID: mutation.turn.ConversationID,
		Ordinal:        mutation.queueOrdinal,
		QueuedAt:       now,
	}
	mutation.queue = append(mutation.queue, queued)
	mutation.trajectory = append(mutation.trajectory, TrajectoryEvent{
		ID:             trajectoryID,
		ConversationID: mutation.turn.ConversationID,
		TurnID:         &mutation.turn.ID,
		Sequence:       mutation.trajectory[0].Sequence + 1,
		EmittedAt:      now,
		Kind:           TrajectoryEventTurnQueued,
		Actor:          TrajectoryActorSystem,
		TurnQueued:     &TrajectoryTurnQueued{QueueOrdinal: mutation.queueOrdinal},
	})
}

func acceptedTurnPayloads(mutation acceptedTurnMutation) []ConversationEventPayload {
	publishedConversation := mutation.conversation
	publishedConversation.LastTrajectorySequence += len(mutation.trajectory)
	payloads := []ConversationEventPayload{
		ConversationUpdatedEventPayload{Type: ConversationEventTypeConversationUpdated, Conversation: publishedConversation},
		ConversationTurnUpdatedEventPayload{Type: ConversationEventTypeTurnUpdated, Turn: mutation.turn},
	}
	if mutation.queueOrdinal > 0 {
		payloads = append(payloads, ConversationQueueUpdatedEventPayload{Type: ConversationEventTypeQueueUpdated, Queue: mutation.queue})
	}
	for _, event := range mutation.trajectory {
		payloads = append(payloads, ConversationTrajectoryAppendedEventPayload{Type: ConversationEventTypeTrajectoryAppended, Event: event})
	}
	return payloads
}

func (service *Service) commitAcceptedTurn(
	ctx context.Context,
	mutation acceptedTurnMutation,
	publications []preparedPublication,
) error {
	_, err := service.store.Transact(ctx, "accept topic conversation turn", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateConversation(
			ConversationExpectation{
				UpdatedAt:              mutation.snapshot.Conversation.UpdatedAt,
				LastTrajectorySequence: mutation.snapshot.Conversation.LastTrajectorySequence,
			},
			mutation.conversation,
		); err != nil {
			return err
		}
		if err := transaction.InsertTurn(mutation.turn); err != nil {
			return err
		}
		if mutation.queueOrdinal > 0 {
			if err := transaction.InsertQueuedTurn(mutation.queue[len(mutation.queue)-1]); err != nil {
				return err
			}
		}
		for _, event := range mutation.trajectory {
			if err := transaction.AppendTrajectoryEvent(event); err != nil {
				return err
			}
		}
		return appendPublications(transaction, publications)
	})
	return err
}

func (service *Service) SteerTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	text string,
) (ConversationSnapshot, error) {
	if err := validateAuthoredText(text); err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	active, err := service.requireControllableTurn(conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	request := agent.TurnControlRequest{
		ConversationID:   conversationID,
		ProviderThreadID: active.providerThreadID,
		ProviderTurnID:   active.providerTurnID,
		ClientInputID:    active.turnID + "_steer",
		Text:             text,
	}
	if err := service.agent.SteerTurn(ctx, request); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.persistSteering(ctx, workspaceID, conversationID, active.turnID, text); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) StopTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (ConversationSnapshot, error) {
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	active, err := service.requireControllableTurn(conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.agent.InterruptTurn(ctx, agent.TurnControlRequest{
		ConversationID:   conversationID,
		ProviderThreadID: active.providerThreadID,
		ProviderTurnID:   active.providerTurnID,
	}); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.persistInterruption(
		ctx,
		workspaceID,
		conversationID,
		active.turnID,
		TurnInterruptionUserRequested,
	); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) SubmitApproval(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	response ConversationApprovalResponse,
) (ConversationSnapshot, error) {
	if err := response.Validate(); err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	active, err := service.requireControllableTurn(conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	agentResponse, err := agentApprovalResponse(response)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.agent.SubmitApproval(agentResponse); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.persistApprovalResolution(
		ctx,
		workspaceID,
		conversationID,
		active.turnID,
		response,
	); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) launchTurnLocked(
	workspaceRoot string,
	workspaceID string,
	turn ConversationTurn,
	queueOrdinal int,
) error {
	invocation, err := agentInvocation(turn.RequestedRoleProfile)
	if err != nil {
		return err
	}
	snapshot, err := service.store.ReadSnapshot(context.Background(), workspaceID, turn.ConversationID)
	if err != nil {
		return err
	}
	if snapshot.ThreadBinding == nil || snapshot.ThreadBinding.Status != ThreadBindingStatusLinked {
		return &CommandConflictError{ConversationID: turn.ConversationID, Reason: "agent thread is not linked"}
	}
	active := &activeConversationTurn{
		conversationID:   turn.ConversationID,
		providerThreadID: snapshot.ThreadBinding.ThreadID,
		queueOrdinal:     queueOrdinal,
		request: agent.TurnRequest{
			ConversationID:   turn.ConversationID,
			TurnID:           turn.ID,
			ProviderThreadID: snapshot.ThreadBinding.ThreadID,
			ClientInputID:    turn.ID,
			Text:             turn.AuthoredInput.Text,
			WorkspaceRoot:    workspaceRoot,
			Invocation:       invocation,
		},
		roleProfile: turn.RequestedRoleProfile,
		turnID:      turn.ID,
		workspaceID: workspaceID,
	}
	service.activeMu.Lock()
	if service.active[turn.ConversationID] != nil {
		service.activeMu.Unlock()
		return &CommandConflictError{ConversationID: turn.ConversationID, Reason: "turn already active"}
	}
	service.active[turn.ConversationID] = active
	service.activeMu.Unlock()
	service.turns.Add(1)
	go service.runTurn(active)
	return nil
}

func (service *Service) activeFor(conversationID string) *activeConversationTurn {
	service.activeMu.Lock()
	defer service.activeMu.Unlock()
	active := service.active[conversationID]
	if active == nil {
		return nil
	}
	copy := *active
	return &copy
}

func (service *Service) requireControllableTurn(conversationID string) (*activeConversationTurn, error) {
	active := service.activeFor(conversationID)
	if active == nil {
		return nil, &CommandConflictError{ConversationID: conversationID, Reason: "no active turn"}
	}
	if active.providerTurnID == "" {
		return nil, &CommandConflictError{ConversationID: conversationID, Reason: "provider turn is still starting"}
	}
	return active, nil
}

func validateAuthoredText(text string) error {
	if err := (AuthoredInput{Text: text}).Validate(); err != nil {
		return err
	}
	if len(text) > MaxAuthoredInputBytes {
		return fmt.Errorf("authored input exceeds %d bytes", MaxAuthoredInputBytes)
	}
	return nil
}
