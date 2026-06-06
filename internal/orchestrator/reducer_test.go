package orchestrator

import (
	"fmt"
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
	assertDiagnostic(t, result, "cycle_requires_loop_guard")
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
	first := requireRunningNodeExecution(t, execution, "review_a")
	second := requireRunningNodeExecution(t, execution, "review_b")

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
	classify := requireRunningNodeExecution(t, transition.Execution, "classify")
	next, err := CompleteAction(transition.Execution, graph, classify.ID, WorkflowActionResult{
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
	classify := requireRunningNodeExecution(t, transition.Execution, "classify")
	next, err := CompleteAction(transition.Execution, graph, classify.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
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
	classify := requireRunningNodeExecution(t, transition.Execution, "classify")
	next, err := CompleteAction(transition.Execution, graph, classify.ID, WorkflowActionResult{Status: ActionCompletionCompleted, ExitCode: &exitCode}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete action: %v", err)
	}
	if next.Execution.Status != ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed", next.Execution.Status)
	}
	assertNodeSucceeded(t, next.Execution, "end_match")
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
	classify := requireRunningNodeExecution(t, transition.Execution, "classify")
	routed, err := CompleteAction(transition.Execution, graph, classify.ID, WorkflowActionResult{
		Status: ActionCompletionCompleted,
		Signals: []WorkflowActionSignal{
			{Name: "branch", Value: "b"},
			{Name: "branch", Value: "c"},
		},
	}, testTransitionContext())
	if err != nil {
		t.Fatalf("complete classifier: %v", err)
	}
	branchB := requireRunningNodeExecution(t, routed.Execution, "branch_b")
	branchC := requireRunningNodeExecution(t, routed.Execution, "branch_c")
	afterB, err := CompleteAction(routed.Execution, graph, branchB.ID, WorkflowActionResult{Status: ActionCompletionCompleted}, testTransitionContext())
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

func TestLoopGuardContinuesUntilStructuredExit(t *testing.T) {
	graph := loopGraph(nil, LoopLimitFailed)
	transition := startTestExecution(t, graph)
	execution := transition.Execution
	for iteration := 1; iteration <= 2; iteration++ {
		review := requireRunningNodeExecution(t, execution, "review")
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
	review := requireRunningNodeExecution(t, execution, "review")
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
		review := requireRunningNodeExecution(t, execution, "review")
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
	work := requireRunningNodeExecution(t, transition.Execution, "work")
	next, err := CompleteAction(transition.Execution, graph, work.ID, WorkflowActionResult{Status: ActionCompletionFailed, Error: "boom"}, testTransitionContext())
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
			{ID: "route_default", FromNodeID: "route", ToNodeID: "end_default", Kind: EdgeKindNormal, Condition: &WorkflowCondition{Kind: ConditionAlways, Invert: true}},
		},
	}
}

func requireRunningNodeExecution(t *testing.T, execution WorkflowExecution, nodeID string) WorkflowNodeExecution {
	t.Helper()
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.NodeID == nodeID && nodeExecution.Status == NodeExecutionStatusRunning {
			return nodeExecution
		}
	}
	t.Fatalf("running node execution for %s was not found in %+v", nodeID, execution.NodeExecutions)
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
	for _, diagnostic := range result.Diagnostics {
		if diagnostic.Code == code {
			return
		}
	}
	t.Fatalf("diagnostic %s was not found in %+v", code, result.Diagnostics)
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
