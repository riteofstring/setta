package controlplane

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"

	"setta/internal/runtimeprovider"
)

func (store *Store) RuntimeOperation(
	ctx context.Context,
	idempotencyKey string,
) (RuntimeOperation, error) {
	if err := validateIdentifier("idempotency key", idempotencyKey); err != nil {
		return RuntimeOperation{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.readRuntimeOperationLocked(ctx, idempotencyKey)
}

func (store *Store) readRuntimeOperationLocked(
	ctx context.Context,
	idempotencyKey string,
) (RuntimeOperation, error) {
	return readRuntimeOperation(ctx, store.db, idempotencyKey)
}

type runtimeOperationQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readRuntimeOperation(
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
FROM runtime_operations WHERE idempotency_key = ?
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
		return RuntimeOperation{}, fmt.Errorf("read runtime operation: %w", err)
	}
	operation.LeaseOwner = leaseOwner.String
	if operation.NextAttemptAt, err = parseStoredTime(nextAttemptAt); err != nil {
		return RuntimeOperation{}, fmt.Errorf("parse runtime operation next attempt: %w", err)
	}
	if operation.CreatedAt, err = parseStoredTime(createdAt); err != nil {
		return RuntimeOperation{}, fmt.Errorf("parse runtime operation creation: %w", err)
	}
	if operation.UpdatedAt, err = parseStoredTime(updatedAt); err != nil {
		return RuntimeOperation{}, fmt.Errorf("parse runtime operation update: %w", err)
	}
	if operation.LeaseExpiresAt, err = parseOptionalStoredTime(leaseExpiresAt); err != nil {
		return RuntimeOperation{}, fmt.Errorf("parse runtime operation lease: %w", err)
	}
	if operation.CompletedAt, err = parseOptionalStoredTime(completedAt); err != nil {
		return RuntimeOperation{}, fmt.Errorf("parse runtime operation completion: %w", err)
	}
	return operation, nil
}

func (store *Store) CompleteRuntimeOperation(
	ctx context.Context,
	claim ClaimedRuntimeOperation,
	observation runtimeprovider.RuntimeObservation,
) error {
	if err := validateProviderObservation(claim.Identity, observation); err != nil {
		return err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin runtime operation completion: %w", err)
	}
	defer rollback(tx)
	now := store.clock().UTC()
	if _, err := tx.ExecContext(ctx, `
INSERT INTO provider_observations (
  runtime_name, provider_resource_id, activity, url_access, placement, observed_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(runtime_name) DO UPDATE SET
  provider_resource_id = excluded.provider_resource_id,
  activity = excluded.activity,
  url_access = excluded.url_access,
  placement = excluded.placement,
  observed_at = excluded.observed_at
`, claim.RuntimeName, observation.ProviderResourceID, observation.Activity,
		observation.URLAccess, observation.Placement, timestamp(now)); err != nil {
		return fmt.Errorf("record provider observation: %w", err)
	}
	result, err := tx.ExecContext(ctx, `
UPDATE runtime_operations
SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
    last_error_code = '', updated_at = ?, completed_at = ?
WHERE idempotency_key = ? AND status = ? AND lease_owner = ? AND fence_token = ?
  AND lease_expires_at > ?
  AND EXISTS (
    SELECT 1 FROM users u
    JOIN runtimes r ON r.name = u.active_runtime_name AND r.user_id = u.id
    WHERE u.id = runtime_operations.user_id AND u.status = ?
      AND r.name = runtime_operations.runtime_name AND r.lifecycle = ?
  )
`, RuntimeOperationSucceeded, timestamp(now), timestamp(now), claim.IdempotencyKey,
		RuntimeOperationRunning, claim.LeaseOwner, claim.FenceToken,
		timestamp(now),
		UserStatusActive, RuntimeLifecycleProvisioning)
	if err != nil {
		return fmt.Errorf("complete runtime operation: %w", err)
	}
	if err := requireFenceRow(result); err != nil {
		return err
	}
	if err := store.recordProviderAccountingBeginTx(
		ctx,
		tx,
		claim.RuntimeName,
		"provider-provisioned:"+claim.IdempotencyKey,
		claim.CreatedAt,
		now,
	); err != nil {
		return err
	}
	if providerActivitySuspended(observation.Activity) {
		if err := store.recordProviderAccountingEndIfActiveTx(
			ctx,
			tx,
			claim.RuntimeName,
			"provider-observed-suspended:"+claim.IdempotencyKey,
			now,
		); err != nil {
			return err
		}
	}
	if err := appendRuntimeProgress(
		ctx,
		tx,
		claim.IdempotencyKey,
		RuntimeProgressEnsureRuntime,
		RuntimeProgressProvisioned,
		"",
		false,
		timestamp(now),
	); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit runtime operation completion: %w", err)
	}
	store.notifyRuntimeProgressLocked(claim.IdempotencyKey)
	return nil
}

