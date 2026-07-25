package controlplane

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
)

func (store *Store) EnsureHostedAccessIntent(
	ctx context.Context,
	intent EnsureHostedAccessIntent,
) (HostedAccessProgress, error) {
	capabilities, err := validateHostedAccessIntent(intent)
	if err != nil {
		return HostedAccessProgress{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return HostedAccessProgress{}, fmt.Errorf("begin hosted access intent: %w", err)
	}
	defer rollback(tx)
	fingerprint := hostedAccessFingerprint(intent, capabilities)
	replayed, err := hostedAccessReplay(ctx, tx, intent.IdempotencyKey, fingerprint)
	if err != nil {
		return HostedAccessProgress{}, err
	}
	if !replayed {
		if err := insertHostedAccessIntent(ctx, tx, intent, capabilities, fingerprint, timestamp(store.clock().UTC())); err != nil {
			return HostedAccessProgress{}, err
		}
	}
	progress, err := readLatestHostedAccessProgress(ctx, tx, intent.IdempotencyKey)
	if err != nil {
		return HostedAccessProgress{}, err
	}
	if err := tx.Commit(); err != nil {
		return HostedAccessProgress{}, fmt.Errorf("commit hosted access intent: %w", err)
	}
	return progress, nil
}

func insertHostedAccessIntent(
	ctx context.Context,
	tx *sql.Tx,
	intent EnsureHostedAccessIntent,
	capabilities []HostedAccessCapability,
	fingerprint string,
	now string,
) error {
	result, err := tx.ExecContext(ctx, `
INSERT INTO hosted_access_intents (
  intent_id, request_fingerprint, user_id, project_id, workstream_id,
  client_device_id, client_kind, created_at, updated_at
) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND status = ?)
`, intent.IdempotencyKey, fingerprint, intent.UserID, intent.ProjectID, intent.WorkstreamID,
		intent.Client.DeviceID, intent.Client.Kind, now, now, intent.UserID, UserStatusActive)
	if err != nil {
		return fmt.Errorf("record hosted access intent: %w", err)
	}
	if err := requireOneRow(result, "record hosted access intent"); err != nil {
		return ErrNotFound
	}
	for _, capability := range capabilities {
		if _, err := tx.ExecContext(ctx, `
INSERT INTO hosted_access_capabilities (intent_id, capability) VALUES (?, ?)
`, intent.IdempotencyKey, capability); err != nil {
			return fmt.Errorf("record hosted access capability: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO hosted_access_progress (
  intent_id, cursor, state, reason_code, retryable, occurred_at
) VALUES (?, 1, ?, '', 0, ?)
`, intent.IdempotencyKey, HostedAccessProgressPreparingAccess, now); err != nil {
		return fmt.Errorf("record hosted access progress: %w", err)
	}
	return nil
}

func (store *Store) HostedAccessProgress(
	ctx context.Context,
	intentID string,
) (HostedAccessProgress, error) {
	if err := validateIdentifier("hosted access intent id", intentID); err != nil {
		return HostedAccessProgress{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return readLatestHostedAccessProgress(ctx, store.db, intentID)
}

type hostedAccessProgressQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readLatestHostedAccessProgress(
	ctx context.Context,
	querier hostedAccessProgressQuerier,
	intentID string,
) (HostedAccessProgress, error) {
	var progress HostedAccessProgress
	var cursor int
	var retryable int
	err := querier.QueryRowContext(ctx, `
SELECT intent_id, cursor, state, reason_code, retryable, occurred_at
FROM hosted_access_progress
WHERE intent_id = ?
ORDER BY cursor DESC
LIMIT 1
`, intentID).Scan(
		&progress.IntentID,
		&cursor,
		&progress.State,
		&progress.ReasonCode,
		&retryable,
		&progress.OccurredAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return HostedAccessProgress{}, ErrNotFound
	}
	if err != nil {
		return HostedAccessProgress{}, fmt.Errorf("read hosted access progress: %w", err)
	}
	progress.Cursor = strconv.Itoa(cursor)
	progress.Retryable = retryable == 1
	return progress, nil
}

func hostedAccessReplay(
	ctx context.Context,
	tx *sql.Tx,
	intentID string,
	fingerprint string,
) (bool, error) {
	var existing string
	err := tx.QueryRowContext(ctx, `
SELECT request_fingerprint FROM hosted_access_intents WHERE intent_id = ?
`, intentID).Scan(&existing)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read hosted access intent: %w", err)
	}
	if existing != fingerprint {
		return false, ErrIdempotencyConflict
	}
	return true, nil
}

func validateHostedAccessIntent(intent EnsureHostedAccessIntent) ([]HostedAccessCapability, error) {
	for label, value := range map[string]string{
		"hosted access idempotency key": intent.IdempotencyKey,
		"hosted access user id":         intent.UserID,
		"hosted access project id":      intent.ProjectID,
		"hosted access workstream id":   intent.WorkstreamID,
		"hosted access device id":       intent.Client.DeviceID,
	} {
		if err := validateIdentifier(label, value); err != nil {
			return nil, err
		}
	}
	if !slices.Contains(hostedAccessClientKindValues, intent.Client.Kind) {
		return nil, fmt.Errorf("invalid hosted access client kind %q", intent.Client.Kind)
	}
	if len(intent.RequestedCapabilities) == 0 {
		return nil, errors.New("hosted access requires at least one capability")
	}
	capabilities := slices.Clone(intent.RequestedCapabilities)
	slices.Sort(capabilities)
	for index, capability := range capabilities {
		if !slices.Contains(hostedAccessCapabilityValues, capability) {
			return nil, fmt.Errorf("invalid hosted access capability %q", capability)
		}
		if index > 0 && capabilities[index-1] == capability {
			return nil, fmt.Errorf("duplicate hosted access capability %q", capability)
		}
	}
	return capabilities, nil
}

func hostedAccessFingerprint(
	intent EnsureHostedAccessIntent,
	capabilities []HostedAccessCapability,
) string {
	fields := []string{
		intent.UserID,
		intent.ProjectID,
		intent.WorkstreamID,
		intent.Client.DeviceID,
		string(intent.Client.Kind),
	}
	for _, capability := range capabilities {
		fields = append(fields, string(capability))
	}
	digest := sha256.Sum256([]byte(strings.Join(fields, "\x00")))
	return hex.EncodeToString(digest[:])
}
