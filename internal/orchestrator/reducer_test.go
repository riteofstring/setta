package orchestrator

import (
	"fmt"
	"strings"
	"testing"
)

const testNow = "2026-06-05T12:00:00Z"

func TestValidateGraphReportsPreciseDiagnostics(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			{ID: "action", Kind: NodeKindAction, Action: &WorkflowActionConfig{Kind: ActionKindAgentCodex}},
			{ID: "orphan", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "edge_action", FromNodeID: "start", ToNodeID: "action", Kind: EdgeKindNormal},
			{ID: "edge_missing", FromNodeID: "start", ToNodeID: "missing", Kind: EdgeKindNormal},
			{ID: "edge_cycle", FromNodeID: "action", ToNodeID: "start", Kind: EdgeKindNormal},
		},
	}
	result := ValidateGraph(graph, DefaultRunnerRegistry())
	if result.Valid {
		t.Fatalf("validation unexpectedly passed: %+v", result.Diagnostics)
	}
	assertDiagnostic(t, result, "edge_to_unknown")
	assertDiagnostic(t, result, "codex_action_config_required")
	assertDiagnostic(t, result, "unreachable_node")
}

func TestValidateGraphRejectsUnboundedControlOnlyLoop(t *testing.T) {
	result := ValidateGraph(unboundedControlOnlyLoopGraph(), DefaultRunnerRegistry())
	if result.Valid {
		t.Fatalf("validation unexpectedly passed: %+v", result.Diagnostics)
	}
	assertDiagnostic(t, result, "control_cycle_requires_async_boundary_or_bound")
}

func TestValidateGraphAllowsFiniteControlOnlyLoop(t *testing.T) {
	maxIterations := 3
	graph := controlOnlyLoopGraph(&maxIterations)
	result := ValidateGraph(graph, DefaultRunnerRegistry())
	if !result.Valid {
		t.Fatalf("validation diagnostics = %+v, want valid finite control-only loop", result.Diagnostics)
	}

	transition := startTestExecution(t, graph)
	if transition.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", transition.Execution.Status)
	}
	if terminalReasonValue(transition.Execution) != TerminalReasonLimitReached {
		t.Fatalf("terminal reason = %v, want limit_reached", transition.Execution.TerminalReason)
	}
}

func TestStartExecutionFailsFastWhenSynchronousControlCycleBypassesValidation(t *testing.T) {
	_, err := StartExecution(WorkflowDefinitionVersion{
		SchemaVersion: SchemaVersion,
		ID:            "version_test",
		WorkspaceID:   "workspace_test",
		DefinitionID:  "definition_test",
		VersionNumber: 1,
		Name:          "Invalid",
		Graph:         unboundedControlOnlyLoopGraph(),
		CreatedAt:     testNow,
	}, testTransitionContext())
	if err == nil {
		t.Fatal("start execution succeeded, want synchronous control cycle error")
	}
	if !strings.Contains(err.Error(), "suspected unbounded control cycle") {
		t.Fatalf("start execution error = %v, want suspected control cycle", err)
	}
}

func TestStartToEndCompletes(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_end", FromNodeID: "start", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
	transition := startTestExecution(t, graph)
	if transition.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", transition.Execution.Status)
	}
	if terminalReasonValue(transition.Execution) != TerminalReasonEndReached {
		t.Fatalf("terminal reason = %v, want end_reached", transition.Execution.TerminalReason)
	}
	assertEventType(t, transition.Events, EventExecutionStarted)
	assertEventType(t, transition.Events, EventExecutionCompleted)
}

func TestValidateGraphValidResultUsesEmptyDiagnosticsArray(t *testing.T) {
	result := ValidateGraph(startEndGraph(), DefaultRunnerRegistry())
	if !result.Valid {
		t.Fatalf("validation diagnostics = %+v, want valid graph", result.Diagnostics)
	}
	if result.Diagnostics == nil {
		t.Fatal("diagnostics = nil, want empty slice for generated contract decoding")
	}
}

func TestValidateGraphAllowsNullWorkflowDraft(t *testing.T) {
	result := ValidateGraph(WorkflowGraph{}, DefaultRunnerRegistry())
	if !result.Valid {
		t.Fatalf("validation diagnostics = %+v, want valid null workflow draft", result.Diagnostics)
	}
	if result.Diagnostics == nil {
		t.Fatal("diagnostics = nil, want empty slice for generated contract decoding")
	}
}

func TestValidateExecutableGraphRejectsNullWorkflow(t *testing.T) {
	result := ValidateExecutableGraph(WorkflowGraph{}, DefaultRunnerRegistry())
	if result.Valid {
		t.Fatalf("executable validation unexpectedly passed: %+v", result.Diagnostics)
	}
	assertDiagnostic(t, result, "null_workflow_not_executable")
}

