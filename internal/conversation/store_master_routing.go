package conversation

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"

	"setta/internal/jsonio"
	"setta/internal/master"
)

var (
	errNoMasterInputRoutingWork       = errors.New("no master input routing work")
	errMasterRouteDecisionAlreadyDone = errors.New("master route decision already committed")
)

const maxMasterRoutingRecoveryBatch = 128

func (store *Store) ClaimNextMasterRouteInput(
	ctx context.Context,
	startedAt string,
) (master.InputRoutingWork, bool, error) {
	if store == nil {
		return master.InputRoutingWork{}, false, errors.New("conversation store is required")
	}
	if ctx == nil {
		return master.InputRoutingWork{}, false, errors.New("master input routing context is required")
	}
	if _, err := validateTimestamp("master input routing startedAt", startedAt); err != nil {
		return master.InputRoutingWork{}, false, err
	}

	var work master.InputRoutingWork
	_, err := store.Transact(ctx, "claim master input routing work", func(transaction *WriteTransaction) error {
		var claimErr error
		work, claimErr = claimNextMasterRouteInputTransaction(transaction, store.dbPath, startedAt)
		return claimErr
	})
	if errors.Is(err, errNoMasterInputRoutingWork) {
		return master.InputRoutingWork{}, false, nil
	}
	if err != nil {
		return master.InputRoutingWork{}, false, err
	}
	return cloneMasterInputRoutingWork(work), true, nil
}

func claimNextMasterRouteInputTransaction(
	transaction *WriteTransaction,
	dbPath string,
	startedAt string,
) (master.InputRoutingWork, error) {
	inputID, err := nextMasterRouteInputID(transaction)
	if err != nil {
		return master.InputRoutingWork{}, err
	}
	accepted, found, err := readMasterInputRow(transaction.ctx, transaction.tx, inputID, dbPath)
	if err != nil {
		return master.InputRoutingWork{}, err
	}
	if !found {
		return master.InputRoutingWork{}, stateConflict("master input", inputID, "routing claim disappeared")
	}
	if err := validateMasterRouteClaimTiming(accepted, startedAt); err != nil {
		return master.InputRoutingWork{}, err
	}
	attempt, err := advanceMasterRouteClaim(transaction, inputID, startedAt)
	if err != nil {
		return master.InputRoutingWork{}, err
	}
	work := master.InputRoutingWork{
		Input:            accepted,
		RoutingAttempt:   attempt,
		RoutingStartedAt: startedAt,
	}
	if err := work.Validate(); err != nil {
		return master.InputRoutingWork{}, fmt.Errorf("validate claimed master input routing work: %w", err)
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          master.RouteRoutingEventID("started", inputID, attempt),
		StreamID:    master.RouteDecisionCommittedStream,
		Kind:        master.RouteInputRoutingStartedKind,
		Payload:     work,
		CommittedAt: startedAt,
	}); err != nil {
		return master.InputRoutingWork{}, err
	}
	return work, nil
}

func nextMasterRouteInputID(transaction *WriteTransaction) (string, error) {
	var inputID string
	err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT id
FROM master_inputs
WHERE routing_status = ?
ORDER BY sequence
LIMIT 1
`, master.InputRoutingStatusAccepted).Scan(&inputID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errNoMasterInputRoutingWork
	}
	if err != nil {
		return "", fmt.Errorf("read next master input routing work: %w", err)
	}
	return inputID, nil
}

func validateMasterRouteClaimTiming(accepted master.AcceptedMasterInput, startedAt string) error {
	started, _ := validateTimestamp("master input routing startedAt", startedAt)
	acceptedTime, _ := validateTimestamp("master input acceptedAt", accepted.AcceptedAt)
	if started.Before(acceptedTime) {
		return errors.New("master input routing cannot start before input acceptance")
	}
	return nil
}

func advanceMasterRouteClaim(
	transaction *WriteTransaction,
	inputID string,
	startedAt string,
) (int, error) {
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE master_inputs
SET routing_status = ?, routing_attempt = routing_attempt + 1,
    routing_started_at = ?, routing_failure_json = NULL
WHERE id = ? AND routing_status = ?
`, master.InputRoutingStatusRouting, startedAt, inputID, master.InputRoutingStatusAccepted)
	if err != nil {
		return 0, fmt.Errorf("claim master input %s for routing: %w", inputID, err)
	}
	if err := requireOneRow(result, "master input", inputID, "routing claim changed concurrently"); err != nil {
		return 0, err
	}
	if err := transaction.recordStateMutation(); err != nil {
		return 0, err
	}
	var attempt int
	if err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT routing_attempt
