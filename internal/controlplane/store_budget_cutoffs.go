package controlplane

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"setta/internal/runtimeprovider"
)

type ClaimedBudgetCutoffOperation struct {
	RuntimeOperation
	Identity   runtimeprovider.ManagedIdentity
	DeadlineAt time.Time
}

func (store *Store) BudgetCutoffOperation(
	ctx context.Context,
	idempotencyKey string,
) (RuntimeOperation, error) {
	if err := validateIdentifier("budget cutoff operation id", idempotencyKey); err != nil {
		return RuntimeOperation{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return readBudgetCutoffOperation(ctx, store.db, idempotencyKey)
}

func (store *Store) ClaimBudgetCutoffOperation(
	ctx context.Context,
	workerID string,
	leaseDuration time.Duration,
) (ClaimedBudgetCutoffOperation, bool, error) {
	if err := validateIdentifier("reconciler worker id", workerID); err != nil {
		return ClaimedBudgetCutoffOperation{}, false, err
	}
	if leaseDuration <= 0 {
		return ClaimedBudgetCutoffOperation{}, false, errors.New("budget cutoff lease duration must be positive")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.claimBudgetCutoffOperationLocked(ctx, workerID, leaseDuration)
}

func (store *Store) claimBudgetCutoffOperationLocked(
	ctx context.Context,
	workerID string,
	leaseDuration time.Duration,
) (ClaimedBudgetCutoffOperation, bool, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return ClaimedBudgetCutoffOperation{}, false, fmt.Errorf("begin budget cutoff claim: %w", err)
	}
	defer rollback(tx)
	now := store.clock().UTC()
	var operationID string
	err = tx.QueryRowContext(ctx, `
SELECT o.idempotency_key
FROM budget_cutoff_operations o
JOIN user_budget_policies b ON b.user_id = o.user_id AND b.period_start = o.period_start
JOIN users u ON u.id = o.user_id
JOIN runtimes r ON r.name = o.runtime_name AND r.user_id = o.user_id
WHERE b.cutoff_required_at IS NOT NULL AND u.status = ? AND r.access_state = ? AND (
  (o.status IN (?, ?) AND o.next_attempt_at <= ?) OR
  (o.status = ? AND o.lease_expires_at <= ?)
)
ORDER BY o.next_attempt_at, o.created_at, o.idempotency_key
LIMIT 1
`, UserStatusSuspended, RuntimeAccessSuspended,
		RuntimeOperationPending, RuntimeOperationRetryWait, timestamp(now),
		RuntimeOperationRunning, timestamp(now)).Scan(&operationID)
	if errors.Is(err, sql.ErrNoRows) {
		return ClaimedBudgetCutoffOperation{}, false, nil
	}
	if err != nil {
		return ClaimedBudgetCutoffOperation{}, false, fmt.Errorf("select budget cutoff: %w", err)
	}
	result, err := tx.ExecContext(ctx, `
UPDATE budget_cutoff_operations
SET status = ?, attempt_count = attempt_count + 1, fence_token = fence_token + 1,
    lease_owner = ?, lease_expires_at = ?, updated_at = ?
WHERE idempotency_key = ?
`, RuntimeOperationRunning, workerID, timestamp(now.Add(leaseDuration)), timestamp(now), operationID)
	if err != nil {
		return ClaimedBudgetCutoffOperation{}, false, fmt.Errorf("claim budget cutoff: %w", err)
	}
	if err := requireOneRow(result, "claim budget cutoff"); err != nil {
		return ClaimedBudgetCutoffOperation{}, false, err
	}
	operation, err := readBudgetCutoffOperation(ctx, tx, operationID)
	if err != nil {
		return ClaimedBudgetCutoffOperation{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return ClaimedBudgetCutoffOperation{}, false, fmt.Errorf("commit budget cutoff claim: %w", err)
	}
	identity, err := runtimeprovider.ManagedIdentityFromName(operation.RuntimeName)
	if err != nil {
		return ClaimedBudgetCutoffOperation{}, false, err
	}
	deadlineAt, err := readBudgetCutoffDeadline(ctx, store.db, operation)
	if err != nil {
		return ClaimedBudgetCutoffOperation{}, false, err
	}
	return ClaimedBudgetCutoffOperation{
		RuntimeOperation: operation,
		Identity:         identity,
		DeadlineAt:       deadlineAt,
	}, true, nil
}

func readBudgetCutoffDeadline(
	ctx context.Context,
	querier runtimeOperationQuerier,
	operation RuntimeOperation,
) (time.Time, error) {
	var cutoffRequiredAt string
	var maximumCutoffLag time.Duration
	err := querier.QueryRowContext(ctx, `
SELECT cutoff_required_at, maximum_cutoff_lag_ns
FROM user_budget_policies b
JOIN budget_cutoff_operations o
  ON o.user_id = b.user_id AND o.period_start = b.period_start
WHERE o.idempotency_key = ? AND b.cutoff_required_at IS NOT NULL
`, operation.IdempotencyKey).Scan(&cutoffRequiredAt, &maximumCutoffLag)
	if err != nil {
		return time.Time{}, fmt.Errorf("read budget cutoff deadline: %w", err)
	}
	startedAt, err := parseStoredTime(cutoffRequiredAt)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse budget cutoff deadline: %w", err)
	}
	return startedAt.Add(maximumCutoffLag), nil
}

func (store *Store) CompleteBudgetCutoffOperation(
	ctx context.Context,
	claim ClaimedBudgetCutoffOperation,
) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	now := store.clock().UTC()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin budget cutoff completion: %w", err)
	}
	defer rollback(tx)
	result, err := tx.ExecContext(ctx, `
UPDATE budget_cutoff_operations
SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
    last_error_code = '', updated_at = ?, completed_at = ?
WHERE idempotency_key = ? AND status = ? AND lease_owner = ? AND fence_token = ?
  AND lease_expires_at > ?
  AND EXISTS (
    SELECT 1 FROM user_budget_policies b
    WHERE b.user_id = budget_cutoff_operations.user_id
      AND b.period_start = budget_cutoff_operations.period_start
      AND b.cutoff_required_at IS NOT NULL
  )
`, RuntimeOperationSucceeded, timestamp(now), timestamp(now), claim.IdempotencyKey,
		RuntimeOperationRunning, claim.LeaseOwner, claim.FenceToken, timestamp(now))
	if err != nil {
		return fmt.Errorf("complete budget cutoff operation: %w", err)
	}
	if err := requireFenceRow(result); err != nil {
		return err
	}
	if err := store.recordProviderAccountingEndIfActiveTx(
		ctx,
		tx,
		claim.RuntimeName,
		"provider-budget-suspended:"+claim.IdempotencyKey,
		now,
	); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit budget cutoff completion: %w", err)
	}
	return nil
}

