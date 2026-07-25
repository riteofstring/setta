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
	"reflect"
	"time"

	"setta/internal/runtimeaccounting"
	"setta/internal/runtimecost"
	"setta/internal/runtimeprovider"
)

type FinalizeRuntimeAccountingWindowRequest struct {
	IdempotencyKey string
	UserID         string
	RuntimeName    string
	WindowEnd      time.Time
}

type FinalizedRuntimeAccountingWindow struct {
	Evidence    runtimeaccounting.Evidence
	Interval    UsageInterval
	FinalizedAt time.Time
}

type accountingWindowPosition struct {
	StartSequence uint64
	PreviousEnd   *time.Time
}

type accountingWindowInputs struct {
	Runtime       Runtime
	Policy        UserBudgetPolicy
	Ledger        *runtimeaccounting.Ledger
	BoundaryState runtimeaccounting.LedgerState
	Closed        runtimeaccounting.ClosedWindow
	EndSequence   uint64
	EventsSHA256  string
	Position      accountingWindowPosition
}

type accountingWindowState struct {
	Runtime        Runtime
	Policy         UserBudgetPolicy
	Ledger         *runtimeaccounting.Ledger
	BoundaryLedger *runtimeaccounting.Ledger
	Position       accountingWindowPosition
}

func (store *Store) FinalizeRuntimeAccountingWindow(
	ctx context.Context,
	request FinalizeRuntimeAccountingWindowRequest,
	schedule runtimecost.PriceSchedule,
) (FinalizedRuntimeAccountingWindow, error) {
	if err := validateFinalizeRuntimeAccountingWindowRequest(request); err != nil {
		return FinalizedRuntimeAccountingWindow{}, err
	}
	fingerprint, err := accountingWindowRequestFingerprint(request)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	replayed, found, err := readFinalizedRuntimeAccountingWindow(
		ctx, store.db, request.IdempotencyKey, fingerprint,
	)
	if err != nil || found {
		return replayed, err
	}
	deviceIDs, err := store.readUserDeviceIDsLocked(ctx, request.UserID)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, fmt.Errorf("begin accounting window finalization: %w", err)
	}
	defer rollback(tx)
	finalized, hostedIntentIDs, err := store.finalizeRuntimeAccountingWindowTx(
		ctx, tx, request, fingerprint, schedule,
	)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, err
	}
	if err := tx.Commit(); err != nil {
		return FinalizedRuntimeAccountingWindow{}, fmt.Errorf("commit accounting window finalization: %w", err)
	}
	store.applyUsageIntervalEffectsLocked(finalized.Interval, deviceIDs, hostedIntentIDs)
	return finalized, nil
}

func (store *Store) finalizeRuntimeAccountingWindowTx(
	ctx context.Context,
	tx *sql.Tx,
	request FinalizeRuntimeAccountingWindowRequest,
	fingerprint string,
	schedule runtimecost.PriceSchedule,
) (FinalizedRuntimeAccountingWindow, []string, error) {
	now := store.clock().UTC()
	inputs, err := loadAccountingWindowInputs(ctx, tx, request, now)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, nil, err
	}
	evidence, err := finalizeStoredRuntimeAccountingEvidence(
		inputs.Runtime, inputs.Policy, schedule, inputs.Closed, inputs.EventsSHA256, now,
	)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, nil, err
	}
	if evidence.Cutoff.CutoffExposureUSDMicros != uint64(inputs.Policy.CutoffExposureUSDMicros) {
		return FinalizedRuntimeAccountingWindow{}, nil,
			errors.New("user budget cutoff exposure does not match the enforced runtime resources")
	}
	evidenceRequest := RecordUsageEvidenceRequest{
		IdempotencyKey: request.IdempotencyKey,
		UserID:         request.UserID,
		Evidence:       evidence,
	}
	submissionFingerprint, err := usageEvidenceFingerprint(evidenceRequest)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, nil, err
	}
	intervalRequest, err := usageIntervalRequestFromEvidence(evidenceRequest, schedule, submissionFingerprint)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, nil, err
	}
	interval, hostedIntentIDs, err := store.recordUsageIntervalTx(
		ctx, tx, intervalRequest, submissionFingerprint,
	)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, nil, err
	}
	finalized := FinalizedRuntimeAccountingWindow{
		Evidence: evidence, Interval: interval, FinalizedAt: now,
	}
	if err := persistFinalizedRuntimeAccountingWindow(
		ctx, tx, request, fingerprint, inputs.Position.StartSequence,
		inputs.EndSequence, finalized, inputs.Ledger.Snapshot(), inputs.BoundaryState,
	); err != nil {
		return FinalizedRuntimeAccountingWindow{}, nil, err
	}
	return finalized, hostedIntentIDs, nil
}

