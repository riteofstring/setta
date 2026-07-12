package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

const maxConversationInputRoutingRecoveryBatch = 128

func (store *Store) FailConversationInputRouting(
	ctx context.Context,
	failure ConversationInputRoutingFailure,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("conversation input routing failure context is required")
	}
	if err := failure.Validate(); err != nil {
		return err
	}
	if !failure.Failure.Retryable {
		return errors.New("conversation input router failures must remain retryable; discard the input explicitly")
	}
	_, err := store.Transact(ctx, "fail conversation input routing", func(transaction *WriteTransaction) error {
		return failConversationInputRoutingTransaction(transaction, store.dbPath, failure)
	})
	return err
}

func failConversationInputRoutingTransaction(
	transaction *WriteTransaction,
	dbPath string,
	failure ConversationInputRoutingFailure,
) error {
	activeID := failure.InputID
	if failure.ClarificationInputID != nil {
		activeID = *failure.ClarificationInputID
	}
	active, err := requireConversationInputRoutingFailureState(transaction, dbPath, activeID, failure)
	if err != nil {
		return err
	}
	if err := validateConversationInputRoutingFailureTime(active, failure); err != nil {
		return err
	}
	failureJSON, err := json.Marshal(failure.Failure)
	if err != nil {
		return fmt.Errorf("encode conversation input routing failure: %w", err)
	}
	if err := applyConversationInputRoutingFailure(transaction, activeID, failure, string(failureJSON)); err != nil {
		return err
	}
	return appendConversationInputRoutingEvent(
		transaction,
		failure.ConversationID,
		conversationInputRoutingEventID("failed", activeID, failure.RoutingAttempt),
		ConversationInputRoutingFailedEventKind,
		failure,
		failure.FailedAt,
	)
}

func requireConversationInputRoutingFailureState(
	transaction *WriteTransaction,
	dbPath string,
	activeID string,
	failure ConversationInputRoutingFailure,
) (conversationInputRecord, error) {
	active, found, err := readConversationInputRecord(transaction.ctx, transaction.tx, activeID, dbPath)
	if err != nil {
		return conversationInputRecord{}, err
	}
	if !found || active.Accepted.Input.ConversationID != failure.ConversationID {
		return conversationInputRecord{}, stateConflict("conversation input", activeID, "routing attempt was not found")
	}
	if active.Accepted.Status != ConversationInputStatusRouting || active.RoutingAttempt != failure.RoutingAttempt {
		return conversationInputRecord{}, stateConflict("conversation input", activeID, "routing attempt is no longer active")
	}
	if failure.ClarificationInputID == nil && active.Accepted.Input.ReplyToInputID != nil {
		return conversationInputRecord{}, stateConflict("conversation input", activeID, "routing root changed")
	}
	if failure.ClarificationInputID != nil &&
		(active.Accepted.Input.ReplyToInputID == nil || *active.Accepted.Input.ReplyToInputID != failure.InputID) {
		return conversationInputRecord{}, stateConflict("conversation input", activeID, "clarification reply changed")
	}
	return active, nil
}

func validateConversationInputRoutingFailureTime(
	active conversationInputRecord,
	failure ConversationInputRoutingFailure,
) error {
	failedAt, err := validateTimestamp("conversation input routing failedAt", failure.FailedAt)
	if err != nil {
		return err
	}
	startedAt, err := validateTimestamp("conversation input routing startedAt", *active.RoutingStartedAt)
	if err != nil {
		return err
	}
	if failedAt.Before(startedAt) {
		return errors.New("conversation input routing failure cannot precede its attempt")
	}
	return nil
}

