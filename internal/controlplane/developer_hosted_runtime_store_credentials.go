package controlplane

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

func (store *Store) RotateDeveloperHostedRuntimeCredential(
	ctx context.Context,
	environmentID string,
	deviceID string,
	deviceSecret string,
	runtimeRegistryID string,
) (string, time.Time, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return "", time.Time{}, fmt.Errorf(
			"begin developer hosted credential rotation: %w",
			err,
		)
	}
	defer rollback(tx)
	var expiresAtRaw string
	var refreshHash []byte
	err = tx.QueryRowContext(ctx, `
SELECT g.expires_at, d.desktop_refresh_token_hash
FROM developer_hosted_runtime_state d
JOIN runtime_access_grants g
  ON g.device_id = d.desktop_device_id AND g.runtime_name = d.runtime_name
JOIN devices v ON v.id = g.device_id
WHERE d.environment_id = ? AND d.runtime_registry_id = ?
  AND d.desktop_device_id = ? AND d.destroy_operation_id IS NULL
  AND v.revoked_at IS NULL AND g.revoked_at IS NULL AND g.expires_at > ?
`, environmentID, runtimeRegistryID, deviceID,
		timestamp(store.clock().UTC())).Scan(&expiresAtRaw, &refreshHash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", time.Time{}, ErrNotFound
	}
	if err != nil {
		return "", time.Time{}, fmt.Errorf(
			"read developer hosted credential rotation: %w",
			err,
		)
	}
	if subtle.ConstantTimeCompare(refreshHash, hashToken(deviceSecret)) != 1 {
		return "", time.Time{}, ErrNotFound
	}
	token, err := randomToken()
	if err != nil {
		return "", time.Time{}, err
	}
	result, err := tx.ExecContext(ctx, `
UPDATE devices SET token_hash = ? WHERE id = ? AND revoked_at IS NULL
`, hashToken(token), deviceID)
	if err != nil {
		return "", time.Time{}, fmt.Errorf(
			"rotate developer hosted access token: %w",
			err,
		)
	}
	if err := requireOneRow(result, "rotate developer hosted access token"); err != nil {
		return "", time.Time{}, err
	}
	expiresAt, err := parseStoredTime(expiresAtRaw)
	if err != nil {
		return "", time.Time{}, fmt.Errorf(
			"parse developer hosted credential expiry: %w",
			err,
		)
	}
	if err := tx.Commit(); err != nil {
		return "", time.Time{}, fmt.Errorf(
			"commit developer hosted credential rotation: %w",
			err,
		)
	}
	return token, expiresAt, nil
}

func (store *Store) ConfirmDeveloperHostedRuntimeConnected(
	ctx context.Context,
	operationID string,
	environmentID string,
	runtimeRegistryID string,
) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin developer hosted runtime connection: %w", err)
	}
	defer rollback(tx)
	now := store.clock().UTC()
	var state RuntimeProgressState
	if err := tx.QueryRowContext(ctx, `
SELECT state FROM runtime_progress
WHERE operation_id = ?
ORDER BY cursor DESC
LIMIT 1
`, operationID).Scan(&state); err != nil {
		return fmt.Errorf("read developer hosted runtime connection progress: %w", err)
	}
	if state == RuntimeProgressConnected {
		return tx.Rollback()
	}
	if state != RuntimeProgressConnecting {
		return errors.New("developer hosted runtime is not ready to connect")
	}
	var count int
	if err := tx.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM developer_hosted_runtime_state d
JOIN runtimes r ON r.name = d.runtime_name
WHERE d.environment_id = ? AND d.ensure_operation_id = ?
  AND d.runtime_registry_id = ?
  AND r.lifecycle = ? AND r.health_state = ?
  AND r.observed_release = r.desired_release
`, environmentID, operationID, runtimeRegistryID,
		RuntimeLifecycleReady, RuntimeHealthHealthy).Scan(&count); err != nil {
		return fmt.Errorf("validate developer hosted runtime connection: %w", err)
	}
	if count != 1 {
		return errors.New("developer hosted runtime readiness is not authoritative")
	}
	if err := appendRuntimeProgress(
		ctx,
		tx,
		operationID,
		RuntimeProgressEnsureRuntime,
		RuntimeProgressConnected,
		"",
		false,
		timestamp(now),
	); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
UPDATE developer_hosted_runtime_state
SET last_connected_at = ?, updated_at = ?
WHERE environment_id = ?
`, timestamp(now), timestamp(now), environmentID); err != nil {
		return fmt.Errorf("record developer hosted runtime connection time: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit developer hosted runtime connection: %w", err)
	}
	store.notifyRuntimeProgressLocked(operationID)
	return nil
}
