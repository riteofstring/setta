package director

import (
	"fmt"
	"testing"
)

const testStreamEpoch = "app-epoch-1"

func testStreamID(t *testing.T) string {
	t.Helper()
	streamID, err := DirectorStreamID(testStreamEpoch)
	if err != nil {
		t.Fatalf("stream id was rejected: %v", err)
	}
	return streamID
}

func testWorkstream(id string) Workstream {
	return Workstream{
		ID:               id,
		Title:            "Refresh the release notes",
		Status:           WorkstreamStatusIdle,
		ConversationID:   "conversation-" + id,
		ResourceScope:    WorkstreamResourceScope{Kind: WorkstreamResourceScopeFolderless},
		ResourceBindings: []WorkstreamResourceBinding{},
		CreatedAt:        "2026-07-24T12:00:00Z",
		UpdatedAt:        "2026-07-24T12:00:00Z",
	}
}

func testSnapshot(t *testing.T) DirectorSnapshot {
	t.Helper()
	selected := testParentWorkstream
	return DirectorSnapshot{
		SchemaVersion:        DirectorContractSchemaVersion,
		SelectedWorkstreamID: &selected,
		Workstreams: []DirectorWorkstreamEntry{
			{Workstream: testWorkstream(testParentWorkstream), DetailLevel: WorkstreamDetailSelected},
			{Workstream: testWorkstream(testOtherWorkstream), DetailLevel: WorkstreamDetailBackground},
		},
		Graphs: []WorkstreamGraph{{
			WorkstreamID: testParentWorkstream,
			DetailLevel:  WorkstreamDetailSelected,
			Nodes:        []SemanticNode{},
			Edges:        []SemanticEdge{},
		}},
		UnresolvedApprovals:        []ApprovalRequest{},
		UnresolvedResourceRequests: []ResourceRequest{},
		Artifacts:                  []WorkstreamArtifact{},
		Aggregates:                 DirectorAggregates{WorkstreamCount: 2},
		Connection:                 DirectorConnectionState{Status: DirectorConnectionConnected},
		EventCursor: DirectorEventCursor{
			StreamID: testStreamID(t),
			Sequence: 12,
		},
	}
}

func TestFolderlessWorkstreamsAreFirstClass(t *testing.T) {
	snapshot := testSnapshot(t)
	if err := ValidateDirectorSnapshot(snapshot); err != nil {
		t.Fatalf("a folderless snapshot was rejected: %v", err)
	}
	if err := ValidateWorkstream(testWorkstream("workstream-solo")); err != nil {
		t.Fatalf("a folderless workstream was rejected: %v", err)
	}

	bound := testWorkstream("workstream-bound")
	bound.ResourceScope = WorkstreamResourceScope{
		Kind:   WorkstreamResourceScopeFolder,
		Folder: &FolderResourceBinding{WorkspaceID: "workspace-1", RootPath: "/tmp/setta-project"},
	}
	if err := ValidateWorkstream(bound); err != nil {
		t.Fatalf("a folder-bound workstream was rejected: %v", err)
	}

	inconsistent := testWorkstream("workstream-inconsistent")
	inconsistent.ResourceScope = WorkstreamResourceScope{Kind: WorkstreamResourceScopeFolder}
	if err := ValidateWorkstream(inconsistent); err == nil {
		t.Fatal("a folder scope without a binding must be rejected")
	}

	relative := testWorkstream("workstream-relative")
	relative.ResourceScope = WorkstreamResourceScope{
		Kind:   WorkstreamResourceScopeFolder,
		Folder: &FolderResourceBinding{WorkspaceID: "workspace-1", RootPath: "relative/path"},
	}
	if err := ValidateWorkstream(relative); err == nil {
		t.Fatal("a relative folder root must be rejected")
	}

	nullBindings := testWorkstream("workstream-null-bindings")
	nullBindings.ResourceBindings = nil
	if err := ValidateWorkstream(nullBindings); err == nil {
		t.Fatal("resource bindings must serialize as an array")
	}
}

