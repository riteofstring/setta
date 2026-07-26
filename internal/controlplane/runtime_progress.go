package controlplane

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
)

type runtimeProgressQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func appendRuntimeProgress(
	ctx context.Context,
	tx *sql.Tx,
	operationID string,
	kind RuntimeProgressKind,
	state RuntimeProgressState,
	errorCode string,
	retryable bool,
	occurredAt string,
) error {
	if !validRuntimeProgressKind(kind) || !validRuntimeProgressState(state) {
		return errors.New("invalid runtime progress kind or state")
	}
	if errorCode != "" {
		if err := validateIdentifier("runtime progress error code", errorCode); err != nil {
			return err
		}
	}
	retryableValue := 0
	if retryable {
		retryableValue = 1
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO runtime_progress (
  operation_id, cursor, kind, state, error_code, retryable, occurred_at
)
SELECT ?, COALESCE(MAX(cursor), 0) + 1, ?, ?, ?, ?, ?
FROM runtime_progress
WHERE operation_id = ?
`, operationID, kind, state, errorCode, retryableValue, occurredAt, operationID); err != nil {
		return fmt.Errorf("append runtime progress: %w", err)
	}
	return nil
}

func (store *Store) RuntimeProgressAfter(
	ctx context.Context,
	operationID string,
	afterCursor string,
) ([]RuntimeProgress, <-chan struct{}, error) {
	if err := validateIdentifier("runtime operation id", operationID); err != nil {
		return nil, nil, err
	}
	cursor, err := parseRuntimeProgressCursor(afterCursor)
	if err != nil {
		return nil, nil, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	events, err := readRuntimeProgressAfter(ctx, store.db, operationID, cursor)
	if err != nil {
		return nil, nil, err
	}
	return events, store.runtimeUpdateLocked(operationID), nil
}

func readRuntimeProgressAfter(
	ctx context.Context,
	querier runtimeProgressQuerier,
	operationID string,
	afterCursor int,
) ([]RuntimeProgress, error) {
	rows, err := querier.QueryContext(ctx, `
SELECT operation_id, cursor, kind, state, error_code, retryable, occurred_at
FROM runtime_progress
WHERE operation_id = ? AND cursor > ?
ORDER BY cursor
`, operationID, afterCursor)
	if err != nil {
		return nil, fmt.Errorf("read runtime progress events: %w", err)
	}
	defer rows.Close()
	var events []RuntimeProgress
	for rows.Next() {
		var event RuntimeProgress
		var cursor int
		var retryable int
		if err := rows.Scan(
			&event.OperationID,
			&cursor,
			&event.Kind,
			&event.State,
			&event.ErrorCode,
			&retryable,
			&event.OccurredAt,
		); err != nil {
			return nil, fmt.Errorf("scan runtime progress event: %w", err)
		}
		event.Cursor = strconv.Itoa(cursor)
		event.Retryable = retryable == 1
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate runtime progress events: %w", err)
	}
	if len(events) == 0 {
		if err := validateRuntimeProgressCursor(ctx, querier, operationID, afterCursor); err != nil {
			return nil, err
		}
	}
	return events, nil
}

func parseRuntimeProgressCursor(raw string) (int, error) {
	if raw == "" {
		return 0, nil
	}
	cursor, err := strconv.Atoi(raw)
	if err != nil || cursor < 0 {
		return 0, errors.New("runtime progress cursor must be a non-negative integer")
	}
	return cursor, nil
}

func validateRuntimeProgressCursor(
	ctx context.Context,
	querier runtimeProgressQuerier,
	operationID string,
	afterCursor int,
) error {
	var count int
	var latestCursor int
	if err := querier.QueryRowContext(ctx, `
SELECT COUNT(DISTINCT operation_id), COALESCE(MAX(cursor), 0)
FROM runtime_progress
WHERE operation_id = ?
`, operationID).Scan(&count, &latestCursor); err != nil {
		return fmt.Errorf("validate runtime progress operation: %w", err)
	}
	if count != 1 {
		return ErrNotFound
	}
	if afterCursor > latestCursor {
		return errors.New("runtime progress cursor is ahead of durable progress")
	}
	return nil
}

func (store *Store) runtimeUpdateLocked(operationID string) <-chan struct{} {
	update := store.runtimeUpdates[operationID]
	if update == nil {
		update = make(chan struct{})
		store.runtimeUpdates[operationID] = update
	}
	return update
}

func (store *Store) notifyRuntimeProgressLocked(operationID string) {
	update := store.runtimeUpdates[operationID]
	if update == nil {
		return
	}
	close(update)
	delete(store.runtimeUpdates, operationID)
}

func (store *Store) runtimeProgressCursorTerminal(
	ctx context.Context,
	operationID string,
	rawCursor string,
) (bool, error) {
	cursor, err := parseRuntimeProgressCursor(rawCursor)
	if err != nil {
		return false, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	var state RuntimeProgressState
	err = store.db.QueryRowContext(ctx, `
SELECT state
FROM runtime_progress
WHERE operation_id = ? AND cursor = ?
`, operationID, cursor).Scan(&state)
	if errors.Is(err, sql.ErrNoRows) {
		return false, ErrNotFound
	}
	if err != nil {
		return false, fmt.Errorf("read runtime progress cursor state: %w", err)
	}
	return runtimeProgressTerminal(state), nil
}

func runtimeProgressTerminal(state RuntimeProgressState) bool {
	switch state {
	case RuntimeProgressProvisioned,
		RuntimeProgressHealthy,
		RuntimeProgressDeleted,
		RuntimeProgressFailed,
		RuntimeProgressCanceled:
		return true
	default:
		return false
	}
}

func validRuntimeProgressKind(kind RuntimeProgressKind) bool {
	switch kind {
	case RuntimeProgressEnsureRuntime, RuntimeProgressWakeRuntime, RuntimeProgressDeleteRuntime:
		return true
	default:
		return false
	}
}

func validRuntimeProgressState(state RuntimeProgressState) bool {
	switch state {
	case RuntimeProgressQueued,
		RuntimeProgressReconciling,
		RuntimeProgressRetrying,
		RuntimeProgressProvisioned,
		RuntimeProgressWakeRequested,
		RuntimeProgressHealthy,
		RuntimeProgressDeletionScheduled,
		RuntimeProgressDeleted,
		RuntimeProgressFailed,
		RuntimeProgressCanceled:
		return true
	default:
		return false
	}
}
