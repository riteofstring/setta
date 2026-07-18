package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// CompleteConversationRouteCommand acknowledges that the exact command stored
// with a route decision has reached its durable effect. The operation is
// idempotent so a replay that succeeds immediately before shutdown can safely
// acknowledge the same decision after restart.
func (store *Store) CompleteConversationRouteCommand(
	ctx context.Context,
	decisionID string,
	completedAt string,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("conversation route command completion context is required")
	}
	if err := validateConversationRouteDecisionID(decisionID); err != nil {
		return err
	}
	completedTime, err := validateTimestamp("conversation route command completedAt", completedAt)
	if err != nil {
		return err
	}

	err = store.write(ctx, "complete conversation route command", func(ctx context.Context, tx *sql.Tx) error {
		return completeConversationRouteCommandTransaction(
			ctx,
			tx,
			store.dbPath,
			decisionID,
			completedAt,
			completedTime,
		)
	})
	if err == nil {
		store.notifyCommittedEvents()
	}
	return err
}

func completeConversationRouteCommandTransaction(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	decisionID string,
	completedAt string,
	completedTime time.Time,
) error {
	record, found, err := readConversationRouteDecisionID(ctx, tx, decisionID, dbPath)
	if err != nil {
		return err
	}
	if !found {
		return stateConflict("conversation route decision", decisionID, "decision was not found")
	}
	decidedTime, err := validateTimestamp("conversation route decision decidedAt", record.DecidedAt)
	if err != nil {
		return &CorruptStateError{Path: dbPath, Err: err}
	}
	if completedTime.Before(decidedTime) {
		return errors.New("conversation route command cannot complete before its decision")
	}

	found, err = readConversationRouteCommandCompletion(ctx, tx, dbPath, decisionID)
	if err != nil || found {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO conversation_route_command_completions(decision_id, completed_at)
VALUES (?, ?)
`, decisionID, completedAt); err != nil {
		return fmt.Errorf("complete conversation route command %s: %w", decisionID, err)
	}
	return nil
}

func readConversationRouteCommandCompletion(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	decisionID string,
) (bool, error) {
	var completedAt string
	err := tx.QueryRowContext(ctx, `
SELECT completed_at
FROM conversation_route_command_completions
WHERE decision_id = ?
`, decisionID).Scan(&completedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read conversation route command completion %s: %w", decisionID, err)
	}
	if _, err := validateTimestamp("conversation route command stored completedAt", completedAt); err != nil {
		return false, &CorruptStateError{Path: dbPath, Err: err}
	}
	return true, nil
}