func TestWorkstreamStatusMatchesItsActionableState(t *testing.T) {
	activeRunID := "turn-active"
	for _, testCase := range []struct {
		name   string
		mutate func(*Workstream)
	}{
		{
			name: "running without active run",
			mutate: func(workstream *Workstream) {
				workstream.Status = WorkstreamStatusRunning
			},
		},
		{
			name: "running with unresolved approval",
			mutate: func(workstream *Workstream) {
				workstream.Status = WorkstreamStatusRunning
				workstream.ActiveRunID = &activeRunID
				workstream.UnresolvedApprovalCount = 1
			},
		},
		{
			name: "queued without queued work",
			mutate: func(workstream *Workstream) {
				workstream.Status = WorkstreamStatusQueued
			},
		},
		{
			name: "approval without pending approval",
			mutate: func(workstream *Workstream) {
				workstream.Status = WorkstreamStatusAwaitingApproval
				workstream.ActiveRunID = &activeRunID
			},
		},
		{
			name: "failed with unresolved work",
			mutate: func(workstream *Workstream) {
				workstream.Status = WorkstreamStatusFailed
				workstream.UnresolvedResourceRequestCount = 1
			},
		},
		{
			name: "archived with queued work",
			mutate: func(workstream *Workstream) {
				workstream.Status = WorkstreamStatusArchived
				workstream.QueuedRunCount = 1
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			workstream := testWorkstream("workstream-status")
			testCase.mutate(&workstream)
			if err := ValidateWorkstream(workstream); err == nil {
				t.Fatalf("inconsistent %s status was accepted", workstream.Status)
			}
		})
	}

	running := testWorkstream("workstream-running")
	running.Status = WorkstreamStatusRunning
	running.ActiveRunID = &activeRunID
	if err := ValidateWorkstream(running); err != nil {
		t.Fatalf("a running workstream with an active run was rejected: %v", err)
	}
}

func TestSnapshotSelectionIsConsistent(t *testing.T) {
	snapshot := testSnapshot(t)
	missing := snapshot
	elsewhere := "workstream-absent"
	missing.SelectedWorkstreamID = &elsewhere
	if err := ValidateDirectorSnapshot(missing); err == nil {
		t.Fatal("a selection outside the window must be rejected")
	}

	doubled := snapshot
	doubled.Workstreams = []DirectorWorkstreamEntry{
		{Workstream: testWorkstream(testParentWorkstream), DetailLevel: WorkstreamDetailSelected},
		{Workstream: testWorkstream(testOtherWorkstream), DetailLevel: WorkstreamDetailSelected},
	}
	if err := ValidateDirectorSnapshot(doubled); err == nil {
		t.Fatal("two selected workstreams must be rejected")
	}

	repeated := snapshot
	repeated.Workstreams = []DirectorWorkstreamEntry{
		{Workstream: testWorkstream(testParentWorkstream), DetailLevel: WorkstreamDetailSelected},
		{Workstream: testWorkstream(testParentWorkstream), DetailLevel: WorkstreamDetailBackground},
	}
	if err := ValidateDirectorSnapshot(repeated); err == nil {
		t.Fatal("a repeated workstream must be rejected")
	}
}