FROM master_inputs
WHERE id = ?
`, inputID).Scan(&attempt); err != nil {
		return 0, fmt.Errorf("read claimed master input %s: %w", inputID, err)
	}
	return attempt, nil
}

func (store *Store) ReadMasterRouteTargets(
	ctx context.Context,
	conversationIDs []string,
	maxForkPoints int,
) ([]master.RouteConversationTarget, error) {
	if err := validateMasterRouteTargetRequest(store, ctx, conversationIDs, maxForkPoints); err != nil {
		return nil, err
	}
	return store.readMasterRouteTargets(ctx, conversationIDs, maxForkPoints)
}

func validateMasterRouteTargetRequest(
	store *Store,
	ctx context.Context,
	conversationIDs []string,
	maxForkPoints int,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("master route target context is required")
	}
	if len(conversationIDs) > master.MaxRouteConversationTargets {
		return fmt.Errorf("master route target request exceeds %d conversations", master.MaxRouteConversationTargets)
	}
	if maxForkPoints < 0 || maxForkPoints > master.MaxRouteForkPointsPerTarget {
		return fmt.Errorf("master route fork point limit must be between 0 and %d", master.MaxRouteForkPointsPerTarget)
	}
	return validateMasterRouteTargetIDs(conversationIDs)
}

func (store *Store) readMasterRouteTargets(
	ctx context.Context,
	conversationIDs []string,
	maxForkPoints int,
) ([]master.RouteConversationTarget, error) {
	targets := []master.RouteConversationTarget{}
	err := store.read(ctx, "read master route targets", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		for _, conversationID := range conversationIDs {
			target, found, readErr := readMasterRouteTarget(ctx, reader, conversationID, maxForkPoints)
			if readErr != nil {
				return readErr
			}
			if found {
				targets = append(targets, target)
			}
		}
		return reader.Commit()
	})
	if err != nil {
		return nil, err
	}
	return cloneMasterRouteTargets(targets), nil
}

type masterRouteReader interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readMasterRouteTarget(
	ctx context.Context,
	reader masterRouteReader,
	conversationID string,
	maxForkPoints int,
) (master.RouteConversationTarget, bool, error) {
	conversation, err := scanTopicConversation(reader.QueryRowContext(ctx, `
SELECT id, workspace_id, title, topic_descriptor, status,
       created_at, updated_at, archived_at, last_trajectory_sequence
FROM conversations
WHERE id = ? AND archived_at IS NULL
`, conversationID))
	if errors.Is(err, sql.ErrNoRows) {
		return master.RouteConversationTarget{}, false, nil
	}
	if err != nil {
		return master.RouteConversationTarget{}, false, fmt.Errorf("read master route target %s: %w", conversationID, err)
	}
	openPaneIDs, openPaneCount, err := readMasterRouteTargetPanes(ctx, reader, conversationID)
	if err != nil {
		return master.RouteConversationTarget{}, false, err
	}
	activeTurnID, err := readMasterRouteActiveTurn(ctx, reader, conversationID)
	if err != nil {
		return master.RouteConversationTarget{}, false, err
	}
	forkPoints, err := readMasterRouteForkPoints(ctx, reader, conversationID, maxForkPoints)
	if err != nil {
		return master.RouteConversationTarget{}, false, err
	}
	allowed, err := readMasterRouteAllowedKinds(
		ctx,
		reader,
		conversation,
		activeTurnID,
		forkPoints,
	)
	if err != nil {
		return master.RouteConversationTarget{}, false, err
	}
	target := master.RouteConversationTarget{
		ConversationID:       conversation.ID,
		WorkspaceID:          conversation.WorkspaceID,
		Title:                conversation.Title,
		Status:               string(conversation.Status),
		OpenPaneIDs:          openPaneIDs,
		OpenPaneCount:        openPaneCount,
		ActiveTurnID:         activeTurnID,
		CompletedForkPoints:  forkPoints,
		AllowedDecisionKinds: allowed,
	}
	if err := target.Validate(); err != nil {
		return master.RouteConversationTarget{}, false, fmt.Errorf("validate master route target %s: %w", conversationID, err)
	}
	return target, true, nil
}

func (store *Store) ListRecentMasterRouteDecisions(
	ctx context.Context,
	limit int,
) ([]master.RouteDecisionRecord, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("master route decision read context is required")
	}
	if limit < 0 || limit > master.MaxRecentRouteDecisionCount {
		return nil, fmt.Errorf("master route decision limit must be between 0 and %d", master.MaxRecentRouteDecisionCount)
	}
	if limit == 0 {
		return []master.RouteDecisionRecord{}, nil
	}
	records := []master.RouteDecisionRecord{}
	err := store.read(ctx, "list recent master route decisions", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, masterRouteDecisionSelect+`
