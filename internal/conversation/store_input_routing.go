package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

var (
	errNoConversationInputRoutingWork       = errors.New("no conversation input routing work")
	errConversationRouteDecisionAlreadyDone = errors.New("conversation route decision already committed")
	errConversationInputAlreadyDiscarded    = errors.New("conversation input already discarded")
)

func (store *Store) ClaimNextConversationInput(
	ctx context.Context,
	conversationID string,
	startedAt string,
) (ConversationInputRoutingWork, bool, error) {
	if store == nil {
		return ConversationInputRoutingWork{}, false, errors.New("conversation store is required")
	}
	if ctx == nil {
		return ConversationInputRoutingWork{}, false, errors.New("conversation input routing context is required")
	}
	if err := validateConversationInputReference("conversation input routing conversation id", conversationID); err != nil {
		return ConversationInputRoutingWork{}, false, err
	}
	if _, err := validateTimestamp("conversation input routing startedAt", startedAt); err != nil {
		return ConversationInputRoutingWork{}, false, err
	}

	var work ConversationInputRoutingWork
	_, err := store.Transact(ctx, "claim conversation input routing work", func(transaction *WriteTransaction) error {
		var claimErr error
		work, claimErr = claimNextConversationInputTransaction(
			transaction,
			store.dbPath,
			conversationID,
			startedAt,
		)
		return claimErr
	})
	if errors.Is(err, errNoConversationInputRoutingWork) {
		return ConversationInputRoutingWork{}, false, nil
	}
	if err != nil {
		return ConversationInputRoutingWork{}, false, err
	}
	return cloneConversationInputRoutingWork(work), true, nil
}

func claimNextConversationInputTransaction(
	transaction *WriteTransaction,
	dbPath string,
	conversationID string,
	startedAt string,
) (ConversationInputRoutingWork, error) {
	root, found, err := readOldestPendingConversationInput(transaction.ctx, transaction.tx, conversationID, dbPath)
	if err != nil {
		return ConversationInputRoutingWork{}, err
	}
	if !found {
		return ConversationInputRoutingWork{}, errNoConversationInputRoutingWork
	}
	active, reply, priorClarification, err := resolveConversationInputRoutingClaimTarget(
		transaction.ctx,
		transaction.tx,
		dbPath,
		root,
	)
	if err != nil {
		return ConversationInputRoutingWork{}, err
	}

	if err := validateConversationInputRoutingClaimTime(active, startedAt); err != nil {
		return ConversationInputRoutingWork{}, err
	}
	claimed, err := markConversationInputRoutingClaimed(transaction, dbPath, conversationID, active, startedAt)
	if err != nil {
		return ConversationInputRoutingWork{}, err
	}
	work, err := buildConversationInputRoutingWork(root, claimed, reply, priorClarification, startedAt)
	if err != nil {
		return ConversationInputRoutingWork{}, err
	}
	if err := appendConversationInputRoutingEvent(
		transaction,
		conversationID,
		conversationInputRoutingEventID("started", claimed.Accepted.Input.ID, claimed.RoutingAttempt),
		ConversationInputRoutingStartedEventKind,
		work,
		startedAt,
	); err != nil {
		return ConversationInputRoutingWork{}, err
	}
	return work, nil
}

func validateConversationInputRoutingClaimTime(active conversationInputRecord, startedAt string) error {
	started, err := validateTimestamp("conversation input routing startedAt", startedAt)
	if err != nil {
		return err
	}
	acceptedAt, err := validateTimestamp("conversation input acceptedAt", active.Accepted.AcceptedAt)
	if err != nil {
		return err
	}
	if started.Before(acceptedAt) {
		return errors.New("conversation input routing cannot start before input acceptance")
	}
	return nil
}

