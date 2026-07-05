package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/chat"
)

const (
	defaultWorkflowTrajectoryTranscriptLimit = 80
	defaultWorkflowTrajectoryItemLimit       = 80
	defaultWorkflowTrajectoryOutputLimit     = 200
	maxWorkflowTrajectoryTranscriptPageSize  = 200
	maxWorkflowTrajectoryItemPageSize        = 500
	maxWorkflowTrajectoryOutputPageSize      = 500
)

type workflowAgentTrajectoryContext struct {
	Execution      WorkflowExecution
	NodeExecution  WorkflowNodeExecution
	ConversationID string
	RunID          string
}

func (service *Service) ReadWorkflowNodeTrajectory(workspaceID string, executionID string, nodeExecutionID string, beforeBlockOrdinal int, transcriptLimit int, afterItemID string, itemLimit int, outputLimit int) (WorkflowAgentTrajectoryPage, error) {
	if service.codexChatService == nil {
		return WorkflowAgentTrajectoryPage{}, errors.New("workflow agent trajectory requires Codex chat service")
	}
	transcriptLimit, itemLimit, outputLimit, err := service.prepareWorkflowNodeTrajectoryRequest(workspaceID, executionID, nodeExecutionID, beforeBlockOrdinal, transcriptLimit, afterItemID, itemLimit, outputLimit)
	if err != nil {
		return WorkflowAgentTrajectoryPage{}, err
	}
	context, err := service.workflowAgentTrajectoryContext(workspaceID, executionID, nodeExecutionID)
	if err != nil {
		return WorkflowAgentTrajectoryPage{}, err
	}
	run, err := service.workflowAgentTrajectoryRun(workspaceID, context.ConversationID, context.RunID)
	if err != nil {
		return WorkflowAgentTrajectoryPage{}, err
	}
	transcript, err := service.workflowAgentTrajectoryTranscript(workspaceID, context, beforeBlockOrdinal, transcriptLimit)
	if err != nil {
		return WorkflowAgentTrajectoryPage{}, err
	}
	activity, err := service.codexChatService.LoadRunActivityPage(workspaceID, context.RunID, afterItemID, itemLimit)
	if err != nil {
		return WorkflowAgentTrajectoryPage{}, fmt.Errorf("load workflow node run activity: %w", err)
	}
	outputPages, outputs, err := service.workflowAgentTrajectoryOutputState(workspaceID, context.RunID, activity.Items, outputLimit)
	if err != nil {
		return WorkflowAgentTrajectoryPage{}, err
	}
	activeRun, activeRunLiveness, err := service.workflowAgentTrajectoryActiveRun(workspaceID, context.ConversationID, context.RunID)
	if err != nil {
		return WorkflowAgentTrajectoryPage{}, err
	}
	return workflowAgentTrajectoryPage(context, run, transcript, activity, outputPages, outputs, activeRun, activeRunLiveness), nil
}

func (service *Service) StopWorkflowNodeRun(workspaceID string, executionID string, nodeExecutionID string) (WorkflowExecution, error) {
	context, err := service.workflowNodeStopContext(workspaceID, executionID, nodeExecutionID)
	if err != nil {
		return WorkflowExecution{}, err
	}
	cancelledRun, err := service.cancelWorkflowNodeActiveRun(workspaceID, context)
	if err != nil {
		return WorkflowExecution{}, err
	}
	return service.completeStoppedWorkflowNodeRun(workspaceID, executionID, cancelledRun)
}

func (service *Service) SteerWorkflowNodeRun(workspaceID string, executionID string, nodeExecutionID string, input chat.ChatInput) (chat.SteerMessageResult, error) {
	context, err := service.workflowNodeSteerContext(workspaceID, executionID, nodeExecutionID)
	if err != nil {
		return chat.SteerMessageResult{}, err
	}
	result, err := service.codexChatService.SteerActiveRunInputByID(workspaceID, context.ConversationID, context.RunID, input)
	if err != nil {
		return chat.SteerMessageResult{}, fmt.Errorf("steer workflow node chat run: %w", err)
	}
	return result, nil
}

