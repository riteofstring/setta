package conversation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/agent"
)

type ForkConversationRequest struct {
	WorkspaceID          string         `json:"workspaceId"`
	ParentConversationID string         `json:"parentConversationId"`
	ForkedAtTurnID       string         `json:"forkedAtTurnId"`
	InitialInput         *AuthoredInput `json:"initialInput"`
}

type CreateSideConversationRequest struct {
	WorkspaceID          string        `json:"workspaceId"`
	ParentConversationID string        `json:"parentConversationId"`
	ParentPaneID         string        `json:"parentPaneId"`
	Input                AuthoredInput `json:"input"`
}

type DisposeSideConversationRequest struct {
	WorkspaceID          string `json:"workspaceId"`
	ParentConversationID string `json:"parentConversationId"`
	SideID               string `json:"sideId"`
}

func (service *Service) Fork(ctx context.Context, request ForkConversationRequest) (ConversationSnapshot, error) {
	if err := validateForkRequest(request); err != nil {
		return ConversationSnapshot{}, err
	}
	parent, sourceTurn, err := service.forkSource(ctx, request)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	workspaceSummary, err := service.workspaceResolver.ResolveWorkspace(request.WorkspaceID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	profile, resolved, err := service.resolveRole(ctx, RoleAgent, request.WorkspaceID, "")
	if err != nil {
		return ConversationSnapshot{}, err
	}
	thread, err := service.agent.ForkThread(ctx, agent.ForkThreadRequest{
		ParentThreadID: parent.ThreadBinding.ThreadID,
		LastTurnID:     sourceTurn.ProviderTurnID,
		WorkspaceRoot:  workspaceSummary.RootPath,
		Invocation:     AgentInvocation(profile),
	})
	if err != nil {
		return ConversationSnapshot{}, err
	}
	records, branch, err := service.newForkRecords(request, parent, profile, resolved, thread)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := service.persistFork(ctx, records, branch); err != nil {
		return ConversationSnapshot{}, err
	}
	service.actor(records.conversation.ID)
	if request.InitialInput != nil {
		return service.Send(ctx, SendConversationInputRequest{
			WorkspaceID: request.WorkspaceID, ConversationID: records.conversation.ID, Input: *request.InitialInput,
		})
	}
	return service.ReadSnapshot(ctx, request.WorkspaceID, records.conversation.ID)
}

func (service *Service) forkSource(ctx context.Context, request ForkConversationRequest) (ConversationSnapshot, ConversationTurn, error) {
	snapshot, err := service.ReadSnapshot(ctx, request.WorkspaceID, request.ParentConversationID)
	if err != nil {
		return ConversationSnapshot{}, ConversationTurn{}, err
	}
	if snapshot.ThreadBinding == nil || snapshot.ThreadBinding.Status != ThreadBindingStatusLinked {
		return ConversationSnapshot{}, ConversationTurn{}, errors.New("fork parent has no linked provider thread")
	}
	turn := snapshotTurn(snapshot, request.ForkedAtTurnID)
	if turn == nil {
		return ConversationSnapshot{}, ConversationTurn{}, fmt.Errorf("fork source turn not found: %s", request.ForkedAtTurnID)
	}
	if turn.Status != TurnStatusCompleted || turn.ProviderTurnID == nil {
		return ConversationSnapshot{}, ConversationTurn{}, errors.New("durable fork requires a completed provider turn")
	}
	return snapshot, *turn, nil
}

func (service *Service) newForkRecords(request ForkConversationRequest, parent ConversationSnapshot, profile RoleProfile, resolved agent.ResolvedInvocation, thread agent.Thread) (newConversationRecords, ConversationBranch, error) {
	created, err := service.newConversationRecords(CreateConversationRequest{
		WorkspaceID: request.WorkspaceID,
		Title:       "Fork of " + parent.Conversation.Title,
	}, profile, resolved, thread)
	if err != nil {
		return newConversationRecords{}, ConversationBranch{}, err
	}
	branch := ConversationBranch{
		ChildConversationID:  created.conversation.ID,
		ParentConversationID: parent.Conversation.ID,
		Kind:                 BranchKindFork, ForkedAtTurnID: request.ForkedAtTurnID,
		SourceTrajectorySequence: parent.Conversation.LastTrajectorySequence,
		ProviderMetadata: map[string]string{
			"parentThreadId": parent.ThreadBinding.ThreadID,
			"childThreadId":  thread.ID,
		},
		CreatedAt: created.conversation.CreatedAt,
	}
	return created, branch, nil
}

func (service *Service) persistFork(ctx context.Context, records newConversationRecords, branch ConversationBranch) error {
	eventID, err := service.newID("conversation_event")
	if err != nil {
		return err
	}
	_, err = service.store.Transact(ctx, "persist durable conversation fork", func(transaction *WriteTransaction) error {
		profile, err := transaction.allocatePresentation(records.presentation)
		if err != nil {
			return err
		}
		if err := transaction.InsertConversation(records.conversation); err != nil {
			return err
		}
		if err := transaction.UpsertAgentThreadBinding(records.binding); err != nil {
			return err
		}
		if err := transaction.InsertNarratorState(records.narrator); err != nil {
			return err
		}
		if err := transaction.UpsertConversationPresentationProfile(profile); err != nil {
			return err
		}
		if err := transaction.UpsertTopicIndexDocument(records.index); err != nil {
			return err
		}
		if err := transaction.InsertConversationBranch(branch); err != nil {
			return err
		}
		streamID, err := ConversationStreamID(records.conversation.ID)
		if err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
			ID: eventID, StreamID: streamID, Kind: string(ConversationEventTypeBranchCreated),
			Payload:     ConversationBranchCreatedEventPayload{Type: ConversationEventTypeBranchCreated, Branch: branch},
			CommittedAt: records.conversation.CreatedAt,
		})
		return err
	})
	return err
}

