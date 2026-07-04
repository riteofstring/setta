package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/chat"
)

type actionCancelDispatch struct {
	runner  ActionRunner
	request ActionCancelRequest
}

type actionCancelFailure struct {
	request ActionCancelRequest
	err     error
}

type bufferingRunnerEventSink struct {
	events []RunnerEvent
}

func (sink *bufferingRunnerEventSink) EmitRunnerEvent(event RunnerEvent) error {
	sink.events = append(sink.events, event)
	return nil
}

func (sink *bufferingRunnerEventSink) Events() []RunnerEvent {
	return append([]RunnerEvent{}, sink.events...)
}

func buildActionStartRequest(workspaceID string, execution WorkflowExecution, node WorkflowNode, nodeExecution WorkflowNodeExecution, descriptor ActionRunnerDescriptor, context TransitionContext) (WorkflowActionStartMetadata, ActionStartRequest, error) {
	if node.Action == nil {
		return WorkflowActionStartMetadata{}, ActionStartRequest{}, fmt.Errorf("action node %s has no action config", node.ID)
	}
	policy, err := workflowActionPolicyForConfig(*node.Action)
	if err != nil {
		return WorkflowActionStartMetadata{}, ActionStartRequest{}, err
	}
	capabilities, err := descriptor.Capabilities(*node.Action)
	if err != nil {
		return WorkflowActionStartMetadata{}, ActionStartRequest{}, err
	}
	input, inputHash, err := workflowActionInputForStart(execution, node, nodeExecution, policy)
	if err != nil {
		return WorkflowActionStartMetadata{}, ActionStartRequest{}, err
	}
	runnerKind := descriptor.Kind()
	runnerState := initialRunnerState(workspaceID, execution, nodeExecution, runnerKind, context.Now)
	metadata := WorkflowActionStartMetadata{
		RunnerKind:       runnerKind,
		RunnerRefs:       []WorkflowActionRunnerRef{},
		Policy:           &policy,
		SideEffectPolicy: &policy.SideEffectPolicy,
		Capabilities:     &capabilities,
		InputHash:        inputHash,
		Input:            input,
		RunnerState:      &runnerState,
		ActivityRefs:     []WorkflowActivityRef{},
	}
	request := ActionStartRequest{
		WorkspaceID:         workspaceID,
		DefinitionID:        execution.DefinitionID,
		DefinitionVersionID: execution.DefinitionVersionID,
		Execution:           execution,
		Node:                node,
		NodeExecution:       nodeExecution,
		Policy:              policy,
		Capabilities:        capabilities,
		InputHash:           inputHash,
		Input:               input,
	}
	return metadata, request, nil
}

func (service *Service) dispatchReadyActions(workspaceID string, executionID string) (WorkflowExecution, error) {
	for {
		runner, request, execution, ok, err := service.beginNextReadyActionStart(workspaceID, executionID)
		if err != nil || !ok {
			return execution, err
		}
		sink := &bufferingRunnerEventSink{}
		start, err := runner.Start(context.Background(), request, sink)
		if err != nil {
			return service.completeActionWithoutDispatch(workspaceID, executionID, request.NodeExecution.ID, WorkflowActionResult{
				Status: ActionCompletionFailed,
				Error:  fmt.Sprintf("start action runner: %v", err),
			})
		}
		if len(start.RunnerRefs) == 0 {
			err := fmt.Errorf("action runner %s started node execution %s without runner refs", runner.Kind(), request.NodeExecution.ID)
			return service.cleanupActionRunnerPostStartFailure(workspaceID, executionID, request, start.RunnerRefs, runner, err, true)
		}
		execution, cancelDispatch, err := service.attachRunnerRefsAfterStart(workspaceID, executionID, request.NodeExecution.ID, start.RunnerRefs, sink.Events(), runner)
		if err != nil {
			return service.cleanupActionRunnerPostStartFailure(workspaceID, executionID, request, start.RunnerRefs, runner, err, false)
		}
		if cancelDispatch != nil {
			if err := service.cancelActionRunners([]actionCancelDispatch{*cancelDispatch}); err != nil {
				return execution, err
			}
			return execution, nil
		}
	}
}

