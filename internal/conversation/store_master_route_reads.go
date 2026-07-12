package conversation

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/jsonio"
	"setta/internal/master"
)

// ListMasterRouteContextConversationIDs returns the bounded app-global state
// the master needs in addition to lexical candidates: attention-requiring
// conversations followed by idle conversations that still have an open pane.
func (store *Store) ListMasterRouteContextConversationIDs(
	ctx context.Context,
	limit int,
) ([]string, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("master route context conversation context is required")
	}
	if limit < 0 || limit > master.MaxRouteConversationTargets {
		return nil, fmt.Errorf(
			"master route context conversation limit must be between 0 and %d",
			master.MaxRouteConversationTargets,
		)
	}
	if limit == 0 {
		return []string{}, nil
	}

	conversationIDs := []string{}
	err := store.read(ctx, "list master route context conversations", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
WITH contextual_conversations AS (
  SELECT
    conversation.id,
    conversation.status,
    substr(conversation.updated_at, 1, 19) || '.' ||
      substr(
        CASE
          WHEN instr(conversation.updated_at, '.') = 20
            THEN substr(
              conversation.updated_at,
              21,
              length(conversation.updated_at) - 21
            )
          ELSE ''
        END || '000000000',
        1,
        9
      ) AS updated_sort_key
  FROM conversations AS conversation
  WHERE conversation.archived_at IS NULL
    AND (
      conversation.status <> ?
      OR EXISTS (
        SELECT 1
        FROM pane_bindings AS pane
        WHERE pane.conversation_id = conversation.id
      )
    )
)
SELECT id
FROM contextual_conversations
ORDER BY
  CASE status
    WHEN ? THEN 0
    WHEN ? THEN 1
    WHEN ? THEN 2
    ELSE 3
  END,
  updated_sort_key DESC,
  id
LIMIT ?
`,
			ConversationStatusIdle,
			ConversationStatusWaitingForApproval,
			ConversationStatusWorking,
			ConversationStatusFailed,
			limit,
		)
		if err != nil {
			return fmt.Errorf("list master route context conversations: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var conversationID string
			if err := rows.Scan(&conversationID); err != nil {
				return err
			}
			conversationIDs = append(conversationIDs, conversationID)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	if err := validateMasterRouteTargetIDs(conversationIDs); err != nil {
		return nil, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return conversationIDs, nil
}

func (store *Store) WaitForPendingMasterRouteInputs(ctx context.Context) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("master input routing wait context is required")
	}
	for {
		wake := store.committedEventWakeChannel()
		pending := false
		err := store.read(ctx, "read pending master route input", func(ctx context.Context, reader *sql.Conn) error {
			var value int
			if err := reader.QueryRowContext(ctx, `
SELECT EXISTS(
  SELECT 1
  FROM master_inputs
  WHERE routing_status = ?

  UNION ALL

  SELECT 1
  FROM master_route_decisions AS decision
  WHERE NOT EXISTS (
    SELECT 1
    FROM master_route_command_completions AS completion
    WHERE completion.decision_id = decision.id
  )
    AND (
      json_extract(decision.resulting_command_json, '$.kind') <> ?
      OR EXISTS (
        SELECT 1
        FROM master_presentation_resolutions AS resolution
        WHERE resolution.decision_id = decision.id
      )
    )
)
`, master.InputRoutingStatusAccepted, master.RouteDecisionKindCreateSideConversation).Scan(&value); err != nil {
				return err
			}
			pending = value == 1
			return nil
		})
		if err != nil || pending {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-store.closing:
			return ErrStoreClosed
		case <-wake:
		}
	}
}

func (store *Store) ReadMasterInputRoutingState(
	ctx context.Context,
	inputID string,
) (master.InputRoutingState, error) {
	if err := validateMasterInputRoutingStateRequest(store, ctx, inputID); err != nil {
		return master.InputRoutingState{}, err
	}
	var state master.InputRoutingState
	err := store.read(ctx, "read master input routing state", func(ctx context.Context, connection *sql.Conn) error {
		var readErr error
		state, readErr = readMasterInputRoutingStateSnapshot(ctx, connection, inputID, store.dbPath)
		return readErr
	})
	if err != nil {
		return master.InputRoutingState{}, err
	}
	return master.CloneInputRoutingState(state), nil
}

// WaitForMasterInputRoutingState blocks on committed-store notifications until
// the requested input reaches a terminal routing decision, cancellation, or failure. Capturing
// the wake channel before each read prevents lost notifications without
// polling.
func (store *Store) WaitForMasterInputRoutingState(
	ctx context.Context,
	inputID string,
) (master.InputRoutingState, error) {
	if err := validateMasterInputRoutingStateRequest(store, ctx, inputID); err != nil {
		return master.InputRoutingState{}, err
	}
	for {
		wake := store.committedEventWakeChannel()
		state, err := store.ReadMasterInputRoutingState(ctx, inputID)
		if err != nil {
			return master.InputRoutingState{}, err
		}
		switch state.Status {
		case master.InputRoutingStatusDecided,
			master.InputRoutingStatusCancelled,
			master.InputRoutingStatusFailed:
			return state, nil
		case master.InputRoutingStatusAccepted, master.InputRoutingStatusRouting:
		default:
			return master.InputRoutingState{}, &CorruptStateError{
				Path: store.dbPath,
				Err:  fmt.Errorf("unsupported master input routing status %q", state.Status),
			}
		}
		select {
		case <-ctx.Done():
			return master.InputRoutingState{}, ctx.Err()
		case <-store.closing:
			return master.InputRoutingState{}, ErrStoreClosed
		case <-wake:
		}
	}
}

func (store *Store) ReadActiveMasterShellInteraction(
	ctx context.Context,
) (master.ActiveShellInteraction, error) {
	if store == nil {
		return master.ActiveShellInteraction{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return master.ActiveShellInteraction{}, errors.New("active master shell interaction context is required")
	}
	var interaction master.ActiveShellInteraction
	err := store.read(ctx, "read active master shell interaction", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		interaction, err = readActiveMasterShellInteractionTransaction(ctx, reader, store.dbPath)
		if err != nil {
			return err
		}
		return reader.Commit()
	})
	if err != nil {
		return master.ActiveShellInteraction{}, err
	}
	return master.CloneActiveShellInteraction(interaction), nil
}

func readActiveMasterShellInteractionTransaction(
	ctx context.Context,
	reader *sql.Tx,
	dbPath string,
) (master.ActiveShellInteraction, error) {
	inputID, found, err := readLatestMasterShellInputID(ctx, reader)
	if err != nil || !found {
		return master.ActiveShellInteraction{}, err
	}
	state, err := readMasterInputRoutingStateTransaction(ctx, reader, inputID, dbPath)
	if err != nil {
		return master.ActiveShellInteraction{}, err
	}
	projected, err := master.ProjectShellInteractionState(state)
	if err != nil {
		return master.ActiveShellInteraction{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("project active master shell interaction: %w", err),
		}
	}
	restore, err := masterShellInteractionIsRestorable(ctx, reader, dbPath, state, projected)
	if err != nil {
		return master.ActiveShellInteraction{}, err
	}
	interaction := master.ActiveShellInteraction{}
	if restore {
		interaction.State = &projected
	}
	if err := interaction.Validate(); err != nil {
		return master.ActiveShellInteraction{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("validate active master shell interaction: %w", err),
		}
	}
	return interaction, nil
}

func readLatestMasterShellInputID(ctx context.Context, reader *sql.Tx) (string, bool, error) {
	var inputID string
	err := reader.QueryRowContext(ctx, `
SELECT id
FROM master_inputs
WHERE input_source = ?
ORDER BY sequence DESC
LIMIT 1
`, master.MasterInputSourceShell).Scan(&inputID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return inputID, err == nil, err
}

func masterShellInteractionIsRestorable(
	ctx context.Context,
	reader *sql.Tx,
	dbPath string,
	state master.InputRoutingState,
	projected master.ShellInteractionState,
) (bool, error) {
	if !master.IsRestorableShellInteractionState(projected) {
		return false, nil
	}
	if !masterShellInteractionRequiresResolution(projected) {
		return true, nil
	}
	_, resolved, err := readMasterPresentationResolution(
		ctx,
		reader,
		dbPath,
		state.Decision.ID,
		state.Input.Input.ID,
	)
	return !resolved, err
}

func masterShellInteractionRequiresResolution(state master.ShellInteractionState) bool {
	return state.Status == master.InputRoutingStatusDecided &&
		state.Decision != nil &&
		master.RouteDecisionRequiresNavigation(*state.Decision)
}

func validateMasterInputRoutingStateRequest(store *Store, ctx context.Context, inputID string) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("master input routing state context is required")
	}
	return master.ValidateInputID(inputID)
}

func readMasterInputRoutingStateSnapshot(
	ctx context.Context,
	connection *sql.Conn,
	inputID string,
	dbPath string,
) (master.InputRoutingState, error) {
	reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return master.InputRoutingState{}, err
	}
	defer func() { _ = reader.Rollback() }()
	state, err := readMasterInputRoutingStateTransaction(ctx, reader, inputID, dbPath)
	if err != nil {
		return master.InputRoutingState{}, err
	}
	if err := reader.Commit(); err != nil {
		return master.InputRoutingState{}, err
	}
	return state, nil
}

func readMasterInputRoutingStateTransaction(
	ctx context.Context,
	reader *sql.Tx,
	inputID string,
	dbPath string,
) (master.InputRoutingState, error) {
	accepted, status, attempt, startedAt, err := readMasterRouteCommitInput(ctx, reader, inputID, dbPath)
	if err != nil {
		return master.InputRoutingState{}, err
	}
	state := master.InputRoutingState{
		Input:            accepted,
		Status:           status,
		RoutingAttempt:   attempt,
		RoutingStartedAt: startedAt,
	}
	if err := populateMasterInputRoutingTerminalState(ctx, reader, inputID, dbPath, &state); err != nil {
		return master.InputRoutingState{}, err
	}
	if err := state.Validate(); err != nil {
		return master.InputRoutingState{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("validate master input routing state %s: %w", inputID, err),
		}
	}
	return state, nil
}

func populateMasterInputRoutingTerminalState(
	ctx context.Context,
	reader *sql.Tx,
	inputID string,
	dbPath string,
	state *master.InputRoutingState,
) error {
	if state.Status == master.InputRoutingStatusDecided {
		decision, found, err := readMasterRouteDecisionByInput(ctx, reader, inputID, dbPath)
		if err != nil {
			return err
		}
		if found {
			state.Decision = &decision
		}
	}
	if state.Status == master.InputRoutingStatusFailed {
		failure, attempt, err := readMasterInputRoutingFailure(ctx, reader, inputID, dbPath)
		if err != nil {
			return err
		}
		state.Failure = &failure
		state.InvocationAttempt = &attempt
	}
	if state.Status == master.InputRoutingStatusCancelled {
		cancellation, err := readMasterInputRoutingCancellation(ctx, reader, inputID, dbPath)
		if err != nil {
			return err
		}
		state.Cancellation = &cancellation
	}
	return nil
}

func readMasterInputRoutingCancellation(
	ctx context.Context,
	reader masterInputQuery,
	inputID string,
	dbPath string,
) (master.InputRoutingCancellation, error) {
	var cancellation master.InputRoutingCancellation
	var invocationAttemptJSON sql.NullString
	if err := reader.QueryRowContext(ctx, `
SELECT input_id, routing_attempt, invocation_attempt_json, cancelled_at
FROM master_input_cancellations
WHERE input_id = ?
`, inputID).Scan(
		&cancellation.InputID,
		&cancellation.RoutingAttempt,
		&invocationAttemptJSON,
		&cancellation.CancelledAt,
	); err != nil {
		return master.InputRoutingCancellation{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("read master input routing cancellation %s: %w", inputID, err),
		}
	}
	if invocationAttemptJSON.Valid {
		var attempt master.RouteInvocationAttempt
		if err := jsonio.DecodeSingle(bytes.NewBufferString(invocationAttemptJSON.String), &attempt); err != nil {
			return master.InputRoutingCancellation{}, &CorruptStateError{
				Path: dbPath,
				Err:  fmt.Errorf("decode master input routing cancellation invocation attempt %s: %w", inputID, err),
			}
		}
		cancellation.InvocationAttempt = &attempt
	}
	if err := cancellation.Validate(); err != nil {
		return master.InputRoutingCancellation{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("validate master input routing cancellation %s: %w", inputID, err),
		}
	}
	return cancellation, nil
}

func readMasterInputRoutingFailure(
	ctx context.Context,
	reader masterInputQuery,
	inputID string,
	dbPath string,
) (master.RouteFailure, master.RouteInvocationAttempt, error) {
	var encoded string
	if err := reader.QueryRowContext(ctx, `
SELECT routing_failure_json
FROM master_inputs
WHERE id = ?
	`, inputID).Scan(&encoded); err != nil {
		return master.RouteFailure{}, master.RouteInvocationAttempt{}, err
	}
	var stored storedMasterInputRoutingFailure
	if err := jsonio.DecodeSingle(bytes.NewBufferString(encoded), &stored); err != nil {
		return master.RouteFailure{}, master.RouteInvocationAttempt{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode master route failure: %w", err),
		}
	}
	failure := master.RouteFailure{
		Code:                stored.Code,
		Message:             stored.Message,
		Retryable:           stored.Retryable,
		DiagnosticReference: stored.DiagnosticReference,
	}
	return failure, stored.InvocationAttempt, nil
}

func equalOptionalStrings(left *string, right *string) bool {
	return (left == nil && right == nil) || (left != nil && right != nil && *left == *right)
}

func cloneMasterInputRoutingWork(work master.InputRoutingWork) master.InputRoutingWork {
	work.Input = master.CloneAcceptedInput(work.Input)
	return work
}

func cloneMasterRouteTargets(targets []master.RouteConversationTarget) []master.RouteConversationTarget {
	cloned := append([]master.RouteConversationTarget{}, targets...)
	for index := range cloned {
		cloned[index].OpenPaneIDs = append([]string{}, cloned[index].OpenPaneIDs...)
		cloned[index].ActiveTurnID = cloneStringPointer(cloned[index].ActiveTurnID)
		cloned[index].CompletedForkPoints = append([]master.RouteForkPoint{}, cloned[index].CompletedForkPoints...)
		cloned[index].AllowedDecisionKinds = append(
			[]master.RouteDecisionKind{},
			cloned[index].AllowedDecisionKinds...,
		)
	}
	return cloned
}

func cloneMasterRouteDecisionRecords(records []master.RouteDecisionRecord) []master.RouteDecisionRecord {
	cloned := make([]master.RouteDecisionRecord, len(records))
	for index, record := range records {
		cloned[index] = master.CloneRouteDecisionRecord(record)
	}
	return cloned
}
