package director

import (
	"fmt"
	"strings"
)

// The projector's node and edge primitives. Every visible fact is committed
// through commitNode, and every relationship through addEdge, so provenance,
// lifecycle validation, and deterministic identity are enforced in one place
// rather than repeated in each handler.

// factContext is the durable fact currently being applied.
type factContext struct {
	eventID    string
	emittedAt  string
	workstream *projectedWorkstream
	runID      *string
	actor      SemanticActor
	sourceFact string
	edgeKinds  []SemanticEdgeKind
}

// nodeSpec is a handler's request to create or advance one node. The identity
// and source id decide the node id, which is why replaying the same fact always
// addresses the same node instead of appending a near-duplicate.
type nodeSpec struct {
	identity SemanticNodeIdentity
	sourceID string
	// nodeID overrides the derived id for nodes whose identity needs more than
	// one component, such as plan steps.
	nodeID         string
	kind           SemanticNodeKind
	status         SemanticNodeStatus
	actor          SemanticActor
	summary        string
	evidence       EvidenceClass
	runID          *string
	artifactIDs    []string
	interpretation *InterpretationMetadata
	// extraSourceEventIDs are durable events beyond the applying one that this
	// node is evidence for, such as the events an interpretation was drawn from.
	extraSourceEventIDs []string
	// chain asks for a followed_by edge from the previous visible fact.
	chain bool
}

func (projector *DirectorGraphProjector) commitNode(context factContext, spec nodeSpec) (string, error) {
	nodeID, err := resolveNodeID(spec)
	if err != nil {
		return "", err
	}
	workstream := context.workstream
	if index, exists := workstream.nodeIndex[nodeID]; exists {
		return nodeID, projector.advanceNode(context, spec, index)
	}
	return nodeID, projector.createNode(context, spec, nodeID)
}

func resolveNodeID(spec nodeSpec) (string, error) {
	if spec.nodeID != "" {
		return spec.nodeID, nil
	}
	return SemanticNodeID(spec.identity, spec.sourceID)
}

func (projector *DirectorGraphProjector) createNode(context factContext, spec nodeSpec, nodeID string) error {
	runID := spec.runID
	if runID == nil {
		runID = context.runID
	}
	node := SemanticNode{
		ID:             nodeID,
		Kind:           spec.kind,
		WorkstreamID:   context.workstream.id,
		RunID:          copyOptionalString(runID),
		Actor:          spec.actor,
		Status:         spec.status,
		PublicSummary:  boundSummary(spec.summary),
		EvidenceClass:  spec.evidence,
		SourceEventIDs: appendUniqueStrings([]string{context.eventID}, spec.extraSourceEventIDs...),
		ArtifactIDs:    appendUniqueStrings(nil, spec.artifactIDs...),
		CreatedAt:      context.emittedAt,
		UpdatedAt:      context.emittedAt,
		CompletedAt:    completionTimestamp(spec.status, nil, context.emittedAt),
		Interpretation: spec.interpretation,
	}
	if err := ValidateSemanticNode(node, projector.liveAuthority()); err != nil {
		return err
	}
	workstream := context.workstream
	workstream.nodeIndex[nodeID] = len(workstream.nodes)
	workstream.nodes = append(workstream.nodes, node)
	if _, recorded := projector.nodeBySourceEvent[context.eventID]; !recorded {
		projector.nodeBySourceEvent[context.eventID] = nodeID
	}
	if spec.chain {
		if err := projector.chainFollowedBy(context, node); err != nil {
			return err
		}
	}
	projector.observe(workstream, node)
	return nil
}

func (projector *DirectorGraphProjector) advanceNode(context factContext, spec nodeSpec, index int) error {
	workstream := context.workstream
	previous := workstream.nodes[index]
	next := previous
	next.Status = spec.status
	next.UpdatedAt = context.emittedAt
	next.SourceEventIDs = appendUniqueStrings(previous.SourceEventIDs, append([]string{context.eventID}, spec.extraSourceEventIDs...)...)
	next.ArtifactIDs = appendUniqueStrings(previous.ArtifactIDs, spec.artifactIDs...)
	next.CompletedAt = completionTimestamp(spec.status, previous.CompletedAt, context.emittedAt)
	if strings.TrimSpace(spec.summary) != "" {
		next.PublicSummary = boundSummary(spec.summary)
	}
	if err := ValidateSemanticNodeUpdate(previous, next); err != nil {
		return err
	}
	if err := ValidateSemanticNode(next, projector.liveAuthority()); err != nil {
		return err
	}
	workstream.nodes[index] = next
	projector.nodeBySourceEvent[context.eventID] = next.ID
	projector.observe(workstream, next)
	return nil
}

// observe records the bookkeeping edge derivation depends on: what the next
// visible fact follows, and which unresolved failure a later recovery attaches
// to.
func (projector *DirectorGraphProjector) observe(workstream *projectedWorkstream, node SemanticNode) {
	workstream.lastNodeID = node.ID
	if node.RunID != nil {
		workstream.lastRunNodeID[*node.RunID] = node.ID
	}
	if node.Status == SemanticNodeStatusFailed || node.Status == SemanticNodeStatusCancelled || node.Kind == SemanticNodeBlocked {
		workstream.recoveryAnchor = node.ID
	}
}

// chainFollowedBy orders visible facts. Inside an active run the chain follows
// that run; otherwise it follows the workstream, which is what keeps a
// Director decision or a resource request connected to the goal that caused it.
func (projector *DirectorGraphProjector) chainFollowedBy(context factContext, node SemanticNode) error {
	from := context.workstream.lastNodeID
	if node.RunID != nil {
		if runLast, found := context.workstream.lastRunNodeID[*node.RunID]; found {
			from = runLast
		}
	}
	return projector.addEdge(context, SemanticEdgeFollowedBy, from, context.workstream.id, node.ID)
}

