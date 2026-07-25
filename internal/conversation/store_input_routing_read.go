package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"setta/internal/jsonio"
)

func (store *Store) ListPendingConversationRouteInputs(
	ctx context.Context,
) ([]string, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("conversation router recovery context is required")
	}
	conversationIDs := []string{}
	err := store.read(ctx, "list pending conversation router inputs", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
WITH pending_conversations AS (
  SELECT root.conversation_id
  FROM conversation_inputs AS root
  WHERE root.reply_to_input_id IS NULL
    AND (
      root.status = ?
      OR (
        root.status = ?
        AND EXISTS (
          SELECT 1
          FROM conversation_inputs AS reply
          WHERE reply.conversation_id = root.conversation_id
            AND reply.reply_to_input_id = root.id
            AND reply.status = ?
        )
      )
    )
  UNION
  SELECT decision.conversation_id
  FROM conversation_route_decisions AS decision
  LEFT JOIN conversation_route_command_completions AS completion
    ON completion.decision_id = decision.id
  WHERE completion.decision_id IS NULL
)
SELECT conversation_id
FROM pending_conversations
ORDER BY conversation_id
`,
			ConversationInputStatusAccepted,
			ConversationInputStatusAwaitingClarification,
			ConversationInputStatusAccepted,
		)
		if err != nil {
			return err
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
	return conversationIDs, err
}

// ReadNextPendingConversationRouteCommand returns the oldest committed route
// command whose effect has not been acknowledged. The decision row is the
// durable command envelope, so startup recovery can replay it without
// reclassifying the original input.
func (store *Store) ReadNextPendingConversationRouteCommand(
	ctx context.Context,
	conversationID string,
) (ConversationRouteDecisionRecord, bool, error) {
	if store == nil {
		return ConversationRouteDecisionRecord{}, false, errors.New("conversation store is required")
	}
	if ctx == nil {
		return ConversationRouteDecisionRecord{}, false, errors.New("conversation route command read context is required")
	}
	if err := validateConversationInputReference("conversation route command conversation id", conversationID); err != nil {
		return ConversationRouteDecisionRecord{}, false, err
	}

	var record ConversationRouteDecisionRecord
	found := false
	err := store.read(ctx, "read pending conversation route command", func(ctx context.Context, reader *sql.Conn) error {
		row := reader.QueryRowContext(ctx, `
SELECT decision.stream_sequence, decision.id, decision.conversation_id,
       decision.input_id, decision.clarification_input_id,
       decision.routing_attempt, decision.router_context_json,
       decision.resolved_invocation_json, decision.route_decision_json,
       decision.resulting_command_json, decision.resulting_command_key,
       decision.decided_at
FROM conversation_route_decisions AS decision
LEFT JOIN conversation_route_command_completions AS completion
  ON completion.decision_id = decision.id
WHERE decision.conversation_id = ? AND completion.decision_id IS NULL
ORDER BY decision.stream_sequence
LIMIT 1
`, conversationID)
		var readErr error
		record, readErr = scanConversationRouteDecision(row, store.dbPath)
		if errors.Is(readErr, sql.ErrNoRows) {
			return nil
		}
		if readErr != nil {
			return readErr
		}
		found = true
		return nil
	})
	if err != nil {
		return ConversationRouteDecisionRecord{}, false, err
	}
	return cloneConversationRouteDecisionRecord(record), found, nil
}

func (store *Store) ReadConversationRouteDecisions(
	ctx context.Context,
	inputID string,
) ([]ConversationRouteDecisionRecord, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("conversation route decision read context is required")
	}
	if err := ValidateConversationInputID(inputID); err != nil {
		return nil, err
	}
	decisions := []ConversationRouteDecisionRecord{}
	err := store.read(ctx, "read conversation route decisions", func(ctx context.Context, reader *sql.Conn) error {
		var readErr error
		decisions, readErr = readConversationRouteDecisionRows(ctx, reader, inputID, store.dbPath)
		return readErr
	})
	if err != nil {
		return nil, err
	}
	return decisions, nil
}

func (store *Store) ReadConversationInputRoutingState(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	inputID string,
) (ConversationInputRoutingState, error) {
	if store == nil {
		return ConversationInputRoutingState{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return ConversationInputRoutingState{}, errors.New("conversation input routing state context is required")
	}
	if workspaceID != "" {
		if err := validateConversationInputReference("conversation input routing workspace id", workspaceID); err != nil {
			return ConversationInputRoutingState{}, err
		}
	}
	if err := validateConversationInputReference("conversation input routing conversation id", conversationID); err != nil {
		return ConversationInputRoutingState{}, err
	}
	if err := ValidateConversationInputID(inputID); err != nil {
		return ConversationInputRoutingState{}, err
	}

	var state ConversationInputRoutingState
	err := store.read(ctx, "read conversation input routing state", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		var readErr error
		state, readErr = readConversationInputRoutingState(
			ctx,
			reader,
			store.dbPath,
			workspaceID,
			conversationID,
			inputID,
		)
		if readErr != nil {
			return readErr
		}
		return reader.Commit()
	})
	if err != nil {
		return ConversationInputRoutingState{}, err
	}
	return cloneConversationInputRoutingState(state), nil
}

// WaitForConversationInputRoutingState blocks on the store's commit wake
// boundary until routing reaches a user-visible terminal state and, for a
// dispatched decision, its exact command effect is durably acknowledged.
// Capturing the wake channel before each read avoids a lost notification
// without polling.
func (store *Store) WaitForConversationInputRoutingState(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	inputID string,
) (ConversationInputRoutingState, error) {
	if store == nil {
		return ConversationInputRoutingState{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return ConversationInputRoutingState{}, errors.New("conversation input routing wait context is required")
	}
	for {
		wake := store.committedEventWakeChannel()
		state, err := store.ReadConversationInputRoutingState(
			ctx,
			workspaceID,
			conversationID,
			inputID,
		)
		if err != nil {
			return ConversationInputRoutingState{}, err
		}
		settled, err := store.conversationInputRoutingStateSettled(ctx, state)
		if err != nil {
			return ConversationInputRoutingState{}, err
		}
		if settled {
			return state, nil
		}
		select {
		case <-ctx.Done():
			return ConversationInputRoutingState{}, ctx.Err()
		case <-store.closing:
			return ConversationInputRoutingState{}, ErrStoreClosed
		case <-wake:
		}
	}
}

func (store *Store) conversationInputRoutingStateSettled(
	ctx context.Context,
	state ConversationInputRoutingState,
) (bool, error) {
	switch state.Input.Status {
	case ConversationInputStatusFailed:
		return true, nil
	case ConversationInputStatusAwaitingClarification:
		if state.ClarificationReply == nil {
			return true, nil
		}
		switch state.ClarificationReply.Status {
		case ConversationInputStatusAccepted, ConversationInputStatusRouting:
			return false, nil
		case ConversationInputStatusFailed:
			return true, nil
		default:
			return false, &CorruptStateError{
				Path: store.dbPath,
				Err: fmt.Errorf(
					"awaiting conversation input %s has clarification reply %s in status %s",
					state.Input.Input.ID,
					state.ClarificationReply.Input.ID,
					state.ClarificationReply.Status,
				),
			}
		}
	case ConversationInputStatusAccepted, ConversationInputStatusRouting:
		return false, nil
	case ConversationInputStatusDispatched:
		if len(state.Decisions) == 0 {
			return false, &CorruptStateError{
				Path: store.dbPath,
				Err:  fmt.Errorf("dispatched conversation input %s has no route decision", state.Input.Input.ID),
			}
		}
		decisionID := state.Decisions[len(state.Decisions)-1].ID
		completed := false
		err := store.read(ctx, "read conversation route command settlement", func(ctx context.Context, reader *sql.Conn) error {
			return reader.QueryRowContext(ctx, `
SELECT EXISTS(
  SELECT 1
  FROM conversation_route_command_completions
  WHERE decision_id = ?
)
`, decisionID).Scan(&completed)
		})
		return completed, err
	default:
		return false, fmt.Errorf("unsupported conversation input routing status %q", state.Input.Status)
	}
}

func readConversationInputRoutingState(
	ctx context.Context,
	reader snapshotReader,
	dbPath string,
	workspaceID string,
	conversationID string,
	inputID string,
) (ConversationInputRoutingState, error) {
	if err := requireConversationInputRoutingOwner(ctx, reader, workspaceID, conversationID); err != nil {
		return ConversationInputRoutingState{}, err
	}
	root, err := readConversationInputRoutingStateRoot(ctx, reader, dbPath, conversationID, inputID)
	if err != nil {
		return ConversationInputRoutingState{}, err
	}
	state, err := composeConversationInputRoutingState(ctx, reader, dbPath, conversationID, root)
	if err != nil {
		return ConversationInputRoutingState{}, err
	}
	if err := state.Validate(); err != nil {
		return ConversationInputRoutingState{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("validate conversation input routing state %s: %w", root.Accepted.Input.ID, err),
		}
	}
	return state, nil
}

func readConversationInputRoutingStateRoot(
	ctx context.Context,
	reader snapshotReader,
	dbPath string,
	conversationID string,
	inputID string,
) (conversationInputRecord, error) {
	record, found, err := readConversationInputRecord(ctx, reader, inputID, dbPath)
	if err != nil {
		return conversationInputRecord{}, err
	}
	if !found || record.Accepted.Input.ConversationID != conversationID {
		return conversationInputRecord{}, stateConflict("conversation input", inputID, "input was not found in the requested conversation")
	}
	if record.Accepted.Input.ReplyToInputID == nil {
		return record, nil
	}
	root, found, err := readConversationInputRecord(ctx, reader, *record.Accepted.Input.ReplyToInputID, dbPath)
	if err != nil {
		return conversationInputRecord{}, err
	}
	if !found {
		return conversationInputRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("conversation input %s reply root is missing", inputID)}
	}
	return root, nil
}

func composeConversationInputRoutingState(
	ctx context.Context,
	reader snapshotReader,
	dbPath string,
	conversationID string,
	root conversationInputRecord,
) (ConversationInputRoutingState, error) {
	state := ConversationInputRoutingState{
		Input:     root.state(),
		Decisions: []ConversationRouteDecisionRecord{},
	}
	reply, found, err := readConversationInputClarificationReply(
		ctx,
		reader,
		conversationID,
		root.Accepted.Input.ID,
		dbPath,
	)
	if err != nil {
		return ConversationInputRoutingState{}, err
	}
	if found {
		replyState := reply.state()
		state.ClarificationReply = &replyState
	}
	state.Decisions, err = readConversationRouteDecisionRows(ctx, reader, root.Accepted.Input.ID, dbPath)
	if err != nil {
		return ConversationInputRoutingState{}, err
	}
	return state, nil
}

type conversationRouteDecisionRowsQuery interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func readConversationRouteDecisionRows(
	ctx context.Context,
	query conversationRouteDecisionRowsQuery,
	inputID string,
	dbPath string,
) ([]ConversationRouteDecisionRecord, error) {
	rows, err := query.QueryContext(ctx, `
SELECT stream_sequence, id, conversation_id, input_id, clarification_input_id,
       routing_attempt, router_context_json, resolved_invocation_json,
       route_decision_json, resulting_command_json, resulting_command_key, decided_at
FROM conversation_route_decisions
WHERE input_id = ?
ORDER BY stream_sequence
`, inputID)
	if err != nil {
		return nil, fmt.Errorf("read conversation route decisions for %s: %w", inputID, err)
	}
	defer rows.Close()
	decisions := []ConversationRouteDecisionRecord{}
	for rows.Next() {
		record, err := scanConversationRouteDecision(rows, dbPath)
		if err != nil {
			return nil, err
		}
		decisions = append(decisions, record)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read conversation route decisions for %s: %w", inputID, err)
	}
	return decisions, nil
}

type conversationRouteDecisionScanner interface {
	Scan(...any) error
}

func readConversationRouteDecisionOrdinal(
	ctx context.Context,
	query conversationInputQuery,
	conversationID string,
	inputID string,
	ordinal int,
	dbPath string,
) (ConversationRouteDecisionRecord, bool, error) {
	row := query.QueryRowContext(ctx, `
SELECT stream_sequence, id, conversation_id, input_id, clarification_input_id,
       routing_attempt, router_context_json, resolved_invocation_json,
       route_decision_json, resulting_command_json, resulting_command_key, decided_at
FROM conversation_route_decisions
WHERE conversation_id = ? AND input_id = ? AND decision_ordinal = ?
`, conversationID, inputID, ordinal)
	record, err := scanConversationRouteDecision(row, dbPath)
	if errors.Is(err, sql.ErrNoRows) {
		return ConversationRouteDecisionRecord{}, false, nil
	}
	return record, err == nil, err
}

func readConversationRouteDecisionID(
	ctx context.Context,
	query conversationInputQuery,
	decisionID string,
	dbPath string,
) (ConversationRouteDecisionRecord, bool, error) {
	row := query.QueryRowContext(ctx, `
SELECT stream_sequence, id, conversation_id, input_id, clarification_input_id,
       routing_attempt, router_context_json, resolved_invocation_json,
       route_decision_json, resulting_command_json, resulting_command_key, decided_at
FROM conversation_route_decisions
WHERE id = ?
`, decisionID)
	record, err := scanConversationRouteDecision(row, dbPath)
	if errors.Is(err, sql.ErrNoRows) {
		return ConversationRouteDecisionRecord{}, false, nil
	}
	return record, err == nil, err
}

func equalConversationRouteDecisionCommit(
	record ConversationRouteDecisionRecord,
	commit ConversationRouteDecisionCommit,
) bool {
	return record.ID == commit.ID &&
		record.ConversationID == commit.ConversationID &&
		record.InputID == commit.InputID &&
		equalOptionalString(record.ClarificationInputID, commit.ClarificationInputID) &&
		record.RoutingAttempt == commit.RoutingAttempt &&
		reflect.DeepEqual(record.RouterContext, commit.RouterContext) &&
		reflect.DeepEqual(record.ResolvedInvocation, commit.ResolvedInvocation) &&
		reflect.DeepEqual(record.Decision, commit.Decision) &&
		reflect.DeepEqual(record.ResultingCommand, commit.ResultingCommand) &&
		record.DecidedAt == commit.DecidedAt
}

func scanConversationRouteDecision(
	scanner conversationRouteDecisionScanner,
	dbPath string,
) (ConversationRouteDecisionRecord, error) {
	var record ConversationRouteDecisionRecord
	var clarificationInputID sql.NullString
	var routerContextJSON string
	var resolvedInvocationJSON string
	var decisionJSON string
	var commandJSON string
	var commandKey string
	if err := scanner.Scan(
		&record.StreamSequence,
		&record.ID,
		&record.ConversationID,
		&record.InputID,
		&clarificationInputID,
		&record.RoutingAttempt,
		&routerContextJSON,
		&resolvedInvocationJSON,
		&decisionJSON,
		&commandJSON,
		&commandKey,
		&record.DecidedAt,
	); err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	record.ClarificationInputID = optionalScannedString(clarificationInputID)
	if err := decodeStrictConversationRouteJSON(
		"conversation route context audit",
		routerContextJSON,
		&record.RouterContext,
	); err != nil {
		return ConversationRouteDecisionRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("decode conversation route context %s: %w", record.ID, err)}
	}
	if err := decodeStrictConversationRouteJSON(
		"conversation route resolved invocation",
		resolvedInvocationJSON,
		&record.ResolvedInvocation,
	); err != nil {
		return ConversationRouteDecisionRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("decode conversation route invocation %s: %w", record.ID, err)}
	}
	if err := decodeConversationRouteJSON(decisionJSON, &record.Decision); err != nil {
		return ConversationRouteDecisionRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("decode conversation route decision %s: %w", record.ID, err)}
	}
	if err := decodeConversationRouteJSON(commandJSON, &record.ResultingCommand); err != nil {
		return ConversationRouteDecisionRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("decode conversation route command %s: %w", record.ID, err)}
	}
	if err := record.Validate(); err != nil {
		return ConversationRouteDecisionRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("validate conversation route decision %s: %w", record.ID, err)}
	}
	expectedCommandKey, err := conversationRouteCommandKey(ConversationRouteDecisionCommit{
		ID:               record.ID,
		ResultingCommand: record.ResultingCommand,
	})
	if err != nil {
		return ConversationRouteDecisionRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("validate conversation route command key %s: %w", record.ID, err)}
	}
	if commandKey != expectedCommandKey {
		return ConversationRouteDecisionRecord{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("conversation route decision %s command key does not match its command", record.ID),
		}
	}
	return record, nil
}

func decodeStrictConversationRouteJSON(
	label string,
	encoded string,
	target any,
) error {
	if err := jsonio.DecodeSingle(strings.NewReader(encoded), target); err != nil {
		return fmt.Errorf("decode %s: %w", label, err)
	}
	return nil
}

func decodeConversationRouteJSON(encoded string, target any) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(encoded), &fields); err != nil {
		return err
	}
	if fields == nil {
		return errors.New("conversation route JSON must be an object")
	}
	for _, field := range []string{
		"kind",
		"sendToParent",
		"queueParentTurn",
		"steerParentTurn",
		"answerAsNarrator",
		"createSideConversation",
		"forkConversation",
		"escalateToMaster",
		"clarify",
	} {
		if _, found := fields[field]; !found {
			return fmt.Errorf("conversation route JSON is missing field %s", field)
		}
	}
	return jsonio.DecodeSingle(strings.NewReader(encoded), target)
}

func readOldestPendingConversationInput(
	ctx context.Context,
	query conversationInputQuery,
	conversationID string,
	dbPath string,
) (conversationInputRecord, bool, error) {
	var inputID string
	err := query.QueryRowContext(ctx, `
SELECT id
FROM conversation_inputs
WHERE conversation_id = ?
  AND reply_to_input_id IS NULL
  AND status <> ?
  AND NOT (
    status = ?
    AND COALESCE(json_extract(failure_json, '$.retryable'), 1) = 0
    AND COALESCE(json_extract(failure_json, '$.code'), '') = ?
  )
ORDER BY sequence
LIMIT 1
`,
		conversationID,
		ConversationInputStatusDispatched,
		ConversationInputStatusFailed,
		ConversationInputDiscardedFailureCode,
	).Scan(&inputID)
	if errors.Is(err, sql.ErrNoRows) {
		return conversationInputRecord{}, false, nil
	}
	if err != nil {
		return conversationInputRecord{}, false, fmt.Errorf("read oldest pending conversation input: %w", err)
	}
	return readConversationInputRecord(ctx, query, inputID, dbPath)
}

func readConversationInputClarificationReply(
	ctx context.Context,
	query conversationInputQuery,
	conversationID string,
	inputID string,
	dbPath string,
) (conversationInputRecord, bool, error) {
	var replyID string
	err := query.QueryRowContext(ctx, `
SELECT id
FROM conversation_inputs
WHERE conversation_id = ? AND reply_to_input_id = ?
LIMIT 1
`, conversationID, inputID).Scan(&replyID)
	if errors.Is(err, sql.ErrNoRows) {
		return conversationInputRecord{}, false, nil
	}
	if err != nil {
		return conversationInputRecord{}, false, fmt.Errorf("read conversation input clarification reply: %w", err)
	}
	return readConversationInputRecord(ctx, query, replyID, dbPath)
}

func appendConversationInputRoutingEvent(
	transaction *WriteTransaction,
	conversationID string,
	eventID string,
	kind string,
	payload any,
	committedAt string,
) error {
	streamID, err := ConversationInputStreamID(conversationID)
	if err != nil {
		return err
	}
	_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          eventID,
		StreamID:    streamID,
		Kind:        kind,
		Payload:     payload,
		CommittedAt: committedAt,
	})
	return err
}

func conversationInputRoutingEventID(action string, inputID string, attempt int) string {
	return "conversation-input-routing-" + action + ":" + inputID + ":" + strconv.Itoa(attempt)
}

func conversationRouteWorkingStatus(status ConversationStatus) bool {
	return status == ConversationStatusWorking || status == ConversationStatusWaitingForApproval
}

func readConversationRouteRunningTurnID(ctx context.Context, tx *sql.Tx, conversationID string) (string, error) {
	var turnID string
	err := tx.QueryRowContext(ctx, `
SELECT id
FROM conversation_turns
WHERE conversation_id = ? AND status = ?
`, conversationID, TurnStatusRunning).Scan(&turnID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", stateConflict("conversation", conversationID, "active conversation has no running turn")
	}
	if err != nil {
		return "", fmt.Errorf("read conversation route running turn: %w", err)
	}
	return turnID, nil
}

func requireConversationRouteQueueCapacity(ctx context.Context, tx *sql.Tx, conversationID string) error {
	var queued int
	if err := tx.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM conversation_queue
WHERE conversation_id = ?
`, conversationID).Scan(&queued); err != nil {
		return fmt.Errorf("read conversation route queue capacity: %w", err)
	}
	if queued >= MaxSnapshotQueuedTurns {
		return stateConflict(
			"conversation",
			conversationID,
			fmt.Sprintf("queue is limited to %d turns", MaxSnapshotQueuedTurns),
		)
	}
	return nil
}

