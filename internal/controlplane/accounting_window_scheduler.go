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
)

type ScheduledAccountingWindow struct {
	IdempotencyKey string
	RuntimeName    string
	UserID         string
	WindowEnd      time.Time
}

func (store *Store) NextAccountingWindow(
	ctx context.Context,
	windowDuration time.Duration,
) (ScheduledAccountingWindow, bool, error) {
	if windowDuration <= 0 {
		return ScheduledAccountingWindow{}, false, errors.New(
			"accounting window duration must be positive",
		)
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	rows, err := store.db.QueryContext(ctx, `
SELECT r.name, r.user_id, b.period_start, b.period_end, l.state_json,
       MAX(i.interval_end)
FROM users u
JOIN runtimes r ON r.name = u.active_runtime_name AND r.user_id = u.id
JOIN user_budget_policies b ON b.user_id = u.id
JOIN runtime_accounting_ledgers l ON l.runtime_name = r.name
LEFT JOIN usage_intervals i
  ON i.user_id = u.id AND i.budget_period_start = b.period_start
GROUP BY r.name, r.user_id, b.period_start, b.period_end, l.state_json
`)
	if err != nil {
		return ScheduledAccountingWindow{}, false, fmt.Errorf(
			"read scheduled accounting windows: %w",
			err,
		)
	}
	defer rows.Close()
	var next ScheduledAccountingWindow
	for rows.Next() {
		candidate, eligible, err := scanScheduledAccountingWindow(rows, windowDuration)
		if err != nil {
			return ScheduledAccountingWindow{}, false, err
		}
		if eligible && (next.WindowEnd.IsZero() || candidate.WindowEnd.Before(next.WindowEnd)) {
			next = candidate
		}
	}
	if err := rows.Err(); err != nil {
		return ScheduledAccountingWindow{}, false, fmt.Errorf(
			"iterate scheduled accounting windows: %w",
			err,
		)
	}
	return next, !next.WindowEnd.IsZero(), nil
}

func scanScheduledAccountingWindow(
	rows *sql.Rows,
	windowDuration time.Duration,
) (ScheduledAccountingWindow, bool, error) {
	var runtimeName string
	var userID string
	var periodStartRaw string
	var periodEndRaw string
	var ledgerJSON []byte
	var previousEndRaw sql.NullString
	if err := rows.Scan(
		&runtimeName,
		&userID,
		&periodStartRaw,
		&periodEndRaw,
		&ledgerJSON,
		&previousEndRaw,
	); err != nil {
		return ScheduledAccountingWindow{}, false, fmt.Errorf(
			"scan scheduled accounting window: %w",
			err,
		)
	}
	periodStart, err := parseStoredTime(periodStartRaw)
	if err != nil {
		return ScheduledAccountingWindow{}, false, err
	}
	periodEnd, err := parseStoredTime(periodEndRaw)
	if err != nil {
		return ScheduledAccountingWindow{}, false, err
	}
	expectedStart := periodStart
	if previousEndRaw.Valid {
		expectedStart, err = parseStoredTime(previousEndRaw.String)
		if err != nil {
			return ScheduledAccountingWindow{}, false, err
		}
	}
	var state runtimeaccounting.LedgerState
	if err := json.Unmarshal(ledgerJSON, &state); err != nil {
		return ScheduledAccountingWindow{}, false, fmt.Errorf(
			"decode scheduled accounting ledger: %w",
			err,
		)
	}
	if _, err := runtimeaccounting.RestoreLedger(state); err != nil {
		return ScheduledAccountingWindow{}, false, err
	}
	if !state.WindowStart.Equal(expectedStart) {
		return ScheduledAccountingWindow{}, false, errors.New(
			"scheduled accounting ledger does not continue its budget period",
		)
	}
	if !state.WindowStart.Before(periodEnd) {
		return ScheduledAccountingWindow{}, false, nil
	}
	windowEnd := state.WindowStart.Add(windowDuration)
	if windowEnd.After(periodEnd) {
		windowEnd = periodEnd
	}
	return ScheduledAccountingWindow{
		IdempotencyKey: scheduledAccountingWindowID(runtimeName, windowEnd),
		RuntimeName:    runtimeName,
		UserID:         userID,
		WindowEnd:      windowEnd,
	}, true, nil
}

func scheduledAccountingWindowID(runtimeName string, windowEnd time.Time) string {
	digest := sha256.Sum256([]byte(runtimeName + "\x00" + timestamp(windowEnd)))
	return "accounting_" + hex.EncodeToString(digest[:16])
}
