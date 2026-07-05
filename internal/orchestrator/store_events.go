package orchestrator

import (
	"context"
	"database/sql"
	"fmt"
)

func (store *Store) AppendWorkflowDefinitionEvent(event WorkflowEvent) (WorkflowEventEnvelope, error) {
	if err := validateWorkflowDefinitionEventRecord(event); err != nil {
		return WorkflowEventEnvelope{}, err
	}
	ctx := context.Background()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return WorkflowEventEnvelope{}, store.persistenceError("begin workflow definition event transaction", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	envelopes, err := store.insertWorkflowEvents(ctx, tx, []WorkflowEvent{event})
	if err != nil {
		return WorkflowEventEnvelope{}, err
	}
	if err := tx.Commit(); err != nil {
		return WorkflowEventEnvelope{}, store.persistenceError("commit workflow definition event transaction", err)
	}
	committed = true
	return envelopes[0], nil
}

func (store *Store) LoadExecutionEventPage(workspaceID string, executionID string, beforeOrdinal int, limit int) (WorkflowExecutionEventPage, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "execution id", executionID); err != nil {
		return WorkflowExecutionEventPage{}, err
	}
	if err := validateWorkflowEventPageBounds(beforeOrdinal, limit); err != nil {
		return WorkflowExecutionEventPage{}, err
	}
	condition, args := workflowEventPageQueryArgs(workspaceID, executionID, beforeOrdinal, limit)
	reversed, err := store.loadWorkflowEventsDescending(condition, args)
	if err != nil {
		return WorkflowExecutionEventPage{}, err
	}
	return workflowExecutionEventPageFromDescending(executionID, reversed, limit), nil
}

func validateWorkflowEventPageBounds(beforeOrdinal int, limit int) error {
	if beforeOrdinal < 0 {
		return fmt.Errorf("workflow event beforeOrdinal must not be negative: %d", beforeOrdinal)
	}
	if limit <= 0 {
		return fmt.Errorf("workflow event page limit must be positive: %d", limit)
	}
	return nil
}

func workflowEventPageQueryArgs(workspaceID string, executionID string, beforeOrdinal int, limit int) (string, []any) {
	condition := "workspace_id = ? AND run_id = ?"
	args := []any{workspaceID, executionID}
	if beforeOrdinal > 0 {
		condition += " AND ordinal < ?"
		args = append(args, beforeOrdinal)
	}
	args = append(args, limit+1)
	return condition, args
}

func (store *Store) loadWorkflowEventsDescending(condition string, args []any) ([]WorkflowEvent, error) {
	rows, err := store.db.QueryContext(context.Background(), fmt.Sprintf(`
SELECT stream_sequence, id, schema_version, workspace_id, definition_id,
       definition_name, definition_version_id, run_id, ordinal, type, node_id,
       node_execution_id, token_id, runner_kind, created_at, message, details_json
FROM workflow_events
WHERE %s
ORDER BY ordinal DESC
LIMIT ?
`, condition), args...)
	if err != nil {
		return nil, store.persistenceError("load workflow execution events", err)
	}
	defer rows.Close()
	reversed := []WorkflowEvent{}
	for rows.Next() {
		_, event, err := scanWorkflowEventEnvelope(rows)
		if err != nil {
			return nil, store.persistenceError("load workflow execution events", err)
		}
		reversed = append(reversed, event)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("load workflow execution events", err)
	}
	return reversed, nil
}

func workflowExecutionEventPageFromDescending(executionID string, reversed []WorkflowEvent, limit int) WorkflowExecutionEventPage {
	hasMoreOlder := len(reversed) > limit
	if hasMoreOlder {
		reversed = reversed[:limit]
	}
	events := make([]WorkflowEvent, len(reversed))
	for index := range reversed {
		events[len(reversed)-1-index] = reversed[index]
	}
	olderBeforeOrdinal := 0
	if len(events) > 0 {
		olderBeforeOrdinal = events[0].Ordinal
	}
	return WorkflowExecutionEventPage{
		ExecutionID:        executionID,
		Events:             events,
		HasMoreOlder:       hasMoreOlder,
		OlderBeforeOrdinal: olderBeforeOrdinal,
	}
}

func (store *Store) LoadWorkflowEventStreamAfter(cursor WorkflowEventCursor) ([]WorkflowEventEnvelope, error) {
	if err := validateWorkflowEventCursor(cursor); err != nil {
		return nil, err
	}
	rows, err := store.db.QueryContext(context.Background(), `
SELECT stream_sequence, id, schema_version, workspace_id, definition_id,
       definition_name, definition_version_id, run_id, ordinal, type, node_id,
       node_execution_id, token_id, runner_kind, created_at, message, details_json
FROM workflow_events
WHERE stream_sequence > ?
ORDER BY stream_sequence ASC
`, cursor.Sequence)
	if err != nil {
		return nil, store.persistenceError("load workflow event stream", err)
	}
	defer rows.Close()
	envelopes := []WorkflowEventEnvelope{}
	for rows.Next() {
		envelope, _, err := scanWorkflowEventEnvelope(rows)
		if err != nil {
			return nil, store.persistenceError("load workflow event stream", err)
		}
		envelopes = append(envelopes, envelope)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("load workflow event stream", err)
	}
	return envelopes, nil
}

func scanWorkflowEventEnvelope(scanner workflowDefinitionScanner) (WorkflowEventEnvelope, WorkflowEvent, error) {
	var sequence int
	var event WorkflowEvent
	var definitionVersionID sql.NullString
	var executionID sql.NullString
	var ordinal sql.NullInt64
	var runnerKind sql.NullString
	var detailsJSON string
	if err := scanner.Scan(
		&sequence,
		&event.ID,
		&event.SchemaVersion,
		&event.WorkspaceID,
		&event.DefinitionID,
		&event.DefinitionName,
		&definitionVersionID,
		&executionID,
		&ordinal,
		&event.Type,
		&event.NodeID,
		&event.NodeExecutionID,
		&event.TokenID,
		&runnerKind,
		&event.CreatedAt,
		&event.Message,
		&detailsJSON,
	); err != nil {
		return WorkflowEventEnvelope{}, WorkflowEvent{}, err
	}
	event.DefinitionVersionID = nullStringValue(definitionVersionID)
	event.ExecutionID = nullStringValue(executionID)
	event.Ordinal = nullIntValue(ordinal)
	event.RunnerKind = actionKindFromNull(runnerKind)
	event.Details = rawJSONFromString(detailsJSON)
	if err := validateEventRecord(event); err != nil {
		return WorkflowEventEnvelope{}, WorkflowEvent{}, err
	}
	envelope := WorkflowEventEnvelope{
		StreamID: WorkflowEventStreamID,
		Sequence: sequence,
		Event:    event,
	}
	return envelope, event, nil
}
