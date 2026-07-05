package orchestrator

import (
	"context"
	"strings"
	"testing"
	"time"

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

func TestServiceReadWorkflowNodeTrajectoryRejectsOversizedPageLimits(t *testing.T) {
	workflowService, _, _, workspaceID := newCodexRunnerTestServices(t)
	tests := []struct {
		name            string
		transcriptLimit int
		itemLimit       int
		outputLimit     int
		wantError       string
	}{
		{
			name:            "transcript limit",
			transcriptLimit: maxWorkflowTrajectoryTranscriptPageSize + 1,
			outputLimit:     5,
			wantError:       "transcriptLimit must be at most 200",
		},
		{
			name:            "item limit",
			transcriptLimit: 20,
			itemLimit:       maxWorkflowTrajectoryItemPageSize + 1,
			outputLimit:     5,
			wantError:       "itemLimit must be at most 500",
		},
		{
			name:            "output limit",
			transcriptLimit: 20,
			outputLimit:     maxWorkflowTrajectoryOutputPageSize + 1,
			wantError:       "outputLimit must be at most 500",
		},
	}
	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := workflowService.ReadWorkflowNodeTrajectory(
				workspaceID,
				"execution_trajectory_limit",
				"node_execution_trajectory_limit",
				0,
				testCase.transcriptLimit,
				"",
				testCase.itemLimit,
				testCase.outputLimit,
			)
			if err == nil || !strings.Contains(err.Error(), testCase.wantError) {
				t.Fatalf("trajectory error = %v, want %q", err, testCase.wantError)
			}
		})
	}
}

func TestServiceReadWorkflowNodeTrajectoryPaginatesBeyondMaxPageSizes(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
	execution, work := completedTrajectoryTargetForPrompt(t, workflowService, workspaceID, "Trajectory page limits", "workflow trajectory page limit workflow")

	firstPage := readMaxLimitTrajectoryPage(t, workflowService, workspaceID, execution.ID, work.ID, 0)
	outputPage := assertFirstMaxLimitTrajectoryPage(t, firstPage)
	olderPage := readMaxLimitTrajectoryPage(t, workflowService, workspaceID, execution.ID, work.ID, firstPage.OlderBeforeBlockOrdinal)
	assertOlderMaxLimitTrajectoryPage(t, firstPage, olderPage)
	assertRemainingMaxLimitTrajectoryOutput(t, chatService, workspaceID, firstPage.RunID, outputPage)
	waitForScriptedHarnessIdle(t, harness)
}

func TestServiceReadWorkflowNodeTrajectoryPaginatesActivityItems(t *testing.T) {
	workflowService, _, harness, workspaceID := newCodexRunnerTestServices(t)
	execution, work := completedTrajectoryTargetForPrompt(t, workflowService, workspaceID, "Trajectory activity pages", "workflow trajectory activity item page workflow")

	firstPage, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, execution.ID, work.ID, 0, 20, "", 2, 5)
	if err != nil {
		t.Fatalf("read first trajectory page: %v", err)
	}
	if trajectoryItemTitles(firstPage.Items) != "Trajectory activity item 1,Trajectory activity item 2" ||
		!firstPage.HasMoreItems ||
		firstPage.NextItemID == "" ||
		!firstPage.Capabilities.CanLoadMoreActivity {
		t.Fatalf("first trajectory activity page titles/hasMore/next/capability = %s/%v/%q/%v", trajectoryItemTitles(firstPage.Items), firstPage.HasMoreItems, firstPage.NextItemID, firstPage.Capabilities.CanLoadMoreActivity)
	}

	secondPage, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, execution.ID, work.ID, 0, 20, firstPage.NextItemID, 2, 5)
	if err != nil {
		t.Fatalf("read second trajectory page: %v", err)
	}
	if trajectoryItemTitles(secondPage.Items) != "Trajectory activity item 3,Trajectory activity item 4" ||
		!secondPage.HasMoreItems ||
		secondPage.NextItemID == "" {
		t.Fatalf("second trajectory activity page titles/hasMore/next = %s/%v/%q", trajectoryItemTitles(secondPage.Items), secondPage.HasMoreItems, secondPage.NextItemID)
	}

	thirdPage, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, execution.ID, work.ID, 0, 20, secondPage.NextItemID, 2, 5)
	if err != nil {
		t.Fatalf("read third trajectory page: %v", err)
	}
	if trajectoryItemTitles(thirdPage.Items) != "Trajectory activity item 5" ||
		thirdPage.HasMoreItems ||
		thirdPage.NextItemID != "" ||
		thirdPage.Capabilities.CanLoadMoreActivity {
		t.Fatalf("third trajectory activity page titles/hasMore/next/capability = %s/%v/%q/%v", trajectoryItemTitles(thirdPage.Items), thirdPage.HasMoreItems, thirdPage.NextItemID, thirdPage.Capabilities.CanLoadMoreActivity)
	}
	waitForScriptedHarnessIdle(t, harness)
}

