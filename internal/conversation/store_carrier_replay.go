package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// readCarrierReplaySnapshotThroughTurn reads the same bounded turn and
// trajectory windows as a public snapshot, but anchors both windows at a
// branch's source turn instead of at the parent's latest work.
func (store *Store) readCarrierReplaySnapshotThroughTurn(
	ctx context.Context,
	conversation TopicConversation,
	turnID string,
	throughSequence int,
) (ConversationSnapshot, error) {
	if err := validateCarrierReplayRead(store, ctx, conversation.ID, turnID, throughSequence); err != nil {
		return ConversationSnapshot{}, err
	}
	snapshot, err := store.readCarrierReplaySnapshot(ctx, conversation, turnID, throughSequence)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := store.validateCarrierReplaySnapshot(snapshot); err != nil {
		return ConversationSnapshot{}, err
	}
	return snapshot, nil
}

func validateCarrierReplayRead(
	store *Store,
	ctx context.Context,
	conversationID string,
	turnID string,
	throughSequence int,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("carrier replay context is required")
	}
	if err := validateIdentifier("carrier replay conversation id", conversationID); err != nil {
		return err
	}
	if err := validateIdentifier("carrier replay turn id", turnID); err != nil {
		return err
	}
	if throughSequence < 0 {
		return errors.New("carrier replay trajectory sequence must be non-negative")
	}
	return nil
}

func (store *Store) readCarrierReplaySnapshot(
	ctx context.Context,
	conversation TopicConversation,
	turnID string,
	throughSequence int,
) (ConversationSnapshot, error) {
	snapshot := ConversationSnapshot{}
	err := store.read(ctx, "read carrier replay through branch turn", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()

		turns, err := readCarrierReplayTurnsThrough(ctx, reader, conversation.ID, turnID)
		if err != nil {
			return err
		}
		trajectory, err := readCarrierReplayTrajectoryThrough(
			ctx,
			reader,
			conversation.ID,
			throughSequence,
		)
		if err != nil {
			return err
		}
		snapshot = ConversationSnapshot{
			Conversation: conversation,
			Turns:        turns,
			Trajectory:   trajectory,
		}
		return reader.Commit()
	})
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return snapshot, nil
}

func (store *Store) validateCarrierReplaySnapshot(snapshot ConversationSnapshot) error {
	for _, turn := range snapshot.Turns.Turns {
		if err := turn.Validate(); err != nil {
			return &CorruptStateError{Path: store.dbPath, Err: err}
		}
	}
	for _, event := range snapshot.Trajectory.Events {
		if err := event.Validate(); err != nil {
			return &CorruptStateError{Path: store.dbPath, Err: err}
		}
	}
	return nil
}

func readCarrierReplayTurnsThrough(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	turnID string,
) (ConversationTurnWindow, error) {
	rows, err := reader.QueryContext(ctx, `
WITH boundary AS (
  SELECT accepted_at, id
  FROM conversation_turns
  WHERE conversation_id = ? AND id = ?
)
SELECT turn.id, turn.conversation_id, turn.authored_input_json, turn.delivery,
       turn.status, turn.accepted_at, turn.started_at, turn.ended_at,
       turn.requested_role_profile_json, turn.resolved_invocation_json,
       turn.provider_turn_id, turn.error_json
FROM conversation_turns AS turn
CROSS JOIN boundary
WHERE turn.conversation_id = ?
  AND (
    turn.accepted_at < boundary.accepted_at
    OR (turn.accepted_at = boundary.accepted_at AND turn.id <= boundary.id)
  )
ORDER BY turn.accepted_at DESC, turn.id DESC
LIMIT ?
`, conversationID, turnID, conversationID, MaxSnapshotTurns+1)
	if err != nil {
		return ConversationTurnWindow{}, err
	}
	defer rows.Close()

	turns := make([]ConversationTurn, 0, MaxSnapshotTurns+1)
	sourceFound := false
	for rows.Next() {
		turn, scanErr := scanConversationTurn(rows)
		if scanErr != nil {
			return ConversationTurnWindow{}, scanErr
		}
		sourceFound = sourceFound || turn.ID == turnID
		turns = append(turns, turn)
	}
	if err := rows.Err(); err != nil {
		return ConversationTurnWindow{}, err
	}
	if !sourceFound {
		return ConversationTurnWindow{}, fmt.Errorf(
			"branch source turn %s does not belong to conversation %s",
			turnID,
			conversationID,
		)
	}
	hasEarlier := len(turns) > MaxSnapshotTurns
	if hasEarlier {
		turns = turns[:MaxSnapshotTurns]
	}
	reverseSlice(turns)
	return ConversationTurnWindow{Turns: turns, HasEarlier: hasEarlier}, nil
}

func readCarrierReplayTrajectoryThrough(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	throughSequence int,
) (ConversationTrajectoryWindow, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, sequence, emitted_at, kind, actor,
       provider_event_id, provider_turn_id, payload_json
FROM trajectory_events
WHERE conversation_id = ? AND sequence <= ?
ORDER BY sequence DESC
LIMIT ?
`, conversationID, throughSequence, MaxSnapshotTrajectoryEvents+1)
	if err != nil {
		return ConversationTrajectoryWindow{}, err
	}
	defer rows.Close()

	events := make([]TrajectoryEvent, 0, MaxSnapshotTrajectoryEvents+1)
	throughSequenceFound := throughSequence == 0
	for rows.Next() {
		event, scanErr := scanTrajectoryEvent(rows)
		if scanErr != nil {
			return ConversationTrajectoryWindow{}, scanErr
		}
		throughSequenceFound = throughSequenceFound || event.Sequence == throughSequence
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return ConversationTrajectoryWindow{}, err
	}
	if !throughSequenceFound {
		return ConversationTrajectoryWindow{}, fmt.Errorf(
			"branch source trajectory sequence %d does not exist for conversation %s",
			throughSequence,
			conversationID,
		)
	}
	hasEarlier := len(events) > MaxSnapshotTrajectoryEvents
	if hasEarlier {
		events = events[:MaxSnapshotTrajectoryEvents]
	}
	reverseSlice(events)
	return ConversationTrajectoryWindow{Events: events, HasEarlier: hasEarlier}, nil
}
