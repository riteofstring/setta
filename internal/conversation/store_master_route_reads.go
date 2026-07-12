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
)
`, master.InputRoutingStatusAccepted).Scan(&value); err != nil {
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

// WaitForMasterInputRoutingState blocks on the committed-event wake boundary
// until routing produces a durable decision or failure. Capturing the wake
// channel before each read prevents a lost notification without polling.
func (store *Store) WaitForMasterInputRoutingState(
	ctx context.Context,
	inputID string,
) (master.InputRoutingState, error) {
	if store == nil {
		return master.InputRoutingState{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return master.InputRoutingState{}, errors.New("master input routing wait context is required")
	}
	for {
		wake := store.committedEventWakeChannel()
		state, err := store.ReadMasterInputRoutingState(ctx, inputID)
		if err != nil {
			return master.InputRoutingState{}, err
		}
		switch state.Status {
		case master.InputRoutingStatusDecided, master.InputRoutingStatusFailed:
			return state, nil
		case master.InputRoutingStatusAccepted, master.InputRoutingStatusRouting:
		default:
			return master.InputRoutingState{}, &CorruptStateError{
				Path: store.dbPath,
				Err:  fmt.Errorf("master input %s has unsupported routing status %q", inputID, state.Status),
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
	if err := reader.Commit(); err != nil {
		return master.InputRoutingState{}, err
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
		failure, err := readMasterInputRoutingFailure(ctx, reader, inputID, dbPath)
		if err != nil {
			return err
		}
		state.Failure = &failure
	}
	return nil
}

func readMasterInputRoutingFailure(
	ctx context.Context,
	reader masterInputQuery,
	inputID string,
	dbPath string,
) (master.RouteFailure, error) {
	var encoded string
	if err := reader.QueryRowContext(ctx, `
SELECT routing_failure_json
FROM master_inputs
WHERE id = ?
`, inputID).Scan(&encoded); err != nil {
		return master.RouteFailure{}, err
	}
	var failure master.RouteFailure
	if err := jsonio.DecodeSingle(bytes.NewBufferString(encoded), &failure); err != nil {
		return master.RouteFailure{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode master route failure: %w", err),
		}
	}
	return failure, nil
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
