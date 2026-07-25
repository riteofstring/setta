package controlplane

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"setta/internal/runtimeprovider"
)

type ClaimedRuntimeOperation struct {
	RuntimeOperation
	Identity runtimeprovider.ManagedIdentity
}

func (store *Store) EnsureRuntimeIntent(
	ctx context.Context,
	request EnsureRuntimeRequest,
) (RuntimeOperation, error) {
	assignment := ensureRuntimeAssignment(request)
	if err := validateAssignment(assignment); err != nil {
		return RuntimeOperation{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	operation, created, previousRuntime, previousEpoch, err := store.ensureRuntimeIntentLocked(ctx, request, assignment)
	if err != nil {
		return RuntimeOperation{}, err
	}
	if created {
		store.invalidateChangedAssignmentLocked(previousRuntime, previousEpoch, assignment)
		store.notifyOperationWakeLocked()
	}
	return operation, nil
}

func (store *Store) ensureRuntimeIntentLocked(
	ctx context.Context,
	request EnsureRuntimeRequest,
	assignment AssignRuntimeRequest,
) (RuntimeOperation, bool, string, uint64, error) {
	previousRuntime, previousEpoch, err := store.readAssignmentStateLocked(ctx, request.UserID, request.RuntimeName)
	if err != nil {
		return RuntimeOperation{}, false, "", 0, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return RuntimeOperation{}, false, "", 0, fmt.Errorf("begin ensure runtime intent: %w", err)
	}
	defer rollback(tx)
	replayed, err := ensureRuntimeReplay(ctx, tx, request)
	if err != nil {
		return RuntimeOperation{}, false, "", 0, err
	}
	if replayed {
		operation, readErr := readRuntimeOperation(ctx, tx, request.IdempotencyKey)
		return operation, false, previousRuntime, previousEpoch, readErr
	}
	now := store.clock().UTC()
	if err := writeProvisioningAssignment(ctx, tx, assignment, timestamp(now)); err != nil {
		return RuntimeOperation{}, false, "", 0, err
	}
	if err := cancelReplacedRuntimeOperations(ctx, tx, request, previousRuntime, now); err != nil {
		return RuntimeOperation{}, false, "", 0, err
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO runtime_operations (
  idempotency_key, user_id, runtime_name, request_fingerprint, status,
  attempt_count, fence_token, next_attempt_at, last_error_code, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, 0, 0, ?, '', ?, ?)
`, request.IdempotencyKey, request.UserID, request.RuntimeName, ensureRuntimeFingerprint(request),
		RuntimeOperationPending, timestamp(now), timestamp(now), timestamp(now)); err != nil {
		return RuntimeOperation{}, false, "", 0, fmt.Errorf("record ensure runtime intent: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return RuntimeOperation{}, false, "", 0, fmt.Errorf("commit ensure runtime intent: %w", err)
	}
	operation, err := store.readRuntimeOperationLocked(ctx, request.IdempotencyKey)
	return operation, true, previousRuntime, previousEpoch, err
}

func writeProvisioningAssignment(
	ctx context.Context,
	tx *sql.Tx,
	request AssignRuntimeRequest,
	now string,
) error {
	result, err := tx.ExecContext(ctx, `
INSERT INTO runtimes (
  name, user_id, lifecycle, access_state, health_state, credential_epoch,
  upstream_authority, credential_secret_ref, desired_release, observed_release,
  wake_requested_at, last_ready_at, deletion_scheduled_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, NULL, NULL, ?)
ON CONFLICT(name) DO UPDATE SET
  lifecycle = excluded.lifecycle,
  access_state = excluded.access_state,
  health_state = excluded.health_state,
  credential_epoch = excluded.credential_epoch,
  upstream_authority = excluded.upstream_authority,
  credential_secret_ref = excluded.credential_secret_ref,
  desired_release = excluded.desired_release,
  observed_release = '',
  wake_requested_at = NULL,
  last_ready_at = NULL,
  deletion_scheduled_at = NULL,
  updated_at = excluded.updated_at
WHERE runtimes.user_id = excluded.user_id
`, request.RuntimeName, request.UserID, request.Lifecycle, request.AccessState,
		request.HealthState, request.CredentialEpoch, request.UpstreamAuthority,
		request.CredentialSecretRef, request.DesiredRelease, now)
	if err != nil {
		return fmt.Errorf("record provisioning runtime: %w", err)
	}
	if err := requireOneRow(result, "record provisioning runtime"); err != nil {
		return fmt.Errorf("runtime is owned by another user: %w", err)
	}
	result, err = tx.ExecContext(ctx, `
UPDATE users SET active_runtime_name = ?, updated_at = ? WHERE id = ?
`, request.RuntimeName, now, request.UserID)
	if err != nil {
		return fmt.Errorf("assign provisioning runtime: %w", err)
	}
	return requireOneRow(result, "assign provisioning runtime")
}

func cancelReplacedRuntimeOperations(
	ctx context.Context,
	tx *sql.Tx,
	request EnsureRuntimeRequest,
	previousRuntime string,
	now time.Time,
) error {
	if previousRuntime != "" && previousRuntime != request.RuntimeName {
		if _, err := tx.ExecContext(ctx, `
UPDATE runtimes
SET lifecycle = ?, access_state = ?, updated_at = ?
WHERE name = ? AND user_id = ?
`, RuntimeLifecycleDeleting, RuntimeAccessSuspended, timestamp(now), previousRuntime, request.UserID); err != nil {
			return fmt.Errorf("mark replaced runtime deleting: %w", err)
		}
	}
	_, err := tx.ExecContext(ctx, `
UPDATE runtime_operations
SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
    updated_at = ?, completed_at = ?
WHERE user_id = ? AND runtime_name <> ? AND status IN (?, ?, ?)
`, RuntimeOperationCanceled, timestamp(now), timestamp(now), request.UserID, request.RuntimeName,
		RuntimeOperationPending, RuntimeOperationRunning, RuntimeOperationRetryWait)
	if err != nil {
		return fmt.Errorf("cancel replaced runtime operations: %w", err)
	}
	return nil
}

func ensureRuntimeReplay(ctx context.Context, tx *sql.Tx, request EnsureRuntimeRequest) (bool, error) {
	var fingerprint string
	err := tx.QueryRowContext(ctx, `
SELECT request_fingerprint FROM runtime_operations WHERE idempotency_key = ?
`, request.IdempotencyKey).Scan(&fingerprint)
	if errors.Is(err, sql.ErrNoRows) {
		var count int
		if countErr := tx.QueryRowContext(ctx, `
SELECT COUNT(*) FROM operations WHERE idempotency_key = ?
`, request.IdempotencyKey).Scan(&count); countErr != nil {
			return false, fmt.Errorf("check assignment idempotency key: %w", countErr)
		}
		if count != 0 {
			return false, ErrIdempotencyConflict
		}
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read ensure runtime idempotency key: %w", err)
	}
	if fingerprint != ensureRuntimeFingerprint(request) {
		return false, ErrIdempotencyConflict
	}
	return true, nil
}

func (store *Store) ClaimRuntimeOperation(
	ctx context.Context,
	workerID string,
	leaseDuration time.Duration,
) (ClaimedRuntimeOperation, bool, error) {
	if err := validateIdentifier("reconciler worker id", workerID); err != nil {
		return ClaimedRuntimeOperation{}, false, err
	}
	if leaseDuration <= 0 {
		return ClaimedRuntimeOperation{}, false, errors.New("runtime operation lease duration must be positive")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.claimRuntimeOperationLocked(ctx, workerID, leaseDuration)
}

func (store *Store) claimRuntimeOperationLocked(
	ctx context.Context,
	workerID string,
	leaseDuration time.Duration,
) (ClaimedRuntimeOperation, bool, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return ClaimedRuntimeOperation{}, false, fmt.Errorf("begin runtime operation claim: %w", err)
	}
	defer rollback(tx)
	now := store.clock().UTC()
	var idempotencyKey string
	err = tx.QueryRowContext(ctx, `
SELECT o.idempotency_key
FROM runtime_operations o
JOIN users u ON u.id = o.user_id AND u.active_runtime_name = o.runtime_name
JOIN runtimes r ON r.name = o.runtime_name AND r.user_id = o.user_id
WHERE u.status = ? AND r.lifecycle = ? AND (
  (o.status IN (?, ?) AND o.next_attempt_at <= ?) OR
  (o.status = ? AND o.lease_expires_at <= ?)
)
ORDER BY o.next_attempt_at, o.created_at, o.idempotency_key
LIMIT 1
`, UserStatusActive, RuntimeLifecycleProvisioning, RuntimeOperationPending,
		RuntimeOperationRetryWait, timestamp(now), RuntimeOperationRunning, timestamp(now)).Scan(&idempotencyKey)
	if errors.Is(err, sql.ErrNoRows) {
		return ClaimedRuntimeOperation{}, false, nil
	}
	if err != nil {
		return ClaimedRuntimeOperation{}, false, fmt.Errorf("select runtime operation: %w", err)
	}
	result, err := tx.ExecContext(ctx, `
UPDATE runtime_operations
SET status = ?, attempt_count = attempt_count + 1, fence_token = fence_token + 1,
    lease_owner = ?, lease_expires_at = ?, updated_at = ?
WHERE idempotency_key = ?
`, RuntimeOperationRunning, workerID, timestamp(now.Add(leaseDuration)), timestamp(now), idempotencyKey)
	if err != nil {
		return ClaimedRuntimeOperation{}, false, fmt.Errorf("claim runtime operation: %w", err)
	}
	if err := requireOneRow(result, "claim runtime operation"); err != nil {
		return ClaimedRuntimeOperation{}, false, err
	}
	operation, err := readRuntimeOperation(ctx, tx, idempotencyKey)
	if err != nil {
		return ClaimedRuntimeOperation{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return ClaimedRuntimeOperation{}, false, fmt.Errorf("commit runtime operation claim: %w", err)
	}
	identity, err := runtimeprovider.ManagedIdentityFromName(operation.RuntimeName)
	if err != nil {
		return ClaimedRuntimeOperation{}, false, err
	}
	return ClaimedRuntimeOperation{RuntimeOperation: operation, Identity: identity}, true, nil
}

func ensureRuntimeAssignment(request EnsureRuntimeRequest) AssignRuntimeRequest {
	return AssignRuntimeRequest{
		IdempotencyKey:      request.IdempotencyKey,
		UserID:              request.UserID,
		RuntimeName:         request.RuntimeName,
		Lifecycle:           RuntimeLifecycleProvisioning,
		AccessState:         RuntimeAccessSuspended,
		HealthState:         RuntimeHealthUnknown,
		CredentialEpoch:     request.CredentialEpoch,
		UpstreamAuthority:   request.UpstreamAuthority,
		CredentialSecretRef: request.CredentialSecretRef,
		DesiredRelease:      request.DesiredRelease,
	}
}

func ensureRuntimeFingerprint(request EnsureRuntimeRequest) string {
	fields := []string{request.UserID, request.RuntimeName, strconv.FormatUint(request.CredentialEpoch, 10),
		request.UpstreamAuthority, request.CredentialSecretRef, request.DesiredRelease}
	digest := sha256.Sum256([]byte(strings.Join(fields, "\x00")))
	return hex.EncodeToString(digest[:])
}

func (store *Store) notifyOperationWakeLocked() {
	select {
	case store.operationWake <- struct{}{}:
	default:
	}
}
