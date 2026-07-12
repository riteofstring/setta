package conversation

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"reflect"
)

type ConversationExpectation struct {
	UpdatedAt              string
	LastTrajectorySequence int
}

func (transaction *WriteTransaction) InsertConversation(conversation TopicConversation) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := conversation.Validate(); err != nil {
		return err
	}
	if conversation.LastTrajectorySequence != 0 {
		return fmt.Errorf(
			"new conversation %s trajectory sequence must start at zero",
			conversation.ID,
		)
	}
	_, err := transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO conversations (
  id, workspace_id, title, topic_descriptor, status, created_at, updated_at,
  archived_at, last_trajectory_sequence
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		conversation.ID,
		conversation.WorkspaceID,
		conversation.Title,
		conversation.TopicDescriptor,
		conversation.Status,
		conversation.CreatedAt,
		conversation.UpdatedAt,
		nullableString(conversation.ArchivedAt),
		conversation.LastTrajectorySequence,
	)
	if err != nil {
		return fmt.Errorf("insert conversation %s: %w", conversation.ID, err)
	}
	if err := rebuildTopicIndexDocument(transaction.ctx, transaction.tx, conversation.ID); err != nil {
		return fmt.Errorf("index inserted conversation %s: %w", conversation.ID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) UpdateConversation(
	expected ConversationExpectation,
	conversation TopicConversation,
) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := validateConversationExpectation(expected, conversation); err != nil {
		return err
	}
	var previousStatus ConversationStatus
	var previousArchivedAt sql.NullString
	if err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT status, archived_at
FROM conversations
WHERE id = ?
`, conversation.ID).Scan(&previousStatus, &previousArchivedAt); err != nil {
		return fmt.Errorf("read conversation %s presentation activity: %w", conversation.ID, err)
	}
	activityChanged := previousStatus != conversation.Status ||
		previousArchivedAt.Valid != (conversation.ArchivedAt != nil)
	if activityChanged {
		if err := transaction.capturePresentationActivity(); err != nil {
			return err
		}
		transaction.presentationActivityUpdatedAt = advanceTimestamp(
			transaction.presentationActivityUpdatedAt,
			conversation.UpdatedAt,
		)
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversations
SET title = ?, topic_descriptor = ?, status = ?, updated_at = ?, archived_at = ?
WHERE id = ?
  AND workspace_id = ?
  AND created_at = ?
  AND updated_at = ?
  AND last_trajectory_sequence = ?
`,
		conversation.Title,
		conversation.TopicDescriptor,
		conversation.Status,
		conversation.UpdatedAt,
		nullableString(conversation.ArchivedAt),
		conversation.ID,
		conversation.WorkspaceID,
		conversation.CreatedAt,
		expected.UpdatedAt,
		expected.LastTrajectorySequence,
	)
	if err != nil {
		return fmt.Errorf("update conversation %s: %w", conversation.ID, err)
	}
	if err := requireOneRow(result, "conversation", conversation.ID, "projection expectation did not match"); err != nil {
		return err
	}
	if err := rebuildTopicIndexDocument(transaction.ctx, transaction.tx, conversation.ID); err != nil {
		return fmt.Errorf("index updated conversation %s: %w", conversation.ID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) InsertTurn(turn ConversationTurn) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := turn.Validate(); err != nil {
		return err
	}
	authoredInputJSON, err := encodeJSONColumn("turn authored input", turn.AuthoredInput)
	if err != nil {
		return err
	}
	requestedProfileJSON, err := encodeJSONColumn("turn requested role profile", turn.RequestedRoleProfile)
	if err != nil {
		return err
	}
	resolvedInvocationJSON, err := encodeOptionalJSONColumn("turn resolved invocation", turn.ResolvedInvocation)
	if err != nil {
		return err
	}
	failureJSON, err := encodeOptionalJSONColumn("turn failure", turn.Error)
	if err != nil {
		return err
	}
	_, err = transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO conversation_turns (
  id, conversation_id, authored_input_json, delivery, status, accepted_at,
  started_at, ended_at, requested_role_profile_json,
  resolved_invocation_json, provider_turn_id, error_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		turn.ID,
		turn.ConversationID,
		authoredInputJSON,
		turn.Delivery,
		turn.Status,
		turn.AcceptedAt,
		nullableString(turn.StartedAt),
		nullableString(turn.EndedAt),
		requestedProfileJSON,
		resolvedInvocationJSON,
		nullableString(turn.ProviderTurnID),
		failureJSON,
	)
	if err != nil {
		return fmt.Errorf("insert conversation turn %s: %w", turn.ID, err)
	}
	if err := rebuildTopicIndexDocument(transaction.ctx, transaction.tx, turn.ConversationID); err != nil {
		return fmt.Errorf("index conversation turn %s: %w", turn.ID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) UpdateTurn(expectedStatus TurnStatus, turn ConversationTurn) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if !validTurnStatus(expectedStatus) {
		return fmt.Errorf("turn %s has unsupported expected status %q", turn.ID, expectedStatus)
	}
	if err := turn.Validate(); err != nil {
		return err
	}
	if err := validateTurnStatusTransition(expectedStatus, turn.Status, turn.ID); err != nil {
		return err
	}
	authoredInputJSON, err := encodeJSONColumn("turn authored input", turn.AuthoredInput)
	if err != nil {
		return err
	}
	requestedProfileJSON, err := encodeJSONColumn("turn requested role profile", turn.RequestedRoleProfile)
	if err != nil {
		return err
	}
	resolvedInvocationJSON, err := encodeOptionalJSONColumn("turn resolved invocation", turn.ResolvedInvocation)
	if err != nil {
		return err
	}
	failureJSON, err := encodeOptionalJSONColumn("turn failure", turn.Error)
	if err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_turns
SET status = ?, started_at = ?, ended_at = ?, resolved_invocation_json = ?,
    provider_turn_id = ?, error_json = ?
WHERE id = ?
  AND conversation_id = ?
  AND authored_input_json = ?
  AND delivery = ?
  AND accepted_at = ?
  AND requested_role_profile_json = ?
  AND status = ?
`,
		turn.Status,
		nullableString(turn.StartedAt),
		nullableString(turn.EndedAt),
		resolvedInvocationJSON,
		nullableString(turn.ProviderTurnID),
		failureJSON,
		turn.ID,
		turn.ConversationID,
		authoredInputJSON,
		turn.Delivery,
		turn.AcceptedAt,
		requestedProfileJSON,
		expectedStatus,
	)
	if err != nil {
		return fmt.Errorf("update conversation turn %s: %w", turn.ID, err)
	}
	if err := requireOneRow(result, "turn", turn.ID, "accepted record or status expectation did not match"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) InsertQueuedTurn(queued QueuedConversationTurn) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := queued.Validate(); err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO conversation_queue (turn_id, conversation_id, ordinal, queued_at)
SELECT id, conversation_id, ?, ?
FROM conversation_turns
WHERE id = ? AND conversation_id = ? AND status = 'queued' AND delivery = 'queued'
`, queued.Ordinal, queued.QueuedAt, queued.TurnID, queued.ConversationID)
	if err != nil {
		return fmt.Errorf("insert queued turn %s: %w", queued.TurnID, err)
	}
	if err := requireOneRow(result, "queued turn", queued.TurnID, "queued turn record did not match"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) UpdateQueuedTurn(expectedOrdinal int, queued QueuedConversationTurn) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if expectedOrdinal <= 0 {
		return fmt.Errorf("queued turn %s expected ordinal must be positive", queued.TurnID)
	}
	if err := queued.Validate(); err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_queue
SET ordinal = ?, queued_at = ?
WHERE turn_id = ? AND conversation_id = ? AND ordinal = ?
  AND EXISTS (
    SELECT 1
    FROM conversation_turns
    WHERE conversation_turns.id = conversation_queue.turn_id
      AND conversation_turns.conversation_id = conversation_queue.conversation_id
      AND conversation_turns.status = 'queued'
      AND conversation_turns.delivery = 'queued'
  )
`, queued.Ordinal, queued.QueuedAt, queued.TurnID, queued.ConversationID, expectedOrdinal)
	if err != nil {
		return fmt.Errorf("update queued turn %s: %w", queued.TurnID, err)
	}
	if err := requireOneRow(result, "queued turn", queued.TurnID, "queue expectation did not match"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) DeleteQueuedTurn(
	turnID string,
	conversationID string,
	expectedOrdinal int,
) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := validateIdentifier("queued turn id", turnID); err != nil {
		return err
	}
	if err := validateIdentifier("queued turn conversation id", conversationID); err != nil {
		return err
	}
	if expectedOrdinal <= 0 {
		return fmt.Errorf("queued turn %s expected ordinal must be positive", turnID)
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
DELETE FROM conversation_queue
WHERE turn_id = ? AND conversation_id = ? AND ordinal = ?
`, turnID, conversationID, expectedOrdinal)
	if err != nil {
		return fmt.Errorf("delete queued turn %s: %w", turnID, err)
	}
	if err := requireOneRow(result, "queued turn", turnID, "queue expectation did not match"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) CompactQueuedTurns(
	conversationID string,
	removedOrdinal int,
) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := validateIdentifier("queued turn conversation id", conversationID); err != nil {
		return err
	}
	if removedOrdinal <= 0 {
		return fmt.Errorf("removed queue ordinal must be positive: %d", removedOrdinal)
	}
	rows, err := transaction.tx.QueryContext(transaction.ctx, `
SELECT turn_id, conversation_id, ordinal, queued_at
FROM conversation_queue
WHERE conversation_id = ? AND ordinal > ?
ORDER BY ordinal ASC
`, conversationID, removedOrdinal)
	if err != nil {
		return fmt.Errorf("read queued turns after ordinal %d: %w", removedOrdinal, err)
	}
	queued := make([]QueuedConversationTurn, 0)
	for rows.Next() {
		var item QueuedConversationTurn
		if err := rows.Scan(&item.TurnID, &item.ConversationID, &item.Ordinal, &item.QueuedAt); err != nil {
			_ = rows.Close()
			return err
		}
		queued = append(queued, item)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, item := range queued {
		expectedOrdinal := item.Ordinal
		item.Ordinal--
		if err := transaction.UpdateQueuedTurn(expectedOrdinal, item); err != nil {
			return err
		}
	}
	return nil
}

