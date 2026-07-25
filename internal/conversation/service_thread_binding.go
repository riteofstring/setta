package conversation

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/agent"
)

const topicAgentThreadInitialization = "Setta initialized this durable topic conversation thread. This is an inert history marker, not a request. Respond only to later user turns for this topic conversation under the thread's developer contract."

func (service *Service) ensureAgentThreadBindingLocked(
	ctx context.Context,
	workspaceID string,
	workspaceRoot string,
	snapshot ConversationSnapshot,
	turn ConversationTurn,
	invocation agent.Invocation,
) (AgentThreadBinding, error) {
	request := service.agentThreadStartRequest(workspaceID, turn.ConversationID, workspaceRoot, invocation)
	state, err := service.classifyProviderThreadHistory(ctx, snapshot)
	if err != nil {
		return AgentThreadBinding{}, err
	}
	switch state.kind {
	case providerThreadHistoryNone:
		return service.startAndPersistAgentThreadBinding(ctx, snapshot, request)
	case providerThreadHistoryLinked:
		return service.resumeAndPersistAgentThreadBinding(ctx, snapshot, request)
	case providerThreadHistoryBroken:
		return AgentThreadBinding{}, brokenProviderThreadHistoryError(turn.ConversationID, state.reason)
	default:
		return AgentThreadBinding{}, fmt.Errorf("unsupported provider thread history state %d", state.kind)
	}
}

func (service *Service) resumeParentAgentThreadForProviderOperationLocked(
	ctx context.Context,
	workspaceID string,
	workspaceRoot string,
	snapshot ConversationSnapshot,
) (AgentThreadBinding, error) {
	state, err := service.classifyProviderThreadHistory(ctx, snapshot)
	if err != nil {
		return AgentThreadBinding{}, err
	}
	switch state.kind {
	case providerThreadHistoryLinked:
	case providerThreadHistoryNone:
		return AgentThreadBinding{}, &CommandConflictError{
			ConversationID: snapshot.Conversation.ID,
			Reason:         "provider operation requires durable provider history",
		}
	case providerThreadHistoryBroken:
		return AgentThreadBinding{}, brokenProviderThreadHistoryError(snapshot.Conversation.ID, state.reason)
	default:
		return AgentThreadBinding{}, fmt.Errorf("unsupported provider thread history state %d", state.kind)
	}
	invocation, err := service.resolveTopicAgentInvocation(ctx, workspaceID, snapshot.Conversation.ID)
	if err != nil {
		return AgentThreadBinding{}, err
	}
	request := service.agentThreadStartRequest(workspaceID, snapshot.Conversation.ID, workspaceRoot, invocation)
	request.RequireProviderResume = true
	return service.resumeAndPersistAgentThreadBinding(ctx, snapshot, request)
}

type providerThreadHistoryKind int

const (
	providerThreadHistoryNone providerThreadHistoryKind = iota
	providerThreadHistoryLinked
	providerThreadHistoryBroken
)

type providerThreadHistoryState struct {
	kind   providerThreadHistoryKind
	reason string
}

func (service *Service) classifyProviderThreadHistory(
	ctx context.Context,
	snapshot ConversationSnapshot,
) (providerThreadHistoryState, error) {
	hasProviderHistory, err := service.store.conversationHasProviderBackedTurns(
		ctx,
		snapshot.Conversation.ID,
	)
	if err != nil {
		return providerThreadHistoryState{}, err
	}
	if !hasProviderHistory {
		return classifyProviderThreadWithoutTurnHistory(snapshot), nil
	}
	if snapshot.ThreadBinding == nil {
		return providerThreadHistoryState{
			kind:   providerThreadHistoryBroken,
			reason: "durable provider turns exist without an agent thread binding",
		}, nil
	}
	if snapshot.ThreadBinding.Status != ThreadBindingStatusLinked {
		return providerThreadHistoryState{
			kind: providerThreadHistoryBroken,
			reason: fmt.Sprintf(
				"durable provider turns require a linked agent thread binding, got %s",
				snapshot.ThreadBinding.Status,
			),
		}, nil
	}
	if snapshot.ThreadBinding.LastTurnID == nil {
		return providerThreadHistoryState{
			kind:   providerThreadHistoryBroken,
			reason: "linked agent thread binding is not attached to a durable provider turn",
		}, nil
	}
	return providerThreadHistoryState{kind: providerThreadHistoryLinked}, nil
}