func requireConversationRouteCompletedTurn(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
	turnID string,
) error {
	var status TurnStatus
	err := tx.QueryRowContext(ctx, `
SELECT status
FROM conversation_turns
WHERE id = ? AND conversation_id = ?
`, turnID, conversationID).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return stateConflict("conversation turn", turnID, "fork point was not found in the parent conversation")
	}
	if err != nil {
		return fmt.Errorf("read conversation route fork point: %w", err)
	}
	if status != TurnStatusCompleted {
		return stateConflict("conversation turn", turnID, "fork point is not completed")
	}
	return nil
}

func requireConversationRouteSideAvailable(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
) error {
	exists, err := readOpenSideConversationForParent(ctx, tx, conversationID)
	if err != nil {
		return fmt.Errorf("read conversation route side state: %w", err)
	}
	if exists {
		return stateConflict("conversation", conversationID, "conversation already has an open side conversation")
	}
	return nil
}

func requireConversationRouteIdentifierAbsent(
	ctx context.Context,
	tx *sql.Tx,
	table string,
	id string,
) error {
	allowed := map[string]bool{
		"conversation_turns": true,
		"side_conversations": true,
		"conversations":      true,
		"master_inputs":      true,
		"trajectory_events":  true,
	}
	if !allowed[table] {
		return fmt.Errorf("unsupported conversation route identifier table %q", table)
	}
	var found int
	err := tx.QueryRowContext(ctx, "SELECT 1 FROM "+table+" WHERE id = ?", id).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspect conversation route command id %s: %w", id, err)
	}
	return stateConflict("conversation route command", id, "command id already exists")
}

