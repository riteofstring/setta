package semanticgraph

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

const (
	testWorkspaceID = "workspace_semantic_test"
	testActorID     = "user_semantic_test"
)

func TestStoreAppendsEventsAndUpdatesProjectionsTransactionally(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	first := appendTestEvent(t, store, EventNodeCreated, "node_a", nodeCreatedPayload{
		NodeID:  "node_a",
		Kind:    NodeKindConcept,
		Label:   "API contract",
		Summary: "Initial summary",
	})
	appendTestEvent(t, store, EventNodeUpdated, "node_a", nodeUpdatedPayload{
		NodeID:  "node_a",
		Summary: pointerTo("Updated summary"),
	})
	appendTestEvent(t, store, EventNodeRenamed, "node_a", nodeRenamedPayload{
		NodeID: "node_a",
		Label:  "Semantic API contract",
	})
	appendTestEvent(t, store, EventNodeCreated, "node_b", nodeCreatedPayload{
		NodeID: "node_b",
		Kind:   NodeKindFinding,
		Label:  "Renderer remains deferred",
	})
	appendTestEvent(t, store, EventEdgeCreated, "edge_ab", edgeCreatedPayload{
		EdgeID:     "edge_ab",
		Kind:       EdgeKindSupports,
		FromNodeID: "node_b",
		ToNodeID:   "node_a",
		Label:      "supports",
	})
	appendTestEvent(t, store, EventEdgeUpdated, "edge_ab", edgeUpdatedPayload{
		EdgeID:  "edge_ab",
		Summary: pointerTo("Projection edge update"),
	})

	graph, err := store.ReadGraph(ctx, testWorkspaceID)
	if err != nil {
		t.Fatalf("read graph: %v", err)
	}
	node := semanticNodeByID(t, graph.Nodes, "node_a")
	if node.Label != "Semantic API contract" || node.Summary != "Updated summary" {
		t.Fatalf("node projection = label %q summary %q, want renamed updated node", node.Label, node.Summary)
	}
	edge := semanticEdgeByID(t, graph.Edges, "edge_ab")
	if edge.Summary != "Projection edge update" {
		t.Fatalf("edge summary = %q, want Projection edge update", edge.Summary)
	}
	if first.LogicalClock != 1 {
		t.Fatalf("first logical clock = %d, want 1", first.LogicalClock)
	}

	badEvent := testEvent(t, "event_bad_edge", EventEdgeCreated, "edge_missing", edgeCreatedPayload{
		EdgeID:     "edge_missing",
		Kind:       EdgeKindTouches,
		FromNodeID: "node_a",
		ToNodeID:   "node_missing",
	})
	if _, err := store.AppendEvent(ctx, badEvent); err == nil {
		t.Fatal("append edge to missing node succeeded, want projection error")
	}
	history, err := store.ReadEventHistory(ctx, testWorkspaceID, "", 0, 20)
	if err != nil {
		t.Fatalf("read event history: %v", err)
	}
	if len(history.Events) != 6 {
		t.Fatalf("history event count = %d, want 6 committed events", len(history.Events))
	}
	graph, err = store.ReadGraph(ctx, testWorkspaceID)
	if err != nil {
		t.Fatalf("read graph after failed append: %v", err)
	}
	if len(graph.Edges) != 1 {
		t.Fatalf("edge count after failed append = %d, want 1", len(graph.Edges))
	}
}

func TestStoreRebuildsProjectionsFromEventLog(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	appendTestEvent(t, store, EventNodeCreated, "node_a", nodeCreatedPayload{
		NodeID: "node_a",
		Kind:   NodeKindConcept,
		Label:  "Source",
	})
	appendTestEvent(t, store, EventNodeCreated, "node_b", nodeCreatedPayload{
		NodeID: "node_b",
		Kind:   NodeKindFinding,
		Label:  "Finding",
	})
	appendTestEvent(t, store, EventEdgeCreated, "edge_ab", edgeCreatedPayload{
		EdgeID:     "edge_ab",
		Kind:       EdgeKindRelatedTo,
		FromNodeID: "node_a",
		ToNodeID:   "node_b",
	})

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin projection clear: %v", err)
	}
	if err := clearSemanticProjections(ctx, tx); err != nil {
		t.Fatalf("clear projections: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit projection clear: %v", err)
	}
	empty, err := store.ReadGraph(ctx, testWorkspaceID)
	if err != nil {
		t.Fatalf("read empty graph: %v", err)
	}
	if len(empty.Nodes) != 0 || len(empty.Edges) != 0 {
		t.Fatalf("cleared graph = %+v, want empty projections", empty)
	}

	if err := store.RebuildProjections(ctx); err != nil {
		t.Fatalf("rebuild projections: %v", err)
	}
	graph, err := store.ReadGraph(ctx, testWorkspaceID)
	if err != nil {
		t.Fatalf("read rebuilt graph: %v", err)
	}
	if len(graph.Nodes) != 2 || len(graph.Edges) != 1 {
		t.Fatalf("rebuilt graph has %d nodes %d edges, want 2 nodes 1 edge", len(graph.Nodes), len(graph.Edges))
	}
}