func TestValidateGraphReportsStaleLayoutAsWarning(t *testing.T) {
	graph := startEndGraph()
	graph.Layout = WorkflowGraphLayout{
		Nodes: []WorkflowGraphNodeLayout{
			{NodeID: "start", X: -160, Y: 0},
			{NodeID: "missing", X: 160, Y: 0},
		},
	}

	result := ValidateGraph(graph, DefaultRunnerRegistry())
	if !result.Valid {
		t.Fatalf("validation diagnostics = %+v, want stale layout warning without invalidating graph", result.Diagnostics)
	}
	diagnostic := diagnosticForTest(t, result, "layout_node_unknown")
	if diagnostic.Severity != ValidationSeverityWarning {
		t.Fatalf("layout diagnostic severity = %s, want warning", diagnostic.Severity)
	}
}

func TestANDFanOutJoinWaitsForAllBranches(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("review_a"),
			testActionNode("review_b"),
			{ID: "join", Kind: NodeKindGatewayAND, Gateway: &WorkflowGatewayConfig{}},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_a", FromNodeID: "start", ToNodeID: "review_a", Kind: EdgeKindNormal},
			{ID: "start_b", FromNodeID: "start", ToNodeID: "review_b", Kind: EdgeKindNormal},
			{ID: "a_join", FromNodeID: "review_a", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "b_join", FromNodeID: "review_b", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "join_end", FromNodeID: "join", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
	transition := startTestExecution(t, graph)
	execution := transition.Execution
	if execution.Status != ExecutionStatusRunning {
		t.Fatalf("execution status = %s, want running", execution.Status)
	}
	execution, first := startActionForTest(t, execution, "review_a")
	execution, second := startActionForTest(t, execution, "review_b")

	afterFirst, err := CompleteAction(execution, graph, first.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete first action: %v", err)
	}
	if afterFirst.Execution.Status != ExecutionStatusRunning {
		t.Fatalf("execution completed before join was satisfied: %+v", afterFirst.Execution)
	}

	afterSecond, err := CompleteAction(afterFirst.Execution, graph, second.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete second action: %v", err)
	}
	if afterSecond.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", afterSecond.Execution.Status)
	}
	assertNodeSucceeded(t, afterSecond.Execution, "join")
}

func TestANDGatewayDeadlockWithoutActiveWorkFails(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("classify"),
			{ID: "route", Kind: NodeKindGatewayOR, Gateway: &WorkflowGatewayConfig{}},
			testActionNode("branch_a"),
			testActionNode("branch_b"),
			{ID: "join", Kind: NodeKindGatewayAND, Gateway: &WorkflowGatewayConfig{}},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_classify", FromNodeID: "start", ToNodeID: "classify", Kind: EdgeKindNormal},
			{ID: "classify_route", FromNodeID: "classify", ToNodeID: "route", Kind: EdgeKindNormal},
			{ID: "route_a", FromNodeID: "route", ToNodeID: "branch_a", Kind: EdgeKindNormal, Condition: signalCondition("classify", "branch", "a")},
			{ID: "route_b", FromNodeID: "route", ToNodeID: "branch_b", Kind: EdgeKindNormal, Condition: signalCondition("classify", "branch", "b")},
			{ID: "a_join", FromNodeID: "branch_a", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "b_join", FromNodeID: "branch_b", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "join_end", FromNodeID: "join", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
	transition := startTestExecution(t, graph)
	execution, classify := startActionForTest(t, transition.Execution, "classify")
	routed, err := CompleteAction(execution, graph, classify.ID, WorkflowActionResult{
		Status:  ActionCompletionCompleted,
		Signals: []WorkflowActionSignal{{Name: "branch", Value: "b"}},
	}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete classifier: %v", err)
	}
	execution, branchB := startActionForTest(t, routed.Execution, "branch_b")

	next, err := CompleteAction(execution, graph, branchB.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete branch b: %v", err)
	}
	if next.Execution.Status != ExecutionStatusFailed {
		t.Fatalf("execution status = %s, want failed", next.Execution.Status)
	}
	if terminalReasonValue(next.Execution) != TerminalReasonRoutingFailed {
		t.Fatalf("terminal reason = %v, want routing_failed", next.Execution.TerminalReason)
	}
	assertEventType(t, next.Events, EventExecutionFailed)
}

func TestXORGatewaySelectsExactlyOneBranchFromStructuredSignal(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("classify"),
			{ID: "route", Kind: NodeKindGatewayXOR, Gateway: &WorkflowGatewayConfig{}},
			{ID: "end_yes", Kind: NodeKindEnd},
			{ID: "end_no", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_classify", FromNodeID: "start", ToNodeID: "classify", Kind: EdgeKindNormal},
			{ID: "classify_route", FromNodeID: "classify", ToNodeID: "route", Kind: EdgeKindNormal},
			{ID: "route_yes", FromNodeID: "route", ToNodeID: "end_yes", Kind: EdgeKindNormal, Condition: signalCondition("classify", "route", "yes")},
			{ID: "route_no", FromNodeID: "route", ToNodeID: "end_no", Kind: EdgeKindNormal, Condition: signalCondition("classify", "route", "no")},
		},
	}
	transition := startTestExecution(t, graph)
	execution, classify := startActionForTest(t, transition.Execution, "classify")
	next, err := CompleteAction(execution, graph, classify.ID, WorkflowActionResult{
		Status:  ActionCompletionCompleted,
		Signals: []WorkflowActionSignal{{Name: "route", Value: "yes"}},
	}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete action: %v", err)
	}
	if next.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", next.Execution.Status)
	}
	assertNodeSucceeded(t, next.Execution, "end_yes")
	assertNodeNotExecuted(t, next.Execution, "end_no")
}

