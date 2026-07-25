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
	"time"
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
	if !replayed {
		store.notifyHostedAccessLocked(intent.IdempotencyKey)
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
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func readLatestHostedAccessProgress(
	ctx context.Context,
	querier hostedAccessProgressQuerier,
	intentID string,
) (HostedAccessProgress, error) {
	var progress HostedAccessProgress
	var cursor int
	var reasonCode string
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
		&reasonCode,
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
	progress.ReasonCode = hostedAccessReasonCode(reasonCode)
	progress.Retryable = retryable == 1
	if progress.State == HostedAccessProgressReadyOnPhone {
		grant, err := readHostedAccessGrant(ctx, querier, intentID)
		if err != nil {
			return HostedAccessProgress{}, err
		}
		progress.AccessGrant = &grant
	}
	return progress, nil
}

func (store *Store) CompleteHostedAccessIntent(
	ctx context.Context,
	intentID string,
	created CreatedDeviceGrant,
) (HostedAccessProgress, error) {
	if err := validateIdentifier("hosted access intent id", intentID); err != nil {
		return HostedAccessProgress{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return HostedAccessProgress{}, fmt.Errorf("begin hosted access completion: %w", err)
	}
	defer rollback(tx)
	now := timestamp(store.clock().UTC())
	if err := validateHostedAccessCompletion(ctx, tx, intentID, created, now); err != nil {
		return HostedAccessProgress{}, err
	}
	progress, err := readLatestHostedAccessProgress(ctx, tx, intentID)
	if err != nil {
		return HostedAccessProgress{}, err
	}
	if progress.State != HostedAccessProgressReadyOnPhone {
		progress, err = ensureHostedAccessSyncing(ctx, tx, intentID, progress, now)
		if err != nil {
			return HostedAccessProgress{}, err
		}
		if err := appendHostedAccessReady(ctx, tx, intentID, progress, now); err != nil {
			return HostedAccessProgress{}, err
		}
		progress, err = readLatestHostedAccessProgress(ctx, tx, intentID)
		if err != nil {
			return HostedAccessProgress{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return HostedAccessProgress{}, fmt.Errorf("commit hosted access completion: %w", err)
	}
	store.notifyHostedAccessLocked(intentID)
	return progress, nil
}

func ensureHostedAccessSyncing(
	ctx context.Context,
	tx *sql.Tx,
	intentID string,
	progress HostedAccessProgress,
	now string,
) (HostedAccessProgress, error) {
	if progress.State != HostedAccessProgressPreparingAccess {
		return progress, nil
	}
	if err := appendHostedAccessProgress(
		ctx,
		tx,
		intentID,
		progress,
		HostedAccessProgressSyncingProject,
		HostedAccessReasonNone,
		false,
		now,
	); err != nil {
		return HostedAccessProgress{}, err
	}
	return readLatestHostedAccessProgress(ctx, tx, intentID)
}

func (store *Store) BeginHostedAccessSync(
	ctx context.Context,
	intentID string,
) (HostedAccessProgress, error) {
	if err := validateIdentifier("hosted access intent id", intentID); err != nil {
		return HostedAccessProgress{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return HostedAccessProgress{}, fmt.Errorf("begin hosted access sync: %w", err)
	}
	defer rollback(tx)
	progress, err := beginHostedAccessSync(
		ctx,
		tx,
		intentID,
		timestamp(store.clock().UTC()),
	)
	if err != nil {
		return HostedAccessProgress{}, err
	}
	if err := tx.Commit(); err != nil {
		return HostedAccessProgress{}, fmt.Errorf("commit hosted access sync: %w", err)
	}
	store.notifyHostedAccessLocked(intentID)
	return progress, nil
}

func beginHostedAccessSync(
	ctx context.Context,
	tx *sql.Tx,
	intentID string,
	now string,
) (HostedAccessProgress, error) {
	progress, err := readLatestHostedAccessProgress(ctx, tx, intentID)
	if err != nil {
		return HostedAccessProgress{}, err
	}
	if progress.State == HostedAccessProgressPreparingAccess ||
		(progress.State == HostedAccessProgressNeedsAttention && progress.Retryable) {
		if err := appendHostedAccessProgress(
			ctx,
			tx,
			intentID,
			progress,
			HostedAccessProgressSyncingProject,
			HostedAccessReasonNone,
			false,
			now,
		); err != nil {
			return HostedAccessProgress{}, err
		}
		progress, err = readLatestHostedAccessProgress(ctx, tx, intentID)
		if err != nil {
			return HostedAccessProgress{}, err
		}
	}
	if progress.State != HostedAccessProgressSyncingProject &&
		progress.State != HostedAccessProgressReadyOnPhone {
		return HostedAccessProgress{}, fmt.Errorf("hosted access cannot begin sync from state %q", progress.State)
	}
	return progress, nil
}

func (store *Store) FailHostedAccessIntent(
	ctx context.Context,
	intentID string,
	reason HostedAccessReasonCode,
	retryable bool,
) (HostedAccessProgress, error) {
	if err := validateIdentifier("hosted access intent id", intentID); err != nil {
		return HostedAccessProgress{}, err
	}
	if !slices.Contains(hostedAccessReasonCodeValues, reason) {
		return HostedAccessProgress{}, fmt.Errorf("invalid hosted access failure reason %q", reason)
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return HostedAccessProgress{}, fmt.Errorf("begin hosted access failure: %w", err)
	}
	defer rollback(tx)
	progress, err := readLatestHostedAccessProgress(ctx, tx, intentID)
	if err != nil {
		return HostedAccessProgress{}, err
	}
	if progress.State == HostedAccessProgressNeedsAttention {
		return replayHostedAccessFailure(tx, progress, reason, retryable)
	}
	if progress.State == HostedAccessProgressReadyOnPhone {
		return HostedAccessProgress{}, errors.New("ready hosted access cannot fail")
	}
	progress, err = appendHostedAccessFailure(ctx, tx, intentID, progress, reason, retryable, store.clock().UTC())
	if err != nil {
		return HostedAccessProgress{}, err
	}
	if err := tx.Commit(); err != nil {
		return HostedAccessProgress{}, fmt.Errorf("commit hosted access failure: %w", err)
	}
	store.notifyHostedAccessLocked(intentID)
	return progress, nil
}

func appendHostedAccessFailure(
	ctx context.Context,
	tx *sql.Tx,
	intentID string,
	progress HostedAccessProgress,
	reason HostedAccessReasonCode,
	retryable bool,
	now time.Time,
) (HostedAccessProgress, error) {
	if err := appendHostedAccessProgress(
		ctx,
		tx,
		intentID,
		progress,
		HostedAccessProgressNeedsAttention,
		reason,
		retryable,
		timestamp(now),
	); err != nil {
		return HostedAccessProgress{}, err
	}
	return readLatestHostedAccessProgress(ctx, tx, intentID)
}

func replayHostedAccessFailure(
	tx *sql.Tx,
	progress HostedAccessProgress,
	reason HostedAccessReasonCode,
	retryable bool,
) (HostedAccessProgress, error) {
	if progress.ReasonCode == nil ||
		*progress.ReasonCode != reason ||
		progress.Retryable != retryable {
		return HostedAccessProgress{}, errors.New("hosted access failure replay does not match")
	}
	if err := tx.Commit(); err != nil {
		return HostedAccessProgress{}, fmt.Errorf("commit hosted access failure replay: %w", err)
	}
	return progress, nil
}

func (store *Store) HostedAccessTiming(ctx context.Context, intentID string) (HostedAccessTiming, error) {
	if err := validateIdentifier("hosted access intent id", intentID); err != nil {
		return HostedAccessTiming{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	rows, err := store.db.QueryContext(ctx, `
SELECT state, occurred_at
FROM hosted_access_progress
WHERE intent_id = ?
ORDER BY cursor
`, intentID)
	if err != nil {
		return HostedAccessTiming{}, fmt.Errorf("read hosted access timing: %w", err)
	}
	defer rows.Close()
	return readHostedAccessTimingRows(rows)
}

func readHostedAccessTimingRows(rows *sql.Rows) (HostedAccessTiming, error) {
	var accumulator hostedAccessTimingAccumulator
	for rows.Next() {
		var state HostedAccessProgressState
		var occurredAt string
		if err := rows.Scan(&state, &occurredAt); err != nil {
			return HostedAccessTiming{}, fmt.Errorf("scan hosted access timing: %w", err)
		}
		parsed, err := parseStoredTime(occurredAt)
		if err != nil {
			return HostedAccessTiming{}, fmt.Errorf("parse hosted access timing: %w", err)
		}
		if err := accumulator.observe(state, parsed); err != nil {
			return HostedAccessTiming{}, err
		}
	}
	if err := rows.Err(); err != nil {
		return HostedAccessTiming{}, fmt.Errorf("iterate hosted access timing: %w", err)
	}
	if accumulator.ready.IsZero() {
		return HostedAccessTiming{}, errors.New("hosted access timing is not ready")
	}
	return hostedAccessTimingFromTimes([]time.Time{
		accumulator.preparing,
		accumulator.syncing,
		accumulator.ready,
	})
}

type hostedAccessTimingAccumulator struct {
	preparing time.Time
	syncing   time.Time
	ready     time.Time
}

func (timing *hostedAccessTimingAccumulator) observe(
	state HostedAccessProgressState,
	occurredAt time.Time,
) error {
	if !timing.ready.IsZero() {
		return errors.New("hosted access timing contains progress after readiness")
	}
	switch state {
	case HostedAccessProgressPreparingAccess:
		if !timing.preparing.IsZero() {
			return errors.New("hosted access timing contains duplicate preparation")
		}
		timing.preparing = occurredAt
	case HostedAccessProgressSyncingProject:
		if timing.preparing.IsZero() {
			return errors.New("hosted access sync precedes preparation")
		}
		timing.syncing = occurredAt
	case HostedAccessProgressNeedsAttention:
		timing.syncing = time.Time{}
	case HostedAccessProgressReadyOnPhone:
		if timing.preparing.IsZero() || timing.syncing.IsZero() {
			return errors.New("hosted access readiness precedes preparation or sync")
		}
		timing.ready = occurredAt
	default:
		return fmt.Errorf("hosted access timing does not support state %q", state)
	}
	return nil
}

func hostedAccessTimingFromTimes(times []time.Time) (HostedAccessTiming, error) {
	if times[1].Before(times[0]) || times[2].Before(times[1]) {
		return HostedAccessTiming{}, errors.New("hosted access timing timestamps are out of order")
	}
	return HostedAccessTiming{
		CompletedAt:   times[2],
		EnsureToSync:  times[1].Sub(times[0]),
		EnsureToReady: times[2].Sub(times[0]),
		SyncToReady:   times[2].Sub(times[1]),
	}, nil
}

func (store *Store) HostedAccessProgressAfter(
	ctx context.Context,
	intentID string,
	afterCursor string,
) ([]HostedAccessProgress, <-chan struct{}, error) {
	if err := validateIdentifier("hosted access intent id", intentID); err != nil {
		return nil, nil, err
	}
	cursor, err := parseHostedAccessCursor(afterCursor)
	if err != nil {
		return nil, nil, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	progress, err := readHostedAccessProgressAfter(ctx, store.db, intentID, cursor)
	if err != nil {
		return nil, nil, err
	}
	return progress, store.hostedAccessUpdateLocked(intentID), nil
}

func parseHostedAccessCursor(raw string) (int, error) {
	if raw == "" {
		return 0, nil
	}
	cursor, err := strconv.Atoi(raw)
	if err != nil || cursor < 0 {
		return 0, errors.New("hosted access cursor must be a non-negative integer")
	}
	return cursor, nil
}

func readHostedAccessProgressAfter(
	ctx context.Context,
	querier hostedAccessProgressQuerier,
	intentID string,
	afterCursor int,
) ([]HostedAccessProgress, error) {
	rows, err := querier.QueryContext(ctx, `
SELECT intent_id, cursor, state, reason_code, retryable, occurred_at
FROM hosted_access_progress
WHERE intent_id = ? AND cursor > ?
ORDER BY cursor
`, intentID, afterCursor)
	if err != nil {
		return nil, fmt.Errorf("read hosted access progress events: %w", err)
	}
	defer rows.Close()
	var events []HostedAccessProgress
	for rows.Next() {
		var event HostedAccessProgress
		var cursor int
		var reasonCode string
		var retryable int
		if err := rows.Scan(
			&event.IntentID,
			&cursor,
			&event.State,
			&reasonCode,
			&retryable,
			&event.OccurredAt,
		); err != nil {
			return nil, fmt.Errorf("scan hosted access progress event: %w", err)
		}
		event.Cursor = strconv.Itoa(cursor)
		event.ReasonCode = hostedAccessReasonCode(reasonCode)
		event.Retryable = retryable == 1
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate hosted access progress events: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close hosted access progress events: %w", err)
	}
	if len(events) == 0 {
		if err := validateHostedAccessCursor(ctx, querier, intentID, afterCursor); err != nil {
			return nil, err
		}
		return nil, nil
	}
	if events[len(events)-1].State == HostedAccessProgressReadyOnPhone {
		grant, err := readHostedAccessGrant(ctx, querier, intentID)
		if err != nil {
			return nil, err
		}
		events[len(events)-1].AccessGrant = &grant
	}
	return events, nil
}

func validateHostedAccessCursor(
	ctx context.Context,
	querier hostedAccessProgressQuerier,
	intentID string,
	afterCursor int,
) error {
	var count int
	var latestCursor int
	if err := querier.QueryRowContext(ctx, `
SELECT COUNT(DISTINCT i.intent_id), COALESCE(MAX(p.cursor), 0)
FROM hosted_access_intents i
LEFT JOIN hosted_access_progress p ON p.intent_id = i.intent_id
WHERE i.intent_id = ?
`, intentID).Scan(&count, &latestCursor); err != nil {
		return fmt.Errorf("validate hosted access progress intent: %w", err)
	}
	if count != 1 {
		return ErrNotFound
	}
	if afterCursor > latestCursor {
		return errors.New("hosted access cursor is ahead of durable progress")
	}
	return nil
}

func (store *Store) hostedAccessUpdateLocked(intentID string) <-chan struct{} {
	update := store.hostedUpdates[intentID]
	if update == nil {
		update = make(chan struct{})
		store.hostedUpdates[intentID] = update
	}
	return update
}

func (store *Store) notifyHostedAccessLocked(intentID string) {
	update := store.hostedUpdates[intentID]
	if update == nil {
		return
	}
	close(update)
	delete(store.hostedUpdates, intentID)
}

func validateHostedAccessCompletion(
	ctx context.Context,
	tx *sql.Tx,
	intentID string,
	created CreatedDeviceGrant,
	now string,
) error {
	var currentRuntime sql.NullString
	err := tx.QueryRowContext(ctx, `
SELECT i.runtime_name
FROM hosted_access_intents i
JOIN users u ON u.id = i.user_id
JOIN runtimes r ON r.name = ? AND r.user_id = i.user_id
JOIN devices d ON d.id = ? AND d.user_id = i.user_id
JOIN runtime_access_grants g ON g.device_id = d.id AND g.runtime_name = r.name
WHERE i.intent_id = ?
  AND i.client_device_id = d.id
  AND u.status = ?
  AND u.active_runtime_name = r.name
  AND r.lifecycle = ?
  AND r.access_state = ?
  AND d.revoked_at IS NULL
  AND g.revoked_at IS NULL
  AND g.expires_at > ?
`, created.Grant.RuntimeName, created.Device.ID, intentID, UserStatusActive,
		RuntimeLifecycleReady, RuntimeAccessEnabled, now).Scan(&currentRuntime)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("validate hosted access completion: %w", err)
	}
	if currentRuntime.Valid && currentRuntime.String != created.Grant.RuntimeName {
		return ErrIdempotencyConflict
	}
	if !currentRuntime.Valid {
		if _, err := tx.ExecContext(ctx, `
UPDATE hosted_access_intents SET runtime_name = ?, updated_at = ? WHERE intent_id = ?
`, created.Grant.RuntimeName, now, intentID); err != nil {
			return fmt.Errorf("bind hosted access runtime: %w", err)
		}
	}
	return nil
}

func appendHostedAccessReady(
	ctx context.Context,
	tx *sql.Tx,
	intentID string,
	latest HostedAccessProgress,
	now string,
) error {
	if latest.State != HostedAccessProgressSyncingProject {
		return fmt.Errorf("hosted access cannot become ready from state %q", latest.State)
	}
	return appendHostedAccessProgress(
		ctx,
		tx,
		intentID,
		latest,
		HostedAccessProgressReadyOnPhone,
		HostedAccessReasonNone,
		false,
		now,
	)
}

func appendHostedAccessProgress(
	ctx context.Context,
	tx *sql.Tx,
	intentID string,
	latest HostedAccessProgress,
	state HostedAccessProgressState,
	reason HostedAccessReasonCode,
	retryable bool,
	now string,
) error {
	cursor, err := strconv.Atoi(latest.Cursor)
	if err != nil {
		return fmt.Errorf("parse hosted access cursor: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO hosted_access_progress (
  intent_id, cursor, state, reason_code, retryable, occurred_at
) VALUES (?, ?, ?, ?, ?, ?)
`, intentID, cursor+1, state, reason, retryable, now); err != nil {
		return fmt.Errorf("append hosted access progress: %w", err)
	}
	return nil
}

func hostedAccessReasonCode(value string) *HostedAccessReasonCode {
	if value == "" {
		return nil
	}
	reason := HostedAccessReasonCode(value)
	return &reason
}

func readHostedAccessGrant(
	ctx context.Context,
	querier hostedAccessProgressQuerier,
	intentID string,
) (HostedAccessGrant, error) {
	rows, err := querier.QueryContext(ctx, `
SELECT i.client_device_id, i.project_id, i.workstream_id, c.capability, g.expires_at
FROM hosted_access_intents i
JOIN hosted_access_capabilities c ON c.intent_id = i.intent_id
JOIN runtime_access_grants g
  ON g.device_id = i.client_device_id AND g.runtime_name = i.runtime_name
WHERE i.intent_id = ?
ORDER BY c.capability
`, intentID)
	if err != nil {
		return HostedAccessGrant{}, fmt.Errorf("read hosted access grant: %w", err)
	}
	defer rows.Close()
	var grant HostedAccessGrant
	for rows.Next() {
		var capability HostedAccessCapability
		if err := rows.Scan(
			&grant.DeviceID,
			&grant.ProjectID,
			&grant.WorkstreamID,
			&capability,
			&grant.ExpiresAt,
		); err != nil {
			return HostedAccessGrant{}, fmt.Errorf("scan hosted access grant: %w", err)
		}
		grant.GrantedCapabilities = append(grant.GrantedCapabilities, capability)
	}
	if err := rows.Err(); err != nil {
		return HostedAccessGrant{}, fmt.Errorf("iterate hosted access grant: %w", err)
	}
	if len(grant.GrantedCapabilities) == 0 {
		return HostedAccessGrant{}, ErrNotFound
	}
	return grant, nil
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