// addEdge records one typed relationship. An edge to a node that does not exist
// yet, or from a fact to itself, is not an error: a mapping rule states the
// relationships a fact may create, never the ones it must.
func (projector *DirectorGraphProjector) addEdge(
	context factContext,
	kind SemanticEdgeKind,
	fromNodeID string,
	toWorkstreamID string,
	toNodeID string,
) error {
	if fromNodeID == "" || toNodeID == "" || fromNodeID == toNodeID {
		return nil
	}
	if !containsSemanticEdgeKind(context.edgeKinds, kind) {
		return fmt.Errorf(
			"source fact %q cannot create undeclared semantic edge %q",
			context.sourceFact,
			kind,
		)
	}
	workstream := context.workstream
	if _, exists := workstream.nodeIndex[fromNodeID]; !exists {
		return fmt.Errorf("semantic edge %q starts at unknown node %q", kind, fromNodeID)
	}
	target, known := projector.workstreams[toWorkstreamID]
	if !known {
		return fmt.Errorf("semantic edge %q targets unknown workstream %q", kind, toWorkstreamID)
	}
	if _, exists := target.nodeIndex[toNodeID]; !exists {
		return fmt.Errorf("semantic edge %q ends at unknown node %q", kind, toNodeID)
	}
	edgeID := fmt.Sprintf("%s:%s->%s", kind, fromNodeID, toNodeID)
	if workstream.edgeIndex[edgeID] {
		return nil
	}
	edge := SemanticEdge{
		ID:               edgeID,
		Kind:             kind,
		FromWorkstreamID: workstream.id,
		FromNodeID:       fromNodeID,
		ToWorkstreamID:   toWorkstreamID,
		ToNodeID:         toNodeID,
		SourceEventIDs:   []string{context.eventID},
		CreatedAt:        context.emittedAt,
	}
	if err := ValidateSemanticEdge(edge, projector.liveAuthority()); err != nil {
		return err
	}
	workstream.edgeIndex[edgeID] = true
	workstream.edges = append(workstream.edges, edge)
	return nil
}

func containsSemanticEdgeKind(kinds []SemanticEdgeKind, candidate SemanticEdgeKind) bool {
	for _, kind := range kinds {
		if kind == candidate {
			return true
		}
	}
	return false
}

// recoverFrom connects the unresolved failure, cancellation, or blocked state a
// retry or recovery node addresses, then clears the anchor so one failure is
// recovered once.
func (projector *DirectorGraphProjector) recoverFrom(context factContext, recoveryNodeID string) error {
	anchor := context.workstream.recoveryAnchor
	if anchor == "" || anchor == recoveryNodeID {
		return nil
	}
	context.workstream.recoveryAnchor = ""
	return projector.addEdge(context, SemanticEdgeRecoveredBy, anchor, context.workstream.id, recoveryNodeID)
}

// resolveDelegation draws the delegated_to edge a committed decision earned once
// the work it authorized exists. A target that is not the deciding workstream or
// one of its children is a routing target, not a delegation, so no edge is made.
func (projector *DirectorGraphProjector) resolveDelegation(context factContext, targetNodeID string) error {
	remaining := projector.pendingDelegation[:0]
	for _, pending := range projector.pendingDelegation {
		if pending.targetWorkstreamID != context.workstream.id {
			remaining = append(remaining, pending)
			continue
		}
		source, known := projector.workstreams[pending.decisionWorkstreamID]
		if !known {
			continue
		}
		parent := projector.workstreamParents[pending.targetWorkstreamID]
		if parent == nil || *parent != pending.decisionWorkstreamID {
			return fmt.Errorf(
				"decision %s cannot delegate from workstream %s to non-child workstream %s",
				pending.decisionNodeID,
				pending.decisionWorkstreamID,
				pending.targetWorkstreamID,
			)
		}
		sourceContext := context
		sourceContext.workstream = source
		if err := projector.addEdge(sourceContext, SemanticEdgeDelegatedTo, pending.decisionNodeID, context.workstream.id, targetNodeID); err != nil {
			return err
		}
	}
	projector.pendingDelegation = remaining
	return nil
}

func completionTimestamp(status SemanticNodeStatus, previous *string, emittedAt string) *string {
	if !IsTerminalSemanticNodeStatus(status) {
		return nil
	}
	if previous != nil {
		return previous
	}
	completed := emittedAt
	return &completed
}

// boundSummary keeps a canvas label bounded without rewriting it. The durable
// event still owns the full text for the accessible detail surfaces.
func boundSummary(summary string) string {
	trimmed := strings.TrimSpace(summary)
	runes := []rune(trimmed)
	if len(runes) <= MaxNodePublicSummaryRunes {
		return trimmed
	}
	return strings.TrimSpace(string(runes[:MaxNodePublicSummaryRunes])) + "…"
}

func appendUniqueStrings(existing []string, additions ...string) []string {
	result := make([]string, len(existing), len(existing)+len(additions))
	copy(result, existing)
	seen := make(map[string]bool, len(result)+len(additions))
	for _, value := range result {
		seen[value] = true
	}
	for _, value := range additions {
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

// firstText returns the first candidate that carries public text, so a node
// always has a truthful label and never an empty one.
func firstText(candidates ...string) string {
	for _, candidate := range candidates {
		if strings.TrimSpace(candidate) != "" {
			return candidate
		}
	}
	return ""
}
