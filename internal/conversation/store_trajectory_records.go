package conversation

import "fmt"

func (transaction *WriteTransaction) AppendTrajectoryEvent(event TrajectoryEvent) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := event.Validate(); err != nil {
		return err
	}
	if event.TurnID != nil {
		if err := transaction.requireTurnBelongs(*event.TurnID, event.ConversationID, "trajectory event", event.ID); err != nil {
			return err
		}
	}
	payload, err := event.trajectoryPayload()
	if err != nil {
		return err
	}
	payloadJSON, err := encodeJSONColumn("trajectory event payload", payload)
	if err != nil {
		return err
	}
	previousSequence := event.Sequence - 1
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversations
SET last_trajectory_sequence = ?
WHERE id = ? AND last_trajectory_sequence = ?
`, event.Sequence, event.ConversationID, previousSequence)
	if err != nil {
		return fmt.Errorf("advance trajectory cursor for conversation %s: %w", event.ConversationID, err)
	}
	if err := requireOneRow(
		result,
		"conversation trajectory",
		event.ConversationID,
		fmt.Sprintf("expected sequence %d before event %s", previousSequence, event.ID),
	); err != nil {
		return err
	}
	_, err = transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO trajectory_events (
  id, conversation_id, turn_id, sequence, emitted_at, kind, actor,
  provider_event_id, provider_turn_id, payload_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.ID,
		event.ConversationID,
		nullableString(event.TurnID),
		event.Sequence,
		event.EmittedAt,
		event.Kind,
		event.Actor,
		nullableString(event.ProviderEventID),
		nullableString(event.ProviderTurnID),
		payloadJSON,
	)
	if err != nil {
		return fmt.Errorf("append trajectory event %s: %w", event.ID, err)
	}
	return transaction.recordStateMutation()
}
