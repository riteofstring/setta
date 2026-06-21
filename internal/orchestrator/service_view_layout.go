package orchestrator

import (
	"errors"
	"fmt"
)

func (service *Service) ReadGraphViewLayout(workspaceID string, target WorkflowGraphViewLayoutTarget) (WorkflowGraphViewLayout, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowGraphViewLayout{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	normalizedTarget, _, err := service.resolveGraphViewLayoutTargetLocked(workspaceID, target)
	if err != nil {
		return WorkflowGraphViewLayout{}, err
	}
	return service.store.LoadGraphViewLayout(workspaceID, normalizedTarget)
}

func (service *Service) UpdateGraphViewLayout(workspaceID string, target WorkflowGraphViewLayoutTarget, positions []WorkflowGraphNodeLayout) (WorkflowGraphViewLayout, error) {
	if _, err := service.resolveWorkspace(workspaceID); err != nil {
		return WorkflowGraphViewLayout{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	normalizedTarget, graph, err := service.resolveGraphViewLayoutTargetLocked(workspaceID, target)
	if err != nil {
		return WorkflowGraphViewLayout{}, err
	}
	current, err := service.store.LoadGraphViewLayout(workspaceID, normalizedTarget)
	if err != nil {
		return WorkflowGraphViewLayout{}, err
	}
	next, err := workflowGraphViewLayoutWithUpdatedPositions(current, graph, positions, timestamp(service.now()))
	if err != nil {
		return WorkflowGraphViewLayout{}, err
	}
	if err := service.store.SaveGraphViewLayout(next); err != nil {
		return WorkflowGraphViewLayout{}, err
	}
	return next, nil
}

func (service *Service) resolveGraphViewLayoutTargetLocked(workspaceID string, target WorkflowGraphViewLayoutTarget) (WorkflowGraphViewLayoutTarget, WorkflowGraph, error) {
	key, err := graphViewLayoutKeyForTarget(workspaceID, target)
	if err != nil {
		return WorkflowGraphViewLayoutTarget{}, WorkflowGraph{}, err
	}
	switch key.targetKind {
	case GraphViewLayoutTargetDefinitionVersion:
		version, err := service.store.LoadDefinitionVersion(workspaceID, key.definitionID, key.versionID)
		if err != nil {
			return WorkflowGraphViewLayoutTarget{}, WorkflowGraph{}, err
		}
		return key.target(), version.Graph, nil
	case GraphViewLayoutTargetWorkflowExecution:
		execution, err := service.store.LoadExecution(workspaceID, key.executionID)
		if err != nil {
			return WorkflowGraphViewLayoutTarget{}, WorkflowGraph{}, err
		}
		if execution.DefinitionID != key.definitionID || execution.DefinitionVersionID != key.versionID {
			return WorkflowGraphViewLayoutTarget{}, WorkflowGraph{}, fmt.Errorf(
				"workflow execution %s targets definition %s version %s, not definition %s version %s",
				execution.ID,
				execution.DefinitionID,
				execution.DefinitionVersionID,
				key.definitionID,
				key.versionID,
			)
		}
		version, err := service.store.LoadDefinitionVersion(workspaceID, key.definitionID, key.versionID)
		if err != nil {
			return WorkflowGraphViewLayoutTarget{}, WorkflowGraph{}, err
		}
		return key.target(), version.Graph, nil
	default:
		return WorkflowGraphViewLayoutTarget{}, WorkflowGraph{}, fmt.Errorf("unsupported workflow graph view layout target kind %s", key.targetKind)
	}
}

func workflowGraphViewLayoutWithUpdatedPositions(current WorkflowGraphViewLayout, graph WorkflowGraph, positions []WorkflowGraphNodeLayout, updatedAt string) (WorkflowGraphViewLayout, error) {
	normalized := normalizeWorkflowGraph(graph)
	nodeIDs := workflowGraphNodeIDSet(normalized.Nodes)
	currentPositions, err := workflowGraphViewLayoutPositionMap(current.Positions, nodeIDs)
	if err != nil {
		return WorkflowGraphViewLayout{}, err
	}
	updates, err := workflowGraphViewLayoutPositionMap(positions, nodeIDs)
	if err != nil {
		return WorkflowGraphViewLayout{}, err
	}
	next := WorkflowGraphViewLayout{
		SchemaVersion: SchemaVersion,
		WorkspaceID:   current.WorkspaceID,
		Target:        current.Target,
		Positions:     layoutPositionsForNodes(normalized.Nodes, currentPositions, updates),
		UpdatedAt:     current.UpdatedAt,
	}
	if len(updates) > 0 {
		next.UpdatedAt = updatedAt
	}
	if next.Positions == nil {
		next.Positions = []WorkflowGraphNodeLayout{}
	}
	return next, nil
}

func workflowGraphNodeIDSet(nodes []WorkflowNode) map[string]bool {
	nodeIDs := map[string]bool{}
	for _, node := range nodes {
		nodeIDs[node.ID] = true
	}
	return nodeIDs
}

func workflowGraphViewLayoutPositionMap(positions []WorkflowGraphNodeLayout, nodeIDs map[string]bool) (map[string]WorkflowGraphNodeLayout, error) {
	byNodeID := map[string]WorkflowGraphNodeLayout{}
	for _, position := range positions {
		if position.NodeID == "" {
			return nil, errors.New("workflow graph view layout node id is required")
		}
		if !nodeIDs[position.NodeID] {
			return nil, fmt.Errorf("workflow graph view layout references unknown node %s", position.NodeID)
		}
		if _, exists := byNodeID[position.NodeID]; exists {
			return nil, fmt.Errorf("workflow graph view layout contains duplicate position for node %s", position.NodeID)
		}
		byNodeID[position.NodeID] = WorkflowGraphNodeLayout{
			NodeID: position.NodeID,
			X:      position.X,
			Y:      position.Y,
		}
	}
	return byNodeID, nil
}
