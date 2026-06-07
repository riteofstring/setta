package semanticgraph

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/orchestrator"
	"setta/internal/workspace"
)

func TestServiceAttachesChatRunAndEndsActivity(t *testing.T) {
	store := newTestStore(t)
	workspaceRoot := t.TempDir()
	service := newAssociationTestService(t, store, workspaceRoot, nil, fakeChatResolver{
		run: chat.Run{
			ID:               "run_attach",
			WorkspaceID:      testWorkspaceID,
			ConversationID:   "conversation_attach",
			Status:           chat.RunStatusRunning,
			PromptSummary:    "Investigate semantic graph activity capture",
			TriggerMessageID: "message_user",
			Harness:          chat.HarnessCodex,
			StartedAt:        testTimestamp(2),
		},
	})
	appendTestEvent(t, store, EventNodeCreated, "node_attach", nodeCreatedPayload{
		NodeID: "node_attach",
		Kind:   NodeKindFinding,
		Label:  "Attach real work",
	})

	result, err := service.AttachChatRun(context.Background(), AttachChatRunInput{
		WorkspaceID:  testWorkspaceID,
		NodeID:       "node_attach",
		ChatRunID:    "run_attach",
		ActivityKind: ActivityKindExploring,
		Actor:        SemanticAttachmentActor{ActorKind: ActorKindUser, ActorID: "user_attach"},
	})
	if err != nil {
		t.Fatalf("attach chat run: %v", err)
	}
	assertChatRunAttachmentResult(t, result)

	ended, err := service.EndActivity(context.Background(), EndSemanticActivityInput{
		WorkspaceID:        testWorkspaceID,
		ActivityIntervalID: result.Activity.ID,
		Actor:              SemanticAttachmentActor{ActorKind: ActorKindUser, ActorID: "user_attach"},
	})
	if err != nil {
		t.Fatalf("end activity: %v", err)
	}
	assertEndedSemanticActivity(t, ended)
	assertChatRunAttachmentReadback(t, service)
	assertNoAutoCreatedSemanticNodes(t, service, 1)

	assertFailedChatRunAttachPreservesHistory(t, service)
}

func assertChatRunAttachmentResult(t *testing.T, result SemanticAttachmentResult) {
	t.Helper()
	if len(result.Events) != 2 || result.Events[0].EventType != EventEvidenceAttached || result.Events[1].EventType != EventActivityStarted {
		t.Fatalf("attachment events = %+v, want evidence then activity", result.Events)
	}
	if result.Evidence.SourceKind != EvidenceSourceChatRun || result.Evidence.SourceID != "run_attach" {
		t.Fatalf("attachment evidence = %+v, want chat run evidence", result.Evidence)
	}
	if result.Activity.SourceKind != ActivitySourceChatRun || result.Activity.ChatRunID != "run_attach" || result.Activity.EvidenceAnchorID != result.Evidence.ID {
		t.Fatalf("attachment activity = %+v, want chat run activity linked to evidence", result.Activity)
	}
}

func assertEndedSemanticActivity(t *testing.T, ended SemanticActivityEndResult) {
	t.Helper()
	if ended.Activity.EndedAt == "" || ended.Activity.EndedByEventID == "" {
		t.Fatalf("ended activity = %+v, want end projection", ended.Activity)
	}
}

func assertChatRunAttachmentReadback(t *testing.T, service *Service) {
	t.Helper()
	detail, ok, err := service.ReadNodeDetail(context.Background(), testWorkspaceID, "node_attach")
	if err != nil {
		t.Fatalf("read detail: %v", err)
	}
	if !ok {
		t.Fatal("node detail missing")
	}
	if len(detail.Evidence) != 1 || len(detail.Activity) != 1 || detail.Activity[0].EndedAt == "" {
		t.Fatalf("detail after attach/end = %+v, want evidence and ended activity", detail)
	}
}

func assertNoAutoCreatedSemanticNodes(t *testing.T, service *Service, expected int) {
	t.Helper()
	graph, err := service.ReadGraph(context.Background(), testWorkspaceID)
	if err != nil {
		t.Fatalf("read graph: %v", err)
	}
	if len(graph.Nodes) != expected {
		t.Fatalf("graph nodes = %+v, want no auto-created semantic nodes", graph.Nodes)
	}
}

