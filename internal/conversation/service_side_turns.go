package conversation

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/agent"
)

type sideConversationAgentEventSink struct {
	active  *activeSideConversationTurn
	service *Service
}

type sideTurnPreparation struct {
	active   *activeSideConversationTurn
	event    TrajectoryEvent
	expected SideConversationExpectation
	side     SideConversation
}

func (sink *sideConversationAgentEventSink) HandleAgentEvent(event agent.Event) error {
	return sink.service.handleSideAgentEvent(sink.active.ctx, sink.active, event)
}

func (service *Service) SendSideConversationTurn(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	sideConversationID string,
	text string,
) (ConversationSnapshot, error) {
	return service.sendSideConversationTurn(
		ctx,
		workspaceID,
		parentConversationID,
		sideConversationID,
		text,
		"",
	)
}

func (service *Service) sendSideConversationTurn(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	sideConversationID string,
	text string,
	requestedTurnID string,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateSideTurnRequest(parentConversationID, sideConversationID, text); err != nil {
		return ConversationSnapshot{}, err
	}
	workspaceSummary, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	turnID := requestedTurnID
	if turnID == "" {
		turnID, err = service.newID("side_turn")
		if err != nil {
			return ConversationSnapshot{}, err
		}
	} else if err := validateIdentifier("routed side turn id", turnID); err != nil {
		return ConversationSnapshot{}, err
	}
	eventID, err := service.newID("side_event")
	if err != nil {
		return ConversationSnapshot{}, err
	}

	lock := service.conversationLock(parentConversationID)
	lock.Lock()
	defer lock.Unlock()
	prepared, err := service.prepareSideTurnLocked(
		ctx,
		workspaceID,
		parentConversationID,
		sideConversationID,
		workspaceSummary.RootPath,
		turnID,
		eventID,
		text,
	)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.reserveActiveSideTurn(prepared.active); err != nil {
		prepared.active.cancel()
		return ConversationSnapshot{}, err
	}
	if err := service.persistSideConversationEvent(ctx, prepared.expected, prepared.side, prepared.event); err != nil {
		service.releaseReservedSideTurn(prepared.active)
		return ConversationSnapshot{}, err
	}
	go service.runSideTurn(prepared.active)
	return service.store.ReadSnapshot(ctx, workspaceID, parentConversationID)
}