func (store *Store) DeferBudgetCutoffOperation(
	ctx context.Context,
	claim ClaimedBudgetCutoffOperation,
	errorCode string,
	nextAttemptAt time.Time,
	terminal bool,
) error {
	if err := validateIdentifier("budget cutoff error code", errorCode); err != nil {
		return err
	}
	if nextAttemptAt.IsZero() {
		return errors.New("budget cutoff next attempt must be set")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	now := store.clock().UTC()
	status := RuntimeOperationRetryWait
	var completedAt any
	if terminal {
		status = RuntimeOperationFailed
		completedAt = timestamp(now)
	}
	result, err := store.db.ExecContext(ctx, `
UPDATE budget_cutoff_operations
SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
    next_attempt_at = ?, last_error_code = ?, updated_at = ?, completed_at = ?
WHERE idempotency_key = ? AND status = ? AND lease_owner = ? AND fence_token = ?
  AND lease_expires_at > ?
`, status, timestamp(nextAttemptAt), errorCode, timestamp(now), completedAt,
		claim.IdempotencyKey, RuntimeOperationRunning, claim.LeaseOwner,
		claim.FenceToken, timestamp(now))
	if err != nil {
		return fmt.Errorf("defer budget cutoff operation: %w", err)
	}
	if err := requireFenceRow(result); err != nil {
		return err
	}
	if !terminal {
		store.notifyOperationWakeLocked()
	}
	return nil
}

func readBudgetCutoffOperation(
	ctx context.Context,
	querier runtimeOperationQuerier,
	idempotencyKey string,
) (RuntimeOperation, error) {
	var operation RuntimeOperation
	var leaseOwner, leaseExpiresAt, completedAt sql.NullString
	var nextAttemptAt, createdAt, updatedAt string
	err := querier.QueryRowContext(ctx, `
SELECT idempotency_key, user_id, runtime_name, status, attempt_count,
       fence_token, lease_owner, lease_expires_at, next_attempt_at,
       last_error_code, created_at, updated_at, completed_at
FROM budget_cutoff_operations WHERE idempotency_key = ?
`, idempotencyKey).Scan(
		&operation.IdempotencyKey, &operation.UserID, &operation.RuntimeName,
		&operation.Status, &operation.AttemptCount, &operation.FenceToken,
		&leaseOwner, &leaseExpiresAt, &nextAttemptAt, &operation.LastErrorCode,
		&createdAt, &updatedAt, &completedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return RuntimeOperation{}, ErrNotFound
	}
	if err != nil {
		return RuntimeOperation{}, fmt.Errorf("read budget cutoff operation: %w", err)
	}
	operation.LeaseOwner = leaseOwner.String
	operation.NextAttemptAt, err = parseStoredTime(nextAttemptAt)
	if err == nil {
		operation.CreatedAt, err = parseStoredTime(createdAt)
	}
	if err == nil {
		operation.UpdatedAt, err = parseStoredTime(updatedAt)
	}
	if err == nil {
		operation.LeaseExpiresAt, err = parseOptionalStoredTime(leaseExpiresAt)
	}
	if err == nil {
		operation.CompletedAt, err = parseOptionalStoredTime(completedAt)
	}
	if err != nil {
		return RuntimeOperation{}, fmt.Errorf("parse budget cutoff operation time: %w", err)
	}
	return operation, nil
}