func applyConversationInputRoutingFailure(
	transaction *WriteTransaction,
	activeID string,
	failure ConversationInputRoutingFailure,
	failureJSON string,
) error {
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_inputs
SET status = ?, routing_started_at = NULL, failure_json = ?
WHERE id = ? AND conversation_id = ? AND status = ? AND routing_attempt = ?
`,
		ConversationInputStatusFailed,
		failureJSON,
		activeID,
		failure.ConversationID,
		ConversationInputStatusRouting,
		failure.RoutingAttempt,
	)
	if err != nil {
		return fmt.Errorf("fail conversation input routing %s: %w", activeID, err)
	}
	if err := requireOneRow(result, "conversation input", activeID, "routing attempt changed before failure"); err != nil {
		return err
	}
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	return nil
}

func (store *Store) RetryConversationInputRouting(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	inputID string,
	retriedAt string,
) (AcceptedConversationInput, error) {
	if store == nil {
		return AcceptedConversationInput{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return AcceptedConversationInput{}, errors.New("conversation input routing retry context is required")
	}
	if err := validateConversationInputReference("conversation input retry workspace id", workspaceID); err != nil {
		return AcceptedConversationInput{}, err
	}
	if err := validateConversationInputReference("conversation input retry conversation id", conversationID); err != nil {
		return AcceptedConversationInput{}, err
	}
	if err := ValidateConversationInputID(inputID); err != nil {
		return AcceptedConversationInput{}, err
	}
	if _, err := validateTimestamp("conversation input routing retriedAt", retriedAt); err != nil {
		return AcceptedConversationInput{}, err
	}
	var accepted AcceptedConversationInput
	_, err := store.Transact(ctx, "retry conversation input routing", func(transaction *WriteTransaction) error {
		var retryErr error
		accepted, retryErr = retryConversationInputRoutingTransaction(
			transaction,
			store.dbPath,
			workspaceID,
			conversationID,
			inputID,
			retriedAt,
		)
		return retryErr
	})
	if err != nil {
		return AcceptedConversationInput{}, err
	}
	return CloneAcceptedConversationInput(accepted), nil
}

func retryConversationInputRoutingTransaction(
	transaction *WriteTransaction,
	dbPath string,
	workspaceID string,
	conversationID string,
	inputID string,
	retriedAt string,
) (AcceptedConversationInput, error) {
	if err := requireConversationInputRoutingOwner(
		transaction.ctx,
		transaction.tx,
		workspaceID,
		conversationID,
	); err != nil {
		return AcceptedConversationInput{}, err
	}
	if err := requireConversationInputTarget(
		transaction.ctx,
		transaction.tx,
		conversationID,
	); err != nil {
		return AcceptedConversationInput{}, err
	}
	record, err := readRetryableConversationInput(
		transaction,
		dbPath,
		conversationID,
		inputID,
	)
	if err != nil {
		return AcceptedConversationInput{}, err
	}
	if err := validateConversationInputRoutingRetryTime(transaction, dbPath, record, retriedAt); err != nil {
		return AcceptedConversationInput{}, err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_inputs
SET status = ?, routing_started_at = NULL, failure_json = NULL
WHERE id = ? AND conversation_id = ? AND status = ? AND routing_attempt = ?
`,
		ConversationInputStatusAccepted,
		inputID,
		conversationID,
		ConversationInputStatusFailed,
		record.RoutingAttempt,
	)
	if err != nil {
		return AcceptedConversationInput{}, fmt.Errorf("retry conversation input routing %s: %w", inputID, err)
	}
	if err := requireOneRow(result, "conversation input", inputID, "failure changed before retry"); err != nil {
		return AcceptedConversationInput{}, err
	}
	if err := transaction.recordStateMutation(); err != nil {
		return AcceptedConversationInput{}, err
	}
	retried := record.Accepted
	retried.Status = ConversationInputStatusAccepted
	event := ConversationInputRoutingRetry{
		ConversationID: retried.Input.ConversationID,
		InputID:        inputID,
		RoutingAttempt: record.RoutingAttempt,
		RetriedAt:      retriedAt,
	}
	if err := appendConversationInputRoutingEvent(
		transaction,
		retried.Input.ConversationID,
		conversationInputRoutingEventID("retried", inputID, record.RoutingAttempt),
		ConversationInputRoutingRetriedEventKind,
		event,
		retriedAt,
	); err != nil {
		return AcceptedConversationInput{}, err
	}
	return retried, nil
}

