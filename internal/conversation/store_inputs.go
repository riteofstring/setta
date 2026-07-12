package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

func (store *Store) AcceptConversationInput(
	ctx context.Context,
	input ConversationInput,
	acceptedAt string,
) (AcceptedConversationInput, error) {
	if err := validateAcceptedConversationInputRequest(store, ctx, input, acceptedAt); err != nil {
		return AcceptedConversationInput{}, err
	}

	var accepted AcceptedConversationInput
	appendedEvent := false
	err := store.write(ctx, "accept conversation input", func(ctx context.Context, tx *sql.Tx) error {
		var err error
		accepted, appendedEvent, err = acceptConversationInputTransaction(
			ctx,
			tx,
			store.dbPath,
			input,
			acceptedAt,
		)
		return err
	})
	if err != nil {
		return AcceptedConversationInput{}, err
	}
	if appendedEvent {
		store.notifyCommittedEvents()
	}
	return CloneAcceptedConversationInput(accepted), nil
}

func validateAcceptedConversationInputRequest(
	store *Store,
	ctx context.Context,
	input ConversationInput,
	acceptedAt string,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("conversation input acceptance context is required")
	}
	normalized, err := NormalizeConversationInput(input)
	if err != nil {
		return err
	}
	if !EqualConversationInputs(normalized, input) {
		return errors.New("conversation input must be normalized before persistence")
	}
	return (AcceptedConversationInput{
		Sequence:   1,
		Input:      input,
		Status:     ConversationInputStatusAccepted,
		AcceptedAt: acceptedAt,
	}).Validate()
}

func acceptConversationInputTransaction(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	input ConversationInput,
	acceptedAt string,
) (AcceptedConversationInput, bool, error) {
	existing, found, err := readConversationInputRow(ctx, tx, input.ID, dbPath)
	if err != nil {
		return AcceptedConversationInput{}, false, err
	}
	if found {
		if !EqualConversationInputs(existing.Input, input) {
			return AcceptedConversationInput{}, false, &ConversationInputConflictError{InputID: input.ID}
		}
		return existing, false, nil
	}
	if err := requireConversationInputTarget(ctx, tx, input.ConversationID); err != nil {
		return AcceptedConversationInput{}, false, err
	}
	if err := requireConversationInputReplyTarget(ctx, tx, dbPath, input); err != nil {
		return AcceptedConversationInput{}, false, err
	}

	accepted := AcceptedConversationInput{
		Input:      input,
		Status:     ConversationInputStatusAccepted,
		AcceptedAt: acceptedAt,
	}
	if err := tx.QueryRowContext(ctx, `
INSERT INTO conversation_inputs (
  id, conversation_id, source_pane_id, reply_to_input_id, input_text,
  input_modality, requested_mode, status, submitted_at, accepted_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING sequence
`,
		input.ID,
		input.ConversationID,
		nullableString(input.SourcePaneID),
		nullableString(input.ReplyToInputID),
		input.Text,
		input.Modality,
		input.RequestedMode,
		accepted.Status,
		input.SubmittedAt,
		acceptedAt,
	).Scan(&accepted.Sequence); err != nil {
		return AcceptedConversationInput{}, false, fmt.Errorf("insert conversation input %s: %w", input.ID, err)
	}
	if err := appendConversationInputAcceptedEvent(ctx, tx, accepted); err != nil {
		return AcceptedConversationInput{}, false, err
	}
	return accepted, true, nil
}

func requireConversationInputTarget(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
) error {
	var found int
	err := tx.QueryRowContext(ctx, `
SELECT 1
FROM conversations
WHERE id = ?
`, conversationID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("%w: %s", ErrConversationNotFound, conversationID)
	}
	return err
}

func requireConversationInputReplyTarget(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	input ConversationInput,
) error {
	if input.ReplyToInputID == nil {
		return nil
	}
	reply, found, err := readConversationInputRow(ctx, tx, *input.ReplyToInputID, dbPath)
	if err != nil {
		return err
	}
	if !found {
		return stateConflict("conversation input reply", *input.ReplyToInputID, "reply target was not found")
	}
	if reply.Input.ConversationID != input.ConversationID {
		return stateConflict("conversation input reply", *input.ReplyToInputID, "reply target belongs to another conversation")
	}
	return nil
}

func appendConversationInputAcceptedEvent(
	ctx context.Context,
	tx *sql.Tx,
	accepted AcceptedConversationInput,
) error {
	streamID, err := ConversationInputStreamID(accepted.Input.ConversationID)
	if err != nil {
		return err
	}
	eventID, err := ConversationInputAcceptedEventID(accepted.Input.ID)
	if err != nil {
		return err
	}
	transaction := &WriteTransaction{ctx: ctx, tx: tx, active: true}
	defer func() {
		transaction.active = false
	}()
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          eventID,
		StreamID:    streamID,
		Kind:        ConversationInputAcceptedEventKind,
		Payload:     accepted,
		CommittedAt: accepted.AcceptedAt,
	}); err != nil {
		return err
	}
	return validateWriteTransactionResult(transaction)
}

func (store *Store) ReadConversationInput(
	ctx context.Context,
	inputID string,
) (AcceptedConversationInput, bool, error) {
	if store == nil {
		return AcceptedConversationInput{}, false, errors.New("conversation store is required")
	}
	if ctx == nil {
		return AcceptedConversationInput{}, false, errors.New("conversation input read context is required")
	}
	if err := ValidateConversationInputID(inputID); err != nil {
		return AcceptedConversationInput{}, false, fmt.Errorf("read conversation input id: %w", err)
	}
	var accepted AcceptedConversationInput
	var found bool
	err := store.read(ctx, "read conversation input", func(ctx context.Context, reader *sql.Conn) error {
		var err error
		accepted, found, err = readConversationInputRow(ctx, reader, inputID, store.dbPath)
		return err
	})
	if err != nil {
		return AcceptedConversationInput{}, false, err
	}
	return CloneAcceptedConversationInput(accepted), found, nil
}

type conversationInputQuery interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readConversationInputRow(
	ctx context.Context,
	query conversationInputQuery,
	inputID string,
	dbPath string,
) (AcceptedConversationInput, bool, error) {
	var accepted AcceptedConversationInput
	var sourcePaneID sql.NullString
	var replyToInputID sql.NullString
	err := query.QueryRowContext(ctx, `
SELECT sequence, id, conversation_id, source_pane_id, reply_to_input_id,
       input_text, input_modality, requested_mode, status, submitted_at, accepted_at
FROM conversation_inputs
WHERE id = ?
`, inputID).Scan(
		&accepted.Sequence,
		&accepted.Input.ID,
		&accepted.Input.ConversationID,
		&sourcePaneID,
		&replyToInputID,
		&accepted.Input.Text,
		&accepted.Input.Modality,
		&accepted.Input.RequestedMode,
		&accepted.Status,
		&accepted.Input.SubmittedAt,
		&accepted.AcceptedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return AcceptedConversationInput{}, false, nil
	}
	if err != nil {
		return AcceptedConversationInput{}, false, fmt.Errorf("read conversation input %s: %w", inputID, err)
	}
	accepted.Input.SourcePaneID = optionalScannedString(sourcePaneID)
	accepted.Input.ReplyToInputID = optionalScannedString(replyToInputID)
	if err := accepted.Validate(); err != nil {
		return AcceptedConversationInput{}, false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode conversation input %s: %w", inputID, err),
		}
	}
	return accepted, true, nil
}
