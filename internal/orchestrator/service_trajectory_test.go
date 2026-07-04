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
		!page.Capabilities.CanStopRun ||
		page.Capabilities.CanRetryLiveness {
		t.Fatalf("approval trajectory capabilities = %+v", page.Capabilities)
	}

	if _, err := workflowService.SubmitApproval(workspaceID, started.ID, work.ID, pending.ApprovalID, true, "", nil, false); err != nil {
		t.Fatalf("submit workflow approval: %v", err)
	}
	waitForWorkflowEvent(t, subscription, started.ID, EventExecutionCompleted)
	waitForScriptedHarnessIdle(t, harness)
}

func TestServiceStopWorkflowNodeRunCancelsWorkflowOwnedRun(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Trajectory stop", "", codexActionGraph("workflow hold for queue and steering", true))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	started, err := workflowService.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	work := latestNodeExecutionForTest(t, started, "work")
	conversationID := assertRunnerRef(t, work.RunnerRefs, RunnerRefChatConversation)
	runID := assertRunnerRef(t, work.RunnerRefs, RunnerRefChatRun)

	page, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, started.ID, work.ID, 0, 20, 5)
	if err != nil {
		t.Fatalf("read running trajectory: %v", err)
	}
	if !page.Capabilities.CanStopRun {
		t.Fatalf("running trajectory capabilities = %+v, want stoppable run", page.Capabilities)
	}

	stopped, err := workflowService.StopWorkflowNodeRun(workspaceID, started.ID, work.ID)
	if err != nil {
		t.Fatalf("stop workflow node run: %v", err)
	}
	if stopped.Status != ExecutionStatusCancelled || stopped.TerminalReason == nil || *stopped.TerminalReason != TerminalReasonActionCancelled {
		t.Fatalf("stopped execution = %+v, want action-cancelled execution", stopped)
	}
	stoppedWork := latestNodeExecutionForTest(t, stopped, "work")
	if stoppedWork.Status != NodeExecutionStatusCancelled || stoppedWork.Result == nil || stoppedWork.Result.Status != ActionCompletionCancelled {
		t.Fatalf("stopped node = %+v, want cancelled action result", stoppedWork)
	}
	run := waitForWorkflowChatRunStatus(t, chatService, workspaceID, conversationID, runID, chat.RunStatusCancelled)
	if run.PendingApproval != nil {
		t.Fatalf("cancelled run pending approval = %+v, want nil", run.PendingApproval)
	}

	terminalPage, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, stopped.ID, stoppedWork.ID, 0, 20, 5)
	if err != nil {
		t.Fatalf("read stopped trajectory: %v", err)
	}
	if terminalPage.ActiveRun != nil || terminalPage.ActiveRunLiveness != nil || terminalPage.Capabilities.CanStopRun {
		t.Fatalf("stopped trajectory active state = run %+v liveness %+v capabilities %+v", terminalPage.ActiveRun, terminalPage.ActiveRunLiveness, terminalPage.Capabilities)
	}
	if _, err = workflowService.StopWorkflowNodeRun(workspaceID, started.ID, work.ID); err == nil || !strings.Contains(err.Error(), "not active") {
		t.Fatalf("second stop error = %v, want inactive run rejection", err)
	}
	waitForScriptedHarnessIdle(t, harness)
}

