package semanticgraph

import (
	"context"
	"testing"
)

func TestServiceUserEditsNodesAndEdges(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	appendAttachmentTargetNode(t, store, "node_edit")

	renamed := renameSemanticNodeForTest(t, service, "node_edit", "Renamed semantic node")
	if renamed.NodeDetail == nil || renamed.NodeDetail.Node.Label != "Renamed semantic node" {
		t.Fatalf("renamed detail = %+v, want updated label", renamed.NodeDetail)
	}
	updateSemanticNodeForTest(t, service, "node_edit")
	promoteSemanticNodeForTest(t, service, "node_edit")
	dismissSemanticNodeForTest(t, service, "node_edit")

	createConstraintNodeForTest(t, service, "node_constraint")
	createConstraintEdgeForTest(t, service, "edge_constraint", "node_constraint", "node_edit")
	updateSemanticEdgeForTest(t, service, "edge_constraint")
	removeSemanticEdgeForTest(t, service, "edge_constraint")

	detail := readSemanticNodeDetailForTest(t, service, "node_edit")
	if detail.Node.Kind != NodeKindConstraint || !detail.Node.Dismissed || !detail.Node.Promoted {
		t.Fatalf("edited node = %+v, want constraint dismissed promoted", detail.Node)
	}
	history := readSemanticHistoryForTest(t, service, "node_edit")
	assertHistoryContains(t, history, EventNodeRenamed, EventNodeUpdated, EventNodePromoted, EventNodeDismissed)
}

func TestServiceSteeringDirectiveLifecycle(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	appendAttachmentTargetNode(t, store, "node_edit")

	focus, err := service.CreateSteeringDirective(context.Background(), CreateSteeringDirectiveInput{
		WorkspaceID:    testWorkspaceID,
		TargetEntityID: "node_edit",
		Kind:           SteeringKindFocus,
		Instruction:    "Focus agent here",
		Scope:          SteeringScopeSession,
		Actor:          testOperationActor(),
	})
	if err != nil {
		t.Fatalf("create focus steering directive: %v", err)
	}
	directiveID := focus.NodeDetail.SteeringDirectives[0].ID
	completed := SteeringStatusCompleted
	completedResult, err := service.UpdateSteeringDirective(context.Background(), UpdateSteeringDirectiveInput{
		WorkspaceID: testWorkspaceID,
		DirectiveID: directiveID,
		Status:      &completed,
		Actor:       testOperationActor(),
	})
	if err != nil {
		t.Fatalf("complete steering directive: %v", err)
	}
	assertCompletedFocusDirective(t, completedResult.NodeDetail.SteeringDirectives[0])
	history := readSemanticHistoryForTest(t, service, "node_edit")
	assertHistoryContains(t, history, EventSteeringCreated, EventSteeringUpdated)
}

func TestServiceSplitReassignsSelectedRecords(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	seedSemanticReassignmentFixture(t, store)

	split := splitSemanticSourceWithReassignments(t, service)
	if split.NodeDetail == nil || !split.NodeDetail.Node.Dismissed || len(split.NodeDetail.Node.SplitIntoNodeIDs) != 2 {
		t.Fatalf("split source detail = %+v, want dismissed source with two children", split.NodeDetail)
	}
	assertChildAReassignments(t, service)
	assertChildBReassignments(t, service, split.Graph.LayoutPositions)
}

func TestServiceMergePreservesHistoricalSourceRecords(t *testing.T) {
	store := newTestStore(t)
	service := newAssociationTestService(t, store, t.TempDir(), nil, nil)
	seedSemanticReassignmentFixture(t, store)
	splitSemanticSourceWithReassignments(t, service)

	merged, err := service.MergeNodes(context.Background(), MergeSemanticNodesInput{
		WorkspaceID:   testWorkspaceID,
		SourceNodeIDs: []string{"node_child_a", "node_child_b"},
		TargetNode:    SemanticNodeSeedInput{NodeID: "node_merged", Kind: NodeKindDecision, Label: "Merged decision"},
		Actor:         testOperationActor(),
	})
	if err != nil {
		t.Fatalf("merge semantic nodes: %v", err)
	}
	if merged.NodeDetail == nil || merged.NodeDetail.Node.ID != "node_merged" {
		t.Fatalf("merged detail = %+v, want merged target", merged.NodeDetail)
	}
	assertMergedChildState(t, service)
	assertSourceHistoricalRecordsPreserved(t, service)
}

