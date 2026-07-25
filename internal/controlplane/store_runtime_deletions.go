package controlplane

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"time"

	"setta/internal/runtimeprovider"
)

type ClaimedRuntimeDeletionOperation struct {
	RuntimeOperation
	Identity runtimeprovider.ManagedIdentity
}

func (store *Store) ScheduleRuntimeDeletion(
	ctx context.Context,
	request ScheduleRuntimeDeletionRequest,
) (Runtime, error) {
	if err := validateIdentifier("idempotency key", request.IdempotencyKey); err != nil {
		return Runtime{}, err
	}
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return Runtime{}, err
	}
	if !request.ScheduledAt.After(store.clock().UTC()) {
		return Runtime{}, errors.New("runtime deletion schedule must be in the future")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	runtime, created, err := store.scheduleRuntimeDeletionLocked(ctx, request)
	if err != nil {
		return Runtime{}, err
	}
	if created {
		store.invalidateRuntimeLocked(request.RuntimeName)
		store.notifyOperationWakeLocked()
	}
	return runtime, nil
}

func (store *Store) scheduleRuntimeDeletionLocked(
	ctx context.Context,
	request ScheduleRuntimeDeletionRequest,
) (Runtime, bool, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return Runtime{}, false, fmt.Errorf("begin runtime deletion schedule: %w", err)
	}
	defer rollback(tx)
	userID, err := readDeletionRuntimeOwner(ctx, tx, request.RuntimeName)
	if err != nil {
		return Runtime{}, false, err
	}
	fingerprint := deletionFingerprint(userID, request)
	replayed, err := runtimeDeletionReplay(ctx, tx, request, userID, fingerprint)
	if err != nil {
		return Runtime{}, false, err
	}
	if replayed {
		if err := tx.Rollback(); err != nil {
			return Runtime{}, false, fmt.Errorf("close replayed runtime deletion schedule: %w", err)
		}
		runtime, readErr := store.readRuntimeLocked(ctx, request.RuntimeName)
		return runtime, false, readErr
	}
	if err := requireNoActiveRuntimeDeletion(ctx, tx, request.RuntimeName); err != nil {
		return Runtime{}, false, err
	}
	now := timestamp(store.clock().UTC())
	if _, err := tx.ExecContext(ctx, `
INSERT INTO runtime_deletion_operations (
  idempotency_key, user_id, runtime_name, request_fingerprint, status,
  attempt_count, fence_token, next_attempt_at, last_error_code, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, 0, 0, ?, '', ?, ?)
`, request.IdempotencyKey, userID, request.RuntimeName, fingerprint,
		RuntimeOperationPending, timestamp(request.ScheduledAt), now, now); err != nil {
		return Runtime{}, false, fmt.Errorf("record runtime deletion operation: %w", err)
	}
	result, err := tx.ExecContext(ctx, `
UPDATE runtimes
SET access_state = ?, deletion_scheduled_at = ?, updated_at = ?
WHERE name = ?
`, RuntimeAccessDeleteScheduled, timestamp(request.ScheduledAt), now, request.RuntimeName)
	if err != nil {
		return Runtime{}, false, fmt.Errorf("record runtime deletion schedule: %w", err)
	}
	if err := requireOneRow(result, "record runtime deletion schedule"); err != nil {
		return Runtime{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return Runtime{}, false, fmt.Errorf("commit runtime deletion schedule: %w", err)
	}
	runtime, err := store.readRuntimeLocked(ctx, request.RuntimeName)
	return runtime, true, err
}

func (store *Store) CancelRuntimeDeletion(
	ctx context.Context,
	runtimeName string,
	accessState RuntimeAccessState,
) (Runtime, error) {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return Runtime{}, err
	}
	if !validRuntimeAccessState(accessState) || accessState == RuntimeAccessDeleteScheduled {
		return Runtime{}, errors.New("runtime deletion cancellation requires a non-deletion access state")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.cancelRuntimeDeletionLocked(ctx, runtimeName, accessState)
}