func markConversationInputRoutingClaimed(
	transaction *WriteTransaction,
	dbPath string,
	conversationID string,
	active conversationInputRecord,
	startedAt string,
) (conversationInputRecord, error) {
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_inputs
SET status = ?, routing_attempt = routing_attempt + 1,
    routing_started_at = ?, failure_json = NULL
WHERE id = ? AND conversation_id = ? AND status = ?
`,
		ConversationInputStatusRouting,
		startedAt,
		active.Accepted.Input.ID,
		conversationID,
		ConversationInputStatusAccepted,
	)
	if err != nil {
		return conversationInputRecord{}, fmt.Errorf("claim conversation input %s for routing: %w", active.Accepted.Input.ID, err)
	}
	if err := requireOneRow(result, "conversation input", active.Accepted.Input.ID, "routing claim changed concurrently"); err != nil {
		return conversationInputRecord{}, err
	}
	if err := transaction.recordStateMutation(); err != nil {
		return conversationInputRecord{}, err
	}
	claimed, found, err := readConversationInputRecord(transaction.ctx, transaction.tx, active.Accepted.Input.ID, dbPath)
	if err != nil {
		return conversationInputRecord{}, err
	}
	if !found {
		return conversationInputRecord{}, stateConflict("conversation input", active.Accepted.Input.ID, "routing claim disappeared")
	}
	return claimed, nil
}

func buildConversationInputRoutingWork(
	root conversationInputRecord,
	claimed conversationInputRecord,
	reply *conversationInputRecord,
	priorClarification *ConversationRouteDecisionRecord,
	startedAt string,
) (ConversationInputRoutingWork, error) {
	work := ConversationInputRoutingWork{
		Input:              root.Accepted,
		PriorClarification: priorClarification,
		RoutingAttempt:     claimed.RoutingAttempt,
		RoutingStartedAt:   startedAt,
	}
	if reply == nil {
		work.Input = claimed.Accepted
	} else {
		claimedReply := claimed.Accepted
		work.ClarificationReply = &claimedReply
	}
	if err := work.Validate(); err != nil {
		return ConversationInputRoutingWork{}, fmt.Errorf("validate claimed conversation input routing work: %w", err)
	}
	return work, nil
}

func resolveConversationInputRoutingClaimTarget(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	root conversationInputRecord,
) (conversationInputRecord, *conversationInputRecord, *ConversationRouteDecisionRecord, error) {
	switch root.Accepted.Status {
	case ConversationInputStatusAccepted:
		return root, nil, nil, nil
	case ConversationInputStatusAwaitingClarification:
		return resolveConversationInputRoutingClarification(ctx, tx, dbPath, root)
	case ConversationInputStatusRouting, ConversationInputStatusFailed:
		return conversationInputRecord{}, nil, nil, errNoConversationInputRoutingWork
	default:
		return conversationInputRecord{}, nil, nil, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("oldest pending conversation input %s has status %s", root.Accepted.Input.ID, root.Accepted.Status),
		}
	}
}

func resolveConversationInputRoutingClarification(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	root conversationInputRecord,
) (conversationInputRecord, *conversationInputRecord, *ConversationRouteDecisionRecord, error) {
	reply, found, err := readConversationInputClarificationReply(
		ctx,
		tx,
		root.Accepted.Input.ConversationID,
		root.Accepted.Input.ID,
		dbPath,
	)
	if err != nil {
		return conversationInputRecord{}, nil, nil, err
	}
	if !found || reply.Accepted.Status != ConversationInputStatusAccepted {
		return conversationInputRecord{}, nil, nil, errNoConversationInputRoutingWork
	}
	clarification, found, err := readConversationRouteDecisionOrdinal(
		ctx,
		tx,
		root.Accepted.Input.ConversationID,
		root.Accepted.Input.ID,
		1,
		dbPath,
	)
	if err != nil {
		return conversationInputRecord{}, nil, nil, err
	}
	if !found || clarification.Decision.Kind != ConversationRouteDecisionKindClarify {
		return conversationInputRecord{}, nil, nil, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("conversation input %s awaits clarification without a clarification decision", root.Accepted.Input.ID),
		}
	}
	return reply, &reply, &clarification, nil
}

func (store *Store) CommitConversationRouteDecision(
	ctx context.Context,
	commit ConversationRouteDecisionCommit,
) (ConversationRouteDecisionRecord, error) {
	if store == nil {
		return ConversationRouteDecisionRecord{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return ConversationRouteDecisionRecord{}, errors.New("conversation route decision context is required")
	}
	if err := commit.Validate(); err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	commit = cloneConversationRouteDecisionCommit(commit)

	var record ConversationRouteDecisionRecord
	_, err := store.Transact(ctx, "commit conversation route decision", func(transaction *WriteTransaction) error {
		var commitErr error
		record, commitErr = commitConversationRouteDecisionTransaction(transaction, store.dbPath, commit)
		return commitErr
	})
	if errors.Is(err, errConversationRouteDecisionAlreadyDone) {
		return cloneConversationRouteDecisionRecord(record), nil
	}
	if err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	return cloneConversationRouteDecisionRecord(record), nil
}

func commitConversationRouteDecisionTransaction(
	transaction *WriteTransaction,
	dbPath string,
	commit ConversationRouteDecisionCommit,
) (ConversationRouteDecisionRecord, error) {
	existing, done, err := readExistingConversationRouteDecisionCommit(
		transaction.ctx,
		transaction.tx,
		dbPath,
		commit,
	)
	if err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	if done {
		return existing, errConversationRouteDecisionAlreadyDone
	}
	root, active, err := prepareConversationRouteDecisionCommit(transaction, dbPath, commit)
	if err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	if err := validateConversationRouteDecisionTime(active, commit); err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	record, err := insertConversationRouteDecisionRecord(transaction, commit)
	if err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	if err := applyConversationRouteDecisionCommand(transaction, dbPath, root, commit); err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	if err := applyConversationRouteDecisionStatus(transaction, root, active, commit); err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	if err := appendConversationInputRoutingEvent(
		transaction,
		commit.ConversationID,
		"conversation-route-decision:"+record.ID,
		ConversationInputRouteDecidedEventKind,
		record,
		commit.DecidedAt,
	); err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	if err := appendInvocationAttemptEvent(
		transaction,
		commit.InvocationAttemptCommittedID,
		commit.InvocationAttempt,
		commit.DecidedAt,
	); err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	return record, nil
}

func readExistingConversationRouteDecisionCommit(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	commit ConversationRouteDecisionCommit,
) (ConversationRouteDecisionRecord, bool, error) {
	existing, found, err := readConversationRouteDecisionID(ctx, tx, commit.ID, dbPath)
	if err != nil || !found {
		return existing, found, err
	}
	if !equalConversationRouteDecisionCommit(existing, commit) {
		return ConversationRouteDecisionRecord{}, false, stateConflict(
			"conversation route decision",
			commit.ID,
			"decision id was already committed with different content",
		)
	}
	return existing, true, nil
}

func prepareConversationRouteDecisionCommit(
	transaction *WriteTransaction,
	dbPath string,
	commit ConversationRouteDecisionCommit,
) (conversationInputRecord, conversationInputRecord, error) {
	root, active, priorClarification, err := requireConversationRouteCommitState(
		transaction.ctx,
		transaction.tx,
		dbPath,
		commit,
	)
	if err != nil {
		return conversationInputRecord{}, conversationInputRecord{}, err
	}
	if err := validateConversationRouteAuditInputSequences(root, active, commit); err != nil {
		return conversationInputRecord{}, conversationInputRecord{}, err
	}
	if priorClarification != nil && commit.Decision.Kind == ConversationRouteDecisionKindClarify {
		return conversationInputRecord{}, conversationInputRecord{}, stateConflict(
			"conversation input",
			commit.InputID,
			"a clarification reply must resolve one final decision",
		)
	}
	commandKey, err := conversationRouteCommandKey(commit)
	if err != nil {
		return conversationInputRecord{}, conversationInputRecord{}, err
	}
	if err := requireConversationRouteCommandKeyAbsent(transaction.ctx, transaction.tx, commandKey); err != nil {
		return conversationInputRecord{}, conversationInputRecord{}, err
	}
	if err := validateConversationRouteCommandState(transaction.ctx, transaction.tx, root, commit); err != nil {
		return conversationInputRecord{}, conversationInputRecord{}, err
	}
	return root, active, nil
}

func validateConversationRouteAuditInputSequences(
	root conversationInputRecord,
	active conversationInputRecord,
	commit ConversationRouteDecisionCommit,
) error {
	if commit.RouterContext.InputSequence != root.Accepted.Sequence {
		return stateConflict(
			"conversation route decision",
			commit.ID,
			"router context input sequence does not match the durable routed input",
		)
	}
	if commit.ClarificationInputID == nil {
		return nil
	}
	if commit.RouterContext.ClarificationInputSequence == nil ||
		*commit.RouterContext.ClarificationInputSequence != active.Accepted.Sequence {
		return stateConflict(
			"conversation route decision",
			commit.ID,
			"router context clarification sequence does not match the durable reply",
		)
	}
	return nil
}

func validateConversationRouteDecisionTime(
	active conversationInputRecord,
	commit ConversationRouteDecisionCommit,
) error {
	decidedAt, err := validateTimestamp("conversation route decision decidedAt", commit.DecidedAt)
	if err != nil {
		return err
	}
	routingStartedAt, err := validateTimestamp("conversation input routing startedAt", *active.RoutingStartedAt)
	if err != nil {
		return err
	}
	if decidedAt.Before(routingStartedAt) {
		return errors.New("conversation route decision cannot precede its routing attempt")
	}
	return nil
}

func insertConversationRouteDecisionRecord(
	transaction *WriteTransaction,
	commit ConversationRouteDecisionCommit,
) (ConversationRouteDecisionRecord, error) {
	decisionJSON, err := json.Marshal(commit.Decision)
	if err != nil {
		return ConversationRouteDecisionRecord{}, fmt.Errorf("encode conversation route decision: %w", err)
	}
	commandJSON, err := json.Marshal(commit.ResultingCommand)
	if err != nil {
		return ConversationRouteDecisionRecord{}, fmt.Errorf("encode conversation route command: %w", err)
	}
	routerContextJSON, err := encodeJSONColumn(
		"conversation route context audit",
		commit.RouterContext,
	)
	if err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	resolvedInvocationJSON, err := encodeJSONColumn(
		"conversation route resolved invocation",
		commit.ResolvedInvocation,
	)
	if err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	record := conversationRouteDecisionRecordFromCommit(commit)
	commandKey, err := conversationRouteCommandKey(commit)
	if err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	if err := transaction.tx.QueryRowContext(transaction.ctx, `
INSERT INTO conversation_route_decisions (
  id, conversation_id, input_id, clarification_input_id, decision_ordinal,
	  routing_attempt, router_context_json, resolved_invocation_json,
  route_decision_json, resulting_command_json, resulting_command_key, decided_at
	) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING stream_sequence
`,
		record.ID,
		record.ConversationID,
		record.InputID,
		nullableString(record.ClarificationInputID),
		conversationRouteDecisionOrdinal(commit),
		record.RoutingAttempt,
		routerContextJSON,
		resolvedInvocationJSON,
		string(decisionJSON),
		string(commandJSON),
		commandKey,
		record.DecidedAt,
	).Scan(&record.StreamSequence); err != nil {
		return ConversationRouteDecisionRecord{}, fmt.Errorf("insert conversation route decision %s: %w", record.ID, err)
	}
	if err := transaction.recordStateMutation(); err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	if err := record.Validate(); err != nil {
		return ConversationRouteDecisionRecord{}, fmt.Errorf("validate committed conversation route decision: %w", err)
	}
	return record, nil
}

func conversationRouteDecisionRecordFromCommit(commit ConversationRouteDecisionCommit) ConversationRouteDecisionRecord {
	return ConversationRouteDecisionRecord{
		ID:                   commit.ID,
		ConversationID:       commit.ConversationID,
		InputID:              commit.InputID,
		ClarificationInputID: cloneStringPointer(commit.ClarificationInputID),
		RoutingAttempt:       commit.RoutingAttempt,
		RouterContext:        cloneConversationRouteContextAudit(commit.RouterContext),
		ResolvedInvocation:   cloneConversationRouteResolvedInvocation(commit.ResolvedInvocation),
		Decision:             cloneConversationRouteDecision(commit.Decision),
		ResultingCommand:     cloneConversationRouteCommand(commit.ResultingCommand),
		DecidedAt:            commit.DecidedAt,
	}
}

func conversationRouteDecisionOrdinal(commit ConversationRouteDecisionCommit) int {
	if commit.ClarificationInputID != nil {
		return 2
	}
	return 1
}

func requireConversationRouteCommitState(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	commit ConversationRouteDecisionCommit,
) (conversationInputRecord, conversationInputRecord, *ConversationRouteDecisionRecord, error) {
	root, err := requireConversationRouteRootCommitState(ctx, tx, dbPath, commit)
	if err != nil {
		return conversationInputRecord{}, conversationInputRecord{}, nil, err
	}
	if commit.ClarificationInputID == nil {
		if err := requireConversationRouteInitialAttempt(root, commit); err != nil {
			return conversationInputRecord{}, conversationInputRecord{}, nil, err
		}
		return root, root, nil, nil
	}
	return requireConversationRouteClarificationCommitState(ctx, tx, dbPath, root, commit)
}

func requireConversationRouteRootCommitState(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	commit ConversationRouteDecisionCommit,
) (conversationInputRecord, error) {
	root, found, err := readConversationInputRecord(ctx, tx, commit.InputID, dbPath)
	if err != nil {
		return conversationInputRecord{}, err
	}
	if !found {
		return conversationInputRecord{}, stateConflict("conversation input", commit.InputID, "routed input was not found")
	}
	if root.Accepted.Input.ConversationID != commit.ConversationID {
		return conversationInputRecord{}, stateConflict("conversation input", commit.InputID, "routed input conversation changed")
	}
	if root.Accepted.Input.ReplyToInputID != nil {
		return conversationInputRecord{}, stateConflict("conversation input", commit.InputID, "routed input became a clarification reply")
	}
	oldest, found, err := readOldestPendingConversationInput(ctx, tx, commit.ConversationID, dbPath)
	if err != nil {
		return conversationInputRecord{}, err
	}
	if !found || oldest.Accepted.Input.ID != commit.InputID {
		return conversationInputRecord{}, stateConflict("conversation input", commit.InputID, "an earlier input must route first")
	}
	return root, nil
}

func requireConversationRouteInitialAttempt(
	root conversationInputRecord,
	commit ConversationRouteDecisionCommit,
) error {
	if root.Accepted.Status != ConversationInputStatusRouting {
		return stateConflict("conversation input", commit.InputID, "routing attempt is no longer active")
	}
	if root.RoutingAttempt != commit.RoutingAttempt {
		return stateConflict("conversation input", commit.InputID, "routing attempt number changed")
	}
	return nil
}

func requireConversationRouteClarificationCommitState(
	ctx context.Context,
	tx *sql.Tx,
	dbPath string,
	root conversationInputRecord,
	commit ConversationRouteDecisionCommit,
) (conversationInputRecord, conversationInputRecord, *ConversationRouteDecisionRecord, error) {
	if root.Accepted.Status != ConversationInputStatusAwaitingClarification {
		return conversationInputRecord{}, conversationInputRecord{}, nil, stateConflict("conversation input", commit.InputID, "input is not awaiting clarification")
	}
	reply, found, err := readConversationInputRecord(ctx, tx, *commit.ClarificationInputID, dbPath)
	if err != nil {
		return conversationInputRecord{}, conversationInputRecord{}, nil, err
	}
	if err := validateConversationRouteClarificationReply(reply, found, commit); err != nil {
		return conversationInputRecord{}, conversationInputRecord{}, nil, err
	}
	clarification, found, err := readConversationRouteDecisionOrdinal(
		ctx,
		tx,
		commit.ConversationID,
		commit.InputID,
		1,
		dbPath,
	)
	if err != nil {
		return conversationInputRecord{}, conversationInputRecord{}, nil, err
	}
	if !found || clarification.Decision.Kind != ConversationRouteDecisionKindClarify {
		return conversationInputRecord{}, conversationInputRecord{}, nil, stateConflict("conversation input", commit.InputID, "prior clarification decision was not found")
	}
	return root, reply, &clarification, nil
}

func validateConversationRouteClarificationReply(
	reply conversationInputRecord,
	found bool,
	commit ConversationRouteDecisionCommit,
) error {
	if !found || reply.Accepted.Input.ConversationID != commit.ConversationID {
		return stateConflict("conversation input", *commit.ClarificationInputID, "clarification reply is not in the routed conversation")
	}
	if reply.Accepted.Input.ReplyToInputID == nil || *reply.Accepted.Input.ReplyToInputID != commit.InputID {
		return stateConflict("conversation input", *commit.ClarificationInputID, "clarification reply is not linked to routed input")
	}
	if reply.Accepted.Status != ConversationInputStatusRouting {
		return stateConflict("conversation input", *commit.ClarificationInputID, "clarification routing attempt is no longer active")
	}
	if reply.RoutingAttempt != commit.RoutingAttempt {
		return stateConflict("conversation input", *commit.ClarificationInputID, "clarification routing attempt number changed")
	}
	return nil
}

func validateConversationRouteCommandState(
	ctx context.Context,
	tx *sql.Tx,
	root conversationInputRecord,
	commit ConversationRouteDecisionCommit,
) error {
	conversationStatus, err := readConversationRouteTargetState(ctx, tx, commit.ConversationID)
	if err != nil {
		return err
	}

	switch commit.Decision.Kind {
	case ConversationRouteDecisionKindSendToParent:
		return validateSendToParentRouteCommandState(ctx, tx, conversationStatus, commit)
	case ConversationRouteDecisionKindQueueParentTurn:
		return validateQueueParentRouteCommandState(ctx, tx, conversationStatus, commit)
	case ConversationRouteDecisionKindSteerParentTurn:
		return validateSteerParentRouteCommandState(ctx, tx, conversationStatus, commit)
	case ConversationRouteDecisionKindAnswerAsNarrator:
		return nil
	case ConversationRouteDecisionKindCreateSideConversation:
		return validateCreateSideConversationRouteCommandState(ctx, tx, root, commit)
	case ConversationRouteDecisionKindForkConversation:
		return validateForkConversationRouteCommandState(ctx, tx, commit)
	case ConversationRouteDecisionKindEscalateToMaster:
		return requireConversationRouteIdentifierAbsent(ctx, tx, "master_inputs", commit.ResultingCommand.EscalateToMaster.MasterInputID)
	case ConversationRouteDecisionKindClarify:
		return validateClarifyConversationRouteCommandState(commit)
	default:
		return fmt.Errorf("unsupported conversation route decision kind %q", commit.Decision.Kind)
	}
}

func readConversationRouteTargetState(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
) (ConversationStatus, error) {
	var status ConversationStatus
	var archivedAt sql.NullString
	err := tx.QueryRowContext(ctx, `
SELECT status, archived_at
FROM conversations
WHERE id = ?
`, conversationID).Scan(&status, &archivedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return "", fmt.Errorf("%w: %s", ErrConversationNotFound, conversationID)
	}
	if err != nil {
		return "", fmt.Errorf("read conversation route target %s: %w", conversationID, err)
	}
	if archivedAt.Valid {
		return "", stateConflict("conversation", conversationID, "archived conversations do not accept routed commands")
	}
	return status, nil
}

func validateSendToParentRouteCommandState(
	ctx context.Context,
	tx *sql.Tx,
	status ConversationStatus,
	commit ConversationRouteDecisionCommit,
) error {
	if status != ConversationStatusIdle {
		return stateConflict("conversation", commit.ConversationID, "send-to-parent requires an idle conversation")
	}
	return requireConversationRouteIdentifierAbsent(ctx, tx, "conversation_turns", commit.ResultingCommand.SendToParent.TurnID)
}

func validateQueueParentRouteCommandState(
	ctx context.Context,
	tx *sql.Tx,
	status ConversationStatus,
	commit ConversationRouteDecisionCommit,
) error {
	if !conversationRouteWorkingStatus(status) {
		return stateConflict("conversation", commit.ConversationID, "queue-parent requires active work")
	}
	if _, err := readConversationRouteRunningTurnID(ctx, tx, commit.ConversationID); err != nil {
		return err
	}
	if err := requireConversationRouteQueueCapacity(ctx, tx, commit.ConversationID); err != nil {
		return err
	}
	return requireConversationRouteIdentifierAbsent(ctx, tx, "conversation_turns", commit.ResultingCommand.QueueParentTurn.TurnID)
}

func validateSteerParentRouteCommandState(
	ctx context.Context,
	tx *sql.Tx,
	status ConversationStatus,
	commit ConversationRouteDecisionCommit,
) error {
	if !conversationRouteWorkingStatus(status) {
		return stateConflict("conversation", commit.ConversationID, "steer-parent requires active work")
	}
	runningTurnID, err := readConversationRouteRunningTurnID(ctx, tx, commit.ConversationID)
	if err != nil {
		return err
	}
	if commit.ResultingCommand.SteerParentTurn.TargetTurnID != runningTurnID {
		return stateConflict("conversation turn", commit.ResultingCommand.SteerParentTurn.TargetTurnID, "steering target is not the active turn")
	}
	eventIDs, err := conversationRouteSteeringTrajectoryEventIDs(commit.ID)
	if err != nil {
		return err
	}
	for _, eventID := range eventIDs {
		if err := requireConversationRouteIdentifierAbsent(ctx, tx, "trajectory_events", eventID); err != nil {
			return err
		}
	}
	return nil
}

func validateCreateSideConversationRouteCommandState(
	ctx context.Context,
	tx *sql.Tx,
	root conversationInputRecord,
	commit ConversationRouteDecisionCommit,
) error {
	command := commit.ResultingCommand.CreateSideConversation
	if root.Accepted.Input.SourcePaneID == nil {
		return stateConflict("conversation input", root.Accepted.Input.ID, "side routing requires an originating pane")
	}
	if command.ParentPaneID != *root.Accepted.Input.SourcePaneID {
		return stateConflict("conversation input", root.Accepted.Input.ID, "side routing changed the originating pane")
	}
	if err := requireConversationRoutePaneBinding(ctx, tx, commit.ConversationID, command.ParentPaneID); err != nil {
		return err
	}
	if err := requireConversationRouteSidePaneAvailable(ctx, tx, commit.ConversationID, command.ParentPaneID); err != nil {
		return err
	}
	if err := requireConversationRouteIdentifierAbsent(ctx, tx, "side_conversations", command.SideConversationID); err != nil {
		return err
	}
	return requireConversationRouteSideTurnIdentifierAbsent(ctx, tx, command.TurnID)
}

func validateForkConversationRouteCommandState(
	ctx context.Context,
	tx *sql.Tx,
	commit ConversationRouteDecisionCommit,
) error {
	if err := requireConversationRouteCompletedTurn(ctx, tx, commit.ConversationID, commit.Decision.ForkConversation.ForkedAtTurnID); err != nil {
		return err
	}
	if err := requireConversationRouteIdentifierAbsent(ctx, tx, "conversations", commit.ResultingCommand.ForkConversation.ChildConversationID); err != nil {
		return err
	}
	return requireConversationRouteIdentifierAbsent(
		ctx,
		tx,
		"conversation_turns",
		commit.ResultingCommand.ForkConversation.TurnID,
	)
}

func validateClarifyConversationRouteCommandState(commit ConversationRouteDecisionCommit) error {
	if commit.ClarificationInputID != nil {
		return stateConflict("conversation input", commit.InputID, "clarification replies cannot request another clarification")
	}
	return nil
}

func applyConversationRouteDecisionStatus(
	transaction *WriteTransaction,
	root conversationInputRecord,
	active conversationInputRecord,
	commit ConversationRouteDecisionCommit,
) error {
	if commit.Decision.Kind == ConversationRouteDecisionKindClarify {
		result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_inputs
SET status = ?, routing_started_at = NULL, failure_json = NULL
WHERE id = ? AND conversation_id = ? AND status = ? AND routing_attempt = ?
`,
			ConversationInputStatusAwaitingClarification,
			root.Accepted.Input.ID,
			commit.ConversationID,
			ConversationInputStatusRouting,
			commit.RoutingAttempt,
		)
		if err != nil {
			return fmt.Errorf("mark conversation input %s awaiting clarification: %w", commit.InputID, err)
		}
		if err := requireOneRow(result, "conversation input", commit.InputID, "routing state changed before clarification commit"); err != nil {
			return err
		}
		return transaction.recordStateMutation()
	}

	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_inputs
