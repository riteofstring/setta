package orchestrator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/workspace"
)

func TestCodexRunnerCompletesWorkflowThroughWorkflowOwnedChat(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Workflow result", "", codexActionGraph("workflow hold for queue and steering", true))
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
	startedWork := latestNodeExecutionForTest(t, started, "work")
	conversationID := assertRunnerRef(t, startedWork.RunnerRefs, RunnerRefChatConversation)
	runID := assertRunnerRef(t, startedWork.RunnerRefs, RunnerRefChatRun)
	waitForWorkflowChatHarnessRef(t, chatService, workspaceID, conversationID, RunnerRefCodexThread)
	reported, err := workflowService.ReportExecutionResult(workspaceID, WorkflowExecutionResultInput{
		WorkspaceID:     workspaceID,
		ExecutionID:     started.ID,
		NodeExecutionID: startedWork.ID,
		Result:          scriptedWorkflowActionResultForTest(t),
	})
	if err != nil {
		t.Fatalf("report workflow result: %v", err)
	}
	if reported.Status != ExecutionStatusCompleted {
		t.Fatalf("reported execution status = %s, want completed", reported.Status)
	}
	waitForWorkflowEvent(t, subscription, started.ID, EventExecutionCompleted)
	execution, err := workflowService.ReadExecution(workspaceID, started.ID)
	if err != nil {
		t.Fatalf("read execution: %v", err)
	}
	if execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", execution.Status)
	}
	work := latestNodeExecutionForTest(t, execution, "work")
	if work.Status != NodeExecutionStatusSucceeded {
		t.Fatalf("work status = %s, want succeeded", work.Status)
	}
	assertWorkflowResultPayload(t, work)
	assertPhase1RunnerRecords(t, workflowService, workspaceID, execution.ID, work)
	assertRunnerRef(t, work.RunnerRefs, RunnerRefChatRun)
	assertRunnerRef(t, work.RunnerRefs, RunnerRefCodexThread)
	assertRunnerRef(t, work.RunnerRefs, RunnerRefCodexSession)
	assertRunnerRef(t, work.RunnerRefs, RunnerRefCodexTurn)

	list, err := chatService.ListConversations(workspaceID)
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	if len(list.Conversations) != 0 {
		t.Fatalf("visible conversations = %+v, want workflow chat hidden", list.Conversations)
	}
	page, err := chatService.LoadMessagePage(workspaceID, conversationID, 0, 20)
	if err != nil {
		t.Fatalf("load hidden workflow chat: %v", err)
	}
	if !page.Conversation.Internal || page.Conversation.Workflow == nil {
		t.Fatalf("conversation metadata = %+v, want internal workflow metadata", page.Conversation)
	}
	if page.Conversation.Workflow.ExecutionID != execution.ID || page.Conversation.Workflow.NodeExecutionID != work.ID {
		t.Fatalf("workflow metadata = %+v, want execution %s node execution %s", page.Conversation.Workflow, execution.ID, work.ID)
	}
	if _, err := chatService.CancelActiveRunByID(workspaceID, conversationID, runID); err != nil {
		t.Fatalf("cancel hidden workflow chat after manual result report: %v", err)
	}
	waitForScriptedHarnessIdle(t, harness)
}

func TestCodexRunnerCancellationPropagatesToWorkflowOwnedChat(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Workflow cancel", "", codexActionGraph("cancel active workflow", true))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	started, err := workflowService.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	work := latestNodeExecutionForTest(t, started, "work")
	conversationID := assertRunnerRef(t, work.RunnerRefs, RunnerRefChatConversation)

	cancelled, err := workflowService.CancelExecution(workspaceID, started.ID)
	if err != nil {
		t.Fatalf("cancel execution: %v", err)
	}
	if cancelled.Status != ExecutionStatusCancelled {
		t.Fatalf("execution status = %s, want cancelled", cancelled.Status)
	}
	work = latestNodeExecutionForTest(t, cancelled, "work")
	if work.Status != NodeExecutionStatusCancelled {
		t.Fatalf("work status = %s, want cancelled", work.Status)
	}
	runs, err := chatService.ListRuns(workspaceID, conversationID)
	if err != nil {
		t.Fatalf("list hidden workflow chat runs: %v", err)
	}
	if len(runs) != 1 || runs[0].Status != chat.RunStatusCancelled {
		t.Fatalf("runs = %+v, want one cancelled chat run", runs)
	}
	waitForScriptedHarnessIdle(t, harness)
}

