package semanticgraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
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
		IntervalID:       "activity_a",
		TargetEntityID:   "node_a",
		Kind:             ActivityKindValidating,
		Summary:          "Checking reducer behavior",
		SourceKind:       ActivitySourceFileRange,
		EvidenceAnchorID: "evidence_a",
		ActorKind:        ActorKindUser,
		ActorID:          testActorID,
	})
	appendTestEvent(t, store, EventActivityEnded, "node_a", activityEndedPayload{IntervalID: "activity_a"})
	appendTestEvent(t, store, EventSteeringCreated, "node_a", steeringCreatedPayload{
		DirectiveID:    "steering_a",
		TargetEntityID: "node_a",
		Kind:           SteeringKindFocus,
		Instruction:    "Keep phase 1 backend-only",
		Status:         SteeringStatusActive,
		Scope:          SteeringScopeWorkspace,
	})
	completedStatus := SteeringStatusCompleted
	appendTestEvent(t, store, EventSteeringUpdated, "node_a", steeringUpdatedPayload{
		DirectiveID: "steering_a",
		Instruction: pointerTo("Keep phase 1 backend-only and read-oriented"),
		Status:      &completedStatus,
	})
	appendTestEvent(t, store, EventContextPackCreated, "node_a", contextPackCreatedPayload{
		PackID:               "pack_a",
		TriggerKind:          ContextTriggerWorkflowAgentStart,
		TargetEntityID:       "node_a",
		AuthoredPromptHash:   "sha256:authored",
		DeliveredContextHash: "sha256:delivered",
		TokenBudget:          200,
		EstimatedTokens:      20,
		ItemCount:            1,
		Items: []SemanticContextPackItem{{
			ItemID:         "pack_a_item_001",
			Kind:           ContextPackItemConstraint,
			SemanticNodeID: "node_a",
			Title:          "No renderer changes",
			ReasonIncluded: "active constraint",
			Priority:       ContextPriorityRequired,
			CreatedAt:      testTimestamp(7),
			UpdatedAt:      testTimestamp(7),
		}},
		DeliveredContext: "Setta semantic context pack pack_a\n- [required] Constraint: No renderer changes",
	})
	appendTestEvent(t, store, EventConstraintCheckRecorded, "node_a", constraintCheckRecordedPayload{
		CheckID:        "check_a",
		TargetEntityID: "node_a",
		Status:         "passed",
		Message:        "Renderer untouched",
	})

	assertStoreNodeDetailProjection(t, store, ctx)
	assertStoreEvidenceAndActivityLists(t, store, ctx)
	assertStoreActivityPage(t, store, ctx)
	assertStoreActivitySummary(t, store, ctx)
	assertStoreSteeringState(t, store, ctx)
}

func assertStoreNodeDetailProjection(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
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
	if detail.Activity[0].SourceKind != ActivitySourceFileRange || detail.Activity[0].EvidenceAnchorID != "evidence_a" || detail.Activity[0].ActorID != testActorID {
		t.Fatalf("detail activity source = %+v, want file_range evidence_a by test actor", detail.Activity[0])
	}
	if len(detail.SteeringDirectives) != 1 || detail.SteeringDirectives[0].Status != SteeringStatusCompleted || detail.SteeringDirectives[0].CompletedAt == "" {
		t.Fatalf("detail steering = %+v, want completed updated directive", detail.SteeringDirectives)
	}
	if len(detail.ContextPackHistory) != 1 || detail.ContextPackHistory[0].ItemCount != 1 || len(detail.ContextPackHistory[0].Items) != 1 {
		t.Fatalf("detail context packs = %+v, want one pack with item", detail.ContextPackHistory)
	}
	if detail.ContextPackHistory[0].AuthoredPromptHash != "sha256:authored" || detail.ContextPackHistory[0].DeliveredContext == "" {
		t.Fatalf("detail context pack audit = %+v, want hashes and delivered context", detail.ContextPackHistory[0])
	}
}

func assertStoreEvidenceAndActivityLists(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
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
}

