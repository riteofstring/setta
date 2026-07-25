package director

import "fmt"

// Level-of-detail windowing.
//
// Rendering cost must scale with what the user can perceive, not with all
// durable history. Windowing hides detail; it never replaces a durable fact with
// an unsourced summary, and it always says when older facts exist so the
// renderer draws a compaction boundary instead of implying a beginning.

// Graph returns one workstream's projected graph at the detail level the
// registry assigned it.
func (projection GraphProjection) Graph(workstreamID string, level WorkstreamDetailLevel) (WorkstreamGraph, error) {
	full, known := projection.graphs[workstreamID]
	if !known {
		return WorkstreamGraph{}, fmt.Errorf("no projected graph for workstream %q", workstreamID)
	}
	switch level {
	case WorkstreamDetailBackground:
		// Background workstreams render aggregate status only.
		return WorkstreamGraph{
			WorkstreamID: workstreamID,
			DetailLevel:  level,
			HasEarlier:   len(full.Nodes) > 0,
		}, nil
	case WorkstreamDetailAdjacent:
		return windowGraph(full, level, adjacentNodes(full.Nodes)), nil
	case WorkstreamDetailSelected:
		return windowGraph(full, level, recentNodes(full.Nodes, MaxSnapshotGraphNodes)), nil
	default:
		return WorkstreamGraph{}, fmt.Errorf("unknown workstream detail level %q", level)
	}
}

// adjacentNodes keeps what an adjacent workstream must answer with: unresolved
// blockers, produced artifacts, and its most recent milestone.
func adjacentNodes(nodes []SemanticNode) []SemanticNode {
	kept := make([]SemanticNode, 0, len(nodes))
	for _, node := range nodes {
		if node.Status == SemanticNodeStatusWaiting || milestoneKinds[node.Kind] {
			kept = append(kept, node)
		}
	}
	return recentNodes(kept, MaxSnapshotAdjacentGraphNodes)
}

func recentNodes(nodes []SemanticNode, limit int) []SemanticNode {
	if len(nodes) <= limit {
		return nodes
	}
	return nodes[len(nodes)-limit:]
}

// windowGraph keeps only the edges whose endpoints survived the window. A
// delegated_to edge to another workstream is the one relationship whose target
// lives elsewhere, so its target is not required to be present here.
func windowGraph(full WorkstreamGraph, level WorkstreamDetailLevel, nodes []SemanticNode) WorkstreamGraph {
	present := make(map[string]bool, len(nodes))
	for _, node := range nodes {
		present[node.ID] = true
	}
	edges := make([]SemanticEdge, 0, len(full.Edges))
	for _, edge := range full.Edges {
		if !present[edge.FromNodeID] {
			continue
		}
		if edge.ToWorkstreamID == full.WorkstreamID && !present[edge.ToNodeID] {
			continue
		}
		edges = append(edges, edge)
	}
	return WorkstreamGraph{
		WorkstreamID: full.WorkstreamID,
		DetailLevel:  level,
		Nodes:        append([]SemanticNode(nil), nodes...),
		Edges:        recentEdges(edges, MaxSnapshotGraphEdges),
		HasEarlier:   len(nodes) < len(full.Nodes),
	}
}

func recentEdges(edges []SemanticEdge, limit int) []SemanticEdge {
	if len(edges) <= limit {
		return append([]SemanticEdge(nil), edges...)
	}
	return append([]SemanticEdge(nil), edges[len(edges)-limit:]...)
}