func validateSideTurnRequest(parentConversationID string, sideConversationID string, text string) error {
	if err := validateIdentifier("side turn parent conversation id", parentConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("side turn side conversation id", sideConversationID); err != nil {
		return err
	}
	return validateAuthoredText(text)
}

func (service *Service) prepareSideTurnLocked(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	sideConversationID string,
	workspaceRoot string,
	turnID string,
	eventID string,
	text string,
) (sideTurnPreparation, error) {
	snapshot, err := service.snapshotLocked(ctx, workspaceID, parentConversationID)
	if err != nil {
		return sideTurnPreparation{}, err
	}
	side, err := service.readSideConversation(ctx, snapshot, sideConversationID)
	if err != nil {
		return sideTurnPreparation{}, err
	}
	if err := validateSideTurnAdmission(side); err != nil {
		return sideTurnPreparation{}, err
	}
	invocation, err := sideProviderInvocation(side)
	if err != nil {
		return sideTurnPreparation{}, err
	}
	return service.buildSideTurnPreparation(
		snapshot,
		side,
		workspaceID,
		workspaceRoot,
		turnID,
		eventID,
		text,
		invocation,
	), nil
}

func validateSideTurnAdmission(side SideConversation) error {
	if side.Status != SideConversationStatusActive || side.DisposedAt != nil {
		return &CommandConflictError{
			ConversationID: side.ParentConversationID,
			Reason:         fmt.Sprintf("side conversation %s is not active", side.ID),
		}
	}
	if side.ActiveTurnID != nil {
		return &CommandConflictError{
			ConversationID: side.ParentConversationID,
			Reason:         fmt.Sprintf("side conversation %s already has an active turn", side.ID),
		}
	}
	if side.ProviderThreadID == nil {
		return fmt.Errorf("active side conversation %s has no provider thread", side.ID)
	}
	return nil
}

func (service *Service) buildSideTurnPreparation(
	snapshot ConversationSnapshot,
	side SideConversation,
	workspaceID string,
	workspaceRoot string,
	turnID string,
	eventID string,
	text string,
	invocation agent.Invocation,
) sideTurnPreparation {
	now := advanceTimestamp(side.UpdatedAt, service.timestamp())
	expected := SideConversationExpectation{Status: side.Status, UpdatedAt: side.UpdatedAt}
	side.ParentStatus = snapshot.Conversation.Status
	side.ActiveTurnID = &turnID
	side.ActiveProviderTurnID = nil
	side.LastEventSequence++
	side.UpdatedAt = now
	event := TrajectoryEvent{
		ID:             eventID,
		ConversationID: side.ID,
		TurnID:         &turnID,
		Sequence:       side.LastEventSequence,
		EmittedAt:      now,
		Kind:           TrajectoryEventUserInputAccepted,
		Actor:          TrajectoryActorUser,
		UserInputAccepted: &TrajectoryUserInputAccepted{
			Input:    AuthoredInput{Text: text},
			Delivery: TurnDeliveryNormal,
		},
	}
	activeCtx, cancel := context.WithCancel(service.lifecycleCtx)
	active := &activeSideConversationTurn{
		cancel:               cancel,
		ctx:                  activeCtx,
		done:                 make(chan struct{}),
		parentConversationID: side.ParentConversationID,
		request: agent.TurnRequest{
			ConversationID:   side.ID,
			TurnID:           turnID,
			ProviderThreadID: *side.ProviderThreadID,
			ClientInputID:    turnID,
			Text:             text,
			WorkspaceRoot:    workspaceRoot,
			Invocation:       invocation,
		},
		sideConversationID: side.ID,
		turnID:             turnID,
		workspaceID:        workspaceID,
	}
	return sideTurnPreparation{active: active, event: event, expected: expected, side: side}
}

func sideProviderInvocation(side SideConversation) (agent.Invocation, error) {
	invocation, err := providerInvocation(side.ResolvedSideAgentInvocation.Requested)
	if err != nil {
		return agent.Invocation{}, err
	}
	invocation.ModelSelectionProviderDefault = false
	invocation.Model = currentSideAgentModel(side)
	invocation.ReasoningEffort = string(side.ResolvedSideAgentInvocation.Resolved.ReasoningEffort)
	invocation.ServiceTier = cloneStringPointer(side.ResolvedSideAgentInvocation.Resolved.ServiceTier)
	if err := invocation.Validate(); err != nil {
		return agent.Invocation{}, fmt.Errorf("side conversation %s provider invocation: %w", side.ID, err)
	}
	return invocation, nil
}

func (service *Service) reserveActiveSideTurn(active *activeSideConversationTurn) error {
	service.lifecycleMu.Lock()
	defer service.lifecycleMu.Unlock()
	if service.closing {
		return errors.New("conversation service is shutting down")
	}
	service.activeMu.Lock()
	defer service.activeMu.Unlock()
	if service.activeSides[active.sideConversationID] != nil {
		return &CommandConflictError{
			ConversationID: active.parentConversationID,
			Reason:         fmt.Sprintf("side conversation %s already has an active turn", active.sideConversationID),
		}
	}
	service.activeSides[active.sideConversationID] = active
	service.turns.Add(1)
	return nil
}

func (service *Service) releaseReservedSideTurn(active *activeSideConversationTurn) {
	active.cancel()
	service.activeMu.Lock()
	if service.activeSides[active.sideConversationID] == active {
		delete(service.activeSides, active.sideConversationID)
	}
	service.activeMu.Unlock()
	close(active.done)
	service.turns.Done()
}

func (service *Service) runSideTurn(active *activeSideConversationTurn) {
	_, err := service.agent.RunTurn(
		active.ctx,
		active.request,
		&sideConversationAgentEventSink{active: active, service: service},
	)
	service.finishSideRunTurn(active, err)
}

func (service *Service) handleSideAgentEvent(
	ctx context.Context,
	active *activeSideConversationTurn,
	event agent.Event,
) error {
	if err := validateSideAgentEventScope(active, event); err != nil {
		return err
	}
	lock := service.conversationLock(active.parentConversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, side, err := service.sideAgentEventState(ctx, active, event)
	if err != nil {
		return err
	}
	now := advanceTimestamp(side.UpdatedAt, service.timestamp())
	trajectory, err := service.sideTrajectoryFromAgentEvent(snapshot, side, active, event, now)
	if err != nil {
		return err
	}
	expected, side, trajectory := applySideAgentEvent(snapshot, side, event, trajectory, now)
	return service.persistSideConversationEvent(ctx, expected, side, trajectory)
}

func validateSideAgentEventScope(active *activeSideConversationTurn, event agent.Event) error {
	if err := event.Validate(); err != nil {
		return err
	}
	if event.ConversationID != active.sideConversationID || event.TurnID != active.turnID {
		return fmt.Errorf("side agent event scope %s/%s does not match %s/%s", event.ConversationID, event.TurnID, active.sideConversationID, active.turnID)
	}
	if event.ProviderThreadID != active.request.ProviderThreadID {
		return fmt.Errorf("side agent event provider thread %s does not match %s", event.ProviderThreadID, active.request.ProviderThreadID)
	}
	return nil
}

func (service *Service) sideAgentEventState(
	ctx context.Context,
	active *activeSideConversationTurn,
	event agent.Event,
) (ConversationSnapshot, SideConversation, error) {
	snapshot, err := service.snapshotLocked(ctx, active.workspaceID, active.parentConversationID)
	if err != nil {
		return ConversationSnapshot{}, SideConversation{}, err
	}
	side, err := service.readSideConversation(ctx, snapshot, active.sideConversationID)
	if err != nil {
		return ConversationSnapshot{}, SideConversation{}, err
	}
	if err := validateSideAgentEventState(side, active, event); err != nil {
		return ConversationSnapshot{}, SideConversation{}, err
	}
	return snapshot, side, nil
}

func validateSideAgentEventState(
	side SideConversation,
	active *activeSideConversationTurn,
	event agent.Event,
) error {
	if side.DisposedAt != nil || (side.Status != SideConversationStatusActive && side.Status != SideConversationStatusDisposing) {
		return fmt.Errorf("side conversation %s cannot accept provider events while %s", side.ID, side.Status)
	}
	if side.ActiveTurnID == nil || *side.ActiveTurnID != active.turnID {
		return fmt.Errorf("side agent event turn %s is no longer active", active.turnID)
	}
	if event.Kind == agent.EventKindTurnStarted {
		if side.ActiveProviderTurnID != nil {
			return fmt.Errorf("side conversation %s provider turn already started", side.ID)
		}
		return nil
	}
	if side.ActiveProviderTurnID == nil || *side.ActiveProviderTurnID != event.ProviderTurnID {
		return fmt.Errorf("side agent progress turn %s does not match durable provider turn", event.ProviderTurnID)
	}
	return nil
}

func applySideAgentEvent(
	snapshot ConversationSnapshot,
	side SideConversation,
	event agent.Event,
	trajectory TrajectoryEvent,
	now string,
) (SideConversationExpectation, SideConversation, TrajectoryEvent) {
	expected := SideConversationExpectation{Status: side.Status, UpdatedAt: side.UpdatedAt}
	side.ParentStatus = snapshot.Conversation.Status
	side.LastEventSequence++
	side.UpdatedAt = now
	trajectory.Sequence = side.LastEventSequence
	if event.Kind == agent.EventKindTurnStarted {
		side.ActiveProviderTurnID = &event.ProviderTurnID
	}
	if event.Kind == agent.EventKindModelRerouted {
		side.ResolvedSideAgentInvocation.ModelReroutes = append(
			side.ResolvedSideAgentInvocation.ModelReroutes,
			trajectory.ModelRerouted.Reroute,
		)
	}
	if event.Kind == agent.EventKindTurnTerminal {
		side.ActiveTurnID = nil
		side.ActiveProviderTurnID = nil
	}
	return expected, side, trajectory
}

func currentSideAgentModel(side SideConversation) string {
	reroutes := side.ResolvedSideAgentInvocation.ModelReroutes
	if len(reroutes) == 0 {
		return side.ResolvedSideAgentInvocation.Resolved.ModelID
	}
	return reroutes[len(reroutes)-1].ToModelID
}

func (service *Service) sideTrajectoryFromAgentEvent(
	snapshot ConversationSnapshot,
	side SideConversation,
	active *activeSideConversationTurn,
	event agent.Event,
	now string,
) (TrajectoryEvent, error) {
	eventID, err := service.newID("side_event")
	if err != nil {
		return TrajectoryEvent{}, err
	}
	trajectory := TrajectoryEvent{
		ID:               eventID,
		ConversationID:   side.ID,
		TurnID:           &active.turnID,
		EmittedAt:        now,
		ProviderEventID:  cloneStringPointer(event.ProviderEventID),
		ProviderThreadID: &event.ProviderThreadID,
		ProviderTurnID:   &event.ProviderTurnID,
	}
	switch event.Kind {
	case agent.EventKindTurnStarted:
		invocation := side.ResolvedSideAgentInvocation
		invocation.ProviderReferences.ThreadID = &event.ProviderThreadID
		invocation.ProviderReferences.TurnID = &event.ProviderTurnID
		trajectory.Kind = TrajectoryEventTurnStarted
		trajectory.Actor = TrajectoryActorAgent
		trajectory.TurnStarted = &TrajectoryTurnStarted{Invocation: invocation}
		return trajectory, nil
	case agent.EventKindTurnTerminal:
		return service.sideTerminalTrajectory(trajectory, event)
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
		mapped, _, err := service.populateAgentTrajectory(
			trajectory,
			&activeConversationTurn{request: active.request, turnID: active.turnID},
			snapshot,
			event,
			now,
		)
		return mapped, err
	default:
		return TrajectoryEvent{}, fmt.Errorf("unsupported side agent event kind %q", event.Kind)
	}
}

func (service *Service) sideTerminalTrajectory(
	trajectory TrajectoryEvent,
	event agent.Event,
) (TrajectoryEvent, error) {
	if event.Terminal == nil {
		return TrajectoryEvent{}, errors.New("side terminal event requires payload")
	}
	trajectory.Actor = TrajectoryActorAgent
	switch event.Terminal.Outcome {
	case agent.TurnOutcomeCompleted:
		trajectory.Kind = TrajectoryEventTurnCompleted
		trajectory.TurnCompleted = &TrajectoryTurnCompleted{}
	case agent.TurnOutcomeInterrupted:
		trajectory.Kind = TrajectoryEventTurnInterrupted
		trajectory.TurnInterrupted = &TrajectoryTurnInterrupted{Reason: TurnInterruptionProviderInterrupted}
	case agent.TurnOutcomeFailed:
		message := "side agent turn failed"
		if event.Terminal.Error != nil && *event.Terminal.Error != "" {
			message = *event.Terminal.Error
		}
		diagnosticID, err := service.newID("side_diagnostic")
		if err != nil {
			return TrajectoryEvent{}, err
		}
		trajectory.Kind = TrajectoryEventTurnFailed
		trajectory.TurnFailed = &TrajectoryTurnFailed{Failure: Failure{
			Code:                "side_turn_failed",
			Message:             message,
			Retryable:           true,
			DiagnosticReference: diagnosticID,
		}}
	default:
		return TrajectoryEvent{}, fmt.Errorf("unsupported side terminal outcome %q", event.Terminal.Outcome)
	}
	return trajectory, nil
}

func (service *Service) finishSideRunTurn(active *activeSideConversationTurn, runErr error) {
	lock := service.conversationLock(active.parentConversationID)
	lock.Lock()
	snapshot, readErr := service.store.ReadSnapshot(context.Background(), active.workspaceID, active.parentConversationID)
	if readErr == nil {
		side, sideErr := service.readSideConversation(context.Background(), snapshot, active.sideConversationID)
		if sideErr == nil && side.ActiveTurnID != nil && *side.ActiveTurnID == active.turnID && side.DisposedAt == nil {
			_ = service.persistUnexpectedSideTurnEnd(snapshot, side, active, runErr)
		}
	}
	lock.Unlock()
	service.releaseReservedSideTurn(active)
}

func (service *Service) persistUnexpectedSideTurnEnd(
	snapshot ConversationSnapshot,
	side SideConversation,
	active *activeSideConversationTurn,
	runErr error,
) error {
	if errors.Is(runErr, context.Canceled) || active.ctx.Err() != nil {
		// Cancelling the local attachment does not prove that Codex stopped the
		// provider turn. Preserve its durable identity so disposal or startup
		// recovery can target the exact turn and record a confirmed outcome.
		return nil
	}
	if runErr == nil {
		runErr = errors.New("side agent runtime ended without a durable terminal event")
	}
	now := advanceTimestamp(side.UpdatedAt, service.timestamp())
	diagnosticID, err := service.newID("side_diagnostic")
	if err != nil {
		return err
	}
	failure := Failure{
		Code:                "side_turn_runtime_failed",
		Message:             runErr.Error(),
		Retryable:           true,
		DiagnosticReference: diagnosticID,
	}
	expected := SideConversationExpectation{Status: side.Status, UpdatedAt: side.UpdatedAt}
	side.ParentStatus = snapshot.Conversation.Status
	side.Status = SideConversationStatusFailed
	side.UpdatedAt = now
	side.Failure = &failure
	side.ResolvedSideAgentInvocation = terminalInvocation(
		side.ResolvedSideAgentInvocation,
		InvocationOutcomeFailed,
		now,
		&failure,
	)
	return service.persistSideConversation(context.Background(), &expected, side)
}

func findSideConversation(snapshot ConversationSnapshot, sideConversationID string) (SideConversation, error) {
	for _, side := range snapshot.SideConversations {
		if side.ID == sideConversationID {
			return side, nil
		}
	}
	return SideConversation{}, fmt.Errorf("side conversation %s is unavailable from the bounded parent snapshot", sideConversationID)
}

func (service *Service) readSideConversation(
	ctx context.Context,
	snapshot ConversationSnapshot,
	sideConversationID string,
) (SideConversation, error) {
	return service.store.readSideConversation(
		ctx,
		snapshot.Conversation.ID,
		sideConversationID,
		snapshot.Conversation.Status,
	)
}
