package semanticgraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

func (store *Store) AppendEvent(ctx context.Context, event SemanticEvent) (SemanticEvent, error) {
	if ctx == nil {
		return SemanticEvent{}, errors.New("context is required")
	}
	prepared, err := prepareSemanticEventForAppend(event)
	if err != nil {
		return SemanticEvent{}, err
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	return store.appendEventLocked(ctx, prepared)
}

func (store *Store) AppendEvents(ctx context.Context, events []SemanticEvent) ([]SemanticEvent, error) {
	if ctx == nil {
		return nil, errors.New("context is required")
	}
	prepared, err := prepareSemanticEventsForAppend(events)
	if err != nil {
		return nil, err
	}

	store.mu.Lock()
	defer store.mu.Unlock()

	return store.appendEventsLocked(ctx, prepared)
}

func prepareSemanticEventsForAppend(events []SemanticEvent) ([]SemanticEvent, error) {
	if len(events) == 0 {
		return nil, errors.New("semantic events are required")
	}
	prepared := make([]SemanticEvent, 0, len(events))
	for _, event := range events {
		next, err := prepareSemanticEventForAppend(event)
		if err != nil {
			return nil, err
		}
		prepared = append(prepared, next)
	}
	return prepared, nil
}

func (store *Store) appendEventsLocked(ctx context.Context, prepared []SemanticEvent) ([]SemanticEvent, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, store.persistenceError("begin semantic events transaction", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	nextClock, err := nextSemanticLogicalClock(ctx, tx, prepared[0].WorkspaceID)
	if err != nil {
		return nil, store.persistenceError("read next semantic logical clock", err)
	}
	if err := assignSemanticEventLogicalClocks(prepared, nextClock); err != nil {
		return nil, err
	}
	if err := store.insertSemanticEvents(ctx, tx, prepared); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, store.persistenceError("commit semantic events transaction", err)
	}
	committed = true
	return prepared, nil
}

func assignSemanticEventLogicalClocks(prepared []SemanticEvent, nextClock int) error {
	workspaceID := prepared[0].WorkspaceID
	for index := range prepared {
		if prepared[index].WorkspaceID != workspaceID {
			return fmt.Errorf("semantic events must belong to one workspace")
		}
		if prepared[index].LogicalClock == 0 {
			prepared[index].LogicalClock = nextClock
			nextClock++
		}
	}
	return nil
}

func (store *Store) insertSemanticEvents(ctx context.Context, tx *sql.Tx, prepared []SemanticEvent) error {
	for index := range prepared {
		if err := validateSemanticEventRecord(prepared[index]); err != nil {
			return err
		}
		if err := insertSemanticEvent(ctx, tx, prepared[index]); err != nil {
			return store.persistenceError("append semantic event", err)
		}
		if err := applySemanticEventProjection(ctx, tx, prepared[index]); err != nil {
			return err
		}
	}
	return nil
}

func prepareSemanticEventForAppend(event SemanticEvent) (SemanticEvent, error) {
	if event.ModelInfo == nil {
		event.ModelInfo = map[string]string{}
	}
	payload, _, err := compactRawJSON(event.Payload, "{}")
	if err != nil {
		return SemanticEvent{}, fmt.Errorf("encode semantic event payload: %w", err)
	}
	event.Payload = payload
	if err := validateSemanticEventForAppend(event); err != nil {
		return SemanticEvent{}, err
	}
	return event, nil
}

func (store *Store) appendEventLocked(ctx context.Context, event SemanticEvent) (SemanticEvent, error) {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return SemanticEvent{}, store.persistenceError("begin semantic event transaction", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if event.LogicalClock == 0 {
		clock, err := nextSemanticLogicalClock(ctx, tx, event.WorkspaceID)
		if err != nil {
			return SemanticEvent{}, store.persistenceError("read next semantic logical clock", err)
		}
		event.LogicalClock = clock
	}
	if err := validateSemanticEventRecord(event); err != nil {
		return SemanticEvent{}, err
	}
	if err := insertSemanticEvent(ctx, tx, event); err != nil {
		return SemanticEvent{}, store.persistenceError("append semantic event", err)
	}
	if err := applySemanticEventProjection(ctx, tx, event); err != nil {
		return SemanticEvent{}, err
	}
	if err := tx.Commit(); err != nil {
		return SemanticEvent{}, store.persistenceError("commit semantic event transaction", err)
	}
	committed = true
	return event, nil
}

func nextSemanticLogicalClock(ctx context.Context, tx *sql.Tx, workspaceID string) (int, error) {
	var clock int
	if err := tx.QueryRowContext(ctx, `
SELECT COALESCE(MAX(logical_clock), 0) + 1
FROM semantic_events
WHERE workspace_id = ?
`, workspaceID).Scan(&clock); err != nil {
		return 0, fmt.Errorf("read next semantic logical clock: %w", err)
	}
	return clock, nil
}

func insertSemanticEvent(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payloadJSON := string(event.Payload)
	modelInfoJSON, err := marshalJSONColumn(event.ModelInfo)
	if err != nil {
		return fmt.Errorf("encode semantic event model info: %w", err)
	}
	var confidence sql.NullInt64
	if event.Confidence != nil {
		confidence = sql.NullInt64{Int64: int64(*event.Confidence), Valid: true}
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO semantic_events (
  event_id, workspace_id, session_id, run_id, workflow_execution_id,
  actor_kind, actor_id, event_type, target_entity_id, causation_id,
  correlation_id, trace_id, span_id, logical_clock, observed_at,
  payload_json, model_info_json, confidence, supersedes_event_id,
  retracted_by_event_id
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.EventID,
		event.WorkspaceID,
		event.SessionID,
		event.RunID,
		event.WorkflowExecutionID,
		event.ActorKind,
		event.ActorID,
		event.EventType,
		event.TargetEntityID,
		event.CausationID,
		event.CorrelationID,
		event.TraceID,
		event.SpanID,
		event.LogicalClock,
		event.ObservedAt,
		payloadJSON,
		modelInfoJSON,
		confidence,
		event.SupersedesEventID,
		event.RetractedByEventID,
	)
	if err != nil {
		return fmt.Errorf("insert semantic event: %w", err)
	}
	return nil
}

func (store *Store) RebuildProjections(ctx context.Context) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return store.persistenceError("begin semantic projection rebuild", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := clearSemanticProjections(ctx, tx); err != nil {
		return store.persistenceError("clear semantic projections", err)
	}
	rows, err := tx.QueryContext(ctx, `
SELECT event_id, workspace_id, session_id, run_id, workflow_execution_id,
       actor_kind, actor_id, event_type, target_entity_id, causation_id,
       correlation_id, trace_id, span_id, logical_clock, observed_at,
       payload_json, model_info_json, confidence, supersedes_event_id,
       retracted_by_event_id
FROM semantic_events
ORDER BY workspace_id ASC, logical_clock ASC, stream_sequence ASC
`)
	if err != nil {
		return store.persistenceError("load semantic events for rebuild", err)
	}
	defer rows.Close()
	for rows.Next() {
		event, err := scanSemanticEvent(rows)
		if err != nil {
			return store.corruptError("semantic_events", err)
		}
		if err := applySemanticEventProjection(ctx, tx, event); err != nil {
			return store.corruptError("semantic_events/"+event.EventID, err)
		}
	}
	if err := rows.Err(); err != nil {
		return store.persistenceError("load semantic events for rebuild", err)
	}
	if err := tx.Commit(); err != nil {
		return store.persistenceError("commit semantic projection rebuild", err)
	}
	committed = true
	return nil
}

func clearSemanticProjections(ctx context.Context, tx *sql.Tx) error {
	statements := []string{
		"DELETE FROM semantic_nodes_current",
		"DELETE FROM semantic_edges_current",
		"DELETE FROM semantic_evidence_anchors",
		"DELETE FROM semantic_activity_intervals",
		"DELETE FROM semantic_steering_directives",
		"DELETE FROM semantic_context_pack_history",
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	return clearSemanticSearchIndex(ctx, tx)
}

func scanSemanticEvent(scanner interface{ Scan(dest ...any) error }) (SemanticEvent, error) {
	var event SemanticEvent
	var payloadJSON string
	var modelInfoJSON string
	var confidence sql.NullInt64
	if err := scanner.Scan(
		&event.EventID,
		&event.WorkspaceID,
		&event.SessionID,
		&event.RunID,
		&event.WorkflowExecutionID,
		&event.ActorKind,
		&event.ActorID,
		&event.EventType,
		&event.TargetEntityID,
		&event.CausationID,
		&event.CorrelationID,
		&event.TraceID,
		&event.SpanID,
		&event.LogicalClock,
		&event.ObservedAt,
		&payloadJSON,
		&modelInfoJSON,
		&confidence,
		&event.SupersedesEventID,
		&event.RetractedByEventID,
	); err != nil {
		return SemanticEvent{}, err
	}
	event.Payload = rawJSONFromString(payloadJSON)
	modelInfo, err := modelInfoFromJSON(modelInfoJSON)
	if err != nil {
		return SemanticEvent{}, fmt.Errorf("decode semantic event model info: %w", err)
	}
	event.ModelInfo = modelInfo
	if confidence.Valid {
		value := int(confidence.Int64)
		event.Confidence = &value
	}
	if err := validateSemanticEventRecord(event); err != nil {
		return SemanticEvent{}, err
	}
	var payload any
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return SemanticEvent{}, fmt.Errorf("decode semantic event payload: %w", err)
	}
	return event, nil
}
