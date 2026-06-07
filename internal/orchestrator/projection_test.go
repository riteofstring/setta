package orchestrator

import "testing"

func TestServiceReadGraphProjectionComposesDefinitionAndRunningExecutionState(t *testing.T) {
	_, _, service, workspaceID := newTestWorkflowService(t)
	definition, err := service.CreateDefinition(workspaceID, "Review", "graph projection", actionGraph("work"))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	started, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}

	projection, ok, err := service.ReadGraphProjection(workspaceID, "", "", started.ID)
	if err != nil {
		t.Fatalf("read workspace projection: %v", err)
	}
	if !ok {
		t.Fatal("workspace projection was not returned")
	}
	if projection.DefinitionID != definition.ID || projection.ExecutionID != started.ID {
		t.Fatalf("projection ids = definition %s execution %s, want %s %s", projection.DefinitionID, projection.ExecutionID, definition.ID, started.ID)
	}
	assertProjectedNode(t, projection, "start", GraphNodeStatusSucceeded, false, 1)
	assertProjectedNode(t, projection, "work", GraphNodeStatusReady, true, 1)
	assertProjectedNode(t, projection, "end", GraphNodeStatusNotStarted, false, 0)
	assertProjectedEdge(t, projection, "start_work", GraphEdgeStatusCompleted, 0, 1)
	assertProjectedEdge(t, projection, "work_end", GraphEdgeStatusInactive, 0, 0)
}

func TestServiceReadGraphProjectionIncludesTerminalActionResult(t *testing.T) {
	_, _, service, workspaceID := newTestWorkflowService(t)
	definition, err := service.CreateDefinition(workspaceID, "Review", "graph projection", actionGraph("work"))
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}
	started, err := service.StartExecution(workspaceID, definition.ID, "")
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	work := latestNodeExecutionForTest(t, started, "work")
	completed, err := service.CompleteAction(workspaceID, started.ID, work.ID, WorkflowActionResult{
		Status:    ActionCompletionCompleted,
		Signals:   []WorkflowActionSignal{{Name: "decision", Value: "exit"}},
		FilePaths: []string{"reports/workflow.md"},
	})
	if err != nil {
		t.Fatalf("complete action: %v", err)
	}

	projection, ok, err := service.ReadGraphProjection(workspaceID, "", "", completed.ID)
	if err != nil {
		t.Fatalf("read execution projection: %v", err)
	}
	if !ok {
		t.Fatal("execution projection was not returned")
	}
	if projection.ExecutionStatus == nil || *projection.ExecutionStatus != ExecutionStatusCompleted {
		t.Fatalf("projection execution status = %v, want completed", projection.ExecutionStatus)
	}
	workNode := projectedNodeForTest(t, projection, "work")
	if workNode.Status != GraphNodeStatusSucceeded || workNode.Active {
		t.Fatalf("projected work node = %+v, want succeeded inactive", workNode)
	}
	if len(workNode.Signals) != 1 || workNode.Signals[0].Name != "decision" || workNode.Signals[0].Value != "exit" {
		t.Fatalf("projected work signals = %+v, want decision=exit", workNode.Signals)
	}
	if len(workNode.FilePaths) != 1 || workNode.FilePaths[0] != "reports/workflow.md" {
		t.Fatalf("projected work files = %+v, want report path", workNode.FilePaths)
	}
	assertProjectedNode(t, projection, "end", GraphNodeStatusSucceeded, false, 1)
	assertProjectedEdge(t, projection, "work_end", GraphEdgeStatusCompleted, 0, 1)
}

func TestServiceReadGraphProjectionIncludesDefinitionLayout(t *testing.T) {
	_, _, service, workspaceID := newTestWorkflowService(t)
	graph := actionGraph("work")
	graph.Layout = WorkflowGraphLayout{
		Nodes: []WorkflowGraphNodeLayout{
			{NodeID: "start", X: -320, Y: 0},
			{NodeID: "work", X: 0, Y: 96},
			{NodeID: "end", X: 320, Y: 0},
		},
	}
	definition, err := service.CreateDefinition(workspaceID, "Review", "graph projection", graph)
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}

	projection, ok, err := service.ReadGraphProjection(workspaceID, definition.ID, "", "")
	if err != nil {
		t.Fatalf("read definition projection: %v", err)
	}
	if !ok {
		t.Fatal("definition projection was not returned")
	}
	layout := projectedLayoutNodeForTest(t, projection, "work")
	if layout.X != 0 || layout.Y != 96 {
		t.Fatalf("projected work layout = %+v, want x=0 y=96", layout)
	}
}

