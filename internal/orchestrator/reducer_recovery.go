package orchestrator

import (
	"encoding/json"
	"fmt"
)

type WorkflowActionRecoveryMetadata struct {
	Outcome     RunnerRecoveryOutcome
	Message     string
	RunnerRefs  []WorkflowActionRunnerRef
	RunnerState *WorkflowRunnerState
}

type workflowActionRecoveryEventDetails struct {
	Outcome    RunnerRecoveryOutcome     `json:"outcome"`
	Message    string                    `json:"message"`
	RunnerRefs []WorkflowActionRunnerRef `json:"runnerRefs"`
}

func RecordActionRecovery(execution WorkflowExecution, nodeExecutionID string, metadata WorkflowActionRecoveryMetadata, context TransitionContext) (WorkflowTransition, error) {
	if err := validateTransitionContext(context); err != nil {
		return WorkflowTransition{}, err
	}
	if execution.Status != ExecutionStatusRunning {
		return WorkflowTransition{}, fmt.Errorf("workflow execution %s is %s, not running", execution.ID, execution.Status)
	}
	if metadata.Outcome == "" {
		return WorkflowTransition{}, fmt.Errorf("node execution %s recovery outcome is required", nodeExecutionID)
	}
	index := nodeExecutionIndex(execution, nodeExecutionID)
	if index < 0 {
		return WorkflowTransition{}, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	nodeExecution := &execution.NodeExecutions[index]
	if !isActiveNodeExecutionStatus(nodeExecution.Status) {
		return WorkflowTransition{}, fmt.Errorf("node execution %s is %s, not recoverable", nodeExecutionID, nodeExecution.Status)
	}

	nodeExecution.RunnerRefs = mergeRunnerRefs(nodeExecution.RunnerRefs, metadata.RunnerRefs)
	applyRecoveredRunnerState(nodeExecution, metadata, context.Now)
	nodeExecution.RecoveryOutcome = recoveryOutcomePtr(metadata.Outcome)
	nodeExecution.RecoveryMessage = metadata.Message
	execution.RecoveryOutcome = recoveryOutcomePtr(metadata.Outcome)
	execution.UpdatedAt = context.Now

	eventType := EventActionRecovered
	eventMessage := fmt.Sprintf("action node %s recovered with outcome %s", nodeExecution.NodeID, metadata.Outcome)
	if metadata.Outcome == RunnerRecoveryOutcomeManualRecoveryRequired {
		nodeExecution.Status = NodeExecutionStatusRecoveryRequired
		nodeExecution.Error = metadata.Message
		if nodeExecution.RunnerState != nil {
			nodeExecution.RunnerState.Status = RunnerStateStatusRecoveryRequired
			nodeExecution.RunnerState.UpdatedAt = context.Now
		}
		eventType = EventActionRecoveryRequired
		eventMessage = fmt.Sprintf("action node %s requires manual recovery", nodeExecution.NodeID)
	}

	details, err := json.Marshal(workflowActionRecoveryEventDetails{
		Outcome:    metadata.Outcome,
		Message:    metadata.Message,
		RunnerRefs: metadata.RunnerRefs,
	})
	if err != nil {
		return WorkflowTransition{}, fmt.Errorf("encode action recovery details: %w", err)
	}
	events := []WorkflowEvent{}
	if err := appendEvent(&execution, &events, context, eventType, WorkflowEvent{
		NodeID:          nodeExecution.NodeID,
		NodeExecutionID: nodeExecution.ID,
		Message:         eventMessage,
		Details:         details,
	}); err != nil {
		return WorkflowTransition{}, err
	}
	refreshActiveNodeExecutionIDs(&execution)
	return WorkflowTransition{Execution: execution, Events: events}, nil
}

func applyRecoveredRunnerState(nodeExecution *WorkflowNodeExecution, metadata WorkflowActionRecoveryMetadata, now string) {
	if metadata.RunnerState != nil {
		state := *metadata.RunnerState
		state.UpdatedAt = nonEmpty(state.UpdatedAt, now)
		nodeExecution.RunnerState = &state
		return
	}
	if nodeExecution.RunnerState == nil {
		return
	}
	switch metadata.Outcome {
	case RunnerRecoveryOutcomeRecoveredRunning, RunnerRecoveryOutcomeRetryScheduled:
		nodeExecution.RunnerState.Status = RunnerStateStatusRunning
	case RunnerRecoveryOutcomeRecoveredCompleted:
		nodeExecution.RunnerState.Status = RunnerStateStatusCompleted
	case RunnerRecoveryOutcomeRecoveredFailed, RunnerRecoveryOutcomeFailedInterrupted:
		nodeExecution.RunnerState.Status = RunnerStateStatusFailed
	case RunnerRecoveryOutcomeManualRecoveryRequired:
		nodeExecution.RunnerState.Status = RunnerStateStatusRecoveryRequired
	}
	nodeExecution.RunnerState.UpdatedAt = now
}

func recoveryOutcomePtr(outcome RunnerRecoveryOutcome) *RunnerRecoveryOutcome {
	return &outcome
}
