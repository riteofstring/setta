package orchestrator

import (
	"errors"
	"testing"
)

func TestServiceStartExecutionRejectsBlankDraftWithoutVersionSnapshot(t *testing.T) {
	store, _, service, workspaceID := newTestWorkflowService(t)
	definition, err := service.CreateDefinition(workspaceID, "Blank executable", "", WorkflowGraph{})
	if err != nil {
		t.Fatalf("create blank draft definition: %v", err)
	}

	_, err = service.StartExecution(workspaceID, definition.ID, "")
	if err == nil {
		t.Fatal("start blank workflow succeeded, want validation error")
	}
	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("start blank workflow error = %T %v, want validation error", err, err)
	}
	assertDiagnostic(t, validation.Result, "null_workflow_not_executable")
	assertLatestDefinitionVersionNumber(t, store, workspaceID, definition.ID, 0)
	assertWorkflowExecutionCount(t, store, workspaceID, 0)
}

func TestServiceStartExecutionRejectsInvalidDraftWithoutVersionSnapshot(t *testing.T) {
	store, _, service, workspaceID := newTestWorkflowService(t)
	definition, err := service.CreateDefinition(workspaceID, "Invalid executable", "", invalidNonblankGraph())
	if err != nil {
		t.Fatalf("create invalid draft definition: %v", err)
	}

	_, err = service.StartExecution(workspaceID, definition.ID, "")
	if err == nil {
		t.Fatal("start invalid workflow succeeded, want validation error")
	}
	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("start invalid workflow error = %T %v, want validation error", err, err)
	}
	assertDiagnostic(t, validation.Result, "edge_to_unknown")
	assertLatestDefinitionVersionNumber(t, store, workspaceID, definition.ID, 0)
	assertWorkflowExecutionCount(t, store, workspaceID, 0)
}

func TestServiceStartExecutionFirstSuccessfulRunAfterRejectedAttemptCreatesVersionOne(t *testing.T) {
	store, _, service, workspaceID := newTestWorkflowService(t)
	definition, err := service.CreateDefinition(workspaceID, "Repair then run", "", WorkflowGraph{})
	if err != nil {
		t.Fatalf("create blank definition: %v", err)
	}
	if _, err := service.StartExecution(workspaceID, definition.ID, ""); err == nil {
		t.Fatal("start blank workflow succeeded, want validation error")
	}

	if _, err := service.UpdateDefinition(workspaceID, definition.ID, definition.Name, definition.Description, startEndGraph()); err != nil {
		t.Fatalf("repair workflow definition: %v", err)
	}
	started, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start repaired workflow: %v", err)
	}
	version, err := store.LoadDefinitionVersion(workspaceID, definition.ID, started.DefinitionVersionID)
	if err != nil {
		t.Fatalf("load repaired workflow version: %v", err)
	}
	if version.VersionNumber != 1 {
		t.Fatalf("first successful version number = %d, want 1", version.VersionNumber)
	}
	assertLatestDefinitionVersionNumber(t, store, workspaceID, definition.ID, 1)
}

func TestServiceStartExecutionFromHistoricalVersionDoesNotCreateNewVersion(t *testing.T) {
	store, _, service, workspaceID := newTestWorkflowService(t)
	definition, err := service.CreateDefinition(workspaceID, "Historical start", "", startEndGraph())
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	first, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start first execution: %v", err)
	}
	assertLatestDefinitionVersionNumber(t, store, workspaceID, definition.ID, 1)

	second, err := service.StartExecution(workspaceID, definition.ID, first.DefinitionVersionID)
	if err != nil {
		t.Fatalf("start historical version execution: %v", err)
	}
	if second.DefinitionVersionID != first.DefinitionVersionID {
		t.Fatalf("historical execution version = %s, want %s", second.DefinitionVersionID, first.DefinitionVersionID)
	}
	assertLatestDefinitionVersionNumber(t, store, workspaceID, definition.ID, 1)
	summaries, err := service.ListExecutionSummariesForDefinition(workspaceID, definition.ID, 0)
	if err != nil {
		t.Fatalf("list historical execution summaries: %v", err)
	}
	if len(summaries) != 2 {
		t.Fatalf("historical execution summaries = %+v, want two executions", summaries)
	}
	for _, summary := range summaries {
		if summary.DefinitionVersionNumber != 1 || summary.DefinitionVersionID != first.DefinitionVersionID {
			t.Fatalf("historical execution summary = %+v, want version 1/%s", summary, first.DefinitionVersionID)
		}
	}
}

func invalidNonblankGraph() WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_missing", FromNodeID: "start", ToNodeID: "missing", Kind: EdgeKindNormal},
		},
	}
}

func assertLatestDefinitionVersionNumber(t *testing.T, store *Store, workspaceID string, definitionID string, want int) {
	t.Helper()
	got, err := store.LatestDefinitionVersionNumber(workspaceID, definitionID)
	if err != nil {
		t.Fatalf("read latest definition version number: %v", err)
	}
	if got != want {
		t.Fatalf("latest definition version number = %d, want %d", got, want)
	}
}

func assertWorkflowExecutionCount(t *testing.T, store *Store, workspaceID string, want int) {
	t.Helper()
	executions, err := store.ListExecutions(workspaceID)
	if err != nil {
		t.Fatalf("list workflow executions: %v", err)
	}
	if len(executions) != want {
		t.Fatalf("workflow execution count = %d, want %d: %+v", len(executions), want, executions)
	}
}