func (service *Service) cleanupActionRunnerPostStartFailure(workspaceID string, executionID string, request ActionStartRequest, refs []WorkflowActionRunnerRef, runner ActionRunner, postStartErr error, identityMissing bool) (WorkflowExecution, error) {
	cancelDispatch := actionCancelDispatchForStartedRunner(workspaceID, executionID, request, refs, runner)
	var cancelErr error
	if !identityMissing {
		cancelFailures := service.cancelActionRunnersCollectFailures([]actionCancelDispatch{cancelDispatch})
		cancelErr = actionCancelFailuresError(cancelFailures)
	}
	if identityMissing || cancelErr != nil {
		message := postStartManualRecoveryMessage(postStartErr, cancelErr, identityMissing)
		execution, err := service.recordManualRecoveryRequired(workspaceID, executionID, request.NodeExecution.ID, refs, nil, cancelDispatch.request.NodeExecution, message)
		if err != nil {
			return WorkflowExecution{}, fmt.Errorf("record manual recovery after action runner post-start failure for node execution %s: %w", request.NodeExecution.ID, errors.Join(postStartErr, cancelErr, err))
		}
		return execution, fmt.Errorf("action runner post-start commit failed for node execution %s; manual recovery required: %s: %w", request.NodeExecution.ID, message, errors.Join(postStartErr, cancelErr))
	}

	message := fmt.Sprintf("action runner post-start commit failed: %v", postStartErr)
	execution, err := service.failActionAfterRunnerPostStartFailure(workspaceID, executionID, request.NodeExecution.ID, refs, message)
	if err != nil {
		return execution, fmt.Errorf("fail action after action runner post-start failure for node execution %s: %w", request.NodeExecution.ID, errors.Join(postStartErr, err))
	}
	return execution, fmt.Errorf("action runner post-start commit failed for node execution %s after runner cancellation: %w", request.NodeExecution.ID, postStartErr)
}

func actionCancelDispatchForStartedRunner(workspaceID string, executionID string, request ActionStartRequest, refs []WorkflowActionRunnerRef, runner ActionRunner) actionCancelDispatch {
	nodeExecution := request.NodeExecution
	nodeExecution.RunnerRefs = mergeRunnerRefs(nodeExecution.RunnerRefs, refs)
	return actionCancelDispatch{
		runner: runner,
		request: ActionCancelRequest{
			WorkspaceID:   workspaceID,
			ExecutionID:   executionID,
			NodeExecution: nodeExecution,
			RunnerRefs:    append([]WorkflowActionRunnerRef{}, nodeExecution.RunnerRefs...),
		},
	}
}

func postStartManualRecoveryMessage(postStartErr error, cancelErr error, identityMissing bool) string {
	message := "workflow action runner post-start commit failed"
	if identityMissing {
		message = runnerIdentityNotCommittedMessage
	}
	if postStartErr != nil {
		message = fmt.Sprintf("%s: %v", message, postStartErr)
	}
	if cancelErr != nil {
		message = fmt.Sprintf("%s; cancel error: %v", message, cancelErr)
	}
	return message
}

func (service *Service) failActionAfterRunnerPostStartFailure(workspaceID string, executionID string, nodeExecutionID string, refs []WorkflowActionRunnerRef, message string) (WorkflowExecution, error) {
	service.mu.Lock()
	execution, cancelDispatches, err := service.completeActionLocked(workspaceID, executionID, nodeExecutionID, WorkflowActionResult{
		Status: ActionCompletionFailed,
		Error:  message,
	}, refs, nil)
	service.mu.Unlock()
	if err != nil {
		return WorkflowExecution{}, err
	}
	if err := service.cancelActionRunners(cancelDispatches); err != nil {
		return execution, err
	}
	return execution, nil
}

