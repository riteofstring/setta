package controlplane

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const reconciliationBacklogReason = "operation_due_exceeded_lease"

type reconciliationBacklogAlert struct {
	OccurredAt time.Time
}

func (store *Store) ClaimReconciliationBacklogAlert(
	ctx context.Context,
	alertAfter time.Duration,
) (reconciliationBacklogAlert, bool, error) {
	if alertAfter <= 0 {
		return reconciliationBacklogAlert{}, false,
			errors.New("reconciliation backlog alert duration must be positive")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return reconciliationBacklogAlert{}, false,
			fmt.Errorf("begin reconciliation backlog alert: %w", err)
	}
	defer rollback(tx)
	candidate, found, err := readReconciliationBacklogCandidate(ctx, tx)
	if err != nil || !found {
		return reconciliationBacklogAlert{}, false, err
	}
	now := store.clock().UTC()
	if candidate.dueAt.Add(alertAfter).After(now) {
		return reconciliationBacklogAlert{}, false, nil
	}
	result, err := tx.ExecContext(ctx, `
INSERT INTO operational_alert_deduplication (
  signal, subject_kind, subject_id, observed_at
) VALUES (?, ?, ?, ?)
ON CONFLICT(signal, subject_kind, subject_id) DO NOTHING
`, OperationalAlertReconciliationBacklog, candidate.kind, candidate.id, timestamp(now))
	if err != nil {
		return reconciliationBacklogAlert{}, false,
			fmt.Errorf("record reconciliation backlog alert: %w", err)
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return reconciliationBacklogAlert{}, false,
			fmt.Errorf("read reconciliation backlog alert result: %w", err)
	}
	if inserted == 0 {
		return reconciliationBacklogAlert{}, false, nil
	}
	if err := tx.Commit(); err != nil {
		return reconciliationBacklogAlert{}, false,
			fmt.Errorf("commit reconciliation backlog alert: %w", err)
	}
	return reconciliationBacklogAlert{OccurredAt: now}, true, nil
}

type reconciliationBacklogCandidate struct {
	dueAt time.Time
	id    string
	kind  string
}

const reconciliationBacklogCandidateSQL = `
SELECT subject_kind, subject_id, due_at
FROM (` + actionableRuntimeOperationsSQL + `) candidate
WHERE NOT EXISTS (
  SELECT 1
  FROM operational_alert_deduplication d
  WHERE d.signal = ? AND d.subject_kind = candidate.subject_kind
    AND d.subject_id = candidate.subject_id
)
ORDER BY due_at, subject_kind, subject_id
LIMIT 1
`

func readReconciliationBacklogCandidate(
	ctx context.Context,
	tx *sql.Tx,
) (reconciliationBacklogCandidate, bool, error) {
	var candidate reconciliationBacklogCandidate
	var dueAtRaw string
	args := append(
		actionableRuntimeOperationArgs(),
		OperationalAlertReconciliationBacklog,
	)
	err := tx.QueryRowContext(
		ctx,
		reconciliationBacklogCandidateSQL,
		args...,
	).Scan(&candidate.kind, &candidate.id, &dueAtRaw)
	if errors.Is(err, sql.ErrNoRows) {
		return reconciliationBacklogCandidate{}, false, nil
	}
	if err != nil {
		return reconciliationBacklogCandidate{}, false,
			fmt.Errorf("read reconciliation backlog candidate: %w", err)
	}
	candidate.dueAt, err = parseStoredTime(dueAtRaw)
	if err != nil {
		return reconciliationBacklogCandidate{}, false, err
	}
	return candidate, true, nil
}
