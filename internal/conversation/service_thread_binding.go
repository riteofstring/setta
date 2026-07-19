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
	if snapshot.ThreadBinding == nil {
		return service.startAndPersistAgentThreadBinding(ctx, snapshot, request)
	}
	if snapshot.ThreadBinding.Status != ThreadBindingStatusLinked {
		return AgentThreadBinding{}, &CommandConflictError{
			ConversationID: turn.ConversationID,
			Reason:         "agent thread is not linked",
		}
	}
	return service.resumeAndPersistAgentThreadBinding(ctx, snapshot, request)
}

func (service *Service) resumeParentAgentThreadForProviderOperationLocked(
	ctx context.Context,
	workspaceID string,
	workspaceRoot string,
	snapshot ConversationSnapshot,
) (AgentThreadBinding, error) {
	if snapshot.ThreadBinding == nil {
		return AgentThreadBinding{}, &CommandConflictError{
			ConversationID: snapshot.Conversation.ID,
			Reason:         "provider operation requires a linked parent agent thread",
		}
	}
	if snapshot.ThreadBinding.Status != ThreadBindingStatusLinked {
		return AgentThreadBinding{}, &CommandConflictError{
			ConversationID: snapshot.Conversation.ID,
			Reason:         "agent thread is not linked",
		}
	}
	invocation, err := service.resolveTopicAgentInvocation(ctx, workspaceID, snapshot.Conversation.ID)
	if err != nil {
		return AgentThreadBinding{}, err
	}
	request := service.agentThreadStartRequest(workspaceID, snapshot.Conversation.ID, workspaceRoot, invocation)
	request.RequireProviderResume = true
	return service.resumeAndPersistAgentThreadBinding(ctx, snapshot, request)
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
