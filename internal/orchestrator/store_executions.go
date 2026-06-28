package orchestrator

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

func (store *Store) PersistTransition(transition WorkflowTransition) ([]WorkflowEventEnvelope, error) {
	if err := validateExecutionSnapshot(transition.Execution); err != nil {
		return nil, err
	}
	if len(transition.Events) == 0 {
		return nil, errors.New("workflow transition must include event records")
	}
	if err := validateTransitionEvents(transition); err != nil {
		return nil, err
	}
	ctx := context.Background()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, store.persistenceError("begin workflow transition transaction", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	previousOrdinal, err := store.currentRunEventOrdinal(ctx, tx, transition.Execution.ID)
	if err != nil {
		return nil, err
	}
	if transition.Execution.LastEventOrdinal != previousOrdinal+len(transition.Events) {
		return nil, fmt.Errorf("workflow execution %s last event ordinal %d does not follow stored ordinal %d and %d new events", transition.Execution.ID, transition.Execution.LastEventOrdinal, previousOrdinal, len(transition.Events))
	}
	if err := store.replaceExecutionMaterializedState(ctx, tx, transition.Execution); err != nil {
		return nil, err
	}
	envelopes, err := store.insertWorkflowEvents(ctx, tx, transition.Events)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, store.persistenceError("commit workflow transition transaction", err)
	}
	committed = true
	return envelopes, nil
}

func validateTransitionEvents(transition WorkflowTransition) error {
	previousOrdinal := transition.Execution.LastEventOrdinal - len(transition.Events)
	for index, event := range transition.Events {
		if err := validateEventRecord(event); err != nil {
			return err
		}
		if event.WorkspaceID != transition.Execution.WorkspaceID ||
			event.ExecutionID != transition.Execution.ID ||
			event.DefinitionID != transition.Execution.DefinitionID ||
			event.DefinitionVersionID != transition.Execution.DefinitionVersionID {
			return fmt.Errorf("workflow event %s ownership does not match execution %s", event.ID, transition.Execution.ID)
		}
		expectedOrdinal := previousOrdinal + index + 1
		if event.Ordinal != expectedOrdinal {
			return fmt.Errorf("workflow event %s ordinal = %d, want contiguous ordinal %d", event.ID, event.Ordinal, expectedOrdinal)
		}
	}
	return nil
}

func (store *Store) currentRunEventOrdinal(ctx context.Context, tx *sql.Tx, executionID string) (int, error) {
	var ordinal int
	err := tx.QueryRowContext(ctx, `
SELECT last_event_ordinal
FROM workflow_runs
WHERE id = ?
`, executionID).Scan(&ordinal)
	if err == nil {
		return ordinal, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return 0, nil
	}
	return 0, store.persistenceError("read workflow run event ordinal", err)
}

func (store *Store) replaceExecutionMaterializedState(ctx context.Context, tx *sql.Tx, execution WorkflowExecution) error {
	if err := store.upsertWorkflowRun(ctx, tx, execution); err != nil {
		return err
	}
	if err := store.deleteExecutionChildren(ctx, tx, execution.ID); err != nil {
		return err
	}
	for _, nodeExecution := range execution.NodeExecutions {
		if err := store.insertNodeExecution(ctx, tx, execution, nodeExecution); err != nil {
			return err
		}
	}
	for _, token := range execution.Tokens {
		if err := store.insertWorkflowToken(ctx, tx, execution, token); err != nil {
			return err
		}
	}
	for _, loop := range execution.LoopIterations {
		if err := store.insertWorkflowLoopCounter(ctx, tx, execution, loop); err != nil {
			return err
		}
	}
	return nil
}