func loadAccountingWindowInputs(
	ctx context.Context,
	tx *sql.Tx,
	request FinalizeRuntimeAccountingWindowRequest,
	now time.Time,
) (accountingWindowInputs, error) {
	if request.WindowEnd.After(now) {
		return accountingWindowInputs{}, errors.New("accounting window cannot end in the future")
	}
	state, err := readAccountingWindowState(ctx, tx, request)
	if err != nil {
		return accountingWindowInputs{}, err
	}
	ledger, boundaryState, closed, endSequence, err := replayAccountingWindow(
		ctx,
		tx,
		request.RuntimeName,
		request.WindowEnd,
		state,
	)
	if err != nil {
		return accountingWindowInputs{}, err
	}
	eventsSHA256, err := hashRuntimeAccountingEventRange(
		ctx, tx, request.RuntimeName, state.Position.StartSequence, endSequence,
	)
	if err != nil {
		return accountingWindowInputs{}, err
	}
	return accountingWindowInputs{
		Runtime: state.Runtime, Policy: state.Policy, Ledger: ledger,
		BoundaryState: boundaryState, Closed: closed, EndSequence: endSequence,
		EventsSHA256: eventsSHA256, Position: state.Position,
	}, nil
}

func readAccountingWindowState(
	ctx context.Context,
	tx *sql.Tx,
	request FinalizeRuntimeAccountingWindowRequest,
) (accountingWindowState, error) {
	runtime, err := readAccountingRuntime(ctx, tx, request.RuntimeName)
	if err != nil {
		return accountingWindowState{}, err
	}
	if runtime.UserID != request.UserID {
		return accountingWindowState{}, errors.New("accounting window runtime owner does not match its user")
	}
	policy, err := readUserBudgetPolicy(ctx, tx, request.UserID)
	if err != nil {
		return accountingWindowState{}, err
	}
	ledger, found, err := readRuntimeAccountingLedger(ctx, tx, request.RuntimeName)
	if err != nil {
		return accountingWindowState{}, err
	}
	if !found {
		return accountingWindowState{}, errors.New("runtime accounting ledger is unavailable")
	}
	boundaryLedger, err := readRuntimeAccountingBoundary(ctx, tx, request.RuntimeName)
	if err != nil {
		return accountingWindowState{}, err
	}
	position, err := readAccountingWindowPosition(ctx, tx, request.RuntimeName)
	if err != nil {
		return accountingWindowState{}, err
	}
	if position.PreviousEnd != nil &&
		!boundaryLedger.Snapshot().WindowStart.Equal(*position.PreviousEnd) {
		return accountingWindowState{}, errors.New("runtime accounting window does not continue its finalized history")
	}
	return accountingWindowState{
		Runtime: runtime, Policy: policy, Ledger: ledger,
		BoundaryLedger: boundaryLedger, Position: position,
	}, nil
}

func readRuntimeAccountingBoundary(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
) (*runtimeaccounting.Ledger, error) {
	var encoded []byte
	if err := tx.QueryRowContext(ctx, `
SELECT boundary_state_json
FROM runtime_accounting_ledgers
WHERE runtime_name = ?
`, runtimeName).Scan(&encoded); err != nil {
		return nil, fmt.Errorf("read runtime accounting boundary: %w", err)
	}
	var state runtimeaccounting.LedgerState
	if err := json.Unmarshal(encoded, &state); err != nil {
		return nil, fmt.Errorf("decode runtime accounting boundary: %w", err)
	}
	ledger, err := runtimeaccounting.RestoreLedger(state)
	if err != nil {
		return nil, fmt.Errorf("restore runtime accounting boundary: %w", err)
	}
	return ledger, nil
}

func replayAccountingWindow(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
	windowEnd time.Time,
	state accountingWindowState,
) (
	*runtimeaccounting.Ledger,
	runtimeaccounting.LedgerState,
	runtimeaccounting.ClosedWindow,
	uint64,
	error,
) {
	events, err := readRuntimeAccountingEventsAfter(
		ctx,
		tx,
		runtimeName,
		state.Position.StartSequence,
	)
	if err != nil {
		return nil, runtimeaccounting.LedgerState{}, runtimeaccounting.ClosedWindow{}, 0, err
	}
	if err := verifyAccountingLedgerEvents(state, events); err != nil {
		return nil, runtimeaccounting.LedgerState{}, runtimeaccounting.ClosedWindow{}, 0,
			err
	}
	return closeReplayedAccountingWindow(state, events, windowEnd)
}

