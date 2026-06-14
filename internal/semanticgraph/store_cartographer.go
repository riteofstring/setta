package semanticgraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

func (store *Store) SaveCartographerRun(ctx context.Context, run CartographerRun) (CartographerRun, error) {
	if err := validateCartographerRun(ctx, run); err != nil {
		return CartographerRun{}, err
	}
	normalizeCartographerRun(&run)
	columns, err := prepareCartographerRunJSONColumns(run)
	if err != nil {
		return CartographerRun{}, err
	}
	finalizeCartographerRunAudit(&run, columns)
	_, err = store.db.ExecContext(ctx, saveCartographerRunSQL,
		run.WorkspaceID,
		run.ID,
		run.Status,
		run.TriggerKind,
		run.TargetEntityID,
		run.SourceRefs.WorkflowDefinitionID,
		run.SourceRefs.WorkflowExecutionID,
		run.SourceRefs.WorkflowNodeID,
		run.SourceRefs.WorkflowNodeExecutionID,
		run.SourceRefs.ChatConversationID,
		run.SourceRefs.ChatRunID,
		run.SourceRefs.ChatMessageID,
		run.SourceRefs.RunItemID,
		columns.inputBundleJSON,
		columns.outputSchemaJSON,
		run.HarnessKind,
		run.SettingsHash,
		run.TaskProfile,
		run.RequestedModelSelection,
		run.RequestedModel,
		run.EffectiveModel,
		run.ReportedModel,
		run.RequestedReasoningEffort,
		run.EffectiveReasoningEffort,
		run.ReportedReasoningEffort,
		boolToSQLiteInt(run.ReasoningEffortReported),
		run.RequestID,
		run.ResponseID,
		run.WindowID,
		run.SourceEpochID,
		run.SourceKey,
		run.Priority,
		run.LeaseOwner,
		run.LeaseDeadline,
		run.AttemptCount,
		run.InputBundleHash,
		run.InputBundleBytes,
		run.InputBundleCharacterCount,
		columns.inputItemCountsJSON,
		run.OutputSchemaBytes,
		run.RawHarnessResponseHash,
		run.RawHarnessResponseBytes,
		run.CloseReason,
		run.QueueWaitMS,
		run.HarnessDurationMS,
		run.ValidationDurationMS,
		run.ApplicationDurationMS,
		run.TotalDurationMS,
		run.TrajectorySummary,
		columns.createdEventIDsJSON,
		columns.diagnosticsJSON,
		run.CreatedAt,
		run.StartedAt,
		run.CompletedAt,
		run.UpdatedAt,
		run.Error,
	)
	if err != nil {
		return CartographerRun{}, store.persistenceError("save cartographer run", err)
	}
	run.OutputSchema = columns.outputSchema
	return run, nil
}

type cartographerRunJSONColumns struct {
	inputBundleJSON     string
	outputSchema        json.RawMessage
	outputSchemaJSON    string
	inputItemCountsJSON string
	createdEventIDsJSON string
	diagnosticsJSON     string
}

func prepareCartographerRunJSONColumns(run CartographerRun) (cartographerRunJSONColumns, error) {
	normalizeCartographerRun(&run)
	inputBundleJSON, err := marshalJSONColumn(run.InputBundle)
	if err != nil {
		return cartographerRunJSONColumns{}, fmt.Errorf("encode cartographer input bundle: %w", err)
	}
	outputSchema, outputSchemaJSON, err := compactRawJSON(run.OutputSchema, "{}")
	if err != nil {
		return cartographerRunJSONColumns{}, fmt.Errorf("encode cartographer output schema: %w", err)
	}
	run.InputItemCounts = cartographerInputItemCounts(run.InputBundle)
	inputItemCountsJSON, err := marshalJSONColumn(run.InputItemCounts)
	if err != nil {
		return cartographerRunJSONColumns{}, fmt.Errorf("encode cartographer input item counts: %w", err)
	}
	createdEventIDsJSON, err := marshalJSONColumn(run.CreatedSemanticEventIDs)
	if err != nil {
		return cartographerRunJSONColumns{}, fmt.Errorf("encode cartographer run created semantic event ids: %w", err)
	}
	diagnosticsJSON, err := marshalJSONColumn(run.Diagnostics)
	if err != nil {
		return cartographerRunJSONColumns{}, fmt.Errorf("encode cartographer diagnostics: %w", err)
	}
	return cartographerRunJSONColumns{
		inputBundleJSON:     inputBundleJSON,
		outputSchema:        outputSchema,
		outputSchemaJSON:    outputSchemaJSON,
		inputItemCountsJSON: inputItemCountsJSON,
		createdEventIDsJSON: createdEventIDsJSON,
		diagnosticsJSON:     diagnosticsJSON,
	}, nil
}