func (transaction *WriteTransaction) UpsertAgentThreadBinding(binding AgentThreadBinding) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := binding.Validate(); err != nil {
		return err
	}
	if binding.LastTurnID != nil {
		if err := transaction.requireTurnBelongs(
			*binding.LastTurnID,
			binding.ConversationID,
			"agent thread binding",
			binding.ConversationID,
		); err != nil {
			return err
		}
	}
	providerMetadataJSON, err := encodeJSONColumn("thread binding provider metadata", binding.ProviderMetadata)
	if err != nil {
		return err
	}
	_, err = transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO agent_thread_bindings (
  conversation_id, provider, thread_id, status, created_at, last_resumed_at,
  last_turn_id, provider_metadata_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(conversation_id) DO UPDATE SET
  provider = excluded.provider,
  thread_id = excluded.thread_id,
  status = excluded.status,
  created_at = excluded.created_at,
  last_resumed_at = excluded.last_resumed_at,
  last_turn_id = excluded.last_turn_id,
  provider_metadata_json = excluded.provider_metadata_json
`,
		binding.ConversationID,
		binding.Provider,
		binding.ThreadID,
		binding.Status,
		binding.CreatedAt,
		nullableString(binding.LastResumedAt),
		nullableString(binding.LastTurnID),
		providerMetadataJSON,
	)
	if err != nil {
		return fmt.Errorf("upsert agent thread binding for %s: %w", binding.ConversationID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) InsertArtifact(artifact Artifact) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := artifact.Validate(); err != nil {
		return err
	}
	metadataJSON, err := encodeJSONColumn("artifact metadata", artifact.Metadata)
	if err != nil {
		return err
	}
	if artifact.TurnID != nil {
		if err := transaction.requireTurnBelongs(*artifact.TurnID, artifact.ConversationID, "artifact", artifact.ID); err != nil {
			return err
		}
	}
	if artifact.TrajectorySequence != nil {
		if err := transaction.requireConversationCoversSequence(
			artifact.ConversationID,
			*artifact.TrajectorySequence,
			"artifact",
			artifact.ID,
		); err != nil {
			return err
		}
	}
	_, err = transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO artifacts (
  id, conversation_id, turn_id, trajectory_sequence, kind, uri, title,
  media_type, metadata_json, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		artifact.ID,
		artifact.ConversationID,
		nullableString(artifact.TurnID),
		nullableInt(artifact.TrajectorySequence),
		artifact.Kind,
		artifact.URI,
		artifact.Title,
		artifact.MediaType,
		metadataJSON,
		artifact.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert artifact %s: %w", artifact.ID, err)
	}
	return transaction.recordStateMutation()
}

func validateConversationExpectation(expected ConversationExpectation, conversation TopicConversation) error {
	if err := conversation.Validate(); err != nil {
		return err
	}
	expectedUpdatedAt, err := validateTimestamp("conversation expected updatedAt", expected.UpdatedAt)
	if err != nil {
		return err
	}
	updatedAt, err := validateTimestamp("conversation updatedAt", conversation.UpdatedAt)
	if err != nil {
		return err
	}
	if !updatedAt.After(expectedUpdatedAt) {
		return fmt.Errorf("conversation %s updatedAt must advance beyond its expected version", conversation.ID)
	}
	if expected.LastTrajectorySequence < 0 {
		return fmt.Errorf("conversation %s expected trajectory sequence must be non-negative", conversation.ID)
	}
	if conversation.LastTrajectorySequence != expected.LastTrajectorySequence {
		return fmt.Errorf(
			"conversation %s update cannot change trajectory sequence from %d to %d",
			conversation.ID,
			expected.LastTrajectorySequence,
			conversation.LastTrajectorySequence,
		)
	}
	return nil
}

func validateTurnStatusTransition(expected TurnStatus, next TurnStatus, turnID string) error {
	if expected == next {
		return nil
	}
	allowed := false
	switch expected {
	case TurnStatusQueued:
		allowed = next == TurnStatusRunning ||
			next == TurnStatusCompleted ||
			next == TurnStatusCancelled ||
			next == TurnStatusFailed
	case TurnStatusRunning:
		allowed = next == TurnStatusCompleted ||
			next == TurnStatusCancelled ||
			next == TurnStatusFailed
	case TurnStatusCompleted, TurnStatusCancelled, TurnStatusFailed:
		allowed = false
	default:
		return fmt.Errorf("turn %s has unsupported expected status %q", turnID, expected)
	}
	if !allowed {
		return stateConflict(
			"turn",
			turnID,
			fmt.Sprintf("status cannot transition from %s to %s", expected, next),
		)
	}
	return nil
}

func (transaction *WriteTransaction) requireTurnBelongs(
	turnID string,
	conversationID string,
	entity string,
	entityID string,
) error {
	var belongs bool
	err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT EXISTS(
  SELECT 1
  FROM conversation_turns
  WHERE id = ? AND conversation_id = ?
)
`, turnID, conversationID).Scan(&belongs)
	if err != nil {
		return fmt.Errorf("verify %s %s turn ownership: %w", entity, entityID, err)
	}
	if !belongs {
		return stateConflict(entity, entityID, "turn does not belong to the conversation")
	}
	return nil
}

func encodeJSONColumn(label string, value any) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", fmt.Errorf("encode %s: %w", label, err)
	}
	if !json.Valid(encoded) {
		return "", fmt.Errorf("encode %s: invalid JSON", label)
	}
	return string(encoded), nil
}

func encodeOptionalJSONColumn(label string, value any) (any, error) {
	if isNilJSONValue(value) {
		return nil, nil
	}
	encoded, err := encodeJSONColumn(label, value)
	if err != nil {
		return nil, err
	}
	return encoded, nil
}

func isNilJSONValue(value any) bool {
	if value == nil {
		return true
	}
	reflected := reflect.ValueOf(value)
	switch reflected.Kind() {
	case reflect.Chan, reflect.Func, reflect.Interface, reflect.Map, reflect.Pointer, reflect.Slice:
		return reflected.IsNil()
	default:
		return false
	}
}

func nullableString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableInt(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func sqliteBool(value bool) int {
	if value {
		return 1
	}
	return 0
}