func assertStoreActivityPage(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
	page, err := store.ListActivityPage(ctx, SemanticActivityFilter{
		WorkspaceID: testWorkspaceID,
		SourceKind:  ActivitySourceFileRange,
		Offset:      0,
		Limit:       1,
	})
	if err != nil {
		t.Fatalf("list activity page: %v", err)
	}
	if len(page.Activity) != 1 || page.Activity[0].ID != "activity_a" || page.HasMore {
		t.Fatalf("activity page = %+v, want activity_a without more rows", page)
	}
}

func assertStoreActivitySummary(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
	summary, err := store.ReadActivitySummary(ctx, testWorkspaceID, 3)
	if err != nil {
		t.Fatalf("read activity summary: %v", err)
	}
	if len(summary.Targets) != 1 || len(summary.Targets[0].RecentActivity) != 1 || summary.Targets[0].RecentActivity[0].ID != "activity_a" {
		t.Fatalf("activity summary = %+v, want recent activity_a", summary)
	}
	assertStoreActivitySummaryJSON(t, summary)
}

func assertStoreActivitySummaryJSON(t *testing.T, summary SemanticActivitySummary) {
	t.Helper()
	encodedSummary, err := json.Marshal(summary)
	if err != nil {
		t.Fatalf("marshal activity summary: %v", err)
	}
	var summaryJSON struct {
		Targets []struct {
			CurrentActivity json.RawMessage `json:"currentActivity"`
			RecentActivity  json.RawMessage `json:"recentActivity"`
		} `json:"targets"`
	}
	if err := json.Unmarshal(encodedSummary, &summaryJSON); err != nil {
		t.Fatalf("unmarshal activity summary json: %v", err)
	}
	if len(summaryJSON.Targets) != 1 || string(summaryJSON.Targets[0].CurrentActivity) != "[]" || string(summaryJSON.Targets[0].RecentActivity) == "null" {
		t.Fatalf("activity summary json = %s, want array fields", encodedSummary)
	}
}

func assertStoreSteeringState(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
	steering, err := store.ReadSteeringState(ctx, testWorkspaceID, "node_a")
	if err != nil {
		t.Fatalf("read steering: %v", err)
	}
	if len(steering.SteeringDirectives) != 1 {
		t.Fatalf("steering directive count = %d, want 1", len(steering.SteeringDirectives))
	}
}