func finalizeCartographerRunAudit(run *CartographerRun, columns cartographerRunJSONColumns) {
	run.InputBundleHash = hashBytes([]byte(columns.inputBundleJSON))
	run.InputBundleBytes = len([]byte(columns.inputBundleJSON))
	run.InputBundleCharacterCount = len([]rune(columns.inputBundleJSON))
	run.InputItemCounts = cartographerInputItemCounts(run.InputBundle)
	run.OutputSchemaBytes = len([]byte(columns.outputSchemaJSON))
	if run.CloseReason == "" {
		run.CloseReason = cartographerInputBundleCloseReason(run.InputBundle)
	}
	run.QueueWaitMS = cartographerDurationMillis(run.CreatedAt, run.StartedAt)
	run.TotalDurationMS = cartographerDurationMillis(run.CreatedAt, run.CompletedAt)
}

const saveCartographerRunSQL = `
INSERT INTO semantic_cartographer_runs (
  workspace_id, id, status, trigger_kind, target_entity_id,
  workflow_definition_id, workflow_execution_id, workflow_node_id,
  workflow_node_execution_id, chat_conversation_id, chat_run_id,
  chat_message_id, run_item_id, input_bundle_json, output_schema_json,
  harness_kind, settings_hash, task_profile, requested_model_selection,
  requested_model, effective_model, reported_model, requested_reasoning_effort,
  effective_reasoning_effort, reported_reasoning_effort, reasoning_effort_reported,
  request_id, response_id, window_id,
  source_epoch_id, source_key, priority, lease_owner, lease_deadline,
  attempt_count, input_bundle_hash, input_bundle_bytes, input_bundle_character_count,
  input_item_counts_json, output_schema_bytes, raw_harness_response_hash,
  raw_harness_response_bytes, close_reason, queue_wait_ms, harness_duration_ms,
  validation_duration_ms, application_duration_ms, total_duration_ms, trajectory_summary,
  created_semantic_event_ids_json, diagnostics_json,
  created_at, started_at, completed_at, updated_at, error
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, id) DO UPDATE SET
  status = excluded.status,
  trigger_kind = excluded.trigger_kind,
  target_entity_id = excluded.target_entity_id,
  workflow_definition_id = excluded.workflow_definition_id,
  workflow_execution_id = excluded.workflow_execution_id,
  workflow_node_id = excluded.workflow_node_id,
  workflow_node_execution_id = excluded.workflow_node_execution_id,
  chat_conversation_id = excluded.chat_conversation_id,
  chat_run_id = excluded.chat_run_id,
  chat_message_id = excluded.chat_message_id,
  run_item_id = excluded.run_item_id,
  input_bundle_json = excluded.input_bundle_json,
  output_schema_json = excluded.output_schema_json,
  harness_kind = excluded.harness_kind,
  settings_hash = excluded.settings_hash,
  task_profile = excluded.task_profile,
  requested_model_selection = excluded.requested_model_selection,
  requested_model = excluded.requested_model,
  effective_model = excluded.effective_model,
  reported_model = excluded.reported_model,
  requested_reasoning_effort = excluded.requested_reasoning_effort,
  effective_reasoning_effort = excluded.effective_reasoning_effort,
  reported_reasoning_effort = excluded.reported_reasoning_effort,
  reasoning_effort_reported = excluded.reasoning_effort_reported,
  request_id = excluded.request_id,
  response_id = excluded.response_id,
  window_id = excluded.window_id,
  source_epoch_id = excluded.source_epoch_id,
  source_key = excluded.source_key,
  priority = excluded.priority,
  lease_owner = excluded.lease_owner,
  lease_deadline = excluded.lease_deadline,
  attempt_count = excluded.attempt_count,
  input_bundle_hash = excluded.input_bundle_hash,
  input_bundle_bytes = excluded.input_bundle_bytes,
  input_bundle_character_count = excluded.input_bundle_character_count,
  input_item_counts_json = excluded.input_item_counts_json,
  output_schema_bytes = excluded.output_schema_bytes,
  raw_harness_response_hash = excluded.raw_harness_response_hash,
  raw_harness_response_bytes = excluded.raw_harness_response_bytes,
  close_reason = excluded.close_reason,
  queue_wait_ms = excluded.queue_wait_ms,
  harness_duration_ms = excluded.harness_duration_ms,
  validation_duration_ms = excluded.validation_duration_ms,
  application_duration_ms = excluded.application_duration_ms,
  total_duration_ms = excluded.total_duration_ms,
  trajectory_summary = excluded.trajectory_summary,
  created_semantic_event_ids_json = excluded.created_semantic_event_ids_json,
  diagnostics_json = excluded.diagnostics_json,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at,
  updated_at = excluded.updated_at,
  error = excluded.error
`