func TestSnapshotGraphsMatchTheirDetailLevel(t *testing.T) {
	snapshot := testSnapshot(t)
	snapshot.Graphs = nil
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("a selected workstream without its graph must be rejected")
	}

	snapshot = testSnapshot(t)
	snapshot.Graphs = append(snapshot.Graphs, WorkstreamGraph{
		WorkstreamID: testOtherWorkstream,
		DetailLevel:  WorkstreamDetailBackground,
		Nodes:        []SemanticNode{},
		Edges:        []SemanticEdge{},
	})
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("a background workstream must not carry a graph")
	}

	snapshot = testSnapshot(t)
	snapshot.Graphs = []WorkstreamGraph{{
		WorkstreamID: testOtherWorkstream,
		DetailLevel:  WorkstreamDetailAdjacent,
		Nodes:        []SemanticNode{},
		Edges:        []SemanticEdge{},
	}}
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("a graph whose detail level disagrees with the registry must be rejected")
	}

	snapshot.Graphs = []WorkstreamGraph{{
		WorkstreamID: "workstream-absent",
		DetailLevel:  WorkstreamDetailSelected,
		Nodes:        []SemanticNode{},
		Edges:        []SemanticEdge{},
	}}
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("a graph for a workstream outside the window must be rejected")
	}

	snapshot = testSnapshot(t)
	snapshot.Workstreams[1].DetailLevel = WorkstreamDetailAdjacent
	nodes := make([]SemanticNode, MaxSnapshotAdjacentGraphNodes+1)
	for index := range nodes {
		nodes[index] = testNode()
		nodes[index].ID = fmt.Sprintf("action:adjacent-%d", index)
		nodes[index].WorkstreamID = testOtherWorkstream
	}
	snapshot.Graphs = append(snapshot.Graphs, WorkstreamGraph{
		WorkstreamID: testOtherWorkstream,
		DetailLevel:  WorkstreamDetailAdjacent,
		Nodes:        nodes,
		Edges:        []SemanticEdge{},
	})
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("an adjacent graph above its compact node bound must be rejected")
	}
}

func TestSnapshotWindowMatchesAggregateTruth(t *testing.T) {
	snapshot := testSnapshot(t)
	snapshot.Aggregates.WorkstreamCount = 3
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("a truncated workstream window without hasMoreWorkstreams must be rejected")
	}
	snapshot.HasMoreWorkstreams = true
	if err := ValidateDirectorSnapshot(snapshot); err != nil {
		t.Fatalf("a truthful truncated workstream window was rejected: %v", err)
	}

	snapshot.Aggregates.WorkstreamCount = 2
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("hasMoreWorkstreams must not claim hidden workstreams when counts are equal")
	}
}

func TestSnapshotCollectionsStayArraysAndAggregateDimensionsMayOverlap(t *testing.T) {
	snapshot := testSnapshot(t)
	snapshot.UnresolvedApprovals = nil
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("a null snapshot collection was accepted")
	}

	snapshot = testSnapshot(t)
	for index := range snapshot.Workstreams {
		activeRunID := fmt.Sprintf("turn-overlap-%d", index)
		snapshot.Workstreams[index].Workstream.Status = WorkstreamStatusBlocked
		snapshot.Workstreams[index].Workstream.ActiveRunID = &activeRunID
		snapshot.Workstreams[index].Workstream.QueuedRunCount = 1
	}
	snapshot.Aggregates.RunningCount = 2
	snapshot.Aggregates.QueuedCount = 2
	snapshot.Aggregates.BlockedCount = 2
	if err := ValidateDirectorSnapshot(snapshot); err != nil {
		t.Fatalf("overlapping aggregate dimensions were rejected: %v", err)
	}

	snapshot.Aggregates.RunningCount = 3
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("an aggregate dimension above the workstream count was accepted")
	}
}

func TestSnapshotAggregatesDoNotUndercountVisibleState(t *testing.T) {
	snapshot := testSnapshot(t)
	snapshot.Workstreams[0].Workstream.Status = WorkstreamStatusAwaitingResource
	snapshot.Workstreams[0].Workstream.UnresolvedResourceRequestCount = 1
	snapshot.UnresolvedResourceRequests = []ResourceRequest{{
		ID:             "resource-visible",
		WorkstreamID:   testParentWorkstream,
		Kind:           WorkstreamResourceKindFolder,
		Status:         ResourceRequestStatusRequested,
		PublicSummary:  "Choose the folder this work should run in",
		SourceEventIDs: []string{"event-visible"},
		RequestedAt:    "2026-07-24T12:00:00Z",
	}}
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("visible actionable state was allowed to exceed app-wide aggregates")
	}

	snapshot.Aggregates.AwaitingResourceCount = 1
	snapshot.Aggregates.UnresolvedResourceRequestCount = 1
	if err := ValidateDirectorSnapshot(snapshot); err != nil {
		t.Fatalf("truthful visible aggregate minima were rejected: %v", err)
	}

	snapshot = testSnapshot(t)
	snapshot.Aggregates.RunningCount = 1
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("a complete snapshot was allowed to overstate its visible aggregates")
	}
}

