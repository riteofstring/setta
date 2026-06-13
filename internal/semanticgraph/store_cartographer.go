package semanticgraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

func (store *Store) SaveCartographerRun(ctx context.Context, run CartographerRun) (CartographerRun, error) {
	if err := validateCartographerRun(ctx, run); err != nil {
		return CartographerRun{}, err
	}
	inputBundleJSON, err := marshalJSONColumn(run.InputBundle)
	if err != nil {
		return CartographerRun{}, fmt.Errorf("encode cartographer input bundle: %w", err)
	}
	outputSchema, outputSchemaJSON, err := compactRawJSON(run.OutputSchema, "{}")
	if err != nil {
		return CartographerRun{}, fmt.Errorf("encode cartographer output schema: %w", err)
	}
	run.OutputSchema = outputSchema
	inputItemCountsJSON, err := marshalJSONColumn(run.InputItemCounts)
	if err != nil {
		return CartographerRun{}, fmt.Errorf("encode cartographer input item counts: %w", err)
	}
	createdEventIDsJSON, err := marshalJSONColumn(run.CreatedSemanticEventIDs)
	if err != nil {
		return CartographerRun{}, fmt.Errorf("encode cartographer run created semantic event ids: %w", err)
	}
	diagnosticsJSON, err := marshalJSONColumn(run.Diagnostics)
	if err != nil {
		return CartographerRun{}, fmt.Errorf("encode cartographer diagnostics: %w", err)
	}
	_, err = store.db.ExecContext(ctx, `
INSERT INTO semantic_cartographer_runs (
  workspace_id, id, status, trigger_kind, target_entity_id,
  workflow_definition_id, workflow_execution_id, workflow_node_id,
  workflow_node_execution_id, chat_conversation_id, chat_run_id,
  chat_message_id, run_item_id, input_bundle_json, output_schema_json,
  harness_kind, model, request_id, response_id, window_id,
  input_bundle_hash, input_item_counts_json, raw_harness_response_hash,
  trajectory_summary, created_semantic_event_ids_json, diagnostics_json,
  created_at, started_at, completed_at, updated_at, error
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  model = excluded.model,
  request_id = excluded.request_id,
  response_id = excluded.response_id,
  window_id = excluded.window_id,
  input_bundle_hash = excluded.input_bundle_hash,
  input_item_counts_json = excluded.input_item_counts_json,
  raw_harness_response_hash = excluded.raw_harness_response_hash,
  trajectory_summary = excluded.trajectory_summary,
  created_semantic_event_ids_json = excluded.created_semantic_event_ids_json,
  diagnostics_json = excluded.diagnostics_json,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at,
  updated_at = excluded.updated_at,
  error = excluded.error
`,
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
		inputBundleJSON,
		outputSchemaJSON,
		run.HarnessKind,
		run.Model,
		run.RequestID,
		run.ResponseID,
		run.WindowID,
		run.InputBundleHash,
		inputItemCountsJSON,
		run.RawHarnessResponseHash,
		run.TrajectorySummary,
		createdEventIDsJSON,
		diagnosticsJSON,
		run.CreatedAt,
		run.StartedAt,
		run.CompletedAt,
		run.UpdatedAt,
		run.Error,
	)
	if err != nil {
		return CartographerRun{}, store.persistenceError("save cartographer run", err)
	}
	return run, nil
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

func (store *Store) SaveCartographerWindow(ctx context.Context, window CartographerWindow) (CartographerWindow, error) {
	if err := validateCartographerWindow(ctx, window); err != nil {
		return CartographerWindow{}, err
	}
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

func (store *Store) SaveCartographerPatch(ctx context.Context, patch CartographerPatchRecord) (CartographerPatchRecord, error) {
	if err := validateCartographerPatchRecord(ctx, patch); err != nil {
		return CartographerPatchRecord{}, err
	}
	columns, err := cartographerPatchJSONColumns(patch)
	if err != nil {
		return CartographerPatchRecord{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return CartographerPatchRecord{}, store.persistenceError("begin cartographer patch save", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := store.saveCartographerPatchLocked(ctx, tx, patch, columns); err != nil {
		return CartographerPatchRecord{}, err
	}
	if err := store.replaceCartographerValidationDiagnostics(ctx, tx, patch); err != nil {
		return CartographerPatchRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return CartographerPatchRecord{}, store.persistenceError("commit cartographer patch save", err)
	}
	committed = true
	return patch, nil
}

func (store *Store) SaveCartographerPatchesAndAppendEvents(ctx context.Context, patches []CartographerPatchRecord, events []SemanticEvent) ([]SemanticEvent, error) {
	if ctx == nil {
		return nil, errors.New("context is required")
	}
	patchColumns, err := prepareCartographerPatchColumns(ctx, patches)
	if err != nil {
		return nil, err
	}
	prepared, err := prepareOptionalSemanticEventsForAppend(events)
	if err != nil {
		return nil, err
	}
	return store.saveCartographerPatchesAndAppendEvents(ctx, patches, patchColumns, prepared)
}

func (store *Store) saveCartographerPatchesAndAppendEvents(ctx context.Context, patches []CartographerPatchRecord, patchColumns []cartographerPatchColumns, prepared []SemanticEvent) ([]SemanticEvent, error) {
	store.mu.Lock()
	defer store.mu.Unlock()

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, store.persistenceError("begin cartographer patch application", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	for index := range patches {
		if err := store.saveCartographerPatchLocked(ctx, tx, patches[index], patchColumns[index]); err != nil {
			return nil, err
		}
		if err := store.replaceCartographerValidationDiagnostics(ctx, tx, patches[index]); err != nil {
			return nil, err
		}
	}
	if len(prepared) > 0 {
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
	}
	if err := tx.Commit(); err != nil {
		return nil, store.persistenceError("commit cartographer patch application", err)
	}
	committed = true
	return prepared, nil
}

func prepareCartographerPatchColumns(ctx context.Context, patches []CartographerPatchRecord) ([]cartographerPatchColumns, error) {
	if len(patches) == 0 {
		return nil, errors.New("cartographer patches are required")
	}
	columns := make([]cartographerPatchColumns, 0, len(patches))
	for _, patch := range patches {
		if err := validateCartographerPatchRecord(ctx, patch); err != nil {
			return nil, err
		}
		next, err := cartographerPatchJSONColumns(patch)
		if err != nil {
			return nil, err
		}
		columns = append(columns, next)
	}
	return columns, nil
}

func prepareOptionalSemanticEventsForAppend(events []SemanticEvent) ([]SemanticEvent, error) {
	if len(events) == 0 {
		return []SemanticEvent{}, nil
	}
	return prepareSemanticEventsForAppend(events)
}

type cartographerPatchColumns struct {
	patchJSON           string
	validationJSON      string
	applicationJSON     string
	createdEventIDsJSON string
}

func cartographerPatchJSONColumns(patch CartographerPatchRecord) (cartographerPatchColumns, error) {
	patchJSON, err := marshalJSONColumn(patch.Patch)
	if err != nil {
		return cartographerPatchColumns{}, fmt.Errorf("encode cartographer patch: %w", err)
	}
	validationJSON, err := marshalJSONColumn(patch.ValidationResult)
	if err != nil {
		return cartographerPatchColumns{}, fmt.Errorf("encode cartographer validation result: %w", err)
	}
	applicationJSON, err := marshalJSONColumn(patch.ApplicationResult)
	if err != nil {
		return cartographerPatchColumns{}, fmt.Errorf("encode cartographer application result: %w", err)
	}
	createdEventIDsJSON, err := marshalJSONColumn(patch.CreatedSemanticEventIDs)
	if err != nil {
		return cartographerPatchColumns{}, fmt.Errorf("encode cartographer created semantic event ids: %w", err)
	}
	return cartographerPatchColumns{
		patchJSON:           patchJSON,
		validationJSON:      validationJSON,
		applicationJSON:     applicationJSON,
		createdEventIDsJSON: createdEventIDsJSON,
	}, nil
}

func (store *Store) saveCartographerPatchLocked(ctx context.Context, tx *sql.Tx, patch CartographerPatchRecord, columns cartographerPatchColumns) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO semantic_cartographer_patches (
  workspace_id, id, run_id, window_id, status, patch_json,
  validation_result_json, application_result_json,
  created_semantic_event_ids_json, created_at, validated_at, applied_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, id) DO UPDATE SET
  run_id = excluded.run_id,
  window_id = excluded.window_id,
  status = excluded.status,
  patch_json = excluded.patch_json,
  validation_result_json = excluded.validation_result_json,
  application_result_json = excluded.application_result_json,
  created_semantic_event_ids_json = excluded.created_semantic_event_ids_json,
  validated_at = excluded.validated_at,
  applied_at = excluded.applied_at
`,
		patch.WorkspaceID,
		patch.ID,
		patch.RunID,
		patch.WindowID,
		patch.Status,
		columns.patchJSON,
		columns.validationJSON,
		columns.applicationJSON,
		columns.createdEventIDsJSON,
		patch.CreatedAt,
		patch.ValidatedAt,
		patch.AppliedAt,
	)
	if err != nil {
		return store.persistenceError("save cartographer patch", err)
	}
	return nil
}

func (store *Store) replaceCartographerValidationDiagnostics(ctx context.Context, tx *sql.Tx, patch CartographerPatchRecord) error {
	if _, err := tx.ExecContext(ctx, `
DELETE FROM semantic_cartographer_validation_diagnostics
WHERE workspace_id = ? AND patch_id = ?
`, patch.WorkspaceID, patch.ID); err != nil {
		return store.persistenceError("replace cartographer validation diagnostics", err)
	}
	for _, diagnostic := range patch.ValidationResult.Diagnostics {
		if err := insertCartographerDiagnostic(ctx, tx, patch.WorkspaceID, diagnostic); err != nil {
			return err
		}
	}
	return nil
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

const cartographerRunSelectSQL = `
SELECT workspace_id, id, status, trigger_kind, target_entity_id,
       workflow_definition_id, workflow_execution_id, workflow_node_id,
       workflow_node_execution_id, chat_conversation_id, chat_run_id,
       chat_message_id, run_item_id, input_bundle_json, output_schema_json,
       harness_kind, model, request_id, response_id, window_id,
       input_bundle_hash, input_item_counts_json, raw_harness_response_hash,
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

func scanCartographerRun(scanner interface{ Scan(dest ...any) error }) (CartographerRun, error) {
	var run CartographerRun
	var inputBundleJSON string
	var outputSchemaJSON string
	var inputItemCountsJSON string
	var createdEventIDsJSON string
	var diagnosticsJSON string
	if err := scanner.Scan(
		&run.WorkspaceID,
		&run.ID,
		&run.Status,
		&run.TriggerKind,
		&run.TargetEntityID,
		&run.SourceRefs.WorkflowDefinitionID,
		&run.SourceRefs.WorkflowExecutionID,
		&run.SourceRefs.WorkflowNodeID,
		&run.SourceRefs.WorkflowNodeExecutionID,
		&run.SourceRefs.ChatConversationID,
		&run.SourceRefs.ChatRunID,
		&run.SourceRefs.ChatMessageID,
		&run.SourceRefs.RunItemID,
		&inputBundleJSON,
		&outputSchemaJSON,
		&run.HarnessKind,
		&run.Model,
		&run.RequestID,
		&run.ResponseID,
		&run.WindowID,
		&run.InputBundleHash,
		&inputItemCountsJSON,
		&run.RawHarnessResponseHash,
		&run.TrajectorySummary,
		&createdEventIDsJSON,
		&diagnosticsJSON,
		&run.CreatedAt,
		&run.StartedAt,
		&run.CompletedAt,
		&run.UpdatedAt,
		&run.Error,
	); err != nil {
		return CartographerRun{}, err
	}
	if err := unmarshalJSONColumn(inputBundleJSON, &run.InputBundle); err != nil {
		return CartographerRun{}, fmt.Errorf("decode cartographer run input bundle: %w", err)
	}
	run.OutputSchema = rawJSONFromString(outputSchemaJSON)
	if err := unmarshalJSONColumn(inputItemCountsJSON, &run.InputItemCounts); err != nil {
		return CartographerRun{}, fmt.Errorf("decode cartographer run input item counts: %w", err)
	}
	if err := unmarshalJSONColumn(createdEventIDsJSON, &run.CreatedSemanticEventIDs); err != nil {
		return CartographerRun{}, fmt.Errorf("decode cartographer run created semantic event ids: %w", err)
	}
	if err := unmarshalJSONColumn(diagnosticsJSON, &run.Diagnostics); err != nil {
		return CartographerRun{}, fmt.Errorf("decode cartographer run diagnostics: %w", err)
	}
	normalizeCartographerRun(&run)
	return run, nil
}

func scanCartographerWindow(scanner interface{ Scan(dest ...any) error }) (CartographerWindow, error) {
	var window CartographerWindow
	var inputBundleJSON string
	if err := scanner.Scan(
		&window.WorkspaceID,
		&window.ID,
		&window.RunID,
		&window.Status,
		&window.Sequence,
		&window.SourceKind,
		&window.SourceID,
		&window.CursorID,
		&window.SummaryID,
		&inputBundleJSON,
		&window.OpenedAt,
		&window.ClosedAt,
		&window.CreatedAt,
		&window.UpdatedAt,
	); err != nil {
		return CartographerWindow{}, err
	}
	if err := unmarshalJSONColumn(inputBundleJSON, &window.InputBundle); err != nil {
		return CartographerWindow{}, fmt.Errorf("decode cartographer window input bundle: %w", err)
	}
	normalizeCartographerInputBundle(&window.InputBundle)
	return window, nil
}

func scanCartographerCursor(scanner interface{ Scan(dest ...any) error }) (CartographerCursor, error) {
	var cursor CartographerCursor
	var outputOrdinalsJSON string
	if err := scanner.Scan(
		&cursor.WorkspaceID,
		&cursor.ID,
		&cursor.WorkflowExecutionID,
		&cursor.WorkflowNodeExecutionID,
		&cursor.ChatConversationID,
		&cursor.ChatRunID,
		&cursor.LastChatEventStreamID,
		&cursor.LastChatEventSequence,
		&cursor.LastWorkflowEventCursor,
		&outputOrdinalsJSON,
		&cursor.LastWindowID,
		&cursor.UpdatedAt,
	); err != nil {
		return CartographerCursor{}, err
	}
	if err := unmarshalJSONColumn(outputOrdinalsJSON, &cursor.LastOutputOrdinalByRunItem); err != nil {
		return CartographerCursor{}, fmt.Errorf("decode cartographer cursor output ordinals: %w", err)
	}
	normalizeCartographerCursor(&cursor)
	return cursor, nil
}

func scanCartographerTrajectorySummary(scanner interface{ Scan(dest ...any) error }) (CartographerTrajectorySummary, error) {
	var summary CartographerTrajectorySummary
	if err := scanner.Scan(
		&summary.WorkspaceID,
		&summary.ID,
		&summary.RunID,
		&summary.WindowID,
		&summary.SourceKind,
		&summary.SourceID,
		&summary.Summary,
		&summary.SourceRefs.WorkflowDefinitionID,
		&summary.SourceRefs.WorkflowExecutionID,
		&summary.SourceRefs.WorkflowNodeID,
		&summary.SourceRefs.WorkflowNodeExecutionID,
		&summary.SourceRefs.ChatConversationID,
		&summary.SourceRefs.ChatRunID,
		&summary.SourceRefs.ChatMessageID,
		&summary.SourceRefs.RunItemID,
		&summary.ItemCount,
		&summary.CreatedAt,
	); err != nil {
		return CartographerTrajectorySummary{}, err
	}
	return summary, nil
}

func scanCartographerPatchRecord(scanner interface{ Scan(dest ...any) error }) (CartographerPatchRecord, error) {
	var patch CartographerPatchRecord
	var patchJSON string
	var validationJSON string
	var applicationJSON string
	var createdEventIDsJSON string
	if err := scanner.Scan(
		&patch.WorkspaceID,
		&patch.ID,
		&patch.RunID,
		&patch.WindowID,
		&patch.Status,
		&patchJSON,
		&validationJSON,
		&applicationJSON,
		&createdEventIDsJSON,
		&patch.CreatedAt,
		&patch.ValidatedAt,
		&patch.AppliedAt,
	); err != nil {
		return CartographerPatchRecord{}, err
	}
	if err := unmarshalJSONColumn(patchJSON, &patch.Patch); err != nil {
		return CartographerPatchRecord{}, fmt.Errorf("decode cartographer patch: %w", err)
	}
	if err := unmarshalJSONColumn(validationJSON, &patch.ValidationResult); err != nil {
		return CartographerPatchRecord{}, fmt.Errorf("decode cartographer validation result: %w", err)
	}
	if err := unmarshalJSONColumn(applicationJSON, &patch.ApplicationResult); err != nil {
		return CartographerPatchRecord{}, fmt.Errorf("decode cartographer application result: %w", err)
	}
	if err := unmarshalJSONColumn(createdEventIDsJSON, &patch.CreatedSemanticEventIDs); err != nil {
		return CartographerPatchRecord{}, fmt.Errorf("decode cartographer created semantic event ids: %w", err)
	}
	normalizeCartographerPatchRecord(&patch)
	return patch, nil
}

func unmarshalJSONColumn(raw string, target any) error {
	if raw == "" {
		raw = "{}"
	}
	return json.Unmarshal([]byte(raw), target)
}

func normalizeCartographerRun(run *CartographerRun) {
	normalizeCartographerInputBundle(&run.InputBundle)
	if run.CreatedSemanticEventIDs == nil {
		run.CreatedSemanticEventIDs = []string{}
	}
	if run.Diagnostics == nil {
		run.Diagnostics = []CartographerDiagnostic{}
	}
}

func normalizeCartographerCursor(cursor *CartographerCursor) {
	if cursor.LastOutputOrdinalByRunItem == nil {
		cursor.LastOutputOrdinalByRunItem = map[string]int{}
	}
}

func normalizeCartographerPatchRecord(patch *CartographerPatchRecord) {
	if patch.CreatedSemanticEventIDs == nil {
		patch.CreatedSemanticEventIDs = []string{}
	}
	normalizeCartographerPatch(&patch.Patch)
	if patch.ValidationResult.Diagnostics == nil {
		patch.ValidationResult.Diagnostics = []CartographerDiagnostic{}
	}
	if patch.ApplicationResult.CreatedSemanticEventIDs == nil {
		patch.ApplicationResult.CreatedSemanticEventIDs = []string{}
	}
	if patch.ApplicationResult.Diagnostics == nil {
		patch.ApplicationResult.Diagnostics = []CartographerDiagnostic{}
	}
}

func normalizeCartographerPatch(patch *CartographerPatch) {
	if patch.EvidenceRefs == nil {
		patch.EvidenceRefs = []CartographerPatchEvidenceRef{}
	}
	if patch.Payload.EvidenceRefs == nil {
		patch.Payload.EvidenceRefs = []CartographerPatchEvidenceRef{}
	}
	if patch.Payload.NewNodes == nil {
		patch.Payload.NewNodes = []CartographerPatchNewNode{}
	}
	for index := range patch.Payload.NewNodes {
		if patch.Payload.NewNodes[index].EvidenceRefs == nil {
			patch.Payload.NewNodes[index].EvidenceRefs = []CartographerPatchEvidenceRef{}
		}
	}
	if patch.ModelInfo == nil {
		patch.ModelInfo = map[string]string{}
	}
	if patch.Payload.NewNode != nil && patch.Payload.NewNode.EvidenceRefs == nil {
		patch.Payload.NewNode.EvidenceRefs = []CartographerPatchEvidenceRef{}
	}
	if patch.Payload.TargetNode != nil && patch.Payload.TargetNode.EvidenceRefs == nil {
		patch.Payload.TargetNode.EvidenceRefs = []CartographerPatchEvidenceRef{}
	}
}

func normalizeCartographerInputBundle(bundle *CartographerInputBundle) {
	normalizeCartographerWindowCursorMap(&bundle.WindowStartCursor)
	normalizeCartographerWindowCursorMap(&bundle.WindowEndCursor)
	bundle.NewEvents = nonNilSlice(bundle.NewEvents)
	bundle.ToolCalls = nonNilSlice(bundle.ToolCalls)
	bundle.FileChanges = nonNilSlice(bundle.FileChanges)
	bundle.TestResults = nonNilSlice(bundle.TestResults)
	bundle.OutputSummaries = nonNilSlice(bundle.OutputSummaries)
	bundle.ExistingNodes = nonNilSlice(bundle.ExistingNodes)
	bundle.ExistingEdges = nonNilSlice(bundle.ExistingEdges)
	bundle.Evidence = nonNilSlice(bundle.Evidence)
	bundle.Activity = nonNilSlice(bundle.Activity)
	bundle.Steering = nonNilSlice(bundle.Steering)
	bundle.ContextPacks = nonNilSlice(bundle.ContextPacks)
	bundle.TrajectorySummaries = nonNilSlice(bundle.TrajectorySummaries)
	bundle.ObservedEventRefs = nonNilSlice(bundle.ObservedEventRefs)
	bundle.Truncation.Reasons = nonNilSlice(bundle.Truncation.Reasons)
}

func normalizeCartographerWindowCursorMap(cursor *CartographerWindowCursor) {
	cursor.OutputOrdinalByRunItem = nonNilIntMap(cursor.OutputOrdinalByRunItem)
}

func nonNilSlice[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}

func nonNilIntMap(items map[string]int) map[string]int {
	if items == nil {
		return map[string]int{}
	}
	return items
}
