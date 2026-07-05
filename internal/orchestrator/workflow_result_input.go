package orchestrator

import (
	"errors"
	"fmt"
	"strings"
)

type WorkflowExecutionResultInput struct {
	WorkspaceID     string               `json:"workspaceId"`
	ExecutionID     string               `json:"executionId"`
	NodeExecutionID string               `json:"nodeExecutionId"`
	Result          WorkflowActionResult `json:"result"`
}

func ValidateWorkflowExecutionResultInput(input WorkflowExecutionResultInput) error {
	if strings.TrimSpace(input.ExecutionID) == "" {
		return errors.New("workflow execution result executionId is required")
	}
	if strings.TrimSpace(input.NodeExecutionID) == "" {
		return errors.New("workflow execution result nodeExecutionId is required")
	}
	if input.Result.Status == "" {
		return errors.New("workflow execution result status is required")
	}
	switch input.Result.Status {
	case ActionCompletionCompleted, ActionCompletionFailed, ActionCompletionCancelled:
	case ActionCompletionRequiresApproval:
		return errors.New("workflow execution result cannot report requires_approval")
	default:
		return fmt.Errorf("workflow execution result status %q is unsupported", input.Result.Status)
	}
	for _, signal := range input.Result.Signals {
		if strings.TrimSpace(signal.Name) == "" {
			return errors.New("workflow execution result signal name is required")
		}
	}
	for _, path := range input.Result.FilePaths {
		if strings.TrimSpace(path) == "" {
			return errors.New("workflow execution result file path must not be empty")
		}
	}
	if input.Result.PendingApproval != nil {
		return errors.New("workflow execution result cannot include pendingApproval")
	}
	return nil
}
