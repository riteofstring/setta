package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
)

func (store *Store) ListNarratorRecoveryTargets(
	ctx context.Context,
) ([]NarratorRecoveryTarget, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("narrator recovery context is required")
	}
	targets := []NarratorRecoveryTarget{}
	err := store.read(ctx, "list narrator recovery targets", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		targets, err = readNarratorRecoveryTargets(ctx, reader)
		if err != nil {
			return err
		}
		return reader.Commit()
	})
	if err != nil {
		return nil, err
	}
	for _, target := range targets {
		if err := target.Validate(); err != nil {
			return nil, &CorruptStateError{Path: store.dbPath, Err: err}
		}
	}
	return targets, nil
}

func readNarratorRecoveryTargets(
	ctx context.Context,
	reader snapshotReader,
) ([]NarratorRecoveryTarget, error) {
	terminal, err := readTerminalNarratorRecoveryTargets(ctx, reader)
	if err != nil {
		return nil, err
	}
	working, err := readWorkingNarratorRecoveryTargets(ctx, reader)
	if err != nil {
		return nil, err
	}
	targets := append(terminal, working...)
	sort.Slice(targets, func(left int, right int) bool {
		if targets[left].ConversationID != targets[right].ConversationID {
			return targets[left].ConversationID < targets[right].ConversationID
		}
		if targets[left].ThroughSequence != targets[right].ThroughSequence {
			return targets[left].ThroughSequence < targets[right].ThroughSequence
		}
		return targets[left].TurnID < targets[right].TurnID
	})
	return targets, nil
}

func readTerminalNarratorRecoveryTargets(
	ctx context.Context,
	reader snapshotReader,
) ([]NarratorRecoveryTarget, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT conversation.workspace_id, trajectory.conversation_id,
       trajectory.turn_id, trajectory.sequence
FROM trajectory_events AS trajectory
JOIN narrator_state AS narrator
  ON narrator.conversation_id = trajectory.conversation_id
JOIN conversations AS conversation
  ON conversation.id = trajectory.conversation_id
JOIN conversation_turns AS turn
  ON turn.id = trajectory.turn_id
WHERE trajectory.sequence > narrator.observed_through_sequence
  AND trajectory.actor IN (?, ?)
  AND (
    (trajectory.kind = ? AND turn.status = ?)
    OR (trajectory.kind = ? AND turn.status = ?)
    OR (trajectory.kind = ? AND turn.status = ?)
  )
ORDER BY trajectory.conversation_id ASC, trajectory.sequence ASC
`,
		TrajectoryActorProvider,
		TrajectoryActorSystem,
		TrajectoryEventTurnCompleted,
		TurnStatusCompleted,
		TrajectoryEventTurnInterrupted,
		TurnStatusCancelled,
		TrajectoryEventTurnFailed,
		TurnStatusFailed,
	)
	if err != nil {
		return nil, fmt.Errorf("query terminal narrator recovery targets: %w", err)
	}
	defer rows.Close()
	return scanNarratorRecoveryTargets(rows, true)
}

func readWorkingNarratorRecoveryTargets(
	ctx context.Context,
	reader snapshotReader,
) ([]NarratorRecoveryTarget, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT conversation.workspace_id, conversation.id, turn.id,
       conversation.last_trajectory_sequence
FROM conversations AS conversation
JOIN narrator_state AS narrator
  ON narrator.conversation_id = conversation.id
JOIN conversation_turns AS turn
  ON turn.conversation_id = conversation.id
 AND turn.status = ?
WHERE narrator.observed_through_sequence < conversation.last_trajectory_sequence
ORDER BY conversation.id ASC
`, TurnStatusRunning)
	if err != nil {
		return nil, fmt.Errorf("query working narrator recovery targets: %w", err)
	}
	defer rows.Close()
	return scanNarratorRecoveryTargets(rows, false)
}

func scanNarratorRecoveryTargets(
	rows *sql.Rows,
	terminal bool,
) ([]NarratorRecoveryTarget, error) {
	targets := []NarratorRecoveryTarget{}
	for rows.Next() {
		var target NarratorRecoveryTarget
		if err := rows.Scan(
			&target.WorkspaceID,
			&target.ConversationID,
			&target.TurnID,
			&target.ThroughSequence,
		); err != nil {
			return nil, err
		}
		target.Terminal = terminal
		targets = append(targets, target)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return targets, nil
}
