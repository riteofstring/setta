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

	"setta/internal/runtimeaccounting"
	"setta/internal/runtimeprovider"
)

type runtimeAccountingQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

type RecordRuntimeAccountingEventRequest struct {
	RuntimeName string
	Event       runtimeaccounting.ActivityEvent
}

type RuntimeAccountingSnapshot struct {
	Ledger       runtimeaccounting.LedgerState
	EventsSHA256 string
}

func (store *Store) RecordRuntimeAccountingEvent(
	ctx context.Context,
	request RecordRuntimeAccountingEventRequest,
) (runtimeaccounting.LedgerState, error) {
	if err := validateRuntimeAccountingEventRequest(request); err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	canonical, err := runtimeaccounting.CanonicalActivityEventLine(request.Event)
	if err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.recordRuntimeAccountingEventLocked(ctx, request, canonical)
}

func (store *Store) recordRuntimeAccountingEventLocked(
	ctx context.Context,
	request RecordRuntimeAccountingEventRequest,
	canonical []byte,
) (runtimeaccounting.LedgerState, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return runtimeaccounting.LedgerState{}, fmt.Errorf("begin runtime accounting event: %w", err)
	}
	defer rollback(tx)
	ledger, replayed, err := prepareRuntimeAccountingLedger(ctx, tx, request, canonical)
	if err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	if replayed {
		return ledger.Snapshot(), nil
	}
	if err := ledger.Apply(request.Event); err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	state := ledger.Snapshot()
	if err := persistRuntimeAccountingEvent(ctx, tx, request, canonical, state, store.clock()); err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	if err := tx.Commit(); err != nil {
		return runtimeaccounting.LedgerState{}, fmt.Errorf("commit runtime accounting event: %w", err)
	}
	return state, nil
}

func prepareRuntimeAccountingLedger(
	ctx context.Context,
	tx *sql.Tx,
	request RecordRuntimeAccountingEventRequest,
	canonical []byte,
) (*runtimeaccounting.Ledger, bool, error) {
	ledger, found, err := readRuntimeAccountingLedger(ctx, tx, request.RuntimeName)
	if err != nil {
		return nil, false, err
	}
	replayed, err := replayRuntimeAccountingEvent(ctx, tx, request, canonical)
	if err != nil {
		return nil, false, err
	}
	if replayed {
		if !found {
			return nil, false, errors.New("runtime accounting event exists without its ledger")
		}
		return ledger, true, nil
	}
	if found {
		return ledger, false, nil
	}
	ledger, err = runtimeaccounting.NewLedger(request.Event.At)
	return ledger, false, err
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
	if request.Event.Sequence > math.MaxInt64 {
		return errors.New("runtime accounting sequence exceeds the durable store range")
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
	canonical []byte,
) (bool, error) {
	var stored []byte
	err := tx.QueryRowContext(ctx, `
SELECT event_json FROM runtime_accounting_events
WHERE runtime_name = ? AND (sequence = ? OR event_id = ?)
`, request.RuntimeName, request.Event.Sequence, request.Event.EventID).Scan(&stored)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("read runtime accounting event replay: %w", err)
	}
	if string(stored) != string(canonical) {
		return false, ErrIdempotencyConflict
	}
	return true, nil
}

func persistRuntimeAccountingEvent(
	ctx context.Context,
	tx *sql.Tx,
	request RecordRuntimeAccountingEventRequest,
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
`, request.RuntimeName, request.Event.Sequence, request.Event.EventID, canonical, recordedTimestamp); err != nil {
		return fmt.Errorf("insert runtime accounting event: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
INSERT INTO runtime_accounting_ledgers (runtime_name, state_json, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(runtime_name) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at
`, request.RuntimeName, encodedState, recordedTimestamp); err != nil {
		return fmt.Errorf("write runtime accounting ledger: %w", err)
	}
	return nil
}