func classifyProviderThreadWithoutTurnHistory(
	snapshot ConversationSnapshot,
) providerThreadHistoryState {
	if snapshot.Branch == nil {
		return providerThreadHistoryState{kind: providerThreadHistoryNone}
	}
	if snapshot.Branch.Kind == BranchKindChild {
		if snapshot.ThreadBinding != nil {
			return providerThreadHistoryState{
				kind:   providerThreadHistoryBroken,
				reason: "delegated child has an agent thread binding before its first provider turn",
			}
		}
		return providerThreadHistoryState{kind: providerThreadHistoryNone}
	}
	if snapshot.Branch.Kind != BranchKindFork {
		return providerThreadHistoryState{
			kind: providerThreadHistoryBroken,
			reason: fmt.Sprintf(
				"unsupported provider branch kind %s exists without durable provider turns",
				snapshot.Branch.Kind,
			),
		}
	}
	if snapshot.ThreadBinding == nil {
		return providerThreadHistoryState{
			kind:   providerThreadHistoryBroken,
			reason: "durable provider fork exists without an agent thread binding",
		}
	}
	if snapshot.ThreadBinding.Status != ThreadBindingStatusLinked {
		return providerThreadHistoryState{
			kind: providerThreadHistoryBroken,
			reason: fmt.Sprintf(
				"durable provider fork requires a linked agent thread binding, got %s",
				snapshot.ThreadBinding.Status,
			),
		}
	}
	if snapshot.Branch.ProviderMetadata[branchMetadataProviderForkThreadID] != snapshot.ThreadBinding.ThreadID {
		return providerThreadHistoryState{
			kind:   providerThreadHistoryBroken,
			reason: "durable provider fork metadata does not match the agent thread binding",
		}
	}
	return providerThreadHistoryState{kind: providerThreadHistoryLinked}
}

func brokenProviderThreadHistoryError(conversationID string, reason string) error {
	return stateConflict(
		"agent thread binding",
		conversationID,
		"provider history is broken: "+reason,
	)
}

func (service *Service) repairMissingProviderThreadBeforeTurnStart(
	active *activeConversationTurn,
	runErr error,
) (bool, error) {
	if !agent.IsProviderThreadMissing(runErr) {
		return false, nil
	}
	if !service.activeProviderThreadRepairable(active) {
		return false, nil
	}
	lock := service.conversationLock(active.conversationID)
	lock.Lock()
	defer lock.Unlock()
	return service.repairMissingProviderThreadBeforeTurnStartLocked(active)
}

func (service *Service) repairMissingProviderThreadBeforeTurnStartLocked(
	active *activeConversationTurn,
) (bool, error) {
	if !service.activeProviderThreadRepairable(active) {
		return false, nil
	}
	ctx := context.Background()
	snapshot, err := service.store.ReadSnapshot(ctx, active.workspaceID, active.conversationID)
	if err != nil {
		return false, err
	}
	turn, err := findConversationTurn(snapshot, active.turnID)
	if err != nil {
		return false, err
	}
	if !turnRepairableBeforeProviderStart(turn) {
		return false, nil
	}
	state, err := service.classifyProviderThreadHistory(ctx, snapshot)
	if err != nil {
		return false, err
	}
	if state.kind != providerThreadHistoryNone {
		return false, nil
	}
	request := service.agentThreadStartRequest(
		active.workspaceID,
		active.conversationID,
		active.request.WorkspaceRoot,
		active.request.Invocation,
	)
	binding, err := service.startAndPersistAgentThreadBinding(ctx, snapshot, request)
	if err != nil {
		return false, err
	}
	return service.applyMissingProviderThreadRepair(active, binding), nil
}

func turnRepairableBeforeProviderStart(turn ConversationTurn) bool {
	return turn.Status == TurnStatusQueued && turn.ProviderTurnID == nil
}

func (service *Service) applyMissingProviderThreadRepair(
	active *activeConversationTurn,
	binding AgentThreadBinding,
) bool {
	service.activeMu.Lock()
	defer service.activeMu.Unlock()
	current := service.active[active.conversationID]
	if current == nil || current.turnID != active.turnID {
		return false
	}
	current.providerThreadID = binding.ThreadID
	current.providerThreadRepairAttempted = true
	current.request.ProviderThreadID = binding.ThreadID
	return true
}

func (service *Service) activeProviderThreadRepairable(active *activeConversationTurn) bool {
	if active == nil {
		return false
	}
	service.activeMu.Lock()
	defer service.activeMu.Unlock()
	current := service.active[active.conversationID]
	return current != nil &&
		current.turnID == active.turnID &&
		current.providerTurnID == "" &&
		!current.providerThreadRepairAttempted
}

