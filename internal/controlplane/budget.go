package controlplane

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"

	"setta/internal/runtimeprovider"
)

type UserBudgetPolicy struct {
	UserID                  string
	PeriodStart             time.Time
	PeriodEnd               time.Time
	CoveredLimitUSDMicros   int64
	SafetyReserveUSDMicros  int64
	CutoffExposureUSDMicros int64
	MaximumCutoffLag        time.Duration
	AccruedUSDMicros        int64
	CutoffRequiredAt        *time.Time
	UpdatedAt               time.Time
}

func (policy UserBudgetPolicy) EnforcedBudgetUSDMicros() int64 {
	return policy.CoveredLimitUSDMicros -
		policy.SafetyReserveUSDMicros -
		policy.CutoffExposureUSDMicros
}

type SetUserBudgetPolicyRequest struct {
	UserID                  string
	PeriodStart             time.Time
	PeriodEnd               time.Time
	CoveredLimitUSDMicros   int64
	SafetyReserveUSDMicros  int64
	CutoffExposureUSDMicros int64
	MaximumCutoffLag        time.Duration
}

type RecordUsageIntervalRequest struct {
	IdempotencyKey       string
	UserID               string
	RuntimeName          string
	IntervalStart        time.Time
	IntervalEnd          time.Time
	MeasurementSource    runtimeprovider.UsageBasis
	CoveredCostUSDMicros int64
}

type UsageInterval struct {
	IdempotencyKey          string
	UserID                  string
	RuntimeName             string
	IntervalStart           time.Time
	IntervalEnd             time.Time
	MeasurementSource       runtimeprovider.UsageBasis
	CoveredCostUSDMicros    int64
	CumulativeCostUSDMicros int64
	EnforcedBudgetUSDMicros int64
	CutoffRequired          bool
	RecordedAt              time.Time
	BudgetPeriodStart       time.Time
}

