package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"

	"setta/internal/chat"
)

type actionCancelDispatch struct {
	runner  ActionRunner
	request ActionCancelRequest
}

func (service *Service) dispatchReadyActions(workspaceID string, executionID string) (WorkflowExecution, error) {
	for {
		runner, request, execution, ok, err := service.beginNextReadyActionStart(workspaceID, executionID)
		if err != nil || !ok {
			return execution, err
		}
		start, err := runner.Start(context.Background(), request)
		if err != nil {
			return service.completeActionWithoutDispatch(workspaceID, executionID, request.NodeExecution.ID, WorkflowActionResult{
				Status: ActionCompletionFailed,
				Error:  fmt.Sprintf("start action runner: %v", err),
			})
		}
		execution, cancelDispatch, err := service.attachRunnerRefsAfterStart(workspaceID, executionID, request.NodeExecution.ID, start.RunnerRefs, runner)
		if err != nil {
			return WorkflowExecution{}, err
		}
		if cancelDispatch != nil {
			if err := service.cancelActionRunners([]actionCancelDispatch{*cancelDispatch}); err != nil {
				return execution, err
			}
			return execution, nil
		}
	}
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
		transition, err := StartAction(execution, nodeExecution.ID, []WorkflowActionRunnerRef{}, service.transitionContext())
		if err != nil {
			return nil, ActionStartRequest{}, WorkflowExecution{}, false, err
		}
		if err := service.persistTransition(transition); err != nil {
			return nil, ActionStartRequest{}, WorkflowExecution{}, false, err
		}
		startedNodeExecution := nodeExecutionByID(transition.Execution, nodeExecution.ID)
		return runner, ActionStartRequest{
			WorkspaceID:         workspaceID,
			DefinitionID:        execution.DefinitionID,
			DefinitionVersionID: execution.DefinitionVersionID,
			Execution:           transition.Execution,
			Node:                node,
			NodeExecution:       startedNodeExecution,
		}, transition.Execution, true, nil
	}
	return nil, ActionStartRequest{}, execution, false, nil
}

func (service *Service) attachRunnerRefsAfterStart(workspaceID string, executionID string, nodeExecutionID string, refs []WorkflowActionRunnerRef, runner ActionRunner) (WorkflowExecution, *actionCancelDispatch, error) {
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
	transition, err := AttachRunnerRefs(execution, nodeExecutionID, refs, service.transitionContext())
	if err != nil {
		return WorkflowExecution{}, nil, err
	}
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
	execution, cancelDispatches, err := service.completeActionLocked(workspaceID, executionID, nodeExecutionID, result, nil)
	service.mu.Unlock()
	if err != nil {
		return WorkflowExecution{}, err
	}
	if err := service.cancelActionRunners(cancelDispatches); err != nil {
		return execution, err
	}
	return execution, nil
}

func (service *Service) completeChatActionRun(workspaceID string, executionID string, nodeExecutionID string, result WorkflowActionResult, refs []WorkflowActionRunnerRef) (WorkflowExecution, error) {
	service.mu.Lock()
	execution, cancelDispatches, err := service.completeActionLocked(workspaceID, executionID, nodeExecutionID, result, refs)
	service.mu.Unlock()
	if err != nil {
		return WorkflowExecution{}, err
	}
	if err := service.cancelActionRunners(cancelDispatches); err != nil {
		return execution, err
	}
	return execution, nil
}

func (service *Service) completeActionLocked(workspaceID string, executionID string, nodeExecutionID string, result WorkflowActionResult, refs []WorkflowActionRunnerRef) (WorkflowExecution, []actionCancelDispatch, error) {
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
	switch execution.NodeExecutions[index].Status {
	case NodeExecutionStatusReady:
		startTransition, err := StartAction(execution, nodeExecutionID, refs, service.transitionContext())
		if err != nil {
			return WorkflowExecution{}, nil, err
		}
		if err := service.persistTransition(startTransition); err != nil {
			return WorkflowExecution{}, nil, err
		}
		execution = startTransition.Execution
	case NodeExecutionStatusRunning, NodeExecutionStatusWaitingApproval:
		execution.NodeExecutions[index].RunnerRefs = mergeRunnerRefs(execution.NodeExecutions[index].RunnerRefs, refs)
	default:
		return execution, nil, nil
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

func (service *Service) cancelActionRunners(requests []actionCancelDispatch) error {
	for _, item := range requests {
		if err := item.runner.Cancel(context.Background(), item.request); err != nil {
			return err
		}
	}
	return nil
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
	_, _ = service.completeChatActionRun(run.WorkspaceID, owner.execution.ID, owner.nodeExecution.ID, WorkflowActionResult{
		Status:          ActionCompletionRequiresApproval,
		PendingApproval: workflowPendingApprovalFromChatRun(owner, run),
	}, refs)
}

func (service *Service) reconcileTerminalChatRun(run chat.Run) {
	owner, ok, err := service.workflowRunOwner(run)
	if err != nil || !ok {
		return
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
	execution, err := service.completeChatActionRun(run.WorkspaceID, owner.execution.ID, owner.nodeExecution.ID, result, refs)
	if err != nil || execution.Status != ExecutionStatusRunning {
		return
	}
	_, _ = service.dispatchReadyActions(run.WorkspaceID, execution.ID)
}

type workflowRunOwner struct {
	conversation  chat.Conversation
	execution     WorkflowExecution
	nodeExecution WorkflowNodeExecution
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