func requireConversationRouteSideTurnIdentifierAbsent(
	ctx context.Context,
	tx *sql.Tx,
	turnID string,
) error {
	var found int
	err := tx.QueryRowContext(ctx, `
SELECT 1
FROM side_conversation_events
WHERE turn_id = ?
LIMIT 1
`, turnID).Scan(&found)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspect conversation route side turn id %s: %w", turnID, err)
	}
	return stateConflict("conversation route command", turnID, "side turn id already exists")
}

func requireConversationRouteCommandKeyAbsent(
	ctx context.Context,
	tx *sql.Tx,
	commandKey string,
) error {
	var decisionID string
	err := tx.QueryRowContext(ctx, `
SELECT id
FROM conversation_route_decisions
WHERE resulting_command_key = ?
`, commandKey).Scan(&decisionID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("inspect conversation route command key %s: %w", commandKey, err)
	}
	return stateConflict("conversation route command", commandKey, "command was already reserved by decision "+decisionID)
}

func requireConversationInputRoutingOwner(
	ctx context.Context,
	query conversationInputQuery,
	workspaceID string,
	conversationID string,
) error {
	var storedWorkspaceID sql.NullString
	err := query.QueryRowContext(ctx, `
SELECT workspace_id
FROM conversations
WHERE id = ?
`, conversationID).Scan(&storedWorkspaceID)
	if errors.Is(err, sql.ErrNoRows) ||
		(err == nil && workspaceID != "" && (!storedWorkspaceID.Valid || storedWorkspaceID.String != workspaceID)) {
		return fmt.Errorf("%w: %s", ErrConversationNotFound, conversationID)
	}
	if err != nil {
		return fmt.Errorf("read conversation input routing owner: %w", err)
	}
	return nil
}