func TestXORGatewayCanRouteFromActionStatus(t *testing.T) {
	status := NodeExecutionStatusSucceeded
	graph := conditionRoutingGraph(&WorkflowCondition{
		Kind:   ConditionActionStatus,
		NodeID: "classify",
		Status: &status,
	})
	transition := startTestExecution(t, graph)
	execution, classify := startActionForTest(t, transition.Execution, "classify")
	next, err := CompleteAction(execution, graph, classify.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete action: %v", err)
	}
	if next.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", next.Execution.Status)
	}
	assertNodeSucceeded(t, next.Execution, "end_match")
}

func TestXORGatewayCanRouteFromScriptExitCode(t *testing.T) {
	exitCode := 7
	graph := conditionRoutingGraph(&WorkflowCondition{
		Kind:     ConditionScriptExitCode,
		NodeID:   "classify",
		ExitCode: &exitCode,
	})
	transition := startTestExecution(t, graph)
	execution, classify := startActionForTest(t, transition.Execution, "classify")
	next, err := CompleteAction(execution, graph, classify.ID, WorkflowActionResult{Status: ActionCompletionCompleted, ExitCode: &exitCode}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete action: %v", err)
	}
	if next.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", next.Execution.Status)
	}
	assertNodeSucceeded(t, next.Execution, "end_match")
}

func TestXORGatewayUsesExplicitDefaultWhenNoConditionMatches(t *testing.T) {
	graph := conditionRoutingGraph(signalCondition("classify", "route", "yes"))
	transition := startTestExecution(t, graph)
	execution, classify := startActionForTest(t, transition.Execution, "classify")
	next, err := CompleteAction(execution, graph, classify.ID, WorkflowActionResult{
		Status:  ActionCompletionCompleted,
		Signals: []WorkflowActionSignal{{Name: "route", Value: "no"}},
	}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete action: %v", err)
	}
	if next.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", next.Execution.Status)
	}
	assertNodeSucceeded(t, next.Execution, "end_default")
	assertNodeNotExecuted(t, next.Execution, "end_match")
}

func TestValidateGraphRejectsDefaultConditionOutsideRouteEdge(t *testing.T) {
	graph := startEndGraph()
	graph.Edges[0].Condition = defaultCondition()
	result := ValidateGraph(graph, DefaultRunnerRegistry())
	if result.Valid {
		t.Fatalf("validation unexpectedly passed: %+v", result.Diagnostics)
	}
	assertDiagnostic(t, result, "default_edge_from_route_required")
}

func TestValidateGraphRejectsDefaultConditionInLoopGuard(t *testing.T) {
	graph := controlOnlyLoopGraph(nil)
	for index := range graph.Nodes {
		if graph.Nodes[index].Kind == NodeKindLoopGuard {
			graph.Nodes[index].LoopGuard.ContinueCondition = defaultCondition()
			break
		}
	}
	result := ValidateGraph(graph, DefaultRunnerRegistry())
	if result.Valid {
		t.Fatalf("validation unexpectedly passed: %+v", result.Diagnostics)
	}
	assertDiagnostic(t, result, "loop_guard_continue_condition")
}