func TestServiceSteerWorkflowNodeRunSteersWorkflowOwnedRun(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Trajectory steer", "", codexActionGraph("workflow hold for queue and steering", true))
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
	work := latestNodeExecutionForTest(t, started, "work")
	conversationID := assertRunnerRef(t, work.RunnerRefs, RunnerRefChatConversation)
	runID := assertRunnerRef(t, work.RunnerRefs, RunnerRefChatRun)

	page, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, started.ID, work.ID, 0, 20, 5)
	if err != nil {
		t.Fatalf("read running trajectory: %v", err)
	}
	if !page.Capabilities.CanSteer {
		t.Fatalf("running trajectory capabilities = %+v, want steer", page.Capabilities)
	}

	steered, err := workflowService.SteerWorkflowNodeRun(workspaceID, started.ID, work.ID, chat.TextChatInput("finish node steering"))
	if err != nil {
		t.Fatalf("steer workflow node: %v", err)
	}
	if steered.Run.ID != runID || steered.UserMessage.RunID != runID || steered.UserMessage.Delivery != chat.MessageDeliverySteering {
		t.Fatalf("steering result = %+v, want steering message for run %s", steered, runID)
	}

	waitForWorkflowEvent(t, subscription, started.ID, EventExecutionCompleted)
	completed, err := workflowService.ReadExecution(workspaceID, started.ID)
	if err != nil {
		t.Fatalf("read completed execution: %v", err)
	}
	completedWork := latestNodeExecutionForTest(t, completed, "work")
	if completedWork.ID != work.ID || completedWork.Status != NodeExecutionStatusSucceeded {
		t.Fatalf("completed node = %+v, want succeeded node %s", completedWork, work.ID)
	}
	run := waitForWorkflowChatRunStatus(t, chatService, workspaceID, conversationID, runID, chat.RunStatusCompleted)
	if run.ID != runID {
		t.Fatalf("completed chat run = %+v, want %s", run, runID)
	}
	terminalPage, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, completed.ID, work.ID, 0, 20, 5)
	if err != nil {
		t.Fatalf("read terminal trajectory: %v", err)
	}
	if terminalPage.ActiveRun != nil || terminalPage.ActiveRunLiveness != nil || terminalPage.Capabilities.CanSteer {
		t.Fatalf("terminal trajectory active state = run %+v liveness %+v capabilities %+v", terminalPage.ActiveRun, terminalPage.ActiveRunLiveness, terminalPage.Capabilities)
	}
	if !trajectoryBlocksContainAssistantText(terminalPage.Blocks, "Steered with finish node steering.") {
		t.Fatalf("terminal trajectory blocks = %+v, want steered assistant text", terminalPage.Blocks)
	}
	waitForScriptedHarnessIdle(t, harness)
}

func TestServiceSteerWorkflowNodeRunRejectsWrongActiveRun(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Trajectory steer wrong run", "", codexActionGraph("workflow hold for queue and steering", true))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	started, err := workflowService.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	work := latestNodeExecutionForTest(t, started, "work")
	runID := assertRunnerRef(t, work.RunnerRefs, RunnerRefChatRun)
	mutated := started
	for index := range mutated.NodeExecutions {
		if mutated.NodeExecutions[index].ID == work.ID {
			mutated.NodeExecutions[index].RunnerRefs = mergeRunnerRefs(mutated.NodeExecutions[index].RunnerRefs, []WorkflowActionRunnerRef{
				{Kind: RunnerRefChatRun, ID: "run_other"},
			})
		}
	}
	transition, err := AttachRunnerRefs(mutated, work.ID, []WorkflowActionRunnerRef{
		{Kind: RunnerRefChatRun, ID: "run_other"},
	}, workflowService.transitionContext())
	if err != nil {
		t.Fatalf("build mutated runner refs transition: %v", err)
	}
	workflowService.mu.Lock()
	if err := workflowService.persistTransition(transition); err != nil {
		workflowService.mu.Unlock()
		t.Fatalf("save mutated runner refs: %v", err)
	}
	workflowService.mu.Unlock()

	_, err = workflowService.SteerWorkflowNodeRun(workspaceID, started.ID, work.ID, chat.TextChatInput("wrong run"))
	if err == nil || !strings.Contains(err.Error(), "not steerable") {
		t.Fatalf("steer wrong run error = %v, want not steerable", err)
	}
	conversationID := assertRunnerRef(t, work.RunnerRefs, RunnerRefChatConversation)
	run := waitForWorkflowChatRunStatus(t, chatService, workspaceID, conversationID, runID, chat.RunStatusRunning)
	if run.ID != runID {
		t.Fatalf("active run = %+v, want original run %s", run, runID)
	}
	steerWorkflowChatWhenReady(t, chatService, workspaceID, conversationID, "finish after wrong run")
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

func trajectoryBlocksContainAssistantText(blocks []chat.TranscriptBlock, text string) bool {
	for _, block := range blocks {
		if block.AssistantText != nil && strings.Contains(block.AssistantText.Text, text) {
			return true
		}
	}
	return false
}