func TestCodexRunnerSubmitsWorkflowApprovalThroughHiddenChat(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Workflow approval", "", codexActionGraph("command approval workflow", true))
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
	work, pending := assertWorkflowApprovalWaiting(t, workflowService, workspaceID, started.ID)
	assertWorkflowApprovalProjection(t, workflowService, workspaceID, definition, started.ID, pending)

	if _, err := workflowService.SubmitApproval(workspaceID, started.ID, work.ID, pending.ApprovalID, true, "", nil, false); err != nil {
		t.Fatalf("submit workflow approval: %v", err)
	}
	waitForWorkflowEvent(t, subscription, started.ID, EventExecutionCompleted)
	assertWorkflowApprovalCompleted(t, workflowService, workspaceID, started.ID)
	assertWorkflowEventsInclude(t, workflowService, workspaceID, started.ID, []WorkflowEventType{
		EventRunnerAttemptStarted,
		EventRunnerApprovalRequested,
		EventRunnerApprovalResolved,
		EventRunnerAttemptCompleted,
	})
	assertWorkflowChatsHiddenForTest(t, chatService, workspaceID)
	waitForScriptedHarnessIdle(t, harness)
}

func TestCodexRunnerStartupRecoveryPreservesWorkflowApproval(t *testing.T) {
	workflowService, chatService, harness, workflowStore, resolver, idGenerator, workspaceID := newCodexRunnerRecoveryTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Workflow approval recovery", "", codexActionGraph("command approval workflow", true))
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
	work, pending := assertWorkflowApprovalWaiting(t, workflowService, workspaceID, started.ID)
	workflowService.CloseEvents()

	restarted, err := NewService(workflowStore, resolver, WithIDGenerator(idGenerator), WithClock(fixedTestClock(t)), WithCodexChatService(chatService))
	if err != nil {
		t.Fatalf("restart workflow service: %v", err)
	}
	harness.SetWorkflowResultReporter(scriptedWorkflowResultReporterForTest(restarted))
	defer restarted.CloseEvents()
	restartedSubscription, err := restarted.SubscribeEvents(WorkflowEventCursor{})
	if err != nil {
		t.Fatalf("subscribe restarted workflow events: %v", err)
	}
	defer restartedSubscription.Unsubscribe()
	recovered, err := restarted.ReadExecution(workspaceID, started.ID)
	if err != nil {
		t.Fatalf("read recovered execution: %v", err)
	}
	recoveredWork := latestNodeExecutionForTest(t, recovered, "work")
	if recoveredWork.ID != work.ID || recoveredWork.Status != NodeExecutionStatusWaitingApproval {
		t.Fatalf("recovered work = %+v, want same waiting approval node %s", recoveredWork, work.ID)
	}
	if recoveredWork.Result == nil || recoveredWork.Result.PendingApproval == nil || recoveredWork.Result.PendingApproval.ApprovalID != pending.ApprovalID {
		t.Fatalf("recovered pending approval = %+v, want %s", recoveredWork.Result, pending.ApprovalID)
	}
	if recoveredWork.RecoveryOutcome == nil || *recoveredWork.RecoveryOutcome != RunnerRecoveryOutcomeRecoveredRunning {
		t.Fatalf("recovery outcome = %v, want recovered_running", recoveredWork.RecoveryOutcome)
	}
	assertWorkflowEventsInclude(t, restarted, workspaceID, started.ID, []WorkflowEventType{EventActionRecovered})

	if _, err := restarted.SubmitApproval(workspaceID, started.ID, recoveredWork.ID, pending.ApprovalID, true, "", nil, false); err != nil {
		t.Fatalf("submit recovered workflow approval: %v", err)
	}
	waitForWorkflowEvent(t, restartedSubscription, started.ID, EventExecutionCompleted)
	waitForScriptedHarnessIdle(t, harness)
	recoveredConversationID := assertRunnerRef(t, recoveredWork.RunnerRefs, RunnerRefChatConversation)
	recoveredRunID := assertRunnerRef(t, recoveredWork.RunnerRefs, RunnerRefChatRun)
	waitForWorkflowChatRunStatus(t, chatService, workspaceID, recoveredConversationID, recoveredRunID, chat.RunStatusCompleted)
	completed, err := restarted.ReadExecution(workspaceID, started.ID)
	if err != nil {
		t.Fatalf("read completed execution: %v", err)
	}
	if completed.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed after recovered approval", completed.Status)
	}
}