func verifyAccountingLedgerEvents(
	state accountingWindowState,
	events []runtimeaccounting.ActivityEvent,
) error {
	verified, err := runtimeaccounting.RestoreLedger(state.BoundaryLedger.Snapshot())
	if err != nil {
		return err
	}
	for _, event := range events {
		if err := verified.Apply(event); err != nil {
			return err
		}
	}
	if !reflect.DeepEqual(verified.Snapshot(), state.Ledger.Snapshot()) {
		return errors.New("runtime accounting ledger does not match its durable event stream")
	}
	return nil
}

func closeReplayedAccountingWindow(
	state accountingWindowState,
	events []runtimeaccounting.ActivityEvent,
	windowEnd time.Time,
) (
	*runtimeaccounting.Ledger,
	runtimeaccounting.LedgerState,
	runtimeaccounting.ClosedWindow,
	uint64,
	error,
) {
	ledger, err := runtimeaccounting.RestoreLedger(state.BoundaryLedger.Snapshot())
	if err != nil {
		return nil, runtimeaccounting.LedgerState{}, runtimeaccounting.ClosedWindow{}, 0, err
	}
	endSequence := state.Position.StartSequence
	nextEvent := 0
	for nextEvent < len(events) && !events[nextEvent].At.After(windowEnd) {
		if err := ledger.Apply(events[nextEvent]); err != nil {
			return nil, runtimeaccounting.LedgerState{}, runtimeaccounting.ClosedWindow{}, 0, err
		}
		endSequence = events[nextEvent].Sequence
		nextEvent++
	}
	closed, err := ledger.Close(windowEnd)
	if err != nil {
		return nil, runtimeaccounting.LedgerState{}, runtimeaccounting.ClosedWindow{}, 0, err
	}
	ledger.CompactAppliedEvents()
	boundaryState := ledger.Snapshot()
	for ; nextEvent < len(events); nextEvent++ {
		if err := ledger.Apply(events[nextEvent]); err != nil {
			return nil, runtimeaccounting.LedgerState{}, runtimeaccounting.ClosedWindow{}, 0, err
		}
	}
	return ledger, boundaryState, closed, endSequence, nil
}

func readRuntimeAccountingEventsAfter(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
	startSequence uint64,
) ([]runtimeaccounting.ActivityEvent, error) {
	rows, err := tx.QueryContext(ctx, `
SELECT sequence, event_json
FROM runtime_accounting_events
WHERE runtime_name = ? AND sequence > ?
ORDER BY sequence
`, runtimeName, startSequence)
	if err != nil {
		return nil, fmt.Errorf("read accounting replay events: %w", err)
	}
	defer rows.Close()
	events := make([]runtimeaccounting.ActivityEvent, 0)
	nextSequence := startSequence + 1
	for rows.Next() {
		var sequence uint64
		var encoded []byte
		if err := rows.Scan(&sequence, &encoded); err != nil {
			return nil, fmt.Errorf("scan accounting replay event: %w", err)
		}
		if sequence != nextSequence {
			return nil, errors.New("accounting replay event sequence is incomplete")
		}
		var event runtimeaccounting.ActivityEvent
		if err := json.Unmarshal(encoded, &event); err != nil {
			return nil, fmt.Errorf("decode accounting replay event: %w", err)
		}
		if event.Sequence != sequence {
			return nil, errors.New("accounting replay event sequence does not match its record")
		}
		events = append(events, event)
		nextSequence++
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate accounting replay events: %w", err)
	}
	return events, nil
}

func validateFinalizeRuntimeAccountingWindowRequest(request FinalizeRuntimeAccountingWindowRequest) error {
	if err := validateIdentifier("accounting window idempotency key", request.IdempotencyKey); err != nil {
		return err
	}
	if err := validateIdentifier("user id", request.UserID); err != nil {
		return err
	}
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return err
	}
	if request.WindowEnd.IsZero() {
		return errors.New("accounting window end is required")
	}
	return nil
}