func renameSemanticNodeForTest(t *testing.T, service *Service, nodeID string, label string) SemanticMutationResult {
	t.Helper()
	result, err := service.RenameNode(context.Background(), RenameSemanticNodeInput{
		WorkspaceID: testWorkspaceID,
		NodeID:      nodeID,
		Label:       label,
		Actor:       testOperationActor(),
	})
	if err != nil {
		t.Fatalf("rename semantic node: %v", err)
	}
	return result
}

func updateSemanticNodeForTest(t *testing.T, service *Service, nodeID string) {
	t.Helper()
	kind := NodeKindConstraint
	summary := "Updated by explicit user operation"
	_, err := service.UpdateNode(context.Background(), UpdateSemanticNodeInput{
		WorkspaceID: testWorkspaceID,
		NodeID:      nodeID,
		Kind:        &kind,
		Summary:     &summary,
		Actor:       testOperationActor(),
	})
	if err != nil {
		t.Fatalf("update semantic node: %v", err)
	}
}

func promoteSemanticNodeForTest(t *testing.T, service *Service, nodeID string) {
	t.Helper()
	_, err := service.PromoteNode(context.Background(), SemanticNodeOperationInput{
		WorkspaceID: testWorkspaceID,
		NodeID:      nodeID,
		Actor:       testOperationActor(),
	})
	if err != nil {
		t.Fatalf("promote semantic node: %v", err)
	}
}

func dismissSemanticNodeForTest(t *testing.T, service *Service, nodeID string) {
	t.Helper()
	_, err := service.DismissNode(context.Background(), SemanticNodeOperationInput{
		WorkspaceID: testWorkspaceID,
		NodeID:      nodeID,
		Actor:       testOperationActor(),
	})
	if err != nil {
		t.Fatalf("dismiss semantic node: %v", err)
	}
}

func createConstraintNodeForTest(t *testing.T, service *Service, nodeID string) {
	t.Helper()
	constraint, err := service.CreateUserNode(context.Background(), CreateSemanticNodeInput{
		WorkspaceID: testWorkspaceID,
		NodeID:      nodeID,
		Kind:        NodeKindConstraint,
		Label:       "User-authored constraint",
		Summary:     "Constraint summary",
		Actor:       testOperationActor(),
	})
	if err != nil {
		t.Fatalf("create semantic node: %v", err)
	}
	if constraint.NodeDetail == nil || constraint.NodeDetail.Node.Kind != NodeKindConstraint {
		t.Fatalf("constraint result = %+v, want constraint node detail", constraint.NodeDetail)
	}
}

func createConstraintEdgeForTest(t *testing.T, service *Service, edgeID string, fromNodeID string, toNodeID string) {
	t.Helper()
	edge, err := service.CreateUserEdge(context.Background(), CreateSemanticEdgeInput{
		WorkspaceID: testWorkspaceID,
		EdgeID:      edgeID,
		Kind:        EdgeKindConstrains,
		FromNodeID:  fromNodeID,
		ToNodeID:    toNodeID,
		Label:       "constrains",
		Summary:     "Constraint applies to edited node",
		Actor:       testOperationActor(),
	})
	if err != nil {
		t.Fatalf("create semantic edge: %v", err)
	}
	if len(edge.Graph.Edges) != 1 {
		t.Fatalf("edge graph = %+v, want one edge", edge.Graph.Edges)
	}
}

func updateSemanticEdgeForTest(t *testing.T, service *Service, edgeID string) {
	t.Helper()
	edgeSummary := "Updated edge summary"
	_, err := service.UpdateEdge(context.Background(), UpdateSemanticEdgeInput{
		WorkspaceID: testWorkspaceID,
		EdgeID:      edgeID,
		Summary:     &edgeSummary,
		Actor:       testOperationActor(),
	})
	if err != nil {
		t.Fatalf("update semantic edge: %v", err)
	}
}