func (service *Service) beginNextReadyActionStart(workspaceID string, executionID string) (ActionRunner, ActionStartRequest, WorkflowExecution, bool, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	execution, version, err := service.loadExecutionAndVersion(workspaceID, executionID)
	if err != nil {
		return nil, ActionStartRequest{}, WorkflowExecution{}, false, err
	}
	if execution.Status != ExecutionStatusRunning {
		return nil, ActionStartRequest{}, execution, false, nil
	}
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.Status != NodeExecutionStatusReady || nodeExecution.ActionKind == nil {
			continue
		}
		runner, ok := service.runnerRegistry.Runner(*nodeExecution.ActionKind)
		if !ok {
			continue
		}
		node, ok := nodeByID(version.Graph, nodeExecution.NodeID)
		if !ok {
			return nil, ActionStartRequest{}, WorkflowExecution{}, false, fmt.Errorf("node execution %s references unknown node %s", nodeExecution.ID, nodeExecution.NodeID)
		}
		metadata, request, err := buildActionStartRequest(workspaceID, execution, node, nodeExecution, runner, service.transitionContext())
		if err != nil {
			return nil, ActionStartRequest{}, WorkflowExecution{}, false, err
		}
		transition, err := StartAction(execution, nodeExecution.ID, metadata, service.transitionContext())
		if err != nil {
			return nil, ActionStartRequest{}, WorkflowExecution{}, false, err
		}
		if err := service.persistTransition(transition); err != nil {
			return nil, ActionStartRequest{}, WorkflowExecution{}, false, err
		}
		startedNodeExecution := nodeExecutionByID(transition.Execution, nodeExecution.ID)
		request.Execution = transition.Execution
		request.NodeExecution = startedNodeExecution
		return runner, request, transition.Execution, true, nil
	}
	return nil, ActionStartRequest{}, execution, false, nil
}