func assertFirstMaxLimitTrajectoryPage(t *testing.T, firstPage WorkflowAgentTrajectoryPage) WorkflowAgentTrajectoryRunItemOutputPageState {
	t.Helper()
	if len(firstPage.Blocks) != maxWorkflowTrajectoryTranscriptPageSize || !firstPage.HasMoreOlder || firstPage.OlderBeforeBlockOrdinal <= 0 {
		t.Fatalf("first trajectory page blocks = %d hasMore %v before %d, want full max page with older cursor", len(firstPage.Blocks), firstPage.HasMoreOlder, firstPage.OlderBeforeBlockOrdinal)
	}
	outputPage := firstHasMoreTrajectoryOutputPage(firstPage)
	if len(outputPage.OutputIDs) != maxWorkflowTrajectoryOutputPageSize ||
		!outputPage.HasMore ||
		outputPage.NextOrdinal != maxWorkflowTrajectoryOutputPageSize {
		t.Fatalf("first output page = %+v, want max output page with next ordinal", outputPage)
	}
	if len(firstPage.Outputs) != maxWorkflowTrajectoryOutputPageSize {
		t.Fatalf("first trajectory page embedded outputs = %d, want aggregate max %d", len(firstPage.Outputs), maxWorkflowTrajectoryOutputPageSize)
	}
	secondCommand := trajectoryRunItemByTitle(firstPage, "Trajectory limit command b")
	if secondCommand.ID == "" {
		t.Fatalf("trajectory items = %+v, want second limit command", firstPage.Items)
	}
	if !trajectoryActivityHasOutput(firstPage, secondCommand.ID) {
		t.Fatalf("second trajectory command activity did not retain hasOutput after output budget exhaustion")
	}
	if secondPage := trajectoryOutputPageByRunItemID(firstPage, secondCommand.ID); secondPage.RunItemID != "" {
		t.Fatalf("second trajectory command output page = %+v, want no embedded page after aggregate output budget exhaustion", secondPage)
	}
	return outputPage
}

func readMaxLimitTrajectoryPage(t *testing.T, workflowService *Service, workspaceID string, executionID string, nodeExecutionID string, beforeBlockOrdinal int) WorkflowAgentTrajectoryPage {
	t.Helper()
	page, err := workflowService.ReadWorkflowNodeTrajectory(
		workspaceID,
		executionID,
		nodeExecutionID,
		beforeBlockOrdinal,
		maxWorkflowTrajectoryTranscriptPageSize,
		"",
		maxWorkflowTrajectoryItemPageSize,
		maxWorkflowTrajectoryOutputPageSize,
	)
	if err != nil {
		t.Fatalf("read trajectory page: %v", err)
	}
	return page
}

func assertOlderMaxLimitTrajectoryPage(t *testing.T, firstPage WorkflowAgentTrajectoryPage, olderPage WorkflowAgentTrajectoryPage) {
	t.Helper()
	if len(olderPage.Blocks) == 0 || olderPage.HasMoreOlder {
		t.Fatalf("older trajectory page blocks = %d hasMore %v, want final older page", len(olderPage.Blocks), olderPage.HasMoreOlder)
	}
	collectedBlocks := append(append([]chat.TranscriptBlock{}, olderPage.Blocks...), firstPage.Blocks...)
	if !trajectoryBlocksContainAssistantText(collectedBlocks, "Trajectory limit block 000") ||
		!trajectoryBlocksContainAssistantText(collectedBlocks, "Trajectory limit block 204") {
		t.Fatalf("collected trajectory blocks did not include both oldest and newest limit blocks")
	}
}

