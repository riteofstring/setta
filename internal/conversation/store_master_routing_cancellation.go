package conversation

import (
	"context"
	"errors"
	"fmt"
	"time"

	"setta/internal/master"
)

var errMasterInputAlreadyCancelled = errors.New("master input routing is already cancelled")

func (store *Store) CancelMasterInputRouting(
	ctx context.Context,
	inputID string,
	cancelledAt string,
) (master.InputRoutingState, error) {
	if err := validateMasterInputRoutingCancellationRequest(store, ctx, inputID, cancelledAt); err != nil {
		return master.InputRoutingState{}, err
	}
	var state master.InputRoutingState
	_, err := store.Transact(ctx, "cancel master input routing", func(transaction *WriteTransaction) error {
		var cancelErr error
		state, cancelErr = cancelMasterInputRoutingTransaction(
			transaction,
			store.dbPath,
			inputID,
			cancelledAt,
		)
		return cancelErr
	})
	if errors.Is(err, errMasterInputAlreadyCancelled) {
		return store.ReadMasterInputRoutingState(ctx, inputID)
	}
	if err != nil {
		return master.InputRoutingState{}, err
	}
	return master.CloneInputRoutingState(state), nil
}

func validateMasterInputRoutingCancellationRequest(
	store *Store,
	ctx context.Context,
	inputID string,
	cancelledAt string,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("master input routing cancellation context is required")
	}
	if err := master.ValidateInputID(inputID); err != nil {
		return err
	}
	_, err := validateTimestamp("master input routing cancelledAt", cancelledAt)
	return err
}

func cancelMasterInputRoutingTransaction(
	transaction *WriteTransaction,
	dbPath string,
	inputID string,
	cancelledAt string,
) (master.InputRoutingState, error) {
	accepted, status, attempt, err := readCancellableMasterInput(
		transaction, dbPath, inputID, cancelledAt,
	)
	if err != nil {
		return master.InputRoutingState{}, err
	}
	cancellation := master.InputRoutingCancellation{
		InputID:        inputID,
		RoutingAttempt: attempt,
		CancelledAt:    cancelledAt,
	}
	if err := cancellation.Validate(); err != nil {
		return master.InputRoutingState{}, err
	}
	if err := persistMasterInputRoutingCancellation(
		transaction, inputID, status, attempt, cancellation,
	); err != nil {
		return master.InputRoutingState{}, err
	}
	state := master.InputRoutingState{
		Input:          accepted,
		Status:         master.InputRoutingStatusCancelled,
		RoutingAttempt: attempt,
		Cancellation:   &cancellation,
	}
	if err := state.Validate(); err != nil {
		return master.InputRoutingState{}, fmt.Errorf("validate cancelled master input routing state: %w", err)
	}
	return state, nil
}

func readCancellableMasterInput(
	transaction *WriteTransaction,
	dbPath string,
	inputID string,
	cancelledAt string,
) (master.AcceptedMasterInput, master.InputRoutingStatus, int, error) {
	accepted, status, attempt, startedAt, err := readMasterRouteCommitInput(
		transaction.ctx,
		transaction.tx,
		inputID,
		dbPath,
	)
	if err != nil {
		return master.AcceptedMasterInput{}, "", 0, err
	}
	if status == master.InputRoutingStatusCancelled {
		return master.AcceptedMasterInput{}, "", 0, errMasterInputAlreadyCancelled
	}
	if err := validateCancellableMasterInputStatus(inputID, status); err != nil {
		return master.AcceptedMasterInput{}, "", 0, err
	}
	if err := validateMasterInputCancellationTiming(accepted, startedAt, cancelledAt); err != nil {
		return master.AcceptedMasterInput{}, "", 0, err
	}
	return accepted, status, attempt, nil
}

func validateCancellableMasterInputStatus(inputID string, status master.InputRoutingStatus) error {
	if status == master.InputRoutingStatusAccepted || status == master.InputRoutingStatusRouting {
		return nil
	}
	return stateConflict(
		"master input",
		inputID,
		fmt.Sprintf("routing status %s cannot be cancelled", status),
	)
}

func persistMasterInputRoutingCancellation(
	transaction *WriteTransaction,
	inputID string,
	status master.InputRoutingStatus,
	attempt int,
	cancellation master.InputRoutingCancellation,
) error {
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE master_inputs
SET routing_status = ?, routing_started_at = NULL, routing_failure_json = NULL
WHERE id = ? AND routing_status = ? AND routing_attempt = ?
`, master.InputRoutingStatusCancelled, inputID, status, attempt)
	if err != nil {
		return fmt.Errorf("cancel master input routing %s: %w", inputID, err)
	}
	if err := requireOneRow(result, "master input", inputID, "routing state changed before cancellation"); err != nil {
		return err
	}
	if _, err := transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO master_input_cancellations(input_id, routing_attempt, cancelled_at)
VALUES (?, ?, ?)
`, inputID, attempt, cancellation.CancelledAt); err != nil {
		return fmt.Errorf("record master input routing cancellation %s: %w", inputID, err)
	}
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          master.RouteRoutingEventID("cancelled", inputID, attempt),
		StreamID:    master.RouteDecisionCommittedStream,
		Kind:        master.RouteInputRoutingCancelledKind,
		Payload:     cancellation,
		CommittedAt: cancellation.CancelledAt,
	}); err != nil {
		return err
	}
	return nil
}

func validateMasterInputCancellationTiming(
	accepted master.AcceptedMasterInput,
	startedAt *string,
	cancelledAt string,
) error {
	cancelled, _ := validateTimestamp("master input routing cancelledAt", cancelledAt)
	acceptedTime, _ := validateTimestamp("master input acceptedAt", accepted.AcceptedAt)
	if cancelled.Before(acceptedTime) {
		return errors.New("master input routing cancellation cannot precede input acceptance")
	}
	if startedAt == nil {
		return nil
	}
	started, err := time.Parse(time.RFC3339Nano, *startedAt)
	if err != nil {
		return err
	}
	if cancelled.Before(started) {
		return errors.New("master input routing cancellation cannot precede its active attempt")
	}
	return nil
}
