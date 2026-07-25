package director

import (
	"context"
	"errors"
	"testing"
)

// The command center is the shell's only surface, so these tests are written
// the way the shell uses it: dispatch an intent, then read what the app-scoped
// snapshot and its pushed stream say. Nothing here names a pane, a conversation,
// or a provider, because the boundary exposes none of them.

func newTestCommandCenter(t *testing.T, registry *Registry) *CommandCenter {
	t.Helper()
	center, err := NewCommandCenter(registry)
	if err != nil {
		t.Fatalf("NewCommandCenter: %v", err)
	}
	return center
}

func dispatch(t *testing.T, center *CommandCenter, intent DirectorIntent) DirectorReceipt {
	t.Helper()
	receipt, err := center.Dispatch(context.Background(), intent)
	if err != nil {
		t.Fatalf("Dispatch %s: %v", intent.Kind, err)
	}
	return receipt
}

func selectWorkstream(workstreamID string) DirectorIntent {
	return DirectorIntent{
		Kind:             DirectorIntentSelectWorkstream,
		SelectWorkstream: &DirectorSelectWorkstreamIntent{WorkstreamID: workstreamID},
	}
}

func moveSelection(direction DirectorSelectionDirection) DirectorIntent {
	return DirectorIntent{
		Kind:          DirectorIntentMoveSelection,
		MoveSelection: &DirectorMoveSelectionIntent{Direction: direction},
	}
}

// TestCommandCenterSelectsWithoutPaneIdentity proves the primary presentation
// intent is expressible with a workstream id alone: the dispatch commits durable
// selection and the change arrives on the pushed stream, with no pane to resolve
// and nothing to refresh.
func TestCommandCenterSelectsWithoutPaneIdentity(t *testing.T) {
	harness := newRegistryHarness(t)
	harness.createConversation("conversation-first", "First", nil)
	second := harness.createConversation("conversation-second", "Second", nil)
	registry := harness.start()
	center := newTestCommandCenter(t, registry)
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	receipt := dispatch(t, center, selectWorkstream(second))
	if receipt.Kind != DirectorIntentSelectWorkstream {
		t.Fatalf("receipt kind = %q", receipt.Kind)
	}
	if receipt.SelectedWorkstreamID == nil || *receipt.SelectedWorkstreamID != second {
		t.Fatalf("receipt selection = %v, want %q", receipt.SelectedWorkstreamID, second)
	}

	event := awaitEvent(t, subscription, DirectorEventSelectionChanged)
	if event.SelectionChanged.SelectedWorkstreamID == nil ||
		*event.SelectionChanged.SelectedWorkstreamID != second {
		t.Fatalf("pushed selection = %+v", event.SelectionChanged)
	}
	snapshot, err := center.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if snapshot.SelectedWorkstreamID == nil || *snapshot.SelectedWorkstreamID != second {
		t.Fatalf("snapshot selection = %v", snapshot.SelectedWorkstreamID)
	}
	if findEntry(t, snapshot, second).DetailLevel != WorkstreamDetailSelected {
		t.Fatalf("selected workstream is not projected at the selected detail level")
	}
}

// TestCommandCenterMovesSelectionThroughTheVisibleOrder proves previous/next
// steps through the order the snapshot draws and clamps at both ends, so holding
// the key stops at the end of the list instead of wrapping the app around.
func TestCommandCenterMovesSelectionThroughTheVisibleOrder(t *testing.T) {
	harness := newRegistryHarness(t)
	oldest := harness.createConversation("conversation-oldest", "Oldest", nil)
	middle := harness.createConversation("conversation-middle", "Middle", nil)
	newest := harness.createConversation("conversation-newest", "Newest", nil)
	registry := harness.start()
	center := newTestCommandCenter(t, registry)
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	// With nothing selected, either direction starts at the most recent
	// workstream, because that is the work the next request is most likely about.
	first := dispatch(t, center, moveSelection(DirectorSelectionNext))
	requireSelection(t, first, newest)

	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionNext)), middle)
	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionNext)), oldest)
	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionNext)), oldest)
	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionPrevious)), middle)
	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionPrevious)), newest)
	requireSelection(t, dispatch(t, center, moveSelection(DirectorSelectionPrevious)), newest)

	// A dispatch reports what the app decided; the durable selection arrives
	// through the pushed stream like every other change.
	awaitSnapshotSelection(t, center, subscription, newest)
	if order := snapshotOrder(t, center); order != [3]string{newest, middle, oldest} {
		t.Fatalf("navigating reordered the list the user navigates: %v", order)
	}
}