ORDER BY stream_sequence DESC
LIMIT ?
`, limit)
		if err != nil {
			return fmt.Errorf("list recent master route decisions: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			record, err := scanMasterRouteDecision(rows, store.dbPath)
			if err != nil {
				return err
			}
			records = append(records, record)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	slices.Reverse(records)
	return cloneMasterRouteDecisionRecords(records), nil
}

func (store *Store) CommitMasterRouteDecision(
	ctx context.Context,
	commit master.RouteDecisionCommit,
) (master.RouteDecisionRecord, error) {
	if store == nil {
		return master.RouteDecisionRecord{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return master.RouteDecisionRecord{}, errors.New("master route decision context is required")
	}
	if err := commit.Validate(); err != nil {
		return master.RouteDecisionRecord{}, err
	}

	var record master.RouteDecisionRecord
	_, err := store.Transact(ctx, "commit master route decision", func(transaction *WriteTransaction) error {
		var commitErr error
		record, commitErr = commitMasterRouteDecisionTransaction(transaction, store.dbPath, commit)
		return commitErr
	})
	if errors.Is(err, errMasterRouteDecisionAlreadyDone) {
		return master.CloneRouteDecisionRecord(record), nil
	}
	if err != nil {
		return master.RouteDecisionRecord{}, err
	}
	return master.CloneRouteDecisionRecord(record), nil
}

func commitMasterRouteDecisionTransaction(
	transaction *WriteTransaction,
	dbPath string,
	commit master.RouteDecisionCommit,
) (master.RouteDecisionRecord, error) {
	existing, done, err := existingMasterRouteCommit(transaction, dbPath, commit)
	if err != nil || done {
		return existing, err
	}
	accepted, startedAt, err := requireActiveMasterRouteCommit(transaction, dbPath, commit)
	if err != nil {
		return master.RouteDecisionRecord{}, err
	}
	if err := requireMasterRouteCommitContext(accepted, commit); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	if err := requireMasterRouteInvocationState(transaction, dbPath, commit); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	if err := requireCurrentMasterRouteAuthority(transaction, commit.Decision); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	if err := requireCurrentMasterRouteCommandAuthority(transaction, commit.ResultingCommand); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	if err := requireMasterRouteCommitTiming(commit.DecidedAt, *startedAt); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	return persistMasterRouteDecisionCommit(transaction, commit, *startedAt)
}

func existingMasterRouteCommit(
	transaction *WriteTransaction,
	dbPath string,
	commit master.RouteDecisionCommit,
) (master.RouteDecisionRecord, bool, error) {
	existing, found, err := readMasterRouteDecisionByID(transaction.ctx, transaction.tx, commit.ID, dbPath)
	if err != nil {
		return master.RouteDecisionRecord{}, false, err
	}
	if found {
		if !master.EqualRouteDecisionCommit(existing, commit) {
			return master.RouteDecisionRecord{}, false, stateConflict(
				"master route decision",
				commit.ID,
				"decision id was already committed with different content",
			)
		}
		return existing, true, errMasterRouteDecisionAlreadyDone
	}
	if _, found, err := readMasterRouteDecisionByInput(
		transaction.ctx,
		transaction.tx,
		commit.InputID,
		dbPath,
	); err != nil {
		return master.RouteDecisionRecord{}, false, err
	} else if found {
		return master.RouteDecisionRecord{}, false, stateConflict(
			"master input",
			commit.InputID,
			"input already has a different route decision",
		)
	}
	return master.RouteDecisionRecord{}, false, nil
}

func requireActiveMasterRouteCommit(
	transaction *WriteTransaction,
	dbPath string,
	commit master.RouteDecisionCommit,
) (master.AcceptedMasterInput, *string, error) {
	accepted, status, attempt, startedAt, err := readMasterRouteCommitInput(
		transaction.ctx,
		transaction.tx,
		commit.InputID,
		dbPath,
	)
	if err != nil {
		return master.AcceptedMasterInput{}, nil, err
	}
	if status != master.InputRoutingStatusRouting || startedAt == nil || attempt != commit.RoutingAttempt {
		return master.AcceptedMasterInput{}, nil, stateConflict(
			"master input",
			commit.InputID,
			"routing attempt is not active",
		)
	}
	return accepted, startedAt, nil
}

func requireMasterRouteCommitContext(
	accepted master.AcceptedMasterInput,
	commit master.RouteDecisionCommit,
) error {
	if accepted.Sequence != commit.Context.InputSequence ||
		!equalOptionalStrings(accepted.Input.FocusedWorkspaceID, commit.Context.FocusedWorkspaceID) ||
		!equalOptionalStrings(accepted.Input.FocusedConversationID, commit.Context.FocusedConversationID) ||
		!equalOptionalStrings(accepted.Input.OriginatingConversationID, commit.Context.OriginatingConversationID) {
		return stateConflict(
			"master route decision",
			commit.ID,
			"context audit does not match the durable input",
		)
	}
	return nil
}

func requireMasterRouteCommitTiming(decidedAt string, startedAt string) error {
	decided, _ := validateTimestamp("master route decision decidedAt", decidedAt)
	started, _ := validateTimestamp("master input routing startedAt", startedAt)
	if decided.Before(started) {
		return errors.New("master route decision cannot precede its routing attempt")
	}
	return nil
}

func persistMasterRouteDecisionCommit(
	transaction *WriteTransaction,
	commit master.RouteDecisionCommit,
	startedAt string,
) (master.RouteDecisionRecord, error) {
	record, err := insertMasterRouteDecision(transaction, commit)
	if err != nil {
		return master.RouteDecisionRecord{}, err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE master_inputs
SET routing_status = ?, routing_started_at = NULL, routing_failure_json = NULL
WHERE id = ? AND routing_status = ? AND routing_attempt = ? AND routing_started_at = ?
`,
		master.InputRoutingStatusDecided,
		commit.InputID,
		master.InputRoutingStatusRouting,
		commit.RoutingAttempt,
		startedAt,
	)
	if err != nil {
		return master.RouteDecisionRecord{}, fmt.Errorf("complete master input routing %s: %w", commit.InputID, err)
	}
	if err := requireOneRow(result, "master input", commit.InputID, "routing attempt changed before decision commit"); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	if err := transaction.recordStateMutation(); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          master.RouteDecisionEventID(commit.InputID),
		StreamID:    master.RouteDecisionCommittedStream,
		Kind:        master.RouteDecisionCommittedKind,
		Payload:     record,
		CommittedAt: commit.DecidedAt,
	}); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	if err := appendMasterRouteInvocationAttemptEvent(
		transaction,
		commit.InvocationAttempt,
		commit.DecidedAt,
	); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	return record, nil
}

