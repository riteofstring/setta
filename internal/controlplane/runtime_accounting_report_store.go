package controlplane

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"setta/internal/runtimeaccounting"
	"setta/internal/runtimeprovider"
)

const maximumReportedWorkloadLeaseTTL = time.Hour

func (store *Store) RecordRuntimeAccountingReport(
	ctx context.Context,
	runtimeName string,
	transition runtimeaccounting.ActivityTransition,
) (runtimeaccounting.LedgerState, error) {
	if err := runtimeprovider.ValidateManagedName(runtimeName); err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	if err := runtimeaccounting.ValidateWorkloadLeaseTransition(transition); err != nil {
		return runtimeaccounting.LedgerState{}, err
	}
	remaining := transition.LeaseExpiresAt.Sub(transition.At)
	if transition.Action != runtimeaccounting.EventEnd &&
		(remaining <= 0 || remaining > maximumReportedWorkloadLeaseTTL) {
		return runtimeaccounting.LedgerState{}, fmt.Errorf(
			"%w: reported workload lease TTL is out of bounds",
			runtimeaccounting.ErrInvalidEvent,
		)
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	replayed, state, err := store.runtimeAccountingReportReplay(
		ctx,
		runtimeName,
		transition.EventID,
	)
	if err != nil || replayed {
		return state, err
	}
	observedAt := store.clock().UTC()
	transition.At = observedAt
	if transition.Action != runtimeaccounting.EventEnd {
		transition.LeaseExpiresAt = observedAt.Add(remaining)
	}
	return store.recordRuntimeAccountingEventLocked(ctx, RecordRuntimeAccountingEventRequest{
		RuntimeName: runtimeName,
		Transition:  transition,
	})
}

func (store *Store) runtimeAccountingReportReplay(
	ctx context.Context,
	runtimeName string,
	eventID string,
) (bool, runtimeaccounting.LedgerState, error) {
	var found int
	err := store.db.QueryRowContext(ctx, `
SELECT 1 FROM runtime_accounting_events
WHERE runtime_name = ? AND event_id = ?
`, runtimeName, eventID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return false, runtimeaccounting.LedgerState{}, nil
	}
	if err != nil {
		return false, runtimeaccounting.LedgerState{}, fmt.Errorf(
			"read runtime accounting report replay: %w",
			err,
		)
	}
	ledger, ledgerFound, err := readRuntimeAccountingLedger(ctx, store.db, runtimeName)
	if err != nil {
		return false, runtimeaccounting.LedgerState{}, err
	}
	if !ledgerFound {
		return false, runtimeaccounting.LedgerState{}, errors.New(
			"runtime accounting report exists without its ledger",
		)
	}
	return true, ledger.Snapshot(), nil
}