func TestSnapshotCollectionsFillButDoNotExceedTheirIndependentBounds(t *testing.T) {
	snapshot := testSnapshot(t)
	snapshot.Workstreams[0].Workstream.Status = WorkstreamStatusAwaitingResource
	snapshot.Workstreams[0].Workstream.UnresolvedResourceRequestCount = MaxSnapshotResourceRequests + 1
	snapshot.Aggregates.AwaitingResourceCount = 1
	snapshot.Aggregates.UnresolvedResourceRequestCount = MaxSnapshotResourceRequests + 1
	snapshot.UnresolvedResourceRequests = make([]ResourceRequest, MaxSnapshotResourceRequests)
	for index := range snapshot.UnresolvedResourceRequests {
		snapshot.UnresolvedResourceRequests[index] = ResourceRequest{
			ID:             fmt.Sprintf("resource-bounded-%d", index),
			WorkstreamID:   testParentWorkstream,
			Kind:           WorkstreamResourceKindFolder,
			Status:         ResourceRequestStatusRequested,
			PublicSummary:  "Choose a folder",
			SourceEventIDs: []string{fmt.Sprintf("event-bounded-%d", index)},
			RequestedAt:    "2026-07-24T12:00:00Z",
		}
	}
	if err := ValidateDirectorSnapshot(snapshot); err != nil {
		t.Fatalf("a collection filled to its independent bound was rejected: %v", err)
	}

	snapshot.UnresolvedResourceRequests = snapshot.UnresolvedResourceRequests[:MaxSnapshotResourceRequests-1]
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("a bounded collection that omitted an available slot was accepted")
	}
}

func TestUnresolvedRecordsMustActuallyBeUnresolved(t *testing.T) {
	snapshot := testSnapshot(t)
	snapshot.UnresolvedResourceRequests = []ResourceRequest{{
		ID:             "resource-1",
		WorkstreamID:   testParentWorkstream,
		Kind:           WorkstreamResourceKindFolder,
		Status:         ResourceRequestStatusRequested,
		PublicSummary:  "Choose the folder this work should run in",
		SourceEventIDs: []string{"event-1"},
		RequestedAt:    "2026-07-24T12:00:00Z",
	}}
	snapshot.Workstreams[0].Workstream.Status = WorkstreamStatusAwaitingResource
	snapshot.Workstreams[0].Workstream.UnresolvedResourceRequestCount = 1
	snapshot.Aggregates.AwaitingResourceCount = 1
	snapshot.Aggregates.UnresolvedResourceRequestCount = 1
	if err := ValidateDirectorSnapshot(snapshot); err != nil {
		t.Fatalf("an unresolved resource request was rejected: %v", err)
	}

	resolved := snapshot
	request := snapshot.UnresolvedResourceRequests[0]
	request.Status = ResourceRequestStatusResolved
	request.ResolvedAt = stringPointer("2026-07-24T12:00:05Z")
	request.ResolvedBinding = &WorkstreamResourceBinding{
		Kind:   WorkstreamResourceKindFolder,
		Folder: &FolderResourceBinding{WorkspaceID: "workspace-1", RootPath: "/tmp/setta-project"},
	}
	resolved.UnresolvedResourceRequests = []ResourceRequest{request}
	if err := ValidateDirectorSnapshot(resolved); err == nil {
		t.Fatal("a resolved request must not be listed as unresolved")
	}

	unbacked := request
	unbacked.ResolvedBinding = nil
	if err := ValidateResourceRequest(unbacked); err == nil {
		t.Fatal("a resolved request must record the binding that resolved it")
	}
}

