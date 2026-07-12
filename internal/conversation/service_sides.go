package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/agent"
)

const sideAgentDeveloperInstructions = `You are in an ephemeral side conversation, not the parent topic conversation. Treat inherited parent history as reference context only and wait for instructions submitted to this side conversation. Do not continue the parent's active task, modify workspace state, or interact with sub-agents.`

type preparedSideConversation struct {
	invocation           agent.Invocation
	parentThreadID       string
	resolved             agent.ResolvedInvocation
	side                 SideConversation
	workspaceRoot        string
	parentConversationID string
}

// CreateSideConversation forks an ephemeral provider thread and associates it
// with exactly one parent conversation and originating pane. Boundary/context
// injection and side turns are deliberately owned by the next lifecycle step.
func (service *Service) CreateSideConversation(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	parentPaneID string,
) (ConversationSnapshot, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateSideConversationRequest(parentConversationID, parentPaneID); err != nil {
		return ConversationSnapshot{}, err
	}
	workspaceSummary, err := service.workspaces.ResolveActiveWorkspace(workspaceID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	profile, resolved, invocation, err := service.resolveSideAgentInvocation(
		ctx,
		workspaceID,
		parentConversationID,
	)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	prepared, err := service.persistPreparingSideConversation(
		ctx,
		workspaceID,
		parentConversationID,
		parentPaneID,
		workspaceSummary.RootPath,
		profile,
		resolved,
		invocation,
	)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	thread, err := service.agent.ForkThread(ctx, agent.ForkThreadRequest{
		ParentThreadID:        prepared.parentThreadID,
		WorkspaceRoot:         prepared.workspaceRoot,
		Invocation:            prepared.invocation,
		Ephemeral:             true,
		DeveloperInstructions: sideAgentDeveloperInstructions,
	})
	if err != nil {
		return ConversationSnapshot{}, service.failPreparingSideConversation(prepared, err)
	}
	if err := validateSideForkThread(thread, prepared.parentThreadID, prepared.resolved.Model); err != nil {
		service.unsubscribeRejectedSideFork(thread.ID, prepared.parentThreadID)
		return ConversationSnapshot{}, service.failPreparingSideConversation(prepared, err)
	}
	if err := service.activateSideConversation(ctx, prepared, thread); err != nil {
		_ = service.agent.UnsubscribeThread(context.Background(), thread.ID)
		return ConversationSnapshot{}, service.failPreparingSideConversation(prepared, err)
	}
	return service.store.ReadSnapshot(ctx, workspaceID, parentConversationID)
}

func validateSideConversationRequest(parentConversationID string, parentPaneID string) error {
	if err := validateIdentifier("side parent conversation id", parentConversationID); err != nil {
		return err
	}
	return validateIdentifier("side parent pane id", parentPaneID)
}

func (store *Store) hasOpenSideConversationForPane(
	ctx context.Context,
	parentConversationID string,
	parentPaneID string,
) (bool, error) {
	var exists bool
	err := store.read(ctx, "read open side conversation for pane", func(ctx context.Context, connection *sql.Conn) error {
		return connection.QueryRowContext(ctx, `
SELECT EXISTS(
  SELECT 1
  FROM side_conversations
  WHERE parent_conversation_id = ?
    AND parent_pane_id = ?
    AND status IN ('preparing', 'active', 'disposing')
)
`, parentConversationID, parentPaneID).Scan(&exists)
	})
	return exists, err
}

func (service *Service) resolveSideAgentInvocation(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (RoleProfile, agent.ResolvedInvocation, agent.Invocation, error) {
	profile, err := service.store.ReadEffectiveRoleProfile(
		ctx,
		workspaceID,
		conversationID,
		DefaultSideAgentRoleProfile(),
	)
	if err != nil {
		return RoleProfile{}, agent.ResolvedInvocation{}, agent.Invocation{}, fmt.Errorf(
			"read side agent role profile: %w",
			err,
		)
	}
	requested, err := sideAgentInvocation(profile)
	if err != nil {
		return RoleProfile{}, agent.ResolvedInvocation{}, agent.Invocation{}, err
	}
	resolved, err := service.agent.ResolveInvocation(ctx, requested)
	if err != nil {
		return RoleProfile{}, agent.ResolvedInvocation{}, agent.Invocation{}, fmt.Errorf(
			"resolve side agent profile: %w",
			err,
		)
	}
	invocation, err := resolvedSideAgentProviderInvocation(requested, resolved)
	if err != nil {
		return RoleProfile{}, agent.ResolvedInvocation{}, agent.Invocation{}, fmt.Errorf(
			"validate side agent profile resolution: %w",
			err,
		)
	}
	return profile, resolved, invocation, nil
}

func sideAgentInvocation(profile RoleProfile) (agent.Invocation, error) {
	if err := profile.Validate(); err != nil {
		return agent.Invocation{}, err
	}
	if profile.Role != RoleSideAgent {
		return agent.Invocation{}, fmt.Errorf("side conversation requires side_agent role profile, got %s", profile.Role)
	}
	if profile.PermissionProfile.ProviderPermissionProfile != ":read-only" ||
		profile.PermissionProfile.WorkspaceMutation {
		return agent.Invocation{}, errors.New("side agent role profile must be read-only without workspace mutation")
	}
	return providerInvocation(profile)
}

func resolvedSideAgentProviderInvocation(
	requested agent.Invocation,
	resolved agent.ResolvedInvocation,
) (agent.Invocation, error) {
	if !sameProviderInvocation(requested, resolved.Requested) {
		return agent.Invocation{}, errors.New("provider changed the requested side agent invocation")
	}
	if resolved.Model == "" || resolved.ReasoningEffort == "" {
		return agent.Invocation{}, errors.New("provider returned incomplete side agent model settings")
	}
	if !requested.ModelSelectionProviderDefault && resolved.Model != requested.Model {
		return agent.Invocation{}, fmt.Errorf("exact side agent model resolved as %s, want %s", resolved.Model, requested.Model)
	}
	if resolved.ReasoningEffort != requested.ReasoningEffort {
		return agent.Invocation{}, fmt.Errorf(
			"side agent reasoning effort resolved as %s, want %s",
			resolved.ReasoningEffort,
			requested.ReasoningEffort,
		)
	}
	if (requested.ServiceTier != nil && !sameOptionalString(requested.ServiceTier, resolved.ServiceTier)) ||
		resolved.PermissionMode != requested.PermissionMode ||
		resolved.ApprovalMode != requested.ApprovalMode {
		return agent.Invocation{}, errors.New("provider changed side agent service tier or permission settings")
	}
	pinned := agent.Invocation{
		Model:           resolved.Model,
		ReasoningEffort: resolved.ReasoningEffort,
		ServiceTier:     cloneStringPointer(resolved.ServiceTier),
		PermissionMode:  resolved.PermissionMode,
		ApprovalMode:    resolved.ApprovalMode,
	}
	return pinned, pinned.Validate()
}

func sameProviderInvocation(left agent.Invocation, right agent.Invocation) bool {
	return left.ModelSelectionProviderDefault == right.ModelSelectionProviderDefault &&
		left.Model == right.Model &&
		left.ReasoningEffort == right.ReasoningEffort &&
		sameOptionalString(left.ServiceTier, right.ServiceTier) &&
		left.PermissionMode == right.PermissionMode &&
		left.ApprovalMode == right.ApprovalMode
}

func sameOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func (service *Service) persistPreparingSideConversation(
	ctx context.Context,
	workspaceID string,
	parentConversationID string,
	parentPaneID string,
	workspaceRoot string,
	profile RoleProfile,
	resolved agent.ResolvedInvocation,
	invocation agent.Invocation,
) (preparedSideConversation, error) {
	lock := service.conversationLock(parentConversationID)
	lock.Lock()
	defer lock.Unlock()
	snapshot, err := service.snapshotLocked(ctx, workspaceID, parentConversationID)
	if err != nil {
		return preparedSideConversation{}, err
	}
	if snapshot.ThreadBinding == nil || snapshot.ThreadBinding.Status != ThreadBindingStatusLinked {
		return preparedSideConversation{}, &CommandConflictError{
			ConversationID: parentConversationID,
			Reason:         "side conversation requires a linked parent agent thread",
		}
	}
	hasOpenSide, err := service.store.hasOpenSideConversationForPane(ctx, parentConversationID, parentPaneID)
	if err != nil {
		return preparedSideConversation{}, err
	}
	if hasOpenSide {
		return preparedSideConversation{}, &CommandConflictError{
			ConversationID: parentConversationID,
			Reason:         "originating pane already has an open side conversation",
		}
	}
	sideID, err := service.newID("side_conversation")
	if err != nil {
		return preparedSideConversation{}, err
	}
	invocationID, err := service.newID("side_invocation")
	if err != nil {
		return preparedSideConversation{}, err
	}
	now := service.timestamp()
	side := SideConversation{
		ID:                       sideID,
		ParentConversationID:     parentConversationID,
		ParentPaneID:             parentPaneID,
		SourceProviderTurnID:     latestProviderTurnID(snapshot.Turns.Turns),
		SourceTrajectorySequence: snapshot.Conversation.LastTrajectorySequence,
		Status:                   SideConversationStatusPreparing,
		ResolvedSideAgentInvocation: newSideAgentInvocation(
			invocationID,
			profile,
			resolved,
			now,
		),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := service.persistSideConversation(ctx, nil, side); err != nil {
		return preparedSideConversation{}, err
	}
	return preparedSideConversation{
		invocation:           invocation,
		parentThreadID:       snapshot.ThreadBinding.ThreadID,
		resolved:             resolved,
		side:                 side,
		workspaceRoot:        workspaceRoot,
		parentConversationID: parentConversationID,
	}, nil
}

func latestProviderTurnID(turns []ConversationTurn) *string {
	for index := len(turns) - 1; index >= 0; index-- {
		if turns[index].ProviderTurnID != nil {
			return cloneStringPointer(turns[index].ProviderTurnID)
		}
	}
	return nil
}

func newSideAgentInvocation(
	id string,
	profile RoleProfile,
	resolved agent.ResolvedInvocation,
	startedAt string,
) ResolvedInvocation {
	return ResolvedInvocation{
		ID:        id,
		Role:      RoleSideAgent,
		Provider:  ProviderCodex,
		Requested: profile,
		Resolved: ResolvedInvocationSettings{
			ModelID:           resolved.Model,
			ReasoningEffort:   ReasoningEffort(resolved.ReasoningEffort),
			ServiceTier:       cloneStringPointer(resolved.ServiceTier),
			PermissionProfile: profile.PermissionProfile,
		},
		ContextUsage:       InvocationContextUsage{},
		ProviderReferences: InvocationProviderReferences{},
		ModelReroutes:      []InvocationModelReroute{},
		StartedAt:          startedAt,
		Outcome:            InvocationOutcomeRunning,
	}
}

func (service *Service) activateSideConversation(
	ctx context.Context,
	prepared preparedSideConversation,
	thread agent.Thread,
) error {
	lock := service.conversationLock(prepared.parentConversationID)
	lock.Lock()
	defer lock.Unlock()
	active := prepared.side
	active.Status = SideConversationStatusActive
	active.UpdatedAt = advanceTimestamp(active.UpdatedAt, service.timestamp())
	active.ProviderThreadID = &thread.ID
	active.ResolvedSideAgentInvocation.ProviderReferences.ThreadID = &thread.ID
	expected := SideConversationExpectation{
		Status:    prepared.side.Status,
		UpdatedAt: prepared.side.UpdatedAt,
	}
	return service.persistSideConversation(ctx, &expected, active)
}

func (service *Service) failPreparingSideConversation(
	prepared preparedSideConversation,
	cause error,
) error {
	diagnosticID, idErr := service.newID("side_diagnostic")
	if idErr != nil {
		return errors.Join(cause, fmt.Errorf("create side diagnostic id: %w", idErr))
	}
	failed := prepared.side
	failed.Status = SideConversationStatusFailed
	failed.UpdatedAt = advanceTimestamp(failed.UpdatedAt, service.timestamp())
	failure := Failure{
		Code:                "side_thread_fork_failed",
		Message:             cause.Error(),
		Retryable:           true,
		DiagnosticReference: diagnosticID,
	}
	failed.Failure = &failure
	failed.ResolvedSideAgentInvocation = terminalInvocation(
		failed.ResolvedSideAgentInvocation,
		InvocationOutcomeFailed,
		failed.UpdatedAt,
		&failure,
	)
	expected := SideConversationExpectation{
		Status:    prepared.side.Status,
		UpdatedAt: prepared.side.UpdatedAt,
	}
	lock := service.conversationLock(prepared.parentConversationID)
	lock.Lock()
	persistErr := service.persistSideConversation(context.Background(), &expected, failed)
	lock.Unlock()
	if persistErr != nil {
		return errors.Join(cause, fmt.Errorf("persist failed side conversation: %w", persistErr))
	}
	return cause
}

func (service *Service) persistSideConversation(
	ctx context.Context,
	expected *SideConversationExpectation,
	side SideConversation,
) error {
	publication, err := service.publications(
		side.ParentConversationID,
		side.UpdatedAt,
		ConversationSideConversationUpdatedEventPayload{
			Type:             ConversationEventTypeSideConversationUpdated,
			SideConversation: side,
		},
	)
	if err != nil {
		return err
	}
	_, err = service.store.Transact(ctx, "persist side conversation", func(transaction *WriteTransaction) error {
		if expected == nil {
			if err := transaction.InsertSideConversation(side); err != nil {
				return err
			}
		} else if err := transaction.UpdateSideConversation(*expected, side); err != nil {
			return err
		}
		return appendPublications(transaction, publication)
	})
	return err
}

func validateSideForkThread(thread agent.Thread, parentThreadID string, modelID string) error {
	if err := thread.Validate(); err != nil {
		return fmt.Errorf("provider returned an invalid side fork thread: %w", err)
	}
	if !thread.Ephemeral {
		return errors.New("provider returned a durable thread for an ephemeral side conversation")
	}
	if thread.ID == parentThreadID {
		return errors.New("provider side fork reused the parent thread id")
	}
	if thread.ForkedFromID == nil || *thread.ForkedFromID != parentThreadID {
		return fmt.Errorf("provider side fork lineage does not match parent thread %s", parentThreadID)
	}
	if thread.Model != modelID {
		return fmt.Errorf("provider side fork model is %s, want resolved model %s", thread.Model, modelID)
	}
	return nil
}

func (service *Service) unsubscribeRejectedSideFork(threadID string, parentThreadID string) {
	if threadID == "" || threadID == parentThreadID {
		return
	}
	_ = service.agent.UnsubscribeThread(context.Background(), threadID)
}
