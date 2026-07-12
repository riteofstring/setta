package conversation

import (
	"database/sql"
	"errors"
	"fmt"
)

type NarratorStateExpectation struct {
	ObservedThroughSequence   int
	CheckpointThroughSequence int
	CurrentFocusRevision      int
	UpdatedAt                 string
}

func (transaction *WriteTransaction) InsertNarratorState(state NarratorState) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := state.Validate(); err != nil {
		return err
	}
	if err := transaction.requireConversationCoversSequence(
		state.ConversationID,
		state.ObservedThroughSequence,
		"narrator state",
		state.ConversationID,
	); err != nil {
		return err
	}
	degradationJSON, err := encodeOptionalJSONColumn("narrator degradation", state.Degradation)
	if err != nil {
		return err
	}
	_, err = transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO narrator_state (
  conversation_id, observed_through_sequence, checkpoint_through_sequence,
  checkpoint_text, current_focus, current_focus_revision, topic_descriptor,
  last_invocation_at, status, degradation_json, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		state.ConversationID,
		state.ObservedThroughSequence,
		state.CheckpointThroughSequence,
		state.CheckpointText,
		state.CurrentFocus,
		state.CurrentFocusRevision,
		state.TopicDescriptor,
		nullableString(state.LastInvocationAt),
		state.Status,
		degradationJSON,
		state.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert narrator state for %s: %w", state.ConversationID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) UpdateNarratorState(
	expected NarratorStateExpectation,
	state NarratorState,
) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := validateNarratorStateExpectation(expected, state); err != nil {
		return err
	}
	if err := transaction.capturePresentationActivity(); err != nil {
		return err
	}
	transaction.presentationActivityUpdatedAt = advanceTimestamp(
		transaction.presentationActivityUpdatedAt,
		state.UpdatedAt,
	)
	if err := transaction.requireConversationCoversSequence(
		state.ConversationID,
		state.ObservedThroughSequence,
		"narrator state",
		state.ConversationID,
	); err != nil {
		return err
	}
	degradationJSON, err := encodeOptionalJSONColumn("narrator degradation", state.Degradation)
	if err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE narrator_state
SET observed_through_sequence = ?, checkpoint_through_sequence = ?,
    checkpoint_text = ?, current_focus = ?, current_focus_revision = ?,
    topic_descriptor = ?, last_invocation_at = ?, status = ?,
    degradation_json = ?, updated_at = ?
WHERE conversation_id = ?
  AND observed_through_sequence = ?
  AND checkpoint_through_sequence = ?
  AND current_focus_revision = ?
  AND updated_at = ?
  AND (? > observed_through_sequence OR topic_descriptor = ?)
  AND (? > checkpoint_through_sequence OR checkpoint_text = ?)
  AND (? > current_focus_revision OR current_focus = ?)
`,
		state.ObservedThroughSequence,
		state.CheckpointThroughSequence,
		state.CheckpointText,
		state.CurrentFocus,
		state.CurrentFocusRevision,
		state.TopicDescriptor,
		nullableString(state.LastInvocationAt),
		state.Status,
		degradationJSON,
		state.UpdatedAt,
		state.ConversationID,
		expected.ObservedThroughSequence,
		expected.CheckpointThroughSequence,
		expected.CurrentFocusRevision,
		expected.UpdatedAt,
		state.ObservedThroughSequence,
		state.TopicDescriptor,
		state.CheckpointThroughSequence,
		state.CheckpointText,
		state.CurrentFocusRevision,
		state.CurrentFocus,
	)
	if err != nil {
		return fmt.Errorf("update narrator state for %s: %w", state.ConversationID, err)
	}
	if err := requireOneRow(
		result,
		"narrator state",
		state.ConversationID,
		"cursor, cursor-owned text, focus revision, or update-time expectation did not match",
	); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}

// AppendNarrationEvent assigns the durable stream sequence. Callers must pass
// zero in StreamSequence and use the returned record for subsequent work.
func (transaction *WriteTransaction) AppendNarrationEvent(event NarrationEvent) (NarrationEvent, error) {
	if err := transaction.ensureActive(); err != nil {
		return NarrationEvent{}, err
	}
	if err := validateNarrationEventForAppend(event); err != nil {
		return NarrationEvent{}, err
	}
	if err := transaction.validateNarrationEventReferences(event); err != nil {
		return NarrationEvent{}, err
	}
	payloadJSON, resolvedInvocationJSON, err := encodeNarrationEventColumns(event)
	if err != nil {
		return NarrationEvent{}, err
	}
	if err := transaction.insertNarrationEvent(&event, payloadJSON, resolvedInvocationJSON); err != nil {
		return NarrationEvent{}, err
	}
	if err := rebuildTopicIndexDocument(transaction.ctx, transaction.tx, event.ConversationID); err != nil {
		return NarrationEvent{}, fmt.Errorf("index narration event %s: %w", event.ID, err)
	}
	if err := transaction.recordStateMutation(); err != nil {
		return NarrationEvent{}, err
	}
	return event, nil
}

func validateNarrationEventForAppend(event NarrationEvent) error {
	if event.StreamSequence != 0 {
		return fmt.Errorf("narration event %s stream sequence must be zero before append", event.ID)
	}
	validated := event
	validated.StreamSequence = 1
	return validated.Validate()
}

func (transaction *WriteTransaction) validateNarrationEventReferences(event NarrationEvent) error {
	if event.TurnID != nil {
		if err := transaction.requireTurnBelongs(*event.TurnID, event.ConversationID, "narration event", event.ID); err != nil {
			return err
		}
	}
	return transaction.requireConversationCoversSequence(
		event.ConversationID,
		event.SourceSequenceEnd,
		"narration event",
		event.ID,
	)
}

func encodeNarrationEventColumns(event NarrationEvent) (string, string, error) {
	payload, err := narrationEventPayload(event)
	if err != nil {
		return "", "", err
	}
	payloadJSON, err := encodeJSONColumn("narration event payload", payload)
	if err != nil {
		return "", "", err
	}
	resolvedInvocationJSON, err := encodeJSONColumn("narration event resolved invocation", event.ResolvedInvocation)
	if err != nil {
		return "", "", err
	}
	return payloadJSON, resolvedInvocationJSON, nil
}

func (transaction *WriteTransaction) insertNarrationEvent(
	event *NarrationEvent,
	payloadJSON string,
	resolvedInvocationJSON string,
) error {
	err := transaction.tx.QueryRowContext(transaction.ctx, `
