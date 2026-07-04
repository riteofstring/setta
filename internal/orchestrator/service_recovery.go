package orchestrator

import (
	"context"
	"fmt"
)

type actionRecoveryTask struct {
	workspaceID     string
	executionID     string
	nodeExecutionID string
	runner          ActionRunner
	request         ActionRecoverRequest
	manualMessage   string
}

type workflowDispatchTarget struct {
	workspaceID string
	executionID string
}

const runnerIdentityNotCommittedMessage = "workflow action runner identity was not committed"

func (service *Service) recoverNonTerminalExecutions() error {
	tasks, manualTasks, dispatchTargets, err := service.startupRecoveryPlan()
	if err != nil {
		return err
	}
	for _, task := range manualTasks {
		message := nonEmpty(task.manualMessage, "workflow action has no registered recovery runner")
		if _, err := service.recordManualRecoveryRequired(task.workspaceID, task.executionID, task.nodeExecutionID, task.request.RunnerRefs, nil, task.request.NodeExecution, message); err != nil {
			return err
		}
	}
	for _, task := range tasks {
		execution, err := service.recoverActionRunner(task)
		if err != nil {
			return err
		}
		if execution.Status == ExecutionStatusRunning {
			dispatchTargets = append(dispatchTargets, workflowDispatchTarget{workspaceID: task.workspaceID, executionID: execution.ID})
		}
	}
	return service.dispatchStartupReadyActions(dispatchTargets)
}

func (service *Service) startupRecoveryPlan() ([]actionRecoveryTask, []actionRecoveryTask, []workflowDispatchTarget, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	workspaceIDs, err := service.store.WorkspaceIDs()
	if err != nil {
		return nil, nil, nil, err
	}
	tasks := []actionRecoveryTask{}
	manualTasks := []actionRecoveryTask{}
	dispatchTargets := []workflowDispatchTarget{}
	for _, workspaceID := range workspaceIDs {
		executions, err := service.store.ListExecutions(workspaceID)
		if err != nil {
			return nil, nil, nil, err
		}
		for _, execution := range executions {
			if execution.Status != ExecutionStatusRunning {
				continue
			}
			targets, err := service.startupRecoveryPlanForExecution(workspaceID, execution)
			if err != nil {
				return nil, nil, nil, err
			}
			tasks = append(tasks, targets.tasks...)
			manualTasks = append(manualTasks, targets.manualTasks...)
			dispatchTargets = append(dispatchTargets, targets.dispatchTargets...)
		}
	}
	return tasks, manualTasks, dispatchTargets, nil
}

type executionStartupRecoveryPlan struct {
	tasks           []actionRecoveryTask
	manualTasks     []actionRecoveryTask
	dispatchTargets []workflowDispatchTarget
}

func (service *Service) startupRecoveryPlanForExecution(workspaceID string, execution WorkflowExecution) (executionStartupRecoveryPlan, error) {
	plan := executionStartupRecoveryPlan{}
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.ActionKind == nil {
			continue
		}
		switch nodeExecution.Status {
		case NodeExecutionStatusReady:
			plan.dispatchTargets = append(plan.dispatchTargets, workflowDispatchTarget{workspaceID: workspaceID, executionID: execution.ID})
		case NodeExecutionStatusRunning, NodeExecutionStatusWaitingApproval:
			task := service.actionRecoveryTask(workspaceID, execution, nodeExecution)
			if len(nodeExecution.RunnerRefs) == 0 {
				task.manualMessage = runnerIdentityNotCommittedMessage
				plan.manualTasks = append(plan.manualTasks, task)
				continue
			}
			runner, ok := service.runnerRegistry.Runner(*nodeExecution.ActionKind)
			if !ok {
				plan.manualTasks = append(plan.manualTasks, task)
				continue
			}
			task.runner = runner
			plan.tasks = append(plan.tasks, task)
		case NodeExecutionStatusRecoveryRequired:
			continue
		}
	}
	return plan, nil
}

func (service *Service) actionRecoveryTask(workspaceID string, execution WorkflowExecution, nodeExecution WorkflowNodeExecution) actionRecoveryTask {
	return actionRecoveryTask{
		workspaceID:     workspaceID,
		executionID:     execution.ID,
		nodeExecutionID: nodeExecution.ID,
		request: ActionRecoverRequest{
			WorkspaceID:      workspaceID,
			ExecutionID:      execution.ID,
			Execution:        execution,
			NodeExecution:    nodeExecution,
			RunnerRefs:       append([]WorkflowActionRunnerRef{}, nodeExecution.RunnerRefs...),
			RunnerState:      cloneRunnerState(nodeExecution.RunnerState),
			LastEventOrdinal: execution.LastEventOrdinal,
		},
	}
}

