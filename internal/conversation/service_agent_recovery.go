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
// is committed directly. Provider lookup failures and turns without a durable
// provider identity become explicit retryable failures. Finally, durable queue
// heads are promoted in case the prior process stopped after a terminal commit
// but before its in-process promotion signal.
func (service *Service) RecoverAgentTurns(ctx context.Context) error {
	if service == nil || service.store == nil || service.agent == nil {
		return errors.New("conversation service is required")
	}
	if ctx == nil {
		return errors.New("agent recovery context is required")
	}
	if err := service.recoverLinkedAgentTurns(ctx); err != nil {
		return err
	}
	if err := service.recoverUnlinkedAgentTurns(ctx); err != nil {
		return err
	}
	return service.recoverAgentQueues(ctx)
}

func (service *Service) recoverLinkedAgentTurns(ctx context.Context) error {
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

func (service *Service) recoverUnlinkedAgentTurns(ctx context.Context) error {
	unlinked, err := service.store.listUnlinkedAgentTurnRecoveryTargets(ctx)
	if err != nil {
		return err
	}
	var persistenceErrors []error
	for _, target := range unlinked {
		active := &activeConversationTurn{
			conversationID: target.ConversationID,
			turnID:         target.TurnID,
			workspaceID:    target.WorkspaceID,
		}
		cause := errors.New("agent turn provider identity was not committed before restart; input was not replayed")
		if err := service.persistAgentRecoveryFailure(ctx, active, cause); err != nil {
			persistenceErrors = append(persistenceErrors, err)
		}
	}
	return errors.Join(persistenceErrors...)
}

func (service *Service) recoverAgentQueues(ctx context.Context) error {
	queued, err := service.store.listAgentQueueRecoveryTargets(ctx)
	if err != nil {
		return err
	}
	var persistenceErrors []error
	for _, target := range queued {
		if err := service.promoteNextTurnWithResult(ctx, target.WorkspaceID, target.ConversationID); err != nil {
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
		return service.persistAgentRecoveryFailure(
			ctx,
			recoveredActiveConversationTurn(target),
			fmt.Errorf("reconcile provider turn after restart: %w", reconcileErr),
		)
	}
	if result.ProviderThreadID != target.ProviderThreadID || result.ProviderTurnID != target.ProviderTurnID {
		return service.persistAgentRecoveryFailure(
			ctx,
			recoveredActiveConversationTurn(target),
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
				ctx,
				recoveredActiveConversationTurn(target),
				fmt.Errorf("interrupt active provider turn after restart: %w", err),
			)
		}
		result.Outcome = agent.TurnOutcomeInterrupted
		result.Error = nil
	}
	if err := validateRecoveredAgentResult(result); err != nil {
		return service.persistAgentRecoveryFailure(ctx, recoveredActiveConversationTurn(target), err)
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
			Usage:   result.Usage,
		},
	}
	if err := event.Validate(); err != nil {
		return service.persistAgentRecoveryFailure(
			ctx,
			recoveredActiveConversationTurn(target),
			fmt.Errorf("validate reconciled provider turn: %w", err),
		)
	}
	if err := service.persistRecoveredAgentTerminal(ctx, target.ConversationID, recovered, event); err != nil {
		return fmt.Errorf("persist reconciled agent turn %s: %w", target.TurnID, err)
	}
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
	ctx context.Context,
	active *activeConversationTurn,
	cause error,
) error {
	lock := service.conversationLock(active.conversationID)
	lock.Lock()
	persistErr := service.persistUnexpectedTurnEnd(
		ctx,
		active,
		cause,
	)
	lock.Unlock()
	if persistErr != nil {
		return errors.Join(cause, fmt.Errorf("persist agent recovery failure: %w", persistErr))
	}
	return nil
}