func (service *Service) CreateSide(ctx context.Context, request CreateSideConversationRequest) (SideConversation, error) {
	if err := validateSideRequest(request); err != nil {
		return SideConversation{}, err
	}
	parent, err := service.ReadSnapshot(ctx, request.WorkspaceID, request.ParentConversationID)
	if err != nil {
		return SideConversation{}, err
	}
	if parent.ThreadBinding == nil || parent.ThreadBinding.Status != ThreadBindingStatusLinked {
		return SideConversation{}, errors.New("side conversation parent has no linked provider thread")
	}
	workspaceSummary, err := service.workspaceResolver.ResolveWorkspace(request.WorkspaceID)
	if err != nil {
		return SideConversation{}, err
	}
	profile, resolved, err := service.resolveRole(ctx, RoleSideAgent, request.WorkspaceID, request.ParentConversationID)
	if err != nil {
		return SideConversation{}, err
	}
	side, err := service.newPreparingSide(request, parent, profile, resolved)
	if err != nil {
		return SideConversation{}, err
	}
	if err := service.persistSideInsert(ctx, parent.Conversation, side); err != nil {
		return SideConversation{}, err
	}
	thread, err := service.agent.ForkThread(ctx, agent.ForkThreadRequest{
		ParentThreadID:        parent.ThreadBinding.ThreadID,
		WorkspaceRoot:         workspaceSummary.RootPath,
		Invocation:            AgentInvocation(profile),
		Ephemeral:             true,
		DeveloperInstructions: "This is an isolated Setta side conversation. Answer only the side request. Do not steer, mutate, or append to the parent thread.",
	})
	if err != nil {
		return SideConversation{}, service.failSide(ctx, parent.Conversation, side, err)
	}
	if err := service.injectSideBoundary(ctx, thread.ID, sideContextFrame(parent)); err != nil {
		return SideConversation{}, service.failSide(ctx, parent.Conversation, side, err)
	}
	active := side
	active.ProviderThreadID = stringPointerValue(thread.ID)
	active.Status = SideConversationStatusActive
	active.UpdatedAt = timestampAfter(side.UpdatedAt, service.timestamp())
	active.ResolvedSideAgentInvocation.ProviderReferences.ThreadID = stringPointerValue(thread.ID)
	if err := service.persistSideUpdate(ctx, parent.Conversation, side, active); err != nil {
		return SideConversation{}, err
	}
	service.startSideTurn(workspaceSummary.RootPath, active, request.Input)
	return active, nil
}

