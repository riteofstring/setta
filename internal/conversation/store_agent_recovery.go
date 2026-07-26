package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// listRestartedAgentTurns finds the primary work the previous process was
// carrying. Both non-terminal statuses count: a running turn lost the carrier
// mid-run, and an immediately-delivered queued turn lost it before the provider
// ever started. Queued-delivery work is left alone because it is still waiting
// its turn rather than depending on a carrier that died.
func (store *Store) listRestartedAgentTurns(
	ctx context.Context,
) ([]restartedAgentTurn, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("agent recovery context is required")
	}
	targets := []restartedAgentTurn{}
	err := store.read(ctx, "list restarted agent turns", func(ctx context.Context, connection *sql.Conn) error {
		rows, err := connection.QueryContext(ctx, `
SELECT conversation.workspace_id, conversation.id, turn.id
FROM conversation_turns AS turn
JOIN conversations AS conversation
  ON conversation.id = turn.conversation_id
WHERE turn.status = ?
   OR (turn.status = ? AND turn.delivery = ?)
ORDER BY conversation.id, turn.accepted_at, turn.id
`, TurnStatusRunning, TurnStatusQueued, TurnDeliveryNormal)
		if err != nil {
			return fmt.Errorf("query restarted agent turns: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var target restartedAgentTurn
			if err := rows.Scan(
				&target.WorkspaceID,
				&target.ConversationID,
				&target.TurnID,
			); err != nil {
				return err
			}
			targets = append(targets, target)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	for _, target := range targets {
		if err := target.validate(); err != nil {
			return nil, &CorruptStateError{Path: store.dbPath, Err: err}
		}
	}
	return targets, nil
}

func (store *Store) listAgentQueueRecoveryTargets(
	ctx context.Context,
) ([]agentQueueRecoveryTarget, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("agent queue recovery context is required")
	}
	targets := []agentQueueRecoveryTarget{}
	err := store.read(ctx, "list agent queue recovery targets", func(ctx context.Context, connection *sql.Conn) error {
		rows, err := connection.QueryContext(ctx, `
SELECT conversation.workspace_id, conversation.id
FROM conversation_queue AS queue
JOIN conversation_turns AS turn
  ON turn.id = queue.turn_id
 AND turn.conversation_id = queue.conversation_id
JOIN conversations AS conversation
  ON conversation.id = queue.conversation_id
WHERE queue.ordinal = 1
  AND turn.status = ?
  AND turn.delivery = ?
  AND NOT EXISTS (
    SELECT 1
    FROM conversation_turns AS active
    WHERE active.conversation_id = conversation.id
      AND active.status = ?
  )
ORDER BY conversation.id
`, TurnStatusQueued, TurnDeliveryQueued, TurnStatusRunning)
		if err != nil {
			return fmt.Errorf("query agent queue recovery targets: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var target agentQueueRecoveryTarget
			if err := rows.Scan(&target.WorkspaceID, &target.ConversationID); err != nil {
				return err
			}
			targets = append(targets, target)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	for _, target := range targets {
		if err := target.validate(); err != nil {
			return nil, &CorruptStateError{Path: store.dbPath, Err: err}
		}
	}
	return targets, nil
}
