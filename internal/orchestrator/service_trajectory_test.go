package orchestrator

import (
	"strings"
	"testing"

	"setta/internal/chat"
)

func TestServiceReadWorkflowNodeTrajectoryPreservesScopedTranscriptAndOutputPages(t *testing.T) {
	workflowService, _, harness, workspaceID := newCodexRunnerTestServices(t)
	page, execution, work := readCompletedTrajectoryForPrompt(t, workflowService, workspaceID, "chat activity projection reload workflow")

	assertTrajectoryScope(t, page, execution, work)
	assertTrajectoryRunnerRefs(t, page, work)
	assertTerminalTrajectoryRun(t, page)
	assertTrajectoryOlderRunBlocks(t, page)
	outputPage := assertTrajectoryOutputPagination(t, page)
	assertTrajectoryOutputsPresent(t, page, outputPage)
	assertTerminalTrajectoryCapabilities(t, page)
	waitForScriptedHarnessIdle(t, harness)
}

func TestServiceReadWorkflowNodeTrajectorySurfacesPendingApprovalAndActiveLiveness(t *testing.T) {
	workflowService, _, harness, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Trajectory approval", "", codexActionGraph("command approval workflow", true))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	subscription, err := workflowService.SubscribeEvents(WorkflowEventCursor{})
	if err != nil {
		t.Fatalf("subscribe workflow events: %v", err)
	}
	defer subscription.Unsubscribe()

	started, err := workflowService.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	waitForWorkflowEvent(t, subscription, started.ID, EventActionApprovalWait)
	waiting, err := workflowService.ReadExecution(workspaceID, started.ID)
	if err != nil {
		t.Fatalf("read waiting execution: %v", err)
	}
	work := latestNodeExecutionForTest(t, waiting, "work")
	pending := work.Result.PendingApproval

	page, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, waiting.ID, work.ID, 0, 20, 5)
	if err != nil {
		t.Fatalf("read approval trajectory: %v", err)
	}
	assertTrajectoryScope(t, page, waiting, work)
	if page.PendingApproval == nil || page.PendingApproval.ApprovalID != pending.ApprovalID {
		t.Fatalf("trajectory pending approval = %+v, want %s", page.PendingApproval, pending.ApprovalID)
	}
	if page.ActiveRun == nil || page.ActiveRun.ID != page.RunID {
		t.Fatalf("trajectory active run = %+v, want %s", page.ActiveRun, page.RunID)
	}
	if page.ActiveRunLiveness == nil || page.ActiveRunLiveness.RunID != page.RunID || !page.ActiveRunLiveness.Cancellable {
		t.Fatalf("trajectory liveness = %+v, want cancellable liveness for %s", page.ActiveRunLiveness, page.RunID)
	}
	if !page.Capabilities.CanSubmitApproval ||
		!page.Capabilities.CanLoadRunItemOutput ||
		page.Capabilities.CanSteer ||
		page.Capabilities.CanStopRun ||
		page.Capabilities.CanRetryLiveness {
		t.Fatalf("approval trajectory capabilities = %+v", page.Capabilities)
	}

	if _, err := workflowService.SubmitApproval(workspaceID, started.ID, work.ID, pending.ApprovalID, true, "", nil, false); err != nil {
		t.Fatalf("submit workflow approval: %v", err)
	}
	waitForWorkflowEvent(t, subscription, started.ID, EventExecutionCompleted)
	waitForScriptedHarnessIdle(t, harness)
}

func TestServiceReadWorkflowNodeTrajectoryRejectsNonChatBackedNode(t *testing.T) {
	workflowService, _, _, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Control only", "", startEndGraph())
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	execution, err := workflowService.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	start := latestNodeExecutionForTest(t, execution, "start")
	_, err = workflowService.ReadWorkflowNodeTrajectory(workspaceID, execution.ID, start.ID, 0, 20, 20)
	if err == nil || !strings.Contains(err.Error(), "not an agent.codex runner execution") {
		t.Fatalf("trajectory error = %v, want non-agent rejection", err)
	}
}

func assertTrajectoryScope(t *testing.T, page WorkflowAgentTrajectoryPage, execution WorkflowExecution, nodeExecution WorkflowNodeExecution) {
	t.Helper()
	if page.SchemaVersion != SchemaVersion ||
		page.Scope.WorkspaceID != execution.WorkspaceID ||
		page.Scope.DefinitionID != execution.DefinitionID ||
		page.Scope.DefinitionVersionID != execution.DefinitionVersionID ||
		page.Scope.ExecutionID != execution.ID ||
		page.Scope.NodeID != nodeExecution.NodeID ||
		page.Scope.NodeExecutionID != nodeExecution.ID ||
		page.Scope.Attempt != nodeExecution.Attempt ||
		page.Scope.Iteration != nodeExecution.Iteration {
		t.Fatalf("trajectory scope = %+v, want execution %+v node %+v", page.Scope, execution, nodeExecution)
	}
}

