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