func saveCartographerRunLocked(ctx context.Context, tx *sql.Tx, run CartographerRun, columns cartographerRunJSONColumns) error {
	finalizeCartographerRunAudit(&run, columns)
	_, err := tx.ExecContext(ctx, saveCartographerRunSQL,
		run.WorkspaceID,
		run.ID,
		run.Status,
		run.TriggerKind,
		run.TargetEntityID,
		run.SourceRefs.WorkflowDefinitionID,
		run.SourceRefs.WorkflowExecutionID,
		run.SourceRefs.WorkflowNodeID,
		run.SourceRefs.WorkflowNodeExecutionID,
		run.SourceRefs.ChatConversationID,
		run.SourceRefs.ChatRunID,
		run.SourceRefs.ChatMessageID,
		run.SourceRefs.RunItemID,
		columns.inputBundleJSON,
		columns.outputSchemaJSON,
		run.HarnessKind,
		run.SettingsHash,
		run.TaskProfile,
		run.RequestedModelSelection,
		run.RequestedModel,
		run.EffectiveModel,
		run.ReportedModel,
		run.RequestedReasoningEffort,
		run.EffectiveReasoningEffort,
		run.ReportedReasoningEffort,
		boolToSQLiteInt(run.ReasoningEffortReported),
		run.RequestID,
		run.ResponseID,
		run.WindowID,
		run.SourceEpochID,
		run.SourceKey,
		run.Priority,
		run.LeaseOwner,
		run.LeaseDeadline,
		run.AttemptCount,
		run.InputBundleHash,
		run.InputBundleBytes,
		run.InputBundleCharacterCount,
		columns.inputItemCountsJSON,
		run.OutputSchemaBytes,
		run.RawHarnessResponseHash,
		run.RawHarnessResponseBytes,
		run.CloseReason,
		run.QueueWaitMS,
		run.HarnessDurationMS,
		run.ValidationDurationMS,
		run.ApplicationDurationMS,
		run.TotalDurationMS,
		run.TrajectorySummary,
		columns.createdEventIDsJSON,
		columns.diagnosticsJSON,
		run.CreatedAt,
		run.StartedAt,
		run.CompletedAt,
		run.UpdatedAt,
		run.Error,
	)
	return err
}

func (store *Store) ReadCartographerRun(ctx context.Context, workspaceID string, runID string) (CartographerRun, bool, error) {
	if ctx == nil {
		return CartographerRun{}, false, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "cartographer run id", runID); err != nil {
		return CartographerRun{}, false, err
	}
	row := store.db.QueryRowContext(ctx, cartographerRunSelectSQL+`
WHERE workspace_id = ? AND id = ?
`, workspaceID, runID)
	run, err := scanCartographerRun(row)
	if err == nil {
		return run, true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return CartographerRun{}, false, nil
	}
	return CartographerRun{}, false, store.corruptError("semantic_cartographer_runs", err)
}

func (store *Store) ListCartographerRuns(ctx context.Context, filter CartographerRunFilter) (CartographerRunList, error) {
	if err := validateCartographerRunFilter(ctx, filter); err != nil {
		return CartographerRunList{}, err
	}
	filter.Limit = normalizedCartographerLimit(filter.Limit)
	condition, args := cartographerRunFilterCondition(filter)
	args = append(args, filter.Limit)
	rows, err := store.db.QueryContext(ctx, cartographerRunSelectSQL+`
WHERE `+condition+`
ORDER BY updated_at DESC, id DESC
LIMIT ?
`, args...)
	if err != nil {
		return CartographerRunList{}, store.persistenceError("list cartographer runs", err)
	}
	defer rows.Close()
	runs := []CartographerRun{}
	for rows.Next() {
		run, err := scanCartographerRun(rows)
		if err != nil {
			return CartographerRunList{}, store.corruptError("semantic_cartographer_runs", err)
		}
		runs = append(runs, run)
	}
	if err := rows.Err(); err != nil {
		return CartographerRunList{}, store.persistenceError("list cartographer runs", err)
	}
	return CartographerRunList{WorkspaceID: filter.WorkspaceID, Runs: runs, Limit: filter.Limit}, nil
}

func (store *Store) SaveCartographerWindow(ctx context.Context, window CartographerWindow) (CartographerWindow, error) {
	if err := validateCartographerWindow(ctx, window); err != nil {
		return CartographerWindow{}, err
	}
	normalizeCartographerInputBundle(&window.InputBundle)
	inputBundleJSON, err := marshalJSONColumn(window.InputBundle)
	if err != nil {
		return CartographerWindow{}, fmt.Errorf("encode cartographer window input bundle: %w", err)
	}
	_, err = store.db.ExecContext(ctx, `
INSERT INTO semantic_cartographer_windows (
  workspace_id, id, run_id, status, sequence, source_kind, source_id,
  cursor_id, summary_id, input_bundle_json, opened_at, closed_at,
  created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, id) DO UPDATE SET
  run_id = excluded.run_id,
  status = excluded.status,
  sequence = excluded.sequence,
  source_kind = excluded.source_kind,
  source_id = excluded.source_id,
  cursor_id = excluded.cursor_id,
  summary_id = excluded.summary_id,
  input_bundle_json = excluded.input_bundle_json,
  opened_at = excluded.opened_at,
  closed_at = excluded.closed_at,
  updated_at = excluded.updated_at
`,
		window.WorkspaceID,
		window.ID,
		window.RunID,
		window.Status,
		window.Sequence,
		window.SourceKind,
		window.SourceID,
		window.CursorID,
		window.SummaryID,
		inputBundleJSON,
		window.OpenedAt,
		window.ClosedAt,
		window.CreatedAt,
		window.UpdatedAt,
	)
	if err != nil {
		return CartographerWindow{}, store.persistenceError("save cartographer window", err)
	}
	return window, nil
}

