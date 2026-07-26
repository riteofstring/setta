package director

import (
	"fmt"
	"time"
)

// GraphAuthority is the trusted id space a projected graph may reference. The
// projector supplies it from durable Setta state, so a node cannot cite an
// invented run, artifact, or workstream.
//
// RunIDs and ArtifactIDs are optional: a nil map means the caller does not hold
// the whole id space and is not constraining it. A bounded snapshot window is
// the case that matters — it legitimately contains nodes for runs and artifacts
// outside the window, so only the projector, which sees durable state, asserts
// those id spaces.
type GraphAuthority struct {
	// KnownWorkstreams holds every workstream id a graph may name, including
	// the Director's own lane. It is always required.
	KnownWorkstreams map[string]bool
	RunIDs           map[string]bool
	ArtifactIDs      map[string]bool
}

func (authority GraphAuthority) knowsWorkstream(workstreamID string) bool {
	return authority.KnownWorkstreams[workstreamID]
}

func (authority GraphAuthority) knowsRun(runID string) bool {
	if authority.RunIDs == nil {
		return true
	}
	return authority.RunIDs[runID]
}

func (authority GraphAuthority) knowsArtifact(artifactID string) bool {
	if authority.ArtifactIDs == nil {
		return true
	}
	return authority.ArtifactIDs[artifactID]
}

// ValidateSemanticNode rejects a node that could not have been projected from
// durable Setta state.
func ValidateSemanticNode(node SemanticNode, authority GraphAuthority) error {
	if err := validateNodeCatalogValues(node); err != nil {
		return err
	}
	if err := validateNodeReferences(node, authority); err != nil {
		return err
	}
	if err := validateTrimmedText("semantic node public summary", node.PublicSummary); err != nil {
		return err
	}
	if err := requireSourceEventIDs(fmt.Sprintf("semantic node %s", node.ID), node.SourceEventIDs); err != nil {
		return err
	}
	if err := validateNodeArtifactIDs(node, authority); err != nil {
		return err
	}
	if err := validateNodeTimestamps(node); err != nil {
		return err
	}
	return validateNodeInterpretation(node)
}

func validateNodeCatalogValues(node SemanticNode) error {
	if err := validateIdentifier("semantic node id", node.ID); err != nil {
		return err
	}
	if !isSemanticNodeKind(node.Kind) {
		return fmt.Errorf("semantic node %s has unknown kind %q", node.ID, node.Kind)
	}
	if !isSemanticNodeStatus(node.Status) {
		return fmt.Errorf("semantic node %s has unknown status %q", node.ID, node.Status)
	}
	if err := ValidateSemanticNodeKindStatus(node.Kind, node.Status); err != nil {
		return fmt.Errorf("semantic node %s: %w", node.ID, err)
	}
	if !isSemanticActor(node.Actor) {
		return fmt.Errorf("semantic node %s has unknown actor %q", node.ID, node.Actor)
	}
	if !isEvidenceClass(node.EvidenceClass) {
		return fmt.Errorf("semantic node %s has unknown evidence class %q", node.ID, node.EvidenceClass)
	}
	return nil
}

func validateNodeReferences(node SemanticNode, authority GraphAuthority) error {
	if err := validateIdentifier("semantic node workstream id", node.WorkstreamID); err != nil {
		return err
	}
	if !authority.knowsWorkstream(node.WorkstreamID) {
		return fmt.Errorf("semantic node %s references unknown workstream %q", node.ID, node.WorkstreamID)
	}
	if node.RunID == nil {
		return nil
	}
	if err := validateIdentifier("semantic node run id", *node.RunID); err != nil {
		return err
	}
	if !authority.knowsRun(*node.RunID) {
		return fmt.Errorf("semantic node %s references unknown run %q", node.ID, *node.RunID)
	}
	return nil
}

