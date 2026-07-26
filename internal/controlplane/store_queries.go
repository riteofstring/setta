package controlplane

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

func (store *Store) readAssignmentStateLocked(
	ctx context.Context,
	userID string,
	runtimeName string,
) (string, uint64, error) {
	var activeRuntime sql.NullString
	if err := store.db.QueryRowContext(ctx, `
SELECT active_runtime_name FROM users WHERE id = ?
`, userID).Scan(&activeRuntime); errors.Is(err, sql.ErrNoRows) {
		return "", 0, ErrNotFound
	} else if err != nil {
		return "", 0, fmt.Errorf("read active runtime assignment: %w", err)
	}
	var credentialEpoch uint64
	if err := store.db.QueryRowContext(ctx, `
SELECT credential_epoch FROM runtimes WHERE name = ? AND user_id = ?
`, runtimeName, userID).Scan(&credentialEpoch); errors.Is(err, sql.ErrNoRows) {
		credentialEpoch = 0
	} else if err != nil {
		return "", 0, fmt.Errorf("read runtime credential epoch: %w", err)
	}
	return activeRuntime.String, credentialEpoch, nil
}

func runtimeAssignmentReplay(
	ctx context.Context,
	tx *sql.Tx,
	request AssignRuntimeRequest,
) (bool, error) {
	var kind string
	var userID string
	var runtimeName string
	var requestFingerprint string
	err := tx.QueryRowContext(ctx, `
SELECT kind, user_id, runtime_name, request_fingerprint FROM operations WHERE idempotency_key = ?
`, request.IdempotencyKey).Scan(&kind, &userID, &runtimeName, &requestFingerprint)
	if errors.Is(err, sql.ErrNoRows) {
		var count int
		if countErr := tx.QueryRowContext(ctx, `
SELECT
  (SELECT COUNT(*) FROM runtime_operations WHERE idempotency_key = ?) +
  (SELECT COUNT(*) FROM runtime_deletion_operations WHERE idempotency_key = ?)
`, request.IdempotencyKey, request.IdempotencyKey).Scan(&count); countErr != nil {
			return false, fmt.Errorf("check runtime operation idempotency key: %w", countErr)
		}
		if count != 0 {
			return false, ErrIdempotencyConflict
		}
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read runtime assignment idempotency key: %w", err)
	}
	if kind == "assign_runtime" && userID == request.UserID && runtimeName == request.RuntimeName &&
		requestFingerprint == runtimeAssignmentFingerprint(request) {
		return true, nil
	}
	return false, ErrIdempotencyConflict
}

