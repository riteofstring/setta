package orchestrator

import (
	"fmt"
	"strings"
)

type edgeTokenSummary struct {
	active    int
	completed int
	cancelled int
	latest    WorkflowTokenStatus
}

func buildWorkflowGraphProjection(version WorkflowDefinitionVersion, execution *WorkflowExecution, updatedAt string) (WorkflowGraphProjection, error) {
	var executionID string
	var executionStatus *WorkflowExecutionStatus
	var terminalReason *WorkflowTerminalReason
	var lastEventOrdinal int
	if execution != nil {
		if execution.WorkspaceID != version.WorkspaceID ||
			execution.DefinitionID != version.DefinitionID ||
			execution.DefinitionVersionID != version.ID {
			return WorkflowGraphProjection{}, fmt.Errorf("workflow execution %s does not match definition version %s", execution.ID, version.ID)
		}
		executionID = execution.ID
		executionStatus = &execution.Status
		terminalReason = execution.TerminalReason
		lastEventOrdinal = execution.LastEventOrdinal
		if execution.UpdatedAt != "" {
			updatedAt = execution.UpdatedAt
		}
	}

	nodes, err := projectedGraphNodes(version.Graph.Nodes, execution)
	if err != nil {
		return WorkflowGraphProjection{}, err
	}
	edges, err := projectedGraphEdges(version.Graph.Edges, execution)
	if err != nil {
		return WorkflowGraphProjection{}, err
	}
	return WorkflowGraphProjection{
		SchemaVersion:         SchemaVersion,
		WorkspaceID:           version.WorkspaceID,
		DefinitionID:          version.DefinitionID,
		DefinitionVersionID:   version.ID,
		DefinitionName:        version.Name,
		DefinitionDescription: version.Description,
		ExecutionID:           executionID,
		ExecutionStatus:       executionStatus,
		TerminalReason:        terminalReason,
		LastEventOrdinal:      lastEventOrdinal,
		UpdatedAt:             updatedAt,
		Nodes:                 nodes,
		Edges:                 edges,
	}, nil
}

func projectedGraphNodes(definitionNodes []WorkflowNode, execution *WorkflowExecution) ([]WorkflowGraphNode, error) {
	latestByNodeID := map[string]WorkflowNodeExecution{}
	countsByNodeID := map[string]int{}
	if execution != nil {
		for _, nodeExecution := range execution.NodeExecutions {
			latestByNodeID[nodeExecution.NodeID] = nodeExecution
			countsByNodeID[nodeExecution.NodeID]++
		}
	}

	nodes := make([]WorkflowGraphNode, 0, len(definitionNodes))
	for _, node := range definitionNodes {
		projected := WorkflowGraphNode{
			ID:                    node.ID,
			Kind:                  node.Kind,
			Title:                 node.Title,
			Label:                 workflowNodeLabel(node),
			Status:                GraphNodeStatusNotStarted,
			Active:                false,
			ExecutionCount:        countsByNodeID[node.ID],
			LatestNodeExecutionID: "",
			LatestAttempt:         0,
			LatestIteration:       0,
			ActionKind:            actionKindForNode(node),
			Signals:               []WorkflowActionSignal{},
			FilePaths:             []string{},
			Error:                 "",
			PendingApproval:       nil,
			RecoveryOutcome:       nil,
			RecoveryMessage:       "",
		}
		if latest, ok := latestByNodeID[node.ID]; ok {
			status, err := graphNodeStatusFromExecutionStatus(latest.Status)
			if err != nil {
				return nil, err
			}
			projected.Status = status
			projected.Active = isActiveNodeExecutionStatus(latest.Status)
			projected.LatestNodeExecutionID = latest.ID
			projected.LatestAttempt = latest.Attempt
			projected.LatestIteration = latest.Iteration
			projected.ActionKind = copyActionKind(latest.ActionKind, projected.ActionKind)
			projected.Error = latest.Error
			projected.RecoveryOutcome = latest.RecoveryOutcome
			projected.RecoveryMessage = latest.RecoveryMessage
			if latest.Result != nil {
				projected.Signals = append([]WorkflowActionSignal{}, latest.Result.Signals...)
				projected.FilePaths = append([]string{}, latest.Result.FilePaths...)
				if projected.Error == "" {
					projected.Error = latest.Result.Error
				}
				if latest.Status == NodeExecutionStatusWaitingApproval {
					projected.PendingApproval = latest.Result.PendingApproval
				}
			}
		}
		nodes = append(nodes, projected)
	}
	return nodes, nil
}