func (store *Store) cancelRuntimeDeletionLocked(
	ctx context.Context,
	runtimeName string,
	accessState RuntimeAccessState,
) (Runtime, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return Runtime{}, fmt.Errorf("begin runtime deletion cancellation: %w", err)
	}
	defer rollback(tx)
	var idempotencyKey string
	var status RuntimeOperationStatus
	err = tx.QueryRowContext(ctx, `
SELECT idempotency_key, status
FROM runtime_deletion_operations
WHERE runtime_name = ?
ORDER BY created_at DESC, idempotency_key DESC
LIMIT 1
`, runtimeName).Scan(&idempotencyKey, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return Runtime{}, ErrNotFound
	}
	if err != nil {
		return Runtime{}, fmt.Errorf("read active runtime deletion: %w", err)
	}
	if status == RuntimeOperationRunning {
		return Runtime{}, errors.New("running runtime deletion cannot be canceled")
	}
	if status == RuntimeOperationSucceeded {
		return Runtime{}, errors.New("completed runtime deletion cannot be canceled")
	}
	if status == RuntimeOperationCanceled {
		return Runtime{}, ErrNotFound
	}
	now := timestamp(store.clock().UTC())
	if err := cancelDeletionOperation(ctx, tx, idempotencyKey, status, now); err != nil {
		return Runtime{}, err
	}
	result, err := tx.ExecContext(ctx, `
UPDATE runtimes
SET access_state = ?, deletion_scheduled_at = NULL, updated_at = ?
WHERE name = ? AND access_state = ?
`, accessState, now, runtimeName, RuntimeAccessDeleteScheduled)
	if err != nil {
		return Runtime{}, fmt.Errorf("clear runtime deletion schedule: %w", err)
	}
	if err := requireOneRow(result, "clear runtime deletion schedule"); err != nil {
		return Runtime{}, err
	}
	if err := tx.Commit(); err != nil {
		return Runtime{}, fmt.Errorf("commit runtime deletion cancellation: %w", err)
	}
	store.invalidateRuntimeLocked(runtimeName)
	return store.readRuntimeLocked(ctx, runtimeName)
}

func cancelDeletionOperation(
	ctx context.Context,
	tx *sql.Tx,
	idempotencyKey string,
	status RuntimeOperationStatus,
	now string,
) error {
	if status == RuntimeOperationFailed {
		return nil
	}
	result, err := tx.ExecContext(ctx, `
UPDATE runtime_deletion_operations
SET status = ?, updated_at = ?, completed_at = ?
WHERE idempotency_key = ? AND status IN (?, ?)
`, RuntimeOperationCanceled, now, now, idempotencyKey,
		RuntimeOperationPending, RuntimeOperationRetryWait)
	if err != nil {
		return fmt.Errorf("cancel runtime deletion operation: %w", err)
	}
	return requireOneRow(result, "cancel runtime deletion operation")
}

func readDeletionRuntimeOwner(ctx context.Context, tx *sql.Tx, runtimeName string) (string, error) {
	var userID string
	var lifecycle RuntimeLifecycle
	err := tx.QueryRowContext(ctx, `
SELECT user_id, lifecycle FROM runtimes WHERE name = ?
`, runtimeName).Scan(&userID, &lifecycle)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("read runtime owner: %w", err)
	}
	if lifecycle == RuntimeLifecycleDeleting {
		return "", errors.New("deleting runtime cannot be scheduled for deletion again")
	}
	return userID, nil
}

func requireNoActiveRuntimeDeletion(ctx context.Context, tx *sql.Tx, runtimeName string) error {
	var count int
	if err := tx.QueryRowContext(ctx, `
SELECT COUNT(*) FROM runtime_deletion_operations
WHERE runtime_name = ? AND status IN (?, ?, ?)
`, runtimeName, RuntimeOperationPending, RuntimeOperationRunning,
		RuntimeOperationRetryWait).Scan(&count); err != nil {
		return fmt.Errorf("check active runtime deletion: %w", err)
	}
	if count != 0 {
		return ErrIdempotencyConflict
	}
	return nil
}

func runtimeDeletionReplay(
	ctx context.Context,
	tx *sql.Tx,
	request ScheduleRuntimeDeletionRequest,
	userID string,
	fingerprint string,
) (bool, error) {
	var existingUserID string
	var existingRuntimeName string
	var existingFingerprint string
	err := tx.QueryRowContext(ctx, `
SELECT user_id, runtime_name, request_fingerprint
FROM runtime_deletion_operations WHERE idempotency_key = ?
`, request.IdempotencyKey).Scan(&existingUserID, &existingRuntimeName, &existingFingerprint)
	if errors.Is(err, sql.ErrNoRows) {
		conflict, conflictErr := idempotencyKeyExistsOutsideDeletion(ctx, tx, request.IdempotencyKey)
		if conflictErr != nil {
			return false, conflictErr
		}
		if conflict {
			return false, ErrIdempotencyConflict
		}
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read runtime deletion idempotency key: %w", err)
	}
	if existingUserID == userID && existingRuntimeName == request.RuntimeName &&
		existingFingerprint == fingerprint {
		return true, nil
	}
	return false, ErrIdempotencyConflict
}

