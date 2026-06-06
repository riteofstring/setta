package orchestrator

import (
	"fmt"
	"testing"
	"time"

	"setta/internal/workspace"
)

func TestServicePersistsVersionsExecutionsEventsAndRecoversInterruptedRuns(t *testing.T) {
	store, resolver, service, workspaceID := newTestWorkflowService(t)
	definition, firstVersionID, running := createRunningFirstVersion(t, service, workspaceID)
	updated, second := updateDefinitionAndStartLatest(t, service, workspaceID, definition, firstVersionID)
	assertLatestVersionCompleted(t, second, updated.CurrentVersionID)
	assertExecutionEventsPersisted(t, service, workspaceID, running.ID)
	assertInterruptedExecutionRecovered(t, store, resolver, workspaceID, running.ID)
}

func newTestWorkflowService(t *testing.T) (*Store, testWorkspaceResolver, *Service, string) {
	t.Helper()
	appDataDir := t.TempDir()
	workspaceID := "workspace_test"
	resolver := testWorkspaceResolver{
		workspaces: map[string]workspace.WorkspaceSummary{
			workspaceID: {
				ID:          workspaceID,
				RootPath:    t.TempDir(),
				DisplayName: "Workspace",
			},
		},
	}
	store, err := NewStore(appDataDir)
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	service, err := NewService(store, resolver, WithIDGenerator(deterministicIDGenerator()), WithClock(fixedTestClock(t)))
	if err != nil {
		t.Fatalf("create service: %v", err)
	}
	return store, resolver, service, workspaceID
}

func createRunningFirstVersion(t *testing.T, service *Service, workspaceID string) (WorkflowDefinition, string, WorkflowExecution) {
	t.Helper()
	definition, err := service.CreateDefinition(workspaceID, "Review", "first graph", actionGraph("work"))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	firstVersionID := definition.CurrentVersionID
	running, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start first execution: %v", err)
	}
	if running.Status != ExecutionStatusRunning {
		t.Fatalf("first execution status = %s, want running", running.Status)
	}
	if running.DefinitionVersionID != firstVersionID {
		t.Fatalf("first execution version = %s, want %s", running.DefinitionVersionID, firstVersionID)
	}
	return definition, firstVersionID, running
}

func updateDefinitionAndStartLatest(t *testing.T, service *Service, workspaceID string, definition WorkflowDefinition, firstVersionID string) (WorkflowDefinition, WorkflowExecution) {
	t.Helper()
	updated, err := service.UpdateDefinition(workspaceID, definition.ID, "Review", "second graph", startEndGraph())
	if err != nil {
		t.Fatalf("update definition: %v", err)
	}
	if updated.CurrentVersionID == firstVersionID {
		t.Fatalf("update reused version id %s", firstVersionID)
	}
	if updated.CurrentVersionNumber != 2 {
		t.Fatalf("current version number = %d, want 2", updated.CurrentVersionNumber)
	}
	second, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start second execution: %v", err)
	}
	return updated, second
}

func assertLatestVersionCompleted(t *testing.T, execution WorkflowExecution, versionID string) {
	t.Helper()
	if execution.Status != ExecutionStatusCompleted {
		t.Fatalf("second execution status = %s, want completed", execution.Status)
	}
	if execution.DefinitionVersionID != versionID {
		t.Fatalf("second execution version = %s, want %s", execution.DefinitionVersionID, versionID)
	}
}

func assertExecutionEventsPersisted(t *testing.T, service *Service, workspaceID string, executionID string) {
	t.Helper()
	page, err := service.ReadExecutionEventPage(workspaceID, executionID, 0, 10)
	if err != nil {
		t.Fatalf("read execution events: %v", err)
	}
	if len(page.Events) == 0 {
		t.Fatalf("event page is empty")
	}
}

func assertInterruptedExecutionRecovered(t *testing.T, store *Store, resolver testWorkspaceResolver, workspaceID string, executionID string) {
	t.Helper()
	restarted, err := NewService(store, resolver, WithIDGenerator(deterministicIDGenerator()), WithClock(fixedTestClock(t)))
	if err != nil {
		t.Fatalf("restart service: %v", err)
	}
	recovered, err := restarted.ReadExecution(workspaceID, executionID)
	if err != nil {
		t.Fatalf("read recovered execution: %v", err)
	}
	if recovered.Status != ExecutionStatusFailed {
		t.Fatalf("recovered execution status = %s, want failed", recovered.Status)
	}
	if terminalReasonValue(recovered) != TerminalReasonInterrupted {
		t.Fatalf("recovered terminal reason = %v, want interrupted", recovered.TerminalReason)
	}
	work := latestNodeExecutionForTest(t, recovered, "work")
	if work.Status != NodeExecutionStatusFailed {
		t.Fatalf("recovered work status = %s, want failed", work.Status)
	}
}

type testWorkspaceResolver struct {
	workspaces map[string]workspace.WorkspaceSummary
}

func (resolver testWorkspaceResolver) ResolveWorkspace(id string) (workspace.WorkspaceSummary, error) {
	summary, ok := resolver.workspaces[id]
	if !ok {
		return workspace.WorkspaceSummary{}, fmt.Errorf("workspace %s was not found", id)
	}
	return summary, nil
}

func actionGraph(actionID string) WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode(actionID),
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_" + actionID, FromNodeID: "start", ToNodeID: actionID, Kind: EdgeKindNormal},
			{ID: actionID + "_end", FromNodeID: actionID, ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
}

func startEndGraph() WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_end", FromNodeID: "start", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
}

func fixedTestClock(t *testing.T) func() time.Time {
	t.Helper()
	value, err := time.Parse(time.RFC3339, testNow)
	if err != nil {
		t.Fatalf("parse test time: %v", err)
	}
	return func() time.Time {
		return value
	}
}

func latestNodeExecutionForTest(t *testing.T, execution WorkflowExecution, nodeID string) WorkflowNodeExecution {
	t.Helper()
	for index := len(execution.NodeExecutions) - 1; index >= 0; index-- {
		if execution.NodeExecutions[index].NodeID == nodeID {
			return execution.NodeExecutions[index]
		}
	}
	t.Fatalf("node execution for %s was not found in %+v", nodeID, execution.NodeExecutions)
	return WorkflowNodeExecution{}
}
