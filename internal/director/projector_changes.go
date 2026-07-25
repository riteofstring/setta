package director

// Change tracking over the live projection.
//
// A pushed graph update carries the nodes and edges a durable fact touched, not
// the workstream's whole graph: a burst of provider events must not rebuild an
// entire scene once per event. The projector already funnels every visible
// change through commitNode, addEdge, and dropNodes, so recording what those
// touched is the one place that can report a delta without diffing two graphs.

// GraphChange is what one workstream's graph gained, advanced, or dropped since
// the last time changes were taken.
type GraphChange struct {
	WorkstreamID   string
	Nodes          []SemanticNode
	Edges          []SemanticEdge
	RemovedNodeIDs []string
}

// markNodeChanged records a node the applying fact created or advanced. A node
// that was dropped and recreated is a change again, so the removal is forgotten.
func (workstream *projectedWorkstream) markNodeChanged(nodeID string) {
	delete(workstream.removedNodeIDs, nodeID)
	workstream.changedNodeIDs[nodeID] = true
}

func (workstream *projectedWorkstream) markEdgeChanged(edgeID string) {
	workstream.changedEdgeIDs[edgeID] = true
}

// markNodesRemoved records nodes that left the live window. The durable events
// that produced them are untouched; only the renderer's window loses them, and
// an edge that touched one is dropped with it rather than reported as changed.
func (workstream *projectedWorkstream) markNodesRemoved(dropped map[string]bool) {
	for nodeID := range dropped {
		delete(workstream.changedNodeIDs, nodeID)
		workstream.removedNodeIDs[nodeID] = true
	}
}

func (workstream *projectedWorkstream) markEdgesDropped(dropped map[string]bool) {
	for edgeID := range dropped {
		delete(workstream.changedEdgeIDs, edgeID)
	}
}

func (workstream *projectedWorkstream) hasChanges() bool {
	return len(workstream.changedNodeIDs) > 0 ||
		len(workstream.changedEdgeIDs) > 0 ||
		len(workstream.removedNodeIDs) > 0
}

// takeChange returns one workstream's pending change in durable order and clears
// it. Order comes from the graph itself rather than from map iteration, so the
// same fact stream always produces the same delta.
func (workstream *projectedWorkstream) takeChange() GraphChange {
	change := GraphChange{
		WorkstreamID:   workstream.id,
		Nodes:          make([]SemanticNode, 0, len(workstream.changedNodeIDs)),
		Edges:          make([]SemanticEdge, 0, len(workstream.changedEdgeIDs)),
		RemovedNodeIDs: make([]string, 0, len(workstream.removedNodeIDs)),
	}
	for _, node := range workstream.nodes {
		if workstream.changedNodeIDs[node.ID] {
			change.Nodes = append(change.Nodes, cloneSemanticNode(node))
		}
	}
	for _, edge := range workstream.edges {
		if workstream.changedEdgeIDs[edge.ID] {
			change.Edges = append(change.Edges, edge)
			change.Edges[len(change.Edges)-1].SourceEventIDs = append([]string{}, edge.SourceEventIDs...)
		}
	}
	for _, node := range workstream.removedNodeOrder {
		if workstream.removedNodeIDs[node] {
			change.RemovedNodeIDs = append(change.RemovedNodeIDs, node)
		}
	}
	workstream.changedNodeIDs = map[string]bool{}
	workstream.changedEdgeIDs = map[string]bool{}
	workstream.removedNodeIDs = map[string]bool{}
	workstream.removedNodeOrder = nil
	return change
}

// TakeGraphChanges returns the pending change of every workstream that moved,
// in registry order, and clears them. Taking is destructive because a delta is
// consumed once: the caller that took it owns delivering it.
func (projector *DirectorGraphProjector) TakeGraphChanges() []GraphChange {
	changes := make([]GraphChange, 0, len(projector.order))
	for _, workstreamID := range projector.order {
		workstream, known := projector.workstreams[workstreamID]
		if !known || !workstream.hasChanges() {
			continue
		}
		changes = append(changes, workstream.takeChange())
	}
	return changes
}