func (store *Store) ReadCartographerWindow(ctx context.Context, workspaceID string, windowID string) (CartographerWindow, bool, error) {
	if ctx == nil {
		return CartographerWindow{}, false, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "cartographer window id", windowID); err != nil {
		return CartographerWindow{}, false, err
	}
	row := store.db.QueryRowContext(ctx, cartographerWindowSelectSQL+`
WHERE workspace_id = ? AND id = ?
`, workspaceID, windowID)
	window, err := scanCartographerWindow(row)
	if err == nil {
		return window, true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return CartographerWindow{}, false, nil
	}
	return CartographerWindow{}, false, store.corruptError("semantic_cartographer_windows", err)
}

func (store *Store) ListCartographerWindows(ctx context.Context, filter CartographerWindowFilter) (CartographerWindowList, error) {
	if err := validateCartographerWindowFilter(ctx, filter); err != nil {
		return CartographerWindowList{}, err
	}
	filter.Limit = normalizedCartographerLimit(filter.Limit)
	condition, args := cartographerWindowFilterCondition(filter)
	args = append(args, filter.Limit)
	rows, err := store.db.QueryContext(ctx, cartographerWindowSelectSQL+`
WHERE `+condition+`
ORDER BY updated_at DESC, id DESC
LIMIT ?
`, args...)
	if err != nil {
		return CartographerWindowList{}, store.persistenceError("list cartographer windows", err)
	}
	defer rows.Close()
	windows := []CartographerWindow{}
	for rows.Next() {
		window, err := scanCartographerWindow(rows)
		if err != nil {
			return CartographerWindowList{}, store.corruptError("semantic_cartographer_windows", err)
		}
		windows = append(windows, window)
	}
	if err := rows.Err(); err != nil {
		return CartographerWindowList{}, store.persistenceError("list cartographer windows", err)
	}
	return CartographerWindowList{WorkspaceID: filter.WorkspaceID, Windows: windows, Limit: filter.Limit}, nil
}

func (store *Store) ReadOpenCartographerWindowForCursor(ctx context.Context, workspaceID string, cursorID string) (CartographerWindow, bool, error) {
	if ctx == nil {
		return CartographerWindow{}, false, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "cartographer cursor id", cursorID); err != nil {
		return CartographerWindow{}, false, err
	}
	row := store.db.QueryRowContext(ctx, cartographerWindowSelectSQL+`
WHERE workspace_id = ? AND cursor_id = ? AND status = ?
ORDER BY updated_at DESC, id DESC
LIMIT 1
`, workspaceID, cursorID, CartographerWindowOpen)
	window, err := scanCartographerWindow(row)
	if err == nil {
		return window, true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return CartographerWindow{}, false, nil
	}
	return CartographerWindow{}, false, store.corruptError("semantic_cartographer_windows", err)
}

func (store *Store) ListOpenCartographerWindowsUpdatedBefore(ctx context.Context, cutoff string) ([]CartographerWindow, error) {
	if ctx == nil {
		return nil, errors.New("context is required")
	}
	if err := validateTimestamp("cartographer open window cutoff", cutoff); err != nil {
		return nil, err
	}
	rows, err := store.db.QueryContext(ctx, cartographerWindowSelectSQL+`
WHERE status = ? AND updated_at <= ?
ORDER BY updated_at ASC, id ASC
`, CartographerWindowOpen, cutoff)
	if err != nil {
		return nil, store.persistenceError("list open cartographer windows", err)
	}
	defer rows.Close()
	windows := []CartographerWindow{}
	for rows.Next() {
		window, err := scanCartographerWindow(rows)
		if err != nil {
			return nil, store.corruptError("semantic_cartographer_windows", err)
		}
		windows = append(windows, window)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("list open cartographer windows", err)
	}
	return windows, nil
}

