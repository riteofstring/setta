package orchestrator

import (
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/chat"
)

const (
	defaultWorkflowTrajectoryTranscriptLimit = 80
	defaultWorkflowTrajectoryOutputLimit     = 200
)

type workflowAgentTrajectoryContext struct {
	Execution      WorkflowExecution
	NodeExecution  WorkflowNodeExecution
	ConversationID string
	RunID          string
}

func (service *Service) ReadWorkflowNodeTrajectory(workspaceID string, executionID string, nodeExecutionID string, beforeBlockOrdinal int, transcriptLimit int, outputLimit int) (WorkflowAgentTrajectoryPage, error) {
	if service.codexChatService == nil {
		return WorkflowAgentTrajectoryPage{}, errors.New("workflow agent trajectory requires Codex chat service")
	}
	transcriptLimit, outputLimit, err := service.prepareWorkflowNodeTrajectoryRequest(workspaceID, executionID, nodeExecutionID, beforeBlockOrdinal, transcriptLimit, outputLimit)
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
	activity, err := service.codexChatService.LoadRunActivityPage(workspaceID, context.RunID, outputLimit)
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

func (service *Service) prepareWorkflowNodeTrajectoryRequest(workspaceID string, executionID string, nodeExecutionID string, beforeBlockOrdinal int, transcriptLimit int, outputLimit int) (int, int, error) {
	if err := validateWorkflowNodeTrajectoryRequest(executionID, nodeExecutionID, beforeBlockOrdinal, transcriptLimit, outputLimit); err != nil {
		return 0, 0, err
	}
	if transcriptLimit == 0 {
		transcriptLimit = defaultWorkflowTrajectoryTranscriptLimit
	}
	if outputLimit == 0 {
		outputLimit = defaultWorkflowTrajectoryOutputLimit
	}
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return 0, 0, err
	}
	return transcriptLimit, outputLimit, nil
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
		ConversationID:          context.ConversationID,
		RunID:                   context.RunID,
		Run:                     run,
		ActiveRun:               activeRun,
		ActiveRunLiveness:       activeRunLiveness,
		Blocks:                  transcript.Blocks,
		Items:                   activity.Items,
		Activity:                activity.Activity,
		OutputPages:             outputPages,
		Outputs:                 outputs,
		PendingApproval:         pendingApproval,
		HasMoreOlder:            transcript.HasMoreOlder,
		OlderBeforeBlockOrdinal: transcript.OlderBeforeBlockOrdinal,
		Capabilities: WorkflowAgentTrajectoryCapabilities{
			CanLoadOlderHistory:  transcript.HasMoreOlder,
			CanLoadRunItemOutput: true,
			CanSubmitApproval:    pendingApproval != nil,
		},
	}
}

func validateWorkflowNodeTrajectoryRequest(executionID string, nodeExecutionID string, beforeBlockOrdinal int, transcriptLimit int, outputLimit int) error {
	if err := validateStorageID("workflow execution id", executionID); err != nil {
		return err
	}
	if err := validateStorageID("workflow node execution id", nodeExecutionID); err != nil {
		return err
	}
	if beforeBlockOrdinal < 0 {
		return fmt.Errorf("workflow node trajectory beforeBlockOrdinal must not be negative: %d", beforeBlockOrdinal)
	}
	if transcriptLimit < 0 {
		return fmt.Errorf("workflow node trajectory transcriptLimit must not be negative: %d", transcriptLimit)
	}
	if outputLimit < 0 {
		return fmt.Errorf("workflow node trajectory outputLimit must not be negative: %d", outputLimit)
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
	for _, item := range items {
		page, err := service.codexChatService.LoadRunItemOutputPage(workspaceID, runID, item.ID, 0, outputLimit)
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