func readRetryableConversationInput(
	transaction *WriteTransaction,
	dbPath string,
	conversationID string,
	inputID string,
) (conversationInputRecord, error) {
	record, found, err := readConversationInputRecord(transaction.ctx, transaction.tx, inputID, dbPath)
	if err != nil {
		return conversationInputRecord{}, err
	}
	if !found || record.Accepted.Input.ConversationID != conversationID {
		return conversationInputRecord{}, stateConflict("conversation input", inputID, "failed input was not found in the requested conversation")
	}
	if record.Accepted.Status != ConversationInputStatusFailed || record.Failure == nil {
		return conversationInputRecord{}, stateConflict("conversation input", inputID, "input is not failed")
	}
	if !record.Failure.Retryable {
		return conversationInputRecord{}, stateConflict("conversation input", inputID, "failure is not retryable")
	}
	return record, nil
}

func validateConversationInputRoutingRetryTime(
	transaction *WriteTransaction,
	dbPath string,
	record conversationInputRecord,
	retriedAt string,
) error {
	var failedAt string
	eventID := conversationInputRoutingEventID(
		"failed",
		record.Accepted.Input.ID,
		record.RoutingAttempt,
	)
	err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT committed_at
FROM committed_events
WHERE id = ?
`, eventID).Scan(&failedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("conversation input %s failure event is missing", record.Accepted.Input.ID),
		}
	}
	if err != nil {
		return fmt.Errorf("read conversation input routing failure time: %w", err)
	}
	retried, err := validateTimestamp("conversation input routing retriedAt", retriedAt)
	if err != nil {
		return err
	}
	failed, err := validateTimestamp("conversation input routing failedAt", failedAt)
	if err != nil {
		return &CorruptStateError{Path: dbPath, Err: err}
	}
	if retried.Before(failed) {
		return errors.New("conversation input routing retry cannot precede its failure")
	}
	return nil
}

func (store *Store) DiscardConversationInputRouting(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	inputID string,
	discardedAt string,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("conversation input discard context is required")
	}
	if err := validateConversationInputReference("conversation input discard workspace id", workspaceID); err != nil {
		return err
	}
	if err := validateConversationInputReference("conversation input discard conversation id", conversationID); err != nil {
		return err
	}
	if err := ValidateConversationInputID(inputID); err != nil {
		return err
	}
	if _, err := validateTimestamp("conversation input discardedAt", discardedAt); err != nil {
		return err
	}
	_, err := store.Transact(ctx, "discard conversation input", func(transaction *WriteTransaction) error {
		return discardConversationInputRoutingTransaction(
			transaction,
			store.dbPath,
			workspaceID,
			conversationID,
			inputID,
			discardedAt,
		)
	})
	if errors.Is(err, errConversationInputAlreadyDiscarded) {
		return nil
	}
	return err
}

func discardConversationInputRoutingTransaction(
	transaction *WriteTransaction,
	dbPath string,
	workspaceID string,
	conversationID string,
	inputID string,
	discardedAt string,
) error {
	if err := requireConversationInputRoutingOwner(
		transaction.ctx,
		transaction.tx,
		workspaceID,
		conversationID,
	); err != nil {
		return err
	}
	root, err := resolveConversationInputDiscardRoot(transaction, dbPath, conversationID, inputID)
	if err != nil {
		return err
	}
	if conversationInputRoutingWasDiscarded(root) {
		return errConversationInputAlreadyDiscarded
	}
	if err := validateConversationInputDiscardStatus(root); err != nil {
		return err
	}
	reply, replyFound, err := readConversationInputClarificationReply(
		transaction.ctx,
		transaction.tx,
		conversationID,
		root.Accepted.Input.ID,
		dbPath,
	)
	if err != nil {
		return err
	}
	if replyFound {
		if err := validateConversationInputDiscardStatus(reply); err != nil {
			return err
		}
	}
	failureJSON, err := conversationInputDiscardFailureJSON()
	if err != nil {
		return err
	}
	if err := discardConversationInputExchange(transaction, conversationID, root, reply, replyFound, failureJSON); err != nil {
		return err
	}
	event := ConversationInputDiscard{
		ConversationID:   conversationID,
		InputID:          root.Accepted.Input.ID,
		RequestedInputID: inputID,
		DiscardedAt:      discardedAt,
	}
	return appendConversationInputRoutingEvent(
		transaction,
		conversationID,
		"conversation-input-discarded:"+root.Accepted.Input.ID,
		ConversationInputDiscardedEventKind,
		event,
		discardedAt,
	)
}

func resolveConversationInputDiscardRoot(
	transaction *WriteTransaction,
	dbPath string,
	conversationID string,
	inputID string,
) (conversationInputRecord, error) {
	requested, found, err := readConversationInputRecord(transaction.ctx, transaction.tx, inputID, dbPath)
	if err != nil {
		return conversationInputRecord{}, err
	}
	if !found || requested.Accepted.Input.ConversationID != conversationID {
		return conversationInputRecord{}, stateConflict("conversation input", inputID, "input was not found in the requested conversation")
	}
	if requested.Accepted.Input.ReplyToInputID == nil {
		return requested, nil
	}
	root, found, err := readConversationInputRecord(
		transaction.ctx,
		transaction.tx,
		*requested.Accepted.Input.ReplyToInputID,
		dbPath,
	)
	if err != nil {
		return conversationInputRecord{}, err
	}
	if !found {
		return conversationInputRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("conversation input %s discard root is missing", inputID)}
	}
	return root, nil
}

func conversationInputRoutingWasDiscarded(record conversationInputRecord) bool {
	return record.Accepted.Status == ConversationInputStatusFailed && record.Failure != nil &&
		!record.Failure.Retryable && record.Failure.Code == ConversationInputDiscardedFailureCode
}

func validateConversationInputDiscardStatus(record conversationInputRecord) error {
	switch record.Accepted.Status {
	case ConversationInputStatusRouting:
		return stateConflict("conversation input", record.Accepted.Input.ID, "active input cannot be discarded")
	case ConversationInputStatusDispatched:
		return stateConflict("conversation input", record.Accepted.Input.ID, "dispatched input cannot be discarded")
	default:
		return nil
	}
}

func conversationInputDiscardFailureJSON() (string, error) {
	payload, err := json.Marshal(Failure{
		Code:      ConversationInputDiscardedFailureCode,
		Message:   "The conversation input was discarded.",
		Retryable: false,
	})
	if err != nil {
		return "", fmt.Errorf("encode discarded conversation input failure: %w", err)
	}
	return string(payload), nil
}

func discardConversationInputExchange(
	transaction *WriteTransaction,
	conversationID string,
	root conversationInputRecord,
	reply conversationInputRecord,
	replyFound bool,
	failureJSON string,
) error {
	if err := markConversationInputDiscarded(transaction, root.Accepted.Input.ID, conversationID, failureJSON); err != nil {
		return err
	}
	if !replyFound {
		return nil
	}
	return markConversationInputDiscarded(transaction, reply.Accepted.Input.ID, conversationID, failureJSON)
}

func markConversationInputDiscarded(
	transaction *WriteTransaction,
	inputID string,
	conversationID string,
	failureJSON string,
) error {
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_inputs
SET status = ?, routing_started_at = NULL, failure_json = ?
WHERE id = ? AND conversation_id = ? AND status NOT IN (?, ?)
`,
		ConversationInputStatusFailed,
		failureJSON,
		inputID,
		conversationID,
		ConversationInputStatusRouting,
		ConversationInputStatusDispatched,
	)
	if err != nil {
		return fmt.Errorf("discard conversation input %s: %w", inputID, err)
	}
	if err := requireOneRow(result, "conversation input", inputID, "input cannot be discarded from its current state"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}