func (store *Store) upsertWorkflowRun(ctx context.Context, tx *sql.Tx, execution WorkflowExecution) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO workflow_runs (
  id, schema_version, workspace_id, definition_id, definition_version_id,
  status, terminal_reason, recovery_outcome, created_at, started_at, updated_at, completed_at,
  error, last_event_ordinal
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  schema_version = excluded.schema_version,
  workspace_id = excluded.workspace_id,
  definition_id = excluded.definition_id,
  definition_version_id = excluded.definition_version_id,
  status = excluded.status,
  terminal_reason = excluded.terminal_reason,
  recovery_outcome = excluded.recovery_outcome,
  created_at = excluded.created_at,
  started_at = excluded.started_at,
  updated_at = excluded.updated_at,
  completed_at = excluded.completed_at,
  error = excluded.error,
  last_event_ordinal = excluded.last_event_ordinal
`,
		execution.ID,
		execution.SchemaVersion,
		execution.WorkspaceID,
		execution.DefinitionID,
		execution.DefinitionVersionID,
		execution.Status,
		nullableWorkflowTerminalReason(execution.TerminalReason),
		nullableRunnerRecoveryOutcome(execution.RecoveryOutcome),
		execution.CreatedAt,
		execution.StartedAt,
		execution.UpdatedAt,
		nullableString(execution.CompletedAt),
		execution.Error,
		execution.LastEventOrdinal,
	)
	if err != nil {
		return store.persistenceError("save workflow run", err)
	}
	return nil
}

func (store *Store) deleteExecutionChildren(ctx context.Context, tx *sql.Tx, executionID string) error {
	statements := []string{
		"DELETE FROM workflow_node_attempts WHERE run_id = ?",
		"DELETE FROM workflow_tokens WHERE run_id = ?",
		"DELETE FROM workflow_loop_counters WHERE run_id = ?",
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement, executionID); err != nil {
			return store.persistenceError("replace workflow run materialized state", err)
		}
	}
	return nil
}

func (store *Store) insertNodeExecution(ctx context.Context, tx *sql.Tx, execution WorkflowExecution, nodeExecution WorkflowNodeExecution) error {
	row, err := workflowNodeAttemptRowFromExecution(execution, nodeExecution)
	if err != nil {
		return err
	}
	if err := store.insertWorkflowNodeAttemptRow(ctx, tx, row); err != nil {
		return err
	}
	return store.insertNodeExecutionChildren(ctx, tx, execution, nodeExecution)
}

func (store *Store) insertNodeExecutionChildren(ctx context.Context, tx *sql.Tx, execution WorkflowExecution, nodeExecution WorkflowNodeExecution) error {
	if nodeExecution.RunnerState != nil {
		if err := store.insertRunnerState(ctx, tx, execution, *nodeExecution.RunnerState); err != nil {
			return err
		}
	}
	for _, ref := range nodeExecution.RunnerRefs {
		if err := store.insertRunnerRef(ctx, tx, execution, nodeExecution, ref); err != nil {
			return err
		}
	}
	for _, ref := range nodeExecution.ActivityRefs {
		if err := store.insertActivityRef(ctx, tx, ref); err != nil {
			return err
		}
	}
	if nodeExecution.Result != nil && nodeExecution.Result.PendingApproval != nil {
		if err := store.insertPendingApproval(ctx, tx, execution, nodeExecution, nodeExecution.Result.PendingApproval); err != nil {
			return err
		}
	}
	return nil
}

func (store *Store) insertRunnerState(ctx context.Context, tx *sql.Tx, execution WorkflowExecution, state WorkflowRunnerState) error {
	opaqueStateJSON, err := compactRawJSON(state.OpaqueState, "{}")
	if err != nil {
		return fmt.Errorf("encode workflow runner state: %w", err)
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO workflow_runner_state (
  node_execution_id, schema_version, workspace_id, run_id, runner_kind, status,
  last_runner_event_ordinal, opaque_state_json, recovery_token, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		state.NodeExecutionID,
		state.SchemaVersion,
		state.WorkspaceID,
		execution.ID,
		state.RunnerKind,
		state.Status,
		state.LastRunnerEventOrdinal,
		opaqueStateJSON,
		state.RecoveryToken,
		state.CreatedAt,
		state.UpdatedAt,
	)
	if err != nil {
		return store.persistenceError("save workflow runner state", err)
	}
	return nil
}

func (store *Store) insertRunnerRef(ctx context.Context, tx *sql.Tx, execution WorkflowExecution, nodeExecution WorkflowNodeExecution, ref WorkflowActionRunnerRef) error {
	createdAt := nodeExecution.StartedAt
	if createdAt == "" {
		createdAt = execution.UpdatedAt
	}
	_, err := tx.ExecContext(ctx, `
INSERT INTO workflow_runner_refs (node_execution_id, kind, ref, created_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(node_execution_id, kind) DO UPDATE SET
  ref = excluded.ref,
  created_at = excluded.created_at
`,
		nodeExecution.ID,
		ref.Kind,
		ref.ID,
		createdAt,
	)
	if err != nil {
		return store.persistenceError("save workflow runner ref", err)
	}
	return nil
}

func (store *Store) insertActivityRef(ctx context.Context, tx *sql.Tx, ref WorkflowActivityRef) error {
	metadataJSON, err := compactRawJSON(ref.Metadata, "{}")
	if err != nil {
		return fmt.Errorf("encode workflow activity ref metadata: %w", err)
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO workflow_activity_refs (
  id, schema_version, workspace_id, run_id, node_execution_id, kind, ref,
  start_cursor, end_cursor, metadata_json, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		ref.ID,
		ref.SchemaVersion,
		ref.WorkspaceID,
		ref.ExecutionID,
		ref.NodeExecutionID,
		ref.Kind,
		ref.Ref,
		ref.StartCursor,
		ref.EndCursor,
		metadataJSON,
		ref.CreatedAt,
		ref.UpdatedAt,
	)
	if err != nil {
		return store.persistenceError("save workflow activity ref", err)
	}
	return nil
}

func (store *Store) insertPendingApproval(ctx context.Context, tx *sql.Tx, execution WorkflowExecution, nodeExecution WorkflowNodeExecution, pending *WorkflowPendingApproval) error {
	requestJSON, err := marshalJSONColumn(pending.Approval)
	if err != nil {
		return fmt.Errorf("encode workflow approval request: %w", err)
	}
	sideEffectPolicyJSON := "{}"
	if nodeExecution.SideEffectPolicy != nil {
		sideEffectPolicyJSON, err = marshalJSONColumn(*nodeExecution.SideEffectPolicy)
		if err != nil {
			return fmt.Errorf("encode workflow approval side-effect policy: %w", err)
		}
	}
	runnerKind, _ := nodeExecutionRunnerKind(nodeExecution)
	_, err = tx.ExecContext(ctx, `
INSERT INTO workflow_approvals (
  id, schema_version, workspace_id, run_id, node_execution_id, node_id,
  runner_kind, status, approval_kind, request_json, response_json,
  side_effect_policy_json, created_at, resolved_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		pending.ApprovalID,
		SchemaVersion,
		execution.WorkspaceID,
		execution.ID,
		nodeExecution.ID,
		nodeExecution.NodeID,
		runnerKind,
		pending.Approval.Status,
		RunnerApprovalKind(pending.Approval.Kind),
		requestJSON,
		nullableString(pending.Approval.Response),
		sideEffectPolicyJSON,
		pending.Approval.CreatedAt,
		nullableString(pending.Approval.ResolvedAt),
	)
	if err != nil {
		return store.persistenceError("save workflow approval", err)
	}
	return nil
}

func (store *Store) insertWorkflowToken(ctx context.Context, tx *sql.Tx, execution WorkflowExecution, token WorkflowToken) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO workflow_tokens (
  id, schema_version, workspace_id, run_id, node_id, source_node_id,
  edge_id, iteration, status, created_at, completed_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		token.ID,
		token.SchemaVersion,
		execution.WorkspaceID,
		execution.ID,
		token.NodeID,
		token.SourceNodeID,
		token.EdgeID,
		token.Iteration,
		token.Status,
		token.CreatedAt,
		nullableString(token.CompletedAt),
	)
	if err != nil {
		return store.persistenceError("save workflow token", err)
	}
	return nil
}

