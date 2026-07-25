package director

import "testing"

const (
	testParentWorkstream = "workstream-parent"
	testOtherWorkstream  = "workstream-other"
)

func testAuthority() GraphAuthority {
	return GraphAuthority{
		KnownWorkstreams: map[string]bool{
			testParentWorkstream: true,
			testOtherWorkstream:  true,
		},
		RunIDs:      map[string]bool{"turn-1": true},
		ArtifactIDs: map[string]bool{"artifact-1": true},
	}
}

func testNode() SemanticNode {
	runID := "turn-1"
	return SemanticNode{
		ID:             "action:activity-1",
		Kind:           SemanticNodeAction,
		WorkstreamID:   testParentWorkstream,
		RunID:          &runID,
		Actor:          SemanticActorWorker,
		Status:         SemanticNodeStatusActive,
		PublicSummary:  "Running the repository test suite",
		EvidenceClass:  EvidenceRuntimeFact,
		SourceEventIDs: []string{"event-1"},
		ArtifactIDs:    []string{},
		CreatedAt:      "2026-07-24T12:00:00Z",
		UpdatedAt:      "2026-07-24T12:00:01Z",
	}
}

func TestSemanticNodeRequiresProvenance(t *testing.T) {
	authority := testAuthority()
	if err := ValidateSemanticNode(testNode(), authority); err != nil {
		t.Fatalf("a well-formed node was rejected: %v", err)
	}

	node := testNode()
	node.SourceEventIDs = nil
	if err := ValidateSemanticNode(node, authority); err == nil {
		t.Fatal("a node without source evidence must be rejected")
	}

	node = testNode()
	node.RunID = stringPointer("turn-invented")
	if err := ValidateSemanticNode(node, authority); err == nil {
		t.Fatal("a node must not cite an invented run")
	}

	node = testNode()
	node.ArtifactIDs = []string{"artifact-invented"}
	if err := ValidateSemanticNode(node, authority); err == nil {
		t.Fatal("a node must not cite an invented artifact")
	}

	node = testNode()
	node.WorkstreamID = "workstream-unknown"
	if err := ValidateSemanticNode(node, authority); err == nil {
		t.Fatal("a node must not cite an unknown workstream")
	}

	node = testNode()
	node.Kind = SemanticNodeArtifact
	node.Status = SemanticNodeStatusSucceeded
	node.CompletedAt = stringPointer("2026-07-24T12:00:02Z")
	if err := ValidateSemanticNode(node, authority); err == nil {
		t.Fatal("an artifact node without an artifact id must be rejected")
	}
}

func TestTerminalNodesCarryCompletionTimestamps(t *testing.T) {
	authority := testAuthority()
	node := testNode()
	node.Status = SemanticNodeStatusSucceeded
	if err := ValidateSemanticNode(node, authority); err == nil {
		t.Fatal("a terminal node must record when it completed")
	}
	node.CompletedAt = stringPointer("2026-07-24T12:00:02Z")
	node.UpdatedAt = "2026-07-24T12:00:02Z"
	if err := ValidateSemanticNode(node, authority); err != nil {
		t.Fatalf("a completed node was rejected: %v", err)
	}
	node.Status = SemanticNodeStatusActive
	if err := ValidateSemanticNode(node, authority); err == nil {
		t.Fatal("an active node must not claim a completion timestamp")
	}
}

func TestInterpretationsAreNeverPresentedAsRuntimeFacts(t *testing.T) {
	authority := testAuthority()
	confidence := 0.7
	node := testNode()
	node.Kind = SemanticNodeMilestone
	node.Actor = SemanticActorDirector
	node.Interpretation = &InterpretationMetadata{
		InterpretedBy: SemanticActorDirector,
		Model:         InterpretationModelIdentity{Provider: "codex", Model: "gpt-5.1-codex", RuntimeID: "runtime-1"},
		Confidence:    &confidence,
		InterpretedAt: "2026-07-24T12:00:00Z",
	}
	if err := ValidateSemanticNode(node, authority); err == nil {
		t.Fatal("interpretation metadata on a runtime fact must be rejected")
	}

	node.EvidenceClass = EvidenceDirectorInterpretation
	if err := ValidateSemanticNode(node, authority); err != nil {
		t.Fatalf("a well-formed interpretation was rejected: %v", err)
	}

	missing := node
	missing.Interpretation = nil
	if err := ValidateSemanticNode(missing, authority); err == nil {
		t.Fatal("an interpretation without metadata must be rejected")
	}

	unattributed := node
	metadata := *node.Interpretation
	metadata.Model.RuntimeID = ""
	unattributed.Interpretation = &metadata
	if err := ValidateSemanticNode(unattributed, authority); err == nil {
		t.Fatal("an interpretation without runtime identity must be rejected")
	}

	overconfident := node
	outOfRange := 1.5
	confident := *node.Interpretation
	confident.Confidence = &outOfRange
	overconfident.Interpretation = &confident
	if err := ValidateSemanticNode(overconfident, authority); err == nil {
		t.Fatal("a confidence outside [0,1] must be rejected")
	}
}

