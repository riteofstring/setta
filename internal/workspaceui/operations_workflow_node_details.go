package workspaceui

import (
	"errors"
	"fmt"

	"setta/internal/orchestrator"
)

func validateConfigurePaneWorkflowNodeDetailsConfigForSurface(
	surfaceKind *SurfaceKind,
	config *WorkflowNodeDetailsPaneConfig,
) error {
	if config == nil {
		return nil
	}
	if surfaceKind != nil && *surfaceKind != SurfaceKindWorkflowNodeDetails {
		return errors.New("workspace pane configure workflowNodeDetailsConfig is only valid for workflow-node-details panes")
	}
	return validateWorkflowNodeDetailsConfigForOperation("workspace pane configure", config)
}

func validateOpenPaneWorkflowNodeDetailsConfig(
	surfaceKind SurfaceKind,
	config *WorkflowNodeDetailsPaneConfig,
) error {
	if surfaceKind != SurfaceKindWorkflowNodeDetails {
		if config != nil {
			return errors.New("workspace pane open workflowNodeDetailsConfig is only valid for workflow-node-details panes")
		}
		return nil
	}
	if config == nil {
		return errors.New("workspace pane open workflowNodeDetailsConfig is required for workflow-node-details panes")
	}
	return validateWorkflowNodeDetailsConfigForOperation("workspace pane open", config)
}

func validateWorkflowNodeDetailsConfigForOperation(label string, config *WorkflowNodeDetailsPaneConfig) error {
	if err := validateWorkflowNodeDetailsIdentityForOperation(label, config); err != nil {
		return err
	}
	if err := validateWorkflowNodeDetailsProjectionForOperation(label, config); err != nil {
		return err
	}
	return validateWorkflowNodeDetailsValuesForOperation(label, config)
}

func validateWorkflowNodeDetailsIdentityForOperation(label string, config *WorkflowNodeDetailsPaneConfig) error {
	if config.WorkspaceID == "" {
		return fmt.Errorf("%s workflowNodeDetailsConfig.workspaceId is required", label)
	}
	if err := validateWorkspaceID(config.WorkspaceID); err != nil {
		return fmt.Errorf("%s workflowNodeDetailsConfig.workspaceId is invalid: %v", label, err)
	}
	if config.DefinitionID == "" {
		return fmt.Errorf("%s workflowNodeDetailsConfig.definitionId is required", label)
	}
	if config.DefinitionName == "" {
		return fmt.Errorf("%s workflowNodeDetailsConfig.definitionName is required", label)
	}
	if config.NodeID == "" {
		return fmt.Errorf("%s workflowNodeDetailsConfig.nodeId is required", label)
	}
	if config.NodeLabel == "" {
		return fmt.Errorf("%s workflowNodeDetailsConfig.nodeLabel is required", label)
	}
	return nil
}

func validateWorkflowNodeDetailsProjectionForOperation(label string, config *WorkflowNodeDetailsPaneConfig) error {
	if config.ProjectionIncomingEdges == nil {
		return fmt.Errorf("%s workflowNodeDetailsConfig.projectionIncomingEdges must not be null", label)
	}
	if config.ProjectionOutgoingEdges == nil {
		return fmt.Errorf("%s workflowNodeDetailsConfig.projectionOutgoingEdges must not be null", label)
	}
	return nil
}

func validateWorkflowNodeDetailsValuesForOperation(label string, config *WorkflowNodeDetailsPaneConfig) error {
	if !validWorkflowNodeKind(config.NodeKind) {
		return fmt.Errorf("%s workflowNodeDetailsConfig.nodeKind is unsupported: %s", label, config.NodeKind)
	}
	if !validWorkflowGraphNodeStatus(config.NodeStatus) {
		return fmt.Errorf("%s workflowNodeDetailsConfig.nodeStatus is unsupported: %s", label, config.NodeStatus)
	}
	if !validWorkflowGraphViewMode(config.ViewMode) {
		return fmt.Errorf("%s workflowNodeDetailsConfig.viewMode is unsupported: %s", label, config.ViewMode)
	}
	if err := validateWorkflowNodeDetailsRunFieldsForOperation(label, config); err != nil {
		return err
	}
	if config.ViewMode != orchestrator.GraphViewModeDraft && config.DefinitionVersionID == "" {
		return fmt.Errorf("%s workflowNodeDetailsConfig.definitionVersionId is required outside draft view", label)
	}
	if config.DefinitionVersionNumber < 0 {
		return fmt.Errorf("%s workflowNodeDetailsConfig.definitionVersionNumber must be non-negative", label)
	}
	return nil
}