func (service *Service) RetryWorkflowNodeRunLiveness(ctx context.Context, workspaceID string, executionID string, nodeExecutionID string) (chat.RunLivenessReconciliationResult, error) {
	context, err := service.workflowNodeRetryLivenessContext(workspaceID, executionID, nodeExecutionID)
	if err != nil {
		return chat.RunLivenessReconciliationResult{}, err
	}
	result, err := service.codexChatService.ReconcileActiveRunByID(ctx, workspaceID, context.ConversationID, context.RunID, chat.RunLivenessReasonUserRetry)
	if err != nil {
		return chat.RunLivenessReconciliationResult{}, fmt.Errorf("retry workflow node chat run liveness: %w", err)
	}
	return result, nil
}

func (service *Service) workflowNodeStopContext(workspaceID string, executionID string, nodeExecutionID string) (workflowAgentTrajectoryContext, error) {
	if service.codexChatService == nil {
		return workflowAgentTrajectoryContext{}, errors.New("workflow node stop requires Codex chat service")
	}
	if err := validateStopWorkflowNodeRunRequest(executionID, nodeExecutionID); err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	context, err := service.workflowAgentTrajectoryContext(workspaceID, executionID, nodeExecutionID)
	if err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	activeRun, liveness, err := service.workflowAgentTrajectoryActiveRun(workspaceID, context.ConversationID, context.RunID)
	if err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	if activeRun == nil {
		return workflowAgentTrajectoryContext{}, fmt.Errorf("workflow node execution %s run %s is not active", nodeExecutionID, context.RunID)
	}
	if liveness == nil || !liveness.Cancellable {
		return workflowAgentTrajectoryContext{}, fmt.Errorf("workflow node execution %s run %s is not cancellable", nodeExecutionID, context.RunID)
	}
	return context, nil
}

func (service *Service) workflowNodeSteerContext(workspaceID string, executionID string, nodeExecutionID string) (workflowAgentTrajectoryContext, error) {
	if service.codexChatService == nil {
		return workflowAgentTrajectoryContext{}, errors.New("workflow node steering requires Codex chat service")
	}
	if err := validateSteerWorkflowNodeRunRequest(executionID, nodeExecutionID); err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	context, err := service.workflowAgentTrajectoryContext(workspaceID, executionID, nodeExecutionID)
	if err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	activeRun, liveness, err := service.workflowAgentTrajectoryActiveRun(workspaceID, context.ConversationID, context.RunID)
	if err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	if !workflowAgentTrajectoryCanSteer(activeRun, liveness) {
		return workflowAgentTrajectoryContext{}, fmt.Errorf("workflow node execution %s run %s is not steerable", nodeExecutionID, context.RunID)
	}
	return context, nil
}

func (service *Service) workflowNodeRetryLivenessContext(workspaceID string, executionID string, nodeExecutionID string) (workflowAgentTrajectoryContext, error) {
	if service.codexChatService == nil {
		return workflowAgentTrajectoryContext{}, errors.New("workflow node retry liveness requires Codex chat service")
	}
	if err := validateRetryWorkflowNodeRunLivenessRequest(executionID, nodeExecutionID); err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	context, err := service.workflowAgentTrajectoryContext(workspaceID, executionID, nodeExecutionID)
	if err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	activeRun, liveness, err := service.workflowAgentTrajectoryActiveRun(workspaceID, context.ConversationID, context.RunID)
	if err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	if !workflowAgentTrajectoryCanRetryLiveness(activeRun, liveness) {
		return workflowAgentTrajectoryContext{}, fmt.Errorf("workflow node execution %s run %s liveness is not retryable", nodeExecutionID, context.RunID)
	}
	return context, nil
}

func (service *Service) cancelWorkflowNodeActiveRun(workspaceID string, context workflowAgentTrajectoryContext) (chat.Run, error) {
	cancelledRun, err := service.codexChatService.CancelActiveRunByID(workspaceID, context.ConversationID, context.RunID)
	if err != nil {
		return chat.Run{}, fmt.Errorf("cancel workflow node chat run: %w", err)
	}
	return cancelledRun, nil
}

func (service *Service) completeStoppedWorkflowNodeRun(workspaceID string, executionID string, cancelledRun chat.Run) (WorkflowExecution, error) {
	execution, ok, err := service.completeTerminalWorkflowChatRun(cancelledRun)
	if err != nil {
		return WorkflowExecution{}, fmt.Errorf("complete stopped workflow node run: %w", err)
	}
	if ok {
		return execution, nil
	}
	return service.ReadExecution(workspaceID, executionID)
}

