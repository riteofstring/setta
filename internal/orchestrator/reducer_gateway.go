package orchestrator

func activeTokensCoverEdges(execution WorkflowExecution, tokenIndexes []int, edgeIDs []string) bool {
	active := map[string]bool{}
	for _, index := range tokenIndexes {
		active[execution.Tokens[index].EdgeID] = true
	}
	for _, edgeID := range edgeIDs {
		if !active[edgeID] {
			return false
		}
	}
	return true
}

func consumeGatewayArrivals(execution *WorkflowExecution, tokenIndexes []int, now string) error {
	for _, index := range tokenIndexes {
		if err := consumeToken(execution, index, now); err != nil {
			return err
		}
	}
	return nil
}

func gatewayAlreadyResolved(execution WorkflowExecution, nodeID string, iteration int) bool {
	_, ok := gatewayResolutionFor(execution, nodeID, iteration)
	return ok
}

func gatewayResolutionFor(execution WorkflowExecution, nodeID string, iteration int) (WorkflowNodeExecution, bool) {
	for _, nodeExecution := range execution.NodeExecutions {
		if nodeExecution.NodeID == nodeID && nodeExecution.Iteration == iteration && nodeExecution.Status == NodeExecutionStatusSucceeded {
			return nodeExecution, true
		}
	}
	return WorkflowNodeExecution{}, false
}