func TestORGatewayReleasesAllMatchingBranches(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("classify"),
			{ID: "route", Kind: NodeKindGatewayOR, Gateway: &WorkflowGatewayConfig{}},
			testActionNode("branch_b"),
			testActionNode("branch_c"),
			{ID: "join", Kind: NodeKindGatewayAND, Gateway: &WorkflowGatewayConfig{}},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_classify", FromNodeID: "start", ToNodeID: "classify", Kind: EdgeKindNormal},
			{ID: "classify_route", FromNodeID: "classify", ToNodeID: "route", Kind: EdgeKindNormal},
			{ID: "route_b", FromNodeID: "route", ToNodeID: "branch_b", Kind: EdgeKindNormal, Condition: signalCondition("classify", "branch", "b")},
			{ID: "route_c", FromNodeID: "route", ToNodeID: "branch_c", Kind: EdgeKindNormal, Condition: signalCondition("classify", "branch", "c")},
			{ID: "b_join", FromNodeID: "branch_b", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "c_join", FromNodeID: "branch_c", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "join_end", FromNodeID: "join", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
	transition := startTestExecution(t, graph)
	execution, classify := startActionForTest(t, transition.Execution, "classify")
	routed, err := CompleteAction(execution, graph, classify.ID, WorkflowActionResult{
		Status: ActionCompletionCompleted,
		Signals: []WorkflowActionSignal{
			{Name: "branch", Value: "b"},
			{Name: "branch", Value: "c"},
		},
	}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete classifier: %v", err)
	}
	execution = routed.Execution
	execution, branchB := startActionForTest(t, execution, "branch_b")
	execution, branchC := startActionForTest(t, execution, "branch_c")
	afterB, err := CompleteAction(execution, graph, branchB.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete branch b: %v", err)
	}
	afterC, err := CompleteAction(afterB.Execution, graph, branchC.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete branch c: %v", err)
	}
	if afterC.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", afterC.Execution.Status)
	}
	assertNodeSucceeded(t, afterC.Execution, "join")
}

func TestORGatewayLateArrivalCompletesAfterEndReached(t *testing.T) {
	graph := lateGatewayArrivalGraph(NodeKindGatewayOR)
	transition := startTestExecution(t, graph)
	execution, fast := startActionForTest(t, transition.Execution, "fast")
	execution, slow := startActionForTest(t, execution, "slow")

	afterFast, err := CompleteAction(execution, graph, fast.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete fast branch: %v", err)
	}
	if afterFast.Execution.Status != ExecutionStatusRunning {
		t.Fatalf("execution status after first branch = %s, want running while slow branch is active", afterFast.Execution.Status)
	}
	assertNodeSucceeded(t, afterFast.Execution, "end")

	afterSlow, err := CompleteAction(afterFast.Execution, graph, slow.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete slow branch: %v", err)
	}
	if afterSlow.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status after late arrival = %s, want completed", afterSlow.Execution.Status)
	}
	if terminalReasonValue(afterSlow.Execution) != TerminalReasonEndReached {
		t.Fatalf("terminal reason = %v, want end_reached", afterSlow.Execution.TerminalReason)
	}
	assertNoActiveWorkflowWork(t, afterSlow.Execution)
}

func TestXORGatewayLateArrivalCompletesAfterEndReached(t *testing.T) {
	graph := lateGatewayArrivalGraph(NodeKindGatewayXOR)
	transition := startTestExecution(t, graph)
	execution, fast := startActionForTest(t, transition.Execution, "fast")
	execution, slow := startActionForTest(t, execution, "slow")

	afterFast, err := CompleteAction(execution, graph, fast.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete fast branch: %v", err)
	}
	if afterFast.Execution.Status != ExecutionStatusRunning {
		t.Fatalf("execution status after first branch = %s, want running while slow branch is active", afterFast.Execution.Status)
	}
	assertNodeSucceeded(t, afterFast.Execution, "end")

	afterSlow, err := CompleteAction(afterFast.Execution, graph, slow.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete slow branch: %v", err)
	}
	if afterSlow.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status after late arrival = %s, want completed", afterSlow.Execution.Status)
	}
	if terminalReasonValue(afterSlow.Execution) != TerminalReasonEndReached {
		t.Fatalf("terminal reason = %v, want end_reached", afterSlow.Execution.TerminalReason)
	}
	assertNoActiveWorkflowWork(t, afterSlow.Execution)
}

func TestValidateGraphRejectsPartialANDRequiredIncoming(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("branch_a"),
			testActionNode("branch_b"),
			{ID: "join", Kind: NodeKindGatewayAND, Gateway: &WorkflowGatewayConfig{RequiredIncoming: []string{"a_join"}}},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_a", FromNodeID: "start", ToNodeID: "branch_a", Kind: EdgeKindNormal},
			{ID: "start_b", FromNodeID: "start", ToNodeID: "branch_b", Kind: EdgeKindNormal},
			{ID: "a_join", FromNodeID: "branch_a", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "b_join", FromNodeID: "branch_b", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "join_end", FromNodeID: "join", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}

	result := ValidateGraph(graph, DefaultRunnerRegistry())
	if result.Valid {
		t.Fatalf("validation unexpectedly passed: %+v", result.Diagnostics)
	}
	assertDiagnostic(t, result, "and_gateway_required_inputs_must_cover_all_inputs")
}

