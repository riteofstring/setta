package workspaceactivity

import (
	"fmt"
	"testing"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

func TestReadExecutionSnapshotScopesToExecutionAndSynthesizesTerminalNodes(t *testing.T) {
	execution := orchestrator.WorkflowExecution{
		ID:                  "execution_run",
		WorkspaceID:         "workspace",
		DefinitionID:        "workflow_definition",
		DefinitionVersionID: "workflow_version",
		Status:              orchestrator.ExecutionStatusCancelled,
		CompletedAt:         "2026-06-21T12:00:09Z",
		NodeExecutions: []orchestrator.WorkflowNodeExecution{
			// Left in-flight at cancel time: the orchestrator records the cancelled node
			// state but only emits an execution-level cancelled event, so this node has no
			// terminal event and must be synthesized.
			{ID: "node_execution_build", NodeID: "node_build", Status: orchestrator.NodeExecutionStatusCancelled, StartedAt: "2026-06-21T12:00:02Z", CompletedAt: "2026-06-21T12:00:09Z"},
			// Finished normally with a terminal completed event, so it must NOT be synthesized.
			{ID: "node_execution_review", NodeID: "node_review", Status: orchestrator.NodeExecutionStatusSucceeded, CompletedAt: "2026-06-21T12:00:05Z"},
		},
	}
	events := []orchestrator.WorkflowEvent{
		workflowStatusEvent("event_build_started", orchestrator.EventActionStarted, "execution_run", "node_build", "node_execution_build", "2026-06-21T12:00:02Z"),
		workflowStatusEvent("event_review_completed", orchestrator.EventActionCompleted, "execution_run", "node_review", "node_execution_review", "2026-06-21T12:00:05Z"),
		workflowStatusEvent("event_execution_cancelled", orchestrator.EventExecutionCancelled, "execution_run", "", "", "2026-06-21T12:00:09Z"),
	}

	chatSource := &fakeChatSource{
		conversations: []chat.Conversation{
			workflowConversation("conversation_run", "execution_run", "node_build", "node_execution_build"),
			workflowConversation("conversation_other", "execution_other", "node_other", "node_execution_other"),
		},
		runs: map[string][]chat.Run{
			"conversation_run":   {{ID: "run_run"}},
			"conversation_other": {{ID: "run_other"}},
		},
		runItems: map[string][]chat.RunItem{
			"run_run":   {commandRunItem("run_item_cmd_run", "conversation_run", "run_run")},
			"run_other": {commandRunItem("run_item_cmd_other", "conversation_other", "run_other")},
		},
	}
	workflowSource := &fakeWorkflowSource{
		executions:  map[string]orchestrator.WorkflowExecution{"execution_run": execution},
		eventsByExe: map[string][]orchestrator.WorkflowEvent{"execution_run": events},
	}

	hub, err := NewEventHub("workspace_activity_stream_test")
	if err != nil {
		t.Fatalf("create event hub: %v", err)
	}
	defer hub.Close()
	service := &Service{chat: chatSource, workflow: workflowSource, hub: hub}

	snapshot, err := service.ReadExecutionSnapshot("workspace", "execution_run", 50)
	if err != nil {
		t.Fatalf("read execution snapshot: %v", err)
	}

	if workflowSource.readExecutionID != "execution_run" {
		t.Fatalf("ReadExecution called with %q, want execution_run", workflowSource.readExecutionID)
	}

	byActivityID := map[string]WorkspaceActivityRecord{}
	for _, record := range snapshot.Activities {
		byActivityID[record.ActivityID] = record
	}

	synthesized, ok := byActivityID["workflow_node_state:execution_run:node_build"]
	if !ok {
		t.Fatalf("missing synthesized terminal node record; activities = %+v", snapshot.Activities)
	}
	if synthesized.Status != ActivityStatusCancelled || synthesized.Kind != ActivityKindWorkflowStatus {
		t.Fatalf("synthesized record kind/status = %s/%s", synthesized.Kind, synthesized.Status)
	}

	// node_review already has a terminal completed event, so no terminal node-state
	// record should be synthesized for it.
	if _, ok := byActivityID["workflow_node_state:execution_run:node_review"]; ok {
		t.Fatal("node_review has a terminal event and must not be synthesized")
	}

	if _, ok := byActivityID["chat_run_item:run_item_cmd_run"]; !ok {
		t.Fatalf("missing command activity for the selected run; activities = %+v", snapshot.Activities)
	}
	if _, ok := byActivityID["chat_run_item:run_item_cmd_other"]; ok {
		t.Fatal("command activity from a different execution must not be in the run-scoped snapshot")
	}
}

func TestReadExecutionSnapshotLoadsNewestRunActivity(t *testing.T) {
	service := newExecutionSnapshotTestService(t, []chat.RunItem{
		commandRunItemAt("run_item_old", "conversation_run", "run_run", "2026-06-21T12:00:01Z"),
		commandRunItemAt("run_item_new", "conversation_run", "run_run", "2026-06-21T12:00:10Z"),
	})

	snapshot, err := service.ReadExecutionSnapshot("workspace", "execution_run", 1)
	if err != nil {
		t.Fatalf("read execution snapshot: %v", err)
	}

	if len(snapshot.Activities) != 1 || snapshot.Activities[0].ActivityID != "chat_run_item:run_item_new" {
		t.Fatalf("snapshot activities = %+v, want newest run item activity", snapshot.Activities)
	}
}

func TestReadExecutionSnapshotPagesPastNonActivityRunItemTail(t *testing.T) {
	items := []chat.RunItem{commandRunItemAt("run_item_command", "conversation_run", "run_run", "2026-06-21T12:00:01Z")}
	for index := 0; index < snapshotRunActivityPageLimit; index++ {
		items = append(items, agentMessageRunItem(index))
	}
	service := newExecutionSnapshotTestService(t, items)

	snapshot, err := service.ReadExecutionSnapshot("workspace", "execution_run", 1)
	if err != nil {
		t.Fatalf("read execution snapshot: %v", err)
	}

	if len(snapshot.Activities) != 1 || snapshot.Activities[0].ActivityID != "chat_run_item:run_item_command" {
		t.Fatalf("snapshot activities = %+v, want command before non-activity tail", snapshot.Activities)
	}
}

func workflowStatusEvent(id string, eventType orchestrator.WorkflowEventType, executionID string, nodeID string, nodeExecutionID string, createdAt string) orchestrator.WorkflowEvent {
	return orchestrator.WorkflowEvent{
		ID:                  id,
		WorkspaceID:         "workspace",
		DefinitionID:        "workflow_definition",
		DefinitionVersionID: "workflow_version",
		ExecutionID:         executionID,
		NodeID:              nodeID,
		NodeExecutionID:     nodeExecutionID,
		Type:                eventType,
		CreatedAt:           createdAt,
	}
}

func newExecutionSnapshotTestService(t *testing.T, runItems []chat.RunItem) *Service {
	t.Helper()
	execution := orchestrator.WorkflowExecution{
		ID:                  "execution_run",
		WorkspaceID:         "workspace",
		DefinitionID:        "workflow_definition",
		DefinitionVersionID: "workflow_version",
		Status:              orchestrator.ExecutionStatusRunning,
	}
	chatSource := &fakeChatSource{
		conversations: []chat.Conversation{
			workflowConversation("conversation_run", "execution_run", "node_build", "node_execution_build"),
		},
		runs:     map[string][]chat.Run{"conversation_run": {{ID: "run_run"}}},
		runItems: map[string][]chat.RunItem{"run_run": runItems},
	}
	workflowSource := &fakeWorkflowSource{
		executions:  map[string]orchestrator.WorkflowExecution{"execution_run": execution},
		eventsByExe: map[string][]orchestrator.WorkflowEvent{"execution_run": []orchestrator.WorkflowEvent{}},
	}
	hub, err := NewEventHub("workspace_activity_stream_test")
	if err != nil {
		t.Fatalf("create event hub: %v", err)
	}
	t.Cleanup(hub.Close)
	return &Service{chat: chatSource, workflow: workflowSource, hub: hub}
}

func workflowConversation(id string, executionID string, nodeID string, nodeExecutionID string) chat.Conversation {
	return chat.Conversation{
		ID:          id,
		WorkspaceID: "workspace",
		Internal:    true,
		Workflow: &chat.ConversationWorkflowMetadata{
			DefinitionID:        "workflow_definition",
			DefinitionVersionID: "workflow_version",
			ExecutionID:         executionID,
			NodeID:              nodeID,
			NodeExecutionID:     nodeExecutionID,
		},
	}
}

func commandRunItem(id string, conversationID string, runID string) chat.RunItem {
	return commandRunItemAt(id, conversationID, runID, "2026-06-21T12:00:03Z")
}

func commandRunItemAt(id string, conversationID string, runID string, createdAt string) chat.RunItem {
	return chat.RunItem{
		ID:             id,
		ConversationID: conversationID,
		RunID:          runID,
		CreatedAt:      createdAt,
		Status:         chat.RunItemStatusCompleted,
		Type:           chat.RunItemTypeCommandExecution,
		WorkspaceID:    "workspace",
		Details: chat.NewRunItemCommandExecutionDetails(chat.RunItemCommandExecutionDetails{
			Command: "npm test",
		}),
	}
}

func agentMessageRunItem(index int) chat.RunItem {
	return chat.RunItem{
		ID:             fmt.Sprintf("run_item_agent_%03d", index),
		ConversationID: "conversation_run",
		RunID:          "run_run",
		CreatedAt:      fmt.Sprintf("2026-06-21T12:%02d:%02dZ", 1+index/60, index%60),
		Status:         chat.RunItemStatusCompleted,
		Type:           chat.RunItemTypeAgentMessage,
		WorkspaceID:    "workspace",
	}
}

type fakeChatSource struct {
	conversations []chat.Conversation
	runs          map[string][]chat.Run
	runItems      map[string][]chat.RunItem
}

func (source *fakeChatSource) ListWorkflowConversations(string) ([]chat.Conversation, error) {
	return source.conversations, nil
}

func (source *fakeChatSource) ListRuns(_ string, conversationID string) ([]chat.Run, error) {
	return source.runs[conversationID], nil
}

func (source *fakeChatSource) LoadMessagePage(string, string, int, int) (chat.MessagePage, error) {
	return chat.MessagePage{}, nil
}

func (source *fakeChatSource) LoadRunActivityItemsBefore(_ string, runID string, beforeItemID string, limit int) ([]chat.RunItem, string, bool, error) {
	items := source.runItems[runID]
	end := len(items)
	if beforeItemID != "" {
		index, ok := runItemIndexByID(items, beforeItemID)
		if !ok {
			return nil, "", false, fmt.Errorf("run item %s not found", beforeItemID)
		}
		end = index
	}
	start := end - limit
	if start < 0 {
		start = 0
	}
	page := append([]chat.RunItem{}, items[start:end]...)
	hasMore := start > 0
	nextBeforeItemID := ""
	if hasMore && len(page) > 0 {
		nextBeforeItemID = page[0].ID
	}
	return page, nextBeforeItemID, hasMore, nil
}

func runItemIndexByID(items []chat.RunItem, itemID string) (int, bool) {
	for index, item := range items {
		if item.ID == itemID {
			return index, true
		}
	}
	return 0, false
}

func (source *fakeChatSource) SubscribeEvents(chat.EventCursor) (*chat.EventSubscription, error) {
	return nil, nil
}

type fakeWorkflowSource struct {
	executions  map[string]orchestrator.WorkflowExecution
	eventsByExe map[string][]orchestrator.WorkflowEvent

	readExecutionID string
}

func (source *fakeWorkflowSource) ListExecutions(string) ([]orchestrator.WorkflowExecution, error) {
	executions := make([]orchestrator.WorkflowExecution, 0, len(source.executions))
	for _, execution := range source.executions {
		executions = append(executions, execution)
	}
	return executions, nil
}

func (source *fakeWorkflowSource) ReadExecution(_ string, executionID string) (orchestrator.WorkflowExecution, error) {
	source.readExecutionID = executionID
	return source.executions[executionID], nil
}

func (source *fakeWorkflowSource) ReadExecutionEventPage(_ string, executionID string, _ int, _ int) (orchestrator.WorkflowExecutionEventPage, error) {
	return orchestrator.WorkflowExecutionEventPage{ExecutionID: executionID, Events: source.eventsByExe[executionID]}, nil
}

func (source *fakeWorkflowSource) SubscribeEvents(orchestrator.WorkflowEventCursor) (*orchestrator.EventSubscription, error) {
	return nil, nil
}