func requireActiveRuntime(
	ctx context.Context,
	tx *sql.Tx,
	userID string,
	runtimeName string,
	now time.Time,
) error {
	var count int
	err := tx.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM users u
JOIN runtimes r ON r.name = u.active_runtime_name AND r.user_id = u.id
JOIN entitlements e ON e.user_id = u.id
WHERE u.id = ? AND r.name = ? AND u.status = ? AND r.access_state = ?
  AND r.lifecycle = ? AND r.health_state = ?
  AND r.desired_release <> '' AND r.observed_release = r.desired_release
  AND (e.state = ? OR (e.state = ? AND e.grace_ends_at > ?))
`, userID, runtimeName, UserStatusActive, RuntimeAccessEnabled,
		RuntimeLifecycleReady, RuntimeHealthHealthy, EntitlementActive,
		EntitlementGrace, timestamp(now)).Scan(&count)
	if err != nil {
		return fmt.Errorf("validate active runtime assignment: %w", err)
	}
	if count != 1 {
		return ErrNotFound
	}
	return nil
}

func requireMatchingDeviceCredential(
	ctx context.Context,
	tx *sql.Tx,
	device Device,
	token string,
) error {
	var userID string
	var displayName string
	var storedHash []byte
	err := tx.QueryRowContext(ctx, `
SELECT user_id, display_name, token_hash FROM devices WHERE id = ?
`, device.ID).Scan(&userID, &displayName, &storedHash)
	if err != nil {
		return fmt.Errorf("read ensured control-plane device: %w", err)
	}
	expectedHash := hashToken(token)
	if userID != device.UserID || displayName != device.DisplayName || subtle.ConstantTimeCompare(storedHash, expectedHash) != 1 {
		return ErrIdempotencyConflict
	}
	return nil
}

func (store *Store) readDeviceGrantLocked(
	ctx context.Context,
	deviceID string,
	runtimeName string,
	token string,
) (CreatedDeviceGrant, error) {
	var device Device
	var grant RuntimeAccessGrant
	var deviceCreatedAt string
	var grantCreatedAt string
	var grantExpiresAt string
	var deviceRevokedAt sql.NullString
	var grantRevokedAt sql.NullString
	err := store.db.QueryRowContext(ctx, `
SELECT d.id, d.user_id, d.display_name, d.created_at, d.revoked_at,
       g.device_id, g.runtime_name, g.created_at, g.expires_at, g.revoked_at
FROM devices d
JOIN runtime_access_grants g ON g.device_id = d.id
WHERE d.id = ? AND g.runtime_name = ?
`, deviceID, runtimeName).Scan(
		&device.ID,
		&device.UserID,
		&device.DisplayName,
		&deviceCreatedAt,
		&deviceRevokedAt,
		&grant.DeviceID,
		&grant.RuntimeName,
		&grantCreatedAt,
		&grantExpiresAt,
		&grantRevokedAt,
	)
	if err != nil {
		return CreatedDeviceGrant{}, fmt.Errorf("read ensured device grant: %w", err)
	}
	var parseErr error
	device.CreatedAt, parseErr = time.Parse(time.RFC3339Nano, deviceCreatedAt)
	if parseErr == nil {
		grant.CreatedAt, parseErr = time.Parse(time.RFC3339Nano, grantCreatedAt)
	}
	if parseErr == nil {
		grant.ExpiresAt, parseErr = time.Parse(time.RFC3339Nano, grantExpiresAt)
	}
	if parseErr != nil {
		return CreatedDeviceGrant{}, fmt.Errorf("parse ensured device grant time: %w", parseErr)
	}
	device.RevokedAt, parseErr = nullableTimestamp(deviceRevokedAt)
	if parseErr == nil {
		grant.RevokedAt, parseErr = nullableTimestamp(grantRevokedAt)
	}
	if parseErr != nil {
		return CreatedDeviceGrant{}, fmt.Errorf("parse ensured device grant revocation: %w", parseErr)
	}
	return CreatedDeviceGrant{Device: device, Grant: grant, Token: token}, nil
}

func nullableTimestamp(value sql.NullString) (*time.Time, error) {
	if !value.Valid {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, value.String)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func (store *Store) readUserLocked(ctx context.Context, userID string) (User, error) {
	var user User
	var activeRuntime sql.NullString
	var updatedAt string
	err := store.db.QueryRowContext(ctx, `
SELECT id, status, active_runtime_name, updated_at FROM users WHERE id = ?
`, userID).Scan(&user.ID, &user.Status, &activeRuntime, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("read control-plane user: %w", err)
	}
	user.ActiveRuntimeName = activeRuntime.String
	parsed, err := time.Parse(time.RFC3339Nano, updatedAt)
	if err != nil {
		return User{}, fmt.Errorf("parse control-plane user update time: %w", err)
	}
	user.UpdatedAt = parsed
	return user, nil
}

func (store *Store) readRuntimeLocked(ctx context.Context, runtimeName string) (Runtime, error) {
	var runtime Runtime
	var wakeRequestedAt sql.NullString
	var lastReadyAt sql.NullString
	var deletionScheduledAt sql.NullString
	var updatedAt string
	err := store.db.QueryRowContext(ctx, `
SELECT name, user_id, lifecycle, access_state, health_state, credential_epoch,
       upstream_authority, credential_secret_ref, desired_release,
       observed_release, cpu_core_millionths, memory_bytes, storage_bytes,
       wake_requested_at, last_ready_at,
       deletion_scheduled_at, updated_at
FROM runtimes WHERE name = ?
`, runtimeName).Scan(
		&runtime.Name,
		&runtime.UserID,
		&runtime.Lifecycle,
		&runtime.AccessState,
		&runtime.HealthState,
		&runtime.CredentialEpoch,
		&runtime.UpstreamAuthority,
		&runtime.CredentialSecretRef,
		&runtime.DesiredRelease,
		&runtime.ObservedRelease,
		&runtime.Resources.CPUCoreMillionths,
		&runtime.Resources.MemoryBytes,
		&runtime.Resources.StorageBytes,
		&wakeRequestedAt,
		&lastReadyAt,
		&deletionScheduledAt,
		&updatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Runtime{}, ErrNotFound
	}
	if err != nil {
		return Runtime{}, fmt.Errorf("read control-plane runtime: %w", err)
	}
	runtime.WakeRequestedAt, err = parseOptionalStoredTime(wakeRequestedAt)
	if err == nil {
		runtime.LastReadyAt, err = parseOptionalStoredTime(lastReadyAt)
	}
	if err == nil {
		runtime.DeletionScheduledAt, err = parseOptionalStoredTime(deletionScheduledAt)
	}
	if err != nil {
		return Runtime{}, fmt.Errorf("parse control-plane runtime policy time: %w", err)
	}
	parsed, err := time.Parse(time.RFC3339Nano, updatedAt)
	if err != nil {
		return Runtime{}, fmt.Errorf("parse control-plane runtime update time: %w", err)
	}
	runtime.UpdatedAt = parsed
	return runtime, nil
}