func (service *Service) prepareWorkflowNodeTrajectoryRequest(workspaceID string, executionID string, nodeExecutionID string, beforeBlockOrdinal int, transcriptLimit int, afterItemID string, itemLimit int, outputLimit int) (int, int, int, error) {
	if err := validateWorkflowNodeTrajectoryRequest(executionID, nodeExecutionID, beforeBlockOrdinal, transcriptLimit, afterItemID, itemLimit, outputLimit); err != nil {
		return 0, 0, 0, err
	}
	if transcriptLimit == 0 {
		transcriptLimit = defaultWorkflowTrajectoryTranscriptLimit
	}
	if itemLimit == 0 {
		itemLimit = defaultWorkflowTrajectoryItemLimit
	}
	if outputLimit == 0 {
		outputLimit = defaultWorkflowTrajectoryOutputLimit
	}
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return 0, 0, 0, err
	}
	return transcriptLimit, itemLimit, outputLimit, nil
}

func (service *Service) workflowAgentTrajectoryContext(workspaceID string, executionID string, nodeExecutionID string) (workflowAgentTrajectoryContext, error) {
	service.mu.Lock()
	execution, err := service.store.LoadExecution(workspaceID, executionID)
	service.mu.Unlock()
	if err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	nodeExecution := nodeExecutionByID(execution, nodeExecutionID)
	if nodeExecution.ID == "" {
		return workflowAgentTrajectoryContext{}, fmt.Errorf("node execution %s was not found", nodeExecutionID)
	}
	conversationID, runID, err := workflowAgentTrajectoryChatRefs(nodeExecution)
	if err != nil {
		return workflowAgentTrajectoryContext{}, err
	}
	return workflowAgentTrajectoryContext{
		Execution:      execution,
		NodeExecution:  nodeExecution,
		ConversationID: conversationID,
		RunID:          runID,
	}, nil
}

func (service *Service) workflowAgentTrajectoryTranscript(workspaceID string, context workflowAgentTrajectoryContext, beforeBlockOrdinal int, transcriptLimit int) (chat.RunTranscriptPage, error) {
	transcript, err := service.codexChatService.LoadRunTranscriptPage(workspaceID, context.RunID, beforeBlockOrdinal, transcriptLimit)
	if err != nil {
		return chat.RunTranscriptPage{}, fmt.Errorf("load workflow node transcript: %w", err)
	}
	if transcript.ConversationID != context.ConversationID {
		return chat.RunTranscriptPage{}, fmt.Errorf("workflow node execution %s chat run %s belongs to conversation %s, not runner ref %s", context.NodeExecution.ID, context.RunID, transcript.ConversationID, context.ConversationID)
	}
	return transcript, nil
}

func workflowAgentTrajectoryPage(context workflowAgentTrajectoryContext, run chat.Run, transcript chat.RunTranscriptPage, activity chat.RunActivityPage, outputPages []WorkflowAgentTrajectoryRunItemOutputPageState, outputs []chat.RunItemOutput, activeRun *chat.Run, activeRunLiveness *chat.RunLiveness) WorkflowAgentTrajectoryPage {
	pendingApproval := workflowAgentTrajectoryPendingApproval(context.NodeExecution)
	canRetryLiveness := workflowAgentTrajectoryCanRetryLiveness(activeRun, activeRunLiveness)
	canStopRun := activeRun != nil && activeRunLiveness != nil && activeRunLiveness.Cancellable
	canSteer := workflowAgentTrajectoryCanSteer(activeRun, activeRunLiveness)
	return WorkflowAgentTrajectoryPage{
		SchemaVersion: SchemaVersion,
		Scope: WorkflowAgentTrajectoryScope{
			WorkspaceID:         context.Execution.WorkspaceID,
			DefinitionID:        context.Execution.DefinitionID,
			DefinitionVersionID: context.Execution.DefinitionVersionID,
			ExecutionID:         context.Execution.ID,
			NodeID:              context.NodeExecution.NodeID,
			NodeExecutionID:     context.NodeExecution.ID,
			Attempt:             context.NodeExecution.Attempt,
			Iteration:           context.NodeExecution.Iteration,
		},
		ConversationID:           context.ConversationID,
		RunID:                    context.RunID,
		LastChatEventStreamID:    transcript.LastChatEventStreamID,
		LastChatEventSequence:    transcript.LastChatEventSequence,
		LastWorkflowEventOrdinal: context.Execution.LastEventOrdinal,
		Run:                      run,
		ActiveRun:                activeRun,
		ActiveRunLiveness:        activeRunLiveness,
		Blocks:                   transcript.Blocks,
		Items:                    activity.Items,
		Activity:                 activity.Activity,
		OutputPages:              outputPages,
		Outputs:                  outputs,
		PendingApproval:          pendingApproval,
		HasMoreOlder:             transcript.HasMoreOlder,
		OlderBeforeBlockOrdinal:  transcript.OlderBeforeBlockOrdinal,
		HasMoreItems:             activity.HasMoreItems,
		NextItemID:               activity.NextItemID,
		Capabilities: WorkflowAgentTrajectoryCapabilities{
			CanLoadOlderHistory:  transcript.HasMoreOlder,
			CanLoadMoreActivity:  activity.HasMoreItems,
			CanLoadRunItemOutput: true,
			CanRetryLiveness:     canRetryLiveness,
			CanSteer:             canSteer,
			CanStopRun:           canStopRun,
			CanSubmitApproval:    pendingApproval != nil,
		},
	}
}

