package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

var ErrConversationNotFound = errors.New("topic conversation was not found")
var ErrArtifactNotFound = errors.New("conversation artifact was not found")

func IsConversationNotFound(err error) bool {
	return errors.Is(err, ErrConversationNotFound)
}

func IsArtifactNotFound(err error) bool {
	return errors.Is(err, ErrArtifactNotFound)
}

func (store *Store) ReadSnapshot(
	ctx context.Context,
	workspaceID string,
	conversationID string,
) (ConversationSnapshot, error) {
	if store == nil {
		return ConversationSnapshot{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return ConversationSnapshot{}, errors.New("conversation snapshot context is required")
	}
	if err := validateIdentifier("conversation snapshot workspace id", workspaceID); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateIdentifier("conversation snapshot conversation id", conversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	var snapshot ConversationSnapshot
	err := store.read(ctx, "read conversation snapshot", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		snapshot, err = readConversationSnapshot(ctx, reader, workspaceID, conversationID)
		if err != nil {
			return err
		}
		return reader.Commit()
	})
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := snapshot.Validate(); err != nil {
		return ConversationSnapshot{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return snapshot, nil
}

type snapshotReader interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readConversationSnapshot(
	ctx context.Context,
	reader snapshotReader,
	workspaceID string,
	conversationID string,
) (ConversationSnapshot, error) {
	snapshot, err := readConversationSnapshotCore(ctx, reader, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := readConversationSnapshotExtended(ctx, reader, conversationID, &snapshot); err != nil {
		return ConversationSnapshot{}, err
	}
	return snapshot, nil
}

func readConversationSnapshotCore(
	ctx context.Context,
	reader snapshotReader,
	workspaceID string,
	conversationID string,
) (ConversationSnapshot, error) {
	conversation, err := readSnapshotConversation(ctx, reader, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	turns, err := readSnapshotTurns(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	queue, err := readSnapshotQueue(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	binding, err := readSnapshotBinding(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	trajectory, err := readSnapshotTrajectory(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	artifacts, err := readSnapshotArtifacts(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return ConversationSnapshot{
		SchemaVersion: ConversationContractSchemaVersion,
		Conversation:  conversation,
		Turns:         turns,
		Queue:         queue,
		ThreadBinding: binding,
		Trajectory:    trajectory,
		Artifacts:     artifacts,
	}, nil
}

func readConversationSnapshotExtended(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	snapshot *ConversationSnapshot,
) error {
	var err error
	snapshot.NarratorState, err = readSnapshotNarrator(ctx, reader, conversationID)
	if err != nil {
		return err
	}
	snapshot.Narration, err = readSnapshotNarration(ctx, reader, conversationID)
	if err != nil {
		return err
	}
	snapshot.RoleProfileOverrides, err = readSnapshotRoleOverrides(ctx, reader, conversationID)
	if err != nil {
		return err
	}
	snapshot.PresentationProfile, err = readSnapshotPresentation(ctx, reader, conversationID)
	if err != nil {
		return err
	}
	snapshot.Branch, err = readSnapshotBranch(ctx, reader, conversationID)
	if err != nil {
		return err
	}
	snapshot.SideConversations, err = readSnapshotSides(ctx, reader, conversationID, snapshot.Conversation.Status)
	if err != nil {
		return err
	}
	snapshot.SideEvents, err = readSnapshotSideEvents(ctx, reader, conversationID)
	if err != nil {
		return err
	}
	snapshot.EventCursor, err = readSnapshotEventCursor(ctx, reader, conversationID)
	return err
}

func readSnapshotConversation(
	ctx context.Context,
	reader snapshotReader,
	workspaceID string,
	conversationID string,
) (TopicConversation, error) {
	row := reader.QueryRowContext(ctx, `
SELECT id, workspace_id, title, topic_descriptor, status, created_at, updated_at,
       archived_at, last_trajectory_sequence
FROM conversations
WHERE id = ? AND workspace_id = ?
`, conversationID, workspaceID)
	conversation, err := scanTopicConversation(row)
	if errors.Is(err, sql.ErrNoRows) {
		return TopicConversation{}, fmt.Errorf("%w: %s/%s", ErrConversationNotFound, workspaceID, conversationID)
	}
	return conversation, err
}

func readSnapshotTurns(ctx context.Context, reader snapshotReader, conversationID string) (ConversationTurnWindow, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, authored_input_json, delivery, status, accepted_at,
       started_at, ended_at, requested_role_profile_json,
       resolved_invocation_json, provider_turn_id, error_json
FROM conversation_turns
WHERE conversation_id = ?
ORDER BY accepted_at DESC, id DESC
LIMIT ?
`, conversationID, MaxSnapshotTurns+1)
	if err != nil {
		return ConversationTurnWindow{}, err
	}
	defer rows.Close()
	turns := make([]ConversationTurn, 0, MaxSnapshotTurns+1)
	for rows.Next() {
		turn, scanErr := scanConversationTurn(rows)
		if scanErr != nil {
			return ConversationTurnWindow{}, scanErr
		}
		turns = append(turns, turn)
	}
	if err := rows.Err(); err != nil {
		return ConversationTurnWindow{}, err
	}
	hasEarlier := len(turns) > MaxSnapshotTurns
	if hasEarlier {
		turns = turns[:MaxSnapshotTurns]
	}
	reverseSlice(turns)
	return ConversationTurnWindow{Turns: turns, HasEarlier: hasEarlier}, nil
}

func readSnapshotQueue(ctx context.Context, reader snapshotReader, conversationID string) ([]QueuedConversationTurn, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT turn_id, conversation_id, ordinal, queued_at
FROM conversation_queue
WHERE conversation_id = ?
ORDER BY ordinal ASC
LIMIT ?
`, conversationID, MaxSnapshotQueuedTurns)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	queue := make([]QueuedConversationTurn, 0)
	for rows.Next() {
		var item QueuedConversationTurn
		if err := rows.Scan(&item.TurnID, &item.ConversationID, &item.Ordinal, &item.QueuedAt); err != nil {
			return nil, err
		}
		queue = append(queue, item)
	}
	return queue, rows.Err()
}

func readSnapshotBinding(ctx context.Context, reader snapshotReader, conversationID string) (*AgentThreadBinding, error) {
	row := reader.QueryRowContext(ctx, `
SELECT conversation_id, provider, thread_id, status, created_at, last_resumed_at,
       last_turn_id, provider_metadata_json
FROM agent_thread_bindings
WHERE conversation_id = ?
`, conversationID)
	binding, err := scanAgentThreadBinding(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &binding, nil
}

func readSnapshotEventCursor(ctx context.Context, reader snapshotReader, conversationID string) (ConversationEventCursor, error) {
	streamID, err := ConversationStreamID(conversationID)
	if err != nil {
		return ConversationEventCursor{}, err
	}
	var sequence int
	if err := reader.QueryRowContext(ctx, `
SELECT COALESCE(MAX(stream_sequence), 0)
FROM committed_events
WHERE stream_id = ?
`, streamID).Scan(&sequence); err != nil {
		return ConversationEventCursor{}, err
	}
	return ConversationEventCursor{StreamID: streamID, Sequence: sequence}, nil
}

func reverseSlice[T any](values []T) {
	for left, right := 0, len(values)-1; left < right; left, right = left+1, right-1 {
		values[left], values[right] = values[right], values[left]
	}
}