func readCompletedTrajectoryForPrompt(t *testing.T, workflowService *Service, workspaceID string, prompt string) (WorkflowAgentTrajectoryPage, WorkflowExecution, WorkflowNodeExecution) {
	t.Helper()
	definition, err := workflowService.CreateDefinition(workspaceID, "Trajectory output", "", codexActionGraph(prompt, true))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	subscription, err := workflowService.SubscribeEvents(WorkflowEventCursor{})
	if err != nil {
		t.Fatalf("subscribe workflow events: %v", err)
	}
	defer subscription.Unsubscribe()

	started, err := workflowService.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	waitForWorkflowEvent(t, subscription, started.ID, EventExecutionCompleted)
	execution, err := workflowService.ReadExecution(workspaceID, started.ID)
	if err != nil {
		t.Fatalf("read execution: %v", err)
	}
	work := latestNodeExecutionForTest(t, execution, "work")
	page, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, execution.ID, work.ID, 0, 2, 2)
	if err != nil {
		t.Fatalf("read trajectory: %v", err)
	}
	return page, execution, work
}

func assertTrajectoryRunnerRefs(t *testing.T, page WorkflowAgentTrajectoryPage, nodeExecution WorkflowNodeExecution) {
	t.Helper()
	if page.ConversationID != runnerRefValue(nodeExecution.RunnerRefs, RunnerRefChatConversation) ||
		page.RunID != runnerRefValue(nodeExecution.RunnerRefs, RunnerRefChatRun) {
		t.Fatalf("trajectory refs = conversation %s run %s, want runner refs %+v", page.ConversationID, page.RunID, nodeExecution.RunnerRefs)
	}
}

func assertTerminalTrajectoryRun(t *testing.T, page WorkflowAgentTrajectoryPage) {
	t.Helper()
	if page.Run.ID != page.RunID || page.Run.Status != chat.RunStatusCompleted {
		t.Fatalf("trajectory run = %+v, want completed %s", page.Run, page.RunID)
	}
	if page.ActiveRun != nil || page.ActiveRunLiveness != nil {
		t.Fatalf("terminal trajectory active state = run %+v liveness %+v, want nil", page.ActiveRun, page.ActiveRunLiveness)
	}
}

func assertTrajectoryOlderRunBlocks(t *testing.T, page WorkflowAgentTrajectoryPage) {
	t.Helper()
	if !page.HasMoreOlder || page.OlderBeforeBlockOrdinal <= 0 {
		t.Fatalf("trajectory older cursor = hasMore %v before %d, want older page cursor", page.HasMoreOlder, page.OlderBeforeBlockOrdinal)
	}
	for _, block := range page.Blocks {
		if block.RunID != page.RunID {
			t.Fatalf("trajectory block = %+v, want run %s only", block, page.RunID)
		}
	}
}

func assertTrajectoryOutputPagination(t *testing.T, page WorkflowAgentTrajectoryPage) WorkflowAgentTrajectoryRunItemOutputPageState {
	t.Helper()
	outputPage := firstHasMoreTrajectoryOutputPage(page)
	if outputPage.RunItemID == "" {
		t.Fatalf("trajectory output pages = %+v, want a paginated run item output page", page.OutputPages)
	}
	if len(outputPage.OutputIDs) != 2 || outputPage.LoadedThroughOrdinal != 2 || outputPage.NextOrdinal != 2 {
		t.Fatalf("output page = %+v, want two loaded chunks and cursor 2", outputPage)
	}
	return outputPage
}

func assertTrajectoryOutputsPresent(t *testing.T, page WorkflowAgentTrajectoryPage, outputPage WorkflowAgentTrajectoryRunItemOutputPageState) {
	t.Helper()
	for _, outputID := range outputPage.OutputIDs {
		output, ok := trajectoryOutputByID(page.Outputs, outputID)
		if !ok || output.RunItemID != outputPage.RunItemID {
			t.Fatalf("output %s = %+v present %v, want output for %s", outputID, output, ok, outputPage.RunItemID)
		}
	}
}

func assertTerminalTrajectoryCapabilities(t *testing.T, page WorkflowAgentTrajectoryPage) {
	t.Helper()
	if !page.Capabilities.CanLoadRunItemOutput ||
		!page.Capabilities.CanLoadOlderHistory ||
		page.Capabilities.CanSubmitApproval ||
		page.Capabilities.CanSteer ||
		page.Capabilities.CanStopRun ||
		page.Capabilities.CanRetryLiveness {
		t.Fatalf("trajectory capabilities = %+v, want output and older-history only", page.Capabilities)
	}
}

func firstHasMoreTrajectoryOutputPage(page WorkflowAgentTrajectoryPage) WorkflowAgentTrajectoryRunItemOutputPageState {
	for _, outputPage := range page.OutputPages {
		if outputPage.HasMore {
			return outputPage
		}
	}
	return WorkflowAgentTrajectoryRunItemOutputPageState{}
}

func trajectoryOutputByID(outputs []chat.RunItemOutput, outputID string) (chat.RunItemOutput, bool) {
	for _, output := range outputs {
		if output.ID == outputID {
			return output, true
		}
	}
	return chat.RunItemOutput{}, false
}
