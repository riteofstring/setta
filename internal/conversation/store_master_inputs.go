package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/master"
)

func (store *Store) AcceptMasterInput(
	ctx context.Context,
	input master.MasterInput,
	acceptedAt string,
) (master.AcceptedMasterInput, error) {
	if err := validateAcceptedMasterInputRequest(store, input, acceptedAt); err != nil {
		return master.AcceptedMasterInput{}, err
	}

	var accepted master.AcceptedMasterInput
	appendedEvent := false
	err := store.write(ctx, "accept master input", func(ctx context.Context, tx *sql.Tx) error {
		var err error
		accepted, appendedEvent, err = acceptMasterInputTransaction(
			ctx,
			tx,
			store.dbPath,
			input,
			acceptedAt,
		)
		return err
	})
	if err != nil {
		return master.AcceptedMasterInput{}, err
	}
	if appendedEvent {
		store.notifyCommittedEvents()
	}
	return master.CloneAcceptedInput(accepted), nil
}

func validateAcceptedMasterInputRequest(
	store *Store,
	input master.MasterInput,
	acceptedAt string,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	normalized, err := master.NormalizeInput(input)
	if err != nil {
		return err
	}
	if !master.EqualInputs(normalized, input) {
		return errors.New("master input must be normalized before persistence")
	}
	return (master.AcceptedMasterInput{
		Sequence:   1,
		Input:      input,
		AcceptedAt: acceptedAt,
	}).Validate()
}

func acceptMasterInputTransaction(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	input master.MasterInput,
	acceptedAt string,
) (master.AcceptedMasterInput, bool, error) {
	existing, found, err := readMasterInputRow(ctx, tx, input.ID, dbPath)
	if err != nil {
		return master.AcceptedMasterInput{}, false, err
	}
	if found {
		if !master.EqualInputs(existing.Input, input) {
			return master.AcceptedMasterInput{}, false, &master.InputConflictError{InputID: input.ID}
		}
		return existing, false, nil
	}

	accepted := master.AcceptedMasterInput{Input: input, AcceptedAt: acceptedAt}
	if err := tx.QueryRowContext(ctx, `
INSERT INTO master_inputs (
  id, input_text, input_modality, submitted_at, accepted_at,
  focused_workspace_id, focused_conversation_id, focused_pane_id
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
RETURNING sequence
`,
		input.ID,
		input.Text,
		input.Modality,
		input.SubmittedAt,
		acceptedAt,
		nullableString(input.FocusedWorkspaceID),
		nullableString(input.FocusedConversationID),
		nullableString(input.FocusedPaneID),
	).Scan(&accepted.Sequence); err != nil {
		return master.AcceptedMasterInput{}, false, fmt.Errorf("insert master input %s: %w", input.ID, err)
	}
	if err := appendMasterInputAcceptedEvent(ctx, tx, accepted); err != nil {
		return master.AcceptedMasterInput{}, false, err
	}
	return accepted, true, nil
}

func appendMasterInputAcceptedEvent(
	ctx context.Context,
	tx *sql.Tx,
	accepted master.AcceptedMasterInput,
) error {
	transaction := &WriteTransaction{ctx: ctx, tx: tx, active: true}
	defer func() {
		transaction.active = false
	}()
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          master.AcceptedInputEventID(accepted.Input.ID),
		StreamID:    master.InputStreamID,
		Kind:        master.InputAcceptedEventKind,
		Payload:     accepted,
		CommittedAt: accepted.AcceptedAt,
	}); err != nil {
		return err
	}
	return validateWriteTransactionResult(transaction)
}

func (store *Store) ReadMasterInput(
	ctx context.Context,
	inputID string,
) (master.AcceptedMasterInput, bool, error) {
	if store == nil {
		return master.AcceptedMasterInput{}, false, errors.New("conversation store is required")
	}
	if err := master.ValidateInputID(inputID); err != nil {
		return master.AcceptedMasterInput{}, false, fmt.Errorf("read master input id: %w", err)
	}
	var accepted master.AcceptedMasterInput
	var found bool
	err := store.read(ctx, "read master input", func(ctx context.Context, reader *sql.Conn) error {
		var err error
		accepted, found, err = readMasterInputRow(ctx, reader, inputID, store.dbPath)
		return err
	})
	if err != nil {
		return master.AcceptedMasterInput{}, false, err
	}
	return master.CloneAcceptedInput(accepted), found, nil
}

type masterInputQuery interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readMasterInputRow(
	ctx context.Context,
	query masterInputQuery,
	inputID string,
	dbPath string,
) (master.AcceptedMasterInput, bool, error) {
	var accepted master.AcceptedMasterInput
	var focusedWorkspaceID sql.NullString
	var focusedConversationID sql.NullString
	var focusedPaneID sql.NullString
	err := query.QueryRowContext(ctx, `
SELECT sequence, id, input_text, input_modality, submitted_at, accepted_at,
       focused_workspace_id, focused_conversation_id, focused_pane_id
FROM master_inputs
WHERE id = ?
`, inputID).Scan(
		&accepted.Sequence,
		&accepted.Input.ID,
		&accepted.Input.Text,
		&accepted.Input.Modality,
		&accepted.Input.SubmittedAt,
		&accepted.AcceptedAt,
		&focusedWorkspaceID,
		&focusedConversationID,
		&focusedPaneID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return master.AcceptedMasterInput{}, false, nil
	}
	if err != nil {
		return master.AcceptedMasterInput{}, false, fmt.Errorf("read master input %s: %w", inputID, err)
	}
	accepted.Input.FocusedWorkspaceID = optionalMasterInputString(focusedWorkspaceID)
	accepted.Input.FocusedConversationID = optionalMasterInputString(focusedConversationID)
	accepted.Input.FocusedPaneID = optionalMasterInputString(focusedPaneID)
	if err := accepted.Validate(); err != nil {
		return master.AcceptedMasterInput{}, false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode master input %s: %w", inputID, err),
		}
	}
	return accepted, true, nil
}

func optionalMasterInputString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}