func assertFailedChatRunAttachPreservesHistory(t *testing.T, service *Service) {
	t.Helper()
	before, err := service.ReadEventHistory(context.Background(), testWorkspaceID, "node_attach", 0, 20)
	if err != nil {
		t.Fatalf("read history before failed attach: %v", err)
	}
	_, err = service.AttachChatRun(context.Background(), AttachChatRunInput{
		WorkspaceID:  testWorkspaceID,
		NodeID:       "node_attach",
		ChatRunID:    "run_missing",
		ActivityKind: ActivityKindExploring,
	})
	if err == nil {
		t.Fatal("attach missing chat run succeeded, want error")
	}
	after, err := service.ReadEventHistory(context.Background(), testWorkspaceID, "node_attach", 0, 20)
	if err != nil {
		t.Fatalf("read history after failed attach: %v", err)
	}
	if len(after.Events) != len(before.Events) {
		t.Fatalf("history changed after failed source validation: before=%d after=%d", len(before.Events), len(after.Events))
	}
}

func TestServiceAttachesWorkflowExecution(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), fakeWorkflowResolver{
		execution: orchestrator.WorkflowExecution{
			ID:                  "workflow_execution_attach",
			WorkspaceID:         testWorkspaceID,
			DefinitionID:        "workflow_definition_attach",
			DefinitionVersionID: "workflow_version_attach",
			Status:              orchestrator.ExecutionStatusRunning,
			StartedAt:           testTimestamp(2),
		},
	}, nil)
	appendTestEvent(t, store, EventNodeCreated, "node_workflow", nodeCreatedPayload{
		NodeID: "node_workflow",
		Kind:   NodeKindDecision,
		Label:  "Attach workflow execution",
	})

	result, err := service.AttachWorkflowExecution(context.Background(), AttachWorkflowExecutionInput{
		WorkspaceID:         testWorkspaceID,
		NodeID:              "node_workflow",
		WorkflowExecutionID: "workflow_execution_attach",
		ActivityKind:        ActivityKindDebugging,
	})
	if err != nil {
		t.Fatalf("attach workflow execution: %v", err)
	}
	if result.Evidence.SourceKind != EvidenceSourceWorkflowExecution || result.Evidence.SourceID != "workflow_execution_attach" {
		t.Fatalf("workflow evidence = %+v, want workflow execution source", result.Evidence)
	}
	if result.Activity.SourceKind != ActivitySourceWorkflowExecution || result.Activity.WorkflowExecutionID != "workflow_execution_attach" {
		t.Fatalf("workflow activity = %+v, want workflow execution source refs", result.Activity)
	}
	graph, err := service.ReadGraph(context.Background(), testWorkspaceID)
	if err != nil {
		t.Fatalf("read graph: %v", err)
	}
	if len(graph.Nodes) != 1 {
		t.Fatalf("graph nodes = %+v, want no inferred semantic nodes", graph.Nodes)
	}
}

func TestServiceAttachesFileRangeWithContentHash(t *testing.T) {
	store := newTestStore(t)
	workspaceRoot := t.TempDir()
	service := newAssociationTestService(t, store, workspaceRoot, nil, nil)
	appendTestEvent(t, store, EventNodeCreated, "node_file", nodeCreatedPayload{
		NodeID: "node_file",
		Kind:   NodeKindConstraint,
		Label:  "Bounded file evidence",
	})
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "docs"), 0o755); err != nil {
		t.Fatalf("create docs dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "docs", "plan.md"), []byte("semantic evidence\n"), 0o644); err != nil {
		t.Fatalf("write evidence file: %v", err)
	}

	result, err := service.AttachFileRange(context.Background(), AttachFileRangeInput{
		WorkspaceID:  testWorkspaceID,
		NodeID:       "node_file",
		Path:         "docs/plan.md",
		RangeStart:   1,
		RangeEnd:     1,
		ActivityKind: ActivityKindEditing,
		Summary:      "File range explicitly attached",
	})
	if err != nil {
		t.Fatalf("attach file range: %v", err)
	}
	if result.Evidence.Path != "docs/plan.md" || !strings.HasPrefix(result.Evidence.ContentHash, "sha256:") {
		t.Fatalf("file evidence = %+v, want relative path and sha256 hash", result.Evidence)
	}
	if result.Activity.SourceKind != ActivitySourceFileRange || result.Activity.SourceID != "" {
		t.Fatalf("file activity = %+v, want typed file range source", result.Activity)
	}

	_, err = service.AttachFileRange(context.Background(), AttachFileRangeInput{
		WorkspaceID:  testWorkspaceID,
		NodeID:       "node_file",
		Path:         filepath.Join(filepath.Dir(workspaceRoot), "outside.md"),
		ActivityKind: ActivityKindEditing,
	})
	if err == nil {
		t.Fatal("attach outside workspace file succeeded, want error")
	}
}

