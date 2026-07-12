package conversation

import (
	"context"
	"errors"
	"fmt"
	"time"

	"setta/internal/master"
)

func (store *Store) RecoverMasterInputRouting(ctx context.Context, recoveredAt string) error {
	if err := validateMasterInputRoutingRecoveryRequest(store, ctx, recoveredAt); err != nil {
		return err
	}
	for {
		recovered, err := store.recoverMasterInputRoutingBatch(ctx, recoveredAt)
		if errors.Is(err, errNoMasterInputRoutingWork) {
			return nil
		}
		if err != nil {
			return err
		}
		if recovered < maxMasterRoutingRecoveryBatch {
			return nil
		}
	}
}

func validateMasterInputRoutingRecoveryRequest(
	store *Store,
	ctx context.Context,
	recoveredAt string,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("master input routing recovery context is required")
	}
	_, err := validateTimestamp("master input routing recoveredAt", recoveredAt)
	return err
}

func (store *Store) recoverMasterInputRoutingBatch(
	ctx context.Context,
	recoveredAt string,
) (int, error) {
	recovered := 0
	_, err := store.Transact(ctx, "recover master input routing", func(transaction *WriteTransaction) error {
		var transactionErr error
		recovered, transactionErr = recoverMasterInputRoutingTransaction(transaction, recoveredAt)
		return transactionErr
	})
	return recovered, err
}

type masterRoutingRecoveryCandidate struct {
	inputID   string
	attempt   int
	startedAt string
}

func recoverMasterInputRoutingTransaction(
	transaction *WriteTransaction,
	recoveredAt string,
) (int, error) {
	candidates, err := readMasterRoutingRecoveryCandidates(transaction)
	if err != nil {
		return 0, err
	}
	if len(candidates) == 0 {
		return 0, errNoMasterInputRoutingWork
	}
	recoveredTime, _ := validateTimestamp("master input routing recoveredAt", recoveredAt)
	for index, candidate := range candidates {
		if err := recoverMasterInputRoutingCandidate(
			transaction,
			recoveredTime,
			recoveredAt,
			candidate,
		); err != nil {
			return index, err
		}
	}
	return len(candidates), nil
}

func readMasterRoutingRecoveryCandidates(
	transaction *WriteTransaction,
) ([]masterRoutingRecoveryCandidate, error) {
	rows, err := transaction.tx.QueryContext(transaction.ctx, `
SELECT id, routing_attempt, routing_started_at
FROM master_inputs
WHERE routing_status = ?
ORDER BY sequence
LIMIT ?
`, master.InputRoutingStatusRouting, maxMasterRoutingRecoveryBatch)
	if err != nil {
		return nil, fmt.Errorf("list master input routing recovery: %w", err)
	}
	candidates := []masterRoutingRecoveryCandidate{}
	for rows.Next() {
		var candidate masterRoutingRecoveryCandidate
		if err := rows.Scan(&candidate.inputID, &candidate.attempt, &candidate.startedAt); err != nil {
			_ = rows.Close()
			return nil, err
		}
		candidates = append(candidates, candidate)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return candidates, nil
}

func recoverMasterInputRoutingCandidate(
	transaction *WriteTransaction,
	recoveredTime time.Time,
	recoveredAt string,
	candidate masterRoutingRecoveryCandidate,
) error {
	started, err := validateTimestamp("master input routing startedAt", candidate.startedAt)
	if err != nil {
		return err
	}
	if recoveredTime.Before(started) {
		return errors.New("master input routing recovery cannot precede its attempt")
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE master_inputs
SET routing_status = ?, routing_started_at = NULL, routing_failure_json = NULL
WHERE id = ? AND routing_status = ? AND routing_attempt = ? AND routing_started_at = ?
`,
		master.InputRoutingStatusAccepted,
		candidate.inputID,
		master.InputRoutingStatusRouting,
		candidate.attempt,
		candidate.startedAt,
	)
	if err != nil {
		return fmt.Errorf("recover master input routing %s: %w", candidate.inputID, err)
	}
	if err := requireOneRow(result, "master input", candidate.inputID, "routing attempt changed before recovery"); err != nil {
		return err
	}
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	recovery := master.InputRoutingRecovery{
		InputID:        candidate.inputID,
		RoutingAttempt: candidate.attempt,
		RecoveredAt:    recoveredAt,
	}
	_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          master.RouteRoutingEventID("recovered", candidate.inputID, candidate.attempt),
		StreamID:    master.RouteDecisionCommittedStream,
		Kind:        master.RouteInputRoutingRecoveredKind,
		Payload:     recovery,
		CommittedAt: recoveredAt,
	})
	return err
}