func removeSemanticEdgeForTest(t *testing.T, service *Service, edgeID string) {
	t.Helper()
	_, err := service.RemoveEdge(context.Background(), SemanticEdgeOperationInput{
		WorkspaceID: testWorkspaceID,
		EdgeID:      edgeID,
		Actor:       testOperationActor(),
	})
	if err != nil {
		t.Fatalf("remove semantic edge: %v", err)
	}
}

func assertCompletedFocusDirective(t *testing.T, directive SemanticSteeringDirective) {
	t.Helper()
	if directive.Kind != SteeringKindFocus || directive.Scope != SteeringScopeSession || directive.Status != SteeringStatusCompleted || directive.CompletedAt == "" {
		t.Fatalf("completed directive = %+v, want focus/session/completed", directive)
	}
}

func seedSemanticReassignmentFixture(t *testing.T, store *Store) {
	t.Helper()
	appendAttachmentTargetNode(t, store, "node_source")
	appendAttachmentTargetNode(t, store, "node_support")
	appendTestEvent(t, store, EventEdgeCreated, "edge_source", edgeCreatedPayload{
		EdgeID:     "edge_source",
		Kind:       EdgeKindSupports,
		FromNodeID: "node_source",
		ToNodeID:   "node_support",
		Label:      "supports",
		Summary:    "Original support edge",
	})
	appendTestEvent(t, store, EventEvidenceAttached, "node_source", evidenceAttachedPayload{
		AnchorID:       "evidence_source",
		TargetEntityID: "node_source",
		SourceKind:     EvidenceSourceDocument,
		Path:           "docs/plan.md",
		Summary:        "Original source evidence",
	})
	appendTestEvent(t, store, EventActivityStarted, "node_source", activityStartedPayload{
		IntervalID:       "activity_source",
		TargetEntityID:   "node_source",
		Kind:             ActivityKindValidating,
		Summary:          "Original source activity",
		SourceKind:       ActivitySourceFileRange,
		EvidenceAnchorID: "evidence_source",
		ActorKind:        ActorKindUser,
		ActorID:          "user_editor",
	})
	appendTestEvent(t, store, EventActivityEnded, "node_source", activityEndedPayload{IntervalID: "activity_source"})
	appendTestEvent(t, store, EventSteeringCreated, "node_source", steeringCreatedPayload{
		DirectiveID:    "steering_source",
		TargetEntityID: "node_source",
		Kind:           SteeringKindValidate,
		Instruction:    "Validate this source",
		Status:         SteeringStatusActive,
		Scope:          SteeringScopeWorkspace,
	})
	if _, err := store.UpdateLayoutPositions(context.Background(), testWorkspaceID, []SemanticLayoutPositionInput{
		{EntityID: "node_source", X: 70, Y: 90, Pinned: true},
	}, testTimestamp(40)); err != nil {
		t.Fatalf("seed layout position: %v", err)
	}
}

func splitSemanticSourceWithReassignments(t *testing.T, service *Service) SemanticMutationResult {
	t.Helper()
	split, err := service.SplitNode(context.Background(), SplitSemanticNodeInput{
		WorkspaceID:  testWorkspaceID,
		SourceNodeID: "node_source",
		Nodes: []SemanticNodeSeedInput{
			{NodeID: "node_child_a", Kind: NodeKindFinding, Label: "Child A"},
			{NodeID: "node_child_b", Kind: NodeKindQuestion, Label: "Child B"},
		},
		Reassignments: SemanticReassignmentInputs{
			Edges: []SemanticEdgeReassignmentInput{
				{EdgeID: "edge_source", TargetEdgeID: "edge_child_support", FromNodeID: "node_child_a", ToNodeID: "node_support"},
			},
			Evidence: []SemanticEvidenceReassignmentInput{
				{AnchorID: "evidence_source", TargetNodeID: "node_child_a"},
			},
			Activity: []SemanticActivityReassignmentInput{
				{ActivityIntervalID: "activity_source", TargetNodeID: "node_child_b"},
			},
			Steering: []SemanticSteeringReassignmentInput{
				{DirectiveID: "steering_source", TargetNodeID: "node_child_a"},
			},
			Layout: []SemanticLayoutReassignmentInput{
				{EntityID: "node_source", TargetEntityID: "node_child_b"},
			},
		},
		Actor: testOperationActor(),
	})
	if err != nil {
		t.Fatalf("split semantic node: %v", err)
	}
	return split
}