func (store *Store) RecoverConversationInputRouting(
	ctx context.Context,
	recoveredAt string,
) (int, error) {
	if store == nil {
		return 0, errors.New("conversation store is required")
	}
	if ctx == nil {
		return 0, errors.New("conversation input routing recovery context is required")
	}
	if _, err := validateTimestamp("conversation input routing recoveredAt", recoveredAt); err != nil {
		return 0, err
	}
	totalRecovered := 0
	for {
		recovered := 0
		_, err := store.Transact(ctx, "recover conversation input routing", func(transaction *WriteTransaction) error {
			var recoveryErr error
			recovered, recoveryErr = recoverConversationInputRoutingTransaction(transaction, store.dbPath, recoveredAt)
			return recoveryErr
		})
		if errors.Is(err, errNoConversationInputRoutingWork) {
			return totalRecovered, nil
		}
		if err != nil {
			return totalRecovered, err
		}
		totalRecovered += recovered
		if recovered < maxConversationInputRoutingRecoveryBatch {
			return totalRecovered, nil
		}
	}
}

func recoverConversationInputRoutingTransaction(
	transaction *WriteTransaction,
	dbPath string,
	recoveredAt string,
) (int, error) {
	inputIDs, err := readConversationInputRoutingRecoveryIDs(transaction)
	if err != nil {
		return 0, err
	}
	if len(inputIDs) == 0 {
		return 0, errNoConversationInputRoutingWork
	}
	for _, inputID := range inputIDs {
		if err := recoverOneConversationInputRouting(transaction, dbPath, inputID, recoveredAt); err != nil {
			return 0, err
		}
	}
	return len(inputIDs), nil
}