func TestDirectorEventsSelectExactlyOnePayload(t *testing.T) {
	streamID := testStreamID(t)
	eventID, err := DirectorEventID(streamID, 3)
	if err != nil {
		t.Fatalf("event id was rejected: %v", err)
	}
	selection := testParentWorkstream
	event := DirectorEvent{
		SchemaVersion:    DirectorContractSchemaVersion,
		StreamID:         streamID,
		Sequence:         3,
		EventID:          eventID,
		EmittedAt:        "2026-07-24T12:00:00Z",
		Kind:             DirectorEventSelectionChanged,
		SelectionChanged: &DirectorSelectionChangedPayload{SelectedWorkstreamID: &selection},
	}
	if err := ValidateDirectorEvent(event); err != nil {
		t.Fatalf("a well-formed event was rejected: %v", err)
	}

	extra := event
	extra.WorkstreamRemoved = &DirectorWorkstreamRemovedPayload{WorkstreamID: testOtherWorkstream}
	if err := ValidateDirectorEvent(extra); err == nil {
		t.Fatal("an event with two payload branches must be rejected")
	}

	mismatched := event
	mismatched.Kind = DirectorEventWorkstreamRemoved
	if err := ValidateDirectorEvent(mismatched); err == nil {
		t.Fatal("an event whose kind does not match its payload must be rejected")
	}

	misnumbered := event
	misnumbered.Sequence = 4
	if err := ValidateDirectorEvent(misnumbered); err == nil {
		t.Fatal("an event id that does not match its stream position must be rejected")
	}
}