func newAssociationTestService(t *testing.T, store *Store, workspaceRoot string, workflowResolver WorkflowSourceResolver, chatResolver ChatSourceResolver) *Service {
	t.Helper()
	clock := time.Date(2026, 6, 10, 13, 0, 0, 0, time.UTC)
	service, err := NewService(
		store,
		associationWorkspaceResolver{root: workspaceRoot},
		WithIDGenerator(countingIDGenerator()),
		WithClock(func() time.Time {
			clock = clock.Add(time.Second)
			return clock
		}),
		WithWorkflowSourceResolver(workflowResolver),
		WithChatSourceResolver(chatResolver),
	)
	if err != nil {
		t.Fatalf("new association test service: %v", err)
	}
	return service
}

type associationWorkspaceResolver struct {
	root string
}

func (resolver associationWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	if id != testWorkspaceID {
		return workspace.WorkspaceSummary{}, errors.New("workspace not found")
	}
	return workspace.WorkspaceSummary{ID: id, RootPath: resolver.root, DisplayName: "Semantic Test"}, nil
}

func countingIDGenerator() IDGenerator {
	counts := map[string]int{}
	return func(prefix string) (string, error) {
		counts[prefix]++
		return prefix + "_" + threeDigit(counts[prefix]), nil
	}
}

type fakeChatResolver struct {
	run     chat.Run
	message chat.ChatMessage
	item    chat.RunItem
}

func (resolver fakeChatResolver) ReadRun(_ string, runID string) (chat.Run, error) {
	if resolver.run.ID == runID {
		return resolver.run, nil
	}
	return chat.Run{}, errors.New("chat run not found")
}

func (resolver fakeChatResolver) ReadMessage(_ string, conversationID string, messageID string) (chat.ChatMessage, error) {
	if resolver.message.ConversationID == conversationID && resolver.message.ID == messageID {
		return resolver.message, nil
	}
	return chat.ChatMessage{}, errors.New("chat message not found")
}

func (resolver fakeChatResolver) ReadRunItem(_ string, runID string, runItemID string) (chat.RunItem, error) {
	if resolver.item.RunID == runID && resolver.item.ID == runItemID {
		return resolver.item, nil
	}
	return chat.RunItem{}, errors.New("run item not found")
}

type fakeWorkflowResolver struct {
	execution orchestrator.WorkflowExecution
}

func (resolver fakeWorkflowResolver) ReadDefinition(string, string) (orchestrator.WorkflowDefinition, error) {
	return orchestrator.WorkflowDefinition{}, errors.New("workflow definition not found")
}

func (resolver fakeWorkflowResolver) ReadExecution(_ string, executionID string) (orchestrator.WorkflowExecution, error) {
	if resolver.execution.ID == executionID {
		return resolver.execution, nil
	}
	return orchestrator.WorkflowExecution{}, errors.New("workflow execution not found")
}

func (resolver fakeWorkflowResolver) ReadGraphProjection(string, string, string, string) (orchestrator.WorkflowGraphProjection, bool, error) {
	return orchestrator.WorkflowGraphProjection{}, false, errors.New("workflow graph projection not found")
}
