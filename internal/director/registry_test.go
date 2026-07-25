package director

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"setta/internal/conversation"
)

// TestRegistryAdmitsFolderlessAndFolderBoundConversations proves the product
// rule the pane workspace could not express: a conversation with no folder is a
// first-class workstream, and a folder is a resource one binds rather than the
// identity it needs to exist.
func TestRegistryAdmitsFolderlessAndFolderBoundConversations(t *testing.T) {
	harness := newRegistryHarness(t)
	folderless := harness.createConversation("conversation-folderless", "Plan the migration", nil)
	workspaceID := registryTestWorkspaceID
	bound := harness.createConversation("conversation-bound", "Fix the parser", &workspaceID)

	registry := harness.start()
	snapshot := requireSnapshot(t, registry)

	if len(snapshot.Workstreams) != 2 {
		t.Fatalf("snapshot holds %d workstreams, want 2", len(snapshot.Workstreams))
	}
	if snapshot.HasMoreWorkstreams {
		t.Fatalf("snapshot reports more workstreams than the two it holds")
	}
	folderlessEntry := findEntry(t, snapshot, folderless)
	if folderlessEntry.Workstream.ResourceScope.Kind != WorkstreamResourceScopeFolderless {
		t.Fatalf("folderless workstream scope = %q", folderlessEntry.Workstream.ResourceScope.Kind)
	}
	if folderlessEntry.Workstream.Status != WorkstreamStatusIdle {
		t.Fatalf("new workstream status = %q, want idle", folderlessEntry.Workstream.Status)
	}
	boundEntry := findEntry(t, snapshot, bound)
	if boundEntry.Workstream.ResourceScope.Kind != WorkstreamResourceScopeFolder {
		t.Fatalf("folder-bound workstream scope = %q", boundEntry.Workstream.ResourceScope.Kind)
	}
	if boundEntry.Workstream.ResourceScope.Folder.RootPath != "/tmp/setta-registry-alpha" {
		t.Fatalf("folder scope root path = %q", boundEntry.Workstream.ResourceScope.Folder.RootPath)
	}
	if len(boundEntry.Workstream.ResourceBindings) != 1 {
		t.Fatalf("folder-bound workstream holds %d bindings, want 1", len(boundEntry.Workstream.ResourceBindings))
	}
	if snapshot.Aggregates.WorkstreamCount != 2 || snapshot.Aggregates.RunningCount != 0 {
		t.Fatalf("aggregates = %+v", snapshot.Aggregates)
	}
	if snapshot.SelectedWorkstreamID != nil {
		t.Fatalf("a registry with no selection selects %q", *snapshot.SelectedWorkstreamID)
	}
}

// TestRegistryPushesWorkstreamAndGraphChanges proves the live path: a durable
// fact arriving produces a registry row update and the graph delta it justifies,
// with no refresh, poll, or re-read from the subscriber.
func TestRegistryPushesWorkstreamAndGraphChanges(t *testing.T) {
	harness := newRegistryHarness(t)
	workstreamID := harness.createConversation("conversation-live", "Ship the release", nil)
	registry := harness.start()
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	harness.startTurn("conversation-live", "turn-1")
	running := awaitWorkstreamStatus(t, subscription, workstreamID, WorkstreamStatusRunning)
	if running.ActiveRunID == nil || *running.ActiveRunID != "turn-1" {
		t.Fatalf("running workstream active run = %v", running.ActiveRunID)
	}

	accepted := harness.acceptInput("conversation-live", "turn-1", "ship the release")
	graph := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if graph.GraphUpdated.WorkstreamID != workstreamID {
		t.Fatalf("graph event names workstream %q", graph.GraphUpdated.WorkstreamID)
	}
	if len(graph.GraphUpdated.Nodes) == 0 {
		t.Fatalf("graph event carries no nodes")
	}
	node := graph.GraphUpdated.Nodes[0]
	if node.Kind != SemanticNodeUserGoal {
		t.Fatalf("first node kind = %q, want %q", node.Kind, SemanticNodeUserGoal)
	}
	if node.PublicSummary != "ship the release" {
		t.Fatalf("goal node summary = %q", node.PublicSummary)
	}
	if len(node.SourceEventIDs) == 0 || node.SourceEventIDs[0] != accepted.ID {
		t.Fatalf("goal node provenance = %v, want the accepted input event", node.SourceEventIDs)
	}

	snapshot := requireSnapshot(t, registry)
	if len(snapshot.Graphs) != 1 {
		t.Fatalf("snapshot holds %d graphs, want the one adjacent workstream", len(snapshot.Graphs))
	}
	if snapshot.Graphs[0].DetailLevel != WorkstreamDetailAdjacent {
		t.Fatalf("unselected workstream graph detail = %q", snapshot.Graphs[0].DetailLevel)
	}
}

