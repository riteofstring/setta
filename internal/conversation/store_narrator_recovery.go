package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// CommitNarratorInvocationStarted marks a live narrator invocation as running
// before provider work begins. Startup recovery uses this typed marker instead
// of treating all missing historical narration as work to backfill.
func (store *Store) CommitNarratorInvocationStarted(
	ctx context.Context,
	request NarratorInvocationStartedCommit,
) (NarratorState, error) {
	if store == nil {
		return NarratorState{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return NarratorState{}, errors.New("narrator invocation start context is required")
	}
	if err := request.Validate(); err != nil {
		return NarratorState{}, err
	}
	var committed NarratorState
	_, err := store.transactPresentationAware(ctx, "commit narrator invocation start", func(transaction *WriteTransaction) error {
		state, err := readNarratorStateForMutation(transaction, request.ConversationID)
		if err != nil {
			return err
		}
		state.LastInvocationAt = stringPointerValue(request.StartedAt)
		state.Status = NarratorStatusRunning
		state.Degradation = nil
		state.UpdatedAt = request.StartedAt
		if err := transaction.UpdateNarratorState(request.Expected, state); err != nil {
			return err
		}
		if err := appendNarratorCommittedEvent(
			transaction,
			request.CommittedEventID,
			request.ConversationID,
			ConversationEventTypeNarratorStateUpdated,
			ConversationNarratorStateUpdatedEventPayload{
				Type:  ConversationEventTypeNarratorStateUpdated,
				State: state,
			},
			request.StartedAt,
		); err != nil {
			return err
		}
		committed = state
		return nil
	})
	if err != nil {
		return NarratorState{}, err
	}
	return committed, nil
}

func (store *Store) ListNarratorTerminalRecoveryTargets(
	ctx context.Context,
) ([]NarratorTerminalRecoveryTarget, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("narrator terminal recovery context is required")
	}
	targets := []NarratorTerminalRecoveryTarget{}
	err := store.read(ctx, "list narrator terminal recovery targets", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT conversation.workspace_id, conversation.id, turn.id, terminal.sequence
FROM narrator_state AS narrator
JOIN conversations AS conversation
  ON conversation.id = narrator.conversation_id
JOIN conversation_turns AS turn
  ON turn.conversation_id = conversation.id
JOIN trajectory_events AS terminal
  ON terminal.conversation_id = conversation.id
 AND terminal.turn_id = turn.id
WHERE narrator.status = 'running'
  AND terminal.sequence >= narrator.observed_through_sequence
  AND (
    (turn.status = 'completed' AND terminal.kind = 'turn_completed')
    OR (turn.status = 'cancelled' AND terminal.kind = 'turn_interrupted')
    OR (turn.status = 'failed' AND terminal.kind = 'turn_failed')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM narration_events AS final
    WHERE final.conversation_id = conversation.id
      AND final.turn_id = turn.id
      AND final.kind = 'final_summary'
  )
ORDER BY conversation.updated_at, terminal.sequence, turn.id
`)
		if err != nil {
			return fmt.Errorf("query narrator terminal recovery targets: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var target NarratorTerminalRecoveryTarget
			if err := rows.Scan(
				&target.WorkspaceID,
				&target.ConversationID,
				&target.TurnID,
				&target.TerminalSequence,
			); err != nil {
				return fmt.Errorf("scan narrator terminal recovery target: %w", err)
			}
			if err := target.Validate(); err != nil {
				return &CorruptStateError{Path: store.dbPath, Err: err}
			}
			targets = append(targets, target)
		}
		if err := rows.Err(); err != nil {
			return fmt.Errorf("iterate narrator terminal recovery targets: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return targets, nil
}