func (store *Store) DeferRuntimeOperation(
	ctx context.Context,
	claim ClaimedRuntimeOperation,
	errorCode string,
	nextAttemptAt time.Time,
	terminal bool,
) error {
	if err := validateIdentifier("runtime operation error code", errorCode); err != nil {
		return err
	}
	if nextAttemptAt.IsZero() {
		return errors.New("runtime operation next attempt must be set")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin runtime operation deferral: %w", err)
	}
	defer rollback(tx)
	status := RuntimeOperationRetryWait
	progressState := RuntimeProgressRetrying
	var completedAt any
	if terminal {
		status = RuntimeOperationFailed
		progressState = RuntimeProgressFailed
		completedAt = timestamp(store.clock().UTC())
	}
	now := store.clock().UTC()
	result, err := tx.ExecContext(ctx, `
UPDATE runtime_operations
SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
    next_attempt_at = ?, last_error_code = ?, updated_at = ?, completed_at = ?
WHERE idempotency_key = ? AND status = ? AND lease_owner = ? AND fence_token = ?
  AND lease_expires_at > ?
`, status, timestamp(nextAttemptAt), errorCode, timestamp(now), completedAt,
		claim.IdempotencyKey, RuntimeOperationRunning, claim.LeaseOwner, claim.FenceToken, timestamp(now))
	if err != nil {
		return fmt.Errorf("defer runtime operation: %w", err)
	}
	if err := requireFenceRow(result); err != nil {
		return err
	}
	if err := appendRuntimeProgress(
		ctx,
		tx,
		claim.IdempotencyKey,
		RuntimeProgressEnsureRuntime,
		progressState,
		errorCode,
		!terminal,
		timestamp(now),
	); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit runtime operation deferral: %w", err)
	}
	if !terminal {
		store.notifyOperationWakeLocked()
	}
	store.notifyRuntimeProgressLocked(claim.IdempotencyKey)
	return nil
}