func validateWorkflowNodeDetailsRunFieldsForOperation(label string, config *WorkflowNodeDetailsPaneConfig) error {
	if config.ViewMode == orchestrator.GraphViewModeRun {
		if config.ExecutionID == "" {
			return fmt.Errorf("%s workflowNodeDetailsConfig.executionId is required for run view", label)
		}
		if config.NodeExecutionID == "" {
			return fmt.Errorf("%s workflowNodeDetailsConfig.nodeExecutionId is required for run view", label)
		}
		return nil
	}
	if config.ExecutionID != "" {
		return fmt.Errorf("%s workflowNodeDetailsConfig.executionId is only valid for run view", label)
	}
	if config.NodeExecutionID != "" {
		return fmt.Errorf("%s workflowNodeDetailsConfig.nodeExecutionId is only valid for run view", label)
	}
	return nil
}

func workflowNodeDetailsConfigForOpenPane(
	surfaceKind SurfaceKind,
	requested *WorkflowNodeDetailsPaneConfig,
) *WorkflowNodeDetailsPaneConfig {
	if surfaceKind != SurfaceKindWorkflowNodeDetails {
		return nil
	}
	return cloneWorkflowNodeDetailsPaneConfig(requested)
}

func workflowNodeDetailsConfigForConfigurePane(
	surfaceKind SurfaceKind,
	requested *WorkflowNodeDetailsPaneConfig,
	existing WorkspaceUIPane,
) *WorkflowNodeDetailsPaneConfig {
	if surfaceKind != SurfaceKindWorkflowNodeDetails {
		return nil
	}
	if requested != nil {
		return cloneWorkflowNodeDetailsPaneConfig(requested)
	}
	if existing.SurfaceKind == SurfaceKindWorkflowNodeDetails && existing.WorkflowNodeDetailsConfig != nil {
		return cloneWorkflowNodeDetailsPaneConfig(existing.WorkflowNodeDetailsConfig)
	}
	return nil
}

func validateWorkflowNodeDetailsConfigMatchesOperationWorkspace(
	workspaceID string,
	operation WorkspaceUIPaneOperation,
	config *WorkflowNodeDetailsPaneConfig,
) error {
	if config == nil {
		return operationError(
			workspaceID,
			operation,
			WorkspaceUIOperationErrorCodeInvalidOperation,
			fmt.Errorf("workspace pane operation workflowNodeDetailsConfig is required for workflow-node-details panes"),
		)
	}
	if err := validateWorkflowNodeDetailsConfigForOperation("workspace pane operation", config); err != nil {
		return operationError(
			workspaceID,
			operation,
			WorkspaceUIOperationErrorCodeInvalidOperation,
			err,
		)
	}
	if config.WorkspaceID != workspaceID {
		return operationError(
			workspaceID,
			operation,
			WorkspaceUIOperationErrorCodeInvalidOperation,
			fmt.Errorf("workspace pane operation workflowNodeDetailsConfig.workspaceId %s does not match layout workspaceId %s", config.WorkspaceID, workspaceID),
		)
	}
	return nil
}

func cloneWorkflowNodeDetailsPaneConfig(config *WorkflowNodeDetailsPaneConfig) *WorkflowNodeDetailsPaneConfig {
	if config == nil {
		return nil
	}
	cloned := *config
	cloned.ProjectionIncomingEdges = cloneWorkflowGraphEdges(config.ProjectionIncomingEdges)
	cloned.ProjectionOutgoingEdges = cloneWorkflowGraphEdges(config.ProjectionOutgoingEdges)
	return &cloned
}

func cloneWorkflowGraphEdges(edges []orchestrator.WorkflowGraphEdge) []orchestrator.WorkflowGraphEdge {
	if edges == nil {
		return nil
	}
	return append([]orchestrator.WorkflowGraphEdge{}, edges...)
}