func TestSemanticNodeUpdatesPreserveIdentity(t *testing.T) {
	previous := testNode()
	next := testNode()
	next.Status = SemanticNodeStatusSucceeded
	next.UpdatedAt = "2026-07-24T12:00:05Z"
	next.CompletedAt = stringPointer("2026-07-24T12:00:05Z")
	if err := ValidateSemanticNodeUpdate(previous, next); err != nil {
		t.Fatalf("a legal advance was rejected: %v", err)
	}

	rewritten := next
	rewritten.Kind = SemanticNodeInvestigation
	if err := ValidateSemanticNodeUpdate(previous, rewritten); err == nil {
		t.Fatal("a node must not change kind")
	}

	moved := next
	moved.WorkstreamID = testOtherWorkstream
	if err := ValidateSemanticNodeUpdate(previous, moved); err == nil {
		t.Fatal("a node must not move between workstreams")
	}

	reattributed := next
	reattributed.Actor = SemanticActorDirector
	if err := ValidateSemanticNodeUpdate(previous, reattributed); err == nil {
		t.Fatal("a node must not change actor")
	}

	replacedSources := next
	replacedSources.SourceEventIDs = []string{"event-replacement"}
	if err := ValidateSemanticNodeUpdate(previous, replacedSources); err == nil {
		t.Fatal("a node must not replace its source provenance")
	}

	removedArtifact := next
	previousWithArtifact := previous
	previousWithArtifact.ArtifactIDs = []string{"artifact-1"}
	if err := ValidateSemanticNodeUpdate(previousWithArtifact, removedArtifact); err == nil {
		t.Fatal("a node must not remove artifact provenance")
	}

	backwards := next
	backwards.UpdatedAt = "2026-07-24T11:59:00Z"
	if err := ValidateSemanticNodeUpdate(previous, backwards); err == nil {
		t.Fatal("a node must not move backwards in time")
	}

	resurrected := next
	resurrected.Status = SemanticNodeStatusActive
	resurrected.CompletedAt = nil
	if err := ValidateSemanticNodeUpdate(next, resurrected); err == nil {
		t.Fatal("a succeeded node must not reactivate")
	}

	recompleted := next
	recompleted.UpdatedAt = "2026-07-24T12:00:06Z"
	recompleted.CompletedAt = stringPointer("2026-07-24T12:00:06Z")
	if err := ValidateSemanticNodeUpdate(next, recompleted); err == nil {
		t.Fatal("a terminal node must not rewrite when it completed")
	}
}

// TestEdgesBelongToOneAuthorizedWorkstream proves an edge is a relationship
// inside one workstream: it must name a workstream the authority knows, and it
// cannot connect a node to itself.
func TestEdgesBelongToOneAuthorizedWorkstream(t *testing.T) {
	authority := testAuthority()
	edge := SemanticEdge{
		ID:             "edge-1",
		Kind:           SemanticEdgeFollowedBy,
		WorkstreamID:   testParentWorkstream,
		FromNodeID:     "node-a",
		ToNodeID:       "node-b",
		SourceEventIDs: []string{"event-1"},
		CreatedAt:      "2026-07-24T12:00:00Z",
	}
	if err := ValidateSemanticEdge(edge, authority); err != nil {
		t.Fatalf("a workstream-local edge was rejected: %v", err)
	}

	unknown := edge
	unknown.WorkstreamID = "workstream-invented"
	if err := ValidateSemanticEdge(unknown, authority); err == nil {
		t.Fatal("an edge must not name a workstream the authority does not know")
	}

	selfEdge := edge
	selfEdge.ToNodeID = selfEdge.FromNodeID
	if err := ValidateSemanticEdge(selfEdge, authority); err == nil {
		t.Fatal("an edge must not connect a node to itself")
	}
}

func TestWorkstreamGraphRejectsDanglingAndForeignContent(t *testing.T) {
	authority := testAuthority()
	node := testNode()
	graph := WorkstreamGraph{
		WorkstreamID: testParentWorkstream,
		DetailLevel:  WorkstreamDetailSelected,
		Nodes:        []SemanticNode{node},
		Edges:        []SemanticEdge{},
	}
	if err := ValidateWorkstreamGraph(graph, authority); err != nil {
		t.Fatalf("a single-node graph was rejected: %v", err)
	}

	dangling := graph
	dangling.Edges = []SemanticEdge{{
		ID:             "edge-1",
		Kind:           SemanticEdgeFollowedBy,
		WorkstreamID:   testParentWorkstream,
		FromNodeID:     node.ID,
		ToNodeID:       "node-missing",
		SourceEventIDs: []string{"event-1"},
		CreatedAt:      "2026-07-24T12:00:00Z",
	}}
	if err := ValidateWorkstreamGraph(dangling, authority); err == nil {
		t.Fatal("an edge to a missing node must be rejected")
	}

	duplicated := graph
	duplicated.Nodes = []SemanticNode{node, node}
	if err := ValidateWorkstreamGraph(duplicated, authority); err == nil {
		t.Fatal("a repeated node id must be rejected")
	}

	background := graph
	background.DetailLevel = WorkstreamDetailBackground
	if err := ValidateWorkstreamGraph(background, authority); err == nil {
		t.Fatal("a background workstream must render aggregate status only")
	}
}