// snapshotOrder is the order the shell draws the workstream strip in. Selection
// must not change it.
func snapshotOrder(t *testing.T, center *CommandCenter) [3]string {
	t.Helper()
	snapshot, err := center.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if len(snapshot.Workstreams) != 3 {
		t.Fatalf("snapshot holds %d workstreams, want 3", len(snapshot.Workstreams))
	}
	return [3]string{
		snapshot.Workstreams[0].Workstream.ID,
		snapshot.Workstreams[1].Workstream.ID,
		snapshot.Workstreams[2].Workstream.ID,
	}
}

// awaitSnapshotSelection blocks on the pushed stream until the app-scoped
// snapshot reports the selection the dispatch reported.
func awaitSnapshotSelection(
	t *testing.T,
	center *CommandCenter,
	subscription DirectorEventSubscription,
	workstreamID string,
) {
	t.Helper()
	for {
		snapshot, err := center.Snapshot()
		if err != nil {
			t.Fatalf("Snapshot: %v", err)
		}
		if snapshot.SelectedWorkstreamID != nil && *snapshot.SelectedWorkstreamID == workstreamID {
			return
		}
		awaitEvent(t, subscription, DirectorEventSelectionChanged)
	}
}

// TestCommandCenterMoveSelectionWithNoWorkstreams proves the empty app is a real
// product state rather than an error: there is nothing to select, and the
// dispatch says so instead of failing.
func TestCommandCenterMoveSelectionWithNoWorkstreams(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	center := newTestCommandCenter(t, registry)

	receipt := dispatch(t, center, moveSelection(DirectorSelectionNext))
	if receipt.SelectedWorkstreamID != nil {
		t.Fatalf("empty registry selected %q", *receipt.SelectedWorkstreamID)
	}
}

// TestCommandCenterRejectsUnauthorizedIntents proves the boundary validates
// before it writes: an unknown workstream, a malformed intent, and an unknown
// direction are all rejected as the caller's request rather than committed or
// repaired.
func TestCommandCenterRejectsUnauthorizedIntents(t *testing.T) {
	harness := newRegistryHarness(t)
	known := harness.createConversation("conversation-known", "Known", nil)
	registry := harness.start()
	center := newTestCommandCenter(t, registry)

	for name, intent := range map[string]DirectorIntent{
		"unknown workstream": selectWorkstream("workstream:missing"),
		"unknown direction":  moveSelection(DirectorSelectionDirection("sideways")),
		"unknown kind":       {Kind: DirectorIntentKind("open_pane")},
		"missing payload":    {Kind: DirectorIntentSelectWorkstream},
		"two payloads": {
			Kind:             DirectorIntentSelectWorkstream,
			SelectWorkstream: &DirectorSelectWorkstreamIntent{WorkstreamID: known},
			MoveSelection:    &DirectorMoveSelectionIntent{Direction: DirectorSelectionNext},
		},
	} {
		if _, err := center.Dispatch(context.Background(), intent); !errors.Is(err, ErrDirectorIntentRejected) {
			t.Fatalf("dispatching an intent with %s returned %v", name, err)
		}
	}

	snapshot, err := center.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot: %v", err)
	}
	if snapshot.SelectedWorkstreamID != nil {
		t.Fatalf("a rejected intent moved selection to %q", *snapshot.SelectedWorkstreamID)
	}
}

// TestCommandCenterReportsUnavailableRegistry proves the shell can tell a
// runtime condition from a bad request: a command center whose registry is not
// running is unavailable, not a rejected intent.
func TestCommandCenterReportsUnavailableRegistry(t *testing.T) {
	harness := newRegistryHarness(t)
	workstreamID := harness.createConversation("conversation-stopped", "Stopped", nil)
	registry, err := NewRegistry(harness.store, harness)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	center := newTestCommandCenter(t, registry)

	if _, err := center.Snapshot(); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("Snapshot before start returned %v", err)
	}
	if _, err := center.Subscribe(DirectorEventCursor{}); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("Subscribe before start returned %v", err)
	}
	if _, err := center.Dispatch(context.Background(), selectWorkstream(workstreamID)); !errors.Is(err, ErrDirectorUnavailable) {
		t.Fatalf("Dispatch before start returned %v", err)
	}
}

func requireSelection(t *testing.T, receipt DirectorReceipt, workstreamID string) {
	t.Helper()
	if receipt.SelectedWorkstreamID == nil {
		t.Fatalf("receipt selects nothing, want %q", workstreamID)
	}
	if *receipt.SelectedWorkstreamID != workstreamID {
		t.Fatalf("receipt selects %q, want %q", *receipt.SelectedWorkstreamID, workstreamID)
	}
}
