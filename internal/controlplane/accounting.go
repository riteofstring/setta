package controlplane

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"setta/internal/runtimeaccounting"
	"setta/internal/runtimeprovider"
)

type runtimeAccountingQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

type RecordRuntimeAccountingEventRequest struct {
	RuntimeName string
	Transition  runtimeaccounting.ActivityTransition
}

type RuntimeAccountingSnapshot struct {
	Ledger       runtimeaccounting.LedgerState
	EventsSHA256 string
}

func (store *Store) recordProviderAccountingBeginTx(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
	eventID string,
	activeFrom time.Time,
	recordedAt time.Time,
) error {
	_, err := store.recordRuntimeAccountingTransitionTx(ctx, tx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName,
		Transition: runtimeaccounting.ActivityTransition{
			EventID: eventID, At: activeFrom,
			Kind: runtimeaccounting.ActivityProvider, Action: runtimeaccounting.EventBegin,
		},
	}, recordedAt)
	return err
}

func (store *Store) recordProviderAccountingEndIfActiveTx(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
	eventID string,
	endedAt time.Time,
) error {
	ledger, found, err := readRuntimeAccountingLedger(ctx, tx, runtimeName)
	if err != nil || !found {
		return err
	}
	if !ledger.Snapshot().ProviderActive {
		return nil
	}
	_, err = store.recordRuntimeAccountingTransitionTx(ctx, tx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName,
		Transition: runtimeaccounting.ActivityTransition{
			EventID: eventID, At: endedAt,
			Kind: runtimeaccounting.ActivityProvider, Action: runtimeaccounting.EventEnd,
		},
	}, endedAt)
	return err
}

func (store *Store) RecordRuntimeAccountingEvent(
	ctx context.Context,
	request RecordRuntimeAccountingEventRequest,
) (runtimeaccounting.LedgerState, error) {
	if err := validateRuntimeAccountingEventRequest(request); err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.recordRuntimeAccountingEventLocked(ctx, request)
}

func (store *Store) recordRuntimeAccountingEventLocked(
	ctx context.Context,
	request RecordRuntimeAccountingEventRequest,
) (runtimeaccounting.LedgerState, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return runtimeaccounting.LedgerState{}, fmt.Errorf("begin runtime accounting event: %w", err)
	}
	defer rollback(tx)
	state, err := store.recordRuntimeAccountingTransitionTx(ctx, tx, request, store.clock())
	if err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	if err := tx.Commit(); err != nil {
		return runtimeaccounting.LedgerState{}, fmt.Errorf("commit runtime accounting event: %w", err)
	}
	return state, nil
}

func (store *Store) recordRuntimeAccountingTransitionTx(
	ctx context.Context,
	tx *sql.Tx,
	request RecordRuntimeAccountingEventRequest,
	recordedAt time.Time,
) (runtimeaccounting.LedgerState, error) {
	ledger, event, replayed, err := prepareRuntimeAccountingLedger(ctx, tx, request)
	if err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	if replayed {
		return ledger.Snapshot(), nil
	}
	if err := ledger.Apply(event); err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	state := ledger.Snapshot()
	canonical, err := runtimeaccounting.CanonicalActivityEventLine(event)
	if err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	if err := persistRuntimeAccountingEvent(ctx, tx, request.RuntimeName, event, canonical, state, recordedAt); err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	return state, nil
}

func prepareRuntimeAccountingLedger(
	ctx context.Context,
	tx *sql.Tx,
	request RecordRuntimeAccountingEventRequest,
) (*runtimeaccounting.Ledger, runtimeaccounting.ActivityEvent, bool, error) {
	ledger, found, err := readRuntimeAccountingLedger(ctx, tx, request.RuntimeName)
	if err != nil {
		return nil, runtimeaccounting.ActivityEvent{}, false, err
	}
	replayed, replayedEvent, err := replayRuntimeAccountingEvent(ctx, tx, request)
	if err != nil {
		return nil, runtimeaccounting.ActivityEvent{}, false, err
	}
	if replayed {
		if !found {
			return nil, runtimeaccounting.ActivityEvent{}, false, errors.New("runtime accounting event exists without its ledger")
		}
		return ledger, replayedEvent, true, nil
	}
	if found {
		return ledger, request.Transition.Event(ledger.Snapshot().LastSequence + 1), false, nil
	}
	ledger, err = runtimeaccounting.NewLedger(request.Transition.At)
	return ledger, request.Transition.Event(1), false, err
}