func readConversationInputRoutingRecoveryIDs(transaction *WriteTransaction) ([]string, error) {
	rows, err := transaction.tx.QueryContext(transaction.ctx, `
SELECT id
FROM conversation_inputs
WHERE status = ?
ORDER BY sequence
LIMIT ?
`, ConversationInputStatusRouting, maxConversationInputRoutingRecoveryBatch)
	if err != nil {
		return nil, fmt.Errorf("list conversation input routing recovery: %w", err)
	}
	inputIDs := []string{}
	for rows.Next() {
		var inputID string
		if err := rows.Scan(&inputID); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("decode conversation input routing recovery: %w", err)
		}
		inputIDs = append(inputIDs, inputID)
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("close conversation input routing recovery rows: %w", err)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list conversation input routing recovery: %w", err)
	}
	return inputIDs, nil
}

func recoverOneConversationInputRouting(
	transaction *WriteTransaction,
	dbPath string,
	inputID string,
	recoveredAt string,
) error {
	record, found, err := readConversationInputRecord(transaction.ctx, transaction.tx, inputID, dbPath)
	if err != nil {
		return err
	}
	if !found || record.Accepted.Status != ConversationInputStatusRouting {
		return stateConflict("conversation input", inputID, "routing recovery target changed")
	}
	recovered, err := validateTimestamp("conversation input routing recoveredAt", recoveredAt)
	if err != nil {
		return err
	}
	started, err := validateTimestamp("conversation input routing startedAt", *record.RoutingStartedAt)
	if err != nil {
		return err
	}
	if recovered.Before(started) {
		return errors.New("conversation input routing recovery cannot precede its attempt")
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_inputs
SET status = ?, routing_started_at = NULL, failure_json = NULL
WHERE id = ? AND status = ? AND routing_attempt = ?
`,
		ConversationInputStatusAccepted,
		inputID,
		ConversationInputStatusRouting,
		record.RoutingAttempt,
	)
	if err != nil {
		return fmt.Errorf("recover conversation input routing %s: %w", inputID, err)
	}
	if err := requireOneRow(result, "conversation input", inputID, "routing attempt changed before recovery"); err != nil {
		return err
	}
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	event := ConversationInputRoutingRecovery{
		ConversationID: record.Accepted.Input.ConversationID,
		InputID:        inputID,
		RoutingAttempt: record.RoutingAttempt,
		RecoveredAt:    recoveredAt,
	}
	return appendConversationInputRoutingEvent(
		transaction,
		record.Accepted.Input.ConversationID,
		conversationInputRoutingEventID("recovered", inputID, record.RoutingAttempt),
		ConversationInputRoutingRecoveredEventKind,
		event,
		recoveredAt,
	)
}
