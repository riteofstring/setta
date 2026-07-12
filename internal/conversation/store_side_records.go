package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

func (store *Store) readSideConversation(
	ctx context.Context,
	parentConversationID string,
	sideConversationID string,
	parentStatus ConversationStatus,
) (SideConversation, error) {
	if store == nil {
		return SideConversation{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return SideConversation{}, errors.New("side conversation read context is required")
	}
	if err := validateIdentifier("side conversation read parent id", parentConversationID); err != nil {
		return SideConversation{}, err
	}
	if err := validateIdentifier("side conversation read id", sideConversationID); err != nil {
		return SideConversation{}, err
	}
	if !validConversationStatus(parentStatus) {
		return SideConversation{}, fmt.Errorf("side conversation read has unsupported parent status %q", parentStatus)
	}

	var side SideConversation
	found := false
	err := store.read(ctx, "read side conversation", func(ctx context.Context, connection *sql.Conn) error {
		value, err := scanSideConversation(connection.QueryRowContext(ctx, `
SELECT id, parent_conversation_id, parent_pane_id, provider_thread_id,
       source_provider_thread_id, source_provider_turn_id, source_trajectory_sequence,
       last_event_sequence, active_turn_id, active_provider_turn_id, status,
       resolved_side_agent_invocation_json, created_at, updated_at, disposed_at,
       failure_json
FROM side_conversations
WHERE id = ? AND parent_conversation_id = ?
`, sideConversationID, parentConversationID))
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		side = value
		found = true
		return nil
	})
	if err != nil {
		return SideConversation{}, err
	}
	if !found {
		return SideConversation{}, fmt.Errorf(
			"side conversation %s does not belong to parent conversation %s",
			sideConversationID,
			parentConversationID,
		)
	}
	side.ParentStatus = parentStatus
	if err := side.Validate(); err != nil {
		return SideConversation{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return side, nil
}