func (service *Service) newPreparingSide(request CreateSideConversationRequest, parent ConversationSnapshot, profile RoleProfile, resolved agent.ResolvedInvocation) (SideConversation, error) {
	sideID, err := service.newID("side")
	if err != nil {
		return SideConversation{}, err
	}
	invocationID, err := service.newID("side_invocation")
	if err != nil {
		return SideConversation{}, err
	}
	now := service.timestampAfterSnapshot(parent)
	invocation := ResolvedInvocation{
		ID: invocationID, Role: RoleSideAgent, Provider: ProviderCodex,
		Requested: profile,
		Resolved: ResolvedInvocationSettings{
			ModelID: resolved.Model, ReasoningEffort: resolved.ReasoningEffort,
			ServiceTier: cloneStringPointer(resolved.ServiceTier), PermissionProfile: profile.PermissionProfile,
		},
		ContextUsage: InvocationContextUsage{}, ProviderReferences: InvocationProviderReferences{},
		ModelReroutes: []InvocationModelReroute{}, StartedAt: now, Outcome: InvocationOutcomeRunning,
	}
	var sourceTurnID *string
	if turn := runningTurn(parent); turn != nil {
		sourceTurnID = cloneStringPointer(turn.ProviderTurnID)
	}
	return SideConversation{
		ID: sideID, ParentConversationID: request.ParentConversationID, ParentPaneID: request.ParentPaneID,
		SourceProviderTurnID: sourceTurnID, SourceTrajectorySequence: parent.Conversation.LastTrajectorySequence,
		Status: SideConversationStatusPreparing, ResolvedSideAgentInvocation: invocation,
		CreatedAt: now, UpdatedAt: now,
	}, nil
}

func (service *Service) injectSideBoundary(ctx context.Context, threadID string, frame SideInFlightContextFrame) error {
	encoded, err := json.Marshal(frame)
	if err != nil {
		return err
	}
	return service.agent.InjectItems(ctx, threadID, []agent.InjectedTextItem{
		{Role: "developer", Text: "Setta SideInFlightContextFrame (public authoritative state only):\n" + string(encoded)},
		{Role: "developer", Text: "Setta side-conversation boundary: inherited history is context only. The next user message begins an isolated side exchange. Never write output into the parent exchange."},
	})
}

func (service *Service) startSideTurn(workspaceRoot string, side SideConversation, input AuthoredInput) {
	ctx, cancel := context.WithCancel(context.Background())
	service.sidesMu.Lock()
	service.sideCancels[side.ID] = cancel
	service.sidesMu.Unlock()
	go func() {
		defer service.clearSideCancel(side.ID)
		result, err := service.agent.RunTurn(ctx, agent.TurnRequest{
			ConversationID: "side_" + side.ID, TurnID: side.ID + "_turn",
			ProviderThreadID: *side.ProviderThreadID, ClientInputID: side.ID + "_input",
			Text: input.Text, WorkspaceRoot: workspaceRoot,
			Invocation: AgentInvocation(side.ResolvedSideAgentInvocation.Requested),
		}, &sideAgentSink{service: service, side: side})
		service.finishSide(side, result, err)
	}()
}

func (service *Service) DisposeSide(ctx context.Context, request DisposeSideConversationRequest) (SideConversation, error) {
	if err := validateSideIdentity(request); err != nil {
		return SideConversation{}, err
	}
	snapshot, err := service.ReadSnapshot(ctx, request.WorkspaceID, request.ParentConversationID)
	if err != nil {
		return SideConversation{}, err
	}
	side := findSide(snapshot.SideConversations, request.SideID)
	if side == nil || side.ProviderThreadID == nil {
		return SideConversation{}, fmt.Errorf("active side conversation not found: %s", request.SideID)
	}
	service.sidesMu.Lock()
	if cancel := service.sideCancels[side.ID]; cancel != nil {
		cancel()
	}
	service.sidesMu.Unlock()
	if err := service.agent.UnsubscribeThread(ctx, *side.ProviderThreadID); err != nil {
		return SideConversation{}, err
	}
	disposed := *side
	disposed.Status = SideConversationStatusDisposing
	disposed.UpdatedAt = timestampAfter(side.UpdatedAt, service.timestamp())
	disposed.DisposedAt = &disposed.UpdatedAt
	if err := service.persistSideUpdate(ctx, snapshot.Conversation, *side, disposed); err != nil {
		return SideConversation{}, err
	}
	return disposed, nil
}

type sideAgentSink struct {
	service *Service
	side    SideConversation
}

func (sink *sideAgentSink) HandleAgentEvent(event agent.Event) error {
	domain, ok := sideEventFromAgent(sink.service.timestamp(), sink.side, event)
	if !ok {
		return nil
	}
	return sink.service.persistSideEvent(context.Background(), sink.side, domain)
}