func assertRemainingMaxLimitTrajectoryOutput(t *testing.T, chatService *chat.Service, workspaceID string, runID string, outputPage WorkflowAgentTrajectoryRunItemOutputPageState) {
	t.Helper()
	remainingOutput, err := chatService.LoadRunItemOutputPage(
		workspaceID,
		runID,
		outputPage.RunItemID,
		outputPage.NextOrdinal,
		maxWorkflowTrajectoryOutputPageSize,
	)
	if err != nil {
		t.Fatalf("read remaining run item output: %v", err)
	}
	if len(remainingOutput.Output) != 1 ||
		remainingOutput.HasMore ||
		!strings.Contains(remainingOutput.Output[0].Text, "trajectory limit output chunk a 501") {
		t.Fatalf("remaining output page = %+v, want final output chunk after max page", remainingOutput)
	}
}

func TestServiceReadWorkflowNodeTrajectorySurfacesPendingApprovalAndActiveLiveness(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
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

	page, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, waiting.ID, work.ID, 0, 20, "", 0, 5)
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
	waitForWorkflowChatRunStatus(t, chatService, workspaceID, page.ConversationID, page.RunID, chat.RunStatusCompleted)
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

	page, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, started.ID, work.ID, 0, 20, "", 0, 5)
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

	terminalPage, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, stopped.ID, stoppedWork.ID, 0, 20, "", 0, 5)
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

	page := waitForWorkflowNodeTrajectory(t, workflowService, workspaceID, started.ID, work.ID, func(page WorkflowAgentTrajectoryPage) bool {
		return page.Capabilities.CanSteer
	})
	if page.RunID != runID {
		t.Fatalf("running trajectory run = %s, want %s", page.RunID, runID)
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
	terminalPage, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, completed.ID, work.ID, 0, 20, "", 0, 5)
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