func TestRegistryPushesSelectedWorkstreamDetailText(t *testing.T) {
	harness := newRegistryHarness(t)
	workstreamID := harness.createConversation("conversation-text", "Explain the result", nil)
	registry := harness.start()
	if _, err := registry.SelectWorkstream(context.Background(), workstreamID); err != nil {
		t.Fatalf("SelectWorkstream: %v", err)
	}
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	harness.startTurn("conversation-text", "turn-text")
	harness.appendTrajectory(
		"conversation-text",
		stringPointer("turn-text"),
		conversation.TrajectoryEventAgentPublicTextDelta,
		conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.AgentPublicTextDelta = &conversation.TrajectoryAgentPublicTextDelta{
				ProviderItemID: "provider-message-text",
				Delta:          "The result is ready.",
			}
		},
	)
	assistant := awaitEvent(t, subscription, DirectorEventTextDelta)
	if assistant.TextDelta.WorkstreamID != workstreamID ||
		assistant.TextDelta.RunID == nil ||
		*assistant.TextDelta.RunID != "turn-text" ||
		assistant.TextDelta.Surface != DirectorTextSurfaceAssistantMessage ||
		assistant.TextDelta.Text != "The result is ready." {
		t.Fatalf("assistant text event = %+v", assistant.TextDelta)
	}

	harness.appendTrajectory(
		"conversation-text",
		stringPointer("turn-text"),
		conversation.TrajectoryEventPublicReasoningSummaryUpdated,
		conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.PublicReasoningSummaryUpdated =
				&conversation.TrajectoryPublicReasoningSummaryUpdated{
					ProviderItemID: "provider-reasoning-text",
					Summary:        []string{"Checked the inputs.", "Compared the outputs."},
				}
		},
	)
	reasoning := awaitEvent(t, subscription, DirectorEventTextDelta)
	if reasoning.TextDelta.Surface != DirectorTextSurfaceReasoningSummary ||
		reasoning.TextDelta.Text != "Checked the inputs.\n\nCompared the outputs." {
		t.Fatalf("reasoning text event = %+v", reasoning.TextDelta)
	}

	harness.appendTrajectory(
		"conversation-text",
		stringPointer("turn-text"),
		conversation.TrajectoryEventActivityProgressed,
		conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.ActivityProgressed = &conversation.TrajectoryActivityProgressed{
				ActivityID: "provider-activity-text",
				Progress:   "Compiled 12 files.",
			}
		},
	)
	progress := awaitEvent(t, subscription, DirectorEventTextDelta)
	if progress.TextDelta.Surface != DirectorTextSurfaceProcessOutput ||
		progress.TextDelta.Text != "Compiled 12 files." {
		t.Fatalf("process text event = %+v", progress.TextDelta)
	}
}