func assertChildAReassignments(t *testing.T, service *Service) {
	t.Helper()
	childA := readSemanticNodeDetailForTest(t, service, "node_child_a")
	if len(childA.Evidence) != 1 || childA.Evidence[0].ReassignedFromAnchorID != "evidence_source" {
		t.Fatalf("child A evidence = %+v, want reassigned evidence", childA.Evidence)
	}
	if len(childA.SteeringDirectives) != 1 || childA.SteeringDirectives[0].ReassignedFromDirectiveID != "steering_source" {
		t.Fatalf("child A steering = %+v, want reassigned steering", childA.SteeringDirectives)
	}
	if len(childA.OutgoingEdges) != 1 || childA.OutgoingEdges[0].ID != "edge_child_support" {
		t.Fatalf("child A outgoing edges = %+v, want copied edge", childA.OutgoingEdges)
	}
}

func assertChildBReassignments(t *testing.T, service *Service, positions []SemanticLayoutPosition) {
	t.Helper()
	childB := readSemanticNodeDetailForTest(t, service, "node_child_b")
	if len(childB.Activity) != 1 || childB.Activity[0].ReassignedFromIntervalID != "activity_source" || childB.Activity[0].EndedAt == "" {
		t.Fatalf("child B activity = %+v, want ended reassigned activity", childB.Activity)
	}
	childPosition := semanticLayoutPositionByEntityID(t, positions, "node_child_b")
	if childPosition.X != 70 || childPosition.Y != 90 || !childPosition.Pinned {
		t.Fatalf("child layout = %+v, want copied pinned layout", childPosition)
	}
}

func assertMergedChildState(t *testing.T, service *Service) {
	t.Helper()
	graph, err := service.ReadGraph(context.Background(), testWorkspaceID)
	if err != nil {
		t.Fatalf("read graph after merge: %v", err)
	}
	child := semanticNodeByID(t, graph.Nodes, "node_child_a")
	if child.MergedIntoNodeID != "node_merged" || !child.Dismissed {
		t.Fatalf("merged child = %+v, want dismissed into node_merged", child)
	}
}

func assertSourceHistoricalRecordsPreserved(t *testing.T, service *Service) {
	t.Helper()
	source := readSemanticNodeDetailForTest(t, service, "node_source")
	if len(source.Evidence) != 1 || len(source.Activity) != 1 || len(source.SteeringDirectives) != 1 {
		t.Fatalf("source historical records moved unexpectedly: %+v", source)
	}
}

func readSemanticNodeDetailForTest(t *testing.T, service *Service, nodeID string) SemanticNodeDetail {
	t.Helper()
	detail, ok, err := service.ReadNodeDetail(context.Background(), testWorkspaceID, nodeID)
	if err != nil {
		t.Fatalf("read semantic node detail: %v", err)
	}
	if !ok {
		t.Fatalf("semantic node %s missing", nodeID)
	}
	return detail
}

func readSemanticHistoryForTest(t *testing.T, service *Service, nodeID string) SemanticEventHistory {
	t.Helper()
	history, err := service.ReadEventHistory(context.Background(), testWorkspaceID, nodeID, 0, 50)
	if err != nil {
		t.Fatalf("read edited history: %v", err)
	}
	return history
}

func testOperationActor() SemanticAttachmentActor {
	return SemanticAttachmentActor{ActorKind: ActorKindUser, ActorID: "user_editor"}
}

func assertHistoryContains(t *testing.T, history SemanticEventHistory, eventTypes ...SemanticEventType) {
	t.Helper()
	seen := map[SemanticEventType]bool{}
	for _, event := range history.Events {
		seen[event.EventType] = true
	}
	for _, eventType := range eventTypes {
		if !seen[eventType] {
			t.Fatalf("history missing %s in %+v", eventType, history.Events)
		}
	}
}
