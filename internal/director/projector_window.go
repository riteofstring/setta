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
			Nodes:        []SemanticNode{},
			Edges:        []SemanticEdge{},
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

// GraphFor windows one live workstream's graph without copying the projection.
// A snapshot renders the selected workstream and a bounded set of adjacent ones,
// so cloning every other workstream's history to answer for one of them would
// make the cost of a cold start proportional to the whole app instead of to what
// is drawn.
func (projector *DirectorGraphProjector) GraphFor(
	workstreamID string,
	level WorkstreamDetailLevel,
) (WorkstreamGraph, error) {
	workstream, known := projector.workstreams[workstreamID]
	if !known {
		return WorkstreamGraph{}, fmt.Errorf("no projected graph for workstream %q", workstreamID)
	}
	live := WorkstreamGraph{
		WorkstreamID: workstreamID,
		DetailLevel:  WorkstreamDetailSelected,
		Nodes:        workstream.nodes,
		Edges:        workstream.edges,
	}
	return GraphProjection{graphs: map[string]WorkstreamGraph{workstreamID: live}}.Graph(workstreamID, level)
}

// MilestoneFor returns one live workstream's last meaningful public fact. It is
// what a background workstream renders instead of a trajectory.
func (projector *DirectorGraphProjector) MilestoneFor(workstreamID string) (WorkstreamMilestone, bool) {
	workstream, known := projector.workstreams[workstreamID]
	if !known {
		return WorkstreamMilestone{}, false
	}
	return workstream.milestone()
}

// adjacentNodes keeps what an adjacent workstream must answer with: the anchor
// that says it exists, unresolved blockers, produced artifacts, and its most
// recent milestone. The anchor is kept because an idle workstream has nothing
// else, and drawing nothing for it would say it is not there.
func adjacentNodes(nodes []SemanticNode) []SemanticNode {
	kept := make([]SemanticNode, 0, len(nodes))
	for _, node := range nodes {
		if node.Kind == SemanticNodeWorkstream ||
			node.Status == SemanticNodeStatusWaiting ||
			milestoneKinds[node.Kind] {
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

// windowGraph keeps only the edges whose endpoints both survived the window.
// Both endpoints of an edge live in the same workstream, so an edge whose
// target the window dropped would be drawn pointing at nothing.
func windowGraph(full WorkstreamGraph, level WorkstreamDetailLevel, nodes []SemanticNode) WorkstreamGraph {
	present := make(map[string]bool, len(nodes))
	for _, node := range nodes {
		present[node.ID] = true
	}
	edges := make([]SemanticEdge, 0, len(full.Edges))
	for _, edge := range full.Edges {
		if !present[edge.FromNodeID] || !present[edge.ToNodeID] {
			continue
		}
		edges = append(edges, edge)
	}
	return WorkstreamGraph{
		WorkstreamID: full.WorkstreamID,
		DetailLevel:  level,
		Nodes:        cloneSemanticNodes(nodes),
		Edges:        recentEdges(edges, MaxSnapshotGraphEdges),
		HasEarlier:   len(nodes) < len(full.Nodes),
	}
}

func recentEdges(edges []SemanticEdge, limit int) []SemanticEdge {
	if len(edges) <= limit {
		return cloneSemanticEdges(edges)
	}
	return cloneSemanticEdges(edges[len(edges)-limit:])
}