func TestGraphEventsCarryContentDeltas(t *testing.T) {
	streamID := testStreamID(t)
	eventID, err := DirectorEventID(streamID, 4)
	if err != nil {
		t.Fatalf("event id was rejected: %v", err)
	}
	event := DirectorEvent{
		SchemaVersion: DirectorContractSchemaVersion,
		StreamID:      streamID,
		Sequence:      4,
		EventID:       eventID,
		EmittedAt:     "2026-07-24T12:00:00Z",
		Kind:          DirectorEventGraphUpdated,
		GraphUpdated: &DirectorGraphUpdatedPayload{
			WorkstreamID:   testParentWorkstream,
			DetailLevel:    WorkstreamDetailSelected,
			Nodes:          []SemanticNode{testNode()},
			Edges:          []SemanticEdge{},
			RemovedNodeIDs: []string{},
		},
	}
	if err := ValidateDirectorEvent(event); err != nil {
		t.Fatalf("a graph delta was rejected: %v", err)
	}

	empty := event
	empty.GraphUpdated = &DirectorGraphUpdatedPayload{
		WorkstreamID:   testParentWorkstream,
		DetailLevel:    WorkstreamDetailSelected,
		Nodes:          []SemanticNode{},
		Edges:          []SemanticEdge{},
		RemovedNodeIDs: []string{},
	}
	if err := ValidateDirectorEvent(empty); err == nil {
		t.Fatal("a graph event that changes nothing must be rejected")
	}

	foreign := event
	node := testNode()
	node.WorkstreamID = testOtherWorkstream
	foreign.GraphUpdated = &DirectorGraphUpdatedPayload{
		WorkstreamID:   testParentWorkstream,
		DetailLevel:    WorkstreamDetailSelected,
		Nodes:          []SemanticNode{node},
		Edges:          []SemanticEdge{},
		RemovedNodeIDs: []string{},
	}
	if err := ValidateDirectorEvent(foreign); err == nil {
		t.Fatal("a graph event must not carry another workstream's node")
	}

	duplicated := event
	duplicated.GraphUpdated = &DirectorGraphUpdatedPayload{
		WorkstreamID:   testParentWorkstream,
		DetailLevel:    WorkstreamDetailSelected,
		Nodes:          []SemanticNode{testNode(), testNode()},
		Edges:          []SemanticEdge{},
		RemovedNodeIDs: []string{},
	}
	if err := ValidateDirectorEvent(duplicated); err == nil {
		t.Fatal("a graph event with duplicate node ids must be rejected")
	}

	removedAndUpdated := event
	removedAndUpdated.GraphUpdated = &DirectorGraphUpdatedPayload{
		WorkstreamID:   testParentWorkstream,
		DetailLevel:    WorkstreamDetailSelected,
		Nodes:          []SemanticNode{testNode()},
		Edges:          []SemanticEdge{},
		RemovedNodeIDs: []string{testNode().ID},
	}
	if err := ValidateDirectorEvent(removedAndUpdated); err == nil {
		t.Fatal("a graph event must not update and remove the same node")
	}

	tooManyRemoved := event
	tooManyRemoved.GraphUpdated = &DirectorGraphUpdatedPayload{
		WorkstreamID:   testParentWorkstream,
		DetailLevel:    WorkstreamDetailSelected,
		Nodes:          []SemanticNode{},
		Edges:          []SemanticEdge{},
		RemovedNodeIDs: make([]string, MaxSnapshotGraphNodes+1),
	}
	if err := ValidateDirectorEvent(tooManyRemoved); err == nil {
		t.Fatal("a graph event may not remove more nodes than its bounded graph can hold")
	}

	malformed := event
	invalidNode := testNode()
	invalidNode.Status = "guessing"
	malformed.GraphUpdated = &DirectorGraphUpdatedPayload{
		WorkstreamID:   testParentWorkstream,
		DetailLevel:    WorkstreamDetailSelected,
		Nodes:          []SemanticNode{invalidNode},
		Edges:          []SemanticEdge{},
		RemovedNodeIDs: []string{},
	}
	if err := ValidateDirectorEvent(malformed); err == nil {
		t.Fatal("a graph event must validate the semantic nodes it carries")
	}

	unknownEdge := event
	unknownEdge.GraphUpdated = &DirectorGraphUpdatedPayload{
		WorkstreamID: testParentWorkstream,
		DetailLevel:  WorkstreamDetailSelected,
		Nodes:        []SemanticNode{},
		Edges: []SemanticEdge{{
			ID:               "edge-unknown",
			Kind:             "near",
			FromWorkstreamID: testParentWorkstream,
			FromNodeID:       "node-a",
			ToWorkstreamID:   testParentWorkstream,
			ToNodeID:         "node-b",
			SourceEventIDs:   []string{"event-1"},
			CreatedAt:        "2026-07-24T12:00:00Z",
		}},
		RemovedNodeIDs: []string{},
	}
	if err := ValidateDirectorEvent(unknownEdge); err == nil {
		t.Fatal("a graph event must reject an unknown edge kind")
	}
}

func TestOnlyNonSemanticTextIsBestEffort(t *testing.T) {
	for _, kind := range DirectorEventKinds() {
		delivery, err := DirectorEventDeliveryFor(kind)
		if err != nil {
			t.Fatalf("event kind %q has no delivery class: %v", kind, err)
		}
		want := DirectorEventDeliveryLossless
		if kind == DirectorEventTextDelta {
			want = DirectorEventDeliveryBestEffort
		}
		if delivery != want {
			t.Fatalf("event kind %q is %q, want %q", kind, delivery, want)
		}
	}
}

func TestDirectorCursorsCannotBeConversationCursors(t *testing.T) {
	streamID := testStreamID(t)
	cursor := DirectorEventCursor{StreamID: streamID, Sequence: 0}
	if err := cursor.Validate(streamID); err != nil {
		t.Fatalf("a fresh cursor was rejected: %v", err)
	}
	foreign := DirectorEventCursor{StreamID: "conversation:abc", Sequence: 1}
	if err := foreign.Validate("conversation:abc"); err == nil {
		t.Fatal("a conversation cursor must not validate as a director cursor")
	}
	if _, err := DirectorStreamID(""); err == nil {
		t.Fatal("an empty stream epoch must be rejected")
	}
}