func (store *Store) NextRuntimeOperationAt(ctx context.Context) (time.Time, bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	var raw sql.NullString
	err := store.db.QueryRowContext(ctx, `
SELECT MIN(due_at) FROM (
  SELECT o.next_attempt_at AS due_at
  FROM runtime_operations o
  JOIN users u ON u.id = o.user_id AND u.active_runtime_name = o.runtime_name
  JOIN runtimes r ON r.name = o.runtime_name AND r.user_id = o.user_id
  WHERE u.status = ? AND r.lifecycle = ? AND o.status IN (?, ?)
  UNION ALL
  SELECT o.lease_expires_at AS due_at
  FROM runtime_operations o
  JOIN users u ON u.id = o.user_id AND u.active_runtime_name = o.runtime_name
  JOIN runtimes r ON r.name = o.runtime_name AND r.user_id = o.user_id
  WHERE u.status = ? AND r.lifecycle = ? AND o.status = ?
  UNION ALL
  SELECT o.next_attempt_at AS due_at
  FROM runtime_deletion_operations o
  JOIN runtimes r ON r.name = o.runtime_name AND r.user_id = o.user_id
  WHERE r.access_state = ? AND r.deletion_scheduled_at IS NOT NULL
    AND o.status IN (?, ?)
  UNION ALL
  SELECT o.lease_expires_at AS due_at
  FROM runtime_deletion_operations o
  JOIN runtimes r ON r.name = o.runtime_name AND r.user_id = o.user_id
  WHERE r.access_state = ? AND r.deletion_scheduled_at IS NOT NULL
    AND o.status = ?
  UNION ALL
  SELECT o.next_attempt_at AS due_at
  FROM budget_cutoff_operations o
  JOIN user_budget_policies b ON b.user_id = o.user_id AND b.period_start = o.period_start
  JOIN users u ON u.id = o.user_id
  JOIN runtimes r ON r.name = o.runtime_name AND r.user_id = o.user_id
  WHERE b.cutoff_required_at IS NOT NULL AND u.status = ? AND r.access_state = ?
    AND o.status IN (?, ?)
  UNION ALL
  SELECT o.lease_expires_at AS due_at
  FROM budget_cutoff_operations o
  JOIN user_budget_policies b ON b.user_id = o.user_id AND b.period_start = o.period_start
  JOIN users u ON u.id = o.user_id
  JOIN runtimes r ON r.name = o.runtime_name AND r.user_id = o.user_id
  WHERE b.cutoff_required_at IS NOT NULL AND u.status = ? AND r.access_state = ?
    AND o.status = ?
)
`, UserStatusActive, RuntimeLifecycleProvisioning, RuntimeOperationPending, RuntimeOperationRetryWait,
		UserStatusActive, RuntimeLifecycleProvisioning, RuntimeOperationRunning,
		RuntimeAccessDeleteScheduled, RuntimeOperationPending, RuntimeOperationRetryWait,
		RuntimeAccessDeleteScheduled, RuntimeOperationRunning,
		UserStatusSuspended, RuntimeAccessSuspended, RuntimeOperationPending, RuntimeOperationRetryWait,
		UserStatusSuspended, RuntimeAccessSuspended, RuntimeOperationRunning).Scan(&raw)
	if err != nil {
		return time.Time{}, false, fmt.Errorf("read next runtime operation: %w", err)
	}
	if !raw.Valid {
		return time.Time{}, false, nil
	}
	parsed, err := parseStoredTime(raw.String)
	if err != nil {
		return time.Time{}, false, fmt.Errorf("parse next runtime operation: %w", err)
	}
	return parsed, true, nil
}

func (store *Store) OperationWake() <-chan struct{} {
	return store.operationWake
}

func (store *Store) ProviderObservation(
	ctx context.Context,
	runtimeName string,
) (ProviderObservation, error) {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return ProviderObservation{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	var observation ProviderObservation
	var observedAt string
	err := store.db.QueryRowContext(ctx, `
SELECT runtime_name, provider_resource_id, activity, url_access, placement, observed_at
FROM provider_observations WHERE runtime_name = ?
`, runtimeName).Scan(&observation.RuntimeName, &observation.ProviderResourceID,
		&observation.Activity, &observation.URLAccess, &observation.Placement, &observedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ProviderObservation{}, ErrNotFound
	}
	if err != nil {
		return ProviderObservation{}, fmt.Errorf("read provider observation: %w", err)
	}
	observation.ObservedAt, err = parseStoredTime(observedAt)
	if err != nil {
		return ProviderObservation{}, fmt.Errorf("parse provider observation time: %w", err)
	}
	return observation, nil
}

func validateProviderObservation(
	identity runtimeprovider.ManagedIdentity,
	observation runtimeprovider.RuntimeObservation,
) error {
	if observation.ProviderResourceID == "" || observation.Name != identity.Name ||
		!equalLabels(observation.Labels, identity.Labels) {
		return errors.New("provider observation does not match the managed runtime identity")
	}
	if observation.URLAccess != runtimeprovider.URLAccessAuthenticated {
		return errors.New("provider observation does not confirm authenticated URL access")
	}
	return nil
}

func equalLabels(left []string, right []string) bool {
	left = slices.Clone(left)
	right = slices.Clone(right)
	slices.Sort(left)
	slices.Sort(right)
	return slices.Equal(left, right)
}

func requireFenceRow(result sql.Result) error {
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read runtime operation fence row count: %w", err)
	}
	if rows != 1 {
		return ErrFenceLost
	}
	return nil
}

func parseStoredTime(raw string) (time.Time, error) {
	return time.Parse(time.RFC3339Nano, raw)
}

func parseOptionalStoredTime(raw sql.NullString) (*time.Time, error) {
	if !raw.Valid {
		return nil, nil
	}
	parsed, err := parseStoredTime(raw.String)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}