func idempotencyKeyExistsOutsideDeletion(
	ctx context.Context,
	tx *sql.Tx,
	idempotencyKey string,
) (bool, error) {
	var count int
	if err := tx.QueryRowContext(ctx, `
SELECT
  (SELECT COUNT(*) FROM operations WHERE idempotency_key = ?) +
  (SELECT COUNT(*) FROM runtime_operations WHERE idempotency_key = ?)
`, idempotencyKey, idempotencyKey).Scan(&count); err != nil {
		return false, fmt.Errorf("check global deletion idempotency key: %w", err)
	}
	return count != 0, nil
}

func deletionFingerprint(userID string, request ScheduleRuntimeDeletionRequest) string {
	fields := []string{
		userID,
		request.RuntimeName,
		strconv.FormatInt(request.ScheduledAt.UTC().UnixNano(), 10),
	}
	return policyOperationFingerprint(fields...)
}

func (store *Store) RuntimeDeletionOperation(
	ctx context.Context,
	idempotencyKey string,
) (RuntimeOperation, error) {
	if err := validateIdentifier("idempotency key", idempotencyKey); err != nil {
		return RuntimeOperation{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return readRuntimeDeletionOperation(ctx, store.db, idempotencyKey)
}

func (store *Store) ClaimRuntimeDeletionOperation(
	ctx context.Context,
	workerID string,
	leaseDuration time.Duration,
) (ClaimedRuntimeDeletionOperation, bool, error) {
	if err := validateIdentifier("reconciler worker id", workerID); err != nil {
		return ClaimedRuntimeDeletionOperation{}, false, err
	}
	if leaseDuration <= 0 {
		return ClaimedRuntimeDeletionOperation{}, false, errors.New("runtime deletion lease duration must be positive")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.claimRuntimeDeletionOperationLocked(ctx, workerID, leaseDuration)
}

func (store *Store) claimRuntimeDeletionOperationLocked(
	ctx context.Context,
	workerID string,
	leaseDuration time.Duration,
) (ClaimedRuntimeDeletionOperation, bool, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return ClaimedRuntimeDeletionOperation{}, false, fmt.Errorf("begin runtime deletion claim: %w", err)
	}
	defer rollback(tx)
	now := store.clock().UTC()
	var idempotencyKey string
	err = tx.QueryRowContext(ctx, `
SELECT o.idempotency_key
FROM runtime_deletion_operations o
JOIN runtimes r ON r.name = o.runtime_name AND r.user_id = o.user_id
WHERE r.access_state = ? AND r.deletion_scheduled_at IS NOT NULL AND (
  (o.status IN (?, ?) AND o.next_attempt_at <= ?) OR
  (o.status = ? AND o.lease_expires_at <= ?)
)
ORDER BY o.next_attempt_at, o.created_at, o.idempotency_key
LIMIT 1
`, RuntimeAccessDeleteScheduled, RuntimeOperationPending, RuntimeOperationRetryWait,
		timestamp(now), RuntimeOperationRunning, timestamp(now)).Scan(&idempotencyKey)
	if errors.Is(err, sql.ErrNoRows) {
		return ClaimedRuntimeDeletionOperation{}, false, nil
	}
	if err != nil {
		return ClaimedRuntimeDeletionOperation{}, false, fmt.Errorf("select runtime deletion: %w", err)
	}
	result, err := tx.ExecContext(ctx, `
UPDATE runtime_deletion_operations
SET status = ?, attempt_count = attempt_count + 1, fence_token = fence_token + 1,
    lease_owner = ?, lease_expires_at = ?, updated_at = ?
WHERE idempotency_key = ?
`, RuntimeOperationRunning, workerID, timestamp(now.Add(leaseDuration)), timestamp(now), idempotencyKey)
	if err != nil {
		return ClaimedRuntimeDeletionOperation{}, false, fmt.Errorf("claim runtime deletion: %w", err)
	}
	if err := requireOneRow(result, "claim runtime deletion"); err != nil {
		return ClaimedRuntimeDeletionOperation{}, false, err
	}
	operation, err := readRuntimeDeletionOperation(ctx, tx, idempotencyKey)
	if err != nil {
		return ClaimedRuntimeDeletionOperation{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return ClaimedRuntimeDeletionOperation{}, false, fmt.Errorf("commit runtime deletion claim: %w", err)
	}
	identity, err := runtimeprovider.ManagedIdentityFromName(operation.RuntimeName)
	if err != nil {
		return ClaimedRuntimeDeletionOperation{}, false, err
	}
	return ClaimedRuntimeDeletionOperation{
		RuntimeOperation: operation,
		Identity:         identity,
	}, true, nil
}

func (store *Store) CompleteRuntimeDeletionOperation(
	ctx context.Context,
	claim ClaimedRuntimeDeletionOperation,
) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin runtime deletion completion: %w", err)
	}
	defer rollback(tx)
	now := timestamp(store.clock().UTC())
	result, err := tx.ExecContext(ctx, `
UPDATE runtime_deletion_operations
SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
    last_error_code = '', updated_at = ?, completed_at = ?
WHERE idempotency_key = ? AND status = ? AND lease_owner = ? AND fence_token = ?
  AND lease_expires_at > ?
  AND EXISTS (
    SELECT 1 FROM runtimes r
    WHERE r.name = runtime_deletion_operations.runtime_name
      AND r.access_state = ? AND r.deletion_scheduled_at IS NOT NULL
  )
`, RuntimeOperationSucceeded, now, now, claim.IdempotencyKey,
		RuntimeOperationRunning, claim.LeaseOwner, claim.FenceToken, now,
		RuntimeAccessDeleteScheduled)
	if err != nil {
		return fmt.Errorf("complete runtime deletion operation: %w", err)
	}
	if err := requireFenceRow(result); err != nil {
		return err
	}
	result, err = tx.ExecContext(ctx, `
UPDATE runtimes
SET lifecycle = ?, health_state = ?, observed_release = '',
    wake_requested_at = NULL, updated_at = ?
WHERE name = ? AND access_state = ?
`, RuntimeLifecycleDeleting, RuntimeHealthUnreachable, now,
		claim.RuntimeName, RuntimeAccessDeleteScheduled)
	if err != nil {
		return fmt.Errorf("record deleted runtime state: %w", err)
	}
	if err := requireOneRow(result, "record deleted runtime state"); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit runtime deletion completion: %w", err)
	}
	store.invalidateRuntimeLocked(claim.RuntimeName)
	return nil
}