func workflowAgentTrajectoryCanRetryLiveness(activeRun *chat.Run, liveness *chat.RunLiveness) bool {
	return activeRun != nil &&
		liveness != nil &&
		activeRun.Status == chat.RunStatusRunning &&
		liveness.Retryable
}

func workflowAgentTrajectoryCanSteer(activeRun *chat.Run, liveness *chat.RunLiveness) bool {
	return activeRun != nil &&
		liveness != nil &&
		activeRun.Status == chat.RunStatusRunning &&
		activeRun.PendingApproval == nil &&
		liveness.Status == chat.RunLivenessAttached
}

func validateWorkflowNodeTrajectoryRequest(executionID string, nodeExecutionID string, beforeBlockOrdinal int, transcriptLimit int, afterItemID string, itemLimit int, outputLimit int) error {
	if err := validateWorkflowNodeTrajectoryIDs(executionID, nodeExecutionID, afterItemID); err != nil {
		return err
	}
	if beforeBlockOrdinal < 0 {
		return fmt.Errorf("workflow node trajectory beforeBlockOrdinal must not be negative: %d", beforeBlockOrdinal)
	}
	if err := validateWorkflowTrajectoryLimit("transcriptLimit", transcriptLimit, maxWorkflowTrajectoryTranscriptPageSize); err != nil {
		return err
	}
	if err := validateWorkflowTrajectoryLimit("itemLimit", itemLimit, maxWorkflowTrajectoryItemPageSize); err != nil {
		return err
	}
	return validateWorkflowTrajectoryLimit("outputLimit", outputLimit, maxWorkflowTrajectoryOutputPageSize)
}

func validateWorkflowNodeTrajectoryIDs(executionID string, nodeExecutionID string, afterItemID string) error {
	if err := validateStorageID("workflow execution id", executionID); err != nil {
		return err
	}
	if err := validateStorageID("workflow node execution id", nodeExecutionID); err != nil {
		return err
	}
	if afterItemID == "" {
		return nil
	}
	return validateStorageID("workflow node trajectory afterItemId", afterItemID)
}

func validateWorkflowTrajectoryLimit(name string, limit int, max int) error {
	if limit < 0 {
		return fmt.Errorf("workflow node trajectory %s must not be negative: %d", name, limit)
	}
	if limit > max {
		return fmt.Errorf("workflow node trajectory %s must be at most %d: %d", name, max, limit)
	}
	return nil
}

func validateStopWorkflowNodeRunRequest(executionID string, nodeExecutionID string) error {
	if err := validateStorageID("workflow execution id", executionID); err != nil {
		return err
	}
	if err := validateStorageID("workflow node execution id", nodeExecutionID); err != nil {
		return err
	}
	return nil
}

func validateSteerWorkflowNodeRunRequest(executionID string, nodeExecutionID string) error {
	if err := validateStorageID("workflow execution id", executionID); err != nil {
		return err
	}
	if err := validateStorageID("workflow node execution id", nodeExecutionID); err != nil {
		return err
	}
	return nil
}

func validateRetryWorkflowNodeRunLivenessRequest(executionID string, nodeExecutionID string) error {
	if err := validateStorageID("workflow execution id", executionID); err != nil {
		return err
	}
	if err := validateStorageID("workflow node execution id", nodeExecutionID); err != nil {
		return err
	}
	return nil
}