func projectedGraphEdges(definitionEdges []WorkflowEdge, execution *WorkflowExecution) ([]WorkflowGraphEdge, error) {
	summaries := map[string]edgeTokenSummary{}
	if execution != nil {
		for _, token := range execution.Tokens {
			summary := summaries[token.EdgeID]
			switch token.Status {
			case TokenStatusActive:
				summary.active++
			case TokenStatusCompleted:
				summary.completed++
			case TokenStatusCancelled:
				summary.cancelled++
			default:
				return nil, fmt.Errorf("workflow token %s has unsupported status %s", token.ID, token.Status)
			}
			summary.latest = token.Status
			summaries[token.EdgeID] = summary
		}
	}

	edges := make([]WorkflowGraphEdge, 0, len(definitionEdges))
	for _, edge := range definitionEdges {
		summary := summaries[edge.ID]
		status, err := graphEdgeStatusFromTokenSummary(summary)
		if err != nil {
			return nil, err
		}
		edges = append(edges, WorkflowGraphEdge{
			ID:                  edge.ID,
			Kind:                edge.Kind,
			FromNodeID:          edge.FromNodeID,
			ToNodeID:            edge.ToNodeID,
			Status:              status,
			ActiveTokenCount:    summary.active,
			CompletedTokenCount: summary.completed,
			CancelledTokenCount: summary.cancelled,
		})
	}
	return edges, nil
}

func workflowNodeLabel(node WorkflowNode) string {
	if title := strings.TrimSpace(node.Title); title != "" {
		return title
	}
	return node.ID
}

func actionKindForNode(node WorkflowNode) *WorkflowActionKind {
	if node.Action == nil || node.Action.Kind == "" {
		return nil
	}
	kind := node.Action.Kind
	return &kind
}

func copyActionKind(primary *WorkflowActionKind, fallback *WorkflowActionKind) *WorkflowActionKind {
	if primary != nil {
		kind := *primary
		return &kind
	}
	if fallback != nil {
		kind := *fallback
		return &kind
	}
	return nil
}

func graphNodeStatusFromExecutionStatus(status WorkflowNodeExecutionStatus) (WorkflowGraphNodeStatus, error) {
	switch status {
	case NodeExecutionStatusPending:
		return GraphNodeStatusPending, nil
	case NodeExecutionStatusReady:
		return GraphNodeStatusReady, nil
	case NodeExecutionStatusRunning:
		return GraphNodeStatusRunning, nil
	case NodeExecutionStatusSucceeded:
		return GraphNodeStatusSucceeded, nil
	case NodeExecutionStatusFailed:
		return GraphNodeStatusFailed, nil
	case NodeExecutionStatusCancelled:
		return GraphNodeStatusCancelled, nil
	case NodeExecutionStatusWaitingApproval:
		return GraphNodeStatusWaitingApproval, nil
	case NodeExecutionStatusRecoveryRequired:
		return GraphNodeStatusRecoveryRequired, nil
	default:
		return "", fmt.Errorf("unsupported workflow node execution status %s", status)
	}
}

func graphEdgeStatusFromTokenSummary(summary edgeTokenSummary) (WorkflowGraphEdgeStatus, error) {
	if summary.active > 0 {
		return GraphEdgeStatusActive, nil
	}
	switch summary.latest {
	case "":
		return GraphEdgeStatusInactive, nil
	case TokenStatusCompleted:
		return GraphEdgeStatusCompleted, nil
	case TokenStatusCancelled:
		return GraphEdgeStatusCancelled, nil
	case TokenStatusActive:
		return GraphEdgeStatusActive, nil
	default:
		return "", fmt.Errorf("unsupported workflow token status %s", summary.latest)
	}
}