func (store *Store) SetUserBudgetPolicy(
	ctx context.Context,
	request SetUserBudgetPolicyRequest,
) (UserBudgetPolicy, error) {
	if err := validateUserBudgetPolicyRequest(request); err != nil {
		return UserBudgetPolicy{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	now := store.clock().UTC()
	_, err := store.db.ExecContext(ctx, `
INSERT INTO user_budget_policies (
  user_id, period_start, period_end, covered_limit_usd_micros,
  safety_reserve_usd_micros, cutoff_exposure_usd_micros,
  maximum_cutoff_lag_ns, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(user_id) DO UPDATE SET
  period_start = excluded.period_start,
  period_end = excluded.period_end,
  covered_limit_usd_micros = excluded.covered_limit_usd_micros,
  safety_reserve_usd_micros = excluded.safety_reserve_usd_micros,
  cutoff_exposure_usd_micros = excluded.cutoff_exposure_usd_micros,
  maximum_cutoff_lag_ns = excluded.maximum_cutoff_lag_ns,
  accrued_usd_micros = 0,
  cutoff_required_at = NULL,
  updated_at = excluded.updated_at
WHERE user_budget_policies.period_end <= excluded.period_start
`, request.UserID, timestamp(request.PeriodStart), timestamp(request.PeriodEnd),
		request.CoveredLimitUSDMicros, request.SafetyReserveUSDMicros,
		request.CutoffExposureUSDMicros, request.MaximumCutoffLag, timestamp(now))
	if err != nil {
		return UserBudgetPolicy{}, fmt.Errorf("set user budget policy: %w", err)
	}
	policy, err := readUserBudgetPolicy(ctx, store.db, request.UserID)
	if err != nil {
		return UserBudgetPolicy{}, err
	}
	if !sameBudgetPolicyRequest(policy, request) {
		return UserBudgetPolicy{}, ErrIdempotencyConflict
	}
	return policy, nil
}

func (store *Store) UserBudgetPolicy(ctx context.Context, userID string) (UserBudgetPolicy, error) {
	if err := validateIdentifier("user id", userID); err != nil {
		return UserBudgetPolicy{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return readUserBudgetPolicy(ctx, store.db, userID)
}

func (store *Store) RecordUsageInterval(
	ctx context.Context,
	request RecordUsageIntervalRequest,
) (UsageInterval, error) {
	if err := validateRecordUsageIntervalRequest(request); err != nil {
		return UsageInterval{}, err
	}
	fingerprint, err := usageIntervalFingerprint(request)
	if err != nil {
		return UsageInterval{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	deviceIDs, err := store.readUserDeviceIDsLocked(ctx, request.UserID)
	if err != nil {
		return UsageInterval{}, err
	}
	interval, hostedIntentIDs, err := store.recordUsageIntervalLocked(ctx, request, fingerprint)
	if err != nil {
		return UsageInterval{}, err
	}
	if interval.CutoffRequired {
		store.invalidateRuntimeLocked(request.RuntimeName)
		store.notifyOperationWakeLocked()
		for _, deviceID := range deviceIDs {
			store.invalidateDeviceLocked(deviceID)
		}
		for _, intentID := range hostedIntentIDs {
			store.notifyHostedAccessLocked(intentID)
		}
	}
	return interval, nil
}

func (store *Store) recordUsageIntervalLocked(
	ctx context.Context,
	request RecordUsageIntervalRequest,
	fingerprint string,
) (UsageInterval, []string, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return UsageInterval{}, nil, fmt.Errorf("begin usage interval: %w", err)
	}
	defer rollback(tx)
	replayed, found, err := replayUsageInterval(ctx, tx, request.IdempotencyKey, fingerprint)
	if err != nil {
		return UsageInterval{}, nil, err
	}
	if found {
		return replayed, nil, nil
	}
	policy, err := readUserBudgetPolicy(ctx, tx, request.UserID)
	if err != nil {
		return UsageInterval{}, nil, err
	}
	if err := validateUsageIntervalTarget(ctx, tx, request, policy); err != nil {
		return UsageInterval{}, nil, err
	}
	interval, err := buildUsageInterval(request, policy, store.clock().UTC())
	if err != nil {
		return UsageInterval{}, nil, err
	}
	hostedIntentIDs, err := persistUsageInterval(ctx, tx, interval, fingerprint)
	if err != nil {
		return UsageInterval{}, nil, err
	}
	return interval, hostedIntentIDs, nil
}

func replayUsageInterval(
	ctx context.Context,
	tx *sql.Tx,
	idempotencyKey string,
	fingerprint string,
) (UsageInterval, bool, error) {
	replayed, found, err := readUsageIntervalByID(ctx, tx, idempotencyKey)
	if err != nil || !found {
		return UsageInterval{}, found, err
	}
	if replayed.fingerprint != fingerprint {
		return UsageInterval{}, false, ErrIdempotencyConflict
	}
	return replayed.interval, true, nil
}

func persistUsageInterval(
	ctx context.Context,
	tx *sql.Tx,
	interval UsageInterval,
	fingerprint string,
) ([]string, error) {
	if err := insertUsageInterval(ctx, tx, interval, fingerprint); err != nil {
		return nil, err
	}
	if err := updateBudgetAfterUsage(ctx, tx, interval); err != nil {
		return nil, err
	}
	var hostedIntentIDs []string
	if interval.CutoffRequired {
		var err error
		hostedIntentIDs, err = suspendBudgetTarget(
			ctx,
			tx,
			interval.UserID,
			interval.RuntimeName,
			interval.RecordedAt,
		)
		if err != nil {
			return nil, err
		}
		if err := insertBudgetCutoffOperation(ctx, tx, interval); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit usage interval: %w", err)
	}
	return hostedIntentIDs, nil
}

func insertBudgetCutoffOperation(ctx context.Context, tx *sql.Tx, interval UsageInterval) error {
	operationID := budgetCutoffOperationID(interval.UserID, interval.BudgetPeriodStart)
	now := timestamp(interval.RecordedAt)
	_, err := tx.ExecContext(ctx, `
INSERT INTO budget_cutoff_operations (
  idempotency_key, user_id, runtime_name, period_start, status,
  attempt_count, fence_token, next_attempt_at, last_error_code, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, 0, 0, ?, '', ?, ?)
ON CONFLICT(user_id, period_start) DO NOTHING
`, operationID, interval.UserID, interval.RuntimeName, timestamp(interval.BudgetPeriodStart),
		RuntimeOperationPending, now, now, now)
	if err != nil {
		return fmt.Errorf("record budget cutoff operation: %w", err)
	}
	return nil
}

func budgetCutoffOperationID(userID string, periodStart time.Time) string {
	digest := sha256.Sum256([]byte(userID + "\x00" + timestamp(periodStart)))
	return "budget_" + hex.EncodeToString(digest[:16])
}

func buildUsageInterval(
	request RecordUsageIntervalRequest,
	policy UserBudgetPolicy,
	recordedAt time.Time,
) (UsageInterval, error) {
	cumulative, err := addBudgetMicros(policy.AccruedUSDMicros, request.CoveredCostUSDMicros)
	if err != nil {
		return UsageInterval{}, err
	}
	enforcedBudget := policy.EnforcedBudgetUSDMicros()
	return UsageInterval{
		IdempotencyKey:          request.IdempotencyKey,
		UserID:                  request.UserID,
		RuntimeName:             request.RuntimeName,
		IntervalStart:           request.IntervalStart.UTC(),
		IntervalEnd:             request.IntervalEnd.UTC(),
		MeasurementSource:       request.MeasurementSource,
		CoveredCostUSDMicros:    request.CoveredCostUSDMicros,
		CumulativeCostUSDMicros: cumulative,
		EnforcedBudgetUSDMicros: enforcedBudget,
		CutoffRequired:          cumulative >= enforcedBudget,
		RecordedAt:              recordedAt,
		BudgetPeriodStart:       policy.PeriodStart,
	}, nil
}

func validateUserBudgetPolicyRequest(request SetUserBudgetPolicyRequest) error {
	if err := validateIdentifier("user id", request.UserID); err != nil {
		return err
	}
	if request.PeriodStart.IsZero() || !request.PeriodEnd.After(request.PeriodStart) {
		return errors.New("user budget period is invalid")
	}
	if request.CoveredLimitUSDMicros <= 0 ||
		request.SafetyReserveUSDMicros < 0 ||
		request.CutoffExposureUSDMicros < 0 ||
		request.MaximumCutoffLag <= 0 {
		return errors.New("user budget amounts are invalid")
	}
	reserved, err := addBudgetMicros(request.SafetyReserveUSDMicros, request.CutoffExposureUSDMicros)
	if err != nil || reserved >= request.CoveredLimitUSDMicros {
		return errors.New("user budget reserve and cutoff exposure must be below its limit")
	}
	return nil
}

func validateRecordUsageIntervalRequest(request RecordUsageIntervalRequest) error {
	if err := validateIdentifier("usage idempotency key", request.IdempotencyKey); err != nil {
		return err
	}
	if err := validateIdentifier("user id", request.UserID); err != nil {
		return err
	}
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return err
	}
	if request.IntervalStart.IsZero() || !request.IntervalEnd.After(request.IntervalStart) {
		return errors.New("usage interval is invalid")
	}
	if request.MeasurementSource != runtimeprovider.UsageBasisSettaConservative {
		return errors.New("hard budget usage requires Setta-conservative measurement")
	}
	if request.CoveredCostUSDMicros < 0 {
		return errors.New("usage interval cost cannot be negative")
	}
	return nil
}

func validateUsageIntervalTarget(
	ctx context.Context,
	tx *sql.Tx,
	request RecordUsageIntervalRequest,
	policy UserBudgetPolicy,
) error {
	if request.IntervalStart.Before(policy.PeriodStart) || request.IntervalEnd.After(policy.PeriodEnd) {
		return errors.New("usage interval is outside the enforced budget period")
	}
	var owner string
	if err := tx.QueryRowContext(ctx, `SELECT user_id FROM runtimes WHERE name = ?`, request.RuntimeName).Scan(&owner); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("read usage interval runtime owner: %w", err)
	}
	if owner != request.UserID {
		return errors.New("usage interval runtime owner does not match its user")
	}
	var previousEnd sql.NullString
	if err := tx.QueryRowContext(ctx, `
SELECT MAX(interval_end) FROM usage_intervals WHERE user_id = ?
  AND interval_start >= ?
`, request.UserID, timestamp(policy.PeriodStart)).Scan(&previousEnd); err != nil {
		return fmt.Errorf("read previous usage interval: %w", err)
	}
	expectedStart := policy.PeriodStart
	if previousEnd.Valid {
		var err error
		expectedStart, err = parseBudgetTimestamp(previousEnd.String)
		if err != nil {
			return err
		}
	}
	if !request.IntervalStart.Equal(expectedStart) {
		return errors.New("usage intervals must cover the budget period contiguously")
	}
	return nil
}

type persistedUsageInterval struct {
	interval    UsageInterval
	fingerprint string
}

func readUsageIntervalByID(
	ctx context.Context,
	query interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	idempotencyKey string,
) (persistedUsageInterval, bool, error) {
	var persisted persistedUsageInterval
	var budgetStart, start, end, recorded string
	var cutoff int
	err := query.QueryRowContext(ctx, `
SELECT request_fingerprint, user_id, runtime_name, interval_start, interval_end,
       budget_period_start, measurement_source, covered_cost_usd_micros, cumulative_cost_usd_micros,
       enforced_budget_usd_micros, cutoff_required, recorded_at
FROM usage_intervals WHERE idempotency_key = ?
`, idempotencyKey).Scan(
		&persisted.fingerprint,
		&persisted.interval.UserID,
		&persisted.interval.RuntimeName,
		&start,
		&end,
		&budgetStart,
		&persisted.interval.MeasurementSource,
		&persisted.interval.CoveredCostUSDMicros,
		&persisted.interval.CumulativeCostUSDMicros,
		&persisted.interval.EnforcedBudgetUSDMicros,
		&cutoff,
		&recorded,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return persistedUsageInterval{}, false, nil
	}
	if err != nil {
		return persistedUsageInterval{}, false, fmt.Errorf("read usage interval: %w", err)
	}
	persisted.interval.IdempotencyKey = idempotencyKey
	persisted.interval.CutoffRequired = cutoff != 0
	persisted.interval.BudgetPeriodStart, err = parseBudgetTimestamp(budgetStart)
	if err == nil {
		persisted.interval.IntervalStart, err = parseBudgetTimestamp(start)
	}
	if err == nil {
		persisted.interval.IntervalEnd, err = parseBudgetTimestamp(end)
	}
	if err == nil {
		persisted.interval.RecordedAt, err = parseBudgetTimestamp(recorded)
	}
	if err != nil {
		return persistedUsageInterval{}, false, err
	}
	return persisted, true, nil
}

func readUserBudgetPolicy(
	ctx context.Context,
	query interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	userID string,
) (UserBudgetPolicy, error) {
	policy := UserBudgetPolicy{UserID: userID}
	var periodStart, periodEnd, updated string
	var cutoffRequiredAt sql.NullString
	err := query.QueryRowContext(ctx, `
SELECT period_start, period_end, covered_limit_usd_micros,
       safety_reserve_usd_micros, cutoff_exposure_usd_micros,
       maximum_cutoff_lag_ns, accrued_usd_micros, cutoff_required_at, updated_at
FROM user_budget_policies WHERE user_id = ?
`, userID).Scan(
		&periodStart,
		&periodEnd,
		&policy.CoveredLimitUSDMicros,
		&policy.SafetyReserveUSDMicros,
		&policy.CutoffExposureUSDMicros,
		&policy.MaximumCutoffLag,
		&policy.AccruedUSDMicros,
		&cutoffRequiredAt,
		&updated,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return UserBudgetPolicy{}, ErrNotFound
	}
	if err != nil {
		return UserBudgetPolicy{}, fmt.Errorf("read user budget policy: %w", err)
	}
	var parseErr error
	policy.PeriodStart, parseErr = parseBudgetTimestamp(periodStart)
	if parseErr == nil {
		policy.PeriodEnd, parseErr = parseBudgetTimestamp(periodEnd)
	}
	if parseErr == nil {
		policy.UpdatedAt, parseErr = parseBudgetTimestamp(updated)
	}
	if parseErr == nil && cutoffRequiredAt.Valid {
		value, err := parseBudgetTimestamp(cutoffRequiredAt.String)
		parseErr = err
		policy.CutoffRequiredAt = &value
	}
	if parseErr != nil {
		return UserBudgetPolicy{}, parseErr
	}
	return policy, nil
}

func insertUsageInterval(
	ctx context.Context,
	tx *sql.Tx,
	interval UsageInterval,
	fingerprint string,
) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO usage_intervals (
  idempotency_key, request_fingerprint, user_id, runtime_name,
  budget_period_start, interval_start, interval_end, measurement_source,
  covered_cost_usd_micros, cumulative_cost_usd_micros,
  enforced_budget_usd_micros, cutoff_required, recorded_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, interval.IdempotencyKey, fingerprint, interval.UserID, interval.RuntimeName,
		timestamp(interval.BudgetPeriodStart), timestamp(interval.IntervalStart),
		timestamp(interval.IntervalEnd), interval.MeasurementSource,
		interval.CoveredCostUSDMicros, interval.CumulativeCostUSDMicros,
		interval.EnforcedBudgetUSDMicros, interval.CutoffRequired, timestamp(interval.RecordedAt))
	if err != nil {
		return fmt.Errorf("insert usage interval: %w", err)
	}
	return nil
}

func updateBudgetAfterUsage(ctx context.Context, tx *sql.Tx, interval UsageInterval) error {
	var cutoff any
	if interval.CutoffRequired {
		cutoff = timestamp(interval.RecordedAt)
	}
	_, err := tx.ExecContext(ctx, `
UPDATE user_budget_policies
SET accrued_usd_micros = ?,
    cutoff_required_at = COALESCE(cutoff_required_at, ?),
    updated_at = ?
WHERE user_id = ?
`, interval.CumulativeCostUSDMicros, cutoff, timestamp(interval.RecordedAt), interval.UserID)
	if err != nil {
		return fmt.Errorf("update user budget after usage: %w", err)
	}
	return nil
}

func suspendBudgetTarget(
	ctx context.Context,
	tx *sql.Tx,
	userID string,
	runtimeName string,
	at time.Time,
) ([]string, error) {
	now := timestamp(at)
	if _, err := tx.ExecContext(ctx, `
UPDATE users SET status = ?, updated_at = ? WHERE id = ?
`, UserStatusSuspended, now, userID); err != nil {
		return nil, fmt.Errorf("suspend budget user: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
UPDATE runtimes SET access_state = ?, updated_at = ? WHERE name = ? AND user_id = ?
`, RuntimeAccessSuspended, now, runtimeName, userID); err != nil {
		return nil, fmt.Errorf("suspend budget runtime access: %w", err)
	}
	intentIDs, err := appendHostedAccessSuspensions(ctx, tx, userID, now)
	if err != nil {
		return nil, err
	}
	return intentIDs, nil
}

func usageIntervalFingerprint(request RecordUsageIntervalRequest) (string, error) {
	encoded, err := json.Marshal(request)
	if err != nil {
		return "", fmt.Errorf("encode usage interval fingerprint: %w", err)
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), nil
}

func sameBudgetPolicyRequest(policy UserBudgetPolicy, request SetUserBudgetPolicyRequest) bool {
	return policy.UserID == request.UserID &&
		policy.PeriodStart.Equal(request.PeriodStart) &&
		policy.PeriodEnd.Equal(request.PeriodEnd) &&
		policy.CoveredLimitUSDMicros == request.CoveredLimitUSDMicros &&
		policy.SafetyReserveUSDMicros == request.SafetyReserveUSDMicros &&
		policy.CutoffExposureUSDMicros == request.CutoffExposureUSDMicros &&
		policy.MaximumCutoffLag == request.MaximumCutoffLag
}

func addBudgetMicros(first int64, second int64) (int64, error) {
	if first < 0 || second < 0 || first > math.MaxInt64-second {
		return 0, errors.New("user budget amount overflow")
	}
	return first + second, nil
}

func parseBudgetTimestamp(raw string) (time.Time, error) {
	value, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse budget timestamp: %w", err)
	}
	return value, nil
}