func (store *Store) RuntimeAccountingSnapshot(
	ctx context.Context,
	runtimeName string,
) (RuntimeAccountingSnapshot, error) {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return RuntimeAccountingSnapshot{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	ledger, found, err := readRuntimeAccountingLedger(ctx, store.db, runtimeName)
	if err != nil {
		return RuntimeAccountingSnapshot{}, err
	}
	if !found {
		return RuntimeAccountingSnapshot{}, ErrNotFound
	}
	rows, err := store.db.QueryContext(ctx, `
SELECT event_json FROM runtime_accounting_events
WHERE runtime_name = ? ORDER BY sequence
`, runtimeName)
	if err != nil {
		return RuntimeAccountingSnapshot{}, fmt.Errorf("read runtime accounting events: %w", err)
	}
	defer rows.Close()
	digest := sha256.New()
	for rows.Next() {
		var canonical []byte
		if err := rows.Scan(&canonical); err != nil {
			return RuntimeAccountingSnapshot{}, fmt.Errorf("scan runtime accounting event: %w", err)
		}
		if _, err := digest.Write(canonical); err != nil {
			return RuntimeAccountingSnapshot{}, err
		}
	}
	if err := rows.Err(); err != nil {
		return RuntimeAccountingSnapshot{}, fmt.Errorf("iterate runtime accounting events: %w", err)
	}
	return RuntimeAccountingSnapshot{
		Ledger:       ledger.Snapshot(),
		EventsSHA256: hex.EncodeToString(digest.Sum(nil)),
	}, nil
}

func validateRuntimeAccountingEventRequest(request RecordRuntimeAccountingEventRequest) error {
	if err := runtimeprovider.ValidateManagedName(request.RuntimeName); err != nil {
		return err
	}
	if request.Transition.EventID == "" || request.Transition.At.IsZero() {
		return errors.New("runtime accounting transition identity is empty")
	}
	return nil
}

func readRuntimeAccountingLedger(
	ctx context.Context,
	querier runtimeAccountingQuerier,
	runtimeName string,
) (*runtimeaccounting.Ledger, bool, error) {
	var encoded []byte
	err := querier.QueryRowContext(ctx, `
SELECT state_json FROM runtime_accounting_ledgers WHERE runtime_name = ?
`, runtimeName).Scan(&encoded)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("read runtime accounting ledger: %w", err)
	}
	var state runtimeaccounting.LedgerState
	if err := json.Unmarshal(encoded, &state); err != nil {
		return nil, false, fmt.Errorf("decode runtime accounting ledger: %w", err)
	}
	ledger, err := runtimeaccounting.RestoreLedger(state)
	if err != nil {
		return nil, false, fmt.Errorf("restore runtime accounting ledger: %w", err)
	}
	return ledger, true, nil
}

func replayRuntimeAccountingEvent(
	ctx context.Context,
	tx *sql.Tx,
	request RecordRuntimeAccountingEventRequest,
) (bool, runtimeaccounting.ActivityEvent, error) {
	var sequence uint64
	var stored []byte
	err := tx.QueryRowContext(ctx, `
SELECT sequence, event_json FROM runtime_accounting_events
WHERE runtime_name = ? AND event_id = ?
`, request.RuntimeName, request.Transition.EventID).Scan(&sequence, &stored)
	if errors.Is(err, sql.ErrNoRows) {
		return false, runtimeaccounting.ActivityEvent{}, nil
	}
	if err != nil {
		return false, runtimeaccounting.ActivityEvent{}, fmt.Errorf("read runtime accounting event replay: %w", err)
	}
	event := request.Transition.Event(sequence)
	canonical, err := runtimeaccounting.CanonicalActivityEventLine(event)
	if err != nil {
		return false, runtimeaccounting.ActivityEvent{}, err
	}
	if string(stored) != string(canonical) {
		return false, runtimeaccounting.ActivityEvent{}, ErrIdempotencyConflict
	}
	return true, event, nil
}

func persistRuntimeAccountingEvent(
	ctx context.Context,
	tx *sql.Tx,
	runtimeName string,
	event runtimeaccounting.ActivityEvent,
	canonical []byte,
	state runtimeaccounting.LedgerState,
	recordedAt time.Time,
) error {
	encodedState, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("encode runtime accounting ledger: %w", err)
	}
	recordedTimestamp := timestamp(recordedAt)
	if _, err := tx.ExecContext(ctx, `
INSERT INTO runtime_accounting_events (
  runtime_name, sequence, event_id, event_json, recorded_at
) VALUES (?, ?, ?, ?, ?)
`, runtimeName, event.Sequence, event.EventID, canonical, recordedTimestamp); err != nil {
		return fmt.Errorf("insert runtime accounting event: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO runtime_accounting_ledgers (runtime_name, state_json, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(runtime_name) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
`, runtimeName, encodedState, recordedTimestamp); err != nil {
		return fmt.Errorf("write runtime accounting ledger: %w", err)
	}
	return nil
}