func (store *Store) SaveCartographerCursor(ctx context.Context, cursor CartographerCursor) (CartographerCursor, error) {
	normalizeCartographerCursor(&cursor)
	if err := validateCartographerCursor(ctx, cursor); err != nil {
		return CartographerCursor{}, err
	}
	outputOrdinalsJSON, err := marshalJSONColumn(cursor.LastOutputOrdinalByRunItem)
	if err != nil {
		return CartographerCursor{}, fmt.Errorf("encode cartographer cursor output ordinals: %w", err)
	}
	_, err = store.db.ExecContext(ctx, `
INSERT INTO semantic_cartographer_cursors (
  workspace_id, id, workflow_execution_id, workflow_node_execution_id,
  chat_conversation_id, chat_run_id, last_chat_event_stream_id,
  last_chat_event_sequence, last_workflow_event_cursor,
  last_output_ordinal_by_run_item_json, last_window_id, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, workflow_execution_id, workflow_node_execution_id, chat_conversation_id, chat_run_id) DO UPDATE SET
  id = excluded.id,
  last_chat_event_stream_id = excluded.last_chat_event_stream_id,
  last_chat_event_sequence = excluded.last_chat_event_sequence,
  last_workflow_event_cursor = excluded.last_workflow_event_cursor,
  last_output_ordinal_by_run_item_json = excluded.last_output_ordinal_by_run_item_json,
  last_window_id = excluded.last_window_id,
  updated_at = excluded.updated_at
`,
		cursor.WorkspaceID,
		cursor.ID,
		cursor.WorkflowExecutionID,
		cursor.WorkflowNodeExecutionID,
		cursor.ChatConversationID,
		cursor.ChatRunID,
		cursor.LastChatEventStreamID,
		cursor.LastChatEventSequence,
		cursor.LastWorkflowEventCursor,
		outputOrdinalsJSON,
		cursor.LastWindowID,
		cursor.UpdatedAt,
	)
	if err != nil {
		return CartographerCursor{}, store.persistenceError("save cartographer cursor", err)
	}
	return cursor, nil
}

func (store *Store) ReadCartographerCursor(ctx context.Context, key CartographerCursorKey) (CartographerCursor, bool, error) {
	if ctx == nil {
		return CartographerCursor{}, false, errors.New("context is required")
	}
	if err := validateCartographerCursorKey(ctx, key); err != nil {
		return CartographerCursor{}, false, err
	}
	row := store.db.QueryRowContext(ctx, cartographerCursorSelectSQL+`
WHERE workspace_id = ? AND workflow_execution_id = ? AND workflow_node_execution_id = ?
  AND chat_conversation_id = ? AND chat_run_id = ?
`, key.WorkspaceID, key.WorkflowExecutionID, key.WorkflowNodeExecutionID, key.ChatConversationID, key.ChatRunID)
	cursor, err := scanCartographerCursor(row)
	if err == nil {
		return cursor, true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return CartographerCursor{}, false, nil
	}
	return CartographerCursor{}, false, store.corruptError("semantic_cartographer_cursors", err)
}

func (store *Store) ListCartographerCursors(ctx context.Context, filter CartographerCursorFilter) (CartographerCursorList, error) {
	if err := validateCartographerCursorFilter(ctx, filter); err != nil {
		return CartographerCursorList{}, err
	}
	filter.Limit = normalizedCartographerLimit(filter.Limit)
	condition, args := cartographerCursorFilterCondition(filter)
	args = append(args, filter.Limit)
	rows, err := store.db.QueryContext(ctx, cartographerCursorSelectSQL+`
WHERE `+condition+`
ORDER BY updated_at DESC, id DESC
LIMIT ?
`, args...)
	if err != nil {
		return CartographerCursorList{}, store.persistenceError("list cartographer cursors", err)
	}
	defer rows.Close()
	cursors := []CartographerCursor{}
	for rows.Next() {
		cursor, err := scanCartographerCursor(rows)
		if err != nil {
			return CartographerCursorList{}, store.corruptError("semantic_cartographer_cursors", err)
		}
		cursors = append(cursors, cursor)
	}
	if err := rows.Err(); err != nil {
		return CartographerCursorList{}, store.persistenceError("list cartographer cursors", err)
	}
	return CartographerCursorList{WorkspaceID: filter.WorkspaceID, Cursors: cursors, Limit: filter.Limit}, nil
}