func TestServiceReadWorkflowNodeTrajectoryIncludesPendingSteeringOutsideTranscript(t *testing.T) {
	workflowService, _, harness, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Trajectory pending steering", "", codexActionGraph("workflow hold for draft event", true))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	started, err := workflowService.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	work := latestNodeExecutionForTest(t, started, "work")
	page := waitForWorkflowNodeTrajectory(t, workflowService, workspaceID, started.ID, work.ID, func(page WorkflowAgentTrajectoryPage) bool {
		return page.Capabilities.CanSteer
	})

	steered, err := workflowService.SteerWorkflowNodeRun(workspaceID, started.ID, work.ID, chat.TextChatInput("hold pending steering"))
	if err != nil {
		t.Fatalf("steer workflow node: %v", err)
	}
	page = waitForWorkflowNodeTrajectory(t, workflowService, workspaceID, started.ID, work.ID, func(page WorkflowAgentTrajectoryPage) bool {
		return len(page.PendingSteeringMessages) == 1
	})

	pending := page.PendingSteeringMessages[0]
	if pending.ID != steered.UserMessage.ID ||
		pending.RunID != page.RunID ||
		pending.Delivery != chat.MessageDeliverySteering ||
		pending.Status != chat.MessageStatusPending {
		t.Fatalf("trajectory pending steering = %+v, want pending message %+v for run %s", pending, steered.UserMessage, page.RunID)
	}
	if trajectoryBlocksContainMessage(page.Blocks, pending.ID) {
		t.Fatalf("pending steering was committed into trajectory transcript blocks before provider commit: %+v", page.Blocks)
	}

	if _, err := workflowService.StopWorkflowNodeRun(workspaceID, started.ID, work.ID); err != nil {
		t.Fatalf("stop workflow node after pending steering assertion: %v", err)
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

func TestServiceRetryWorkflowNodeRunLivenessRetriesWorkflowOwnedRun(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
	target := startWorkflowNodeRetryLivenessRun(t, workflowService, workspaceID)

	markWorkflowNodeRunLiveness(t, chatService, workspaceID, target, chat.RunLivenessReasonStreamResync)
	retryablePage := readWorkflowNodeTrajectoryForTest(t, workflowService, workspaceID, target)
	assertWorkflowNodeRetryLivenessPage(t, retryablePage, target.RunID, chat.RunLivenessReasonStreamResync)

	reconciled := retryWorkflowNodeRunLivenessForTest(t, workflowService, workspaceID, target)
	assertWorkflowNodeReconciledLiveness(t, reconciled, target.RunID, chat.RunLivenessReasonUserRetry)
	userRetryPage := readWorkflowNodeTrajectoryForTest(t, workflowService, workspaceID, target)
	assertWorkflowNodeRetryLivenessPage(t, userRetryPage, target.RunID, chat.RunLivenessReasonUserRetry)

	stopWorkflowNodeRunForTest(t, workflowService, workspaceID, target)
	waitForScriptedHarnessIdle(t, harness)
}

type workflowNodeRetryLivenessTarget struct {
	ConversationID  string
	ExecutionID     string
	NodeExecutionID string
	RunID           string
}

func startWorkflowNodeRetryLivenessRun(t *testing.T, workflowService *Service, workspaceID string) workflowNodeRetryLivenessTarget {
	t.Helper()
	definition, err := workflowService.CreateDefinition(workspaceID, "Trajectory retry liveness", "", codexActionGraph("workflow hold for queue and steering", true))
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
	waitForWorkflowNodeTrajectory(t, workflowService, workspaceID, started.ID, work.ID, func(page WorkflowAgentTrajectoryPage) bool {
		return workflowNodeLivenessAttached(page)
	})
	return workflowNodeRetryLivenessTarget{
		ConversationID:  conversationID,
		ExecutionID:     started.ID,
		NodeExecutionID: work.ID,
		RunID:           runID,
	}
}

func workflowNodeLivenessAttached(page WorkflowAgentTrajectoryPage) bool {
	return page.ActiveRunLiveness != nil && page.ActiveRunLiveness.Status == chat.RunLivenessAttached
}

func markWorkflowNodeRunLiveness(t *testing.T, chatService *chat.Service, workspaceID string, target workflowNodeRetryLivenessTarget, reason chat.RunLivenessReason) {
	t.Helper()
	_, err := chatService.ReconcileActiveRunByID(context.Background(), workspaceID, target.ConversationID, target.RunID, reason)
	if err != nil {
		t.Fatalf("mark workflow node liveness retryable: %v", err)
	}
}

func readWorkflowNodeTrajectoryForTest(t *testing.T, workflowService *Service, workspaceID string, target workflowNodeRetryLivenessTarget) WorkflowAgentTrajectoryPage {
	t.Helper()
	page, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, target.ExecutionID, target.NodeExecutionID, 0, 20, "", 0, 5)
	if err != nil {
		t.Fatalf("read workflow node trajectory: %v", err)
	}
	return page
}

func retryWorkflowNodeRunLivenessForTest(t *testing.T, workflowService *Service, workspaceID string, target workflowNodeRetryLivenessTarget) chat.RunLivenessReconciliationResult {
	t.Helper()
	reconciled, err := workflowService.RetryWorkflowNodeRunLiveness(context.Background(), workspaceID, target.ExecutionID, target.NodeExecutionID)
	if err != nil {
		t.Fatalf("retry workflow node liveness: %v", err)
	}
	return reconciled
}

func stopWorkflowNodeRunForTest(t *testing.T, workflowService *Service, workspaceID string, target workflowNodeRetryLivenessTarget) {
	t.Helper()
	if _, err := workflowService.StopWorkflowNodeRun(workspaceID, target.ExecutionID, target.NodeExecutionID); err != nil {
		t.Fatalf("stop retry workflow node run: %v", err)
	}
}

func assertWorkflowNodeRetryLivenessPage(t *testing.T, page WorkflowAgentTrajectoryPage, runID string, reason chat.RunLivenessReason) {
	t.Helper()
	liveness := page.ActiveRunLiveness
	if liveness == nil {
		t.Fatalf("workflow node liveness = nil, want retryable %s for %s", reason, runID)
	}
	if liveness.RunID != runID || liveness.Reason != reason || !page.Capabilities.CanRetryLiveness {
		t.Fatalf("workflow node liveness = %+v capabilities %+v, want retryable %s for %s", liveness, page.Capabilities, reason, runID)
	}
}

func assertWorkflowNodeReconciledLiveness(t *testing.T, result chat.RunLivenessReconciliationResult, runID string, reason chat.RunLivenessReason) {
	t.Helper()
	if len(result.Runs) != 1 || result.Runs[0].RunID != runID || result.Runs[0].Reason != reason {
		t.Fatalf("retried liveness = %+v, want %s for %s", result.Runs, reason, runID)
	}
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
	_, err = workflowService.ReadWorkflowNodeTrajectory(workspaceID, execution.ID, start.ID, 0, 20, "", 0, 20)
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
	if page.LastWorkflowEventOrdinal != execution.LastEventOrdinal {
		t.Fatalf("trajectory workflow cursor = %d, want execution last ordinal %d", page.LastWorkflowEventOrdinal, execution.LastEventOrdinal)
	}
	if page.LastChatEventStreamID == "" || page.LastChatEventSequence <= 0 {
		t.Fatalf("trajectory chat cursor = %s:%d, want populated cursor", page.LastChatEventStreamID, page.LastChatEventSequence)
	}
}

func readCompletedTrajectoryForPrompt(t *testing.T, workflowService *Service, workspaceID string, prompt string) (WorkflowAgentTrajectoryPage, WorkflowExecution, WorkflowNodeExecution) {
	t.Helper()
	execution, work := completedTrajectoryTargetForPrompt(t, workflowService, workspaceID, "Trajectory output", prompt)
	page, err := workflowService.ReadWorkflowNodeTrajectory(workspaceID, execution.ID, work.ID, 0, 2, "", 0, 2)
	if err != nil {
		t.Fatalf("read trajectory: %v", err)
	}
	return page, execution, work
}

func completedTrajectoryTargetForPrompt(t *testing.T, workflowService *Service, workspaceID string, name string, prompt string) (WorkflowExecution, WorkflowNodeExecution) {
	t.Helper()
	definition, err := workflowService.CreateDefinition(workspaceID, name, "", codexActionGraph(prompt, true))
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
	return execution, work
}

func waitForWorkflowNodeTrajectory(t *testing.T, workflowService *Service, workspaceID string, executionID string, nodeExecutionID string, matches func(WorkflowAgentTrajectoryPage) bool) WorkflowAgentTrajectoryPage {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	var page WorkflowAgentTrajectoryPage
	for time.Now().Before(deadline) {
		var err error
		page, err = workflowService.ReadWorkflowNodeTrajectory(workspaceID, executionID, nodeExecutionID, 0, 20, "", 0, 5)
		if err == nil && matches(page) {
			return page
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for workflow node trajectory %s, last page %+v", nodeExecutionID, page)
	return WorkflowAgentTrajectoryPage{}
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

func trajectoryRunItemByTitle(page WorkflowAgentTrajectoryPage, title string) chat.RunItem {
	for _, item := range page.Items {
		if item.Title == title {
			return item
		}
	}
	return chat.RunItem{}
}

func trajectoryItemTitles(items []chat.RunItem) string {
	titles := ""
	for index, item := range items {
		if index > 0 {
			titles += ","
		}
		titles += item.Title
	}
	return titles
}

func trajectoryActivityHasOutput(page WorkflowAgentTrajectoryPage, runItemID string) bool {
	for _, activity := range page.Activity {
		if activity.SourceRunItemID == runItemID {
			return activity.HasOutput
		}
	}
	return false
}

func trajectoryOutputPageByRunItemID(page WorkflowAgentTrajectoryPage, runItemID string) WorkflowAgentTrajectoryRunItemOutputPageState {
	for _, outputPage := range page.OutputPages {
		if outputPage.RunItemID == runItemID {
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

func trajectoryBlocksContainMessage(blocks []chat.TranscriptBlock, messageID string) bool {
	for _, block := range blocks {
		if block.UserMessage != nil && block.UserMessage.MessageID == messageID {
			return true
		}
	}
	return false
}
