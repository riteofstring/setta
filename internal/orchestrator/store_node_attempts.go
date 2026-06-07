package orchestrator

import (
	"context"
	"database/sql"
	"fmt"
)

type workflowNodeAttemptRow struct {
	id                     string
	schemaVersion          int
	workspaceID            string
	runID                  string
	nodeID                 string
	attempt                int
	iteration              int
	status                 WorkflowNodeExecutionStatus
	actionKind             sql.NullString
	runnerKind             sql.NullString
	idempotencyKey         string
	inputHash              string
	inputJSON              string
	actionPolicyJSON       sql.NullString
	sideEffectPolicyJSON   string
	runnerCapabilitiesJSON sql.NullString
	scheduledAt            string
	startedAt              sql.NullString
	completedAt            sql.NullString
	resultStatus           sql.NullString
	resultJSON             sql.NullString
	outputJSON             sql.NullString
	exitCode               sql.NullInt64
	errorMessage           string
	recoveryOutcome        sql.NullString
	recoveryMessage        string
}

func workflowNodeAttemptRowFromExecution(execution WorkflowExecution, nodeExecution WorkflowNodeExecution) (workflowNodeAttemptRow, error) {
	inputJSON, err := compactRawJSON(nodeExecution.Input, "{}")
	if err != nil {
		return workflowNodeAttemptRow{}, fmt.Errorf("encode workflow node execution input: %w", err)
	}
	actionPolicyJSON, err := nullableJSON(nodeExecution.ActionPolicy, nodeExecution.ActionPolicy != nil)
	if err != nil {
		return workflowNodeAttemptRow{}, fmt.Errorf("encode workflow node action policy: %w", err)
	}
	sideEffectPolicyJSON, err := workflowNodeSideEffectPolicyJSON(nodeExecution)
	if err != nil {
		return workflowNodeAttemptRow{}, err
	}
	runnerCapabilitiesJSON, err := nullableJSON(nodeExecution.RunnerCapabilities, nodeExecution.RunnerCapabilities != nil)
	if err != nil {
		return workflowNodeAttemptRow{}, fmt.Errorf("encode workflow node runner capabilities: %w", err)
	}
	resultJSON, err := nullableJSON(nodeExecution.Result, nodeExecution.Result != nil)
	if err != nil {
		return workflowNodeAttemptRow{}, fmt.Errorf("encode workflow node result: %w", err)
	}
	resultStatus, outputJSON, exitCode, err := workflowNodeResultColumns(nodeExecution)
	if err != nil {
		return workflowNodeAttemptRow{}, err
	}
	return workflowNodeAttemptRow{
		id:                     nodeExecution.ID,
		schemaVersion:          nodeExecution.SchemaVersion,
		workspaceID:            execution.WorkspaceID,
		runID:                  execution.ID,
		nodeID:                 nodeExecution.NodeID,
		attempt:                nodeExecution.Attempt,
		iteration:              nodeExecution.Iteration,
		status:                 nodeExecution.Status,
		actionKind:             nullableActionKind(nodeExecution.ActionKind),
		runnerKind:             nullableActionKind(nodeExecution.RunnerKind),
		idempotencyKey:         nodeExecution.IdempotencyKey,
		inputHash:              nodeExecution.InputHash,
		inputJSON:              inputJSON,
		actionPolicyJSON:       actionPolicyJSON,
		sideEffectPolicyJSON:   sideEffectPolicyJSON,
		runnerCapabilitiesJSON: runnerCapabilitiesJSON,
		scheduledAt:            nodeExecution.ScheduledAt,
		startedAt:              nullableString(nodeExecution.StartedAt),
		completedAt:            nullableString(nodeExecution.CompletedAt),
		resultStatus:           resultStatus,
		resultJSON:             resultJSON,
		outputJSON:             outputJSON,
		exitCode:               exitCode,
		errorMessage:           nodeExecution.Error,
		recoveryOutcome:        nullableRunnerRecoveryOutcome(nodeExecution.RecoveryOutcome),
		recoveryMessage:        nodeExecution.RecoveryMessage,
	}, nil
}

func workflowNodeSideEffectPolicyJSON(nodeExecution WorkflowNodeExecution) (string, error) {
	if nodeExecution.SideEffectPolicy == nil {
		return "{}", nil
	}
	sideEffectPolicyJSON, err := marshalJSONColumn(*nodeExecution.SideEffectPolicy)
	if err != nil {
		return "", fmt.Errorf("encode workflow node side-effect policy: %w", err)
	}
	return sideEffectPolicyJSON, nil
}

func workflowNodeResultColumns(nodeExecution WorkflowNodeExecution) (sql.NullString, sql.NullString, sql.NullInt64, error) {
	if nodeExecution.Result == nil {
		return sql.NullString{}, sql.NullString{}, sql.NullInt64{}, nil
	}
	resultStatus := sql.NullString{String: string(nodeExecution.Result.Status), Valid: nodeExecution.Result.Status != ""}
	outputJSON, err := nullableRawJSON(nodeExecution.Result.Output)
	if err != nil {
		return sql.NullString{}, sql.NullString{}, sql.NullInt64{}, fmt.Errorf("encode workflow action output: %w", err)
	}
	return resultStatus, outputJSON, workflowExitCodeColumn(nodeExecution.Result.ExitCode), nil
}

func workflowExitCodeColumn(exitCode *int) sql.NullInt64 {
	if exitCode == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: int64(*exitCode), Valid: true}
}

func (store *Store) insertWorkflowNodeAttemptRow(ctx context.Context, tx *sql.Tx, row workflowNodeAttemptRow) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO workflow_node_attempts (
  id, schema_version, workspace_id, run_id, node_id, attempt, iteration,
  status, action_kind, runner_kind, idempotency_key, input_hash, input_json,
  action_policy_json, side_effect_policy_json, runner_capabilities_json,
  scheduled_at, started_at, completed_at, result_status, result_json,
  output_json, exit_code, error, recovery_outcome, recovery_message
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		row.id,
		row.schemaVersion,
		row.workspaceID,
		row.runID,
		row.nodeID,
		row.attempt,
		row.iteration,
		row.status,
		row.actionKind,
		row.runnerKind,
		row.idempotencyKey,
		row.inputHash,
		row.inputJSON,
		row.actionPolicyJSON,
		row.sideEffectPolicyJSON,
		row.runnerCapabilitiesJSON,
		row.scheduledAt,
		row.startedAt,
		row.completedAt,
		row.resultStatus,
		row.resultJSON,
		row.outputJSON,
		row.exitCode,
		row.errorMessage,
		row.recoveryOutcome,
		row.recoveryMessage,
	)
	if err != nil {
		return store.persistenceError("save workflow node attempt", err)
	}
	return nil
}