func TestBestEffortOverflowResyncsInsteadOfCreatingACursorGap(t *testing.T) {
	const streamID = "director:m-overflow"
	registry := &Registry{
		streamID: streamID,
		sequence: maxPendingDirectorEvents,
		now: func() time.Time {
			return registryTestEpoch
		},
	}
	subscription := &registrySubscription{
		registry: registry,
		events:   make(chan DirectorEvent),
		aborted:  make(chan struct{}),
	}
	subscription.signal = sync.NewCond(&subscription.mutex)
	for sequence := 1; sequence <= maxPendingDirectorEvents; sequence++ {
		subscription.enqueue(DirectorEvent{
			Kind:     DirectorEventWorkstreamUpdated,
			StreamID: streamID,
			Sequence: sequence,
		})
	}
	subscription.enqueue(DirectorEvent{
		Kind:     DirectorEventTextDelta,
		StreamID: streamID,
		Sequence: maxPendingDirectorEvents + 1,
	})

	if len(subscription.pending) != 1 ||
		subscription.pending[0].Kind != DirectorEventResyncRequired ||
		!subscription.terminal ||
		!subscription.closed {
		t.Fatalf(
			"overflowed subscription = pending:%+v terminal:%t closed:%t",
			subscription.pending,
			subscription.terminal,
			subscription.closed,
		)
	}
}

// TestRegistryTracksApprovalsAsActionableState proves an approval is app-scoped
// state the rails can act on from anywhere, and that resolving it returns the
// workstream to running without anyone recomputing it.
func TestRegistryTracksApprovalsAsActionableState(t *testing.T) {
	harness := newRegistryHarness(t)
	workstreamID := harness.createConversation("conversation-approval", "Run the migration", nil)
	registry := harness.start()
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	harness.startTurn("conversation-approval", "turn-1")
	harness.acceptInput("conversation-approval", "turn-1", "run the migration")
	harness.requestApproval("conversation-approval", "turn-1", "approval-1")

	awaiting := awaitWorkstreamStatus(t, subscription, workstreamID, WorkstreamStatusAwaitingApproval)
	if awaiting.UnresolvedApprovalCount != 1 {
		t.Fatalf("workstream reports %d unresolved approvals", awaiting.UnresolvedApprovalCount)
	}
	snapshot := requireSnapshot(t, registry)
	if len(snapshot.UnresolvedApprovals) != 1 {
		t.Fatalf("snapshot lists %d unresolved approvals", len(snapshot.UnresolvedApprovals))
	}
	approval := snapshot.UnresolvedApprovals[0]
	if approval.ID != "approval-1" || approval.WorkstreamID != workstreamID {
		t.Fatalf("unresolved approval = %+v", approval)
	}
	if approval.PublicSummary != "Run the migration" {
		t.Fatalf("approval public summary = %q", approval.PublicSummary)
	}
	if snapshot.Aggregates.AwaitingApprovalCount != 1 || snapshot.Aggregates.UnresolvedApprovalCount != 1 {
		t.Fatalf("aggregates = %+v", snapshot.Aggregates)
	}

	harness.resolveApproval("conversation-approval", "turn-1", "approval-1")
	resolved := awaitWorkstreamStatus(t, subscription, workstreamID, WorkstreamStatusRunning)
	if resolved.UnresolvedApprovalCount != 0 {
		t.Fatalf("resolved workstream still reports %d approvals", resolved.UnresolvedApprovalCount)
	}
	after := requireSnapshot(t, registry)
	if len(after.UnresolvedApprovals) != 0 {
		t.Fatalf("snapshot still lists %d unresolved approvals", len(after.UnresolvedApprovals))
	}

	harness.completeTurn("conversation-approval", "turn-1")
	completed := awaitWorkstreamStatus(t, subscription, workstreamID, WorkstreamStatusCompleted)
	if completed.ActiveRunID != nil {
		t.Fatalf("completed workstream still holds active run %q", *completed.ActiveRunID)
	}
	final := requireSnapshot(t, registry)
	if final.Aggregates.RunningCount != 0 || final.Aggregates.AwaitingApprovalCount != 0 {
		t.Fatalf("aggregates after completion = %+v", final.Aggregates)
	}
}