func TestCodexRunnerStartupRecoveryReconcilesTerminalHiddenWorkflowChatRun(t *testing.T) {
	chatEvents, err := chat.NewEventHub(
		"event_stream_hidden_terminal_workflow",
		chat.WithEventBufferSize(0),
		chat.WithEventClock(fixedTestClock(t)),
	)
	if err != nil {
		t.Fatalf("create chat event hub: %v", err)
	}
	workflowService, chatService, harness, workflowStore, resolver, idGenerator, workspaceID := newCodexRunnerRecoveryTestServicesWithChatOptions(t, chat.WithEventHub(chatEvents))
	definition, err := workflowService.CreateDefinition(workspaceID, "Workflow hidden terminal recovery", "", codexActionGraph("workflow hold for queue and steering", true))
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

	workflowService.CloseEvents()
	steerWorkflowChatWhenReady(t, chatService, workspaceID, conversationID, "finish hidden run")
	waitForWorkflowChatRunStatus(t, chatService, workspaceID, conversationID, runID, chat.RunStatusCompleted)
	stillHidden, err := workflowService.ReadExecution(workspaceID, started.ID)
	if err != nil {
		t.Fatalf("read hidden execution before restart: %v", err)
	}
	if stillHidden.Status != ExecutionStatusCompleted {
		t.Fatalf("hidden execution status before restart = %s, want completed", stillHidden.Status)
	}

	restarted, err := NewService(workflowStore, resolver, WithIDGenerator(idGenerator), WithClock(fixedTestClock(t)), WithCodexChatService(chatService))
	if err != nil {
		t.Fatalf("restart workflow service: %v", err)
	}
	defer restarted.CloseEvents()
	recovered, err := restarted.ReadExecution(workspaceID, started.ID)
	if err != nil {
		t.Fatalf("read recovered execution: %v", err)
	}
	if recovered.Status != ExecutionStatusCompleted {
		t.Fatalf("recovered execution status = %s, want completed", recovered.Status)
	}
	recoveredWork := latestNodeExecutionForTest(t, recovered, "work")
	if recoveredWork.Status != NodeExecutionStatusSucceeded {
		t.Fatalf("recovered work status = %s, want succeeded", recoveredWork.Status)
	}
	restartedRun, err := restarted.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start same workflow after hidden terminal recovery: %v", err)
	}
	if restartedRun.Status == ExecutionStatusRunning {
		if _, err := restarted.CancelExecution(workspaceID, restartedRun.ID); err != nil {
			t.Fatalf("cancel follow-up workflow run: %v", err)
		}
	}
	assertWorkflowEventsInclude(t, restarted, workspaceID, started.ID, []WorkflowEventType{
		EventActionCompleted,
		EventExecutionCompleted,
	})
	waitForScriptedHarnessIdle(t, harness)
}

