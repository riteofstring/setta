package narration

import (
	"context"
	"errors"
)

// RecoverTerminalProjections re-admits interrupted live terminal narrator work
// that was durably marked running before a restart. It does not backfill old
// completed turns that merely lack narration.
func (service *Service) RecoverTerminalProjections(ctx context.Context) error {
	if service == nil || service.store == nil {
		return errors.New("narrator service is required")
	}
	if ctx == nil {
		return errors.New("narrator terminal recovery context is required")
	}
	targets, err := service.store.ListNarratorTerminalRecoveryTargets(ctx)
	if err != nil {
		return err
	}
	for _, target := range targets {
		if err := target.Validate(); err != nil {
			return err
		}
		service.enqueueTerminalProjection(target.ConversationID, ProjectionOperation{
			WorkspaceID:     target.WorkspaceID,
			TurnID:          target.TurnID,
			ThroughSequence: target.TerminalSequence,
		})
	}
	return nil
}
