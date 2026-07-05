package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"setta/internal/httpapi"
	"setta/internal/orchestrator"
	"setta/internal/workspace"
)

func validateWorkspaceSummaryResponse(summary workspace.WorkspaceSummary) error {
	if summary.ID == "" {
		return errors.New("workspace id is required")
	}
	if summary.RootPath == "" {
		return fmt.Errorf("workspace rootPath is required for %s", summary.ID)
	}
	if summary.DisplayName == "" {
		return fmt.Errorf("workspace displayName is required for %s", summary.ID)
	}
	if summary.LastOpenedAt == "" {
		return fmt.Errorf("workspace lastOpenedAt is required for %s", summary.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, summary.LastOpenedAt); err != nil {
		return fmt.Errorf("workspace lastOpenedAt must be RFC3339 for %s: %w", summary.ID, err)
	}
	return nil
}

func validateWorkflowSchemaResponse(schema orchestrator.WorkflowSchema) error {
	if schema.SchemaVersion <= 0 {
		return fmt.Errorf("workflow schema returned invalid schemaVersion %d", schema.SchemaVersion)
	}
	if schema.GraphType != "WorkflowGraph" {
		return fmt.Errorf("workflow schema returned graphType %q, want WorkflowGraph", schema.GraphType)
	}
	if len(schema.GraphSchema) == 0 {
		return errors.New("workflow schema returned empty graphSchema")
	}
	if !json.Valid(schema.GraphSchema) {
		return errors.New("workflow schema returned invalid graphSchema JSON")
	}
	if len(schema.Actions) == 0 {
		return errors.New("workflow schema returned no action schemas")
	}
	return nil
}

func validateWorkflowDefinitionsListResponse(response httpapi.ListWorkflowDefinitionsResponse, workspaceID string) error {
	if response.Definitions == nil {
		return errors.New("workflow definitions list returned missing definitions array")
	}
	for _, definition := range response.Definitions {
		if err := validateWorkflowDefinitionResponse(definition, workspaceID); err != nil {
			return err
		}
	}
	return nil
}

func validateWorkflowDefinitionResponse(definition orchestrator.WorkflowDefinition, workspaceID string) error {
	if err := validateWorkflowDefinitionIdentity(definition, workspaceID); err != nil {
		return err
	}
	if err := validateWorkflowDefinitionTimestamps(definition); err != nil {
		return err
	}
	return validateWorkflowDefinitionGraphArrays(definition)
}

func validateWorkflowDefinitionIdentity(definition orchestrator.WorkflowDefinition, workspaceID string) error {
	if definition.ID == "" {
		return errors.New("workflow definition id is required")
	}
	if definition.SchemaVersion != orchestrator.SchemaVersion {
		return fmt.Errorf("workflow definition %s returned invalid schemaVersion %d", definition.ID, definition.SchemaVersion)
	}
	if definition.WorkspaceID != workspaceID {
		return fmt.Errorf("workflow definition %s returned workspaceId %s, want %s", definition.ID, definition.WorkspaceID, workspaceID)
	}
	if definition.Name == "" {
		return fmt.Errorf("workflow definition %s name is required", definition.ID)
	}
	return nil
}

func validateWorkflowDefinitionTimestamps(definition orchestrator.WorkflowDefinition) error {
	if definition.CreatedAt == "" {
		return fmt.Errorf("workflow definition %s createdAt is required", definition.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, definition.CreatedAt); err != nil {
		return fmt.Errorf("workflow definition %s createdAt must be RFC3339: %w", definition.ID, err)
	}
	if definition.UpdatedAt == "" {
		return fmt.Errorf("workflow definition %s updatedAt is required", definition.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, definition.UpdatedAt); err != nil {
		return fmt.Errorf("workflow definition %s updatedAt must be RFC3339: %w", definition.ID, err)
	}
	return nil
}

func validateWorkflowDefinitionGraphArrays(definition orchestrator.WorkflowDefinition) error {
	if definition.Graph.Nodes == nil {
		return fmt.Errorf("workflow definition %s graph nodes array is required", definition.ID)
	}
	if definition.Graph.Edges == nil {
		return fmt.Errorf("workflow definition %s graph edges array is required", definition.ID)
	}
	if definition.Graph.Layout.Nodes == nil {
		return fmt.Errorf("workflow definition %s graph layout nodes array is required", definition.ID)
	}
	return nil
}

func validateWorkflowDefinitionSaveResultResponse(result orchestrator.WorkflowDefinitionSaveResult, operation orchestrator.WorkflowDefinitionSaveOperation, workspaceID string) error {
	if result.Operation != operation {
		return fmt.Errorf("workflow definition save result operation %q, want %q", result.Operation, operation)
	}
	if err := validateWorkflowValidationResultResponse(result.Validation); err != nil {
		return fmt.Errorf("workflow definition save validation is invalid: %w", err)
	}
	if result.Saved {
		return validateSavedWorkflowDefinitionResult(result, workspaceID)
	}
	return validateUnsavedWorkflowDefinitionResult(result)
}

func validateSavedWorkflowDefinitionResult(result orchestrator.WorkflowDefinitionSaveResult, workspaceID string) error {
	if !result.Validation.Valid {
		return errors.New("workflow definition save returned saved true with invalid validation")
	}
	if result.Definition == nil {
		return errors.New("workflow definition save returned saved true without a definition")
	}
	return validateWorkflowDefinitionResponse(*result.Definition, workspaceID)
}

func validateUnsavedWorkflowDefinitionResult(result orchestrator.WorkflowDefinitionSaveResult) error {
	if result.Validation.Valid {
		return errors.New("workflow definition save returned saved false with valid validation")
	}
	if result.Definition != nil {
		return errors.New("workflow definition save returned saved false with a definition")
	}
	return nil
}

func validateWorkflowExecutionResponse(execution orchestrator.WorkflowExecution, workspaceID string) error {
	if execution.ID == "" {
		return errors.New("workflow execution id is required")
	}
	if execution.SchemaVersion != orchestrator.SchemaVersion {
		return fmt.Errorf("workflow execution %s returned invalid schemaVersion %d", execution.ID, execution.SchemaVersion)
	}
	if execution.WorkspaceID != workspaceID {
		return fmt.Errorf("workflow execution %s returned workspaceId %s, want %s", execution.ID, execution.WorkspaceID, workspaceID)
	}
	if execution.DefinitionID == "" {
		return fmt.Errorf("workflow execution %s definitionId is required", execution.ID)
	}
	if execution.DefinitionVersionID == "" {
		return fmt.Errorf("workflow execution %s definitionVersionId is required", execution.ID)
	}
	if err := validateWorkflowExecutionStatus(execution); err != nil {
		return err
	}
	if err := validateWorkflowExecutionTimestamps(execution); err != nil {
		return err
	}
	return validateWorkflowExecutionArrays(execution)
}

func validateWorkflowExecutionStatus(execution orchestrator.WorkflowExecution) error {
	switch execution.Status {
	case orchestrator.ExecutionStatusIdle,
		orchestrator.ExecutionStatusRunning,
		orchestrator.ExecutionStatusCompleted,
		orchestrator.ExecutionStatusFailed,
		orchestrator.ExecutionStatusStopped,
		orchestrator.ExecutionStatusCancelled:
		return nil
	default:
		return fmt.Errorf("workflow execution %s returned unsupported status %q", execution.ID, execution.Status)
	}
}

func validateWorkflowExecutionTimestamps(execution orchestrator.WorkflowExecution) error {
	if execution.CreatedAt == "" {
		return fmt.Errorf("workflow execution %s createdAt is required", execution.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, execution.CreatedAt); err != nil {
		return fmt.Errorf("workflow execution %s createdAt must be RFC3339: %w", execution.ID, err)
	}
	if execution.StartedAt == "" {
		return fmt.Errorf("workflow execution %s startedAt is required", execution.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, execution.StartedAt); err != nil {
		return fmt.Errorf("workflow execution %s startedAt must be RFC3339: %w", execution.ID, err)
	}
	if execution.UpdatedAt == "" {
		return fmt.Errorf("workflow execution %s updatedAt is required", execution.ID)
	}
	if _, err := time.Parse(time.RFC3339Nano, execution.UpdatedAt); err != nil {
		return fmt.Errorf("workflow execution %s updatedAt must be RFC3339: %w", execution.ID, err)
	}
	if execution.CompletedAt != "" {
		if _, err := time.Parse(time.RFC3339Nano, execution.CompletedAt); err != nil {
			return fmt.Errorf("workflow execution %s completedAt must be RFC3339: %w", execution.ID, err)
		}
	}
	return nil
}

func validateWorkflowExecutionArrays(execution orchestrator.WorkflowExecution) error {
	if execution.NodeExecutions == nil {
		return fmt.Errorf("workflow execution %s nodeExecutions array is required", execution.ID)
	}
	if execution.Tokens == nil {
		return fmt.Errorf("workflow execution %s tokens array is required", execution.ID)
	}
	if execution.LoopIterations == nil {
		return fmt.Errorf("workflow execution %s loopIterations array is required", execution.ID)
	}
	if execution.ActiveNodeExecutionIDs == nil {
		return fmt.Errorf("workflow execution %s activeNodeExecutionIds array is required", execution.ID)
	}
	return nil
}

func validateWorkflowValidationResultResponse(result orchestrator.WorkflowValidationResult) error {
	if result.Diagnostics == nil {
		return errors.New("workflow validation result returned missing diagnostics array")
	}
	hasErrorDiagnostic := false
	for index, diagnostic := range result.Diagnostics {
		switch diagnostic.Severity {
		case orchestrator.ValidationSeverityError:
			hasErrorDiagnostic = true
		case orchestrator.ValidationSeverityWarning:
		default:
			return fmt.Errorf("workflow validation diagnostic %d returned unsupported severity %q", index, diagnostic.Severity)
		}
		if diagnostic.Code == "" {
			return fmt.Errorf("workflow validation diagnostic %d code is required", index)
		}
		if diagnostic.Message == "" {
			return fmt.Errorf("workflow validation diagnostic %d message is required", index)
		}
	}
	if !result.Valid && !hasErrorDiagnostic {
		return errors.New("workflow validation result is invalid without an error diagnostic")
	}
	return nil
}