func sideEventFromAgent(emittedAt string, side SideConversation, event agent.Event) (SideConversationEvent, bool) {
	result := SideConversationEvent{
		SideID: side.ID, ParentConversationID: side.ParentConversationID,
		ProviderEventID: cloneStringPointer(event.ProviderEventID), EmittedAt: emittedAt,
	}
	switch event.Kind {
	case agent.EventKindAgentTextDelta:
		if event.Text == nil {
			return SideConversationEvent{}, false
		}
		result.Kind = SideConversationEventAgentTextDelta
		result.Text = stringPointerValue(event.Text.Text)
	case agent.EventKindAgentTextCompleted:
		if event.Text == nil {
			return SideConversationEvent{}, false
		}
		result.Kind = SideConversationEventAgentTextCompleted
		result.Text = stringPointerValue(event.Text.Text)
	case agent.EventKindActivityStarted, agent.EventKindActivityUpdated, agent.EventKindActivityCompleted:
		if event.Activity == nil {
			return SideConversationEvent{}, false
		}
		activity := trajectoryActivity(*event.Activity)
		result.Kind = SideConversationEventActivity
		result.Activity = &activity
	default:
		return SideConversationEvent{}, false
	}
	return result, true
}

func (service *Service) finishSide(side SideConversation, result agent.TurnResult, runErr error) {
	now := service.timestamp()
	outcome := InvocationOutcomeSucceeded
	if result.Outcome == agent.TurnOutcomeInterrupted {
		outcome = InvocationOutcomeCancelled
	}
	var failure *Failure
	if runErr != nil || result.Outcome == agent.TurnOutcomeFailed {
		outcome = InvocationOutcomeFailed
		message := "side provider turn failed"
		if runErr != nil {
			message = runErr.Error()
		} else if result.Error != nil {
			message = *result.Error
		}
		value := providerFailure("side_provider_turn_failed", message, side.ID)
		failure = &value
	}
	event := SideConversationEvent{
		SideID: side.ID, ParentConversationID: side.ParentConversationID,
		Kind: SideConversationEventTerminal, Outcome: &outcome, Failure: failure, EmittedAt: now,
	}
	_ = service.persistSideEvent(context.Background(), side, event)
	record, err := service.store.ReadConversation(context.Background(), side.ParentConversationID)
	if err != nil {
		return
	}
	snapshot, err := service.ReadSnapshot(context.Background(), record.WorkspaceID, record.ID)
	if err != nil {
		return
	}
	current := findSide(snapshot.SideConversations, side.ID)
	if current == nil || current.Status != SideConversationStatusActive {
		return
	}
	updated := *current
	updated.UpdatedAt = timestampAfter(current.UpdatedAt, now)
	updated.ResolvedSideAgentInvocation.EndedAt = &updated.UpdatedAt
	updated.ResolvedSideAgentInvocation.Outcome = outcome
	updated.ResolvedSideAgentInvocation.Failure = failure
	if failure != nil {
		updated.Status = SideConversationStatusFailed
		updated.Failure = failure
	}
	_ = service.persistSideUpdate(context.Background(), snapshot.Conversation, *current, updated)
}

func (service *Service) clearSideCancel(sideID string) {
	service.sidesMu.Lock()
	delete(service.sideCancels, sideID)
	service.sidesMu.Unlock()
}

func (service *Service) persistSideInsert(ctx context.Context, parent TopicConversation, side SideConversation) error {
	eventID, err := service.newID("conversation_event")
	if err != nil {
		return err
	}
	_, err = service.store.Transact(ctx, "insert side conversation", func(transaction *WriteTransaction) error {
		if err := transaction.InsertSideConversation(side); err != nil {
			return err
		}
		return appendSideUpdatedEvent(transaction, eventID, parent, side)
	})
	return err
}

func (service *Service) persistSideUpdate(ctx context.Context, parent TopicConversation, previous SideConversation, next SideConversation) error {
	eventID, err := service.newID("conversation_event")
	if err != nil {
		return err
	}
	_, err = service.store.Transact(ctx, "update side conversation", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateSideConversation(SideConversationExpectation{Status: previous.Status, UpdatedAt: previous.UpdatedAt}, next); err != nil {
			return err
		}
		return appendSideUpdatedEvent(transaction, eventID, parent, next)
	})
	return err
}

