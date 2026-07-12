package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
)

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
	if err := validateConversationInputReference("conversation input routing workspace id", workspaceID); err != nil {
		return ConversationInputRoutingState{}, err
	}
	if err := validateConversationInputReference("conversation input routing conversation id", conversationID); err != nil {
		return ConversationInputRoutingState{}, err
	}
	if err := ValidateConversationInputID(inputID); err != nil {
		return ConversationInputRoutingState{}, err
	}

	var state ConversationInputRoutingState
	err := store.read(ctx, "read conversation input routing state", func(ctx context.Context, reader *sql.Conn) error {
		var readErr error
		state, readErr = readConversationInputRoutingState(
			ctx,
			reader,
			store.dbPath,
			workspaceID,
			conversationID,
			inputID,
		)
		return readErr
	})
	if err != nil {
		return ConversationInputRoutingState{}, err
	}
	return cloneConversationInputRoutingState(state), nil
}

func readConversationInputRoutingState(
	ctx context.Context,
	reader *sql.Conn,
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
	reader *sql.Conn,
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
	reader *sql.Conn,
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
       routing_attempt, source, route_decision_json, resulting_command_json, decided_at
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
       routing_attempt, source, route_decision_json, resulting_command_json, decided_at
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
       routing_attempt, source, route_decision_json, resulting_command_json, decided_at
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
		record.Source == commit.Source &&
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
	var decisionJSON string
	var commandJSON string
	if err := scanner.Scan(
		&record.StreamSequence,
		&record.ID,
		&record.ConversationID,
		&record.InputID,
		&clarificationInputID,
		&record.RoutingAttempt,
		&record.Source,
		&decisionJSON,
		&commandJSON,
		&record.DecidedAt,
	); err != nil {
		return ConversationRouteDecisionRecord{}, err
	}
	record.ClarificationInputID = optionalScannedString(clarificationInputID)
	if err := json.Unmarshal([]byte(decisionJSON), &record.Decision); err != nil {
		return ConversationRouteDecisionRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("decode conversation route decision %s: %w", record.ID, err)}
	}
	if err := json.Unmarshal([]byte(commandJSON), &record.ResultingCommand); err != nil {
		return ConversationRouteDecisionRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("decode conversation route command %s: %w", record.ID, err)}
	}
	if err := record.Validate(); err != nil {
		return ConversationRouteDecisionRecord{}, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("validate conversation route decision %s: %w", record.ID, err)}
	}
	return record, nil
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
    AND json_extract(failure_json, '$.retryable') = 0
  )
ORDER BY sequence
LIMIT 1
`, conversationID, ConversationInputStatusDispatched, ConversationInputStatusFailed).Scan(&inputID)
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

func requireConversationRoutePaneBinding(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
	paneID string,
) error {
	var boundConversationID string
	err := tx.QueryRowContext(ctx, `
SELECT conversation_id
FROM pane_bindings
WHERE pane_id = ?
`, paneID).Scan(&boundConversationID)
	if errors.Is(err, sql.ErrNoRows) {
		return stateConflict("conversation pane", paneID, "originating pane is no longer bound")
	}
	if err != nil {
		return fmt.Errorf("read conversation route pane binding: %w", err)
	}
	if boundConversationID != conversationID {
		return stateConflict("conversation pane", paneID, "originating pane belongs to another conversation")
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

func requireConversationInputRoutingOwner(
	ctx context.Context,
	query conversationInputQuery,
	workspaceID string,
	conversationID string,
) error {
	var storedWorkspaceID string
	err := query.QueryRowContext(ctx, `
SELECT workspace_id
FROM conversations
WHERE id = ?
`, conversationID).Scan(&storedWorkspaceID)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && storedWorkspaceID != workspaceID) {
		return fmt.Errorf("%w: %s", ErrConversationNotFound, conversationID)
	}
	if err != nil {
		return fmt.Errorf("read conversation input routing owner: %w", err)
	}
	return nil
}
