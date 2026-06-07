package orchestrator

import (
	"errors"
	"fmt"

	"setta/internal/chat"
)

type workflowApprovalTarget struct {
	execution      WorkflowExecution
	nodeExecution  WorkflowNodeExecution
	conversationID string
}

func (service *Service) SubmitApproval(workspaceID string, executionID string, nodeExecutionID string, approvalID string, approved bool, response string, answers []chat.ApprovalAnswer, cancelled bool) (WorkflowExecution, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowExecution{}, err
	}
	if service.codexChatService == nil {
		return WorkflowExecution{}, errors.New("workflow approval submission requires a chat service")
	}
	target, err := service.workflowApprovalTarget(workspaceID, executionID, nodeExecutionID, approvalID)
	if err != nil {
		return WorkflowExecution{}, err
	}
	run, err := service.codexChatService.SubmitApproval(workspaceID, target.conversationID, approvalID, approved, response, answers, cancelled)
	if err != nil {
		return WorkflowExecution{}, err
	}
	resolvedEvent, err := runnerEventFromApprovalResolution(target, approvalID, approved, response, answers, cancelled, timestamp(service.now()))
	if err != nil {
		return WorkflowExecution{}, err
	}
	if _, err := service.recordRunnerEvents(workspaceID, executionID, nodeExecutionID, []RunnerEvent{resolvedEvent}); err != nil {
		return WorkflowExecution{}, err
	}
	service.reconcileChatRun(run)
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.store.LoadExecution(workspaceID, target.execution.ID)
}

func (service *Service) workflowApprovalTarget(workspaceID string, executionID string, nodeExecutionID string, approvalID string) (workflowApprovalTarget, error) {
	if err := validateWorkflowApprovalTargetIDs(executionID, nodeExecutionID, approvalID); err != nil {
		return workflowApprovalTarget{}, err
	}

	service.mu.Lock()
	defer service.mu.Unlock()
	return service.workflowApprovalTargetLocked(workspaceID, executionID, nodeExecutionID, approvalID)
}

func validateWorkflowApprovalTargetIDs(executionID string, nodeExecutionID string, approvalID string) error {
	if err := validateStorageID("workflow execution id", executionID); err != nil {
		return err
	}
	if err := validateStorageID("workflow node execution id", nodeExecutionID); err != nil {
		return err
	}
	return validateStorageID("approval id", approvalID)
}

func (service *Service) workflowApprovalTargetLocked(workspaceID string, executionID string, nodeExecutionID string, approvalID string) (workflowApprovalTarget, error) {
	execution, err := service.store.LoadExecution(workspaceID, executionID)
	if err != nil {
		return workflowApprovalTarget{}, err
	}
	if execution.Status != ExecutionStatusRunning {
		return workflowApprovalTarget{}, fmt.Errorf("workflow execution %s is %s, not running", executionID, execution.Status)
	}
	nodeExecution := nodeExecutionByID(execution, nodeExecutionID)
	if nodeExecution.ID == "" {
		return workflowApprovalTarget{}, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	if nodeExecution.Status != NodeExecutionStatusWaitingApproval {
		return workflowApprovalTarget{}, fmt.Errorf("node execution %s is %s, not waiting_approval", nodeExecutionID, nodeExecution.Status)
	}
	conversationID, err := workflowApprovalConversationID(nodeExecution, approvalID)
	if err != nil {
		return workflowApprovalTarget{}, err
	}
	return workflowApprovalTarget{
		execution:      execution,
		nodeExecution:  nodeExecution,
		conversationID: conversationID,
	}, nil
}

func workflowApprovalConversationID(nodeExecution WorkflowNodeExecution, approvalID string) (string, error) {
	if nodeExecution.Result == nil || nodeExecution.Result.PendingApproval == nil {
		return "", fmt.Errorf("node execution %s has no pending workflow approval", nodeExecution.ID)
	}
	if nodeExecution.Result.PendingApproval.ApprovalID != approvalID {
		return "", fmt.Errorf("workflow approval %s is not pending for node execution %s", approvalID, nodeExecution.ID)
	}
	conversationID := runnerRefValue(nodeExecution.RunnerRefs, RunnerRefChatConversation)
	if conversationID == "" {
		return "", fmt.Errorf("node execution %s has no chat conversation runner ref", nodeExecution.ID)
	}
	if err := validateRunnerRunRef(nodeExecution, nodeExecution.Result.PendingApproval.Approval); err != nil {
		return "", err
	}
	return conversationID, nil
}

func validateRunnerRunRef(nodeExecution WorkflowNodeExecution, approval chat.ApprovalRequest) error {
	runID := runnerRefValue(nodeExecution.RunnerRefs, RunnerRefChatRun)
	if runID == "" || approval.RunID == "" || runID == approval.RunID {
		return nil
	}
	return fmt.Errorf("node execution %s approval run %s does not match runner ref %s", nodeExecution.ID, approval.RunID, runID)
}