func TestStoreProjectsSplitMergeDismissAndPromoteLineage(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	appendTestEvent(t, store, EventNodeCreated, "node_source", nodeCreatedPayload{
		NodeID: "node_source",
		Kind:   NodeKindQuestion,
		Label:  "How should the graph work?",
	})
	appendTestEvent(t, store, EventNodeSplit, "node_source", nodeSplitPayload{
		SourceNodeID: "node_source",
		Nodes: []nodeCreatedPayload{
			{NodeID: "node_split_a", Kind: NodeKindHypothesis, Label: "Event log first"},
			{NodeID: "node_split_b", Kind: NodeKindHypothesis, Label: "Projection first"},
		},
	})
	appendTestEvent(t, store, EventNodeMerged, "node_merged", nodeMergedPayload{
		SourceNodeIDs: []string{"node_split_a", "node_split_b"},
		TargetNode:    nodeCreatedPayload{NodeID: "node_merged", Kind: NodeKindDecision, Label: "Use event log with projections"},
	})
	appendTestEvent(t, store, EventNodeDismissed, "node_merged", nodeDismissedPayload{NodeID: "node_merged"})
	appendTestEvent(t, store, EventNodePromoted, "node_merged", nodePromotedPayload{NodeID: "node_merged"})

	graph, err := store.ReadGraph(ctx, testWorkspaceID)
	if err != nil {
		t.Fatalf("read graph: %v", err)
	}
	source := semanticNodeByID(t, graph.Nodes, "node_source")
	if !source.Dismissed || len(source.SplitIntoNodeIDs) != 2 {
		t.Fatalf("source lineage = dismissed %v splitInto %+v, want dismissed split into two nodes", source.Dismissed, source.SplitIntoNodeIDs)
	}
	child := semanticNodeByID(t, graph.Nodes, "node_split_a")
	if child.SplitFromNodeID != "node_source" || child.MergedIntoNodeID != "node_merged" || !child.Dismissed {
		t.Fatalf("split child lineage = %+v, want split from source and merged into target", child)
	}
	merged := semanticNodeByID(t, graph.Nodes, "node_merged")
	if !merged.Dismissed || !merged.Promoted {
		t.Fatalf("merged dismissed/promoted = %v/%v, want both true", merged.Dismissed, merged.Promoted)
	}
}

func TestStoreProjectsEvidenceActivitySteeringAndContextPacks(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	appendTestEvent(t, store, EventNodeCreated, "node_a", nodeCreatedPayload{
		NodeID: "node_a",
		Kind:   NodeKindConstraint,
		Label:  "No renderer changes",
	})
	appendTestEvent(t, store, EventEvidenceAttached, "node_a", evidenceAttachedPayload{
		AnchorID:       "evidence_a",
		TargetEntityID: "node_a",
		SourceKind:     EvidenceSourceFileRange,
		Path:           "docs/plans/setta_semantic_work_graph_implementation_plan.md",
		RangeStart:     42,
		RangeEnd:       49,
		Summary:        "Phase 1 scope guard",
	})
	appendTestEvent(t, store, EventActivityStarted, "node_a", activityStartedPayload{
		IntervalID:     "activity_a",
		TargetEntityID: "node_a",
		Kind:           ActivityKindValidating,
		Summary:        "Checking reducer behavior",
	})
	appendTestEvent(t, store, EventActivityEnded, "node_a", activityEndedPayload{IntervalID: "activity_a"})
	appendTestEvent(t, store, EventSteeringCreated, "node_a", steeringCreatedPayload{
		DirectiveID:    "steering_a",
		TargetEntityID: "node_a",
		Instruction:    "Keep phase 1 backend-only",
		Active:         true,
	})
	appendTestEvent(t, store, EventSteeringUpdated, "node_a", steeringUpdatedPayload{
		DirectiveID: "steering_a",
		Instruction: pointerTo("Keep phase 1 backend-only and read-oriented"),
		Active:      pointerTo(false),
	})
	appendTestEvent(t, store, EventContextPackCreated, "node_a", contextPackCreatedPayload{
		PackID:         "pack_a",
		TargetEntityID: "node_a",
		Summary:        "Backend foundation context",
		Prompt:         "Summarize phase 1",
		ItemCount:      3,
	})
	appendTestEvent(t, store, EventConstraintCheckRecorded, "node_a", constraintCheckRecordedPayload{
		CheckID:        "check_a",
		TargetEntityID: "node_a",
		Status:         "passed",
		Message:        "Renderer untouched",
	})

	detail, ok, err := store.ReadNodeDetail(ctx, testWorkspaceID, "node_a")
	if err != nil {
		t.Fatalf("read node detail: %v", err)
	}
	if !ok {
		t.Fatal("node detail missing")
	}
	if len(detail.Evidence) != 1 || detail.Evidence[0].ID != "evidence_a" {
		t.Fatalf("detail evidence = %+v, want evidence_a", detail.Evidence)
	}
	if len(detail.Activity) != 1 || detail.Activity[0].EndedAt == "" || detail.Activity[0].EndedByEventID == "" {
		t.Fatalf("detail activity = %+v, want ended interval", detail.Activity)
	}
	if len(detail.SteeringDirectives) != 1 || detail.SteeringDirectives[0].Active {
		t.Fatalf("detail steering = %+v, want inactive updated directive", detail.SteeringDirectives)
	}
	if len(detail.ContextPackHistory) != 1 || detail.ContextPackHistory[0].ItemCount != 3 {
		t.Fatalf("detail context packs = %+v, want one three-item pack", detail.ContextPackHistory)
	}
	evidence, err := store.ListEvidence(ctx, testWorkspaceID, "node_a")
	if err != nil {
		t.Fatalf("list evidence: %v", err)
	}
	if len(evidence.Evidence) != 1 {
		t.Fatalf("evidence count = %d, want 1", len(evidence.Evidence))
	}
	activity, err := store.ListActivity(ctx, testWorkspaceID, "node_a", 10)
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	if len(activity.Activity) != 1 {
		t.Fatalf("activity count = %d, want 1", len(activity.Activity))
	}
	steering, err := store.ReadSteeringState(ctx, testWorkspaceID, "node_a")
	if err != nil {
		t.Fatalf("read steering: %v", err)
	}
	if len(steering.SteeringDirectives) != 1 {
		t.Fatalf("steering directive count = %d, want 1", len(steering.SteeringDirectives))
	}
}

