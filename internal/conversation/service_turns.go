package conversation

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/agent"
)

func (service *Service) sendTurn(
	ctx context.Context,
	workspaceID *string,
	conversationID string,
	text string,
	turnID string,
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
	scope, err := service.resolveExecutionScope(conversationID, snapshot.Conversation.WorkspaceID)
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
	turn, err := service.acceptTurn(ctx, snapshot, scope, text, TurnDeliveryNormal, 0, turnID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.launchTurnLocked(ctx, scope, turn, 0); err != nil {
		persistErr := service.persistUnexpectedTurnEnd(context.Background(), &activeConversationTurn{
			conversationID: conversationID,
			turnID:         turn.ID,
		}, err)
		if persistErr != nil {
			return ConversationSnapshot{}, errors.Join(err, fmt.Errorf("persist rejected turn launch: %w", persistErr))
		}
		return ConversationSnapshot{}, err
	}
	return service.readScopedSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) queueTurn(
	ctx context.Context,
	workspaceID *string,
	conversationID string,
	text string,
	turnID string,
) (ConversationSnapshot, error) {
	return service.queueTurnWithIdlePromotion(ctx, workspaceID, conversationID, text, turnID, false)
}

// queueRoutedTurn preserves a queue command that was valid when its route
// decision committed even if the active turn reaches a terminal state before
// the executor runs. The queued delivery remains auditable and is promoted
// through the normal lifecycle once the conversation is idle.
func (service *Service) queueRoutedTurn(
	ctx context.Context,
	workspaceID *string,
	conversationID string,
	text string,
	turnID string,
) (ConversationSnapshot, error) {
	return service.queueTurnWithIdlePromotion(ctx, workspaceID, conversationID, text, turnID, true)
}

func (service *Service) queueTurnWithIdlePromotion(
	ctx context.Context,
	workspaceID *string,
	conversationID string,
	text string,
	turnID string,
	promoteWhenIdle bool,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateAuthoredText(text); err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	snapshot, err := service.snapshotLocked(ctx, workspaceID, conversationID)
	if err != nil {
		lock.Unlock()
		return ConversationSnapshot{}, err
	}
	scope, err := service.resolveExecutionScope(conversationID, snapshot.Conversation.WorkspaceID)
	if err != nil {
		lock.Unlock()
		return ConversationSnapshot{}, err
	}
	shouldPromote, err := service.routedQueueIdlePromotion(
		snapshot,
		conversationID,
		promoteWhenIdle,
	)
	if err != nil {
		lock.Unlock()
		return ConversationSnapshot{}, err
	}
	if len(snapshot.Queue) >= MaxSnapshotQueuedTurns {
		lock.Unlock()
		return ConversationSnapshot{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         fmt.Sprintf("queue is limited to %d turns", MaxSnapshotQueuedTurns),
		}
	}
	ordinal := len(snapshot.Queue) + 1
	if _, err := service.acceptTurn(ctx, snapshot, scope, text, TurnDeliveryQueued, ordinal, turnID); err != nil {
		lock.Unlock()
		return ConversationSnapshot{}, err
	}
	lock.Unlock()
	if shouldPromote {
		service.promoteNextTurn(conversationID)
	}
	return service.readScopedSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) routedQueueIdlePromotion(
	snapshot ConversationSnapshot,
	conversationID string,
	promoteWhenIdle bool,
) (bool, error) {
	_, activeErr := service.activeTurnForQueue(snapshot)
	if activeErr == nil {
		return false, nil
	}
	canPromote := promoteWhenIdle && service.activeFor(conversationID) == nil &&
		(snapshot.Conversation.Status == ConversationStatusIdle ||
			snapshot.Conversation.Status == ConversationStatusFailed)
	if canPromote {
		return true, nil
	}
	return false, &CommandConflictError{
		ConversationID: conversationID,
		Reason:         activeErr.Error(),
	}
}

func (service *Service) acceptTurn(
	ctx context.Context,
	snapshot ConversationSnapshot,
	scope conversationExecutionScope,
	text string,
	delivery TurnDelivery,
	queueOrdinal int,
	turnID string,
) (ConversationTurn, error) {
	profile, err := service.store.ReadEffectiveRoleProfile(
		ctx,
		scope.workspaceID,
		snapshot.Conversation.ID,
		DefaultAgentRoleProfile(),
	)
	if err != nil {
		return ConversationTurn{}, fmt.Errorf("read topic agent role profile: %w", err)
	}
	invocation, err := agentInvocation(profile)
	if err != nil {
		return ConversationTurn{}, err
	}
	resolved, err := service.agent.ResolveInvocation(ctx, invocation)
	if err != nil {
		return ConversationTurn{}, fmt.Errorf("resolve topic agent profile: %w", err)
	}
	if err := validatePrimaryAgentModelResolution(invocation, resolved); err != nil {
		return ConversationTurn{}, fmt.Errorf("validate topic agent profile: %w", err)
	}
	ids, err := service.newAcceptedTurnIDs(queueOrdinal > 0, turnID)
	if err != nil {
		return ConversationTurn{}, err
	}
	now := advanceTimestamp(snapshot.Conversation.UpdatedAt, service.timestamp())
	mutation := buildAcceptedTurnMutation(snapshot, text, delivery, queueOrdinal, now, ids, profile)
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

func (service *Service) newAcceptedTurnIDs(queued bool, requestedTurnID string) (acceptedTurnIDs, error) {
	turnID := requestedTurnID
	if turnID == "" {
		generatedTurnID, err := service.newID("turn")
		if err != nil {
			return acceptedTurnIDs{}, err
		}
		turnID = generatedTurnID
	} else if err := validateIdentifier("routed conversation turn id", turnID); err != nil {
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
	profile RoleProfile,
) acceptedTurnMutation {
	turn := ConversationTurn{
		ID:                   ids.turnID,
		ConversationID:       snapshot.Conversation.ID,
		AuthoredInput:        AuthoredInput{Text: text},
		Delivery:             delivery,
		Status:               TurnStatusQueued,
		AcceptedAt:           now,
		RequestedRoleProfile: profile,
	}
	conversation := snapshot.Conversation
	if delivery == TurnDeliveryNormal {
		conversation.Status = ConversationStatusWorking
	}
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
	_, err := service.store.transactPresentationAware(ctx, "accept topic conversation turn", func(transaction *WriteTransaction) error {
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
	if err == nil {
		service.observeCommittedTrajectory(
			mutation.conversation,
			mutation.turn,
			mutation.trajectory,
			nil,
			false,
		)
	}
	return err
}

func (service *Service) steerTurn(
	ctx context.Context,
	workspaceID *string,
	conversationID string,
	text string,
	expectedTurnID string,
	clientInputID string,
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
	control, err := service.controllableTurnState(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if expectedTurnID != "" && control.turn.ID != expectedTurnID {
		return ConversationSnapshot{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         fmt.Sprintf("steer target changed from %s to %s", expectedTurnID, control.turn.ID),
		}
	}
	if clientInputID == "" {
		clientInputID = control.active.turnID + "_steer"
	} else if err := validateIdentifier("routed steer client input id", clientInputID); err != nil {
		return ConversationSnapshot{}, err
	}
	request := agent.TurnControlRequest{
		ConversationID:   conversationID,
		ProviderThreadID: control.active.providerThreadID,
		ProviderTurnID:   control.active.providerTurnID,
		ClientInputID:    clientInputID,
		Text:             text,
	}
	if err := service.agent.SteerTurn(ctx, request); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.persistSteering(
		ctx,
		control.snapshot,
		control.turn.ID,
		text,
	); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.readScopedSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) StopTurn(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (ConversationSnapshot, error) {
	return service.stopTurn(ctx, &workspaceID, conversationID, "")
}

// stopTurn interrupts the active turn, optionally requiring it to be the one the
// caller named. Naming it matters when the caller acted on a turn it was shown:
// a conversation promotes queued work as soon as the previous turn ends, so an
// unnamed stop can interrupt a turn the caller never saw.
func (service *Service) stopTurn(
	ctx context.Context,
	workspaceID *string,
	conversationID string,
	expectedTurnID string,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	control, err := service.controllableTurnState(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := requireControlledTurn(conversationID, "stop", control.turn.ID, expectedTurnID); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.agent.InterruptTurn(ctx, agent.TurnControlRequest{
		ConversationID:   conversationID,
		ProviderThreadID: control.active.providerThreadID,
		ProviderTurnID:   control.active.providerTurnID,
	}); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.persistInterruption(
		ctx,
		control.snapshot,
		control.turn.ID,
		TurnInterruptionUserRequested,
	); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.readScopedSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) SubmitApproval(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	response ConversationApprovalResponse,
) (ConversationSnapshot, error) {
	return service.submitApproval(ctx, &workspaceID, conversationID, "", response)
}

// submitApproval answers one pending approval, optionally requiring it to belong
// to the turn the caller named. An approval only exists while its own turn is
// running, so a caller that was shown the turn should not answer for its
// successor.
func (service *Service) submitApproval(
	ctx context.Context,
	workspaceID *string,
	conversationID string,
	expectedTurnID string,
	response ConversationApprovalResponse,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := response.Validate(); err != nil {
		return ConversationSnapshot{}, err
	}
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	control, err := service.controllableTurnState(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := requireControlledTurn(conversationID, "approval", control.turn.ID, expectedTurnID); err != nil {
		return ConversationSnapshot{}, err
	}
	pending := pendingApprovalsForTurn(control.snapshot, control.turn.ID)
	request, ok := pending[response.ApprovalID]
	if !ok {
		return ConversationSnapshot{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "approval is not pending: " + response.ApprovalID,
		}
	}
	if err := validateApprovalResponseForRequest(request, response); err != nil {
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
		control.snapshot,
		control.turn.ID,
		request,
		response,
		len(pending) > 1,
	); err != nil {
		return ConversationSnapshot{}, err
	}
	return service.readScopedSnapshot(ctx, workspaceID, conversationID)
}

func (service *Service) launchTurnLocked(
	ctx context.Context,
	scope conversationExecutionScope,
	turn ConversationTurn,
	queueOrdinal int,
) error {
	invocation, err := agentInvocation(turn.RequestedRoleProfile)
	if err != nil {
		return err
	}
	snapshot, err := service.snapshotByIDLocked(context.Background(), turn.ConversationID)
	if err != nil {
		return err
	}
	carrier, err := service.ensureConversationCarrierLocked(
		ctx,
		scope,
		snapshot,
		turn.RequestedRoleProfile,
		invocation,
	)
	if err != nil {
		return err
	}
	active := &activeConversationTurn{
		conversationID:   turn.ConversationID,
		providerThreadID: carrier.ThreadID,
		queueOrdinal:     queueOrdinal,
		request: agent.TurnRequest{
			ConversationID:   turn.ConversationID,
			TurnID:           turn.ID,
			ProviderThreadID: carrier.ThreadID,
			ClientInputID:    turn.ID,
			Text:             turn.AuthoredInput.Text,
			// The provider needs a process working directory for every turn. It
			// is the authorized workspace only when there is one.
			WorkspaceRoot: scope.workingDirectory,
			Invocation:    invocation,
			DynamicTools:  service.topicAgentArtifactTools(scope, turn.ConversationID, turn.ID),
		},
		roleProfile:        turn.RequestedRoleProfile,
		scope:              scope,
		subagentIDs:        map[string]string{},
		privateStreamTails: map[string]string{},
		turnID:             turn.ID,
	}
	if err := service.reserveActiveTurn(active); err != nil {
		return err
	}
	go service.runTurn(active)
	return nil
}

func (service *Service) reserveActiveTurn(active *activeConversationTurn) error {
	service.lifecycleMu.Lock()
	defer service.lifecycleMu.Unlock()
	if service.closing {
		return errors.New("conversation service is shutting down")
	}
	service.activeMu.Lock()
	defer service.activeMu.Unlock()
	if service.active[active.conversationID] != nil {
		return &CommandConflictError{ConversationID: active.conversationID, Reason: "turn already active"}
	}
	service.active[active.conversationID] = active
	// Shutdown holds lifecycleMu while it closes admission, so no positive Add
	// can race a Wait that observed a zero counter.
	service.turns.Add(1)
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

func (service *Service) activeTurnForQueue(snapshot ConversationSnapshot) (*activeConversationTurn, error) {
	conversationID := snapshot.Conversation.ID
	active := service.activeFor(conversationID)
	if active == nil {
		return nil, fmt.Errorf("queue requires an active turn")
	}
	turn, err := findConversationTurn(snapshot, active.turnID)
	if err != nil {
		return nil, fmt.Errorf("active turn is unavailable from the bounded snapshot: %w", err)
	}
	if turn.Status != TurnStatusQueued && turn.Status != TurnStatusRunning {
		return nil, fmt.Errorf("queue requires an active turn, got %s", turn.Status)
	}
	return active, nil
}

type controllableConversationTurn struct {
	active   *activeConversationTurn
	snapshot ConversationSnapshot
	turn     ConversationTurn
}

func (service *Service) controllableTurnState(
	ctx context.Context,
	workspaceID *string,
	conversationID string,
) (controllableConversationTurn, error) {
	snapshot, err := service.snapshotLocked(ctx, workspaceID, conversationID)
	if err != nil {
		return controllableConversationTurn{}, err
	}
	active := service.activeFor(conversationID)
	if active == nil {
		return controllableConversationTurn{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "no active turn",
		}
	}
	if active.providerTurnID == "" {
		return controllableConversationTurn{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "provider turn is still starting",
		}
	}
	turn, err := findConversationTurn(snapshot, active.turnID)
	if err != nil {
		return controllableConversationTurn{}, err
	}
	if turn.Status != TurnStatusRunning || turn.ProviderTurnID == nil {
		return controllableConversationTurn{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         fmt.Sprintf("turn %s is %s", turn.ID, turn.Status),
		}
	}
	// The carrier is runtime state, so the check that the caller is steering the
	// run Setta is actually holding compares the live carrier with the run, not a
	// durable record of either.
	carrier, live := service.carriers.Lookup(conversationID)
	if !live || carrier.ThreadID != active.providerThreadID {
		return controllableConversationTurn{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "the carrier running this turn is no longer active",
		}
	}
	if *turn.ProviderTurnID != active.providerTurnID {
		return controllableConversationTurn{}, &CommandConflictError{
			ConversationID: conversationID,
			Reason:         "active provider turn does not match durable state",
		}
	}
	return controllableConversationTurn{active: active, snapshot: snapshot, turn: turn}, nil
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