func (store *Store) insertWorkflowLoopCounter(ctx context.Context, tx *sql.Tx, execution WorkflowExecution, loop WorkflowLoopIteration) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO workflow_loop_counters (workspace_id, run_id, node_id, count)
VALUES (?, ?, ?, ?)
`,
		execution.WorkspaceID,
		execution.ID,
		loop.NodeID,
		loop.Count,
	)
	if err != nil {
		return store.persistenceError("save workflow loop counter", err)
	}
	return nil
}

func (store *Store) insertWorkflowEvents(ctx context.Context, tx *sql.Tx, events []WorkflowEvent) ([]WorkflowEventEnvelope, error) {
	envelopes := make([]WorkflowEventEnvelope, 0, len(events))
	for _, event := range events {
		detailsJSON, err := compactRawJSON(event.Details, "{}")
		if err != nil {
			return nil, fmt.Errorf("encode workflow event details: %w", err)
		}
		_, err = tx.ExecContext(ctx, `
INSERT INTO workflow_run_events (
  id, schema_version, workspace_id, definition_id, definition_version_id,
  run_id, ordinal, type, node_id, node_execution_id, token_id, runner_kind,
  created_at, message, details_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
			event.ID,
			event.SchemaVersion,
			event.WorkspaceID,
			event.DefinitionID,
			event.DefinitionVersionID,
			event.ExecutionID,
			event.Ordinal,
			event.Type,
			event.NodeID,
			event.NodeExecutionID,
			event.TokenID,
			runnerKindString(event.RunnerKind),
			event.CreatedAt,
			event.Message,
			detailsJSON,
		)
		if err != nil {
			return nil, store.persistenceError("append workflow event", err)
		}
		var sequence int
		if err := tx.QueryRowContext(ctx, `
SELECT stream_sequence
FROM workflow_run_events
WHERE id = ?
`, event.ID).Scan(&sequence); err != nil {
			return nil, store.persistenceError("read workflow event stream sequence", err)
		}
		envelopes = append(envelopes, WorkflowEventEnvelope{
			StreamID: WorkflowEventStreamID,
			Sequence: sequence,
			Event:    event,
		})
	}
	return envelopes, nil
}