func (service *Service) resolveTopicAgentInvocation(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (agent.Invocation, error) {
	profile, err := service.store.ReadEffectiveRoleProfile(
		ctx,
		workspaceID,
		conversationID,
		DefaultAgentRoleProfile(),
	)
	if err != nil {
		return agent.Invocation{}, fmt.Errorf("read topic agent role profile: %w", err)
	}
	invocation, err := agentInvocation(profile)
	if err != nil {
		return agent.Invocation{}, err
	}
	resolved, err := service.agent.ResolveInvocation(ctx, invocation)
	if err != nil {
		return agent.Invocation{}, fmt.Errorf("resolve topic agent profile: %w", err)
	}
	if err := validatePrimaryAgentModelResolution(invocation, resolved); err != nil {
		return agent.Invocation{}, fmt.Errorf("validate topic agent profile: %w", err)
	}
	return invocation, nil
}

func (service *Service) agentThreadStartRequest(
	workspaceID string,
	conversationID string,
	workspaceRoot string,
	invocation agent.Invocation,
) agent.StartThreadRequest {
	return agent.StartThreadRequest{
		WorkspaceRoot:         workspaceRoot,
		Invocation:            invocation,
		DeveloperInstructions: topicAgentDeveloperInstructions(),
		DynamicTools:          service.topicAgentArtifactTools(workspaceID, conversationID, ""),
	}
}

func (service *Service) startAndPersistAgentThreadBinding(
	ctx context.Context,
	snapshot ConversationSnapshot,
	request agent.StartThreadRequest,
) (AgentThreadBinding, error) {
	thread, err := service.agent.StartThread(ctx, request)
	if err != nil {
		return AgentThreadBinding{}, err
	}
	if err := service.agent.MaterializeThread(ctx, thread.ID, topicAgentThreadInitialization); err != nil {
		cause := fmt.Errorf("materialize topic agent thread %s: %w", thread.ID, err)
		if cleanupErr := service.agent.UnsubscribeThread(context.Background(), thread.ID); cleanupErr != nil {
			cause = errors.Join(cause, fmt.Errorf("unsubscribe unmaterialized topic agent thread %s: %w", thread.ID, cleanupErr))
		}
		return AgentThreadBinding{}, cause
	}
	now := advanceTimestamp(snapshot.Conversation.UpdatedAt, service.timestamp())
	binding := AgentThreadBinding{
		ConversationID:   snapshot.Conversation.ID,
		Provider:         ProviderCodex,
		ThreadID:         thread.ID,
		Status:           ThreadBindingStatusLinked,
		CreatedAt:        now,
		ProviderMetadata: agentThreadProviderMetadata(thread),
	}
	if err := service.persistAgentThreadBinding(ctx, "link topic conversation thread", binding, now); err != nil {
		cause := err
		if cleanupErr := service.agent.UnsubscribeThread(context.Background(), thread.ID); cleanupErr != nil {
			cause = errors.Join(cause, fmt.Errorf("unsubscribe unpersisted topic agent thread %s: %w", thread.ID, cleanupErr))
		}
		return AgentThreadBinding{}, cause
	}
	return binding, nil
}

func (service *Service) resumeAndPersistAgentThreadBinding(
	ctx context.Context,
	snapshot ConversationSnapshot,
	request agent.StartThreadRequest,
) (AgentThreadBinding, error) {
	current := *snapshot.ThreadBinding
	result, err := service.agent.ResumeThreadWithConfiguration(ctx, current.ThreadID, request)
	if err != nil {
		return AgentThreadBinding{}, err
	}
	if !result.Resumed {
		return current, nil
	}
	now := advanceTimestamp(snapshot.Conversation.UpdatedAt, service.timestamp())
	current.LastResumedAt = &now
	current.ProviderMetadata = agentThreadProviderMetadata(result.Thread)
	if err := service.persistAgentThreadBinding(ctx, "resume topic conversation thread", current, now); err != nil {
		return AgentThreadBinding{}, err
	}
	return current, nil
}

func agentThreadProviderMetadata(thread agent.Thread) map[string]string {
	return map[string]string{"model": thread.Model}
}

func (service *Service) persistAgentThreadBinding(
	ctx context.Context,
	operation string,
	binding AgentThreadBinding,
	emittedAt string,
) error {
	publications, err := service.publications(
		binding.ConversationID,
		emittedAt,
		ConversationThreadBindingUpdatedEventPayload{
			Type:    ConversationEventTypeThreadBindingUpdated,
			Binding: binding,
		},
	)
	if err != nil {
		return err
	}
	_, err = service.store.Transact(ctx, operation, func(transaction *WriteTransaction) error {
		if err := transaction.UpsertAgentThreadBinding(binding); err != nil {
			return err
		}
		return appendPublications(transaction, publications)
	})
	return err
}