INSERT INTO narration_events (
  id, conversation_id, turn_id, kind, source_sequence_start,
  source_sequence_end, trigger, payload_json, resolved_invocation_json, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING stream_sequence
`,
		event.ID,
		event.ConversationID,
		nullableString(event.TurnID),
		event.Kind,
		event.SourceSequenceStart,
		event.SourceSequenceEnd,
		event.Trigger,
		payloadJSON,
		resolvedInvocationJSON,
		event.CreatedAt,
	).Scan(&event.StreamSequence)
	if err != nil {
		return fmt.Errorf("append narration event %s: %w", event.ID, err)
	}
	if err := event.Validate(); err != nil {
		return err
	}
	return nil
}

func validateNarratorStateExpectation(expected NarratorStateExpectation, state NarratorState) error {
	if err := state.Validate(); err != nil {
		return err
	}
	if err := validateNarratorExpectedVersion(expected, state.ConversationID); err != nil {
		return err
	}
	if err := validateNarratorUpdateTime(expected.UpdatedAt, state); err != nil {
		return err
	}
	return validateNarratorMonotonicUpdate(expected, state)
}

func validateNarratorExpectedVersion(expected NarratorStateExpectation, conversationID string) error {
	if expected.ObservedThroughSequence < 0 || expected.CheckpointThroughSequence < 0 || expected.CurrentFocusRevision < 0 {
		return fmt.Errorf("narrator state %s expectation values must be non-negative", conversationID)
	}
	if expected.CheckpointThroughSequence > expected.ObservedThroughSequence {
		return fmt.Errorf("narrator state %s expected checkpoint exceeds expected observed cursor", conversationID)
	}
	return nil
}

func validateNarratorUpdateTime(expectedUpdatedAtValue string, state NarratorState) error {
	expectedUpdatedAt, err := validateTimestamp("narrator expected updatedAt", expectedUpdatedAtValue)
	if err != nil {
		return err
	}
	updatedAt, err := validateTimestamp("narrator state updatedAt", state.UpdatedAt)
	if err != nil {
		return err
	}
	if !updatedAt.After(expectedUpdatedAt) {
		return fmt.Errorf("narrator state %s updatedAt must advance beyond its expected version", state.ConversationID)
	}
	return nil
}

func validateNarratorMonotonicUpdate(expected NarratorStateExpectation, state NarratorState) error {
	if state.ObservedThroughSequence < expected.ObservedThroughSequence {
		return fmt.Errorf("narrator state %s observed cursor cannot move backward", state.ConversationID)
	}
	if state.CheckpointThroughSequence < expected.CheckpointThroughSequence {
		return fmt.Errorf("narrator state %s checkpoint cursor cannot move backward", state.ConversationID)
	}
	if state.CurrentFocusRevision < expected.CurrentFocusRevision {
		return fmt.Errorf("narrator state %s focus revision cannot move backward", state.ConversationID)
	}
	if state.CurrentFocusRevision > expected.CurrentFocusRevision &&
		state.ObservedThroughSequence == expected.ObservedThroughSequence {
		return fmt.Errorf(
			"narrator state %s focus revision cannot advance without observing trajectory",
			state.ConversationID,
		)
	}
	return nil
}

func (transaction *WriteTransaction) requireConversationCoversSequence(
	conversationID string,
	sequence int,
	entity string,
	entityID string,
) error {
	var lastSequence int
	err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT last_trajectory_sequence
FROM conversations
WHERE id = ?
`, conversationID).Scan(&lastSequence)
	if errors.Is(err, sql.ErrNoRows) {
		return stateConflict(entity, entityID, "conversation does not exist")
	}
	if err != nil {
		return fmt.Errorf("read trajectory coverage for %s %s: %w", entity, entityID, err)
	}
	if sequence > lastSequence {
		return stateConflict(
			entity,
			entityID,
			fmt.Sprintf("source sequence %d exceeds conversation sequence %d", sequence, lastSequence),
		)
	}
	return nil
}

func narrationEventPayload(event NarrationEvent) (any, error) {
	switch event.Kind {
	case NarrationEventKindMilestone:
		return event.Milestone, nil
	case NarrationEventKindStatusReply:
		return event.StatusReply, nil
	case NarrationEventKindFinalSummary:
		return event.FinalSummary, nil
	case NarrationEventKindTopicDescriptor:
		return event.TopicDescriptor, nil
	default:
		return nil, fmt.Errorf("narration event %s has unsupported kind %q", event.ID, event.Kind)
	}
}