func TestCodexRunnerRecoverReconcilesTerminalWorkflowOwnedChatRun(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Workflow terminal recovery", "", codexActionGraph("workflow result action", true))
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
	runner, err := NewCodexActionRunner(chatService)
	if err != nil {
		t.Fatalf("create Codex runner: %v", err)
	}
	sink := &bufferingRunnerEventSink{}
	recovered, err := runner.Recover(nil, ActionRecoverRequest{
		WorkspaceID:      workspaceID,
		ExecutionID:      execution.ID,
		Execution:        execution,
		NodeExecution:    work,
		RunnerRefs:       work.RunnerRefs,
		RunnerState:      work.RunnerState,
		LastEventOrdinal: execution.LastEventOrdinal,
	}, sink)
	if err != nil {
		t.Fatalf("recover terminal Codex run: %v", err)
	}
	if recovered.Outcome != RunnerRecoveryOutcomeRecoveredFailed {
		t.Fatalf("recovery outcome = %s, want recovered_failed", recovered.Outcome)
	}
	if recovered.Result == nil || recovered.Result.Status != ActionCompletionFailed {
		t.Fatalf("recovery result = %+v, want failed action result", recovered.Result)
	}
	if recovered.Result.Error == "" || !strings.Contains(recovered.Result.Error, "setta workflow executions result") {
		t.Fatalf("recovery result error = %q, want missing workflow result error", recovered.Result.Error)
	}
	if runnerEventTypesContain(sink.Events(), RunnerEventStructuredOutputReceived) || !runnerEventTypesContain(sink.Events(), RunnerEventAttemptFailed) {
		t.Fatalf("runner events = %+v, want attempt failed without structured output", runnerEventTypes(sink.Events()))
	}
	waitForScriptedHarnessIdle(t, harness)
}

func assertWorkflowApprovalWaiting(t *testing.T, workflowService *Service, workspaceID string, executionID string) (WorkflowNodeExecution, *WorkflowPendingApproval) {
	t.Helper()
	waiting, err := workflowService.ReadExecution(workspaceID, executionID)
	if err != nil {
		t.Fatalf("read waiting execution: %v", err)
	}
	work := latestNodeExecutionForTest(t, waiting, "work")
	if work.Status != NodeExecutionStatusWaitingApproval {
		t.Fatalf("work status = %s, want waiting_approval", work.Status)
	}
	if work.Result == nil || work.Result.PendingApproval == nil {
		t.Fatalf("work result = %+v, want pending workflow approval", work.Result)
	}
	pending := work.Result.PendingApproval
	if pending.WorkspaceID != workspaceID || pending.ExecutionID != executionID || pending.NodeExecutionID != work.ID || pending.ApprovalID != pending.Approval.ID {
		t.Fatalf("pending approval = %+v, want workflow-scoped approval metadata", pending)
	}
	return work, pending
}

func assertWorkflowApprovalProjection(t *testing.T, workflowService *Service, workspaceID string, definition WorkflowDefinition, executionID string, pending *WorkflowPendingApproval) {
	t.Helper()
	projection, ok, err := workflowService.ReadGraphProjection(workspaceID, definition.ID, "", executionID)
	if err != nil {
		t.Fatalf("read projection: %v", err)
	}
	if !ok {
		t.Fatal("projection was not returned")
	}
	projectedWork := projectedNodeForTest(t, projection, "work")
	if projectedWork.PendingApproval == nil || projectedWork.PendingApproval.ApprovalID != pending.ApprovalID {
		t.Fatalf("projected pending approval = %+v, want %s", projectedWork.PendingApproval, pending.ApprovalID)
	}
}

func assertWorkflowApprovalCompleted(t *testing.T, workflowService *Service, workspaceID string, executionID string) {
	t.Helper()
	completed, err := workflowService.ReadExecution(workspaceID, executionID)
	if err != nil {
		t.Fatalf("read completed execution: %v", err)
	}
	if completed.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", completed.Status)
	}
	completedWork := latestNodeExecutionForTest(t, completed, "work")
	if completedWork.Status != NodeExecutionStatusSucceeded {
		t.Fatalf("work status = %s, want succeeded", completedWork.Status)
	}
	if completedWork.Result == nil || completedWork.Result.PendingApproval != nil {
		t.Fatalf("completed work result = %+v, want no pending approval", completedWork.Result)
	}
}

func assertWorkflowChatsHiddenForTest(t *testing.T, chatService *chat.Service, workspaceID string) {
	t.Helper()
	list, err := chatService.ListConversations(workspaceID)
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	if len(list.Conversations) != 0 {
		t.Fatalf("visible conversations = %+v, want workflow approval chat hidden", list.Conversations)
	}
}