func TestApprovalWindowShiftRequiresTypedResync(t *testing.T) {
	harness := newRegistryHarness(t)
	harness.createConversation("conversation-approval-window", "Many approvals", nil)
	harness.startTurn("conversation-approval-window", "turn-approval-window")
	harness.acceptInput(
		"conversation-approval-window",
		"turn-approval-window",
		"request many approvals",
	)
	for index := 0; index < MaxSnapshotApprovals+1; index++ {
		harness.requestApproval(
			"conversation-approval-window",
			"turn-approval-window",
			fmt.Sprintf("approval-window-%03d", index),
		)
	}
	registry := harness.start()
	snapshot := requireSnapshot(t, registry)
	if len(snapshot.UnresolvedApprovals) != MaxSnapshotApprovals {
		t.Fatalf(
			"bounded approval window = %d, want %d",
			len(snapshot.UnresolvedApprovals),
			MaxSnapshotApprovals,
		)
	}
	subscription, err := registry.Subscribe(snapshot.EventCursor)
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	defer subscription.Unsubscribe()

	harness.resolveApproval(
		"conversation-approval-window",
		"turn-approval-window",
		"approval-window-000",
	)
	resolved := awaitEvent(t, subscription, DirectorEventApprovalUpdated)
	if resolved.ApprovalUpdated.Approval.ID != "approval-window-000" ||
		resolved.ApprovalUpdated.Approval.Status != ApprovalStatusApproved {
		t.Fatalf("resolved approval event = %+v", resolved.ApprovalUpdated.Approval)
	}
	resync := awaitEvent(t, subscription, DirectorEventResyncRequired)
	if resync.ResyncRequired.Reason != DirectorResyncCollectionWindowOverflow {
		t.Fatalf("approval window resync reason = %q", resync.ResyncRequired.Reason)
	}
}

// TestRegistrySelectionIsDurable proves selection is app state rather than pane
// state: it is committed as a durable fact, and a restart that only has the log
// lands on the same selected workstream.
func TestRegistrySelectionIsDurable(t *testing.T) {
	harness := newRegistryHarness(t)
	first := harness.createConversation("conversation-first", "First", nil)
	second := harness.createConversation("conversation-second", "Second", nil)
	registry := harness.start()
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	selected, err := registry.SelectWorkstream(context.Background(), second)
	if err != nil {
		t.Fatalf("SelectWorkstream: %v", err)
	}
	if selected == nil || *selected != second {
		t.Fatalf("SelectWorkstream reports selection %v, want %q", selected, second)
	}
	selection := awaitEvent(t, subscription, DirectorEventSelectionChanged)
	if selection.SelectionChanged.SelectedWorkstreamID == nil ||
		*selection.SelectionChanged.SelectedWorkstreamID != second {
		t.Fatalf("selection event = %+v", selection.SelectionChanged)
	}
	snapshot := requireSnapshot(t, registry)
	if snapshot.SelectedWorkstreamID == nil || *snapshot.SelectedWorkstreamID != second {
		t.Fatalf("snapshot selection = %v", snapshot.SelectedWorkstreamID)
	}
	if findEntry(t, snapshot, second).DetailLevel != WorkstreamDetailSelected {
		t.Fatalf("selected workstream is not projected at the selected detail level")
	}
	if findEntry(t, snapshot, first).DetailLevel == WorkstreamDetailSelected {
		t.Fatalf("two workstreams are projected as selected")
	}

	if err := registry.Close(); err != nil {
		t.Fatalf("close registry: %v", err)
	}
	restarted := harness.start()
	restartedSnapshot := requireSnapshot(t, restarted)
	if restartedSnapshot.SelectedWorkstreamID == nil || *restartedSnapshot.SelectedWorkstreamID != second {
		t.Fatalf("restarted selection = %v", restartedSnapshot.SelectedWorkstreamID)
	}
}