func readAccountingRuntime(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
) (Runtime, error) {
	var runtime Runtime
	err := tx.QueryRowContext(ctx, `
SELECT user_id, cpu_core_millionths, memory_bytes, storage_bytes
FROM runtimes
WHERE name = ?
`, runtimeName).Scan(
		&runtime.UserID,
		&runtime.Resources.CPUCoreMillionths,
		&runtime.Resources.MemoryBytes,
		&runtime.Resources.StorageBytes,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Runtime{}, ErrNotFound
	}
	if err != nil {
		return Runtime{}, fmt.Errorf("read accounting runtime: %w", err)
	}
	runtime.Name = runtimeName
	if err := runtime.Resources.Validate(); err != nil {
		return Runtime{}, err
	}
	return runtime, nil
}

func readAccountingWindowPosition(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
) (accountingWindowPosition, error) {
	var position accountingWindowPosition
	var previousEnd sql.NullString
	if err := tx.QueryRowContext(ctx, `
SELECT COALESCE(MAX(end_sequence), 0), MAX(window_end)
FROM runtime_accounting_windows
WHERE runtime_name = ?
`, runtimeName).Scan(&position.StartSequence, &previousEnd); err != nil {
		return accountingWindowPosition{}, fmt.Errorf("read accounting window position: %w", err)
	}
	if previousEnd.Valid {
		value, err := parseStoredTime(previousEnd.String)
		if err != nil {
			return accountingWindowPosition{}, err
		}
		position.PreviousEnd = &value
	}
	return position, nil
}

