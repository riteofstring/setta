package workspaceactivity

import (
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
	return chat.RunItem{
		ID:             id,
		ConversationID: conversationID,
		RunID:          runID,
		Command:        "npm test",
		CreatedAt:      "2026-06-21T12:00:03Z",
		Status:         chat.RunItemStatusCompleted,
		Type:           chat.RunItemTypeCommandExecution,
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

func (source *fakeChatSource) LoadRunActivityPage(_ string, runID string, _ int) (chat.RunActivityPage, error) {
	return chat.RunActivityPage{RunID: runID, Items: source.runItems[runID]}, nil
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