func TestCancelledSelectionWaitKeepsTheDurablePredecessorChain(t *testing.T) {
	harness := newRegistryHarness(t)
	first := harness.createConversation("conversation-selection-first", "First", nil)
	second := harness.createConversation("conversation-selection-second", "Second", nil)
	ctx, cancel := context.WithCancel(context.Background())
	store := &selectionWaitGateStore{
		DirectorFactStore: harness.store,
		cancelCommitWait:  cancel,
		followerWaiting:   make(chan struct{}),
		releaseFollower:   make(chan struct{}),
	}
	registry, err := NewRegistry(
		store,
		harness,
		WithRegistryClock(harness.clock),
		WithRegistryIdentity(harness.identity),
	)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}
	if err := registry.Start(context.Background()); err != nil {
		t.Fatalf("Start registry: %v", err)
	}
	t.Cleanup(func() {
		if err := registry.Close(); err != nil {
			t.Errorf("close registry: %v", err)
		}
	})
	<-store.followerWaiting

	if _, err := registry.SelectWorkstream(ctx, second); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled selection error = %v, want context cancellation", err)
	}
	close(store.releaseFollower)
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()
	selected, err := registry.SelectWorkstream(context.Background(), first)
	if err != nil {
		t.Fatalf("selection after a cancelled commit wait: %v", err)
	}
	if selected == nil || *selected != first {
		t.Fatalf("selection after cancellation = %v, want %s", selected, first)
	}
	snapshot := requireSnapshot(t, registry)
	if snapshot.SelectedWorkstreamID == nil || *snapshot.SelectedWorkstreamID != first {
		t.Fatalf("durable selection after cancellation = %v, want %s", snapshot.SelectedWorkstreamID, first)
	}
}

type selectionWaitGateStore struct {
	DirectorFactStore
	cancelCommitWait context.CancelFunc
	cancelOnce       sync.Once
	waitOnce         sync.Once
	followerWaiting  chan struct{}
	releaseFollower  chan struct{}
}

func (store *selectionWaitGateStore) Transact(
	ctx context.Context,
	operation string,
	run func(*conversation.WriteTransaction) error,
) ([]conversation.CommittedEvent, error) {
	events, err := store.DirectorFactStore.Transact(ctx, operation, run)
	if err == nil {
		store.cancelOnce.Do(store.cancelCommitWait)
	}
	return events, err
}

func (store *selectionWaitGateStore) WaitForCommittedEvents(
	ctx context.Context,
	cursor conversation.CommittedEventCursor,
	limit int,
) ([]conversation.CommittedEvent, error) {
	store.waitOnce.Do(func() {
		close(store.followerWaiting)
	})
	select {
	case <-store.releaseFollower:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return store.DirectorFactStore.WaitForCommittedEvents(ctx, cursor, limit)
}

// TestRegistryResumesASubscriptionFromItsCursor proves a subscriber that
// reconnects receives exactly what it missed, from the durable position its
// snapshot named.
func TestRegistryResumesASubscriptionFromItsCursor(t *testing.T) {
	harness := newRegistryHarness(t)
	workstreamID := harness.createConversation("conversation-resume", "Resume", nil)
	registry := harness.start()
	cursor := requireSnapshot(t, registry).EventCursor

	harness.startTurn("conversation-resume", "turn-1")
	harness.acceptInput("conversation-resume", "turn-1", "resume the work")

	subscription, err := registry.Subscribe(cursor)
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	defer subscription.Unsubscribe()
	running := awaitWorkstreamStatus(t, subscription, workstreamID, WorkstreamStatusRunning)
	if running.ActiveRunID == nil {
		t.Fatalf("resumed workstream has no active run")
	}
	graph := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if graph.Sequence <= cursor.Sequence {
		t.Fatalf("replayed event sequence %d is not after the cursor %d", graph.Sequence, cursor.Sequence)
	}
	if graph.StreamID != cursor.StreamID {
		t.Fatalf("replayed event stream %q does not match the cursor stream %q", graph.StreamID, cursor.StreamID)
	}
}

// TestRegistryResyncsCursorsItCannotReplay proves the stream says so with a
// typed reason instead of leaving a stale renderer to poll for the truth.
func TestRegistryResyncsCursorsItCannotReplay(t *testing.T) {
	harness := newRegistryHarness(t)
	harness.createConversation("conversation-resync", "Resync", nil)
	registry := harness.start()
	cursor := requireSnapshot(t, registry).EventCursor

	for _, testCase := range []struct {
		name   string
		cursor DirectorEventCursor
		reason DirectorResyncReason
	}{
		{
			name:   "stream epoch changed",
			cursor: DirectorEventCursor{StreamID: DirectorEventStreamPrefix + "m0", Sequence: 0},
			reason: DirectorResyncEventStreamChanged,
		},
		{
			name:   "cursor ahead of the stream",
			cursor: DirectorEventCursor{StreamID: cursor.StreamID, Sequence: cursor.Sequence + 5},
			reason: DirectorResyncEventBeforeSnapshot,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			subscription, err := registry.Subscribe(testCase.cursor)
			if err != nil {
				t.Fatalf("Subscribe: %v", err)
			}
			defer subscription.Unsubscribe()
			event := awaitEvent(t, subscription, DirectorEventResyncRequired)
			if event.ResyncRequired.Reason != testCase.reason {
				t.Fatalf("resync reason = %q, want %q", event.ResyncRequired.Reason, testCase.reason)
			}
			if event.ResyncRequired.CurrentStreamID != cursor.StreamID {
				t.Fatalf("resync names current stream %q", event.ResyncRequired.CurrentStreamID)
			}
			if _, open := <-subscription.Events(); open {
				t.Fatalf("a resynced subscription kept delivering events")
			}
		})
	}
}