func assertPhase1RunnerRecords(t *testing.T, workflowService *Service, workspaceID string, executionID string, work WorkflowNodeExecution) {
	t.Helper()
	if work.RunnerKind == nil || *work.RunnerKind != ActionKindAgentCodex {
		t.Fatalf("runner kind = %v, want agent.codex", work.RunnerKind)
	}
	if work.InputHash == "" {
		t.Fatal("input hash is empty")
	}
	if work.Input == nil {
		t.Fatal("input snapshot is nil")
	}
	if work.ActionPolicy == nil || work.ActionPolicy.RunnerKind != ActionKindAgentCodex || work.ActionPolicy.ExtensionKind != string(ActionKindAgentCodex) {
		t.Fatalf("action policy = %+v, want agent.codex policy", work.ActionPolicy)
	}
	if work.SideEffectPolicy == nil || work.SideEffectPolicy.Kind != SideEffectPolicyKindRequiresApproval || work.SideEffectPolicy.Scope != SideEffectScopeRunnerDefined {
		t.Fatalf("side effect policy = %+v, want runner-defined approval policy", work.SideEffectPolicy)
	}
	if work.RunnerCapabilities == nil || !runnerSupportsOperation(*work.RunnerCapabilities, RunnerOperationStart) || !runnerSupportsOperation(*work.RunnerCapabilities, RunnerOperationCancel) {
		t.Fatalf("runner capabilities = %+v, want start and cancel support", work.RunnerCapabilities)
	}
	if work.RunnerState == nil || work.RunnerState.Status != RunnerStateStatusCompleted || work.RunnerState.LastRunnerEventOrdinal <= 0 {
		t.Fatalf("runner state = %+v, want completed state with runner events", work.RunnerState)
	}
	chatRunID := assertRunnerRef(t, work.RunnerRefs, RunnerRefChatRun)
	if !activityRefsContain(work.ActivityRefs, RunnerRefChatRun, chatRunID) {
		t.Fatalf("activity refs = %+v, want chat.run %s", work.ActivityRefs, chatRunID)
	}
	assertWorkflowEventsInclude(t, workflowService, workspaceID, executionID, []WorkflowEventType{
		EventRunnerAttemptStarted,
		EventRunnerStructuredOutputReceived,
		EventRunnerAttemptCompleted,
	})
}

func activityRefsContain(refs []WorkflowActivityRef, kind string, ref string) bool {
	for _, candidate := range refs {
		if candidate.Kind == kind && candidate.Ref == ref {
			return true
		}
	}
	return false
}

func assertWorkflowEventsInclude(t *testing.T, workflowService *Service, workspaceID string, executionID string, expected []WorkflowEventType) {
	t.Helper()
	page, err := workflowService.ReadExecutionEventPage(workspaceID, executionID, 0, 100)
	if err != nil {
		t.Fatalf("read workflow event page: %v", err)
	}
	seen := map[WorkflowEventType]bool{}
	for _, event := range page.Events {
		seen[event.Type] = true
	}
	for _, eventType := range expected {
		if !seen[eventType] {
			t.Fatalf("workflow events = %+v, missing %s", eventTypes(page.Events), eventType)
		}
	}
}

func eventTypes(events []WorkflowEvent) []WorkflowEventType {
	types := make([]WorkflowEventType, 0, len(events))
	for _, event := range events {
		types = append(types, event.Type)
	}
	return types
}

func newCodexRunnerTestServices(t *testing.T) (*Service, *chat.Service, *chat.ScriptedWorkflowHarness, string) {
	workflowService, chatService, harness, _, _, _, workspaceID := newCodexRunnerRecoveryTestServices(t)
	return workflowService, chatService, harness, workspaceID
}

func newCodexRunnerRecoveryTestServices(t *testing.T) (*Service, *chat.Service, *chat.ScriptedWorkflowHarness, *Store, testWorkspaceResolver, IDGenerator, string) {
	t.Helper()
	return newCodexRunnerRecoveryTestServicesWithChatOptions(t)
}

