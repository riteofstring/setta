package conversation

import (
	"context"
	"fmt"

	"setta/internal/agent"
)

func (service *Service) Recover(ctx context.Context) error {
	var cursor *string
	for {
		page, err := service.store.ListConversations(ctx, "", cursor, 200)
		if err != nil {
			return err
		}
		for _, conversation := range page.Conversations {
			if err := service.recoverConversation(ctx, conversation); err != nil {
				return err
			}
		}
		if page.NextCursor == nil {
			return nil
		}
		cursor = page.NextCursor
	}
}

func (service *Service) recoverConversation(ctx context.Context, conversation TopicConversation) error {
	actor := service.actor(conversation.ID)
	actor.mu.Lock()
	defer actor.mu.Unlock()
	snapshot, err := service.ReadSnapshot(ctx, conversation.WorkspaceID, conversation.ID)
	if err != nil {
		return err
	}
	if err := service.recoverSideConversations(ctx, snapshot); err != nil {
		return err
	}
	turn := runningTurn(snapshot)
	if turn == nil {
		return nil
	}
	if snapshot.ThreadBinding == nil {
		return fmt.Errorf("running conversation %s has no provider thread binding", conversation.ID)
	}
	actor.active = true
	if turn.ProviderTurnID == nil {
		resolved, err := service.agent.ResolveInvocation(ctx, AgentInvocation(turn.RequestedRoleProfile))
		if err != nil {
			actor.active = false
			if persistErr := service.persistReconciliationFailure(ctx, snapshot, *turn, err); persistErr != nil {
				return persistErr
			}
			return service.promoteQueuedTurn(ctx, actor, conversation.WorkspaceID, conversation.ID)
		}
		actor.resolved[turn.ID] = resolved
		go service.executeTurn(conversation.WorkspaceID, turn.ID)
		return nil
	}
	result, active, err := service.agent.ReconcileTurn(ctx, snapshot.ThreadBinding.ThreadID, *turn.ProviderTurnID)
	if err != nil {
		actor.active = false
		if persistErr := service.persistReconciliationFailure(ctx, snapshot, *turn, err); persistErr != nil {
			return persistErr
		}
		return service.promoteQueuedTurn(ctx, actor, conversation.WorkspaceID, conversation.ID)
	}
	if !active {
		actor.active = false
		if err := service.persistTerminalEvent(ctx, snapshot, *turn, result); err != nil {
			return err
		}
		return service.promoteQueuedTurn(ctx, actor, conversation.WorkspaceID, conversation.ID)
	}
	go service.observeRecoveredTurn(conversation.WorkspaceID, snapshot.ThreadBinding.ThreadID, *turn)
	return nil
}

func (service *Service) observeRecoveredTurn(workspaceID string, providerThreadID string, turn ConversationTurn) {
	result, err := service.agent.ObserveTurn(context.Background(), agent.ObserveTurnRequest{
		ConversationID: turn.ConversationID, TurnID: turn.ID,
		ProviderThreadID: providerThreadID, ProviderTurnID: *turn.ProviderTurnID,
	}, &conversationAgentSink{service: service})
	if err == nil && result.Outcome == "" {
		err = fmt.Errorf("observed provider turn returned no outcome")
	}
	service.finishRuntimeTurn(workspaceID, turn.ConversationID, turn.ID, err)
}

func (service *Service) persistReconciliationFailure(ctx context.Context, snapshot ConversationSnapshot, turn ConversationTurn, reconcileErr error) error {
	message := reconcileErr.Error()
	result := agent.TurnResult{
		ProviderThreadID: snapshot.ThreadBinding.ThreadID,
		ProviderTurnID:   valueOrEmpty(turn.ProviderTurnID),
		Outcome:          agent.TurnOutcomeFailed,
		Error:            &message,
	}
	mutation, err := terminalMutation(service, snapshot, turn, result)
	if err != nil {
		return err
	}
	if snapshot.ThreadBinding != nil {
		binding := *snapshot.ThreadBinding
		binding.Status = ThreadBindingStatusUnavailable
		mutation.binding = &binding
	}
	return service.persistAgentMutation(ctx, snapshot, mutation)
}

func (service *Service) recoverSideConversations(ctx context.Context, snapshot ConversationSnapshot) error {
	for _, side := range snapshot.SideConversations {
		switch side.Status {
		case SideConversationStatusPreparing:
			failed := side
			failed.Status = SideConversationStatusFailed
			failed.UpdatedAt = timestampAfter(side.UpdatedAt, service.timestamp())
			failure := providerFailure("side_setup_interrupted", "Application restarted while the side conversation was preparing", side.ID)
			failed.Failure = &failure
			failed.ResolvedSideAgentInvocation.EndedAt = &failed.UpdatedAt
			failed.ResolvedSideAgentInvocation.Outcome = InvocationOutcomeFailed
			failed.ResolvedSideAgentInvocation.Failure = &failure
			if err := service.persistSideUpdate(ctx, snapshot.Conversation, side, failed); err != nil {
				return err
			}
		case SideConversationStatusActive, SideConversationStatusDisposing:
			if side.ProviderThreadID != nil {
				if err := service.agent.UnsubscribeThread(ctx, *side.ProviderThreadID); err != nil {
					return err
				}
			}
			disposed := side
			disposed.Status = SideConversationStatusDisposing
			disposed.UpdatedAt = timestampAfter(side.UpdatedAt, service.timestamp())
			disposed.DisposedAt = &disposed.UpdatedAt
			if err := service.persistSideUpdate(ctx, snapshot.Conversation, side, disposed); err != nil {
				return err
			}
		}
	}
	return nil
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
