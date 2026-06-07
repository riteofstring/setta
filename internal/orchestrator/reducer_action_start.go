package orchestrator

import "encoding/json"

func applyActionStartMetadata(nodeExecution *WorkflowNodeExecution, metadata WorkflowActionStartMetadata) {
	applyActionRunnerKind(nodeExecution, metadata.RunnerKind)
	applyActionInputSnapshot(nodeExecution, metadata)
	applyActionPolicySnapshot(nodeExecution, metadata)
	applyActionRunnerSnapshot(nodeExecution, metadata)
	nodeExecution.RunnerRefs = mergeRunnerRefs(nodeExecution.RunnerRefs, metadata.RunnerRefs)
	nodeExecution.ActivityRefs = mergeActivityRefs(nodeExecution.ActivityRefs, metadata.ActivityRefs)
}

func applyActionRunnerKind(nodeExecution *WorkflowNodeExecution, runnerKind WorkflowActionKind) {
	if runnerKind == "" {
		return
	}
	value := runnerKind
	nodeExecution.RunnerKind = &value
}

func applyActionInputSnapshot(nodeExecution *WorkflowNodeExecution, metadata WorkflowActionStartMetadata) {
	if metadata.InputHash != "" {
		nodeExecution.InputHash = metadata.InputHash
	}
	if metadata.Input != nil {
		nodeExecution.Input = append(json.RawMessage{}, metadata.Input...)
	}
}

func applyActionPolicySnapshot(nodeExecution *WorkflowNodeExecution, metadata WorkflowActionStartMetadata) {
	if metadata.Policy != nil {
		policy := *metadata.Policy
		nodeExecution.ActionPolicy = &policy
	}
	if metadata.SideEffectPolicy != nil {
		policy := *metadata.SideEffectPolicy
		nodeExecution.SideEffectPolicy = &policy
	}
}

func applyActionRunnerSnapshot(nodeExecution *WorkflowNodeExecution, metadata WorkflowActionStartMetadata) {
	if metadata.Capabilities != nil {
		capabilities := *metadata.Capabilities
		nodeExecution.RunnerCapabilities = &capabilities
	}
	if metadata.RunnerState != nil {
		runnerState := *metadata.RunnerState
		nodeExecution.RunnerState = &runnerState
	}
}