func (service *Service) recoverActionRunner(task actionRecoveryTask) (WorkflowExecution, error) {
	sink := &bufferingRunnerEventSink{}
	result, err := task.runner.Recover(context.Background(), task.request, sink)
	if err != nil {
		return service.recordRecoveryFailure(task, fmt.Sprintf("recover action runner: %v", err), sink.Events())
	}
	if result.Outcome == "" {
		return service.recordRecoveryFailure(task, "recover action runner returned no recovery outcome", sink.Events())
	}
	return service.applyActionRecoveryResult(task, result, sink.Events())
}

func (service *Service) applyActionRecoveryResult(task actionRecoveryTask, result ActionRecoverResult, runnerEvents []RunnerEvent) (WorkflowExecution, error) {
	switch result.Outcome {
	case RunnerRecoveryOutcomeRecoveredRunning, RunnerRecoveryOutcomeRetryScheduled:
		return service.applyRecoveredRunningAction(task, result, runnerEvents)
	case RunnerRecoveryOutcomeRecoveredCompleted, RunnerRecoveryOutcomeRecoveredFailed:
		return service.applyRecoveredTerminalAction(task, result, runnerEvents)
	case RunnerRecoveryOutcomeManualRecoveryRequired:
		return service.recordManualRecoveryRequired(task.workspaceID, task.executionID, task.nodeExecutionID, result.RunnerRefs, runnerEvents, task.request.NodeExecution, result.Message)
	case RunnerRecoveryOutcomeFailedInterrupted:
		return service.applyFailedInterruptedRecovery(task, result, runnerEvents)
	default:
		return service.recordRecoveryFailure(task, fmt.Sprintf("unsupported recovery outcome %q", result.Outcome), runnerEvents)
	}
}

func (service *Service) applyRecoveredRunningAction(task actionRecoveryTask, result ActionRecoverResult, runnerEvents []RunnerEvent) (WorkflowExecution, error) {
	execution, recorded, err := service.recordActionRecovery(task.workspaceID, task.executionID, task.nodeExecutionID, recoveryMetadataFromResult(result), runnerEvents)
	if err != nil || !recorded {
		return execution, err
	}
	if result.Result == nil || result.Result.Status != ActionCompletionRequiresApproval {
		return execution, nil
	}
	if recoveryResultMatchesExistingApproval(nodeExecutionByID(execution, task.nodeExecutionID), *result.Result) {
		return execution, nil
	}
	return service.completeActionWithoutDispatch(task.workspaceID, task.executionID, task.nodeExecutionID, *result.Result)
}

func (service *Service) applyRecoveredTerminalAction(task actionRecoveryTask, result ActionRecoverResult, runnerEvents []RunnerEvent) (WorkflowExecution, error) {
	execution, recorded, err := service.recordActionRecovery(task.workspaceID, task.executionID, task.nodeExecutionID, recoveryMetadataFromResult(result), runnerEvents)
	if err != nil || !recorded {
		return execution, err
	}
	return service.completeActionWithoutDispatch(task.workspaceID, task.executionID, task.nodeExecutionID, terminalActionResultFromRecovery(result))
}

func (service *Service) applyFailedInterruptedRecovery(task actionRecoveryTask, result ActionRecoverResult, runnerEvents []RunnerEvent) (WorkflowExecution, error) {
	if sideEffectPolicyRequiresManualRecovery(task.request.NodeExecution.SideEffectPolicy) {
		return service.recordManualRecoveryRequired(task.workspaceID, task.executionID, task.nodeExecutionID, result.RunnerRefs, runnerEvents, task.request.NodeExecution, nonEmpty(result.Message, "workflow action was interrupted with uncertain side effects"))
	}
	execution, recorded, err := service.recordActionRecovery(task.workspaceID, task.executionID, task.nodeExecutionID, recoveryMetadataFromResult(result), runnerEvents)
	if err != nil || !recorded {
		return execution, err
	}
	return service.completeActionWithoutDispatch(task.workspaceID, task.executionID, task.nodeExecutionID, WorkflowActionResult{
		Status: ActionCompletionFailed,
		Error:  nonEmpty(result.Message, "workflow action was interrupted before recovery could reconcile runner state"),
	})
}

