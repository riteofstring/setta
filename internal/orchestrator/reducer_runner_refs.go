package orchestrator

import (
	"encoding/json"
	"fmt"
)

func AttachRunnerRefs(execution WorkflowExecution, nodeExecutionID string, runnerRefs []WorkflowActionRunnerRef, context TransitionContext) (WorkflowTransition, error) {
	if err := validateTransitionContext(context); err != nil {
		return WorkflowTransition{}, err
	}
	index := nodeExecutionIndex(execution, nodeExecutionID)
	if index < 0 {
		return WorkflowTransition{}, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	details, err := json.Marshal(struct {
		RunnerRefs []WorkflowActionRunnerRef `json:"runnerRefs"`
	}{RunnerRefs: runnerRefs})
	if err != nil {
		return WorkflowTransition{}, fmt.Errorf("encode runner refs attached details: %w", err)
	}
	execution.NodeExecutions[index].RunnerRefs = mergeRunnerRefs(execution.NodeExecutions[index].RunnerRefs, runnerRefs)
	execution.UpdatedAt = context.Now
	refreshActiveNodeExecutionIDs(&execution)
	events := []WorkflowEvent{}
	if err := appendEvent(&execution, &events, context, EventRunnerRefsAttached, WorkflowEvent{
		NodeID:          execution.NodeExecutions[index].NodeID,
		NodeExecutionID: execution.NodeExecutions[index].ID,
		Message:         fmt.Sprintf("runner refs attached for node %s", execution.NodeExecutions[index].NodeID),
		Details:         details,
	}); err != nil {
		return WorkflowTransition{}, err
	}
	return WorkflowTransition{Execution: execution, Events: events}, nil
}