func TestValidateGraphRejectsEndNodeOutputs(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_end", FromNodeID: "start", ToNodeID: "end", Kind: EdgeKindNormal},
			{ID: "end_start", FromNodeID: "end", ToNodeID: "start", Kind: EdgeKindNormal},
		},
	}

	result := ValidateGraph(graph, DefaultRunnerRegistry())
	if result.Valid {
		t.Fatalf("validation unexpectedly passed: %+v", result.Diagnostics)
	}
	assertDiagnostic(t, result, "end_node_output_forbidden")
}

func TestLoopGuardContinuesUntilStructuredExit(t *testing.T) {
	graph := loopGraph(nil, LoopLimitFailed)
	transition := startTestExecution(t, graph)
	execution := transition.Execution
	for iteration := 1; iteration <= 2; iteration++ {
		var review WorkflowNodeExecution
		execution, review = startActionForTest(t, execution, "review")
		next, err := CompleteAction(execution, graph, review.ID, WorkflowActionResult{
			Status:  ActionCompletionCompleted,
			Signals: []WorkflowActionSignal{{Name: "decision", Value: "continue"}},
		}, testTransitionContext())
		if err != nil {
			t.Fatalf("complete continue iteration %d: %v", iteration, err)
		}
		execution = next.Execution
		if execution.Status != ExecutionStatusRunning {
			t.Fatalf("execution status after continue iteration %d = %s, want running", iteration, execution.Status)
		}
	}
	execution, review := startActionForTest(t, execution, "review")
	next, err := CompleteAction(execution, graph, review.ID, WorkflowActionResult{
		Status:  ActionCompletionCompleted,
		Signals: []WorkflowActionSignal{{Name: "decision", Value: "exit"}},
	}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete exit iteration: %v", err)
	}
	if next.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", next.Execution.Status)
	}
	if got := nodeExecutionCount(next.Execution, "review"); got != 3 {
		t.Fatalf("review executions = %d, want 3", got)
	}
	if got := loopIterationCount(next.Execution, "guard"); got != 3 {
		t.Fatalf("guard loop count = %d, want 3", got)
	}
}

func TestLoopGuardStopsAtMaximumIterations(t *testing.T) {
	maxIterations := 2
	graph := loopGraph(&maxIterations, LoopLimitCompleted)
	transition := startTestExecution(t, graph)
	execution := transition.Execution
	for iteration := 1; iteration <= 2; iteration++ {
		var review WorkflowNodeExecution
		execution, review = startActionForTest(t, execution, "review")
		next, err := CompleteAction(execution, graph, review.ID, WorkflowActionResult{
			Status:  ActionCompletionCompleted,
			Signals: []WorkflowActionSignal{{Name: "decision", Value: "continue"}},
		}, testTransitionContext())
		if err != nil {
			t.Fatalf("complete iteration %d: %v", iteration, err)
		}
		execution = next.Execution
	}
	if execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", execution.Status)
	}
	if terminalReasonValue(execution) != TerminalReasonLimitReached {
		t.Fatalf("terminal reason = %v, want limit_reached", execution.TerminalReason)
	}
	if got := nodeExecutionCount(execution, "review"); got != 2 {
		t.Fatalf("review executions = %d, want 2", got)
	}
}

