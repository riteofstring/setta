package orchestrator

import (
	"encoding/json"
	"fmt"
)

func ApplyRunnerEvents(execution WorkflowExecution, nodeExecutionID string, runnerEvents []RunnerEvent, context TransitionContext) (WorkflowTransition, error) {
	if err := validateTransitionContext(context); err != nil {
		return WorkflowTransition{}, err
	}
	index := nodeExecutionIndex(execution, nodeExecutionID)
	if index < 0 {
		return WorkflowTransition{}, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	events := []WorkflowEvent{}
	for _, runnerEvent := range runnerEvents {
		normalized, err := applyOneRunnerEvent(&execution, index, runnerEvent, context, &events)
		if err != nil {
			return WorkflowTransition{}, err
		}
		index = nodeExecutionIndex(execution, normalized.NodeExecutionID)
	}
	refreshActiveNodeExecutionIDs(&execution)
	return WorkflowTransition{Execution: execution, Events: events}, nil
}

func applyOneRunnerEvent(execution *WorkflowExecution, nodeExecutionIndex int, runnerEvent RunnerEvent, context TransitionContext, events *[]WorkflowEvent) (RunnerEvent, error) {
	nodeExecution := &execution.NodeExecutions[nodeExecutionIndex]
	normalized, err := normalizeRunnerEvent(*execution, nodeExecution, runnerEvent, context)
	if err != nil {
		return RunnerEvent{}, err
	}
	if err := applyRunnerEventToNodeExecution(nodeExecution, normalized, context.Now); err != nil {
		return RunnerEvent{}, err
	}
	if err := appendRunnerWorkflowEvent(execution, normalized, context, events); err != nil {
		return RunnerEvent{}, err
	}
	return normalized, nil
}

func appendRunnerWorkflowEvent(execution *WorkflowExecution, runnerEvent RunnerEvent, context TransitionContext, events *[]WorkflowEvent) error {
	details, err := json.Marshal(struct {
		RunnerEvent RunnerEvent `json:"runnerEvent"`
	}{RunnerEvent: runnerEvent})
	if err != nil {
		return err
	}
	runnerKind := runnerEvent.RunnerKind
	return appendEvent(execution, events, context, WorkflowEventType(runnerEvent.Type), WorkflowEvent{
		NodeID:          runnerEvent.NodeID,
		NodeExecutionID: runnerEvent.NodeExecutionID,
		RunnerKind:      &runnerKind,
		Message:         string(runnerEvent.Type),
		Details:         details,
	})
}

func normalizeRunnerEvent(execution WorkflowExecution, nodeExecution *WorkflowNodeExecution, event RunnerEvent, context TransitionContext) (RunnerEvent, error) {
	if event.Type == "" {
		return RunnerEvent{}, fmt.Errorf("runner event type is required")
	}
	runnerKind, ok := nodeExecutionRunnerKind(*nodeExecution)
	if !ok {
		return RunnerEvent{}, fmt.Errorf("node execution %s has no runner kind", nodeExecution.ID)
	}
	event, err := ensureRunnerEventID(event, context)
	if err != nil {
		return RunnerEvent{}, err
	}
	event = fillRunnerEventDefaults(event, execution, *nodeExecution, runnerKind, context)
	if err := validateRunnerEventOwnership(event, execution, *nodeExecution); err != nil {
		return RunnerEvent{}, err
	}
	return event, nil
}

func ensureRunnerEventID(event RunnerEvent, context TransitionContext) (RunnerEvent, error) {
	if event.ID != "" {
		return event, nil
	}
	id, err := context.NewID("workflow_runner_event")
	if err != nil {
		return RunnerEvent{}, fmt.Errorf("create runner event id: %w", err)
	}
	event.ID = id
	return event, nil
}

func fillRunnerEventDefaults(event RunnerEvent, execution WorkflowExecution, nodeExecution WorkflowNodeExecution, runnerKind WorkflowActionKind, context TransitionContext) RunnerEvent {
	if event.SchemaVersion == 0 {
		event.SchemaVersion = SchemaVersion
	}
	if event.WorkspaceID == "" {
		event.WorkspaceID = execution.WorkspaceID
	}
	if event.ExecutionID == "" {
		event.ExecutionID = execution.ID
	}
	if event.NodeID == "" {
		event.NodeID = nodeExecution.NodeID
	}
	if event.NodeExecutionID == "" {
		event.NodeExecutionID = nodeExecution.ID
	}
	return fillRunnerEventRuntimeDefaults(event, nodeExecution, runnerKind, context)
}

func fillRunnerEventRuntimeDefaults(event RunnerEvent, nodeExecution WorkflowNodeExecution, runnerKind WorkflowActionKind, context TransitionContext) RunnerEvent {
	if event.RunnerKind == "" {
		event.RunnerKind = runnerKind
	}
	if event.RunnerEventOrdinal <= 0 {
		event.RunnerEventOrdinal = nextRunnerEventOrdinal(nodeExecution)
	}
	if event.OccurredAt == "" {
		event.OccurredAt = context.Now
	}
	if event.Payload == nil {
		event.Payload = json.RawMessage(`{}`)
	}
	return event
}

func validateRunnerEventOwnership(event RunnerEvent, execution WorkflowExecution, nodeExecution WorkflowNodeExecution) error {
	if event.WorkspaceID != execution.WorkspaceID {
		return fmt.Errorf("runner event %s belongs to workspace %s, not %s", event.ID, event.WorkspaceID, execution.WorkspaceID)
	}
	if event.ExecutionID != execution.ID {
		return fmt.Errorf("runner event %s belongs to execution %s, not %s", event.ID, event.ExecutionID, execution.ID)
	}
	if event.NodeExecutionID != nodeExecution.ID {
		return fmt.Errorf("runner event %s belongs to node execution %s, not %s", event.ID, event.NodeExecutionID, nodeExecution.ID)
	}
	return nil
}

func applyRunnerEventToNodeExecution(nodeExecution *WorkflowNodeExecution, event RunnerEvent, now string) error {
	ensureNodeRunnerState(nodeExecution, event, now)
	nodeExecution.RunnerState.LastRunnerEventOrdinal = event.RunnerEventOrdinal
	nodeExecution.RunnerState.UpdatedAt = now
	if event.Type == RunnerEventAttemptStarted {
		return applyRunnerAttemptStarted(nodeExecution, event.Payload)
	}
	applyRunnerStateStatus(nodeExecution.RunnerState, event.Type)
	return nil
}

func ensureNodeRunnerState(nodeExecution *WorkflowNodeExecution, event RunnerEvent, now string) {
	if nodeExecution.RunnerState != nil {
		return
	}
	nodeExecution.RunnerState = &WorkflowRunnerState{
		SchemaVersion:   SchemaVersion,
		WorkspaceID:     event.WorkspaceID,
		ExecutionID:     event.ExecutionID,
		NodeExecutionID: event.NodeExecutionID,
		RunnerKind:      event.RunnerKind,
		Status:          RunnerStateStatusRunning,
		OpaqueState:     json.RawMessage(`{}`),
		CreatedAt:       now,
	}
}

func applyRunnerAttemptStarted(nodeExecution *WorkflowNodeExecution, payloadJSON json.RawMessage) error {
	payload, err := decodeRunnerAttemptStartedPayload(payloadJSON)
	if err != nil {
		return err
	}
	nodeExecution.RunnerRefs = mergeRunnerRefs(nodeExecution.RunnerRefs, payload.RunnerRefs)
	nodeExecution.ActivityRefs = mergeActivityRefs(nodeExecution.ActivityRefs, payload.ActivityRefs)
	nodeExecution.InputHash = nonEmpty(payload.InputHash, nodeExecution.InputHash)
	nodeExecution.RunnerCapabilities = &payload.Capabilities
	if payload.RunSettings != nil {
		settings := *payload.RunSettings
		nodeExecution.AgentRunSettings = &settings
	}
	nodeExecution.RunnerState.Status = RunnerStateStatusRunning
	return nil
}

func applyRunnerStateStatus(runnerState *WorkflowRunnerState, eventType RunnerEventType) {
	switch eventType {
	case RunnerEventApprovalRequested:
		runnerState.Status = RunnerStateStatusWaitingApproval
	case RunnerEventApprovalResolved:
		runnerState.Status = RunnerStateStatusRunning
	case RunnerEventAttemptCompleted:
		runnerState.Status = RunnerStateStatusCompleted
	case RunnerEventAttemptFailed:
		runnerState.Status = RunnerStateStatusFailed
	case RunnerEventAttemptCancelled:
		runnerState.Status = RunnerStateStatusCancelled
	case RunnerEventAttemptRecoveryRequired:
		runnerState.Status = RunnerStateStatusRecoveryRequired
	}
}

func decodeRunnerAttemptStartedPayload(payload json.RawMessage) (RunnerAttemptStartedPayload, error) {
	var decoded RunnerAttemptStartedPayload
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return RunnerAttemptStartedPayload{}, fmt.Errorf("decode runner attempt started payload: %w", err)
	}
	if decoded.RunnerRefs == nil {
		decoded.RunnerRefs = []WorkflowActionRunnerRef{}
	}
	if decoded.ActivityRefs == nil {
		decoded.ActivityRefs = []WorkflowActivityRef{}
	}
	return decoded, nil
}

func nextRunnerEventOrdinal(nodeExecution WorkflowNodeExecution) int {
	if nodeExecution.RunnerState == nil || nodeExecution.RunnerState.LastRunnerEventOrdinal <= 0 {
		return 1
	}
	return nodeExecution.RunnerState.LastRunnerEventOrdinal + 1
}

func nodeExecutionRunnerKind(nodeExecution WorkflowNodeExecution) (WorkflowActionKind, bool) {
	if nodeExecution.RunnerKind != nil && *nodeExecution.RunnerKind != "" {
		return *nodeExecution.RunnerKind, true
	}
	if nodeExecution.ActionKind != nil && *nodeExecution.ActionKind != "" {
		return *nodeExecution.ActionKind, true
	}
	return "", false
}