func newCodexRunnerRecoveryTestServicesWithChatOptions(t *testing.T, chatOptions ...chat.Option) (*Service, *chat.Service, *chat.ScriptedWorkflowHarness, *Store, testWorkspaceResolver, IDGenerator, string) {
	t.Helper()
	appDataDir := t.TempDir()
	workspaceID := "workspace_codex_runner"
	resolver := testWorkspaceResolver{
		workspaces: map[string]workspace.WorkspaceSummary{
			workspaceID: {
				ID:          workspaceID,
				RootPath:    t.TempDir(),
				DisplayName: "Workspace",
			},
		},
	}
	idGenerator := lockedDeterministicIDGenerator()
	chatStore, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create chat store: %v", err)
	}
	var workflowService *Service
	harness := chat.NewScriptedWorkflowHarness(chat.ScriptedWorkflowHarnessConfig{
		AppDataDir: appDataDir,
		WorkflowResultReporter: func(ctx context.Context, payload json.RawMessage) error {
			if workflowService == nil {
				return errors.New("workflow service is not ready")
			}
			return scriptedWorkflowResultReporterForTest(workflowService)(ctx, payload)
		},
	})
	options := append([]chat.Option{chat.WithIDGenerator(idGenerator), chat.WithClock(fixedTestClock(t))}, chatOptions...)
	chatService, err := chat.NewService(chatStore, resolver, harness, options...)
	if err != nil {
		t.Fatalf("create chat service: %v", err)
	}
	workflowStore, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create workflow store: %v", err)
	}
	t.Cleanup(func() {
		if err := workflowStore.Close(); err != nil {
			t.Fatalf("close workflow store: %v", err)
		}
	})
	workflowService, err = NewService(workflowStore, resolver, WithIDGenerator(idGenerator), WithClock(fixedTestClock(t)), WithCodexChatService(chatService))
	if err != nil {
		t.Fatalf("create workflow service: %v", err)
	}
	t.Cleanup(workflowService.CloseEvents)
	return workflowService, chatService, harness, workflowStore, resolver, idGenerator, workspaceID
}