func readMasterRouteCommitInput(
	ctx context.Context,
	reader masterInputQuery,
	inputID string,
	dbPath string,
) (master.AcceptedMasterInput, master.InputRoutingStatus, int, *string, error) {
	accepted, found, err := readMasterInputRow(ctx, reader, inputID, dbPath)
	if err != nil {
		return master.AcceptedMasterInput{}, "", 0, nil, err
	}
	if !found {
		return master.AcceptedMasterInput{}, "", 0, nil, stateConflict("master input", inputID, "input was not found")
	}
	var status master.InputRoutingStatus
	var attempt int
	var startedAt sql.NullString
	if err := reader.QueryRowContext(ctx, `
SELECT routing_status, routing_attempt, routing_started_at
FROM master_inputs
WHERE id = ?
`, inputID).Scan(&status, &attempt, &startedAt); err != nil {
		return master.AcceptedMasterInput{}, "", 0, nil, fmt.Errorf("read master input routing state %s: %w", inputID, err)
	}
	return accepted, status, attempt, optionalScannedString(startedAt), nil
}

func requireMasterRouteInvocationState(
	transaction *WriteTransaction,
	dbPath string,
	commit master.RouteDecisionCommit,
) error {
	session, found, err := readMasterSessionRow(transaction.ctx, transaction.tx, dbPath)
	if err != nil {
		return err
	}
	if !found || session.ID != commit.MasterSessionID || session.ProviderThreadID == nil {
		return stateConflict("master session", commit.MasterSessionID, "route session is no longer current")
	}
	if *session.ProviderThreadID != commit.ResolvedInvocation.ProviderThreadID ||
		!master.RouteModelConfigurationMatches(session.Configuration, commit.ResolvedInvocation.Configuration) {
		return stateConflict("master session", commit.MasterSessionID, "route invocation does not match the durable session")
	}
	return nil
}

