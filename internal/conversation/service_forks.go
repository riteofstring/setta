package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/agent"
)

const (
	branchMetadataProviderForkThreadID   = "providerForkThreadId"
	branchMetadataSourceProviderThreadID = "sourceProviderThreadId"
	branchMetadataSourceProviderTurnID   = "sourceProviderTurnId"
)

func (service *Service) executeDurableForkDecision(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	forkedAtTurnID string,
	title string,
	requestedChildConversationID *string,
	decisionSource BranchDecisionSource,
) (ConversationSnapshot, error) {
	workspaceSummary, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return ConversationSnapshot{}, err
	}

	source, err := service.prepareDurableForkSource(
		ctx,
		workspaceID,
		workspaceSummary.RootPath,
		parentConversationID,
		forkedAtTurnID,
	)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	invocation, err := service.resolveDurableForkInvocation(ctx, workspaceID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	childConversationID, err := service.branchConversationID(
		requestedChildConversationID,
		"conversation",
		"routed child conversation id",
	)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	thread, err := service.agent.ForkThread(ctx, agent.ForkThreadRequest{
		ParentThreadID:        source.providerThreadID,
		LastTurnID:            &source.providerTurnID,
		WorkspaceRoot:         workspaceSummary.RootPath,
		Invocation:            invocation,
		DeveloperInstructions: topicAgentDeveloperInstructions(),
		DynamicTools:          service.topicAgentArtifactTools(workspaceID, childConversationID, ""),
	})
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateDurableForkThread(thread, source.providerThreadID); err != nil {
		service.unsubscribeRejectedDurableFork(thread.ID, source.providerThreadID)
		return ConversationSnapshot{}, err
	}

	now := service.timestamp()
	conversation := TopicConversation{
		ID:              childConversationID,
		WorkspaceID:     workspaceID,
		Title:           title,
		TopicDescriptor: title,
		Status:          ConversationStatusIdle,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	binding := AgentThreadBinding{
		ConversationID:   childConversationID,
		Provider:         ProviderCodex,
		ThreadID:         thread.ID,
		Status:           ThreadBindingStatusLinked,
		CreatedAt:        now,
		ProviderMetadata: map[string]string{"model": thread.Model},
	}
	narrator := NarratorState{
		ConversationID:  childConversationID,
		TopicDescriptor: title,
		Status:          NarratorStatusReady,
		UpdatedAt:       now,
	}
	branch := ConversationBranch{
		ChildConversationID:      childConversationID,
		ParentConversationID:     parentConversationID,
		Kind:                     BranchKindFork,
		DecisionSource:           decisionSource,
		ForkedAtTurnID:           forkedAtTurnID,
		SourceTrajectorySequence: source.trajectorySequence,
		ProviderMetadata: map[string]string{
			branchMetadataProviderForkThreadID:   thread.ID,
			branchMetadataSourceProviderThreadID: source.providerThreadID,
			branchMetadataSourceProviderTurnID:   source.providerTurnID,
		},
		CreatedAt: now,
	}

	service.createMu.Lock()
	var presentation ConversationPresentationProfile
	err = service.store.withPresentationConfigurationLock(func() error {
		var presentationErr error
		presentation, presentationErr = service.initialPresentationProfile(
			ctx,
			childConversationID,
			now,
		)
		if presentationErr != nil {
			return presentationErr
		}
		return service.persistCreatedConversation(
			ctx,
			conversation,
			&binding,
			narrator,
			presentation,
			&branch,
		)
	})
	service.createMu.Unlock()
	if err != nil {
		_ = service.agent.UnsubscribeThread(context.Background(), thread.ID)
		return ConversationSnapshot{}, err
	}
	return service.store.ReadSnapshot(ctx, workspaceID, childConversationID)
}

func (service *Service) unsubscribeRejectedDurableFork(threadID string, parentThreadID string) {
	if threadID == "" || threadID == parentThreadID {
		return
	}
	_ = service.agent.UnsubscribeThread(context.Background(), threadID)
}

func (service *Service) resolveDurableForkInvocation(
	ctx context.Context,
	workspaceID string,
) (agent.Invocation, error) {
	profile, err := service.store.ReadEffectiveWorkspaceRoleProfile(
		ctx,
		workspaceID,
		DefaultAgentRoleProfile(),
	)
	if err != nil {
		return agent.Invocation{}, fmt.Errorf("read durable fork agent role profile: %w", err)
	}
	invocation, err := agentInvocation(profile)
	if err != nil {
		return agent.Invocation{}, err
	}
	resolved, err := service.agent.ResolveInvocation(ctx, invocation)
	if err != nil {
		return agent.Invocation{}, fmt.Errorf("resolve durable fork agent profile: %w", err)
	}
	if err := validatePrimaryAgentModelResolution(invocation, resolved); err != nil {
		return agent.Invocation{}, fmt.Errorf("validate durable fork agent profile: %w", err)
	}
	return invocation, nil
}

type durableForkSource struct {
	providerThreadID   string
	providerTurnID     string
	trajectorySequence int
}

func (service *Service) prepareDurableForkSource(
	ctx context.Context,
	workspaceID string,
	workspaceRoot string,
	parentConversationID string,
	forkedAtTurnID string,
) (durableForkSource, error) {
	lock := service.conversationLock(parentConversationID)
	lock.Lock()
	defer lock.Unlock()

	snapshot, err := service.snapshotLocked(ctx, workspaceID, parentConversationID)
	if err != nil {
		return durableForkSource{}, err
	}
	if snapshot.ThreadBinding == nil || snapshot.ThreadBinding.Status != ThreadBindingStatusLinked {
		return durableForkSource{}, &CommandConflictError{
			ConversationID: parentConversationID,
			Reason:         "durable fork requires a linked parent agent thread",
		}
	}
	turn, sourceTrajectorySequence, found, err := service.store.readConversationTurn(
		ctx,
		parentConversationID,
		forkedAtTurnID,
	)
	if err != nil {
		return durableForkSource{}, err
	}
	if !found || turn.Status != TurnStatusCompleted || turn.ProviderTurnID == nil {
		return durableForkSource{}, &CommandConflictError{
			ConversationID: parentConversationID,
			Reason:         "fork source must be a completed turn of the parent conversation",
		}
	}
	binding, err := service.resumeParentAgentThreadForProviderOperationLocked(
		ctx,
		workspaceID,
		workspaceRoot,
		snapshot,
	)
	if err != nil {
		return durableForkSource{}, err
	}
	return durableForkSource{
		providerThreadID:   binding.ThreadID,
		providerTurnID:     *turn.ProviderTurnID,
		trajectorySequence: sourceTrajectorySequence,
	}, nil
}

func (store *Store) readConversationTurn(
	ctx context.Context,
	conversationID string,
	turnID string,
) (ConversationTurn, int, bool, error) {
	if store == nil {
		return ConversationTurn{}, 0, false, errors.New("conversation store is required")
	}
	if ctx == nil {
		return ConversationTurn{}, 0, false, errors.New("conversation turn read context is required")
	}
	var turn ConversationTurn
	trajectorySequence := 0
	found := false
	err := store.read(ctx, "read conversation turn", func(ctx context.Context, connection *sql.Conn) error {
		row := connection.QueryRowContext(ctx, `
SELECT id, conversation_id, authored_input_json, delivery, status, accepted_at,
       started_at, ended_at, requested_role_profile_json,
       resolved_invocation_json, provider_turn_id, error_json
FROM conversation_turns
WHERE id = ? AND conversation_id = ?
`, turnID, conversationID)
		var scanErr error
		turn, scanErr = scanConversationTurn(row)
		if errors.Is(scanErr, sql.ErrNoRows) {
			return nil
		}
		if scanErr != nil {
			return scanErr
		}
		if err := connection.QueryRowContext(ctx, `
SELECT COALESCE(MAX(sequence), 0)
FROM trajectory_events
WHERE conversation_id = ? AND turn_id = ?
`, conversationID, turnID).Scan(&trajectorySequence); err != nil {
			return fmt.Errorf("read durable fork source trajectory sequence: %w", err)
		}
		found = true
		return nil
	})
	return turn, trajectorySequence, found, err
}

func validateDurableForkThread(thread agent.Thread, parentThreadID string) error {
	if err := thread.Validate(); err != nil {
		return fmt.Errorf("provider returned an invalid durable fork thread: %w", err)
	}
	if thread.Ephemeral {
		return errors.New("provider returned an ephemeral thread for a durable fork")
	}
	if thread.ID == parentThreadID {
		return errors.New("provider durable fork reused the parent thread id")
	}
	if thread.ForkedFromID == nil || *thread.ForkedFromID != parentThreadID {
		return fmt.Errorf("provider durable fork lineage does not match parent thread %s", parentThreadID)
	}
	return nil
}