// TestRegistryProjectsForksAsChildWorkstreams proves parentage survives the
// ordering the durable log commits it in: the branch record lands after the
// conversation record it describes, and the child is still projected as a child.
func TestRegistryProjectsForksAsChildWorkstreams(t *testing.T) {
	harness := newRegistryHarness(t)
	parent := harness.createConversation("conversation-parent", "Parent", nil)
	child := harness.createConversation("conversation-child", "Child", nil)
	harness.publishBranch("conversation-child", "conversation-parent")

	registry := harness.start()
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	harness.startTurn("conversation-child", "turn-1")
	harness.acceptInput("conversation-child", "turn-1", "work the fork")
	graph := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if graph.GraphUpdated.WorkstreamID != child {
		t.Fatalf("graph event names workstream %q, want the child", graph.GraphUpdated.WorkstreamID)
	}

	snapshot := requireSnapshot(t, registry)
	childEntry := findEntry(t, snapshot, child)
	if childEntry.Workstream.ParentID == nil || *childEntry.Workstream.ParentID != parent {
		t.Fatalf("child workstream parent = %v, want %q", childEntry.Workstream.ParentID, parent)
	}
}

func TestBackgroundUpdateDoesNotRerenderUnrelatedWorkstreams(t *testing.T) {
	harness := newRegistryHarness(t)
	var oldest string
	var selected string
	for index := 0; index < 100; index++ {
		workstreamID := harness.createConversation(
			fmt.Sprintf("conversation-background-%03d", index),
			fmt.Sprintf("Background work %03d", index),
			nil,
		)
		if index == 0 {
			oldest = workstreamID
		}
		selected = workstreamID
	}
	harness.appendFact(DirectorFactEvent{
		Kind:               DirectorFactWorkstreamSelected,
		WorkstreamID:       &selected,
		Actor:              SemanticActorUser,
		WorkstreamSelected: &DirectorWorkstreamSelected{},
	})
	registry := harness.start()
	before := requireSnapshot(t, registry)
	if len(before.Workstreams) != 100 {
		t.Fatalf("snapshot workstreams = %d, want 100", len(before.Workstreams))
	}
	if findEntry(t, before, oldest).DetailLevel != WorkstreamDetailBackground {
		t.Fatalf("oldest workstream is not background before its update")
	}
	subscription, err := registry.Subscribe(before.EventCursor)
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	defer subscription.Unsubscribe()

	harness.updateConversationTitle("conversation-background-000", "Background work updated")
	updated := awaitEvent(t, subscription, DirectorEventWorkstreamUpdated)
	if updated.WorkstreamUpdated.Entry.Workstream.ID != oldest {
		t.Fatalf("first update names %s, want %s",
			updated.WorkstreamUpdated.Entry.Workstream.ID, oldest)
	}
	after := requireSnapshot(t, registry)
	changedLevels := map[string]bool{}
	beforeLevels := map[string]WorkstreamDetailLevel{}
	for _, entry := range before.Workstreams {
		beforeLevels[entry.Workstream.ID] = entry.DetailLevel
	}
	for _, entry := range after.Workstreams {
		if beforeLevels[entry.Workstream.ID] != entry.DetailLevel {
			changedLevels[entry.Workstream.ID] = true
		}
	}
	if !changedLevels[oldest] || len(changedLevels) != 2 {
		t.Fatalf("detail-level changes = %v, want updated background plus one displaced adjacent", changedLevels)
	}

	registry.mutex.Lock()
	published := append([]DirectorEvent{}, registry.retained...)
	registry.mutex.Unlock()
	for _, event := range published {
		switch event.Kind {
		case DirectorEventWorkstreamUpdated:
			workstreamID := event.WorkstreamUpdated.Entry.Workstream.ID
			if !changedLevels[workstreamID] {
				t.Fatalf("unrelated workstream %s rerendered", workstreamID)
			}
		case DirectorEventGraphUpdated:
			t.Fatalf("title-only background update published graph work: %+v", event.GraphUpdated)
		case DirectorEventSelectionChanged:
			t.Fatal("background update republished selection")
		}
	}
}