func (store *Store) SaveCartographerTrajectorySummary(ctx context.Context, summary CartographerTrajectorySummary) (CartographerTrajectorySummary, error) {
	if err := validateCartographerTrajectorySummary(ctx, summary); err != nil {
		return CartographerTrajectorySummary{}, err
	}
	_, err := store.db.ExecContext(ctx, `
INSERT INTO semantic_cartographer_trajectory_summaries (
  workspace_id, id, run_id, window_id, source_kind, source_id, summary,
  workflow_definition_id, workflow_execution_id, workflow_node_id,
  workflow_node_execution_id, chat_conversation_id, chat_run_id,
  chat_message_id, run_item_id, item_count, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, id) DO UPDATE SET
  run_id = excluded.run_id,
  window_id = excluded.window_id,
  source_kind = excluded.source_kind,
  source_id = excluded.source_id,
  summary = excluded.summary,
  workflow_definition_id = excluded.workflow_definition_id,
  workflow_execution_id = excluded.workflow_execution_id,
  workflow_node_id = excluded.workflow_node_id,
  workflow_node_execution_id = excluded.workflow_node_execution_id,
  chat_conversation_id = excluded.chat_conversation_id,
  chat_run_id = excluded.chat_run_id,
  chat_message_id = excluded.chat_message_id,
  run_item_id = excluded.run_item_id,
  item_count = excluded.item_count
`,
		summary.WorkspaceID,
		summary.ID,
		summary.RunID,
		summary.WindowID,
		summary.SourceKind,
		summary.SourceID,
		summary.Summary,
		summary.SourceRefs.WorkflowDefinitionID,
		summary.SourceRefs.WorkflowExecutionID,
		summary.SourceRefs.WorkflowNodeID,
		summary.SourceRefs.WorkflowNodeExecutionID,
		summary.SourceRefs.ChatConversationID,
		summary.SourceRefs.ChatRunID,
		summary.SourceRefs.ChatMessageID,
		summary.SourceRefs.RunItemID,
		summary.ItemCount,
		summary.CreatedAt,
	)
	if err != nil {
		return CartographerTrajectorySummary{}, store.persistenceError("save cartographer trajectory summary", err)
	}
	return summary, nil
}

func (store *Store) ReadCartographerTrajectorySummary(ctx context.Context, workspaceID string, summaryID string) (CartographerTrajectorySummary, bool, error) {
	if ctx == nil {
		return CartographerTrajectorySummary{}, false, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "cartographer summary id", summaryID); err != nil {
		return CartographerTrajectorySummary{}, false, err
	}
	row := store.db.QueryRowContext(ctx, cartographerSummarySelectSQL+`
WHERE workspace_id = ? AND id = ?
`, workspaceID, summaryID)
	summary, err := scanCartographerTrajectorySummary(row)
	if err == nil {
		return summary, true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return CartographerTrajectorySummary{}, false, nil
	}
	return CartographerTrajectorySummary{}, false, store.corruptError("semantic_cartographer_trajectory_summaries", err)
}

func (store *Store) ListCartographerTrajectorySummaries(ctx context.Context, workspaceID string, sourceKind CartographerSourceKind, sourceID string, limit int) ([]CartographerTrajectorySummary, error) {
	if err := validateCartographerSource(ctx, workspaceID, sourceKind, sourceID); err != nil {
		return nil, err
	}
	if limit <= 0 {
		return []CartographerTrajectorySummary{}, nil
	}
	rows, err := store.db.QueryContext(ctx, cartographerSummarySelectSQL+`
WHERE workspace_id = ? AND source_kind = ? AND source_id = ?
ORDER BY created_at DESC, id DESC
LIMIT ?
`, workspaceID, sourceKind, sourceID, limit)
	if err != nil {
		return nil, store.persistenceError("list cartographer trajectory summaries", err)
	}
	defer rows.Close()
	reversed := []CartographerTrajectorySummary{}
	for rows.Next() {
		summary, err := scanCartographerTrajectorySummary(rows)
		if err != nil {
			return nil, store.corruptError("semantic_cartographer_trajectory_summaries", err)
		}
		reversed = append(reversed, summary)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("list cartographer trajectory summaries", err)
	}
	summaries := make([]CartographerTrajectorySummary, len(reversed))
	for index := range reversed {
		summaries[len(reversed)-1-index] = reversed[index]
	}
	return summaries, nil
}

func (store *Store) ReadCartographerPatch(ctx context.Context, workspaceID string, patchID string) (CartographerPatchRecord, bool, error) {
	if ctx == nil {
		return CartographerPatchRecord{}, false, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "cartographer patch id", patchID); err != nil {
		return CartographerPatchRecord{}, false, err
	}
	row := store.db.QueryRowContext(ctx, cartographerPatchSelectSQL+`
WHERE workspace_id = ? AND id = ?
`, workspaceID, patchID)
	patch, err := scanCartographerPatchRecord(row)
	if err == nil {
		return patch, true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return CartographerPatchRecord{}, false, nil
	}
	return CartographerPatchRecord{}, false, store.corruptError("semantic_cartographer_patches", err)
}

