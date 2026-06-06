package orchestrator

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
	closeActiveWork(execution, context.Now, NodeExecutionStatusCancelled, message)
	execution.Status = ExecutionStatusCancelled
	execution.TerminalReason = terminalReasonPtr(reason)
	execution.Error = message
	execution.CompletedAt = context.Now
	execution.UpdatedAt = context.Now
	return appendEvent(execution, events, context, EventExecutionCancelled, WorkflowEvent{Message: message})
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