func TestServiceReadGraphProjectionIncludesEdgeConditionsAndLabels(t *testing.T) {
	_, _, service, workspaceID := newTestWorkflowService(t)
	graph := conditionRoutingGraph(signalCondition("classify", "route", "yes"))
	definition, err := service.CreateDefinition(workspaceID, "Route", "graph projection", graph)
	if err != nil {
		t.Fatalf("create definition: %v", err)
	}

	projection, ok, err := service.ReadGraphProjection(workspaceID, definition.ID, "", "")
	if err != nil {
		t.Fatalf("read definition projection: %v", err)
	}
	if !ok {
		t.Fatal("definition projection was not returned")
	}
	match := projectedEdgeForTest(t, projection, "route_match")
	if match.Condition == nil || match.Condition.Kind != ConditionActionSignal || match.Label != "route=yes" {
		t.Fatalf("projected match edge = %+v, want action_signal route=yes label", match)
	}
	defaultEdge := projectedEdgeForTest(t, projection, "route_default")
	if defaultEdge.Condition == nil || defaultEdge.Condition.Kind != ConditionDefault || defaultEdge.Label != "default" {
		t.Fatalf("projected default edge = %+v, want default condition and label", defaultEdge)
	}
}

func TestServiceReadGraphProjectionReportsEmptyWorkspaceWithoutError(t *testing.T) {
	_, _, service, workspaceID := newTestWorkflowService(t)
	_, ok, err := service.ReadGraphProjection(workspaceID, "", "", "")
	if err != nil {
		t.Fatalf("read empty projection: %v", err)
	}
	if ok {
		t.Fatal("empty workspace returned a projection")
	}
}

func assertProjectedNode(t *testing.T, projection WorkflowGraphProjection, nodeID string, status WorkflowGraphNodeStatus, active bool, executionCount int) {
	t.Helper()
	node := projectedNodeForTest(t, projection, nodeID)
	if node.Status != status || node.Active != active || node.ExecutionCount != executionCount {
		t.Fatalf("projected node %s = %+v, want status %s active %v executionCount %d", nodeID, node, status, active, executionCount)
	}
}

func projectedNodeForTest(t *testing.T, projection WorkflowGraphProjection, nodeID string) WorkflowGraphNode {
	t.Helper()
	for _, node := range projection.Nodes {
		if node.ID == nodeID {
			return node
		}
	}
	t.Fatalf("projected node %s was not found in %+v", nodeID, projection.Nodes)
	return WorkflowGraphNode{}
}

func projectedLayoutNodeForTest(t *testing.T, projection WorkflowGraphProjection, nodeID string) WorkflowGraphNodeLayout {
	t.Helper()
	for _, node := range projection.Layout.Nodes {
		if node.NodeID == nodeID {
			return node
		}
	}
	t.Fatalf("projected layout node %s was not found in %+v", nodeID, projection.Layout.Nodes)
	return WorkflowGraphNodeLayout{}
}

func assertProjectedEdge(t *testing.T, projection WorkflowGraphProjection, edgeID string, status WorkflowGraphEdgeStatus, activeTokens int, completedTokens int) {
	t.Helper()
	edge := projectedEdgeForTest(t, projection, edgeID)
	if edge.Status != status || edge.ActiveTokenCount != activeTokens || edge.CompletedTokenCount != completedTokens {
		t.Fatalf("projected edge %s = %+v, want status %s active %d completed %d", edgeID, edge, status, activeTokens, completedTokens)
	}
}

func projectedEdgeForTest(t *testing.T, projection WorkflowGraphProjection, edgeID string) WorkflowGraphEdge {
	t.Helper()
	for _, edge := range projection.Edges {
		if edge.ID == edgeID {
			return edge
		}
	}
	t.Fatalf("projected edge %s was not found in %+v", edgeID, projection.Edges)
	return WorkflowGraphEdge{}
}