func (service *Service) persistSideEvent(ctx context.Context, side SideConversation, event SideConversationEvent) error {
	if err := event.Validate(); err != nil {
		return err
	}
	eventID, err := service.newID("conversation_event")
	if err != nil {
		return err
	}
	streamID, err := ConversationStreamID(side.ParentConversationID)
	if err != nil {
		return err
	}
	_, err = service.store.Transact(ctx, "append side conversation event", func(transaction *WriteTransaction) error {
		_, err := transaction.AppendCommittedEvent(CommittedEventDraft{
			ID: eventID, StreamID: streamID, Kind: string(ConversationEventTypeSideConversationEventCreated),
			Payload:     ConversationSideConversationEventCreatedEventPayload{Type: ConversationEventTypeSideConversationEventCreated, Event: event},
			CommittedAt: event.EmittedAt,
		})
		return err
	})
	return err
}

func appendSideUpdatedEvent(transaction *WriteTransaction, eventID string, parent TopicConversation, side SideConversation) error {
	streamID, err := ConversationStreamID(parent.ID)
	if err != nil {
		return err
	}
	_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID: eventID, StreamID: streamID, Kind: string(ConversationEventTypeSideConversationUpdated),
		Payload:     ConversationSideConversationUpdatedEventPayload{Type: ConversationEventTypeSideConversationUpdated, SideConversation: side},
		CommittedAt: side.UpdatedAt,
	})
	return err
}

func (service *Service) failSide(ctx context.Context, parent TopicConversation, side SideConversation, failure error) error {
	next := side
	next.Status = SideConversationStatusFailed
	next.UpdatedAt = timestampAfter(side.UpdatedAt, service.timestamp())
	value := providerFailure("side_setup_failed", failure.Error(), side.ID)
	next.Failure = &value
	next.ResolvedSideAgentInvocation.EndedAt = &next.UpdatedAt
	next.ResolvedSideAgentInvocation.Outcome = InvocationOutcomeFailed
	next.ResolvedSideAgentInvocation.Failure = &value
	if err := service.persistSideUpdate(ctx, parent, side, next); err != nil {
		return errors.Join(failure, err)
	}
	return failure
}

func sideContextFrame(snapshot ConversationSnapshot) SideInFlightContextFrame {
	return SideInFlightContextFrame{
		SourceTrajectorySequence: snapshot.Conversation.LastTrajectorySequence,
		CurrentObjective:         snapshot.CurrentProjection.CurrentObjective,
		AcceptedSteering:         append([]string{}, snapshot.CurrentProjection.AcceptedSteering...),
		CurrentPlan:              cloneTrajectoryPlan(snapshot.CurrentProjection.CurrentPlan),
		ActiveActivities:         append([]TrajectoryActivity{}, snapshot.CurrentProjection.ActiveActivities...),
		ActiveSubagents:          append([]Subagent{}, snapshot.CurrentProjection.ActiveSubagents...),
		PendingApproval:          cloneTrajectoryApproval(snapshot.CurrentProjection.PendingApproval),
		Artifacts:                append([]Artifact{}, snapshot.Artifacts.Artifacts...),
	}
}

func cloneTrajectoryPlan(value *TrajectoryPlanChanged) *TrajectoryPlanChanged {
	if value == nil {
		return nil
	}
	copy := *value
	copy.Steps = append([]PlanStep{}, value.Steps...)
	return &copy
}

func cloneTrajectoryApproval(value *TrajectoryApprovalRequest) *TrajectoryApprovalRequest {
	if value == nil {
		return nil
	}
	copy := *value
	copy.Questions = append([]TrajectoryApprovalQuestion{}, value.Questions...)
	return &copy
}

func validateForkRequest(request ForkConversationRequest) error {
	if err := validateConversationIdentity(request.WorkspaceID, request.ParentConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("fork source turn id", request.ForkedAtTurnID); err != nil {
		return err
	}
	if request.InitialInput != nil {
		return request.InitialInput.Validate()
	}
	return nil
}

func validateSideRequest(request CreateSideConversationRequest) error {
	if err := validateConversationIdentity(request.WorkspaceID, request.ParentConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("side parent pane id", request.ParentPaneID); err != nil {
		return err
	}
	return request.Input.Validate()
}

func validateSideIdentity(request DisposeSideConversationRequest) error {
	if err := validateConversationIdentity(request.WorkspaceID, request.ParentConversationID); err != nil {
		return err
	}
	return validateIdentifier("side conversation id", request.SideID)
}

func findSide(sides []SideConversation, id string) *SideConversation {
	for index := range sides {
		if sides[index].ID == id {
			copy := sides[index]
			return &copy
		}
	}
	return nil
}