func TestActionFailureFailsExecution(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("work"),
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_work", FromNodeID: "start", ToNodeID: "work", Kind: EdgeKindNormal},
			{ID: "work_end", FromNodeID: "work", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
	transition := startTestExecution(t, graph)
	execution, work := startActionForTest(t, transition.Execution, "work")
	next, err := CompleteAction(execution, graph, work.ID, WorkflowActionResult{Status: ActionCompletionFailed, Error: "boom"}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete failed action: %v", err)
	}
	if next.Execution.Status != ExecutionStatusFailed {
		t.Fatalf("execution status = %s, want failed", next.Execution.Status)
	}
	if terminalReasonValue(next.Execution) != TerminalReasonActionFailed {
		t.Fatalf("terminal reason = %v, want action_failed", next.Execution.TerminalReason)
	}
}

func TestRoutingFailureFailsExecutionAndClearsActiveWork(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("classify"),
			{ID: "route", Kind: NodeKindGatewayXOR, Gateway: &WorkflowGatewayConfig{}},
			{ID: "end_yes", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_classify", FromNodeID: "start", ToNodeID: "classify", Kind: EdgeKindNormal},
			{ID: "classify_route", FromNodeID: "classify", ToNodeID: "route", Kind: EdgeKindNormal},
			{ID: "route_yes", FromNodeID: "route", ToNodeID: "end_yes", Kind: EdgeKindNormal, Condition: signalCondition("classify", "route", "yes")},
		},
	}
	transition := startTestExecution(t, graph)
	execution, classify := startActionForTest(t, transition.Execution, "classify")
	next, err := CompleteAction(execution, graph, classify.ID, WorkflowActionResult{
		Status:  ActionCompletionCompleted,
		Signals: []WorkflowActionSignal{{Name: "route", Value: "no"}},
	}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete unroutable action: %v", err)
	}
	if next.Execution.Status != ExecutionStatusFailed {
		t.Fatalf("execution status = %s, want failed", next.Execution.Status)
	}
	if terminalReasonValue(next.Execution) != TerminalReasonRoutingFailed {
		t.Fatalf("terminal reason = %v, want routing_failed", next.Execution.TerminalReason)
	}
	assertNoActiveWorkflowWork(t, next.Execution)
	assertEventType(t, next.Events, EventExecutionFailed)
}

func TestActionFailureCancelsSiblingActiveNodes(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("branch_a"),
			testActionNode("branch_b"),
			{ID: "join", Kind: NodeKindGatewayAND, Gateway: &WorkflowGatewayConfig{}},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_a", FromNodeID: "start", ToNodeID: "branch_a", Kind: EdgeKindNormal},
			{ID: "start_b", FromNodeID: "start", ToNodeID: "branch_b", Kind: EdgeKindNormal},
			{ID: "a_join", FromNodeID: "branch_a", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "b_join", FromNodeID: "branch_b", ToNodeID: "join", Kind: EdgeKindNormal},
			{ID: "join_end", FromNodeID: "join", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
	transition := startTestExecution(t, graph)
	execution, branchA := startActionForTest(t, transition.Execution, "branch_a")
	execution, branchB := startActionForTest(t, execution, "branch_b")
	next, err := CompleteAction(execution, graph, branchA.ID, WorkflowActionResult{Status: ActionCompletionFailed, Error: "boom"}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete failed branch: %v", err)
	}
	if next.Execution.Status != ExecutionStatusFailed {
		t.Fatalf("execution status = %s, want failed", next.Execution.Status)
	}
	failedBranch := nodeExecutionByIDForTest(t, next.Execution, branchA.ID)
	if failedBranch.Status != NodeExecutionStatusFailed || failedBranch.Error != "boom" {
		t.Fatalf("failed branch = %+v, want failed with action error", failedBranch)
	}
	cancelledBranch := nodeExecutionByIDForTest(t, next.Execution, branchB.ID)
	if cancelledBranch.Status != NodeExecutionStatusCancelled {
		t.Fatalf("sibling branch status = %s, want cancelled", cancelledBranch.Status)
	}
	assertNoActiveWorkflowWork(t, next.Execution)
}

func TestCancellationCancelsActiveNodeExecutions(t *testing.T) {
	graph := WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("work"),
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_work", FromNodeID: "start", ToNodeID: "work", Kind: EdgeKindNormal},
			{ID: "work_end", FromNodeID: "work", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
	transition := startTestExecution(t, graph)
	next, err := CancelExecution(transition.Execution, testTransitionContext())
	if err != nil {
		t.Fatalf("cancel execution: %v", err)
	}
	if next.Execution.Status != ExecutionStatusCancelled {
		t.Fatalf("execution status = %s, want cancelled", next.Execution.Status)
	}
	for _, nodeExecution := range next.Execution.NodeExecutions {
		if nodeExecution.NodeID == "work" && nodeExecution.Status != NodeExecutionStatusCancelled {
			t.Fatalf("work node status = %s, want cancelled", nodeExecution.Status)
		}
	}
}

func startTestExecution(t *testing.T, graph WorkflowGraph) WorkflowTransition {
	t.Helper()
	result := ValidateGraph(graph, DefaultRunnerRegistry())
	if !result.Valid {
		t.Fatalf("invalid test graph: %+v", result.Diagnostics)
	}
	transition, err := StartExecution(WorkflowDefinitionVersion{
		SchemaVersion: SchemaVersion,
		ID:            "version_test",
		WorkspaceID:   "workspace_test",
		DefinitionID:  "definition_test",
		VersionNumber: 1,
		Name:          "Test",
		Graph:         graph,
		CreatedAt:     testNow,
	}, testTransitionContext())
	if err != nil {
		t.Fatalf("start execution: %v", err)
	}
	return transition
}

func testTransitionContext() TransitionContext {
	return TransitionContext{
		Now:   testNow,
		NewID: deterministicIDGenerator(),
	}
}

func deterministicIDGenerator() IDGenerator {
	return func(prefix string) (string, error) {
		testIDCounters[prefix]++
		return fmt.Sprintf("%s_%03d", prefix, testIDCounters[prefix]), nil
	}
}

var testIDCounters = map[string]int{}

func testActionNode(id string) WorkflowNode {
	return WorkflowNode{
		ID:   id,
		Kind: NodeKindAction,
		Action: &WorkflowActionConfig{
			Kind:  ActionKindAgentCodex,
			Codex: &WorkflowCodexActionConfig{Prompt: "run " + id},
		},
	}
}

func signalCondition(nodeID string, name string, value string) *WorkflowCondition {
	return &WorkflowCondition{
		Kind:        ConditionActionSignal,
		NodeID:      nodeID,
		SignalName:  name,
		SignalValue: value,
	}
}

func loopGraph(maxIterations *int, policy WorkflowLoopLimitPolicy) WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("review"),
			{
				ID:   "guard",
				Kind: NodeKindLoopGuard,
				LoopGuard: &WorkflowLoopGuardConfig{
					MaxIterations:     maxIterations,
					LimitPolicy:       policy,
					ContinueCondition: signalCondition("review", "decision", "continue"),
					ExitCondition:     signalCondition("review", "decision", "exit"),
				},
			},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_review", FromNodeID: "start", ToNodeID: "review", Kind: EdgeKindNormal},
			{ID: "review_guard", FromNodeID: "review", ToNodeID: "guard", Kind: EdgeKindNormal},
			{ID: "guard_continue", FromNodeID: "guard", ToNodeID: "review", Kind: EdgeKindLoopContinue},
			{ID: "guard_exit", FromNodeID: "guard", ToNodeID: "end", Kind: EdgeKindLoopExit},
		},
	}
}