func (service *Service) attachRunnerRefsAfterStart(workspaceID string, executionID string, nodeExecutionID string, refs []WorkflowActionRunnerRef, runnerEvents []RunnerEvent, runner ActionRunner) (WorkflowExecution, *actionCancelDispatch, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	execution, err := service.store.LoadExecution(workspaceID, executionID)
	if err != nil {
		return WorkflowExecution{}, nil, err
	}
	index := nodeExecutionIndex(execution, nodeExecutionID)
	if index < 0 {
		return WorkflowExecution{}, nil, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	events := []WorkflowEvent{}
	if len(runnerEvents) > 0 {
		transition, err := ApplyRunnerEvents(execution, nodeExecutionID, runnerEvents, service.transitionContext())
		if err != nil {
			return WorkflowExecution{}, nil, err
		}
		execution = transition.Execution
		events = append(events, transition.Events...)
	}
	attachTransition, err := AttachRunnerRefs(execution, nodeExecutionID, refs, service.transitionContext())
	if err != nil {
		return WorkflowExecution{}, nil, err
	}
	events = append(events, attachTransition.Events...)
	transition := WorkflowTransition{Execution: attachTransition.Execution, Events: events}
	if err := service.persistTransition(transition); err != nil {
		return WorkflowExecution{}, nil, err
	}
	nodeExecution := transition.Execution.NodeExecutions[index]
	if transition.Execution.Status == ExecutionStatusRunning && isActiveNodeExecutionStatus(nodeExecution.Status) {
		return transition.Execution, nil, nil
	}
	return transition.Execution, &actionCancelDispatch{
		runner: runner,
		request: ActionCancelRequest{
			WorkspaceID:   workspaceID,
			ExecutionID:   executionID,
			NodeExecution: nodeExecution,
			RunnerRefs:    append([]WorkflowActionRunnerRef{}, nodeExecution.RunnerRefs...),
		},
	}, nil
}

func (service *Service) completeActionWithoutDispatch(workspaceID string, executionID string, nodeExecutionID string, result WorkflowActionResult) (WorkflowExecution, error) {
	service.mu.Lock()
	execution, cancelDispatches, err := service.completeActionLocked(workspaceID, executionID, nodeExecutionID, result, nil, nil)
	service.mu.Unlock()
	if err != nil {
		return WorkflowExecution{}, err
	}
	if err := service.cancelActionRunners(cancelDispatches); err != nil {
		return execution, err
	}
	return execution, nil
}

func (service *Service) completeChatActionRun(workspaceID string, executionID string, nodeExecutionID string, result WorkflowActionResult, refs []WorkflowActionRunnerRef, runnerEvents []RunnerEvent) (WorkflowExecution, error) {
	service.mu.Lock()
	execution, cancelDispatches, err := service.completeActionLocked(workspaceID, executionID, nodeExecutionID, result, refs, runnerEvents)
	service.mu.Unlock()
	if err != nil {
		return WorkflowExecution{}, err
	}
	if err := service.cancelActionRunners(cancelDispatches); err != nil {
		return execution, err
	}
	return execution, nil
}

func (service *Service) completeActionLocked(workspaceID string, executionID string, nodeExecutionID string, result WorkflowActionResult, refs []WorkflowActionRunnerRef, runnerEvents []RunnerEvent) (WorkflowExecution, []actionCancelDispatch, error) {
	execution, version, err := service.loadExecutionAndVersion(workspaceID, executionID)
	if err != nil {
		return WorkflowExecution{}, nil, err
	}
	if execution.Status != ExecutionStatusRunning {
		return execution, nil, nil
	}
	index := nodeExecutionIndex(execution, nodeExecutionID)
	if index < 0 {
		return WorkflowExecution{}, nil, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	execution, ok, err := service.prepareActionCompletionStateLocked(workspaceID, execution, version.Graph, nodeExecutionID, index, refs)
	if err != nil || !ok {
		return execution, nil, err
	}
	execution, err = service.persistRunnerEventsForCompletionLocked(execution, nodeExecutionID, runnerEvents)
	if err != nil {
		return WorkflowExecution{}, nil, err
	}
	cancelDispatches := service.activeActionCancelRequestsLocked(workspaceID, execution, nodeExecutionID)
	transition, err := CompleteAction(execution, version.Graph, nodeExecutionID, result, service.transitionContext())
	if err != nil {
		return WorkflowExecution{}, nil, err
	}
	if err := service.persistTransition(transition); err != nil {
		return WorkflowExecution{}, nil, err
	}
	if !isTerminalExecutionStatus(transition.Execution.Status) {
		cancelDispatches = nil
	}
	return transition.Execution, cancelDispatches, nil
}

func (service *Service) prepareActionCompletionStateLocked(workspaceID string, execution WorkflowExecution, graph WorkflowGraph, nodeExecutionID string, nodeExecutionIndex int, refs []WorkflowActionRunnerRef) (WorkflowExecution, bool, error) {
	switch execution.NodeExecutions[nodeExecutionIndex].Status {
	case NodeExecutionStatusReady:
		started, err := service.startReadyActionForCompletionLocked(workspaceID, execution, graph, nodeExecutionID, nodeExecutionIndex, refs)
		return started, true, err
	case NodeExecutionStatusRunning, NodeExecutionStatusWaitingApproval:
		execution.NodeExecutions[nodeExecutionIndex].RunnerRefs = mergeRunnerRefs(execution.NodeExecutions[nodeExecutionIndex].RunnerRefs, refs)
		return execution, true, nil
	default:
		return execution, false, nil
	}
}

func (service *Service) startReadyActionForCompletionLocked(workspaceID string, execution WorkflowExecution, graph WorkflowGraph, nodeExecutionID string, nodeExecutionIndex int, refs []WorkflowActionRunnerRef) (WorkflowExecution, error) {
	nodeExecution := execution.NodeExecutions[nodeExecutionIndex]
	node, ok := nodeByID(graph, nodeExecution.NodeID)
	if !ok {
		return WorkflowExecution{}, fmt.Errorf("node execution %s references unknown node %s", nodeExecutionID, nodeExecution.NodeID)
	}
	if nodeExecution.ActionKind == nil {
		return WorkflowExecution{}, fmt.Errorf("node execution %s has no action kind", nodeExecutionID)
	}
	descriptor, ok := service.runnerRegistry.Descriptor(*nodeExecution.ActionKind)
	if !ok {
		return WorkflowExecution{}, fmt.Errorf("node execution %s has no runner descriptor for %s", nodeExecutionID, *nodeExecution.ActionKind)
	}
	metadata, _, err := buildActionStartRequest(workspaceID, execution, node, nodeExecution, descriptor, service.transitionContext())
	if err != nil {
		return WorkflowExecution{}, err
	}
	metadata.RunnerRefs = mergeRunnerRefs(metadata.RunnerRefs, refs)
	startTransition, err := StartAction(execution, nodeExecutionID, metadata, service.transitionContext())
	if err != nil {
		return WorkflowExecution{}, err
	}
	if err := service.persistTransition(startTransition); err != nil {
		return WorkflowExecution{}, err
	}
	return startTransition.Execution, nil
}

func (service *Service) persistRunnerEventsForCompletionLocked(execution WorkflowExecution, nodeExecutionID string, runnerEvents []RunnerEvent) (WorkflowExecution, error) {
	if len(runnerEvents) > 0 {
		runnerTransition, err := ApplyRunnerEvents(execution, nodeExecutionID, runnerEvents, service.transitionContext())
		if err != nil {
			return WorkflowExecution{}, err
		}
		execution = runnerTransition.Execution
		if err := service.persistTransition(runnerTransition); err != nil {
			return WorkflowExecution{}, err
		}
	}
	return execution, nil
}

func (service *Service) recordRunnerEvents(workspaceID string, executionID string, nodeExecutionID string, runnerEvents []RunnerEvent) (WorkflowExecution, error) {
	if len(runnerEvents) == 0 {
		return service.store.LoadExecution(workspaceID, executionID)
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	execution, err := service.store.LoadExecution(workspaceID, executionID)
	if err != nil {
		return WorkflowExecution{}, err
	}
	transition, err := ApplyRunnerEvents(execution, nodeExecutionID, runnerEvents, service.transitionContext())
	if err != nil {
		return WorkflowExecution{}, err
	}
	if err := service.persistTransition(transition); err != nil {
		return WorkflowExecution{}, err
	}
	return transition.Execution, nil
}

func (service *Service) cancelActionRunners(requests []actionCancelDispatch) error {
	return actionCancelFailuresError(service.cancelActionRunnersCollectFailures(requests))
}

func actionCancelFailuresError(failures []actionCancelFailure) error {
	if len(failures) == 0 {
		return nil
	}
	errs := make([]error, 0, len(failures))
	for _, failure := range failures {
		errs = append(errs, fmt.Errorf(
			"cancel action runner for node execution %s: %w",
			failure.request.NodeExecution.ID,
			failure.err,
		))
	}
	return errors.Join(errs...)
}

func (service *Service) cancelActionRunnersCollectFailures(requests []actionCancelDispatch) []actionCancelFailure {
	failures := []actionCancelFailure{}
	for _, item := range requests {
		if err := item.runner.Cancel(context.Background(), item.request); err != nil {
			failures = append(failures, actionCancelFailure{
				request: item.request,
				err:     err,
			})
		}
	}
	return failures
}

func (service *Service) recordRunnerCancelFailureDiagnostics(workspaceID string, cancelled WorkflowExecution, failures []actionCancelFailure) error {
	if len(failures) == 0 {
		return nil
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	execution, err := service.store.LoadExecution(workspaceID, cancelled.ID)
	if err != nil {
		return err
	}
	events := []WorkflowEvent{}
	context := service.transitionContext()
	nextOrdinalsByNodeExecutionID := map[string]int{}
	for _, failure := range failures {
		if err := appendRunnerCancelFailureDiagnostic(&execution, &events, context, nextOrdinalsByNodeExecutionID, failure); err != nil {
			return err
		}
	}
	return service.persistTransition(WorkflowTransition{Execution: execution, Events: events})
}

func appendRunnerCancelFailureDiagnostic(execution *WorkflowExecution, events *[]WorkflowEvent, context TransitionContext, nextOrdinalsByNodeExecutionID map[string]int, failure actionCancelFailure) error {
	nodeExecution := nodeExecutionByID(*execution, failure.request.NodeExecution.ID)
	if nodeExecution.ID == "" {
		return fmt.Errorf("node execution %s was not found", failure.request.NodeExecution.ID)
	}
	runnerKind, ok := nodeExecutionRunnerKind(nodeExecution)
	if !ok {
		return fmt.Errorf("node execution %s has no runner kind", nodeExecution.ID)
	}
	runnerEventID, err := context.NewID("workflow_runner_event")
	if err != nil {
		return fmt.Errorf("create runner cancel failure event id: %w", err)
	}
	message := fmt.Sprintf("workflow runner cancel failed after execution cancellation: %v", failure.err)
	payload, err := json.Marshal(RunnerAttemptFailedPayload{
		ErrorCode: "workflow_runner_cancel_failed",
		Message:   message,
		Retryable: false,
	})
	if err != nil {
		return fmt.Errorf("encode runner cancel failure payload: %w", err)
	}
	ordinal := nextOrdinalsByNodeExecutionID[nodeExecution.ID]
	if ordinal == 0 {
		ordinal = nextRunnerEventOrdinal(nodeExecution)
	}
	nextOrdinalsByNodeExecutionID[nodeExecution.ID] = ordinal + 1
	runnerEvent := RunnerEvent{
		SchemaVersion:      SchemaVersion,
		ID:                 runnerEventID,
		WorkspaceID:        execution.WorkspaceID,
		ExecutionID:        execution.ID,
		NodeID:             nodeExecution.NodeID,
		NodeExecutionID:    nodeExecution.ID,
		RunnerKind:         runnerKind,
		RunnerEventOrdinal: ordinal,
		OccurredAt:         context.Now,
		Type:               RunnerEventAttemptFailed,
		Payload:            payload,
	}
	details, err := json.Marshal(struct {
		Nonfatal    bool        `json:"nonfatal"`
		RunnerEvent RunnerEvent `json:"runnerEvent"`
	}{Nonfatal: true, RunnerEvent: runnerEvent})
	if err != nil {
		return fmt.Errorf("encode runner cancel failure details: %w", err)
	}
	return appendEvent(execution, events, context, EventRunnerAttemptFailed, WorkflowEvent{
		NodeID:          nodeExecution.NodeID,
		NodeExecutionID: nodeExecution.ID,
		RunnerKind:      &runnerKind,
		Message:         message,
		Details:         details,
	})
}

func (service *Service) activeActionCancelRequestsLocked(workspaceID string, execution WorkflowExecution, excludedNodeExecutionID string) []actionCancelDispatch {
	if execution.Status != ExecutionStatusRunning {
		return []actionCancelDispatch{}
	}
	requests := []actionCancelDispatch{}
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.ID == excludedNodeExecutionID ||
			nodeExecution.ActionKind == nil ||
			!isActiveNodeExecutionStatus(nodeExecution.Status) {
			continue
		}
		runner, ok := service.runnerRegistry.Runner(*nodeExecution.ActionKind)
		if !ok {
			continue
		}
		requests = append(requests, actionCancelDispatch{
			runner: runner,
			request: ActionCancelRequest{
				WorkspaceID:   workspaceID,
				ExecutionID:   execution.ID,
				NodeExecution: nodeExecution,
				RunnerRefs:    append([]WorkflowActionRunnerRef{}, nodeExecution.RunnerRefs...),
			},
		})
	}
	return requests
}

func (service *Service) startChatEventReconciler() error {
	subscription, err := service.codexChatService.SubscribeEvents(chat.EventCursor{})
	if err != nil {
		return err
	}
	service.chatSubscription = subscription
	go service.reconcileChatEvents(subscription.Events)
	return nil
}

func (service *Service) reconcileChatEvents(events <-chan chat.Event) {
	for event := range events {
		if event.Type != chat.EventTypeRunUpdated {
			continue
		}
		var payload chat.RunUpdatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			continue
		}
		service.reconcileChatRun(payload.Run)
	}
}

func (service *Service) reconcileChatRun(run chat.Run) {
	switch run.Status {
	case chat.RunStatusRunning:
		if run.PendingApproval != nil {
			service.reconcileChatRunApproval(run)
		}
	case chat.RunStatusCompleted, chat.RunStatusFailed, chat.RunStatusCancelled:
		service.reconcileTerminalChatRun(run)
	}
}

func (service *Service) reconcileChatRunApproval(run chat.Run) {
	owner, ok, err := service.workflowRunOwner(run)
	if err != nil || !ok {
		return
	}
	refs := workflowRunRefs(run, owner.conversation)
	pending := workflowPendingApprovalFromChatRun(owner, run)
	runnerEvents, err := runnerEventsFromChatApprovalRequest(owner, run, pending)
	if err != nil {
		return
	}
	_, _ = service.completeChatActionRun(run.WorkspaceID, owner.execution.ID, owner.nodeExecution.ID, WorkflowActionResult{
		Status:          ActionCompletionRequiresApproval,
		PendingApproval: pending,
	}, refs, runnerEvents)
}

func (service *Service) reconcileTerminalChatRun(run chat.Run) {
	_, _, _ = service.completeTerminalWorkflowChatRun(run)
}

func (service *Service) completeTerminalWorkflowChatRun(run chat.Run) (WorkflowExecution, bool, error) {
	execution, ok, err := service.completeWorkflowActionForTerminalChatRun(run)
	if err != nil || !ok {
		return execution, ok, err
	}
	if execution.Status != ExecutionStatusRunning {
		return execution, true, nil
	}
	execution, err = service.dispatchReadyActions(run.WorkspaceID, execution.ID)
	return execution, true, err
}

func (service *Service) completeWorkflowActionForTerminalChatRun(run chat.Run) (WorkflowExecution, bool, error) {
	owner, ok, err := service.workflowRunOwner(run)
	if err != nil || !ok {
		return WorkflowExecution{}, ok, err
	}
	activity, err := service.codexChatService.LoadRunActivityPage(run.WorkspaceID, run.ID, 1000)
	var result WorkflowActionResult
	if err != nil {
		result = workflowActionResultFromChatRunReconcileError(run, fmt.Sprintf("load chat run activity: %v", err))
	} else {
		result, err = workflowActionResultFromChatRun(run, activity)
		if err != nil {
			result = workflowActionResultFromChatRunReconcileError(run, fmt.Sprintf("decode workflow result: %v", err))
		}
	}
	refs := workflowRunRefs(run, owner.conversation)
	runnerEvents, err := runnerEventsFromTerminalChatRun(owner, result)
	if err != nil {
		return WorkflowExecution{}, true, err
	}
	execution, err := service.completeChatActionRun(run.WorkspaceID, owner.execution.ID, owner.nodeExecution.ID, result, refs, runnerEvents)
	return execution, true, err
}

func (service *Service) workflowRunOwner(run chat.Run) (workflowRunOwner, bool, error) {
	owner, ok, err := service.workflowRunOwnerFromRunnerRefs(run)
	if err != nil || ok {
		return owner, ok, err
	}
	page, err := service.codexChatService.LoadMessagePage(run.WorkspaceID, run.ConversationID, 0, 1)
	if err != nil {
		return workflowRunOwner{}, false, err
	}
	if !page.Conversation.Internal || page.Conversation.Workflow == nil {
		return workflowRunOwner{}, false, nil
	}
	owner, ok, err = service.workflowRunOwnerFromMetadata(run.WorkspaceID, page.Conversation.Workflow)
	if err != nil || !ok {
		return workflowRunOwner{}, ok, err
	}
	owner.conversation = page.Conversation
	return owner, true, nil
}

type workflowRunOwner struct {
	conversation  chat.Conversation
	execution     WorkflowExecution
	nodeExecution WorkflowNodeExecution
}

func (service *Service) workflowRunOwnerFromRunnerRefs(run chat.Run) (workflowRunOwner, bool, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	executions, err := service.store.ListExecutions(run.WorkspaceID)
	if err != nil {
		return workflowRunOwner{}, false, err
	}
	for _, execution := range executions {
		if execution.Status != ExecutionStatusRunning {
			continue
		}
		for _, nodeExecution := range execution.NodeExecutions {
			if runnerRefValue(nodeExecution.RunnerRefs, RunnerRefChatConversation) != run.ConversationID ||
				runnerRefValue(nodeExecution.RunnerRefs, RunnerRefChatRun) != run.ID {
				continue
			}
			page, err := service.codexChatService.LoadMessagePage(run.WorkspaceID, run.ConversationID, 0, 1)
			if err != nil {
				return workflowRunOwner{}, false, err
			}
			return workflowRunOwner{
				conversation:  page.Conversation,
				execution:     execution,
				nodeExecution: nodeExecution,
			}, true, nil
		}
	}
	return workflowRunOwner{}, false, nil
}

func (service *Service) workflowRunOwnerFromMetadata(workspaceID string, metadata *chat.ConversationWorkflowMetadata) (workflowRunOwner, bool, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	execution, err := service.store.LoadExecution(workspaceID, metadata.ExecutionID)
	if err != nil {
		return workflowRunOwner{}, false, err
	}
	if execution.Status != ExecutionStatusRunning {
		return workflowRunOwner{}, false, nil
	}
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.ID == metadata.NodeExecutionID {
			return workflowRunOwner{
				execution:     execution,
				nodeExecution: nodeExecution,
			}, true, nil
		}
	}
	return workflowRunOwner{}, false, nil
}

func workflowRunRefs(run chat.Run, conversation chat.Conversation) []WorkflowActionRunnerRef {
	refs := []WorkflowActionRunnerRef{
		{Kind: RunnerRefChatConversation, ID: run.ConversationID},
		{Kind: RunnerRefChatRun, ID: run.ID},
	}
	return append(refs, runnerRefsFromConversation(conversation)...)
}

func workflowPendingApprovalFromChatRun(owner workflowRunOwner, run chat.Run) *WorkflowPendingApproval {
	if run.PendingApproval == nil {
		return nil
	}
	approval := cloneWorkflowApprovalRequest(*run.PendingApproval)
	return &WorkflowPendingApproval{
		WorkspaceID:     run.WorkspaceID,
		ExecutionID:     owner.execution.ID,
		NodeID:          owner.nodeExecution.NodeID,
		NodeExecutionID: owner.nodeExecution.ID,
		ApprovalID:      approval.ID,
		Approval:        approval,
	}
}

func cloneWorkflowApprovalRequest(approval chat.ApprovalRequest) chat.ApprovalRequest {
	approval.Options = append([]string{}, approval.Options...)
	approval.Questions = append([]chat.ApprovalQuestion{}, approval.Questions...)
	if approval.StructuredInput != nil {
		structured := *approval.StructuredInput
		if structured.Schema != nil {
			structured.Schema = append([]byte{}, structured.Schema...)
		}
		if structured.Meta != nil {
			structured.Meta = append([]byte{}, structured.Meta...)
		}
		approval.StructuredInput = &structured
	}
	return approval
}