func validateNodeArtifactIDs(node SemanticNode, authority GraphAuthority) error {
	if node.ArtifactIDs == nil {
		return fmt.Errorf("semantic node %s artifact ids must be an array, not null", node.ID)
	}
	seen := make(map[string]bool, len(node.ArtifactIDs))
	for index, artifactID := range node.ArtifactIDs {
		if err := validateIdentifier(fmt.Sprintf("semantic node %s artifact id %d", node.ID, index), artifactID); err != nil {
			return err
		}
		if seen[artifactID] {
			return fmt.Errorf("semantic node %s repeats artifact id %q", node.ID, artifactID)
		}
		seen[artifactID] = true
		if !authority.knowsArtifact(artifactID) {
			return fmt.Errorf("semantic node %s references unknown artifact %q", node.ID, artifactID)
		}
	}
	if node.Kind == SemanticNodeArtifact && len(node.ArtifactIDs) == 0 {
		return fmt.Errorf("semantic node %s is an artifact node without an artifact id", node.ID)
	}
	return nil
}

func validateNodeTimestamps(node SemanticNode) error {
	if err := validateTimestamp("semantic node created at", node.CreatedAt); err != nil {
		return err
	}
	if err := validateTimestamp("semantic node updated at", node.UpdatedAt); err != nil {
		return err
	}
	if err := validateTimestampOrder("semantic node timestamp", node.CreatedAt, node.UpdatedAt); err != nil {
		return err
	}
	if err := validateOptionalTimestamp("semantic node completed at", node.CompletedAt); err != nil {
		return err
	}
	terminal := IsTerminalSemanticNodeStatus(node.Status)
	if terminal != (node.CompletedAt != nil) {
		return fmt.Errorf("semantic node %s completion timestamp does not match status %q", node.ID, node.Status)
	}
	if node.CompletedAt != nil {
		if err := validateTimestampOrder("semantic node completion timestamp", node.CreatedAt, *node.CompletedAt); err != nil {
			return err
		}
		if err := validateTimestampOrder("semantic node post-completion update timestamp", *node.CompletedAt, node.UpdatedAt); err != nil {
			return err
		}
	}
	return nil
}

func validateNodeInterpretation(node SemanticNode) error {
	interpreted := node.EvidenceClass == EvidenceDirectorInterpretation
	if interpreted != (node.Interpretation != nil) {
		return fmt.Errorf(
			"semantic node %s must carry interpretation metadata when, and only when, its evidence class is %q",
			node.ID,
			EvidenceDirectorInterpretation,
		)
	}
	if node.Interpretation == nil {
		return nil
	}
	if err := validateInterpretationMetadata(node.ID, *node.Interpretation); err != nil {
		return err
	}
	return validateTimestampOrder(
		fmt.Sprintf("semantic node %s interpretation timestamp", node.ID),
		node.Interpretation.InterpretedAt,
		node.CreatedAt,
	)
}

// validateInterpretationMetadata enforces the provenance an interpretation owes
// the user: who concluded it, which model authored it, and when.
func validateInterpretationMetadata(label string, metadata InterpretationMetadata) error {
	switch metadata.InterpretedBy {
	case SemanticActorDirector, SemanticActorWorker:
	default:
		return fmt.Errorf("%s interpretation must be attributed to the director or a worker", label)
	}
	if err := validateTrimmedText("interpretation provider", metadata.Model.Provider); err != nil {
		return err
	}
	if err := validateTrimmedText("interpretation model", metadata.Model.Model); err != nil {
		return err
	}
	return validateTimestamp("interpretation interpreted at", metadata.InterpretedAt)
}

// ValidateSemanticNodeUpdate rejects an update that rewrites identity or
// provenance, moves a node backwards in time, or takes an impossible lifecycle
// step. Replaying the same events must reproduce the same node, so an update
// may only advance status, summary, evidence, artifacts, and timestamps.
func ValidateSemanticNodeUpdate(previous SemanticNode, next SemanticNode) error {
	if err := validateStableSemanticNodeIdentity(previous, next); err != nil {
		return err
	}
	if err := validateStableSemanticNodeProvenance(previous, next); err != nil {
		return err
	}
	if err := ValidateSemanticNodeTransition(previous.Status, next.Status); err != nil {
		return fmt.Errorf("semantic node %s: %w", previous.ID, err)
	}
	return validateMonotonicUpdate(previous, next)
}

