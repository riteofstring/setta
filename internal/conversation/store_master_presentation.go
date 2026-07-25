package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"setta/internal/master"
)

func (store *Store) ResolveMasterPresentationIntent(
	ctx context.Context,
	request master.PresentationResolutionRequest,
	resolvedAt string,
) (master.PresentationResolution, error) {
	if store == nil {
		return master.PresentationResolution{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return master.PresentationResolution{}, errors.New("master presentation resolution context is required")
	}
	if err := request.Validate(); err != nil {
		return master.PresentationResolution{}, err
	}
	resolvedTime, err := validateTimestamp("master presentation resolvedAt", resolvedAt)
	if err != nil {
		return master.PresentationResolution{}, err
	}
	var resolution master.PresentationResolution
	err = store.write(ctx, "resolve master presentation intent", func(ctx context.Context, tx *sql.Tx) error {
		var resolveErr error
		resolution, resolveErr = resolveMasterPresentationIntentTransaction(
			ctx,
			tx,
			store.dbPath,
			request,
			resolvedAt,
			resolvedTime,
		)
		return resolveErr
	})
	if err == nil {
		store.notifyCommittedEvents()
	}
	return resolution, err
}

type masterPresentationResolutionContext struct {
	decisionID string
	decidedAt  string
	existing   master.PresentationResolution
	found      bool
	intent     master.PresentationIntent
	target     master.ConversationPresentationTarget
}

func resolveMasterPresentationIntentTransaction(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	request master.PresentationResolutionRequest,
	resolvedAt string,
	resolvedTime time.Time,
) (master.PresentationResolution, error) {
	resolutionContext, err := readMasterPresentationResolutionContext(ctx, tx, dbPath, request)
	if err != nil {
		return master.PresentationResolution{}, err
	}
	if resolutionContext.found {
		return matchingMasterPresentationResolution(request, resolutionContext.existing)
	}
	if err := requireNewMasterPresentationResolution(
		ctx,
		tx,
		dbPath,
		request,
		resolutionContext,
		resolvedTime,
	); err != nil {
		return master.PresentationResolution{}, err
	}
	resolution := master.PresentationResolution{
		IntentID:   request.IntentID,
		InputID:    request.InputID,
		PaneID:     request.PaneID,
		ResolvedAt: resolvedAt,
	}
	return resolution, insertMasterPresentationResolution(
		ctx,
		tx,
		resolutionContext.decisionID,
		resolution,
	)
}

func readMasterPresentationResolutionContext(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	request master.PresentationResolutionRequest,
) (masterPresentationResolutionContext, error) {
	state, err := readMasterInputRoutingStateTransaction(ctx, tx, request.InputID, dbPath)
	if err != nil {
		return masterPresentationResolutionContext{}, err
	}
	if state.Decision == nil {
		return masterPresentationResolutionContext{}, stateConflict("master presentation intent", request.IntentID, "route decision is not available")
	}
	intent, err := master.PresentationIntentForCommand(state.Input.Input, state.Decision.ResultingCommand)
	if err != nil {
		return masterPresentationResolutionContext{}, &CorruptStateError{Path: dbPath, Err: err}
	}
	if intent.ID != request.IntentID {
		return masterPresentationResolutionContext{}, stateConflict("master presentation intent", request.IntentID, "intent does not match its route decision")
	}
	target, err := intent.NavigationTarget()
	if err != nil {
		return masterPresentationResolutionContext{}, err
	}
	existing, found, err := readMasterPresentationResolution(ctx, tx, dbPath, state.Decision.ID, request.InputID)
	return masterPresentationResolutionContext{
		decisionID: state.Decision.ID,
		decidedAt:  state.Decision.DecidedAt,
		existing:   existing,
		found:      found,
		intent:     intent,
		target:     target,
	}, err
}

func matchingMasterPresentationResolution(
	request master.PresentationResolutionRequest,
	existing master.PresentationResolution,
) (master.PresentationResolution, error) {
	if existing.IntentID != request.IntentID || existing.PaneID != request.PaneID {
		return master.PresentationResolution{}, stateConflict("master presentation intent", request.IntentID, "intent was already resolved to another pane")
	}
	return existing, nil
}

func requireNewMasterPresentationResolution(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	request master.PresentationResolutionRequest,
	resolutionContext masterPresentationResolutionContext,
	resolvedTime time.Time,
) error {
	if resolutionContext.intent.Kind != master.PresentationIntentKindOpenSideConversation {
		completed, err := readMasterRouteCommandCompletion(ctx, tx, dbPath, resolutionContext.decisionID)
		if err != nil {
			return err
		}
		if !completed {
			return stateConflict("master presentation intent", request.IntentID, "route command has not completed")
		}
	}
	bound, err := masterPresentationPaneIsBound(ctx, tx, request.PaneID, resolutionContext.target)
	if err != nil {
		return err
	}
	if !bound {
		return stateConflict("master presentation intent", request.IntentID, "resolved pane is not bound to the target conversation")
	}
	decidedTime, _ := time.Parse(time.RFC3339Nano, resolutionContext.decidedAt)
	if resolvedTime.Before(decidedTime) {
		return errors.New("master presentation cannot resolve before its route decision")
	}
	return nil
}

func insertMasterPresentationResolution(
	ctx context.Context,
	tx *sql.Tx,
	decisionID string,
	resolution master.PresentationResolution,
) error {
	if _, err := tx.ExecContext(ctx, `
INSERT INTO master_presentation_resolutions(decision_id, intent_id, pane_id, resolved_at)
VALUES (?, ?, ?, ?)
`, decisionID, resolution.IntentID, resolution.PaneID, resolution.ResolvedAt); err != nil {
		return fmt.Errorf("resolve master presentation intent %s: %w", resolution.IntentID, err)
	}
	return nil
}

func masterPresentationPaneIsBound(
	ctx context.Context,
	reader routeCommandEffectReader,
	paneID string,
	target master.ConversationPresentationTarget,
) (bool, error) {
	var value int
	if err := reader.QueryRowContext(ctx, `
SELECT EXISTS(
  SELECT 1
  FROM pane_bindings
  WHERE pane_id = ? AND workspace_id = ? AND conversation_id = ?
)
`, paneID, target.WorkspaceID, target.ConversationID).Scan(&value); err != nil {
		return false, err
	}
	return value == 1, nil
}

func readMasterPresentationResolution(
	ctx context.Context,
	reader routeCommandEffectReader,
	dbPath string,
	decisionID string,
	inputID string,
) (master.PresentationResolution, bool, error) {
	resolution := master.PresentationResolution{InputID: inputID}
	err := reader.QueryRowContext(ctx, `
SELECT intent_id, pane_id, resolved_at
FROM master_presentation_resolutions
WHERE decision_id = ?
`, decisionID).Scan(&resolution.IntentID, &resolution.PaneID, &resolution.ResolvedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return master.PresentationResolution{}, false, nil
	}
	if err != nil {
		return master.PresentationResolution{}, false, err
	}
	if err := resolution.Validate(); err != nil {
		return master.PresentationResolution{}, false, &CorruptStateError{Path: dbPath, Err: err}
	}
	return resolution, true, nil
}