func runnerKindString(kind *WorkflowActionKind) string {
	if kind == nil {
		return ""
	}
	return string(*kind)
}

func (store *Store) LoadExecution(workspaceID string, executionID string) (WorkflowExecution, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "execution id", executionID); err != nil {
		return WorkflowExecution{}, err
	}
	execution, err := store.loadExecution(workspaceID, executionID)
	if err != nil {
		return WorkflowExecution{}, err
	}
	return execution, nil
}

func (store *Store) loadExecution(workspaceID string, executionID string) (WorkflowExecution, error) {
	row := store.db.QueryRowContext(context.Background(), `
SELECT schema_version, id, workspace_id, definition_id, definition_version_id,
       status, terminal_reason, recovery_outcome, created_at, started_at, updated_at,
       completed_at, error, last_event_ordinal
FROM workflow_runs
WHERE workspace_id = ? AND id = ?
`, workspaceID, executionID)
	execution, err := store.scanWorkflowRun(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return WorkflowExecution{}, store.persistenceError("read workflow execution", err)
		}
		return WorkflowExecution{}, store.persistenceError("read workflow execution", err)
	}
	if err := store.loadExecutionChildren(&execution); err != nil {
		return WorkflowExecution{}, err
	}
	if err := validateExecutionSnapshot(execution); err != nil {
		return WorkflowExecution{}, store.corruptError("workflow_runs/"+executionID, err)
	}
	return execution, nil
}

func (store *Store) ActiveExecutionForDefinition(workspaceID string, definitionID string) (WorkflowExecution, bool, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "definition id", definitionID); err != nil {
		return WorkflowExecution{}, false, err
	}
	var executionID string
	err := store.db.QueryRowContext(context.Background(), `
SELECT id
FROM workflow_runs
WHERE workspace_id = ? AND definition_id = ? AND status = ?
ORDER BY started_at DESC, id ASC
LIMIT 1
`, workspaceID, definitionID, ExecutionStatusRunning).Scan(&executionID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return WorkflowExecution{}, false, nil
		}
		return WorkflowExecution{}, false, store.persistenceError("read active workflow execution", err)
	}
	execution, err := store.loadExecution(workspaceID, executionID)
	if err != nil {
		return WorkflowExecution{}, false, err
	}
	return execution, true, nil
}