func (service *Service) recordActionRecovery(workspaceID string, executionID string, nodeExecutionID string, metadata WorkflowActionRecoveryMetadata, runnerEvents []RunnerEvent) (WorkflowExecution, bool, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	execution, err := service.store.LoadExecution(workspaceID, executionID)
	if err != nil {
		return WorkflowExecution{}, false, err
	}
	if execution.Status != ExecutionStatusRunning {
		return execution, false, nil
	}
	nodeExecution := nodeExecutionByID(execution, nodeExecutionID)
	if nodeExecution.ID == "" || !isActiveNodeExecutionStatus(nodeExecution.Status) {
		return execution, false, nil
	}
	events := []WorkflowEvent{}
	if len(runnerEvents) > 0 {
		runnerTransition, err := ApplyRunnerEvents(execution, nodeExecutionID, runnerEvents, service.transitionContext())
		if err != nil {
			return WorkflowExecution{}, false, err
		}
		execution = runnerTransition.Execution
		events = append(events, runnerTransition.Events...)
	}
	recoveryTransition, err := RecordActionRecovery(execution, nodeExecutionID, metadata, service.transitionContext())
	if err != nil {
		return WorkflowExecution{}, false, err
	}
	events = append(events, recoveryTransition.Events...)
	transition := WorkflowTransition{Execution: recoveryTransition.Execution, Events: events}
	if err := service.persistTransition(transition); err != nil {
		return WorkflowExecution{}, false, err
	}
	return transition.Execution, true, nil
}

func (service *Service) recordManualRecoveryRequired(workspaceID string, executionID string, nodeExecutionID string, refs []WorkflowActionRunnerRef, runnerEvents []RunnerEvent, nodeExecution WorkflowNodeExecution, message string) (WorkflowExecution, error) {
	metadata := WorkflowActionRecoveryMetadata{
		Outcome:    RunnerRecoveryOutcomeManualRecoveryRequired,
		Message:    nonEmpty(message, "workflow action requires manual recovery"),
		RunnerRefs: refs,
	}
	if nodeExecution.RunnerState != nil {
		state := *nodeExecution.RunnerState
		state.Status = RunnerStateStatusRecoveryRequired
		metadata.RunnerState = &state
	}
	execution, _, err := service.recordActionRecovery(workspaceID, executionID, nodeExecutionID, metadata, runnerEvents)
	return execution, err
}

func (service *Service) recordRecoveryFailure(task actionRecoveryTask, message string, runnerEvents []RunnerEvent) (WorkflowExecution, error) {
	if sideEffectPolicyRequiresManualRecovery(task.request.NodeExecution.SideEffectPolicy) {
		return service.recordManualRecoveryRequired(task.workspaceID, task.executionID, task.nodeExecutionID, task.request.RunnerRefs, runnerEvents, task.request.NodeExecution, message)
	}
	result := ActionRecoverResult{
		Outcome:    RunnerRecoveryOutcomeFailedInterrupted,
		RunnerRefs: task.request.RunnerRefs,
		Message:    message,
	}
	return service.applyActionRecoveryResult(task, result, runnerEvents)
}

func recoveryMetadataFromResult(result ActionRecoverResult) WorkflowActionRecoveryMetadata {
	return WorkflowActionRecoveryMetadata{
		Outcome:     result.Outcome,
		Message:     result.Message,
		RunnerRefs:  result.RunnerRefs,
		RunnerState: result.RunnerState,
	}
}

func terminalActionResultFromRecovery(result ActionRecoverResult) WorkflowActionResult {
	if result.Result != nil {
		return *result.Result
	}
	switch result.Outcome {
	case RunnerRecoveryOutcomeRecoveredCompleted:
		return WorkflowActionResult{Status: ActionCompletionCompleted}
	default:
		return WorkflowActionResult{
			Status: ActionCompletionFailed,
			Error:  nonEmpty(result.Message, "workflow action runner recovered a failed terminal state"),
		}
	}
}

func recoveryResultMatchesExistingApproval(nodeExecution WorkflowNodeExecution, result WorkflowActionResult) bool {
	if nodeExecution.Status != NodeExecutionStatusWaitingApproval ||
		nodeExecution.Result == nil ||
		nodeExecution.Result.PendingApproval == nil ||
		result.PendingApproval == nil {
		return false
	}
	return nodeExecution.Result.PendingApproval.ApprovalID == result.PendingApproval.ApprovalID
}

func sideEffectPolicyRequiresManualRecovery(policy *SideEffectPolicy) bool {
	if policy == nil {
		return false
	}
	switch policy.Kind {
	case SideEffectPolicyKindAtLeastOnce, SideEffectPolicyKindRequiresApproval, SideEffectPolicyKindManualRecovery, SideEffectPolicyKindCompensatable:
		return true
	default:
		return false
	}
}

func cloneRunnerState(state *WorkflowRunnerState) *WorkflowRunnerState {
	if state == nil {
		return nil
	}
	cloned := *state
	return &cloned
}

func (service *Service) dispatchStartupReadyActions(targets []workflowDispatchTarget) error {
	seen := map[workflowDispatchTarget]bool{}
	for _, target := range targets {
		if seen[target] {
			continue
		}
		seen[target] = true
		if _, err := service.dispatchReadyActions(target.workspaceID, target.executionID); err != nil {
			return err
		}
	}
	return nil
}
