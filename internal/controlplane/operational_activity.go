package controlplane

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"setta/internal/runtimeaccounting"
)

const (
	staleActiveSessionReason = "gateway_attachment_survived_process"
	staleWorkloadTaskReason  = "workload_lease_expired_without_end"
)

type staleRuntimeActivityAlert struct {
	OccurredAt time.Time
	Reason     string
	Signal     OperationalAlertSignal
}

type staleRuntimeActivityCandidate struct {
	activityID  string
	runtime     string
	signal      OperationalAlertSignal
	subjectID   string
	subjectKind string
}

func (store *Store) ClaimStaleRuntimeActivityAlert(
	ctx context.Context,
) (staleRuntimeActivityAlert, bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return staleRuntimeActivityAlert{}, false,
			fmt.Errorf("begin stale runtime activity alert: %w", err)
	}
	defer rollback(tx)
	now := store.clock().UTC()
	candidates, err := store.staleRuntimeActivityCandidates(ctx, tx, now)
	if err != nil {
		return staleRuntimeActivityAlert{}, false, err
	}
	for _, candidate := range candidates {
		inserted, err := insertOperationalAlertDeduplication(ctx, tx, candidate, now)
		if err != nil {
			return staleRuntimeActivityAlert{}, false, err
		}
		if !inserted {
			continue
		}
		if candidate.signal == OperationalAlertStaleActiveSession {
			if _, err := store.recordRuntimeAccountingTransitionTx(
				ctx,
				tx,
				RecordRuntimeAccountingEventRequest{
					RuntimeName: candidate.runtime,
					Transition: runtimeaccounting.ActivityTransition{
						EventID:   "orphaned-attachment-end:" + candidate.activityID,
						At:        now,
						Kind:      runtimeaccounting.ActivityAttachment,
						Action:    runtimeaccounting.EventEnd,
						SubjectID: candidate.activityID,
					},
				},
				now,
			); err != nil {
				return staleRuntimeActivityAlert{}, false,
					fmt.Errorf("close orphaned gateway attachment: %w", err)
			}
		}
		if err := tx.Commit(); err != nil {
			return staleRuntimeActivityAlert{}, false,
				fmt.Errorf("commit stale runtime activity alert: %w", err)
		}
		if candidate.signal == OperationalAlertStaleActiveSession {
			delete(store.attachments, gatewayAttachmentKey{
				runtimeName: candidate.runtime,
				id:          candidate.activityID,
			})
			store.notifyOperationWakeLocked()
		}
		return staleRuntimeActivityAlert{
			OccurredAt: now,
			Reason:     staleRuntimeActivityReason(candidate.signal),
			Signal:     candidate.signal,
		}, true, nil
	}
	return staleRuntimeActivityAlert{}, false, nil
}

func (store *Store) staleRuntimeActivityCandidates(
	ctx context.Context,
	tx *sql.Tx,
	now time.Time,
) ([]staleRuntimeActivityCandidate, error) {
	rows, err := tx.QueryContext(ctx, `
SELECT runtime_name, state_json
FROM runtime_accounting_ledgers
ORDER BY runtime_name
`)
	if err != nil {
		return nil, fmt.Errorf("read runtime activity alert candidates: %w", err)
	}
	defer rows.Close()
	var candidates []staleRuntimeActivityCandidate
	persistedAttachments := make(map[gatewayAttachmentKey]struct{})
	for rows.Next() {
		var runtimeName string
		var encoded []byte
		if err := rows.Scan(&runtimeName, &encoded); err != nil {
			return nil, fmt.Errorf("scan runtime activity alert candidate: %w", err)
		}
		var state runtimeaccounting.LedgerState
		if err := json.Unmarshal(encoded, &state); err != nil {
			return nil, fmt.Errorf("decode runtime activity alert ledger: %w", err)
		}
		if _, err := runtimeaccounting.RestoreLedger(state); err != nil {
			return nil, fmt.Errorf("restore runtime activity alert ledger: %w", err)
		}
		candidates = store.appendStaleRuntimeActivityCandidates(
			candidates,
			persistedAttachments,
			runtimeName,
			state,
			now,
		)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate runtime activity alert candidates: %w", err)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close runtime activity alert candidates: %w", err)
	}
	store.removeClosedGatewayAttachments(persistedAttachments)
	sort.Slice(candidates, func(left int, right int) bool {
		leftPriority := staleRuntimeActivityPriority(candidates[left].signal)
		rightPriority := staleRuntimeActivityPriority(candidates[right].signal)
		if leftPriority != rightPriority {
			return leftPriority < rightPriority
		}
		if candidates[left].runtime != candidates[right].runtime {
			return candidates[left].runtime < candidates[right].runtime
		}
		return candidates[left].activityID < candidates[right].activityID
	})
	return candidates, nil
}