SET status = ?, routing_started_at = NULL, failure_json = NULL
WHERE id = ? AND conversation_id = ? AND status = ? AND routing_attempt = ?
`,
		ConversationInputStatusDispatched,
		active.Accepted.Input.ID,
		commit.ConversationID,
		ConversationInputStatusRouting,
		commit.RoutingAttempt,
	)
	if err != nil {
		return fmt.Errorf("mark conversation input %s dispatched: %w", active.Accepted.Input.ID, err)
	}
	if err := requireOneRow(result, "conversation input", active.Accepted.Input.ID, "routing state changed before dispatch commit"); err != nil {
		return err
	}
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	if commit.ClarificationInputID == nil {
		return nil
	}
	result, err = transaction.tx.ExecContext(transaction.ctx, `
UPDATE conversation_inputs
SET status = ?, routing_started_at = NULL, failure_json = NULL
WHERE id = ? AND conversation_id = ? AND status = ?
`,
		ConversationInputStatusDispatched,
		root.Accepted.Input.ID,
		commit.ConversationID,
		ConversationInputStatusAwaitingClarification,
	)
	if err != nil {
		return fmt.Errorf("resolve conversation input clarification %s: %w", root.Accepted.Input.ID, err)
	}
	if err := requireOneRow(result, "conversation input", root.Accepted.Input.ID, "clarification state changed before dispatch commit"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}