func requireCurrentMasterRouteAuthority(
	transaction *WriteTransaction,
	decision master.RouteDecision,
) error {
	kind, conversationID, forkTurnID := masterRouteDecisionTarget(decision)
	if conversationID == "" {
		return nil
	}
	target, found, err := readMasterRouteTarget(
		transaction.ctx,
		transaction.tx,
		conversationID,
		master.MaxRouteForkPointsPerTarget,
	)
	if err != nil {
		return err
	}
	if !found || !slices.Contains(target.AllowedDecisionKinds, kind) {
		return stateConflict("master route target", conversationID, "selected decision is no longer available")
	}
	if kind == master.RouteDecisionKindForkConversation {
		for _, point := range target.CompletedForkPoints {
			if point.TurnID == forkTurnID {
				return nil
			}
		}
		return stateConflict("conversation turn", forkTurnID, "selected fork point is no longer available")
	}
	return nil
}

func masterRouteDecisionTarget(decision master.RouteDecision) (master.RouteDecisionKind, string, string) {
	switch decision.Kind {
	case master.RouteDecisionKindSendToAgent:
		return decision.Kind, decision.SendToAgent.ConversationID, ""
	case master.RouteDecisionKindQueueAgentTurn:
		return decision.Kind, decision.QueueAgentTurn.ConversationID, ""
	case master.RouteDecisionKindSteerActiveTurn:
		return decision.Kind, decision.SteerActiveTurn.ConversationID, ""
	case master.RouteDecisionKindAskNarrator:
		return decision.Kind, decision.AskNarrator.ConversationID, ""
	case master.RouteDecisionKindFocusConversation:
		return decision.Kind, decision.FocusConversation.ConversationID, ""
	case master.RouteDecisionKindCreateSideConversation:
		return decision.Kind, decision.CreateSideConversation.ParentConversationID, ""
	case master.RouteDecisionKindForkConversation:
		return decision.Kind, decision.ForkConversation.ParentConversationID, decision.ForkConversation.ForkedAtTurnID
	default:
		return decision.Kind, "", ""
	}
}