func unboundedControlOnlyLoopGraph() WorkflowGraph {
	return controlOnlyLoopGraph(nil)
}

func controlOnlyLoopGraph(maxIterations *int) WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			{
				ID:   "guard",
				Kind: NodeKindLoopGuard,
				LoopGuard: &WorkflowLoopGuardConfig{
					MaxIterations: maxIterations,
					LimitPolicy:   LoopLimitCompleted,
				},
			},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_guard", FromNodeID: "start", ToNodeID: "guard", Kind: EdgeKindNormal},
			{ID: "guard_continue", FromNodeID: "guard", ToNodeID: "guard", Kind: EdgeKindLoopContinue},
			{ID: "guard_exit", FromNodeID: "guard", ToNodeID: "end", Kind: EdgeKindLoopExit},
		},
	}
}

func defaultCondition() *WorkflowCondition {
	return &WorkflowCondition{Kind: ConditionDefault}
}

func conditionRoutingGraph(condition *WorkflowCondition) WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("classify"),
			{ID: "route", Kind: NodeKindGatewayXOR, Gateway: &WorkflowGatewayConfig{}},
			{ID: "end_match", Kind: NodeKindEnd},
			{ID: "end_default", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_classify", FromNodeID: "start", ToNodeID: "classify", Kind: EdgeKindNormal},
			{ID: "classify_route", FromNodeID: "classify", ToNodeID: "route", Kind: EdgeKindNormal},
			{ID: "route_match", FromNodeID: "route", ToNodeID: "end_match", Kind: EdgeKindNormal, Condition: condition},
			{ID: "route_default", FromNodeID: "route", ToNodeID: "end_default", Kind: EdgeKindNormal, Condition: defaultCondition()},
		},
	}
}

func lateGatewayArrivalGraph(kind WorkflowNodeKind) WorkflowGraph {
	return WorkflowGraph{
		Nodes: []WorkflowNode{
			{ID: "start", Kind: NodeKindStart},
			testActionNode("fast"),
			testActionNode("slow"),
			{ID: "route", Kind: kind, Gateway: &WorkflowGatewayConfig{}},
			{ID: "end", Kind: NodeKindEnd},
		},
		Edges: []WorkflowEdge{
			{ID: "start_fast", FromNodeID: "start", ToNodeID: "fast", Kind: EdgeKindNormal},
			{ID: "start_slow", FromNodeID: "start", ToNodeID: "slow", Kind: EdgeKindNormal},
			{ID: "fast_route", FromNodeID: "fast", ToNodeID: "route", Kind: EdgeKindNormal},
			{ID: "slow_route", FromNodeID: "slow", ToNodeID: "route", Kind: EdgeKindNormal},
			{ID: "route_end", FromNodeID: "route", ToNodeID: "end", Kind: EdgeKindNormal},
		},
	}
}

