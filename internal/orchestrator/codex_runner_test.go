package orchestrator

import (
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/workspace"
)

func TestCodexRunnerCompletesWorkflowThroughWorkflowOwnedChat(t *testing.T) {
	workflowService, chatService, harness, workspaceID := newCodexRunnerTestServices(t)
	definition, err := workflowService.CreateDefinition(workspaceID, "Workflow result", "", codexActionGraph("workflow result action", true))
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
	if execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", execution.Status)
	}
	work := latestNodeExecutionForTest(t, execution, "work")
	if work.Status != NodeExecutionStatusSucceeded {
		t.Fatalf("work status = %s, want succeeded", work.Status)
	}
	assertWorkflowResultPayload(t, work)
	assertRunnerRef(t, work.RunnerRefs, RunnerRefChatRun)
	assertRunnerRef(t, work.RunnerRefs, RunnerRefCodexThread)
	assertRunnerRef(t, work.RunnerRefs, RunnerRefCodexSession)
	assertRunnerRef(t, work.RunnerRefs, RunnerRefCodexTurn)

	conversationID := assertRunnerRef(t, work.RunnerRefs, RunnerRefChatConversation)
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

func newCodexRunnerTestServices(t *testing.T) (*Service, *chat.Service, *chat.ScriptedWorkflowHarness, string) {
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
	harness := chat.NewScriptedWorkflowHarness()
	chatService, err := chat.NewService(chatStore, resolver, harness, chat.WithIDGenerator(idGenerator), chat.WithClock(fixedTestClock(t)))
	if err != nil {
		t.Fatalf("create chat service: %v", err)
	}
	workflowStore, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create workflow store: %v", err)
	}
	workflowService, err := NewService(workflowStore, resolver, WithIDGenerator(idGenerator), WithClock(fixedTestClock(t)), WithCodexChatService(chatService))
	if err != nil {
		t.Fatalf("create workflow service: %v", err)
	}
	return workflowService, chatService, harness, workspaceID
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

func assertRunnerRef(t *testing.T, refs []WorkflowActionRunnerRef, kind string) string {
	t.Helper()
	value := runnerRefValue(refs, kind)
	if value == "" {
		t.Fatalf("runner refs = %+v, missing %s", refs, kind)
	}
	return value
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