func insertMasterRouteDecision(
	transaction *WriteTransaction,
	commit master.RouteDecisionCommit,
) (master.RouteDecisionRecord, error) {
	contextJSON, err := encodeJSONColumn("master route context audit", commit.Context)
	if err != nil {
		return master.RouteDecisionRecord{}, err
	}
	invocationJSON, err := encodeJSONColumn("master route resolved invocation", commit.ResolvedInvocation)
	if err != nil {
		return master.RouteDecisionRecord{}, err
	}
	attemptJSON, err := encodeJSONColumn("master route invocation attempt", commit.InvocationAttempt)
	if err != nil {
		return master.RouteDecisionRecord{}, err
	}
	decisionJSON, err := encodeJSONColumn("master route decision", commit.Decision)
	if err != nil {
		return master.RouteDecisionRecord{}, err
	}
	commandJSON, err := encodeJSONColumn("master route command", commit.ResultingCommand)
	if err != nil {
		return master.RouteDecisionRecord{}, err
	}
	record := master.RouteDecisionRecord{
		ID:                 commit.ID,
		MasterSessionID:    commit.MasterSessionID,
		InputID:            commit.InputID,
		RoutingAttempt:     commit.RoutingAttempt,
		Context:            commit.Context,
		ResolvedInvocation: commit.ResolvedInvocation,
		InvocationAttempt:  commit.InvocationAttempt,
		Decision:           commit.Decision,
		ResultingCommand:   commit.ResultingCommand,
		DecidedAt:          commit.DecidedAt,
	}
	if err := transaction.tx.QueryRowContext(transaction.ctx, `
INSERT INTO master_route_decisions (
  id, master_session_id, input_id, routing_attempt,
  candidate_context_json, resolved_invocation_json, invocation_attempt_json, route_decision_json,
  resulting_command_json, decided_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
RETURNING stream_sequence
`,
		record.ID,
		record.MasterSessionID,
		record.InputID,
		record.RoutingAttempt,
		contextJSON,
		invocationJSON,
		attemptJSON,
		decisionJSON,
		commandJSON,
		record.DecidedAt,
	).Scan(&record.StreamSequence); err != nil {
		return master.RouteDecisionRecord{}, fmt.Errorf("insert master route decision %s: %w", record.ID, err)
	}
	if err := transaction.recordStateMutation(); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	if err := record.Validate(); err != nil {
		return master.RouteDecisionRecord{}, fmt.Errorf("validate committed master route decision: %w", err)
	}
	return record, nil
}

const masterRouteDecisionSelect = `
SELECT stream_sequence, id, master_session_id, input_id, routing_attempt,
       candidate_context_json, resolved_invocation_json, invocation_attempt_json, route_decision_json,
       resulting_command_json, decided_at
FROM master_route_decisions
`

type masterRouteDecisionScanner interface {
	Scan(...any) error
}

func scanMasterRouteDecision(
	scanner masterRouteDecisionScanner,
	dbPath string,
) (master.RouteDecisionRecord, error) {
	var record master.RouteDecisionRecord
	var contextJSON, invocationJSON, attemptJSON, decisionJSON, commandJSON string
	if err := scanner.Scan(
		&record.StreamSequence,
		&record.ID,
		&record.MasterSessionID,
		&record.InputID,
		&record.RoutingAttempt,
		&contextJSON,
		&invocationJSON,
		&attemptJSON,
		&decisionJSON,
		&commandJSON,
		&record.DecidedAt,
	); err != nil {
		return master.RouteDecisionRecord{}, err
	}
	for _, value := range []struct {
		label  string
		source string
		target any
	}{
		{label: "master route context audit", source: contextJSON, target: &record.Context},
		{label: "master route resolved invocation", source: invocationJSON, target: &record.ResolvedInvocation},
		{label: "master route invocation attempt", source: attemptJSON, target: &record.InvocationAttempt},
		{label: "master route decision", source: decisionJSON, target: &record.Decision},
		{label: "master route command", source: commandJSON, target: &record.ResultingCommand},
	} {
		if err := jsonio.DecodeSingle(bytes.NewBufferString(value.source), value.target); err != nil {
			return master.RouteDecisionRecord{}, &CorruptStateError{
				Path: dbPath,
				Err:  fmt.Errorf("decode %s: %w", value.label, err),
			}
		}
	}
	if err := record.Validate(); err != nil {
		return master.RouteDecisionRecord{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("validate master route decision %s: %w", record.ID, err),
		}
	}
	return record, nil
}