func validateStableSemanticNodeIdentity(previous SemanticNode, next SemanticNode) error {
	if previous.ID != next.ID {
		return fmt.Errorf("semantic node id changed from %q to %q", previous.ID, next.ID)
	}
	if previous.Kind != next.Kind {
		return fmt.Errorf("semantic node %s kind changed from %q to %q", previous.ID, previous.Kind, next.Kind)
	}
	if previous.WorkstreamID != next.WorkstreamID {
		return fmt.Errorf("semantic node %s workstream changed from %q to %q", previous.ID, previous.WorkstreamID, next.WorkstreamID)
	}
	if previous.Actor != next.Actor {
		return fmt.Errorf("semantic node %s actor changed from %q to %q", previous.ID, previous.Actor, next.Actor)
	}
	if !equalOptionalString(previous.RunID, next.RunID) {
		return fmt.Errorf("semantic node %s run binding changed", previous.ID)
	}
	return nil
}

func validateStableSemanticNodeProvenance(previous SemanticNode, next SemanticNode) error {
	if previous.EvidenceClass != next.EvidenceClass {
		return fmt.Errorf("semantic node %s evidence class changed from %q to %q", previous.ID, previous.EvidenceClass, next.EvidenceClass)
	}
	if previous.CreatedAt != next.CreatedAt {
		return fmt.Errorf("semantic node %s creation timestamp changed", previous.ID)
	}
	if !equalInterpretation(previous.Interpretation, next.Interpretation) {
		return fmt.Errorf("semantic node %s interpretation provenance changed", previous.ID)
	}
	if !hasStringPrefix(next.SourceEventIDs, previous.SourceEventIDs) {
		return fmt.Errorf("semantic node %s source event provenance was removed or reordered", previous.ID)
	}
	if !hasStringPrefix(next.ArtifactIDs, previous.ArtifactIDs) {
		return fmt.Errorf("semantic node %s artifact provenance was removed or reordered", previous.ID)
	}
	if previous.CompletedAt != nil && !equalOptionalString(previous.CompletedAt, next.CompletedAt) {
		return fmt.Errorf("semantic node %s completion timestamp changed", previous.ID)
	}
	return nil
}

func hasStringPrefix(values []string, prefix []string) bool {
	if len(values) < len(prefix) {
		return false
	}
	for index, value := range prefix {
		if values[index] != value {
			return false
		}
	}
	return true
}

func equalInterpretation(left *InterpretationMetadata, right *InterpretationMetadata) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func validateMonotonicUpdate(previous SemanticNode, next SemanticNode) error {
	previousUpdatedAt, err := time.Parse(time.RFC3339Nano, previous.UpdatedAt)
	if err != nil {
		return fmt.Errorf("semantic node %s previous updated at must be RFC3339: %w", previous.ID, err)
	}
	nextUpdatedAt, err := time.Parse(time.RFC3339Nano, next.UpdatedAt)
	if err != nil {
		return fmt.Errorf("semantic node %s updated at must be RFC3339: %w", previous.ID, err)
	}
	if nextUpdatedAt.Before(previousUpdatedAt) {
		return fmt.Errorf("semantic node %s updated at moved backwards", previous.ID)
	}
	return nil
}

// ValidateSemanticEdge rejects an edge whose endpoints, direction, or owning
// workstream is not authorized.
func ValidateSemanticEdge(edge SemanticEdge, authority GraphAuthority) error {
	if err := validateEdgeEndpoints(edge); err != nil {
		return err
	}
	if err := validateIdentifier("semantic edge workstream id", edge.WorkstreamID); err != nil {
		return err
	}
	if !authority.knowsWorkstream(edge.WorkstreamID) {
		return fmt.Errorf("semantic edge %s references unknown workstream %q", edge.ID, edge.WorkstreamID)
	}
	if err := requireSourceEventIDs(fmt.Sprintf("semantic edge %s", edge.ID), edge.SourceEventIDs); err != nil {
		return err
	}
	return validateTimestamp("semantic edge created at", edge.CreatedAt)
}