func steerWorkflowChatWhenReady(t *testing.T, chatService *chat.Service, workspaceID string, conversationID string, prompt string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		if _, err := chatService.SteerActiveRunInput(workspaceID, conversationID, chat.TextChatInput(prompt)); err == nil {
			return
		} else {
			lastErr = err
			if !errors.Is(err, chat.ErrTurnNotStarted) {
				t.Fatalf("steer hidden workflow chat: %v", err)
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting to steer hidden workflow chat: %v", lastErr)
}

func waitForWorkflowChatRunStatus(t *testing.T, chatService *chat.Service, workspaceID string, conversationID string, runID string, status chat.RunStatus) chat.Run {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		runs, err := chatService.ListRuns(workspaceID, conversationID)
		if err != nil {
			t.Fatalf("list workflow chat runs: %v", err)
		}
		for _, run := range runs {
			if run.ID == runID && run.Status == status {
				return run
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	runs, err := chatService.ListRuns(workspaceID, conversationID)
	if err != nil {
		t.Fatalf("list final workflow chat runs: %v", err)
	}
	t.Fatalf("workflow chat runs = %+v, want run %s status %s", runs, runID, status)
	return chat.Run{}
}

func waitForWorkflowChatHarnessRef(t *testing.T, chatService *chat.Service, workspaceID string, conversationID string, refKind string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	var page chat.MessagePage
	for time.Now().Before(deadline) {
		var err error
		page, err = chatService.LoadMessagePage(workspaceID, conversationID, 0, 1)
		if err != nil {
			t.Fatalf("load hidden workflow chat: %v", err)
		}
		refs := runnerRefsFromConversation(page.Conversation)
		if runnerRefValue(refs, refKind) != "" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for chat harness ref %s on conversation %s, last page %+v", refKind, conversationID, page)
}

func codexActionGraph(prompt string, freshConversation bool) WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			{
				ID:   "work",
				Kind: NodeKindAction,
				Action: &WorkflowActionConfig{
					Kind: ActionKindAgentCodex,
					Codex: &WorkflowCodexActionConfig{
						Prompt:            prompt,
						FreshConversation: freshConversation,
					},
				},
			},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_work", FromNodeID: "start", ToNodeID: "work", Kind: EdgeKindNormal},
			{ID: "work_end", FromNodeID: "work", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
}

func assertWorkflowResultPayload(t *testing.T, work WorkflowNodeExecution) {
	t.Helper()
	if work.Result == nil {
		t.Fatal("work result is nil")
	}
	if len(work.Result.Signals) != 2 ||
		work.Result.Signals[0] != (WorkflowActionSignal{Name: "route", Value: "yes"}) ||
		work.Result.Signals[1] != (WorkflowActionSignal{Name: "decision", Value: "exit"}) {
		t.Fatalf("signals = %+v, want scripted workflow signals", work.Result.Signals)
	}
	if len(work.Result.FilePaths) != 1 || work.Result.FilePaths[0] != "reports/workflow-result.md" {
		t.Fatalf("file paths = %+v, want scripted path", work.Result.FilePaths)
	}
	var output map[string]string
	if err := json.Unmarshal(work.Result.Output, &output); err != nil {
		t.Fatalf("decode output: %v", err)
	}
	if output["summary"] != "scripted workflow result" {
		t.Fatalf("output = %+v, want scripted summary", output)
	}
}

func scriptedWorkflowActionResultForTest(t *testing.T) WorkflowActionResult {
	t.Helper()
	output, err := json.Marshal(map[string]string{"summary": "scripted workflow result"})
	if err != nil {
		t.Fatalf("marshal scripted workflow output: %v", err)
	}
	return WorkflowActionResult{
		Status: ActionCompletionCompleted,
		Signals: []WorkflowActionSignal{
			{Name: "route", Value: "yes"},
			{Name: "decision", Value: "exit"},
		},
		Output:    output,
		FilePaths: []string{"reports/workflow-result.md"},
	}
}

func scriptedWorkflowResultReporterForTest(service *Service) chat.ScriptedWorkflowResultReporter {
	return func(_ context.Context, payload json.RawMessage) error {
		var input WorkflowExecutionResultInput
		if err := json.Unmarshal(payload, &input); err != nil {
			return err
		}
		_, err := service.ReportExecutionResult(input.WorkspaceID, input)
		return err
	}
}

func assertRunnerRef(t *testing.T, refs []WorkflowActionRunnerRef, kind string) string {
	t.Helper()
	value := runnerRefValue(refs, kind)
	if value == "" {
		t.Fatalf("runner refs = %+v, missing %s", refs, kind)
	}
	return value
}

func runnerEventTypes(events []RunnerEvent) []RunnerEventType {
	types := make([]RunnerEventType, 0, len(events))
	for _, event := range events {
		types = append(types, event.Type)
	}
	return types
}

func runnerEventTypesContain(events []RunnerEvent, expected RunnerEventType) bool {
	for _, event := range events {
		if event.Type == expected {
			return true
		}
	}
	return false
}

func waitForWorkflowEvent(t *testing.T, subscription *EventSubscription, executionID string, eventType WorkflowEventType) {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case envelope := <-subscription.Events:
			event := envelope.Event
			if event.ExecutionID == executionID && event.Type == eventType {
				return
			}
		case <-deadline:
			t.Fatalf("timed out waiting for workflow event %s on execution %s", eventType, executionID)
		}
	}
}

func waitForScriptedHarnessIdle(t *testing.T, harness *chat.ScriptedWorkflowHarness) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if harness.ActiveRunCount() == 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for scripted harness to become idle")
}

func lockedDeterministicIDGenerator() IDGenerator {
	var mu sync.Mutex
	counters := map[string]int{}
	return func(prefix string) (string, error) {
		mu.Lock()
		defer mu.Unlock()
		counters[prefix]++
		return fmt.Sprintf("%s_%03d", prefix, counters[prefix]), nil
	}
}