func readMasterRouteDecisionByID(
	ctx context.Context,
	query masterInputQuery,
	decisionID string,
	dbPath string,
) (master.RouteDecisionRecord, bool, error) {
	record, err := scanMasterRouteDecision(query.QueryRowContext(ctx, masterRouteDecisionSelect+`
WHERE id = ?
`, decisionID), dbPath)
	if errors.Is(err, sql.ErrNoRows) {
		return master.RouteDecisionRecord{}, false, nil
	}
	if err != nil {
		return master.RouteDecisionRecord{}, false, err
	}
	return record, true, nil
}

func readMasterRouteDecisionByInput(
	ctx context.Context,
	query masterInputQuery,
	inputID string,
	dbPath string,
) (master.RouteDecisionRecord, bool, error) {
	record, err := scanMasterRouteDecision(query.QueryRowContext(ctx, masterRouteDecisionSelect+`
WHERE input_id = ?
`, inputID), dbPath)
	if errors.Is(err, sql.ErrNoRows) {
		return master.RouteDecisionRecord{}, false, nil
	}
	if err != nil {
		return master.RouteDecisionRecord{}, false, err
	}
	return record, true, nil
}

func (store *Store) FailMasterInputRouting(
	ctx context.Context,
	failure master.InputRoutingFailure,
) error {
	if err := validateMasterInputRoutingFailureRequest(store, ctx, failure); err != nil {
		return err
	}
	_, err := store.Transact(ctx, "fail master input routing", func(transaction *WriteTransaction) error {
		return failMasterInputRoutingTransaction(transaction, store.dbPath, failure)
	})
	return err
}

func validateMasterInputRoutingFailureRequest(
	store *Store,
	ctx context.Context,
	failure master.InputRoutingFailure,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("master input routing failure context is required")
	}
	return failure.Validate()
}

func failMasterInputRoutingTransaction(
	transaction *WriteTransaction,
	dbPath string,
	failure master.InputRoutingFailure,
) error {
	_, status, attempt, startedAt, err := readMasterRouteCommitInput(
		transaction.ctx,
		transaction.tx,
		failure.InputID,
		dbPath,
	)
	if err != nil {
		return err
	}
	if status != master.InputRoutingStatusRouting || startedAt == nil || attempt != failure.RoutingAttempt {
		return stateConflict("master input", failure.InputID, "routing attempt is not active")
	}
	failed, _ := validateTimestamp("master input routing failedAt", failure.FailedAt)
	started, _ := validateTimestamp("master input routing startedAt", *startedAt)
	if failed.Before(started) {
		return errors.New("master input routing failure cannot precede its attempt")
	}
	failureJSON, err := encodeJSONColumn("master input routing failure", storedMasterInputRoutingFailure{
		Code:                failure.Failure.Code,
		Message:             failure.Failure.Message,
		Retryable:           failure.Failure.Retryable,
		DiagnosticReference: failure.Failure.DiagnosticReference,
		InvocationAttempt:   failure.InvocationAttempt,
	})
	if err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
UPDATE master_inputs
SET routing_status = ?, routing_started_at = NULL, routing_failure_json = ?
WHERE id = ? AND routing_status = ? AND routing_attempt = ? AND routing_started_at = ?
`,
		master.InputRoutingStatusFailed,
		failureJSON,
		failure.InputID,
		master.InputRoutingStatusRouting,
		failure.RoutingAttempt,
		*startedAt,
	)
	if err != nil {
		return fmt.Errorf("fail master input routing %s: %w", failure.InputID, err)
	}
	if err := requireOneRow(result, "master input", failure.InputID, "routing attempt changed before failure"); err != nil {
		return err
	}
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	if _, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          master.RouteRoutingEventID("failed", failure.InputID, failure.RoutingAttempt),
		StreamID:    master.RouteDecisionCommittedStream,
		Kind:        master.RouteInputRoutingFailedKind,
		Payload:     failure,
		CommittedAt: failure.FailedAt,
	}); err != nil {
		return err
	}
	return appendMasterRouteInvocationAttemptEvent(transaction, failure.InvocationAttempt, failure.FailedAt)
}
