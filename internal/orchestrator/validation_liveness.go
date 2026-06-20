package orchestrator

import "fmt"

func (validator *graphValidator) validateExecutableLiveness() {
	if validator.startNodeID == "" || validator.reachable == nil {
		return
	}
	terminalReachable := validator.terminalReachability()
	for _, node := range validator.graph.Nodes {
		if node.ID == "" || !validator.reachable[node.ID] {
			continue
		}
		validator.validateNodeCanRoute(node)
		if !terminalReachable[node.ID] && node.Kind != NodeKindEnd {
			validator.addNodeDiagnostic("node_cannot_reach_terminal", fmt.Sprintf("workflow node %s cannot reach an end node or terminal loop policy", node.ID), node.ID)
		}
	}
}

func (validator *graphValidator) terminalReachability() map[string]bool {
	reachesTerminal := map[string]bool{}
	queue := []string{}
	for _, node := range validator.graph.Nodes {
		if !validator.nodeIsTerminalForLiveness(node) {
			continue
		}
		reachesTerminal[node.ID] = true
		queue = append(queue, node.ID)
	}
	for len(queue) > 0 {
		nodeID := queue[0]
		queue = queue[1:]
		for _, edge := range validator.incoming[nodeID] {
			if _, ok := validator.nodesByID[edge.FromNodeID]; !ok {
				continue
			}
			if reachesTerminal[edge.FromNodeID] {
				continue
			}
			reachesTerminal[edge.FromNodeID] = true
			queue = append(queue, edge.FromNodeID)
		}
	}
	return reachesTerminal
}

func (validator *graphValidator) nodeIsTerminalForLiveness(node WorkflowNode) bool {
	if node.Kind == NodeKindEnd {
		return true
	}
	return node.Kind == NodeKindLoopGuard &&
		node.LoopGuard != nil &&
		node.LoopGuard.MaxIterations != nil &&
		*node.LoopGuard.MaxIterations > 0 &&
		validLoopLimitPolicy(node.LoopGuard.LimitPolicy)
}

func (validator *graphValidator) validateNodeCanRoute(node WorkflowNode) {
	switch node.Kind {
	case NodeKindEnd:
		return
	case NodeKindLoopGuard:
		validator.validateReachableLoopGuardRouting(node)
	case NodeKindGatewayXOR:
		validator.validateReachableXORRouting(node)
	default:
		validator.validateReachableAllMatchRouting(node)
	}
}

func (validator *graphValidator) validateReachableAllMatchRouting(node WorkflowNode) {
	outgoing := validator.normalOutgoingEdges(node.ID)
	if len(outgoing) == 0 {
		validator.addNodeDiagnostic(outputRequiredDiagnosticCode(node.Kind), fmt.Sprintf("workflow node %s must have at least one outgoing route", node.ID), node.ID)
		return
	}
	if !hasUnconditionalWorkflowRoute(outgoing) {
		validator.addNodeDiagnostic("routing_may_match_no_edges", fmt.Sprintf("workflow node %s has no unconditional outgoing route and may match no outgoing edges at runtime", node.ID), node.ID)
	}
}

func (validator *graphValidator) validateReachableXORRouting(node WorkflowNode) {
	outgoing := validator.normalOutgoingEdges(node.ID)
	if len(outgoing) == 0 {
		validator.addNodeDiagnostic("xor_gateway_output_required", fmt.Sprintf("XOR gateway %s must have at least one outgoing edge", node.ID), node.ID)
		return
	}
	unconditional := 0
	defaults := 0
	for _, edge := range outgoing {
		switch {
		case edge.Condition != nil && edge.Condition.Kind == ConditionDefault:
			defaults++
		case edge.Condition == nil || edge.Condition.Kind == ConditionAlways:
			unconditional++
		}
	}
	if unconditional == 1 && len(outgoing) == 1 {
		return
	}
	if unconditional > 0 {
		validator.addNodeDiagnostic("xor_gateway_total_route_required", fmt.Sprintf("XOR gateway %s unconditional routes must not be combined with conditional routes", node.ID), node.ID)
		return
	}
	if defaults != 1 {
		validator.addNodeDiagnostic("xor_gateway_total_route_required", fmt.Sprintf("XOR gateway %s must include exactly one default route when all routes are conditional", node.ID), node.ID)
	}
}

func (validator *graphValidator) validateReachableLoopGuardRouting(node WorkflowNode) {
	continueEdges := 0
	exitEdges := 0
	for _, edge := range validator.outgoing[node.ID] {
		switch edge.Kind {
		case EdgeKindLoopContinue:
			continueEdges++
		case EdgeKindLoopExit:
			exitEdges++
		}
	}
	if continueEdges == 0 || exitEdges == 0 {
		return
	}
}

func (validator *graphValidator) normalOutgoingEdges(nodeID string) []WorkflowEdge {
	edges := []WorkflowEdge{}
	for _, edge := range validator.outgoing[nodeID] {
		if edge.Kind == "" || edge.Kind == EdgeKindNormal {
			edges = append(edges, edge)
		}
	}
	return edges
}

func hasUnconditionalWorkflowRoute(edges []WorkflowEdge) bool {
	for _, edge := range edges {
		if edge.Condition == nil || edge.Condition.Kind == ConditionAlways {
			return true
		}
	}
	return false
}

func outputRequiredDiagnosticCode(kind WorkflowNodeKind) string {
	switch kind {
	case NodeKindAction:
		return "action_node_output_required"
	case NodeKindStart:
		return "start_node_output_required"
	default:
		return "control_node_output_required"
	}
}
