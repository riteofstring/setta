package controlplane

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/runtimeprovider"
)

func (store *Store) Runtime(ctx context.Context, runtimeName string) (Runtime, error) {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return Runtime{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.readRuntimeLocked(ctx, runtimeName)
}

func (store *Store) Entitlement(ctx context.Context, userID string) (Entitlement, error) {
	if err := validateIdentifier("user id", userID); err != nil {
		return Entitlement{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.readEntitlementLocked(ctx, userID)
}

func (store *Store) UpdateEntitlement(ctx context.Context, request UpdateEntitlementRequest) (Entitlement, error) {
	if err := validateEntitlementUpdate(request, store.clock().UTC()); err != nil {
		return Entitlement{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	var graceEndsAt any
	if request.GraceEndsAt != nil {
		graceEndsAt = timestamp(*request.GraceEndsAt)
	}
	result, err := store.db.ExecContext(ctx, `
UPDATE entitlements
SET state = ?, grace_ends_at = ?, updated_at = ?
WHERE user_id = ?
`, request.State, graceEndsAt, timestamp(store.clock().UTC()), request.UserID)
	if err != nil {
		return Entitlement{}, fmt.Errorf("update control-plane entitlement: %w", err)
	}
	if err := requireOneRow(result, "update control-plane entitlement"); err != nil {
		return Entitlement{}, err
	}
	deviceIDs, err := store.readUserDeviceIDsLocked(ctx, request.UserID)
	if err != nil {
		return Entitlement{}, err
	}
	for _, deviceID := range deviceIDs {
		store.invalidateDeviceLocked(deviceID)
	}
	return store.readEntitlementLocked(ctx, request.UserID)
}

func (store *Store) SetDesiredRuntimeRelease(
	ctx context.Context,
	runtimeName string,
	release string,
) (Runtime, error) {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return Runtime{}, err
	}
	if release == "" {
		return Runtime{}, errors.New("desired runtime release is required")
	}
	if err := validateRelease("desired release", release); err != nil {
		return Runtime{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	result, err := store.db.ExecContext(ctx, `
UPDATE runtimes SET desired_release = ?, updated_at = ? WHERE name = ?
`, release, timestamp(store.clock().UTC()), runtimeName)
	if err != nil {
		return Runtime{}, fmt.Errorf("set desired runtime release: %w", err)
	}
	if err := requireOneRow(result, "set desired runtime release"); err != nil {
		return Runtime{}, err
	}
	store.invalidateRuntimeLocked(runtimeName)
	return store.readRuntimeLocked(ctx, runtimeName)
}

func (store *Store) RecordRuntimeHealth(
	ctx context.Context,
	request RecordRuntimeHealthRequest,
) (Runtime, error) {
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return Runtime{}, err
	}
	if !validRuntimeHealthState(request.HealthState) {
		return Runtime{}, fmt.Errorf("invalid runtime health state %q", request.HealthState)
	}
	if err := validateRelease("observed release", request.ObservedRelease); err != nil {
		return Runtime{}, err
	}
	if request.HealthState == RuntimeHealthHealthy && request.ObservedRelease == "" {
		return Runtime{}, errors.New("healthy runtime requires an observed release")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.recordRuntimeHealthLocked(ctx, request)
}

type runtimeHealthTarget struct {
	desiredRelease   string
	wakeOperationIDs []string
	wakeRequestedAt  sql.NullString
}

func (store *Store) recordRuntimeHealthLocked(
	ctx context.Context,
	request RecordRuntimeHealthRequest,
) (Runtime, error) {
	now := timestamp(store.clock().UTC())
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return Runtime{}, fmt.Errorf("begin runtime health observation: %w", err)
	}
	defer rollback(tx)
	target, err := readRuntimeHealthTarget(ctx, tx, request.RuntimeName)
	if err != nil {
		return Runtime{}, err
	}
	wakeCompleted := target.completesWake(request)
	if err := writeRuntimeHealth(ctx, tx, request, wakeCompleted, now); err != nil {
		return Runtime{}, err
	}
	if wakeCompleted {
		if err := appendHealthyWakeProgress(ctx, tx, target.wakeOperationIDs, now); err != nil {
			return Runtime{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Runtime{}, fmt.Errorf("commit runtime health observation: %w", err)
	}
	store.invalidateRuntimeLocked(request.RuntimeName)
	if wakeCompleted {
		store.notifyRuntimeProgressOperationsLocked(target.wakeOperationIDs)
	}
	return store.readRuntimeLocked(ctx, request.RuntimeName)
}

func (target runtimeHealthTarget) completesWake(request RecordRuntimeHealthRequest) bool {
	return target.wakeRequestedAt.Valid &&
		len(target.wakeOperationIDs) != 0 &&
		request.HealthState == RuntimeHealthHealthy &&
		request.ObservedRelease == target.desiredRelease
}

func (store *Store) notifyRuntimeProgressOperationsLocked(operationIDs []string) {
	for _, operationID := range operationIDs {
		store.notifyRuntimeProgressLocked(operationID)
	}
}

func readRuntimeHealthTarget(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
) (runtimeHealthTarget, error) {
	var target runtimeHealthTarget
	err := tx.QueryRowContext(ctx, `
SELECT desired_release, wake_requested_at
FROM runtimes WHERE name = ?
`, runtimeName).Scan(
		&target.desiredRelease,
		&target.wakeRequestedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return runtimeHealthTarget{}, ErrNotFound
	}
	if err != nil {
		return runtimeHealthTarget{}, fmt.Errorf("read runtime health target: %w", err)
	}
	target.wakeOperationIDs, err = readPendingWakeOperationIDs(ctx, tx, runtimeName)
	if err != nil {
		return runtimeHealthTarget{}, err
	}
	return target, nil
}

func readPendingWakeOperationIDs(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `
SELECT operation_id
FROM runtime_progress
WHERE kind = ? AND state = ? AND operation_id IN (
  SELECT idempotency_key
  FROM operations
  WHERE runtime_name = ? AND kind = 'request_runtime_wake'
)
AND cursor = (
  SELECT MAX(latest.cursor)
  FROM runtime_progress latest
  WHERE latest.operation_id = runtime_progress.operation_id
)
ORDER BY operation_id
`, RuntimeProgressWakeRuntime, RuntimeProgressWakeRequested, runtimeName)
	if err != nil {
		return nil, fmt.Errorf("read pending runtime wake operations: %w", err)
	}
	defer rows.Close()
	var operationIDs []string
	for rows.Next() {
		var operationID string
		if err := rows.Scan(&operationID); err != nil {
			return nil, fmt.Errorf("scan pending runtime wake operation: %w", err)
		}
		operationIDs = append(operationIDs, operationID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pending runtime wake operations: %w", err)
	}
	return operationIDs, nil
}

func appendHealthyWakeProgress(
	ctx context.Context,
	tx *sql.Tx,
	operationIDs []string,
	now string,
) error {
	for _, operationID := range operationIDs {
		if err := appendRuntimeProgress(
			ctx,
			tx,
			operationID,
			RuntimeProgressWakeRuntime,
			RuntimeProgressHealthy,
			"",
			false,
			now,
		); err != nil {
			return err
		}
	}
	return nil
}

func writeRuntimeHealth(
	ctx context.Context,
	tx *sql.Tx,
	request RecordRuntimeHealthRequest,
	wakeCompleted bool,
	now string,
) error {
	result, err := tx.ExecContext(ctx, `
UPDATE runtimes
SET health_state = ?, observed_release = ?,
    wake_requested_at = CASE WHEN ? THEN NULL ELSE wake_requested_at END,
    last_ready_at = CASE
      WHEN ? = ? AND desired_release <> '' AND desired_release = ? THEN ?
      ELSE last_ready_at
    END,
    updated_at = ?
WHERE name = ?
`, request.HealthState, request.ObservedRelease, wakeCompleted, request.HealthState,
		RuntimeHealthHealthy, request.ObservedRelease, now, now, request.RuntimeName)
	if err != nil {
		return fmt.Errorf("record runtime health: %w", err)
	}
	return requireOneRow(result, "record runtime health")
}

func (store *Store) RequestRuntimeWake(
	ctx context.Context,
	idempotencyKey string,
	runtimeName string,
) (Runtime, error) {
	if err := validateIdentifier("idempotency key", idempotencyKey); err != nil {
		return Runtime{}, err
	}
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return Runtime{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.requestRuntimeWakeLocked(ctx, idempotencyKey, runtimeName)
}

func (store *Store) requestRuntimeWakeLocked(
	ctx context.Context,
	idempotencyKey string,
	runtimeName string,
) (Runtime, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return Runtime{}, fmt.Errorf("begin runtime wake request: %w", err)
	}
	defer rollback(tx)
	userID, err := readRuntimeWakeOwner(ctx, tx, runtimeName)
	if err != nil {
		return Runtime{}, err
	}
	fingerprint := policyOperationFingerprint(userID, runtimeName)
	replayed, err := completedPolicyOperationReplay(ctx, tx, idempotencyKey, "request_runtime_wake", userID, runtimeName, fingerprint)
	if err != nil {
		return Runtime{}, err
	}
	if replayed {
		if err := tx.Rollback(); err != nil {
			return Runtime{}, fmt.Errorf("close replayed runtime wake request: %w", err)
		}
		return store.readRuntimeLocked(ctx, runtimeName)
	}
	now := timestamp(store.clock().UTC())
	if _, err := tx.ExecContext(ctx, `
UPDATE runtimes
SET wake_requested_at = ?, updated_at = ?
WHERE name = ?
`, now, now, runtimeName); err != nil {
		return Runtime{}, fmt.Errorf("record runtime wake request: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO operations (idempotency_key, kind, user_id, runtime_name, request_fingerprint, completed_at)
VALUES (?, 'request_runtime_wake', ?, ?, ?, ?)
`, idempotencyKey, userID, runtimeName, fingerprint, now); err != nil {
		return Runtime{}, fmt.Errorf("record runtime wake operation: %w", err)
	}
	if err := appendRuntimeProgress(
		ctx,
		tx,
		idempotencyKey,
		RuntimeProgressWakeRuntime,
		RuntimeProgressWakeRequested,
		"",
		false,
		now,
	); err != nil {
		return Runtime{}, err
	}
	if err := tx.Commit(); err != nil {
		return Runtime{}, fmt.Errorf("commit runtime wake request: %w", err)
	}
	store.invalidateRuntimeLocked(runtimeName)
	store.notifyRuntimeProgressLocked(idempotencyKey)
	return store.readRuntimeLocked(ctx, runtimeName)
}

func readRuntimeWakeOwner(ctx context.Context, tx *sql.Tx, runtimeName string) (string, error) {
	var userID string
	err := tx.QueryRowContext(ctx, `SELECT user_id FROM runtimes WHERE name = ?`, runtimeName).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("read runtime wake owner: %w", err)
	}
	return userID, nil
}

func (store *Store) readEntitlementLocked(ctx context.Context, userID string) (Entitlement, error) {
	var entitlement Entitlement
	var graceEndsAt sql.NullString
	var updatedAt string
	err := store.db.QueryRowContext(ctx, `
SELECT user_id, state, grace_ends_at, updated_at
FROM entitlements WHERE user_id = ?
`, userID).Scan(&entitlement.UserID, &entitlement.State, &graceEndsAt, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Entitlement{}, ErrNotFound
	}
	if err != nil {
		return Entitlement{}, fmt.Errorf("read control-plane entitlement: %w", err)
	}
	entitlement.GraceEndsAt, err = parseOptionalStoredTime(graceEndsAt)
	if err != nil {
		return Entitlement{}, fmt.Errorf("parse entitlement grace expiry: %w", err)
	}
	entitlement.UpdatedAt, err = parseStoredTime(updatedAt)
	if err != nil {
		return Entitlement{}, fmt.Errorf("parse entitlement update time: %w", err)
	}
	return entitlement, nil
}

func validateEntitlementUpdate(request UpdateEntitlementRequest, now time.Time) error {
	if err := validateIdentifier("user id", request.UserID); err != nil {
		return err
	}
	if !validEntitlementState(request.State) {
		return fmt.Errorf("invalid entitlement state %q", request.State)
	}
	if request.State == EntitlementGrace {
		if request.GraceEndsAt == nil || !request.GraceEndsAt.After(now) {
			return errors.New("grace entitlement requires a future grace expiry")
		}
		return nil
	}
	if request.GraceEndsAt != nil {
		return errors.New("only grace entitlement may include a grace expiry")
	}
	return nil
}

func completedPolicyOperationReplay(
	ctx context.Context,
	tx *sql.Tx,
	idempotencyKey string,
	kind string,
	userID string,
	runtimeName string,
	fingerprint string,
) (bool, error) {
	var existingKind string
	var existingUserID string
	var existingRuntimeName string
	var existingFingerprint string
	err := tx.QueryRowContext(ctx, `
SELECT kind, user_id, runtime_name, request_fingerprint
FROM operations WHERE idempotency_key = ?
`, idempotencyKey).Scan(&existingKind, &existingUserID, &existingRuntimeName, &existingFingerprint)
	if errors.Is(err, sql.ErrNoRows) {
		var count int
		if countErr := tx.QueryRowContext(ctx, `
SELECT
  (SELECT COUNT(*) FROM runtime_operations WHERE idempotency_key = ?) +
  (SELECT COUNT(*) FROM runtime_deletion_operations WHERE idempotency_key = ?)
`, idempotencyKey, idempotencyKey).Scan(&count); countErr != nil {
			return false, fmt.Errorf("check runtime operation idempotency key: %w", countErr)
		}
		if count != 0 {
			return false, ErrIdempotencyConflict
		}
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read policy operation idempotency key: %w", err)
	}
	if existingKind == kind && existingUserID == userID &&
		existingRuntimeName == runtimeName && existingFingerprint == fingerprint {
		return true, nil
	}
	return false, ErrIdempotencyConflict
}

func policyOperationFingerprint(fields ...string) string {
	digest := sha256.Sum256([]byte(strings.Join(fields, "\x00")))
	return hex.EncodeToString(digest[:])
}