func startActionForTest(t *testing.T, execution WorkflowExecution, nodeID string) (WorkflowExecution, WorkflowNodeExecution) {
	t.Helper()
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.NodeID == nodeID && nodeExecution.Status == NodeExecutionStatusRunning {
			return execution, nodeExecution
		}
	}
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.NodeID != nodeID || nodeExecution.Status != NodeExecutionStatusReady {
			continue
		}
		transition, err := StartAction(execution, nodeExecution.ID, WorkflowActionStartMetadata{
			RunnerKind: ActionKindAgentCodex,
			RunnerRefs: []WorkflowActionRunnerRef{{Kind: "test.runner", ID: nodeExecution.ID}},
		}, testTransitionContext())
		if err != nil {
			t.Fatalf("start action %s: %v", nodeID, err)
		}
		started := nodeExecutionByIDForTest(t, transition.Execution, nodeExecution.ID)
		if started.Status != NodeExecutionStatusRunning {
			t.Fatalf("started node execution status = %s, want running", started.Status)
		}
		return transition.Execution, started
	}
	t.Fatalf("ready or running node execution for %s was not found in %+v", nodeID, execution.NodeExecutions)
	return WorkflowExecution{}, WorkflowNodeExecution{}
}

func nodeExecutionByIDForTest(t *testing.T, execution WorkflowExecution, nodeExecutionID string) WorkflowNodeExecution {
	t.Helper()
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.ID == nodeExecutionID {
			return nodeExecution
		}
	}
	t.Fatalf("node execution %s was not found in %+v", nodeExecutionID, execution.NodeExecutions)
	return WorkflowNodeExecution{}
}

func assertNodeSucceeded(t *testing.T, execution WorkflowExecution, nodeID string) {
	t.Helper()
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.NodeID == nodeID && nodeExecution.Status == NodeExecutionStatusSucceeded {
			return
		}
	}
	t.Fatalf("succeeded node execution for %s was not found in %+v", nodeID, execution.NodeExecutions)
}

func assertNodeNotExecuted(t *testing.T, execution WorkflowExecution, nodeID string) {
	t.Helper()
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.NodeID == nodeID {
			t.Fatalf("node %s unexpectedly executed: %+v", nodeID, nodeExecution)
		}
	}
}

func assertDiagnostic(t *testing.T, result WorkflowValidationResult, code string) {
	t.Helper()
	_ = diagnosticForTest(t, result, code)
}

func diagnosticForTest(t *testing.T, result WorkflowValidationResult, code string) WorkflowValidationDiagnostic {
	t.Helper()
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.Code == code {
			return diagnostic
		}
	}
	t.Fatalf("diagnostic %s was not found in %+v", code, result.Diagnostics)
	return WorkflowValidationDiagnostic{}
}

func assertEventType(t *testing.T, events []WorkflowEvent, eventType WorkflowEventType) {
	t.Helper()
	for _, event := range events {
		if event.Type == eventType {
			return
		}
	}
	t.Fatalf("event type %s was not found in %+v", eventType, events)
}

func assertNoActiveWorkflowWork(t *testing.T, execution WorkflowExecution) {
	t.Helper()
	if len(execution.ActiveNodeExecutionIDs) != 0 {
		t.Fatalf("active node execution ids = %+v, want none", execution.ActiveNodeExecutionIDs)
	}
	for _, nodeExecution := range execution.NodeExecutions {
		if isActiveNodeExecutionStatus(nodeExecution.Status) {
			t.Fatalf("node execution %s is still active: %+v", nodeExecution.ID, nodeExecution)
		}
	}
	for _, token := range execution.Tokens {
		if token.Status == TokenStatusActive {
			t.Fatalf("token %s is still active: %+v", token.ID, token)
		}
	}
}

func nodeExecutionCount(execution WorkflowExecution, nodeID string) int {
	count := 0
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.NodeID == nodeID {
			count++
		}
	}
	return count
}

func loopIterationCount(execution WorkflowExecution, nodeID string) int {
	for _, loopIteration := range execution.LoopIterations {
		if loopIteration.NodeID == nodeID {
			return loopIteration.Count
		}
	}
	return 0
}

func terminalReasonValue(execution WorkflowExecution) WorkflowTerminalReason {
	if execution.TerminalReason == nil {
		return ""
	}
	return *execution.TerminalReason
}
