package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

func (store *Store) ListAgentTurnRecoveryTargets(
	ctx context.Context,
) ([]AgentTurnRecoveryTarget, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("agent recovery context is required")
	}
	targets := []AgentTurnRecoveryTarget{}
	err := store.read(ctx, "list agent turn recovery targets", func(ctx context.Context, connection *sql.Conn) error {
		rows, err := connection.QueryContext(ctx, `
SELECT conversation.workspace_id, conversation.id, turn.id,
       binding.thread_id, turn.provider_turn_id
FROM conversation_turns AS turn
JOIN conversations AS conversation
  ON conversation.id = turn.conversation_id
JOIN agent_thread_bindings AS binding
  ON binding.conversation_id = conversation.id
WHERE turn.status = ?
  AND binding.status = ?
ORDER BY conversation.id, turn.accepted_at, turn.id
`, TurnStatusRunning, ThreadBindingStatusLinked)
		if err != nil {
			return fmt.Errorf("query agent turn recovery targets: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var target AgentTurnRecoveryTarget
			if err := rows.Scan(
				&target.WorkspaceID,
				&target.ConversationID,
				&target.TurnID,
				&target.ProviderThreadID,
				&target.ProviderTurnID,
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
		if err := target.Validate(); err != nil {
			return nil, &CorruptStateError{Path: store.dbPath, Err: err}
		}
	}
	return targets, nil
}

func (store *Store) listUnlinkedAgentTurnRecoveryTargets(
	ctx context.Context,
) ([]unlinkedAgentTurnRecoveryTarget, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("unlinked agent recovery context is required")
	}
	targets := []unlinkedAgentTurnRecoveryTarget{}
	err := store.read(ctx, "list unlinked agent turn recovery targets", func(ctx context.Context, connection *sql.Conn) error {
		rows, err := connection.QueryContext(ctx, `
SELECT conversation.workspace_id, conversation.id, turn.id
FROM conversation_turns AS turn
JOIN conversations AS conversation
  ON conversation.id = turn.conversation_id
WHERE turn.status = ?
  AND turn.delivery = ?
ORDER BY conversation.id, turn.accepted_at, turn.id
`, TurnStatusQueued, TurnDeliveryNormal)
		if err != nil {
			return fmt.Errorf("query unlinked agent turn recovery targets: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var target unlinkedAgentTurnRecoveryTarget
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
