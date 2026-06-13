package orchestrator

import (
	"fmt"
	"strings"
)

const (
	draftNodeCenterOffsetX = 80
	draftNodeCenterOffsetY = 41
)

type draftNodeSpec struct {
	idBase string
	kind   WorkflowNodeKind
	title  string
}

var draftNodeSpecs = map[WorkflowDraftNodeType]draftNodeSpec{
	WorkflowDraftNodeAgentTask: {
		idBase: "agent_task",
		kind:   NodeKindAction,
		title:  "Agent Task",
	},
	WorkflowDraftNodeBarrierJoin: {
		idBase: "barrier_join",
		kind:   NodeKindGatewayAND,
		title:  "Barrier Join",
	},
	WorkflowDraftNodeEnd: {
		idBase: "end",
		kind:   NodeKindEnd,
		title:  "End",
	},
	WorkflowDraftNodeMerge: {
		idBase: "merge",
		kind:   NodeKindGatewayOR,
		title:  "Merge",
	},
	WorkflowDraftNodeRoute: {
		idBase: "route",
		kind:   NodeKindGatewayXOR,
		title:  "Route",
	},
	WorkflowDraftNodeStart: {
		idBase: "start",
		kind:   NodeKindStart,
		title:  "Start",
	},
}

func (service *Service) AddDefinitionNode(workspaceID string, definitionID string, expectedRevision string, nodeType WorkflowDraftNodeType, position WorkflowDraftNodePosition) (WorkflowGraphProjection, error) {
	return service.updateDraftGraph(workspaceID, definitionID, expectedRevision, func(graph WorkflowGraph) (WorkflowGraph, error) {
		return workflowGraphWithAddedDraftNode(graph, nodeType, position)
	})
}

func (service *Service) AddDefinitionEdge(workspaceID string, definitionID string, expectedRevision string, connection WorkflowDraftEdgeConnection) (WorkflowGraphProjection, error) {
	return service.updateDraftGraph(workspaceID, definitionID, expectedRevision, func(graph WorkflowGraph) (WorkflowGraph, error) {
		return workflowGraphWithAddedDraftEdge(graph, connection)
	})
}

func (service *Service) DeleteDefinitionNodes(workspaceID string, definitionID string, expectedRevision string, nodeIDs []string) (WorkflowGraphProjection, error) {
	return service.updateDraftGraph(workspaceID, definitionID, expectedRevision, func(graph WorkflowGraph) (WorkflowGraph, error) {
		return workflowGraphWithoutDraftNodes(graph, nodeIDs), nil
	})
}

func (service *Service) UpdateDefinitionNode(workspaceID string, definitionID string, expectedRevision string, node WorkflowNode) (WorkflowGraphProjection, error) {
	return service.updateDraftGraph(workspaceID, definitionID, expectedRevision, func(graph WorkflowGraph) (WorkflowGraph, error) {
		return workflowGraphWithUpdatedNode(graph, node)
	})
}

func (service *Service) UpdateDefinitionEdge(workspaceID string, definitionID string, expectedRevision string, edge WorkflowEdge) (WorkflowGraphProjection, error) {
	return service.updateDraftGraph(workspaceID, definitionID, expectedRevision, func(graph WorkflowGraph) (WorkflowGraph, error) {
		return workflowGraphWithUpdatedEdge(graph, edge)
	})
}

