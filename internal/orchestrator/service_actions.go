package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"

	"setta/internal/chat"
)

func (service *Service) dispatchReadyActions(workspaceID string, executionID string) (WorkflowExecution, error) {
	for {
		runner, request, execution, ok, err := service.nextReadyActionStart(workspaceID, executionID)
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
		if _, _, err := service.startActionIfReady(workspaceID, executionID, request.NodeExecution.ID, start.RunnerRefs); err != nil {
			return WorkflowExecution{}, err
		}
	}
}

func (service *Service) nextReadyActionStart(workspaceID string, executionID string) (ActionRunner, ActionStartRequest, WorkflowExecution, bool, error) {
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
		return runner, ActionStartRequest{
			WorkspaceID:         workspaceID,
			DefinitionID:        execution.DefinitionID,
			DefinitionVersionID: execution.DefinitionVersionID,
			Execution:           execution,
			Node:                node,
			NodeExecution:       nodeExecution,
		}, execution, true, nil
	}
	return nil, ActionStartRequest{}, execution, false, nil
}

func (service *Service) startActionIfReady(workspaceID string, executionID string, nodeExecutionID string, refs []WorkflowActionRunnerRef) (WorkflowExecution, bool, error) {
	service.mu.Lock()
	defer service.mu.Unlock()

	execution, err := service.store.LoadExecution(workspaceID, executionID)
	if err != nil {
		return WorkflowExecution{}, false, err
	}
	index := nodeExecutionIndex(execution, nodeExecutionID)
	if index < 0 {
		return WorkflowExecution{}, false, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	if execution.NodeExecutions[index].Status != NodeExecutionStatusReady {
		return execution, false, nil
	}
	transition, err := StartAction(execution, nodeExecutionID, refs, service.transitionContext())
	if err != nil {
		return WorkflowExecution{}, false, err
	}
	if err := service.persistTransition(transition); err != nil {
		return WorkflowExecution{}, false, err
	}
	return transition.Execution, true, nil
}

func (service *Service) completeActionWithoutDispatch(workspaceID string, executionID string, nodeExecutionID string, result WorkflowActionResult) (WorkflowExecution, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.completeActionLocked(workspaceID, executionID, nodeExecutionID, result, nil)
}

func (service *Service) completeChatActionRun(workspaceID string, executionID string, nodeExecutionID string, result WorkflowActionResult, refs []WorkflowActionRunnerRef) (WorkflowExecution, error) {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.completeActionLocked(workspaceID, executionID, nodeExecutionID, result, refs)
}

func (service *Service) completeActionLocked(workspaceID string, executionID string, nodeExecutionID string, result WorkflowActionResult, refs []WorkflowActionRunnerRef) (WorkflowExecution, error) {
	execution, version, err := service.loadExecutionAndVersion(workspaceID, executionID)
	if err != nil {
		return WorkflowExecution{}, err
	}
	if execution.Status != ExecutionStatusRunning {
		return execution, nil
	}
	index := nodeExecutionIndex(execution, nodeExecutionID)
	if index < 0 {
		return WorkflowExecution{}, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	switch execution.NodeExecutions[index].Status {
	case NodeExecutionStatusReady:
		startTransition, err := StartAction(execution, nodeExecutionID, refs, service.transitionContext())
		if err != nil {
			return WorkflowExecution{}, err
		}
		if err := service.persistTransition(startTransition); err != nil {
			return WorkflowExecution{}, err
		}
		execution = startTransition.Execution
	case NodeExecutionStatusRunning, NodeExecutionStatusWaitingApproval:
		execution.NodeExecutions[index].RunnerRefs = mergeRunnerRefs(execution.NodeExecutions[index].RunnerRefs, refs)
	default:
		return execution, nil
	}
	transition, err := CompleteAction(execution, version.Graph, nodeExecutionID, result, service.transitionContext())
	if err != nil {
		return WorkflowExecution{}, err
	}
	if err := service.persistTransition(transition); err != nil {
		return WorkflowExecution{}, err
	}
	return transition.Execution, nil
}

func (service *Service) cancelActiveActionRunners(workspaceID string, executionID string) error {
	service.mu.Lock()
	execution, err := service.store.LoadExecution(workspaceID, executionID)
	if err != nil {
		service.mu.Unlock()
		return err
	}
	requests := []struct {
		runner  ActionRunner
		request ActionCancelRequest
	}{}
	if execution.Status == ExecutionStatusRunning {
		for _, nodeExecution := range execution.NodeExecutions {
			if nodeExecution.ActionKind == nil || !isActiveNodeExecutionStatus(nodeExecution.Status) {
				continue
			}
			runner, ok := service.runnerRegistry.Runner(*nodeExecution.ActionKind)
			if !ok {
				continue
			}
			requests = append(requests, struct {
				runner  ActionRunner
				request ActionCancelRequest
			}{
				runner: runner,
				request: ActionCancelRequest{
					WorkspaceID:   workspaceID,
					ExecutionID:   executionID,
					NodeExecution: nodeExecution,
					RunnerRefs:    append([]WorkflowActionRunnerRef{}, nodeExecution.RunnerRefs...),
				},
			})
		}
	}
	service.mu.Unlock()

	for _, item := range requests {
		if err := item.runner.Cancel(context.Background(), item.request); err != nil {
			return err
		}
	}
	return nil
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
		Status: ActionCompletionRequiresApproval,
	}, refs)
}

func (service *Service) reconcileTerminalChatRun(run chat.Run) {
	owner, ok, err := service.workflowRunOwner(run)
	if err != nil || !ok {
		return
	}
	activity, err := service.codexChatService.LoadRunActivityPage(run.WorkspaceID, run.ID, 1000)
	if err != nil {
		return
	}
	result, err := workflowActionResultFromChatRun(run, activity)
	if err != nil {
		return
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