func TestStoreUpdatesLayoutPositionsWithoutAppendingEvents(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()
	appendTestEvent(t, store, EventNodeCreated, "node_a", nodeCreatedPayload{
		NodeID: "node_a",
		Kind:   NodeKindConcept,
		Label:  "Layout source",
	})
	appendTestEvent(t, store, EventNodeCreated, "node_b", nodeCreatedPayload{
		NodeID: "node_b",
		Kind:   NodeKindFinding,
		Label:  "Layout target",
	})
	appendTestEvent(t, store, EventEdgeCreated, "edge_ab", edgeCreatedPayload{
		EdgeID:     "edge_ab",
		Kind:       EdgeKindRelatedTo,
		FromNodeID: "node_a",
		ToNodeID:   "node_b",
	})

	updated, err := store.UpdateLayoutPositions(ctx, testWorkspaceID, []SemanticLayoutPositionInput{
		{EntityID: "node_a", X: 12, Y: 34, Pinned: true},
		{EntityID: "edge_ab", X: 56, Y: 78, Pinned: false},
	}, testTimestamp(20))
	if err != nil {
		t.Fatalf("update layout positions: %v", err)
	}
	if len(updated.Positions) != 2 {
		t.Fatalf("updated positions = %+v, want two positions", updated.Positions)
	}

	graph, err := store.ReadGraph(ctx, testWorkspaceID)
	if err != nil {
		t.Fatalf("read graph with layout: %v", err)
	}
	nodePosition := semanticLayoutPositionByEntityID(t, graph.LayoutPositions, "node_a")
	if nodePosition.X != 12 || nodePosition.Y != 34 || !nodePosition.Pinned {
		t.Fatalf("node layout position = %+v, want pinned 12,34", nodePosition)
	}
	edgePosition := semanticLayoutPositionByEntityID(t, graph.LayoutPositions, "edge_ab")
	if edgePosition.X != 56 || edgePosition.Y != 78 || edgePosition.Pinned {
		t.Fatalf("edge layout position = %+v, want unpinned 56,78", edgePosition)
	}
	history, err := store.ReadEventHistory(ctx, testWorkspaceID, "", 0, 10)
	if err != nil {
		t.Fatalf("read event history after layout update: %v", err)
	}
	if len(history.Events) != 3 {
		t.Fatalf("event count after layout update = %d, want original three events", len(history.Events))
	}

	if _, err := store.UpdateLayoutPositions(ctx, testWorkspaceID, []SemanticLayoutPositionInput{
		{EntityID: "node_missing", X: 1, Y: 2, Pinned: true},
	}, testTimestamp(21)); err == nil {
		t.Fatal("layout update for missing semantic entity succeeded, want error")
	}
	graph, err = store.ReadGraph(ctx, testWorkspaceID)
	if err != nil {
		t.Fatalf("read graph after failed layout update: %v", err)
	}
	if len(graph.LayoutPositions) != 2 {
		t.Fatalf("layout position count after failed update = %d, want 2", len(graph.LayoutPositions))
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

func TestStoreRejectsUnsupportedExistingVersionBeforeCreatingSchema(t *testing.T) {
	appDataDir := t.TempDir()
	dbPath := filepath.Join(appDataDir, semanticDatabaseName)
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	if _, err := db.Exec("PRAGMA user_version = 999"); err != nil {
		t.Fatalf("write unsupported version: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close sqlite db: %v", err)
	}

	store, err := NewStore(appDataDir)
	if err == nil {
		_ = store.Close()
		t.Fatal("new store with unsupported version succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("new store error = %T %v, want corrupt state error", err, err)
	}

	db, err = sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		t.Fatalf("reopen sqlite db: %v", err)
	}
	defer db.Close()
	var schemaTables int
	if err := db.QueryRow(`
SELECT COUNT(*)
FROM sqlite_master
WHERE type = 'table' AND name LIKE 'semantic_%'
`).Scan(&schemaTables); err != nil {
		t.Fatalf("count semantic tables: %v", err)
	}
	if schemaTables != 0 {
		t.Fatalf("semantic tables after rejected startup = %d, want 0", schemaTables)
	}
}

func TestStoreOpensCartographerSchemaAndRejectsPreviousSemanticVersion(t *testing.T) {
	store := newTestStore(t)
	var version int
	if err := store.db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		t.Fatalf("read semantic store version: %v", err)
	}
	if version != semanticStoreVersion {
		t.Fatalf("semantic store version = %d, want %d", version, semanticStoreVersion)
	}
	var cartographerTables int
	if err := store.db.QueryRow(`
SELECT COUNT(*)
FROM sqlite_master
WHERE type = 'table' AND name IN (
  'semantic_cartographer_runs',
  'semantic_cartographer_windows',
  'semantic_cartographer_cursors',
  'semantic_cartographer_trajectory_summaries',
  'semantic_cartographer_patches',
  'semantic_cartographer_validation_diagnostics'
)
`).Scan(&cartographerTables); err != nil {
		t.Fatalf("count cartographer tables: %v", err)
	}
	if cartographerTables != 6 {
		t.Fatalf("cartographer table count = %d, want 6", cartographerTables)
	}

	appDataDir := t.TempDir()
	dbPath := filepath.Join(appDataDir, semanticDatabaseName)
	db, err := sql.Open(sqliteDriverName, dbPath)
	if err != nil {
		t.Fatalf("open previous-version sqlite db: %v", err)
	}
	if _, err := db.Exec(fmt.Sprintf("PRAGMA user_version = %d", semanticStoreVersion-1)); err != nil {
		t.Fatalf("write previous semantic version: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close previous-version sqlite db: %v", err)
	}
	previous, err := NewStore(appDataDir)
	if err == nil {
		_ = previous.Close()
		t.Fatal("new store with previous semantic version succeeded, want corrupt state error")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("previous-version store error = %T %v, want corrupt state error", err, err)
	}
}

func TestStorePersistsCartographerRunWindowCursorAndSummary(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	run := saveCartographerRunForTest(t, store, ctx)
	window := saveCartographerWindowForTest(t, store, ctx, run.ID)
	saveCartographerCursorForTest(t, store, ctx, run.ID)
	saveCartographerSummaryForTest(t, store, ctx, run.ID, window.ID)
}

func TestStorePersistsCartographerPatchAuditWithoutSemanticEvents(t *testing.T) {
	store := newTestStore(t)
	ctx := context.Background()

	run := saveCartographerRunForTest(t, store, ctx)
	window := saveCartographerWindowForTest(t, store, ctx, run.ID)
	patch := cartographerTestPatch(run.ID, window.ID)
	if _, err := store.SaveCartographerPatch(ctx, patch); err != nil {
		t.Fatalf("save cartographer patch: %v", err)
	}
	readPatch, ok, err := store.ReadCartographerPatch(ctx, testWorkspaceID, patch.ID)
	if err != nil {
		t.Fatalf("read cartographer patch: %v", err)
	}
	if !ok || readPatch.Status != CartographerPatchApplied || readPatch.CreatedSemanticEventIDs[0] != "semantic_event_cartographer_001" || len(readPatch.ValidationResult.Diagnostics) != 1 {
		t.Fatalf("read cartographer patch = %+v, want persisted patch audit", readPatch)
	}
	assertCartographerDiagnosticRows(t, store, "cartographer_patch_001", 1)
	assertNoSemanticEvents(t, store, ctx)
}

func saveCartographerRunForTest(t *testing.T, store *Store, ctx context.Context) CartographerRun {
	t.Helper()
	run := cartographerTestRun()
	if _, err := store.SaveCartographerRun(ctx, run); err != nil {
		t.Fatalf("save cartographer run: %v", err)
	}
	readRun, ok, err := store.ReadCartographerRun(ctx, testWorkspaceID, run.ID)
	if err != nil {
		t.Fatalf("read cartographer run: %v", err)
	}
	if !ok || readRun.InputBundle.ObservedEventRefs[0] != "event_observed_001" || readRun.HarnessKind != "codex" {
		t.Fatalf("read cartographer run = %+v, want persisted run input and harness audit", readRun)
	}
	return run
}

func saveCartographerWindowForTest(t *testing.T, store *Store, ctx context.Context, runID string) CartographerWindow {
	t.Helper()
	window := cartographerTestWindow(runID)
	if _, err := store.SaveCartographerWindow(ctx, window); err != nil {
		t.Fatalf("save cartographer window: %v", err)
	}
	readWindow, ok, err := store.ReadCartographerWindow(ctx, testWorkspaceID, window.ID)
	if err != nil {
		t.Fatalf("read cartographer window: %v", err)
	}
	if !ok || readWindow.Status != CartographerWindowClosed || readWindow.InputBundle.SourceRefs.WorkflowExecutionID != "workflow_execution_cartographer" {
		t.Fatalf("read cartographer window = %+v, want persisted closed window", readWindow)
	}
	return window
}

func saveCartographerCursorForTest(t *testing.T, store *Store, ctx context.Context, runID string) {
	t.Helper()
	cursor := cartographerTestCursor(runID)
	if _, err := store.SaveCartographerCursor(ctx, cursor); err != nil {
		t.Fatalf("save cartographer cursor: %v", err)
	}
	readCursor, ok, err := store.ReadCartographerCursor(ctx, CartographerCursorKey{
		WorkspaceID:             testWorkspaceID,
		WorkflowExecutionID:     "workflow_execution_cartographer",
		WorkflowNodeExecutionID: "workflow_node_execution_cartographer",
		ChatConversationID:      "chat_conversation_cartographer",
		ChatRunID:               "chat_run_cartographer",
	})
	if err != nil {
		t.Fatalf("read cartographer cursor: %v", err)
	}
	if !ok ||
		readCursor.LastChatEventStreamID != "chat_events" ||
		readCursor.LastChatEventSequence != 42 ||
		readCursor.LastWorkflowEventCursor != "workflow_events:17" ||
		readCursor.LastOutputOrdinalByRunItem["run_item_cartographer"] != 9 ||
		readCursor.LastWindowID != "cartographer_window_001" {
		t.Fatalf("read cartographer cursor = %+v, want persisted cursor", readCursor)
	}
}

func saveCartographerSummaryForTest(t *testing.T, store *Store, ctx context.Context, runID string, windowID string) {
	t.Helper()
	summary := cartographerTestSummary(runID, windowID)
	if _, err := store.SaveCartographerTrajectorySummary(ctx, summary); err != nil {
		t.Fatalf("save cartographer summary: %v", err)
	}
	readSummary, ok, err := store.ReadCartographerTrajectorySummary(ctx, testWorkspaceID, summary.ID)
	if err != nil {
		t.Fatalf("read cartographer summary: %v", err)
	}
	if !ok || readSummary.ItemCount != 3 || readSummary.SourceRefs.ChatRunID != "chat_run_cartographer" {
		t.Fatalf("read cartographer summary = %+v, want persisted summary refs", readSummary)
	}
}

func cartographerTestRun() CartographerRun {
	return CartographerRun{
		ID:             "cartographer_run_001",
		WorkspaceID:    testWorkspaceID,
		Status:         CartographerRunRunning,
		TriggerKind:    CartographerTriggerManual,
		TargetEntityID: "node_cartographer_target",
		SourceRefs: SemanticContextSourceRefs{
			WorkflowExecutionID:     "workflow_execution_cartographer",
			WorkflowNodeExecutionID: "workflow_node_execution_cartographer",
			ChatConversationID:      "chat_conversation_cartographer",
			ChatRunID:               "chat_run_cartographer",
		},
		InputBundle: cartographerTestInputBundle(),
		OutputSchema: json.RawMessage(`{
			"type": "object",
			"required": ["patches"]
		}`),
		HarnessKind: "codex",
		Model:       "gpt-5-codex",
		RequestID:   "request_cartographer",
		CreatedAt:   testTimestamp(30),
		StartedAt:   testTimestamp(31),
		UpdatedAt:   testTimestamp(31),
	}
}

func cartographerTestWindow(runID string) CartographerWindow {
	return CartographerWindow{
		ID:          "cartographer_window_001",
		WorkspaceID: testWorkspaceID,
		RunID:       runID,
		Status:      CartographerWindowClosed,
		Sequence:    1,
		SourceKind:  CartographerSourceWorkflowExecution,
		SourceID:    "workflow_execution_cartographer",
		CursorID:    "cartographer_cursor_001",
		SummaryID:   "cartographer_summary_001",
		InputBundle: cartographerTestInputBundle(),
		OpenedAt:    testTimestamp(32),
		ClosedAt:    testTimestamp(33),
		CreatedAt:   testTimestamp(32),
		UpdatedAt:   testTimestamp(33),
	}
}

func cartographerTestCursor(runID string) CartographerCursor {
	return CartographerCursor{
		ID:                         "cartographer_cursor_001",
		WorkspaceID:                testWorkspaceID,
		WorkflowExecutionID:        "workflow_execution_cartographer",
		WorkflowNodeExecutionID:    "workflow_node_execution_cartographer",
		ChatConversationID:         "chat_conversation_cartographer",
		ChatRunID:                  "chat_run_cartographer",
		LastChatEventStreamID:      "chat_events",
		LastChatEventSequence:      42,
		LastWorkflowEventCursor:    "workflow_events:17",
		LastOutputOrdinalByRunItem: map[string]int{"run_item_cartographer": 9},
		LastWindowID:               "cartographer_window_001",
		UpdatedAt:                  testTimestamp(34),
	}
}

func cartographerTestSummary(runID string, windowID string) CartographerTrajectorySummary {
	return CartographerTrajectorySummary{
		ID:          "cartographer_summary_001",
		WorkspaceID: testWorkspaceID,
		RunID:       runID,
		WindowID:    windowID,
		SourceKind:  CartographerSourceWorkflowExecution,
		SourceID:    "workflow_execution_cartographer",
		Summary:     "Agent inspected semantic graph persistence and prepared a patch envelope.",
		SourceRefs: SemanticContextSourceRefs{
			WorkflowExecutionID:     "workflow_execution_cartographer",
			WorkflowNodeExecutionID: "workflow_node_execution_cartographer",
			ChatConversationID:      "chat_conversation_cartographer",
			ChatRunID:               "chat_run_cartographer",
		},
		ItemCount: 3,
		CreatedAt: testTimestamp(35),
	}
}

func cartographerTestPatch(runID string, windowID string) CartographerPatchRecord {
	confidence := 82
	return CartographerPatchRecord{
		WorkspaceID: testWorkspaceID,
		ID:          "cartographer_patch_001",
		RunID:       runID,
		WindowID:    windowID,
		Status:      CartographerPatchApplied,
		Patch: CartographerPatch{
			ID:         "cartographer_patch_001",
			RunID:      runID,
			WindowID:   windowID,
			Confidence: &confidence,
			Summary:    "Create a finding from observed work.",
			Operations: []CartographerPatchOperation{{
				ID:      "cartographer_operation_001",
				Kind:    "create_node",
				Payload: json.RawMessage(`{"nodeId":"node_cartographer_created","kind":"finding"}`),
			}},
			Evidence: []CartographerPatchEvidenceRef{{
				SourceKind:       EvidenceSourceRunItem,
				SourceID:         "run_item_cartographer",
				EvidenceAnchorID: "evidence_cartographer",
			}},
			RawEnvelope: json.RawMessage(`{"patches":[{"id":"cartographer_patch_001"}]}`),
		},
		ValidationResult: CartographerPatchValidationResult{
			PatchID:  "cartographer_patch_001",
			Accepted: true,
			Diagnostics: []CartographerDiagnostic{{
				ID:        "cartographer_diagnostic_001",
				RunID:     runID,
				PatchID:   "cartographer_patch_001",
				Severity:  CartographerDiagnosticInfo,
				Code:      "shape_valid",
				Message:   "Patch envelope shape is valid.",
				Path:      "$.patches[0]",
				CreatedAt: testTimestamp(36),
			}},
			ValidatedAt: testTimestamp(36),
		},
		ApplicationResult: CartographerPatchApplicationResult{
			PatchID:                 "cartographer_patch_001",
			Applied:                 true,
			CreatedSemanticEventIDs: []string{"semantic_event_cartographer_001"},
			AppliedAt:               testTimestamp(37),
		},
		CreatedSemanticEventIDs: []string{"semantic_event_cartographer_001"},
		CreatedAt:               testTimestamp(36),
		ValidatedAt:             testTimestamp(36),
		AppliedAt:               testTimestamp(37),
	}
}

func assertNoSemanticEvents(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
	history, err := store.ReadEventHistory(ctx, testWorkspaceID, "", 0, 10)
	if err != nil {
		t.Fatalf("read semantic event history: %v", err)
	}
	if len(history.Events) != 0 {
		t.Fatalf("semantic history after cartographer audit = %+v, want no semantic graph events", history.Events)
	}
}

func cartographerTestInputBundle() CartographerInputBundle {
	return CartographerInputBundle{
		WorkspaceID:    testWorkspaceID,
		TargetEntityID: "node_cartographer_target",
		SourceRefs: SemanticContextSourceRefs{
			WorkflowExecutionID:     "workflow_execution_cartographer",
			WorkflowNodeExecutionID: "workflow_node_execution_cartographer",
			ChatConversationID:      "chat_conversation_cartographer",
			ChatRunID:               "chat_run_cartographer",
		},
		ObservedEventRefs: []string{"event_observed_001"},
	}
}

func assertCartographerDiagnosticRows(t *testing.T, store *Store, patchID string, want int) {
	t.Helper()
	var count int
	if err := store.db.QueryRow(`
SELECT COUNT(*)
FROM semantic_cartographer_validation_diagnostics
WHERE workspace_id = ? AND patch_id = ?
`, testWorkspaceID, patchID).Scan(&count); err != nil {
		t.Fatalf("count cartographer diagnostics: %v", err)
	}
	if count != want {
		t.Fatalf("cartographer diagnostic rows = %d, want %d", count, want)
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

func semanticLayoutPositionByEntityID(t *testing.T, positions []SemanticLayoutPosition, entityID string) SemanticLayoutPosition {
	t.Helper()
	for _, position := range positions {
		if position.EntityID == entityID {
			return position
		}
	}
	t.Fatalf("layout position %s not found in %+v", entityID, positions)
	return SemanticLayoutPosition{}
}

func pointerTo[T any](value T) *T {
	return &value
}

func threeDigit(value int) string {
	return fmt.Sprintf("%03d", value)
}
