package conversation

import (
	"context"
	"errors"
)

// RecoverAgentTurns settles the work the previous Setta process was running.
//
// The carrier that work ran on was ephemeral, so it died with that process.
// There is no provider thread to resume and no provider turn to reconcile: the
// honest record is that Setta interrupted the run, not that it failed or that
// its result is still arriving. Queued work is untouched and promoted, so the
// user's next accepted input starts on a fresh carrier instead of waiting on a
// run nothing can finish.
func (service *Service) RecoverAgentTurns(ctx context.Context) error {
	if service == nil || service.store == nil || service.agent == nil {
		return errors.New("conversation service is required")
	}
	if ctx == nil {
		return errors.New("agent recovery context is required")
	}
	if err := service.interruptRestartedAgentTurns(ctx); err != nil {
		return err
	}
	return service.recoverAgentQueues(ctx)
}

func (service *Service) interruptRestartedAgentTurns(ctx context.Context) error {
	targets, err := service.store.listRestartedAgentTurns(ctx)
	if err != nil {
		return err
	}
	var persistenceErrors []error
	for _, target := range targets {
		if err := service.interruptRestartedAgentTurn(ctx, target); err != nil {
			persistenceErrors = append(persistenceErrors, err)
		}
	}
	return errors.Join(persistenceErrors...)
}

func (service *Service) interruptRestartedAgentTurn(
	ctx context.Context,
	target restartedAgentTurn,
) error {
	active := &activeConversationTurn{
		conversationID:     target.ConversationID,
		interruptionReason: TurnInterruptionRuntimeRestarted,
		turnID:             target.TurnID,
		scope:              conversationExecutionScope{workspaceID: target.WorkspaceID},
	}
	lock := service.conversationLock(target.ConversationID)
	lock.Lock()
	defer lock.Unlock()
	return service.persistUnexpectedTurnEnd(ctx, active, errRuntimeRestarted)
}

// errRuntimeRestarted is the cause an interrupted-by-restart turn is settled
// with. It never reaches the user: the interruption reason is what the product
// shows, and this only keeps the terminal commit honest about why it ran.
var errRuntimeRestarted = errors.New("setta restarted while this turn was running")

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
