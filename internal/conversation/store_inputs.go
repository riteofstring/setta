package conversation

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/jsonio"
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
  input_modality, status, submitted_at, accepted_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING sequence
`,
		input.ID,
		input.ConversationID,
		nullableString(input.SourcePaneID),
		nullableString(input.ReplyToInputID),
		input.Text,
		input.Modality,
		accepted.Status,
		input.SubmittedAt,
		acceptedAt,
	).Scan(&accepted.Sequence); err != nil {
		return AcceptedConversationInput{}, false, fmt.Errorf("insert conversation input %s: %w", input.ID, err)
	}
	if err := appendConversationInputAcceptedEvent(ctx, tx, accepted); err != nil {
		return AcceptedConversationInput{}, false, err
	}
	if err := rebuildTopicIndexDocument(ctx, tx, input.ConversationID); err != nil {
		return AcceptedConversationInput{}, false, fmt.Errorf("index conversation input %s: %w", input.ID, err)
	}
	return accepted, true, nil
}

func requireConversationInputTarget(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
) error {
	var archivedAt sql.NullString
	err := tx.QueryRowContext(ctx, `
SELECT archived_at
FROM conversations
WHERE id = ?
`, conversationID).Scan(&archivedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("%w: %s", ErrConversationNotFound, conversationID)
	}
	if err != nil {
		return err
	}
	if archivedAt.Valid {
		return stateConflict("conversation", conversationID, "archived conversations do not accept inputs")
	}
	return nil
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
	if reply.Input.ReplyToInputID != nil {
		return stateConflict("conversation input reply", *input.ReplyToInputID, "reply target is itself a clarification reply")
	}
	if reply.Status != ConversationInputStatusAwaitingClarification {
		return stateConflict("conversation input reply", *input.ReplyToInputID, "reply target is not awaiting clarification")
	}
	var existingReplyID string
	err = tx.QueryRowContext(ctx, `
SELECT id
FROM conversation_inputs
WHERE conversation_id = ? AND reply_to_input_id = ?
LIMIT 1
`, input.ConversationID, *input.ReplyToInputID).Scan(&existingReplyID)
	if err == nil {
		return stateConflict("conversation input reply", *input.ReplyToInputID, "clarification already has a reply")
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("inspect conversation input clarification reply: %w", err)
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
	record, found, err := readConversationInputRecord(ctx, query, inputID, dbPath)
	return record.Accepted, found, err
}

type conversationInputRecord struct {
	Accepted          AcceptedConversationInput
	RoutingAttempt    int
	RoutingStartedAt  *string
	Failure           *Failure
	InvocationAttempt *InvocationAttempt
}

func readConversationInputRecord(
	ctx context.Context,
	query conversationInputQuery,
	inputID string,
	dbPath string,
) (conversationInputRecord, bool, error) {
	var record conversationInputRecord
	var sourcePaneID sql.NullString
	var replyToInputID sql.NullString
	var routingStartedAt sql.NullString
	var failureJSON sql.NullString
	err := query.QueryRowContext(ctx, `
SELECT sequence, id, conversation_id, source_pane_id, reply_to_input_id,
       input_text, input_modality, status, routing_attempt,
       routing_started_at, failure_json, submitted_at, accepted_at
FROM conversation_inputs
WHERE id = ?
`, inputID).Scan(
		&record.Accepted.Sequence,
		&record.Accepted.Input.ID,
		&record.Accepted.Input.ConversationID,
		&sourcePaneID,
		&replyToInputID,
		&record.Accepted.Input.Text,
		&record.Accepted.Input.Modality,
		&record.Accepted.Status,
		&record.RoutingAttempt,
		&routingStartedAt,
		&failureJSON,
		&record.Accepted.Input.SubmittedAt,
		&record.Accepted.AcceptedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return conversationInputRecord{}, false, nil
	}
	if err != nil {
		return conversationInputRecord{}, false, fmt.Errorf("read conversation input %s: %w", inputID, err)
	}
	record.Accepted.Input.SourcePaneID = optionalScannedString(sourcePaneID)
	record.Accepted.Input.ReplyToInputID = optionalScannedString(replyToInputID)
	record.RoutingStartedAt = optionalScannedString(routingStartedAt)
	if failureJSON.Valid {
		failure, attempt, err := decodeConversationInputFailure(failureJSON.String)
		if err != nil {
			return conversationInputRecord{}, false, &CorruptStateError{
				Path: dbPath,
				Err:  fmt.Errorf("decode conversation input %s failure: %w", inputID, err),
			}
		}
		record.Failure = &failure
		record.InvocationAttempt = attempt
	}
	if err := validateConversationInputRecord(record); err != nil {
		return conversationInputRecord{}, false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode conversation input %s: %w", inputID, err),
		}
	}
	return record, true, nil
}

type storedConversationInputFailure struct {
	Code                string             `json:"code"`
	Message             string             `json:"message"`
	Retryable           bool               `json:"retryable"`
	DiagnosticReference string             `json:"diagnosticReference"`
	InvocationAttempt   *InvocationAttempt `json:"invocationAttempt"`
}

func encodeConversationInputFailure(failure Failure, attempt *InvocationAttempt) (string, error) {
	payload, err := json.Marshal(storedConversationInputFailure{
		Code:                failure.Code,
		Message:             failure.Message,
		Retryable:           failure.Retryable,
		DiagnosticReference: failure.DiagnosticReference,
		InvocationAttempt:   attempt,
	})
	if err != nil {
		return "", err
	}
	return string(payload), nil
}

func decodeConversationInputFailure(encoded string) (Failure, *InvocationAttempt, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(encoded), &fields); err != nil {
		return Failure{}, nil, err
	}
	if fields == nil {
		return Failure{}, nil, errors.New("conversation input failure must be an object")
	}
	for _, field := range []string{"code", "message", "retryable", "diagnosticReference", "invocationAttempt"} {
		value, found := fields[field]
		if !found {
			return Failure{}, nil, fmt.Errorf("conversation input failure is missing field %s", field)
		}
		if field != "invocationAttempt" && bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return Failure{}, nil, fmt.Errorf("conversation input failure field %s must not be null", field)
		}
	}
	var stored storedConversationInputFailure
	if err := jsonio.DecodeSingle(strings.NewReader(encoded), &stored); err != nil {
		return Failure{}, nil, err
	}
	failure := Failure{
		Code:                stored.Code,
		Message:             stored.Message,
		Retryable:           stored.Retryable,
		DiagnosticReference: stored.DiagnosticReference,
	}
	return failure, stored.InvocationAttempt, nil
}

func validateConversationInputRecord(record conversationInputRecord) error {
	return record.state().Validate()
}

func (record conversationInputRecord) state() ConversationInputState {
	return ConversationInputState{
		Sequence:          record.Accepted.Sequence,
		Input:             cloneConversationInput(record.Accepted.Input),
		Status:            record.Accepted.Status,
		AcceptedAt:        record.Accepted.AcceptedAt,
		RoutingAttempt:    record.RoutingAttempt,
		RoutingStartedAt:  cloneStringPointer(record.RoutingStartedAt),
		Failure:           cloneFailurePointer(record.Failure),
		InvocationAttempt: cloneInvocationAttemptPointer(record.InvocationAttempt),
	}
}

func cloneInvocationAttemptPointer(attempt *InvocationAttempt) *InvocationAttempt {
	if attempt == nil {
		return nil
	}
	cloned := cloneInvocationAttempt(*attempt)
	return &cloned
}

func cloneFailurePointer(failure *Failure) *Failure {
	if failure == nil {
		return nil
	}
	cloned := *failure
	return &cloned
}
