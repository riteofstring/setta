package orchestrator

import "fmt"

func synchronousStepBudget(graph WorkflowGraph) int {
	base := len(graph.Nodes) + len(graph.Edges) + 1
	if base < 1 {
		base = 1
	}
	budget := saturatingMultiply(base, base)
	for _, node := range graph.Nodes {
		budget = applyLoopGuardBudget(budget, graph, node)
	}
	return budget
}

func applyLoopGuardBudget(budget int, graph WorkflowGraph, node WorkflowNode) int {
	if node.LoopGuard == nil || node.LoopGuard.MaxIterations == nil {
		return budget
	}
	continueEdges := loopContinueEdgeCount(graph, node.ID)
	iterations := *node.LoopGuard.MaxIterations
	if iterations < 1 {
		iterations = 1
	}
	return saturatingMultiply(
		budget,
		saturatingAdd(saturatingMultiply(iterations, continueEdges), 1),
	)
}

func loopContinueEdgeCount(graph WorkflowGraph, nodeID string) int {
	count := 0
	for _, edge := range outgoingEdges(graph, nodeID) {
		if edge.Kind == EdgeKindLoopContinue {
			count++
		}
	}
	if count == 0 {
		return 1
	}
	return count
}

func synchronousStepBudgetExceededError(graph WorkflowGraph, budget int) error {
	if cycle := suspectedSynchronousControlCycle(graph); cycle != "" {
		return fmt.Errorf("workflow synchronous transition exceeded %d processed tokens; suspected unbounded control cycle: %s", budget, cycle)
	}
	return fmt.Errorf("workflow synchronous transition exceeded %d processed tokens; graph may contain an unbounded control cycle without an action boundary", budget)
}

func suspectedSynchronousControlCycle(graph WorkflowGraph) string {
	nodesByID := nodesByIDForGraph(graph)
	state := map[string]int{}
	stack := []string{}
	for _, node := range graph.Nodes {
		if state[node.ID] != 0 {
			continue
		}
		cycle, ok := visitSynchronousControlCycle(graph, nodesByID, state, &stack, node.ID)
		if ok {
			return nodePathKey(cycle)
		}
	}
	return ""
}

func visitSynchronousControlCycle(graph WorkflowGraph, nodesByID map[string]WorkflowNode, state map[string]int, stack *[]string, nodeID string) ([]string, bool) {
	state[nodeID] = 1
	*stack = append(*stack, nodeID)
	for _, edge := range outgoingEdges(graph, nodeID) {
		cycle, ok := synchronousControlCycleFromEdge(graph, nodesByID, state, stack, edge)
		if ok {
			return cycle, true
		}
	}
	*stack = (*stack)[:len(*stack)-1]
	state[nodeID] = 2
	return nil, false
}

func synchronousControlCycleFromEdge(graph WorkflowGraph, nodesByID map[string]WorkflowNode, state map[string]int, stack *[]string, edge WorkflowEdge) ([]string, bool) {
	target := edge.ToNodeID
	if _, ok := nodesByID[target]; !ok {
		return nil, false
	}
	switch state[target] {
	case 0:
		return visitSynchronousControlCycle(graph, nodesByID, state, stack, target)
	case 1:
		cycle := activeStackCycle(*stack, target)
		if !nodePathContainsAction(cycle, nodesByID) {
			return cycle, true
		}
	}
	return nil, false
}

func activeStackCycle(stack []string, target string) []string {
	for index, stacked := range stack {
		if stacked == target {
			return append([]string{}, stack[index:]...)
		}
	}
	return nil
}

func nodesByIDForGraph(graph WorkflowGraph) map[string]WorkflowNode {
	nodesByID := map[string]WorkflowNode{}
	for _, node := range graph.Nodes {
		nodesByID[node.ID] = node
	}
	return nodesByID
}

func nodePathContainsAction(nodeIDs []string, nodesByID map[string]WorkflowNode) bool {
	for _, nodeID := range nodeIDs {
		if nodesByID[nodeID].Kind == NodeKindAction {
			return true
		}
	}
	return false
}

func saturatingMultiply(left int, right int) int {
	if left <= 0 || right <= 0 {
		return 1
	}
	maxInt := int(^uint(0) >> 1)
	if left > maxInt/right {
		return maxInt
	}
	return left * right
}

func saturatingAdd(left int, right int) int {
	maxInt := int(^uint(0) >> 1)
	if left > maxInt-right {
		return maxInt
	}
	return left + right
}
