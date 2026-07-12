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