func (store *Store) ListCartographerPatches(ctx context.Context, filter CartographerPatchFilter) (CartographerPatchList, error) {
	if err := validateCartographerPatchFilter(ctx, filter); err != nil {
		return CartographerPatchList{}, err
	}
	filter.Limit = normalizedCartographerLimit(filter.Limit)
	condition, args := cartographerPatchFilterCondition(filter)
	rows, err := store.db.QueryContext(ctx, cartographerPatchSelectSQL+`
WHERE `+condition+`
ORDER BY created_at DESC, id DESC
`, args...)
	if err != nil {
		return CartographerPatchList{}, store.persistenceError("list cartographer patches", err)
	}
	defer rows.Close()
	patches := []CartographerPatchRecord{}
	for rows.Next() {
		patch, err := scanCartographerPatchRecord(rows)
		if err != nil {
			return CartographerPatchList{}, store.corruptError("semantic_cartographer_patches", err)
		}
		if filter.SemanticTargetID != "" && !cartographerPatchTargetsSemanticEntity(patch.Patch, filter.SemanticTargetID) {
			continue
		}
		patches = append(patches, patch)
		if len(patches) >= filter.Limit {
			break
		}
	}
	if err := rows.Err(); err != nil {
		return CartographerPatchList{}, store.persistenceError("list cartographer patches", err)
	}
	return CartographerPatchList{WorkspaceID: filter.WorkspaceID, Patches: patches, Limit: filter.Limit}, nil
}

func insertCartographerDiagnostic(ctx context.Context, tx *sql.Tx, workspaceID string, diagnostic CartographerDiagnostic) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO semantic_cartographer_validation_diagnostics (
  workspace_id, id, run_id, patch_id, severity, code, message, path, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, workspaceID, diagnostic.ID, diagnostic.RunID, diagnostic.PatchID, diagnostic.Severity, diagnostic.Code, diagnostic.Message, diagnostic.Path, diagnostic.CreatedAt)
	if err != nil {
		return fmt.Errorf("record cartographer validation diagnostic: %w", err)
	}
	return nil
}

func validateCartographerRunFilter(ctx context.Context, filter CartographerRunFilter) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", filter.WorkspaceID); err != nil {
		return err
	}
	return validateOptionalStoreIDs([]optionalStoreID{
		{label: "cartographer run workflow execution id", value: filter.WorkflowExecutionID},
		{label: "cartographer run chat run id", value: filter.ChatRunID},
		{label: "cartographer run target entity id", value: filter.TargetEntityID},
	})
}

func validateCartographerWindowFilter(ctx context.Context, filter CartographerWindowFilter) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", filter.WorkspaceID); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "cartographer window run id", value: filter.RunID},
		{label: "cartographer window source id", value: filter.SourceID},
		{label: "cartographer window workflow execution id", value: filter.WorkflowExecutionID},
		{label: "cartographer window chat run id", value: filter.ChatRunID},
	}); err != nil {
		return err
	}
	if filter.SourceKind != "" && !isCartographerSourceKind(filter.SourceKind) {
		return fmt.Errorf("cartographer source kind is unsupported: %s", filter.SourceKind)
	}
	return nil
}

func validateCartographerCursorFilter(ctx context.Context, filter CartographerCursorFilter) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", filter.WorkspaceID); err != nil {
		return err
	}
	return validateOptionalStoreIDs([]optionalStoreID{
		{label: "cartographer cursor workflow execution id", value: filter.WorkflowExecutionID},
		{label: "cartographer cursor chat run id", value: filter.ChatRunID},
	})
}

func validateCartographerPatchFilter(ctx context.Context, filter CartographerPatchFilter) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", filter.WorkspaceID); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "cartographer patch run id", value: filter.RunID},
		{label: "cartographer patch semantic target id", value: filter.SemanticTargetID},
	}); err != nil {
		return err
	}
	if filter.Status != "" && !isCartographerPatchStatus(filter.Status) {
		return fmt.Errorf("cartographer patch status is unsupported: %s", filter.Status)
	}
	return nil
}

func normalizedCartographerLimit(limit int) int {
	if limit <= 0 || limit > defaultSemanticPageLimit {
		return defaultSemanticPageLimit
	}
	return limit
}

func cartographerRunFilterCondition(filter CartographerRunFilter) (string, []any) {
	clauses := []string{"workspace_id = ?"}
	args := []any{filter.WorkspaceID}
	addStringFilter(&clauses, &args, "workflow_execution_id", filter.WorkflowExecutionID)
	addStringFilter(&clauses, &args, "chat_run_id", filter.ChatRunID)
	addStringFilter(&clauses, &args, "target_entity_id", filter.TargetEntityID)
	return strings.Join(clauses, " AND "), args
}

func cartographerWindowFilterCondition(filter CartographerWindowFilter) (string, []any) {
	clauses := []string{"workspace_id = ?"}
	args := []any{filter.WorkspaceID}
	addStringFilter(&clauses, &args, "run_id", filter.RunID)
	sourceKind := filter.SourceKind
	sourceID := filter.SourceID
	if sourceKind == "" && filter.WorkflowExecutionID != "" {
		sourceKind = CartographerSourceWorkflowExecution
		sourceID = filter.WorkflowExecutionID
	}
	if sourceKind == "" && filter.ChatRunID != "" {
		sourceKind = CartographerSourceChatRun
		sourceID = filter.ChatRunID
	}
	if sourceKind != "" {
		clauses = append(clauses, "source_kind = ?")
		args = append(args, sourceKind)
	}
	addStringFilter(&clauses, &args, "source_id", sourceID)
	return strings.Join(clauses, " AND "), args
}