func (service *Service) UpdateDefinitionSettings(workspaceID string, definitionID string, expectedRevision string, name string, description string) (WorkflowDefinition, error) {
	workspaceSummary, err := service.resolveWorkspace(workspaceID)
	if err != nil {
		return WorkflowDefinition{}, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return WorkflowDefinition{}, fmt.Errorf("workflow definition name is required")
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	current, currentPath, err := service.loadWorkspaceDefinition(workspaceSummary, definitionID)
	if err != nil {
		return WorkflowDefinition{}, err
	}
	if err := ensureExpectedDraftRevision(current, expectedRevision); err != nil {
		return WorkflowDefinition{}, err
	}
	next := current
	next.Name = name
	next.Description = description
	next.UpdatedAt = timestamp(service.now())
	return writeWorkflowDefinitionFile(workspaceSummary.RootPath, next, currentPath)
}

func (service *Service) updateDraftGraph(workspaceID string, definitionID string, expectedRevision string, update func(WorkflowGraph) (WorkflowGraph, error)) (WorkflowGraphProjection, error) {
	workspaceSummary, err := service.resolveWorkspace(workspaceID)
	if err != nil {
		return WorkflowGraphProjection{}, err
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	definition, currentPath, err := service.loadWorkspaceDefinition(workspaceSummary, definitionID)
	if err != nil {
		return WorkflowGraphProjection{}, err
	}
	if err := ensureExpectedDraftRevision(definition, expectedRevision); err != nil {
		return WorkflowGraphProjection{}, err
	}
	graph, err := update(definition.Graph)
	if err != nil {
		return WorkflowGraphProjection{}, err
	}
	next := definition
	next.Graph = normalizeWorkflowGraph(graph)
	next.UpdatedAt = timestamp(service.now())
	updated, err := writeWorkflowDefinitionFile(workspaceSummary.RootPath, next, currentPath)
	if err != nil {
		return WorkflowGraphProjection{}, err
	}
	return service.workflowDraftProjectionLocked(updated, nil)
}

func workflowGraphWithAddedDraftNode(graph WorkflowGraph, nodeType WorkflowDraftNodeType, position WorkflowDraftNodePosition) (WorkflowGraph, error) {
	normalized := normalizeWorkflowGraph(graph)
	spec, ok := draftNodeSpecs[nodeType]
	if !ok {
		return WorkflowGraph{}, fmt.Errorf("unsupported workflow draft node type %s", nodeType)
	}
	node := draftNode(nodeType, nextDraftNodeID(normalized, spec.idBase))
	return WorkflowGraph{
		Edges: normalized.Edges,
		Layout: WorkflowGraphLayout{Nodes: append(append([]WorkflowGraphNodeLayout{}, normalized.Layout.Nodes...), WorkflowGraphNodeLayout{
			NodeID: node.ID,
			X:      position.X - draftNodeCenterOffsetX,
			Y:      position.Y - draftNodeCenterOffsetY,
		})},
		Nodes: append(append([]WorkflowNode{}, normalized.Nodes...), node),
	}, nil
}

func workflowGraphWithAddedDraftEdge(graph WorkflowGraph, connection WorkflowDraftEdgeConnection) (WorkflowGraph, error) {
	normalized := normalizeWorkflowGraph(graph)
	if _, err := workflowDraftNode(normalized, connection.SourceNodeID); err != nil {
		return WorkflowGraph{}, err
	}
	if _, err := workflowDraftNode(normalized, connection.TargetNodeID); err != nil {
		return WorkflowGraph{}, err
	}
	edge, err := draftEdge(normalized, connection, nextDraftEdgeID(normalized, connection.SourceNodeID+"_"+connection.TargetNodeID))
	if err != nil {
		return WorkflowGraph{}, err
	}
	return workflowGraphWithResolvedRouteConditionSources(WorkflowGraph{
		Edges:  append(append([]WorkflowEdge{}, normalized.Edges...), edge),
		Layout: normalized.Layout,
		Nodes:  normalized.Nodes,
	}), nil
}

func workflowGraphWithoutDraftNodes(graph WorkflowGraph, nodeIDs []string) WorkflowGraph {
	normalized := normalizeWorkflowGraph(graph)
	removedNodeIDs := map[string]bool{}
	for _, nodeID := range nodeIDs {
		removedNodeIDs[nodeID] = true
	}
	if len(removedNodeIDs) == 0 {
		return normalized
	}
	nextGraph := WorkflowGraph{
		Edges:  make([]WorkflowEdge, 0, len(normalized.Edges)),
		Layout: WorkflowGraphLayout{Nodes: make([]WorkflowGraphNodeLayout, 0, len(normalized.Layout.Nodes))},
		Nodes:  make([]WorkflowNode, 0, len(normalized.Nodes)),
	}
	for _, edge := range normalized.Edges {
		if removedNodeIDs[edge.FromNodeID] || removedNodeIDs[edge.ToNodeID] {
			continue
		}
		nextGraph.Edges = append(nextGraph.Edges, edge)
	}
	for _, position := range normalized.Layout.Nodes {
		if !removedNodeIDs[position.NodeID] {
			nextGraph.Layout.Nodes = append(nextGraph.Layout.Nodes, position)
		}
	}
	for _, node := range normalized.Nodes {
		if !removedNodeIDs[node.ID] {
			nextGraph.Nodes = append(nextGraph.Nodes, node)
		}
	}
	return workflowGraphWithResolvedRouteConditionSources(workflowGraphWithoutDeletedConditionSources(nextGraph, removedNodeIDs))
}

func workflowGraphWithUpdatedNode(graph WorkflowGraph, updated WorkflowNode) (WorkflowGraph, error) {
	if updated.ID == "" {
		return WorkflowGraph{}, fmt.Errorf("workflow node id is required")
	}
	normalized := normalizeWorkflowGraph(graph)
	nodes := append([]WorkflowNode{}, normalized.Nodes...)
	found := false
	for index, node := range nodes {
		if node.ID == updated.ID {
			nodes[index] = updated
			found = true
			break
		}
	}
	if !found {
		return WorkflowGraph{}, fmt.Errorf("workflow node %s was not found", updated.ID)
	}
	return workflowGraphWithResolvedRouteConditionSources(WorkflowGraph{
		Edges:  normalized.Edges,
		Layout: normalized.Layout,
		Nodes:  nodes,
	}), nil
}

func workflowGraphWithUpdatedEdge(graph WorkflowGraph, updated WorkflowEdge) (WorkflowGraph, error) {
	if updated.ID == "" {
		return WorkflowGraph{}, fmt.Errorf("workflow edge id is required")
	}
	normalized := normalizeWorkflowGraph(graph)
	if _, err := workflowDraftNode(normalized, updated.FromNodeID); err != nil {
		return WorkflowGraph{}, err
	}
	if _, err := workflowDraftNode(normalized, updated.ToNodeID); err != nil {
		return WorkflowGraph{}, err
	}
	edges := append([]WorkflowEdge{}, normalized.Edges...)
	found := false
	for index, edge := range edges {
		if edge.ID == updated.ID {
			edges[index] = updated
			found = true
			break
		}
	}
	if !found {
		return WorkflowGraph{}, fmt.Errorf("workflow edge %s was not found", updated.ID)
	}
	return workflowGraphWithResolvedRouteConditionSources(WorkflowGraph{
		Edges:  edges,
		Layout: normalized.Layout,
		Nodes:  normalized.Nodes,
	}), nil
}

func nextDraftNodeID(graph WorkflowGraph, base string) string {
	existingIDs := map[string]bool{}
	for _, node := range graph.Nodes {
		existingIDs[node.ID] = true
	}
	if !existingIDs[base] {
		return base
	}
	for index := 2; ; index++ {
		candidate := fmt.Sprintf("%s_%d", base, index)
		if !existingIDs[candidate] {
			return candidate
		}
	}
}

func nextDraftEdgeID(graph WorkflowGraph, base string) string {
	existingIDs := map[string]bool{}
	for _, edge := range graph.Edges {
		existingIDs[edge.ID] = true
	}
	if !existingIDs[base] {
		return base
	}
	for index := 2; ; index++ {
		candidate := fmt.Sprintf("%s_%d", base, index)
		if !existingIDs[candidate] {
			return candidate
		}
	}
}

func draftNode(nodeType WorkflowDraftNodeType, id string) WorkflowNode {
	spec := draftNodeSpecs[nodeType]
	switch nodeType {
	case WorkflowDraftNodeAgentTask:
		return WorkflowNode{
			ID:     id,
			Kind:   spec.kind,
			Title:  spec.title,
			Action: draftAgentAction(),
		}
	case WorkflowDraftNodeBarrierJoin, WorkflowDraftNodeMerge, WorkflowDraftNodeRoute:
		return WorkflowNode{
			ID:      id,
			Kind:    spec.kind,
			Title:   spec.title,
			Gateway: &WorkflowGatewayConfig{RequiredIncoming: []string{}},
		}
	case WorkflowDraftNodeEnd, WorkflowDraftNodeStart:
		return WorkflowNode{
			ID:    id,
			Kind:  spec.kind,
			Title: spec.title,
		}
	default:
		return WorkflowNode{}
	}
}

func draftAgentAction() *WorkflowActionConfig {
	return &WorkflowActionConfig{
		Kind: ActionKindAgentCodex,
		Codex: &WorkflowCodexActionConfig{
			Prompt:            "Describe this agent task.",
			FreshConversation: true,
			Model:             "",
			ReasoningEffort:   "",
		},
	}
}

func draftEdge(graph WorkflowGraph, connection WorkflowDraftEdgeConnection, id string) (WorkflowEdge, error) {
	condition, err := draftEdgeCondition(graph, connection)
	if err != nil {
		return WorkflowEdge{}, err
	}
	return WorkflowEdge{
		ID:         id,
		FromNodeID: connection.SourceNodeID,
		ToNodeID:   connection.TargetNodeID,
		Kind:       EdgeKindNormal,
		Condition:  condition,
	}, nil
}

func draftEdgeCondition(graph WorkflowGraph, connection WorkflowDraftEdgeConnection) (*WorkflowCondition, error) {
	source, err := workflowDraftNode(graph, connection.SourceNodeID)
	if err != nil {
		return nil, err
	}
	if source.Kind != NodeKindGatewayXOR {
		return nil, nil
	}
	switch connection.SourcePortID {
	case "route_yes":
		return routeSignalCondition(graph, source.ID, "yes"), nil
	case "route_no":
		return routeSignalCondition(graph, source.ID, "no"), nil
	case "route_default":
		return defaultRouteCondition(), nil
	default:
		return nil, nil
	}
}

func routeSignalCondition(graph WorkflowGraph, routeNodeID string, signalValue string) *WorkflowCondition {
	return &WorkflowCondition{
		Kind:        ConditionActionSignal,
		NodeID:      routeConditionSourceNodeID(graph, routeNodeID),
		SignalName:  "route",
		SignalValue: signalValue,
	}
}

func defaultRouteCondition() *WorkflowCondition {
	return &WorkflowCondition{Kind: ConditionDefault}
}

func workflowGraphWithResolvedRouteConditionSources(graph WorkflowGraph) WorkflowGraph {
	next := graph
	next.Edges = append([]WorkflowEdge{}, graph.Edges...)
	for index, edge := range next.Edges {
		if edge.Condition == nil || edge.Condition.Kind != ConditionActionSignal || edge.Condition.NodeID != "" {
			continue
		}
		source, err := workflowDraftNode(graph, edge.FromNodeID)
		if err != nil || source.Kind != NodeKindGatewayXOR {
			continue
		}
		nodeID := routeConditionSourceNodeID(graph, source.ID)
		if nodeID == "" {
			continue
		}
		condition := *edge.Condition
		condition.NodeID = nodeID
		next.Edges[index].Condition = &condition
	}
	return next
}

func workflowGraphWithoutDeletedConditionSources(graph WorkflowGraph, removedNodeIDs map[string]bool) WorkflowGraph {
	next := graph
	next.Edges = append([]WorkflowEdge{}, graph.Edges...)
	for index, edge := range next.Edges {
		if edge.Condition == nil || !removedNodeIDs[edge.Condition.NodeID] {
			continue
		}
		condition := *edge.Condition
		condition.NodeID = ""
		next.Edges[index].Condition = &condition
	}
	return next
}

func routeConditionSourceNodeID(graph WorkflowGraph, routeNodeID string) string {
	sourceNodeIDs := []string{}
	for _, edge := range graph.Edges {
		if edge.ToNodeID != routeNodeID {
			continue
		}
		node, err := workflowDraftNode(graph, edge.FromNodeID)
		if err != nil || node.Kind != NodeKindAction {
			continue
		}
		sourceNodeIDs = append(sourceNodeIDs, node.ID)
	}
	if len(sourceNodeIDs) != 1 {
		return ""
	}
	return sourceNodeIDs[0]
}

func workflowDraftNode(graph WorkflowGraph, nodeID string) (WorkflowNode, error) {
	for _, node := range graph.Nodes {
		if node.ID == nodeID {
			return node, nil
		}
	}
	return WorkflowNode{}, fmt.Errorf("workflow edge references missing node %s", nodeID)
}