func TestLiveWindowEvictsTheRowDisplacedByAnOffWindowUpdate(t *testing.T) {
	harness := newRegistryHarness(t)
	var oldest string
	for index := 0; index < MaxSnapshotWorkstreams+1; index++ {
		workstreamID := harness.createConversation(
			fmt.Sprintf("conversation-window-%03d", index),
			fmt.Sprintf("Windowed work %03d", index),
			nil,
		)
		if index == 0 {
			oldest = workstreamID
		}
	}
	registry := harness.start()
	before := requireSnapshot(t, registry)
	if len(before.Workstreams) != MaxSnapshotWorkstreams || !before.HasMoreWorkstreams {
		t.Fatalf(
			"bounded snapshot = %d workstreams hasMore=%t",
			len(before.Workstreams),
			before.HasMoreWorkstreams,
		)
	}
	beforeIDs := map[string]bool{}
	for _, entry := range before.Workstreams {
		beforeIDs[entry.Workstream.ID] = true
	}
	if beforeIDs[oldest] {
		t.Fatalf("oldest workstream %s unexpectedly started inside the live window", oldest)
	}
	subscription, err := registry.Subscribe(before.EventCursor)
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	defer subscription.Unsubscribe()

	harness.updateConversationTitle("conversation-window-000", "Newest windowed work")
	updated := awaitEvent(t, subscription, DirectorEventWorkstreamUpdated)
	if updated.WorkstreamUpdated.Entry.Workstream.ID != oldest {
		t.Fatalf(
			"live-window entrant = %s, want %s",
			updated.WorkstreamUpdated.Entry.Workstream.ID,
			oldest,
		)
	}
	removed := awaitEvent(t, subscription, DirectorEventWorkstreamRemoved)
	displaced := removed.WorkstreamRemoved.WorkstreamID
	if !beforeIDs[displaced] || displaced == oldest {
		t.Fatalf("live-window removal = %s, want one prior window member", displaced)
	}

	after := requireSnapshot(t, registry)
	if len(after.Workstreams) != MaxSnapshotWorkstreams || !after.HasMoreWorkstreams {
		t.Fatalf(
			"updated bounded snapshot = %d workstreams hasMore=%t",
			len(after.Workstreams),
			after.HasMoreWorkstreams,
		)
	}
	afterIDs := map[string]bool{}
	for _, entry := range after.Workstreams {
		afterIDs[entry.Workstream.ID] = true
	}
	if !afterIDs[oldest] || afterIDs[displaced] {
		t.Fatalf(
			"updated live window retained entrant=%t displaced=%t",
			afterIDs[oldest],
			afterIDs[displaced],
		)
	}
}