func (store *Store) ListExecutionSummariesForDefinition(workspaceID string, definitionID string, limit int) ([]WorkflowExecutionSummary, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "definition id", definitionID); err != nil {
		return nil, err
	}
	if limit < 0 {
		return nil, fmt.Errorf("workflow execution summary limit must not be negative: %d", limit)
	}
	query := `
SELECT runs.id, runs.workspace_id, runs.definition_id, runs.definition_version_id,
       versions.version_number, runs.status, runs.terminal_reason, runs.started_at,
       runs.updated_at, runs.completed_at, runs.last_event_ordinal
FROM workflow_runs runs
JOIN workflow_versions versions ON versions.id = runs.definition_version_id
WHERE runs.workspace_id = ? AND runs.definition_id = ?
ORDER BY runs.started_at DESC, runs.id ASC
`
	args := []any{workspaceID, definitionID}
	if limit > 0 {
		query += "LIMIT ?\n"
		args = append(args, limit)
	}
	rows, err := store.db.QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, store.persistenceError("list workflow execution summaries", err)
	}
	defer rows.Close()
	summaries := []WorkflowExecutionSummary{}
	for rows.Next() {
		summary, err := scanWorkflowExecutionSummary(rows)
		if err != nil {
			return nil, store.persistenceError("list workflow execution summaries", err)
		}
		summaries = append(summaries, summary)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("list workflow execution summaries", err)
	}
	return summaries, nil
}

