package conversation

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/agent"
)

// RecoverAgentTurns reconciles primary turns that survived the previous Setta
// process. A still-active provider turn is interrupted because the old event
// subscription and approval handles no longer exist; terminal provider state
// is committed directly. Provider lookup failures become explicit retryable
// turn failures instead of leaving an unowned working projection behind.
func (service *Service) RecoverAgentTurns(ctx context.Context) error {
	if service == nil || service.store == nil || service.agent == nil {
		return errors.New("conversation service is required")
	}
	if ctx == nil {
		return errors.New("agent recovery context is required")
	}
	targets, err := service.store.ListAgentTurnRecoveryTargets(ctx)
	if err != nil {
		return err
	}
	var persistenceErrors []error
	for _, target := range targets {
		if err := service.recoverAgentTurn(ctx, target); err != nil {
			persistenceErrors = append(persistenceErrors, err)
		}
	}
	return errors.Join(persistenceErrors...)
}

func (service *Service) recoverAgentTurn(
	ctx context.Context,
	target AgentTurnRecoveryTarget,
) error {
	result, active, reconcileErr := service.agent.ReconcileTurn(
		ctx,
		target.ProviderThreadID,
		target.ProviderTurnID,
	)
	if reconcileErr != nil {
		return service.persistAgentRecoveryFailure(target, fmt.Errorf("reconcile provider turn after restart: %w", reconcileErr))
	}
	if result.ProviderThreadID != target.ProviderThreadID || result.ProviderTurnID != target.ProviderTurnID {
		return service.persistAgentRecoveryFailure(
			target,
			fmt.Errorf(
				"reconciled provider turn changed from %s/%s to %s/%s",
				target.ProviderThreadID,
				target.ProviderTurnID,
				result.ProviderThreadID,
				result.ProviderTurnID,
			),
		)
	}
	if active {
		if err := service.agent.InterruptProviderTurn(ctx, target.ProviderThreadID, target.ProviderTurnID); err != nil {
			return service.persistAgentRecoveryFailure(
				target,
				fmt.Errorf("interrupt active provider turn after restart: %w", err),
			)
		}
		result.Outcome = agent.TurnOutcomeInterrupted
		result.Error = nil
	}
	if err := validateRecoveredAgentResult(result); err != nil {
		return service.persistAgentRecoveryFailure(target, err)
	}
	recovered := recoveredActiveConversationTurn(target)
	event := agent.Event{
		Kind:             agent.EventKindTurnTerminal,
		ConversationID:   target.ConversationID,
		TurnID:           target.TurnID,
		ProviderThreadID: target.ProviderThreadID,
		ProviderTurnID:   target.ProviderTurnID,
		Terminal: &agent.TerminalEvent{
			Outcome: result.Outcome,
			Error:   result.Error,
		},
	}
	if err := event.Validate(); err != nil {
		return service.persistAgentRecoveryFailure(target, fmt.Errorf("validate reconciled provider turn: %w", err))
	}
	if err := service.persistRecoveredAgentTerminal(ctx, target.ConversationID, recovered, event); err != nil {
		return fmt.Errorf("persist reconciled agent turn %s: %w", target.TurnID, err)
	}
	service.promoteNextTurn(target.WorkspaceID, target.ConversationID)
	return nil
}

func (service *Service) persistRecoveredAgentTerminal(
	ctx context.Context,
	conversationID string,
	active *activeConversationTurn,
	event agent.Event,
) error {
	lock := service.conversationLock(conversationID)
	lock.Lock()
	defer lock.Unlock()
	return service.persistTurnTerminal(ctx, active, event)
}

func validateRecoveredAgentResult(result agent.TurnResult) error {
	switch result.Outcome {
	case agent.TurnOutcomeCompleted, agent.TurnOutcomeInterrupted:
		if result.Error != nil {
			return errors.New("reconciled completed or interrupted provider turn contains an error")
		}
	case agent.TurnOutcomeFailed:
		if result.Error == nil || *result.Error == "" {
			return errors.New("reconciled failed provider turn is missing an error")
		}
	default:
		return fmt.Errorf("reconciled provider turn has unsupported outcome %q", result.Outcome)
	}
	return nil
}

func recoveredActiveConversationTurn(target AgentTurnRecoveryTarget) *activeConversationTurn {
	return &activeConversationTurn{
		conversationID:     target.ConversationID,
		interruptionReason: TurnInterruptionReconciliation,
		providerThreadID:   target.ProviderThreadID,
		providerTurnID:     target.ProviderTurnID,
		turnID:             target.TurnID,
		workspaceID:        target.WorkspaceID,
	}
}

func (service *Service) persistAgentRecoveryFailure(
	target AgentTurnRecoveryTarget,
	cause error,
) error {
	lock := service.conversationLock(target.ConversationID)
	lock.Lock()
	persistErr := service.persistUnexpectedTurnEnd(
		context.Background(),
		recoveredActiveConversationTurn(target),
		cause,
	)
	lock.Unlock()
	if persistErr != nil {
		return errors.Join(cause, fmt.Errorf("persist agent recovery failure: %w", persistErr))
	}
	service.promoteNextTurn(target.WorkspaceID, target.ConversationID)
	return nil
}