func TestStoreRebuildFailsOnCorruptEventWithoutDroppingExistingProjection(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	appendTestEvent(t, store, EventNodeCreated, "node_a", nodeCreatedPayload{
		NodeID: "node_a",
		Kind:   NodeKindConcept,
		Label:  "Stable projection",
	})
	if _, err := store.db.ExecContext(ctx, `
UPDATE semantic_events
SET payload_json = ?
WHERE event_id = ?
`, `{"nodeId":"node_a","kind":"concept","label":"Stable projection","summary":"","extra":true}`, "event_001"); err != nil {
		t.Fatalf("corrupt event payload: %v", err)
	}

	err := store.RebuildProjections(ctx)
	if err == nil {
		t.Fatal("rebuild succeeded, want corrupt event error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("rebuild error = %T %v, want corrupt state error", err, err)
	}
	graph, readErr := store.ReadGraph(ctx, testWorkspaceID)
	if readErr != nil {
		t.Fatalf("read graph after failed rebuild: %v", readErr)
	}
	if len(graph.Nodes) != 1 || graph.Nodes[0].ID != "node_a" {
		t.Fatalf("graph after failed rebuild = %+v, want preexisting projection", graph)
	}
}

func newTestStore(t *testing.T) *Store {
	t.Helper()
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new semantic graph store: %v", err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Fatalf("close semantic graph store: %v", err)
		}
	})
	return store
}

func appendTestEvent(t *testing.T, store *Store, eventType SemanticEventType, targetEntityID string, payload any) SemanticEvent {
	t.Helper()
	history, err := store.ReadEventHistory(context.Background(), testWorkspaceID, "", 0, 1000)
	if err != nil {
		t.Fatalf("read event count: %v", err)
	}
	eventID := "event_" + threeDigit(len(history.Events)+1)
	event := testEvent(t, eventID, eventType, targetEntityID, payload)
	appended, err := store.AppendEvent(context.Background(), event)
	if err != nil {
		t.Fatalf("append %s: %v", eventType, err)
	}
	return appended
}

func testEvent(t *testing.T, eventID string, eventType SemanticEventType, targetEntityID string, payload any) SemanticEvent {
	t.Helper()
	sequence := 1
	if len(eventID) >= len("event_001") {
		var parsed int
		if _, err := fmt.Sscanf(eventID, "event_%03d", &parsed); err == nil && parsed > 0 {
			sequence = parsed
		}
	}
	return SemanticEvent{
		EventID:        eventID,
		WorkspaceID:    testWorkspaceID,
		ActorKind:      ActorKindUser,
		ActorID:        testActorID,
		EventType:      eventType,
		TargetEntityID: targetEntityID,
		ObservedAt:     testTimestamp(sequence),
		Payload:        mustMarshalJSON(t, payload),
		ModelInfo:      map[string]string{},
	}
}

func mustMarshalJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return data
}

func testTimestamp(sequence int) string {
	return time.Date(2026, 6, 10, 12, 0, sequence, 0, time.UTC).Format(time.RFC3339Nano)
}

func semanticNodeByID(t *testing.T, nodes []SemanticNode, id string) SemanticNode {
	t.Helper()
	for _, node := range nodes {
		if node.ID == id {
			return node
		}
	}
	t.Fatalf("node %s not found in %+v", id, nodes)
	return SemanticNode{}
}

func semanticEdgeByID(t *testing.T, edges []SemanticEdge, id string) SemanticEdge {
	t.Helper()
	for _, edge := range edges {
		if edge.ID == id {
			return edge
		}
	}
	t.Fatalf("edge %s not found in %+v", id, edges)
	return SemanticEdge{}
}

func pointerTo[T any](value T) *T {
	return &value
}

func threeDigit(value int) string {
	return fmt.Sprintf("%03d", value)
}
