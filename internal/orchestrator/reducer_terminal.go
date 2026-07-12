package orchestrator

import (
	"encoding/json"
	"fmt"

	"setta/internal/chat"
)

func completeExecution(execution *WorkflowExecution, events *[]WorkflowEvent, context TransitionContext, reason WorkflowTerminalReason, message string) error {
	closeActiveWork(execution, context.Now, NodeExecutionStatusCancelled, "")
	execution.Status = ExecutionStatusCompleted
	execution.TerminalReason = terminalReasonPtr(reason)
	execution.CompletedAt = context.Now
	execution.UpdatedAt = context.Now
	return appendEvent(execution, events, context, EventExecutionCompleted, WorkflowEvent{Message: message})
}

func failExecution(execution *WorkflowExecution, events *[]WorkflowEvent, context TransitionContext, reason WorkflowTerminalReason, message string) error {
	closeActiveWork(execution, context.Now, NodeExecutionStatusCancelled, "")
	execution.Status = ExecutionStatusFailed
	execution.TerminalReason = terminalReasonPtr(reason)
	execution.Error = message
	execution.CompletedAt = context.Now
	execution.UpdatedAt = context.Now
	return appendEvent(execution, events, context, EventExecutionFailed, WorkflowEvent{Message: message})
}

func stopExecution(execution *WorkflowExecution, events *[]WorkflowEvent, context TransitionContext, reason WorkflowTerminalReason, message string) error {
	closeActiveWork(execution, context.Now, NodeExecutionStatusCancelled, message)
	execution.Status = ExecutionStatusStopped
	execution.TerminalReason = terminalReasonPtr(reason)
	execution.Error = message
	execution.CompletedAt = context.Now
	execution.UpdatedAt = context.Now
	return appendEvent(execution, events, context, EventExecutionStopped, WorkflowEvent{Message: message})
}

func cancelExecution(execution *WorkflowExecution, events *[]WorkflowEvent, context TransitionContext, reason WorkflowTerminalReason, message string) error {
	if err := appendPendingApprovalCancellationEvents(execution, events, context); err != nil {
		return err
	}
	closeActiveWork(execution, context.Now, NodeExecutionStatusCancelled, message)
	execution.Status = ExecutionStatusCancelled
	execution.TerminalReason = terminalReasonPtr(reason)
	execution.Error = message
	execution.CompletedAt = context.Now
	execution.UpdatedAt = context.Now
	return appendEvent(execution, events, context, EventExecutionCancelled, WorkflowEvent{Message: message})
}

func appendPendingApprovalCancellationEvents(execution *WorkflowExecution, events *[]WorkflowEvent, context TransitionContext) error {
	for index := range execution.NodeExecutions {
		nodeExecution := &execution.NodeExecutions[index]
		if nodeExecution.Status != NodeExecutionStatusWaitingApproval || nodeExecution.Result == nil || nodeExecution.Result.PendingApproval == nil {
			continue
		}
		pending := nodeExecution.Result.PendingApproval
		payload, err := json.Marshal(RunnerApprovalResolvedPayload{
			ApprovalID: pending.ApprovalID,
			Status:     string(chat.ApprovalStatusCancelled),
			Approved:   false,
			Response:   "workflow execution cancelled",
			Answers:    []chat.ApprovalAnswer{},
			ResolvedAt: context.Now,
		})
		if err != nil {
			return fmt.Errorf("encode runner approval cancellation for node execution %s: %w", nodeExecution.ID, err)
		}
		if _, err := applyOneRunnerEvent(execution, index, RunnerEvent{
			Type:    RunnerEventApprovalResolved,
			Payload: payload,
		}, context, events); err != nil {
			return err
		}
	}
	return nil
}

func closeActiveWork(execution *WorkflowExecution, now string, nodeStatus WorkflowNodeExecutionStatus, nodeError string) {
	for index := range execution.NodeExecutions {
		if isActiveNodeExecutionStatus(execution.NodeExecutions[index].Status) {
			execution.NodeExecutions[index].Status = nodeStatus
			execution.NodeExecutions[index].CompletedAt = now
			if nodeError != "" && nodeStatus == NodeExecutionStatusFailed {
				execution.NodeExecutions[index].Error = nodeError
			}
		}
	}
	for index := range execution.Tokens {
		if execution.Tokens[index].Status == TokenStatusActive {
			execution.Tokens[index].Status = TokenStatusCancelled
			execution.Tokens[index].CompletedAt = now
		}
	}
}

func terminalReasonPtr(reason WorkflowTerminalReason) *WorkflowTerminalReason {
	return &reason
}
