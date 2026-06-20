package orchestrator

import "fmt"

func workflowGraphWithUpdatedLayout(graph WorkflowGraph, positions []WorkflowGraphNodeLayout) (WorkflowGraph, error) {
	normalized := normalizeWorkflowGraph(graph)
	nodeIDs := map[string]bool{}
	for _, node := range normalized.Nodes {
		nodeIDs[node.ID] = true
	}
	updates := map[string]WorkflowGraphNodeLayout{}
	for _, position := range positions {
		if position.NodeID == "" {
			return WorkflowGraph{}, fmt.Errorf("workflow layout node id is required")
		}
		if !nodeIDs[position.NodeID] {
			return WorkflowGraph{}, fmt.Errorf("workflow layout references unknown node %s", position.NodeID)
		}
		if _, exists := updates[position.NodeID]; exists {
			return WorkflowGraph{}, fmt.Errorf("workflow layout contains duplicate position for node %s", position.NodeID)
		}
		updates[position.NodeID] = WorkflowGraphNodeLayout{
			NodeID: position.NodeID,
			X:      position.X,
			Y:      position.Y,
		}
	}
	current := map[string]WorkflowGraphNodeLayout{}
	for _, position := range normalized.Layout.Nodes {
		if !nodeIDs[position.NodeID] {
			continue
		}
		if _, exists := current[position.NodeID]; exists {
			continue
		}
		current[position.NodeID] = position
	}
	return WorkflowGraph{
		Nodes: normalized.Nodes,
		Edges: normalized.Edges,
		Layout: WorkflowGraphLayout{
			Nodes: layoutPositionsForNodes(normalized.Nodes, current, updates),
		},
	}, nil
}

func layoutPositionsForNodes(nodes []WorkflowNode, current map[string]WorkflowGraphNodeLayout, updates map[string]WorkflowGraphNodeLayout) []WorkflowGraphNodeLayout {
	positions := []WorkflowGraphNodeLayout{}
	for _, node := range nodes {
		position, ok := updates[node.ID]
		if !ok {
			position, ok = current[node.ID]
		}
		if ok {
			positions = append(positions, position)
		}
	}
	return positions
}