func workflowAgentTrajectoryChatRefs(nodeExecution WorkflowNodeExecution) (string, string, error) {
	if nodeExecution.RunnerKind == nil || *nodeExecution.RunnerKind != ActionKindAgentCodex {
		return "", "", fmt.Errorf("node execution %s is not an agent.codex runner execution", nodeExecution.ID)
	}
	conversationID := runnerRefValue(nodeExecution.RunnerRefs, RunnerRefChatConversation)
	if conversationID == "" {
		return "", "", fmt.Errorf("node execution %s has no chat conversation runner ref", nodeExecution.ID)
	}
	runID := runnerRefValue(nodeExecution.RunnerRefs, RunnerRefChatRun)
	if runID == "" {
		return "", "", fmt.Errorf("node execution %s has no chat run runner ref", nodeExecution.ID)
	}
	return conversationID, runID, nil
}

func (service *Service) workflowAgentTrajectoryRun(workspaceID string, conversationID string, runID string) (chat.Run, error) {
	runs, err := service.codexChatService.ListRuns(workspaceID, conversationID)
	if err != nil {
		return chat.Run{}, fmt.Errorf("load workflow-owned chat runs: %w", err)
	}
	run, ok := chatRunByID(runs, runID)
	if !ok {
		return chat.Run{}, fmt.Errorf("workflow-owned chat run %s was not found in conversation %s", runID, conversationID)
	}
	if run.ConversationID != conversationID {
		return chat.Run{}, fmt.Errorf("workflow-owned chat run %s belongs to conversation %s, not %s", runID, run.ConversationID, conversationID)
	}
	return run, nil
}

func (service *Service) workflowAgentTrajectoryOutputState(workspaceID string, runID string, items []chat.RunItem, outputLimit int) ([]WorkflowAgentTrajectoryRunItemOutputPageState, []chat.RunItemOutput, error) {
	outputPages := make([]WorkflowAgentTrajectoryRunItemOutputPageState, 0, len(items))
	outputs := []chat.RunItemOutput{}
	remaining := outputLimit
	for _, item := range items {
		if remaining <= 0 {
			continue
		}
		page, err := service.codexChatService.LoadRunItemOutputPage(workspaceID, runID, item.ID, 0, remaining)
		if err != nil {
			return nil, nil, fmt.Errorf("load workflow node run item output %s: %w", item.ID, err)
		}
		outputIDs := make([]string, 0, len(page.Output))
		loadedThroughOrdinal := 0
		for _, output := range page.Output {
			outputIDs = append(outputIDs, output.ID)
			outputs = append(outputs, output)
			if output.Ordinal > loadedThroughOrdinal {
				loadedThroughOrdinal = output.Ordinal
			}
		}
		remaining -= len(page.Output)
		outputPages = append(outputPages, WorkflowAgentTrajectoryRunItemOutputPageState{
			RunID:                runID,
			RunItemID:            item.ID,
			OutputIDs:            outputIDs,
			HasMore:              page.HasMore,
			LoadedThroughOrdinal: loadedThroughOrdinal,
			NextOrdinal:          page.NextOrdinal,
		})
	}
	return outputPages, outputs, nil
}

func (service *Service) workflowAgentTrajectoryActiveRun(workspaceID string, conversationID string, runID string) (*chat.Run, *chat.RunLiveness, error) {
	active, liveness, ok, err := service.codexChatService.ActiveRunWithLiveness(workspaceID, conversationID)
	if err != nil {
		return nil, nil, fmt.Errorf("load workflow-owned active chat run: %w", err)
	}
	if !ok || active.ID != runID {
		return nil, nil, nil
	}
	return &active, liveness, nil
}

func workflowAgentTrajectoryPendingApproval(nodeExecution WorkflowNodeExecution) *WorkflowPendingApproval {
	if nodeExecution.Result == nil || nodeExecution.Result.PendingApproval == nil {
		return nil
	}
	return nodeExecution.Result.PendingApproval
}

func (page WorkflowAgentTrajectoryPage) MarshalJSON() ([]byte, error) {
	type pageAlias WorkflowAgentTrajectoryPage
	if page.Blocks == nil {
		page.Blocks = []chat.TranscriptBlock{}
	}
	if page.Items == nil {
		page.Items = []chat.RunItem{}
	}
	if page.Activity == nil {
		page.Activity = []chat.ActivityItemBlockProjection{}
	}
	if page.OutputPages == nil {
		page.OutputPages = []WorkflowAgentTrajectoryRunItemOutputPageState{}
	}
	if page.Outputs == nil {
		page.Outputs = []chat.RunItemOutput{}
	}
	return json.Marshal(pageAlias(page))
}