func (store *Store) DeferRuntimeDeletionOperation(
	ctx context.Context,
	claim ClaimedRuntimeDeletionOperation,
	errorCode string,
	nextAttemptAt time.Time,
	terminal bool,
) error {
	if err := validateIdentifier("runtime deletion error code", errorCode); err != nil {
		return err
	}
	if nextAttemptAt.IsZero() {
		return errors.New("runtime deletion next attempt must be set")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	status := RuntimeOperationRetryWait
	var completedAt any
	if terminal {
		status = RuntimeOperationFailed
		completedAt = timestamp(store.clock().UTC())
	}
	now := store.clock().UTC()
	result, err := store.db.ExecContext(ctx, `
UPDATE runtime_deletion_operations
SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
    next_attempt_at = ?, last_error_code = ?, updated_at = ?, completed_at = ?
WHERE idempotency_key = ? AND status = ? AND lease_owner = ? AND fence_token = ?
  AND lease_expires_at > ?
`, status, timestamp(nextAttemptAt), errorCode, timestamp(now), completedAt,
		claim.IdempotencyKey, RuntimeOperationRunning, claim.LeaseOwner,
		claim.FenceToken, timestamp(now))
	if err != nil {
		return fmt.Errorf("defer runtime deletion operation: %w", err)
	}
	if err := requireFenceRow(result); err != nil {
		return err
	}
	if !terminal {
		store.notifyOperationWakeLocked()
	}
	return nil
}

func readRuntimeDeletionOperation(
	ctx context.Context,
	querier runtimeOperationQuerier,
	idempotencyKey string,
) (RuntimeOperation, error) {
	var operation RuntimeOperation
	var leaseOwner sql.NullString
	var leaseExpiresAt sql.NullString
	var completedAt sql.NullString
	var nextAttemptAt string
	var createdAt string
	var updatedAt string
	err := querier.QueryRowContext(ctx, `
SELECT idempotency_key, user_id, runtime_name, status, attempt_count,
       fence_token, lease_owner, lease_expires_at, next_attempt_at,
       last_error_code, created_at, updated_at, completed_at
FROM runtime_deletion_operations WHERE idempotency_key = ?
`, idempotencyKey).Scan(
		&operation.IdempotencyKey,
		&operation.UserID,
		&operation.RuntimeName,
		&operation.Status,
		&operation.AttemptCount,
		&operation.FenceToken,
		&leaseOwner,
		&leaseExpiresAt,
		&nextAttemptAt,
		&operation.LastErrorCode,
		&createdAt,
		&updatedAt,
		&completedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return RuntimeOperation{}, ErrNotFound
	}
	if err != nil {
		return RuntimeOperation{}, fmt.Errorf("read runtime deletion operation: %w", err)
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
		return RuntimeOperation{}, fmt.Errorf("parse runtime deletion operation time: %w", err)
	}
	return operation, nil
}