func cartographerCursorFilterCondition(filter CartographerCursorFilter) (string, []any) {
	clauses := []string{"workspace_id = ?"}
	args := []any{filter.WorkspaceID}
	addStringFilter(&clauses, &args, "workflow_execution_id", filter.WorkflowExecutionID)
	addStringFilter(&clauses, &args, "chat_run_id", filter.ChatRunID)
	return strings.Join(clauses, " AND "), args
}

func cartographerPatchFilterCondition(filter CartographerPatchFilter) (string, []any) {
	clauses := []string{"workspace_id = ?"}
	args := []any{filter.WorkspaceID}
	addStringFilter(&clauses, &args, "run_id", filter.RunID)
	if filter.Status != "" {
		clauses = append(clauses, "status = ?")
		args = append(args, filter.Status)
	}
	return strings.Join(clauses, " AND "), args
}

func addStringFilter(clauses *[]string, args *[]any, column string, value string) {
	if value == "" {
		return
	}
	*clauses = append(*clauses, column+" = ?")
	*args = append(*args, value)
}

func cartographerPatchTargetsSemanticEntity(patch CartographerPatch, entityID string) bool {
	payload := patch.Payload
	if patchTargetFieldMatches(entityID,
		payload.SemanticNodeID,
		payload.TargetEntityID,
		payload.FromNodeID,
		payload.ToNodeID,
		payload.SourceNodeID,
		payload.ResolutionNodeID,
	) {
		return true
	}
	if payload.NewNode != nil && payload.NewNode.SemanticNodeID == entityID {
		return true
	}
	if payload.TargetNode != nil && payload.TargetNode.SemanticNodeID == entityID {
		return true
	}
	for _, node := range payload.NewNodes {
		if node.SemanticNodeID == entityID {
			return true
		}
	}
	for _, nodeID := range payload.SourceNodeIDs {
		if nodeID == entityID {
			return true
		}
	}
	return false
}

func patchTargetFieldMatches(target string, values ...string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

const cartographerRunSelectSQL = `
SELECT workspace_id, id, status, trigger_kind, target_entity_id,
       workflow_definition_id, workflow_execution_id, workflow_node_id,
       workflow_node_execution_id, chat_conversation_id, chat_run_id,
       chat_message_id, run_item_id, input_bundle_json, output_schema_json,
       harness_kind, settings_hash, task_profile, requested_model_selection,
       requested_model, effective_model, reported_model, requested_reasoning_effort,
       effective_reasoning_effort, reported_reasoning_effort, reasoning_effort_reported,
       request_id, response_id, window_id,
       source_epoch_id, source_key, priority, lease_owner, lease_deadline,
       attempt_count, input_bundle_hash, input_bundle_bytes, input_bundle_character_count,
       input_item_counts_json, output_schema_bytes, raw_harness_response_hash,
       raw_harness_response_bytes, close_reason, queue_wait_ms, harness_duration_ms,
       validation_duration_ms, application_duration_ms, total_duration_ms,
       trajectory_summary, created_semantic_event_ids_json, diagnostics_json,
       created_at, started_at, completed_at, updated_at, error
FROM semantic_cartographer_runs
`

const cartographerWindowSelectSQL = `
SELECT workspace_id, id, run_id, status, sequence, source_kind, source_id,
       cursor_id, summary_id, input_bundle_json, opened_at, closed_at,
       created_at, updated_at
FROM semantic_cartographer_windows
`

const cartographerCursorSelectSQL = `
SELECT workspace_id, id, workflow_execution_id, workflow_node_execution_id,
       chat_conversation_id, chat_run_id, last_chat_event_stream_id,
       last_chat_event_sequence, last_workflow_event_cursor,
       last_output_ordinal_by_run_item_json, last_window_id, updated_at
FROM semantic_cartographer_cursors
`

const cartographerSummarySelectSQL = `
SELECT workspace_id, id, run_id, window_id, source_kind, source_id, summary,
       workflow_definition_id, workflow_execution_id, workflow_node_id,
       workflow_node_execution_id, chat_conversation_id, chat_run_id,
       chat_message_id, run_item_id, item_count, created_at
FROM semantic_cartographer_trajectory_summaries
`

const cartographerPatchSelectSQL = `
SELECT workspace_id, id, run_id, window_id, status, patch_json,
       validation_result_json, application_result_json,
       created_semantic_event_ids_json, created_at, validated_at, applied_at
FROM semantic_cartographer_patches
`