func (store *Store) ListExecutions(workspaceID string) ([]WorkflowExecution, error) {
	if err := validateStorageID("workspace id", workspaceID); err != nil {
		return nil, err
	}
	rows, err := store.db.QueryContext(context.Background(), `
SELECT id
FROM workflow_runs
WHERE workspace_id = ?
ORDER BY started_at DESC, id ASC
`, workspaceID)
	if err != nil {
		return nil, store.persistenceError("list workflow executions", err)
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, store.persistenceError("list workflow executions", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("list workflow executions", err)
	}
	executions := make([]WorkflowExecution, 0, len(ids))
	for _, id := range ids {
		execution, err := store.loadExecution(workspaceID, id)
		if err != nil {
			return nil, err
		}
		executions = append(executions, execution)
	}
	return executions, nil
}

func scanWorkflowExecutionSummary(scanner workflowDefinitionScanner) (WorkflowExecutionSummary, error) {
	var summary WorkflowExecutionSummary
	var terminalReason sql.NullString
	var completedAt sql.NullString
	if err := scanner.Scan(
		&summary.ID,
		&summary.WorkspaceID,
		&summary.DefinitionID,
		&summary.DefinitionVersionID,
		&summary.DefinitionVersionNumber,
		&summary.Status,
		&terminalReason,
		&summary.StartedAt,
		&summary.UpdatedAt,
		&completedAt,
		&summary.LastEventOrdinal,
	); err != nil {
		return WorkflowExecutionSummary{}, err
	}
	summary.TerminalReason = workflowTerminalReasonFromNull(terminalReason)
	summary.CompletedAt = stringFromNull(completedAt)
	if err := validateWorkflowExecutionSummary(summary); err != nil {
		return WorkflowExecutionSummary{}, err
	}
	return summary, nil
}

func (store *Store) WorkspaceIDs() ([]string, error) {
	rows, err := store.db.QueryContext(context.Background(), `
SELECT workspace_id
FROM workflow_versions
UNION
SELECT workspace_id
FROM workflow_runs
ORDER BY workspace_id ASC
`)
	if err != nil {
		return nil, store.persistenceError("list workflow workspaces", err)
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, store.persistenceError("list workflow workspaces", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("list workflow workspaces", err)
	}
	return ids, nil
}

func (store *Store) scanWorkflowRun(scanner workflowDefinitionScanner) (WorkflowExecution, error) {
	var execution WorkflowExecution
	var terminalReason sql.NullString
	var recoveryOutcome sql.NullString
	var completedAt sql.NullString
	if err := scanner.Scan(
		&execution.SchemaVersion,
		&execution.ID,
		&execution.WorkspaceID,
		&execution.DefinitionID,
		&execution.DefinitionVersionID,
		&execution.Status,
		&terminalReason,
		&recoveryOutcome,
		&execution.CreatedAt,
		&execution.StartedAt,
		&execution.UpdatedAt,
		&completedAt,
		&execution.Error,
		&execution.LastEventOrdinal,
	); err != nil {
		return WorkflowExecution{}, err
	}
	execution.TerminalReason = workflowTerminalReasonFromNull(terminalReason)
	execution.RecoveryOutcome = runnerRecoveryOutcomeFromNull(recoveryOutcome)
	execution.CompletedAt = stringFromNull(completedAt)
	execution.NodeExecutions = []WorkflowNodeExecution{}
	execution.Tokens = []WorkflowToken{}
	execution.LoopIterations = []WorkflowLoopIteration{}
	execution.ActiveNodeExecutionIDs = []string{}
	return execution, nil
}

func (store *Store) loadExecutionChildren(execution *WorkflowExecution) error {
	nodeExecutions, err := store.loadNodeExecutions(execution.WorkspaceID, execution.ID)
	if err != nil {
		return err
	}
	for index := range nodeExecutions {
		if err := store.loadNodeExecutionChildren(&nodeExecutions[index]); err != nil {
			return err
		}
	}
	tokens, err := store.loadWorkflowTokens(execution.WorkspaceID, execution.ID)
	if err != nil {
		return err
	}
	loops, err := store.loadWorkflowLoopCounters(execution.WorkspaceID, execution.ID)
	if err != nil {
		return err
	}
	execution.NodeExecutions = nodeExecutions
	execution.Tokens = tokens
	execution.LoopIterations = loops
	refreshActiveNodeExecutionIDs(execution)
	return nil
}

func (store *Store) loadNodeExecutions(workspaceID string, executionID string) ([]WorkflowNodeExecution, error) {
	rows, err := store.db.QueryContext(context.Background(), `
SELECT schema_version, id, run_id, node_id, attempt, iteration, status,
       action_kind, runner_kind, idempotency_key, input_hash, input_json,
       action_policy_json, side_effect_policy_json, runner_capabilities_json,
       scheduled_at, started_at, completed_at, result_json, error,
       recovery_outcome, recovery_message
FROM workflow_node_attempts
WHERE workspace_id = ? AND run_id = ?
ORDER BY rowid ASC
`, workspaceID, executionID)
	if err != nil {
		return nil, store.persistenceError("load workflow node attempts", err)
	}
	defer rows.Close()
	nodeExecutions := []WorkflowNodeExecution{}
	for rows.Next() {
		nodeExecution, err := scanWorkflowNodeExecution(rows)
		if err != nil {
			return nil, store.persistenceError("load workflow node attempts", err)
		}
		nodeExecutions = append(nodeExecutions, nodeExecution)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("load workflow node attempts", err)
	}
	return nodeExecutions, nil
}

func scanWorkflowNodeExecution(scanner workflowDefinitionScanner) (WorkflowNodeExecution, error) {
	var nodeExecution WorkflowNodeExecution
	var actionKind sql.NullString
	var runnerKind sql.NullString
	var inputJSON string
	var actionPolicyJSON sql.NullString
	var sideEffectPolicyJSON string
	var runnerCapabilitiesJSON sql.NullString
	var startedAt sql.NullString
	var completedAt sql.NullString
	var resultJSON sql.NullString
	var recoveryOutcome sql.NullString
	if err := scanner.Scan(
		&nodeExecution.SchemaVersion,
		&nodeExecution.ID,
		&nodeExecution.ExecutionID,
		&nodeExecution.NodeID,
		&nodeExecution.Attempt,
		&nodeExecution.Iteration,
		&nodeExecution.Status,
		&actionKind,
		&runnerKind,
		&nodeExecution.IdempotencyKey,
		&nodeExecution.InputHash,
		&inputJSON,
		&actionPolicyJSON,
		&sideEffectPolicyJSON,
		&runnerCapabilitiesJSON,
		&nodeExecution.ScheduledAt,
		&startedAt,
		&completedAt,
		&resultJSON,
		&nodeExecution.Error,
		&recoveryOutcome,
		&nodeExecution.RecoveryMessage,
	); err != nil {
		return WorkflowNodeExecution{}, err
	}
	nodeExecution.ActionKind = actionKindFromNull(actionKind)
	nodeExecution.RunnerKind = actionKindFromNull(runnerKind)
	nodeExecution.Input = rawJSONFromString(inputJSON)
	nodeExecution.StartedAt = stringFromNull(startedAt)
	nodeExecution.CompletedAt = stringFromNull(completedAt)
	if actionPolicyJSON.Valid {
		var policy WorkflowActionPolicy
		if err := json.Unmarshal([]byte(actionPolicyJSON.String), &policy); err != nil {
			return WorkflowNodeExecution{}, fmt.Errorf("decode workflow action policy: %w", err)
		}
		nodeExecution.ActionPolicy = &policy
	}
	if sideEffectPolicyJSON != "{}" {
		var policy SideEffectPolicy
		if err := json.Unmarshal([]byte(sideEffectPolicyJSON), &policy); err != nil {
			return WorkflowNodeExecution{}, fmt.Errorf("decode workflow side-effect policy: %w", err)
		}
		nodeExecution.SideEffectPolicy = &policy
	}
	if runnerCapabilitiesJSON.Valid {
		var capabilities RunnerCapabilities
		if err := json.Unmarshal([]byte(runnerCapabilitiesJSON.String), &capabilities); err != nil {
			return WorkflowNodeExecution{}, fmt.Errorf("decode workflow runner capabilities: %w", err)
		}
		nodeExecution.RunnerCapabilities = &capabilities
	}
	if resultJSON.Valid {
		var result WorkflowActionResult
		if err := json.Unmarshal([]byte(resultJSON.String), &result); err != nil {
			return WorkflowNodeExecution{}, fmt.Errorf("decode workflow action result: %w", err)
		}
		nodeExecution.Result = &result
	}
	nodeExecution.RunnerRefs = []WorkflowActionRunnerRef{}
	nodeExecution.ActivityRefs = []WorkflowActivityRef{}
	nodeExecution.RecoveryOutcome = runnerRecoveryOutcomeFromNull(recoveryOutcome)
	return nodeExecution, nil
}

func (store *Store) loadNodeExecutionChildren(nodeExecution *WorkflowNodeExecution) error {
	runnerState, err := store.loadRunnerState(nodeExecution.ID)
	if err != nil {
		return err
	}
	nodeExecution.RunnerState = runnerState
	refs, err := store.loadRunnerRefs(nodeExecution.ID)
	if err != nil {
		return err
	}
	nodeExecution.RunnerRefs = refs
	activityRefs, err := store.loadActivityRefs(nodeExecution.ID)
	if err != nil {
		return err
	}
	nodeExecution.ActivityRefs = activityRefs
	return nil
}

func (store *Store) loadRunnerState(nodeExecutionID string) (*WorkflowRunnerState, error) {
	row := store.db.QueryRowContext(context.Background(), `
SELECT schema_version, workspace_id, run_id, node_execution_id, runner_kind,
       status, last_runner_event_ordinal, opaque_state_json, recovery_token,
       created_at, updated_at
FROM workflow_runner_state
WHERE node_execution_id = ?
`, nodeExecutionID)
	var state WorkflowRunnerState
	var opaqueStateJSON string
	err := row.Scan(
		&state.SchemaVersion,
		&state.WorkspaceID,
		&state.ExecutionID,
		&state.NodeExecutionID,
		&state.RunnerKind,
		&state.Status,
		&state.LastRunnerEventOrdinal,
		&opaqueStateJSON,
		&state.RecoveryToken,
		&state.CreatedAt,
		&state.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, store.persistenceError("load workflow runner state", err)
	}
	state.OpaqueState = rawJSONFromString(opaqueStateJSON)
	return &state, nil
}

func (store *Store) loadRunnerRefs(nodeExecutionID string) ([]WorkflowActionRunnerRef, error) {
	rows, err := store.db.QueryContext(context.Background(), `
SELECT kind, ref
FROM workflow_runner_refs
WHERE node_execution_id = ?
ORDER BY rowid ASC
`, nodeExecutionID)
	if err != nil {
		return nil, store.persistenceError("load workflow runner refs", err)
	}
	defer rows.Close()
	refs := []WorkflowActionRunnerRef{}
	for rows.Next() {
		var ref WorkflowActionRunnerRef
		if err := rows.Scan(&ref.Kind, &ref.ID); err != nil {
			return nil, store.persistenceError("load workflow runner refs", err)
		}
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("load workflow runner refs", err)
	}
	return refs, nil
}

func (store *Store) loadActivityRefs(nodeExecutionID string) ([]WorkflowActivityRef, error) {
	rows, err := store.db.QueryContext(context.Background(), `
SELECT schema_version, id, workspace_id, run_id, node_execution_id, kind,
       ref, start_cursor, end_cursor, metadata_json, created_at, updated_at
FROM workflow_activity_refs
WHERE node_execution_id = ?
ORDER BY rowid ASC
`, nodeExecutionID)
	if err != nil {
		return nil, store.persistenceError("load workflow activity refs", err)
	}
	defer rows.Close()
	refs := []WorkflowActivityRef{}
	for rows.Next() {
		var ref WorkflowActivityRef
		var metadataJSON string
		if err := rows.Scan(
			&ref.SchemaVersion,
			&ref.ID,
			&ref.WorkspaceID,
			&ref.ExecutionID,
			&ref.NodeExecutionID,
			&ref.Kind,
			&ref.Ref,
			&ref.StartCursor,
			&ref.EndCursor,
			&metadataJSON,
			&ref.CreatedAt,
			&ref.UpdatedAt,
		); err != nil {
			return nil, store.persistenceError("load workflow activity refs", err)
		}
		ref.Metadata = rawJSONFromString(metadataJSON)
		refs = append(refs, ref)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("load workflow activity refs", err)
	}
	return refs, nil
}

func (store *Store) loadWorkflowTokens(workspaceID string, executionID string) ([]WorkflowToken, error) {
	rows, err := store.db.QueryContext(context.Background(), `
SELECT schema_version, id, run_id, node_id, source_node_id, edge_id,
       iteration, status, created_at, completed_at
FROM workflow_tokens
WHERE workspace_id = ? AND run_id = ?
ORDER BY rowid ASC
`, workspaceID, executionID)
	if err != nil {
		return nil, store.persistenceError("load workflow tokens", err)
	}
	defer rows.Close()
	tokens := []WorkflowToken{}
	for rows.Next() {
		var token WorkflowToken
		var completedAt sql.NullString
		if err := rows.Scan(
			&token.SchemaVersion,
			&token.ID,
			&token.ExecutionID,
			&token.NodeID,
			&token.SourceNodeID,
			&token.EdgeID,
			&token.Iteration,
			&token.Status,
			&token.CreatedAt,
			&completedAt,
		); err != nil {
			return nil, store.persistenceError("load workflow tokens", err)
		}
		token.CompletedAt = stringFromNull(completedAt)
		tokens = append(tokens, token)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("load workflow tokens", err)
	}
	return tokens, nil
}

func (store *Store) loadWorkflowLoopCounters(workspaceID string, executionID string) ([]WorkflowLoopIteration, error) {
	rows, err := store.db.QueryContext(context.Background(), `
SELECT node_id, count
FROM workflow_loop_counters
WHERE workspace_id = ? AND run_id = ?
ORDER BY rowid ASC
`, workspaceID, executionID)
	if err != nil {
		return nil, store.persistenceError("load workflow loop counters", err)
	}
	defer rows.Close()
	loops := []WorkflowLoopIteration{}
	for rows.Next() {
		var loop WorkflowLoopIteration
		if err := rows.Scan(&loop.NodeID, &loop.Count); err != nil {
			return nil, store.persistenceError("load workflow loop counters", err)
		}
		loops = append(loops, loop)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("load workflow loop counters", err)
	}
	return loops, nil
}