func validateEdgeEndpoints(edge SemanticEdge) error {
	if err := validateIdentifier("semantic edge id", edge.ID); err != nil {
		return err
	}
	if !isSemanticEdgeKind(edge.Kind) {
		return fmt.Errorf("semantic edge %s has unknown kind %q", edge.ID, edge.Kind)
	}
	if err := validateIdentifier("semantic edge from node id", edge.FromNodeID); err != nil {
		return err
	}
	if err := validateIdentifier("semantic edge to node id", edge.ToNodeID); err != nil {
		return err
	}
	if edge.FromNodeID == edge.ToNodeID {
		return fmt.Errorf("semantic edge %s connects node %q to itself", edge.ID, edge.FromNodeID)
	}
	return nil
}

// ValidateWorkstreamGraph rejects a projected graph with duplicate ids, foreign
// nodes, dangling endpoints, or detail-level violations.
func ValidateWorkstreamGraph(graph WorkstreamGraph, authority GraphAuthority) error {
	if err := validateWorkstreamGraphEnvelope(graph, authority); err != nil {
		return err
	}
	nodeIDs, err := validateWorkstreamGraphNodes(graph, authority)
	if err != nil {
		return err
	}
	return validateGraphEdges(graph, authority, nodeIDs)
}

func validateWorkstreamGraphEnvelope(graph WorkstreamGraph, authority GraphAuthority) error {
	if err := validateIdentifier("workstream graph workstream id", graph.WorkstreamID); err != nil {
		return err
	}
	if !authority.knowsWorkstream(graph.WorkstreamID) {
		return fmt.Errorf("workstream graph references unknown workstream %q", graph.WorkstreamID)
	}
	if !isWorkstreamDetailLevel(graph.DetailLevel) {
		return fmt.Errorf("workstream graph %s has unknown detail level %q", graph.WorkstreamID, graph.DetailLevel)
	}
	if graph.Nodes == nil || graph.Edges == nil {
		return fmt.Errorf("workstream graph %s nodes and edges must be arrays, not null", graph.WorkstreamID)
	}
	if graph.DetailLevel == WorkstreamDetailBackground && (len(graph.Nodes) > 0 || len(graph.Edges) > 0) {
		return fmt.Errorf("background workstream %s must render aggregate status only", graph.WorkstreamID)
	}
	return nil
}

func validateWorkstreamGraphNodes(
	graph WorkstreamGraph,
	authority GraphAuthority,
) (map[string]bool, error) {
	nodeIDs := make(map[string]bool, len(graph.Nodes))
	for _, node := range graph.Nodes {
		if err := ValidateSemanticNode(node, authority); err != nil {
			return nil, err
		}
		if node.WorkstreamID != graph.WorkstreamID {
			return nil, fmt.Errorf("workstream graph %s contains node %s owned by %q", graph.WorkstreamID, node.ID, node.WorkstreamID)
		}
		if nodeIDs[node.ID] {
			return nil, fmt.Errorf("workstream graph %s repeats node id %q", graph.WorkstreamID, node.ID)
		}
		nodeIDs[node.ID] = true
	}
	return nodeIDs, nil
}

func validateGraphEdges(graph WorkstreamGraph, authority GraphAuthority, nodeIDs map[string]bool) error {
	edgeIDs := make(map[string]bool, len(graph.Edges))
	for _, edge := range graph.Edges {
		if err := ValidateSemanticEdge(edge, authority); err != nil {
			return err
		}
		if edgeIDs[edge.ID] {
			return fmt.Errorf("workstream graph %s repeats edge id %q", graph.WorkstreamID, edge.ID)
		}
		edgeIDs[edge.ID] = true
		if edge.WorkstreamID != graph.WorkstreamID {
			return fmt.Errorf("workstream graph %s contains edge %s owned by %q", graph.WorkstreamID, edge.ID, edge.WorkstreamID)
		}
		if !nodeIDs[edge.FromNodeID] {
			return fmt.Errorf("workstream graph %s edge %s starts at unknown node %q", graph.WorkstreamID, edge.ID, edge.FromNodeID)
		}
		if !nodeIDs[edge.ToNodeID] {
			return fmt.Errorf("workstream graph %s edge %s ends at unknown node %q", graph.WorkstreamID, edge.ID, edge.ToNodeID)
		}
	}
	return nil
}

func equalOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
