package httpapi

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/orchestrator"
)

func TestWorkflowEndpointsCreateValidateStartCancelAndReadEvents(t *testing.T) {
	handler := newChatHandler(t, nil)
	workspaceRoot := t.TempDir()
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: workspaceRoot}, http.StatusOK)
	graph := httpWorkflowActionGraph()

	validation := postJSON[orchestrator.WorkflowValidationResult](t, handler, "/workflows/definitions/validate", ValidateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Graph:       graph,
	}, http.StatusOK)
	if !validation.Valid {
		t.Fatalf("validation diagnostics = %+v, want valid graph", validation.Diagnostics)
	}

	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "HTTP workflow",
		Graph:       graph,
	}, http.StatusOK)
	if definition.ID == "" || definition.CurrentVersionID == "" {
		t.Fatalf("definition missing ids: %+v", definition)
	}
	list := postJSON[ListWorkflowDefinitionsResponse](t, handler, "/workflows/definitions/list", ListWorkflowDefinitionsRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if len(list.Definitions) != 1 || list.Definitions[0].ID != definition.ID {
		t.Fatalf("definitions = %+v, want created definition", list.Definitions)
	}

	execution := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	if execution.Status != orchestrator.ExecutionStatusRunning {
		t.Fatalf("execution status = %s, want running", execution.Status)
	}
	page := postJSON[orchestrator.WorkflowExecutionEventPage](t, handler, "/workflows/executions/events", GetWorkflowExecutionEventsRequest{
		WorkspaceID: opened.Workspace.ID,
		ExecutionID: execution.ID,
		Limit:       20,
	}, http.StatusOK)
	if len(page.Events) == 0 {
		t.Fatalf("workflow event page is empty")
	}

	cancelled := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/cancel", CancelWorkflowExecutionRequest{
		WorkspaceID: opened.Workspace.ID,
		ExecutionID: execution.ID,
	}, http.StatusOK)
	if cancelled.Status != orchestrator.ExecutionStatusCancelled {
		t.Fatalf("cancelled execution status = %s, want cancelled", cancelled.Status)
	}
	read := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/read", ReadWorkflowExecutionRequest{
		WorkspaceID: opened.Workspace.ID,
		ExecutionID: execution.ID,
	}, http.StatusOK)
	if read.Status != orchestrator.ExecutionStatusCancelled {
		t.Fatalf("read execution status = %s, want cancelled", read.Status)
	}
	projection := postJSON[ReadWorkflowGraphProjectionResponse](t, handler, "/workflows/graph/read", ReadWorkflowGraphProjectionRequest{
		WorkspaceID: opened.Workspace.ID,
		ExecutionID: execution.ID,
	}, http.StatusOK)
	if projection.Projection == nil {
		t.Fatal("workflow graph projection was nil")
	}
	if projection.Projection.ExecutionID != execution.ID {
		t.Fatalf("projection execution id = %s, want %s", projection.Projection.ExecutionID, execution.ID)
	}
	if got := projectedHTTPNodeStatus(projection.Projection, "work"); got != orchestrator.GraphNodeStatusCancelled {
		t.Fatalf("projected work status = %s, want cancelled", got)
	}
}

func TestWorkflowEventStreamPushesWorkflowEvents(t *testing.T) {
	handler := newChatHandler(t, nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	workspaceRoot := t.TempDir()
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: workspaceRoot}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Stream workflow",
		Graph:       httpWorkflowActionGraph(),
	}, http.StatusOK)

	response, err := http.Get(server.URL + "/workflows/events")
	if err != nil {
		t.Fatalf("open workflow event stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("event stream status = %d, want 200", response.StatusCode)
	}

	started := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	event := readServerSentWorkflowEvent(t, bufio.NewReader(response.Body))
	if event.ExecutionID != started.ID {
		t.Fatalf("event execution id = %s, want %s", event.ExecutionID, started.ID)
	}
	if event.Type != orchestrator.EventExecutionStarted {
		t.Fatalf("event type = %s, want %s", event.Type, orchestrator.EventExecutionStarted)
	}
}

func httpWorkflowActionGraph() orchestrator.WorkflowGraph {
	return orchestrator.WorkflowGraph{
		Nodes: []orchestrator.WorkflowNode{
			{ID: "start", Kind: orchestrator.NodeKindStart},
			{
				ID:   "work",
				Kind: orchestrator.NodeKindAction,
				Action: &orchestrator.WorkflowActionConfig{
					Kind:  orchestrator.ActionKindAgentCodex,
					Codex: &orchestrator.WorkflowCodexActionConfig{Prompt: "review the workspace"},
				},
			},
			{ID: "end", Kind: orchestrator.NodeKindEnd},
		},
		Edges: []orchestrator.WorkflowEdge{
			{ID: "start_work", FromNodeID: "start", ToNodeID: "work", Kind: orchestrator.EdgeKindNormal},
			{ID: "work_end", FromNodeID: "work", ToNodeID: "end", Kind: orchestrator.EdgeKindNormal},
		},
	}
}

func readServerSentWorkflowEvent(t *testing.T, reader *bufio.Reader) orchestrator.WorkflowEvent {
	t.Helper()
	var data string
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read workflow event stream line: %v", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if data == "" {
				continue
			}
			var event orchestrator.WorkflowEvent
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				t.Fatalf("decode workflow event stream data: %v", err)
			}
			return event
		}
		if strings.HasPrefix(line, "data: ") {
			data = strings.TrimPrefix(line, "data: ")
		}
	}
}

func projectedHTTPNodeStatus(projection *orchestrator.WorkflowGraphProjection, nodeID string) orchestrator.WorkflowGraphNodeStatus {
	for _, node := range projection.Nodes {
		if node.ID == nodeID {
			return node.Status
		}
	}
	return ""
}