func (store *Store) appendStaleRuntimeActivityCandidates(
	candidates []staleRuntimeActivityCandidate,
	persistedAttachments map[gatewayAttachmentKey]struct{},
	runtimeName string,
	state runtimeaccounting.LedgerState,
	now time.Time,
) []staleRuntimeActivityCandidate {
	for _, attachmentID := range state.Attachments {
		key := gatewayAttachmentKey{runtimeName: runtimeName, id: attachmentID}
		persistedAttachments[key] = struct{}{}
		if _, current := store.attachments[key]; current {
			continue
		}
		candidates = append(candidates, staleRuntimeActivityCandidate{
			activityID:  attachmentID,
			runtime:     runtimeName,
			signal:      OperationalAlertStaleActiveSession,
			subjectID:   runtimeName + "/" + attachmentID,
			subjectKind: "gateway_attachment",
		})
	}
	for _, lease := range state.WorkloadLeases {
		if lease.ExpiresAt.After(now) {
			continue
		}
		candidates = append(candidates, staleRuntimeActivityCandidate{
			activityID:  lease.ID,
			runtime:     runtimeName,
			signal:      OperationalAlertStaleWorkloadTask,
			subjectID:   runtimeName + "/" + lease.ID + "/" + timestamp(lease.ExpiresAt),
			subjectKind: "workload_lease",
		})
	}
	return candidates
}

func (store *Store) removeClosedGatewayAttachments(
	persisted map[gatewayAttachmentKey]struct{},
) {
	for key := range store.attachments {
		if _, exists := persisted[key]; !exists {
			delete(store.attachments, key)
		}
	}
}

func staleRuntimeActivityPriority(signal OperationalAlertSignal) int {
	switch signal {
	case OperationalAlertStaleWorkloadTask:
		return 0
	case OperationalAlertStaleActiveSession:
		return 1
	default:
		panic(fmt.Sprintf("unsupported stale runtime activity signal %q", signal))
	}
}

func insertOperationalAlertDeduplication(
	ctx context.Context,
	tx *sql.Tx,
	candidate staleRuntimeActivityCandidate,
	now time.Time,
) (bool, error) {
	result, err := tx.ExecContext(ctx, `
INSERT INTO operational_alert_deduplication (
  signal, subject_kind, subject_id, observed_at
) VALUES (?, ?, ?, ?)
ON CONFLICT(signal, subject_kind, subject_id) DO NOTHING
`, candidate.signal, candidate.subjectKind, candidate.subjectID, timestamp(now))
	if err != nil {
		return false, fmt.Errorf("record stale runtime activity alert: %w", err)
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("read stale runtime activity alert result: %w", err)
	}
	return inserted == 1, nil
}

func staleRuntimeActivityReason(signal OperationalAlertSignal) string {
	switch signal {
	case OperationalAlertStaleActiveSession:
		return staleActiveSessionReason
	case OperationalAlertStaleWorkloadTask:
		return staleWorkloadTaskReason
	default:
		panic(fmt.Sprintf("unsupported stale runtime activity signal %q", signal))
	}
}