func hashRuntimeAccountingEventRange(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
	startSequence uint64,
	endSequence uint64,
) (string, error) {
	rows, err := tx.QueryContext(ctx, `
SELECT sequence, event_json
FROM runtime_accounting_events
WHERE runtime_name = ? AND sequence > ? AND sequence <= ?
ORDER BY sequence
`, runtimeName, startSequence, endSequence)
	if err != nil {
		return "", fmt.Errorf("read accounting window events: %w", err)
	}
	defer rows.Close()
	digest := sha256.New()
	nextSequence := startSequence + 1
	for rows.Next() {
		var sequence uint64
		var canonical []byte
		if err := rows.Scan(&sequence, &canonical); err != nil {
			return "", fmt.Errorf("scan accounting window event: %w", err)
		}
		if sequence != nextSequence {
			return "", errors.New("accounting window event sequence is incomplete")
		}
		if _, err := digest.Write(canonical); err != nil {
			return "", err
		}
		nextSequence++
	}
	if err := rows.Err(); err != nil {
		return "", fmt.Errorf("iterate accounting window events: %w", err)
	}
	if nextSequence != endSequence+1 {
		return "", errors.New("accounting window event sequence is incomplete")
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

func finalizeStoredRuntimeAccountingEvidence(
	runtime Runtime,
	policy UserBudgetPolicy,
	schedule runtimecost.PriceSchedule,
	closed runtimeaccounting.ClosedWindow,
	eventsSHA256 string,
	observedAt time.Time,
) (runtimeaccounting.Evidence, error) {
	configuration := runtimeaccounting.EvidenceConfiguration{
		Version:  runtimeaccounting.EvidenceConfigurationVersion,
		Provider: schedule.Provider, RateCard: schedule.Version,
		RuntimeName: runtime.Name, WindowStart: closed.Window.Start,
		WindowEnd: closed.Window.End, ObservedAt: observedAt,
		Ceilings: accountingCeilings(runtime.Resources),
		Budget: runtimeaccounting.EvidenceBudgetConfiguration{
			CoveredLimitUSDMicros:  uint64(policy.CoveredLimitUSDMicros),
			SafetyReserveUSDMicros: uint64(policy.SafetyReserveUSDMicros),
			MaximumCutoffLag:       policy.MaximumCutoffLag.String(),
			RequiredDimensions: append(
				[]runtimeprovider.UsageDimension(nil),
				hardBudgetDimensions...,
			),
		},
	}
	return runtimeaccounting.FinalizeEvidence(
		configuration, eventsSHA256, schedule, closed,
	)
}

func usageIntervalRequestFromEvidence(
	request RecordUsageEvidenceRequest,
	schedule runtimecost.PriceSchedule,
	fingerprint string,
) (recordUsageIntervalRequest, error) {
	cost, err := runtimecost.Estimate(schedule, request.Evidence.Usage)
	if err != nil {
		return recordUsageIntervalRequest{}, err
	}
	if cost.CoveredTotal > math.MaxInt64 {
		return recordUsageIntervalRequest{}, errors.New("finalized usage cost exceeds the control-plane range")
	}
	return recordUsageIntervalRequest{
		IdempotencyKey: request.IdempotencyKey, UserID: request.UserID,
		RuntimeName:           request.Evidence.Usage.RuntimeName,
		IntervalStart:         request.Evidence.Usage.Window.Start,
		IntervalEnd:           request.Evidence.Usage.Window.End,
		MeasurementSource:     request.Evidence.Usage.Basis,
		CoveredCostUSDMicros:  int64(cost.CoveredTotal),
		SubmissionFingerprint: fingerprint,
	}, nil
}

func persistFinalizedRuntimeAccountingWindow(
	ctx context.Context,
	tx *sql.Tx,
	request FinalizeRuntimeAccountingWindowRequest,
	fingerprint string,
	startSequence uint64,
	endSequence uint64,
	finalized FinalizedRuntimeAccountingWindow,
	ledger runtimeaccounting.LedgerState,
	boundaryState runtimeaccounting.LedgerState,
) error {
	evidenceJSON, err := json.Marshal(finalized.Evidence)
	if err != nil {
		return fmt.Errorf("encode finalized accounting evidence: %w", err)
	}
	ledgerJSON, err := json.Marshal(ledger)
	if err != nil {
		return fmt.Errorf("encode closed accounting ledger: %w", err)
	}
	boundaryJSON, err := json.Marshal(boundaryState)
	if err != nil {
		return fmt.Errorf("encode accounting boundary ledger: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO runtime_accounting_windows (
  idempotency_key, request_fingerprint, runtime_name, user_id,
  window_start, window_end, start_sequence, end_sequence,
  evidence_json, finalized_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, request.IdempotencyKey, fingerprint, request.RuntimeName, request.UserID,
		timestamp(finalized.Evidence.Usage.Window.Start),
		timestamp(finalized.Evidence.Usage.Window.End),
		startSequence, endSequence, evidenceJSON, timestamp(finalized.FinalizedAt)); err != nil {
		return fmt.Errorf("insert finalized accounting window: %w", err)
	}
	result, err := tx.ExecContext(ctx, `
UPDATE runtime_accounting_ledgers
SET state_json = ?, boundary_state_json = ?, updated_at = ?
WHERE runtime_name = ?
`, ledgerJSON, boundaryJSON, timestamp(finalized.FinalizedAt), request.RuntimeName)
	if err != nil {
		return fmt.Errorf("advance runtime accounting ledger: %w", err)
	}
	if err := requireOneRow(result, "advance runtime accounting ledger"); err != nil {
		return err
	}
	return nil
}

func readFinalizedRuntimeAccountingWindow(
	ctx context.Context,
	query interface {
		QueryRowContext(context.Context, string, ...any) *sql.Row
	},
	idempotencyKey string,
	fingerprint string,
) (FinalizedRuntimeAccountingWindow, bool, error) {
	var finalized FinalizedRuntimeAccountingWindow
	var storedFingerprint string
	var evidenceJSON []byte
	var finalizedAt string
	err := query.QueryRowContext(ctx, `
SELECT request_fingerprint, evidence_json, finalized_at
FROM runtime_accounting_windows
WHERE idempotency_key = ?
`, idempotencyKey).Scan(&storedFingerprint, &evidenceJSON, &finalizedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return FinalizedRuntimeAccountingWindow{}, false, nil
	}
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, false, fmt.Errorf("read finalized accounting window: %w", err)
	}
	if storedFingerprint != fingerprint {
		return FinalizedRuntimeAccountingWindow{}, false, ErrIdempotencyConflict
	}
	if err := json.Unmarshal(evidenceJSON, &finalized.Evidence); err != nil {
		return FinalizedRuntimeAccountingWindow{}, false, fmt.Errorf("decode finalized accounting evidence: %w", err)
	}
	finalized.FinalizedAt, err = parseStoredTime(finalizedAt)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, false, err
	}
	persisted, found, err := readUsageIntervalByID(ctx, query, idempotencyKey)
	if err != nil {
		return FinalizedRuntimeAccountingWindow{}, false, err
	}
	if !found {
		return FinalizedRuntimeAccountingWindow{}, false,
			errors.New("finalized accounting window is missing its usage interval")
	}
	finalized.Interval = persisted.interval
	return finalized, true, nil
}

func accountingWindowRequestFingerprint(
	request FinalizeRuntimeAccountingWindowRequest,
) (string, error) {
	encoded, err := json.Marshal(request)
	if err != nil {
		return "", fmt.Errorf("encode accounting window request fingerprint: %w", err)
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), nil
}
