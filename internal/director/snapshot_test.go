package director

import "testing"

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
		ID:             id,
		Title:          "Refresh the release notes",
		Status:         WorkstreamStatusIdle,
		ConversationID: "conversation-" + id,
		ResourceScope:  WorkstreamResourceScope{Kind: WorkstreamResourceScopeFolderless},
		CreatedAt:      "2026-07-24T12:00:00Z",
		UpdatedAt:      "2026-07-24T12:00:00Z",
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
		Aggregates: DirectorAggregates{WorkstreamCount: 2},
		Connection: DirectorConnectionState{Status: DirectorConnectionConnected},
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
	snapshot.Graphs = []WorkstreamGraph{{
		WorkstreamID: testOtherWorkstream,
		DetailLevel:  WorkstreamDetailAdjacent,
	}}
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("a graph whose detail level disagrees with the registry must be rejected")
	}

	snapshot.Graphs = []WorkstreamGraph{{
		WorkstreamID: "workstream-absent",
		DetailLevel:  WorkstreamDetailSelected,
	}}
	if err := ValidateDirectorSnapshot(snapshot); err == nil {
		t.Fatal("a graph for a workstream outside the window must be rejected")
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
			WorkstreamID: testParentWorkstream,
			DetailLevel:  WorkstreamDetailSelected,
			Nodes:        []SemanticNode{testNode()},
		},
	}
	if err := ValidateDirectorEvent(event); err != nil {
		t.Fatalf("a graph delta was rejected: %v", err)
	}

	empty := event
	empty.GraphUpdated = &DirectorGraphUpdatedPayload{
		WorkstreamID: testParentWorkstream,
		DetailLevel:  WorkstreamDetailSelected,
	}
	if err := ValidateDirectorEvent(empty); err == nil {
		t.Fatal("a graph event that changes nothing must be rejected")
	}

	foreign := event
	node := testNode()
	node.WorkstreamID = testOtherWorkstream
	foreign.GraphUpdated = &DirectorGraphUpdatedPayload{
		WorkstreamID: testParentWorkstream,
		DetailLevel:  WorkstreamDetailSelected,
		Nodes:        []SemanticNode{node},
	}
	if err := ValidateDirectorEvent(foreign); err == nil {
		t.Fatal("a graph event must not carry another workstream's node")
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
