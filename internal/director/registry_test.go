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

// TestArtifactsArePublishedWithOrWithoutAFolder proves the artifact half of the
// same product rule: publishing a durable document never needed the user's
// files, so a workstream that bound no folder lists its artifacts in the rail
// beside a bound one's, addressed by the conversation that published them.
func TestArtifactsArePublishedWithOrWithoutAFolder(t *testing.T) {
	harness := newRegistryHarness(t)
	folderless := harness.createConversation("conversation-folderless", "Draft the release notes", nil)
	workspaceID := registryTestWorkspaceID
	bound := harness.createConversation("conversation-bound", "Summarize the parser", &workspaceID)
	harness.startTurn("conversation-folderless", "turn-folderless-1")
	harness.emitArtifact("conversation-folderless", "turn-folderless-1", "artifact-folderless", "Release notes")
	harness.completeTurn("conversation-folderless", "turn-folderless-1")
	harness.startTurn("conversation-bound", "turn-bound-1")
	harness.emitArtifact("conversation-bound", "turn-bound-1", "artifact-bound", "Parser summary")
	harness.completeTurn("conversation-bound", "turn-bound-1")

	registry := harness.start()
	snapshot := requireSnapshot(t, registry)

	if len(snapshot.Artifacts) != 2 {
		t.Fatalf("snapshot holds %d artifacts, want 2", len(snapshot.Artifacts))
	}
	unbound := findArtifact(t, snapshot, "artifact-folderless")
	if unbound.WorkspaceID != nil {
		t.Fatalf("folderless artifact carries workspace %q", *unbound.WorkspaceID)
	}
	if unbound.WorkstreamID != folderless {
		t.Fatalf("folderless artifact workstream = %q, want %q", unbound.WorkstreamID, folderless)
	}
	if unbound.ConversationID != "conversation-folderless" {
		t.Fatalf("folderless artifact conversation = %q", unbound.ConversationID)
	}
	if unbound.Status != ArtifactStatusAvailable {
		t.Fatalf("folderless artifact status = %q, want available", unbound.Status)
	}
	attached := findArtifact(t, snapshot, "artifact-bound")
	if attached.WorkspaceID == nil || *attached.WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("bound artifact workspace = %v", attached.WorkspaceID)
	}
	if attached.WorkstreamID != bound {
		t.Fatalf("bound artifact workstream = %q, want %q", attached.WorkstreamID, bound)
	}
	if snapshot.Aggregates.ArtifactCount != 2 {
		t.Fatalf("aggregate artifact count = %d, want 2", snapshot.Aggregates.ArtifactCount)
	}
}

func findArtifact(t *testing.T, snapshot DirectorSnapshot, artifactID string) WorkstreamArtifact {
	t.Helper()
	for _, artifact := range snapshot.Artifacts {
		if artifact.ID == artifactID {
			return artifact
		}
	}
	t.Fatalf("snapshot holds no artifact %q", artifactID)
	return WorkstreamArtifact{}
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
	workstreamGraph := requireWorkstreamGraph(t, snapshot, workstreamID)
	if workstreamGraph.DetailLevel != WorkstreamDetailAdjacent {
		t.Fatalf("unselected workstream graph detail = %q", workstreamGraph.DetailLevel)
	}
}

// TestNewWorkstreamIsAnchoredBeforeItRunsAnything proves the graph starts at the
// workstream: creating one is durable state the user acted to produce, so it is
// drawn as itself — pushed, without a reload — before anything is asked of it,
// and its first goal follows the anchor rather than starting from nothing.
func TestNewWorkstreamIsAnchoredBeforeItRunsAnything(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	workstreamID := harness.createConversation("conversation-anchor", "Plan the migration", nil)
	anchor, createdEventID := awaitAnchor(t, harness, subscription, workstreamID)
	if anchor.PublicSummary != "Plan the migration" {
		t.Fatalf("anchor summary = %q, want the workstream title", anchor.PublicSummary)
	}
	if len(anchor.SourceEventIDs) != 1 || anchor.SourceEventIDs[0] != createdEventID {
		t.Fatalf(
			"anchor provenance = %v, want committed conversation event %q",
			anchor.SourceEventIDs,
			createdEventID,
		)
	}

	snapshot := requireSnapshot(t, registry)
	entry := findEntry(t, snapshot, workstreamID)
	if entry.Workstream.Status != WorkstreamStatusIdle {
		t.Fatalf("anchored workstream status = %q, want idle", entry.Workstream.Status)
	}
	if entry.Workstream.LastMilestone != nil {
		t.Fatalf("an idle workstream reports milestone %+v", entry.Workstream.LastMilestone)
	}
	if anchored := requireWorkstreamGraph(t, snapshot, workstreamID); len(anchored.Nodes) != 1 {
		t.Fatalf("snapshot workstream graph = %+v, want the anchor", anchored)
	}
}

// TestRenamingAWorkstreamAdvancesTheSameAnchor proves a rename changes what the
// workstream is called without rewinding its causal chain: the anchor keeps its
// identity and gains the renaming event as further provenance.
func TestRenamingAWorkstreamAdvancesTheSameAnchor(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	workstreamID := harness.createConversation("conversation-anchor", "Plan the migration", nil)
	anchor, createdEventID := awaitAnchor(t, harness, subscription, workstreamID)

	harness.updateConversationTitle("conversation-anchor", "Migration plan")
	renamedEventID := harness.lastEvent
	renamed := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if len(renamed.GraphUpdated.Nodes) != 1 {
		t.Fatalf("rename published %+v, want the updated anchor", renamed.GraphUpdated.Nodes)
	}
	renamedAnchor := renamed.GraphUpdated.Nodes[0]
	if renamedAnchor.ID != anchor.ID || renamedAnchor.PublicSummary != "Migration plan" {
		t.Fatalf("renamed anchor = %+v", renamedAnchor)
	}
	if len(renamedAnchor.SourceEventIDs) != 2 ||
		renamedAnchor.SourceEventIDs[0] != createdEventID ||
		renamedAnchor.SourceEventIDs[1] != renamedEventID {
		t.Fatalf(
			"renamed anchor provenance = %v, want [%s %s]",
			renamedAnchor.SourceEventIDs,
			createdEventID,
			renamedEventID,
		)
	}

	replayed := requireSnapshot(t, harness.start())
	replayedAnchor := requireWorkstreamGraph(t, replayed, workstreamID).Nodes[0]
	if replayedAnchor.PublicSummary != "Migration plan" ||
		len(replayedAnchor.SourceEventIDs) != 2 {
		t.Fatalf("replayed anchor = %+v", replayedAnchor)
	}
}

// TestTheFirstGoalFollowsTheAnchor proves the workstream's first real fact
// chains from the anchor rather than starting from nothing.
func TestTheFirstGoalFollowsTheAnchor(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	workstreamID := harness.createConversation("conversation-anchor", "Plan the migration", nil)
	anchor, _ := awaitAnchor(t, harness, subscription, workstreamID)

	harness.startTurn("conversation-anchor", "turn-1")
	accepted := harness.acceptInput("conversation-anchor", "turn-1", "plan the migration")
	goal := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if len(goal.GraphUpdated.Nodes) != 1 || goal.GraphUpdated.Nodes[0].Kind != SemanticNodeUserGoal {
		t.Fatalf("accepted input published %+v", goal.GraphUpdated.Nodes)
	}
	// Nodes and edges are chunked into their own events, so the chain arrives
	// in the delta after the node it connects.
	chain := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if len(chain.GraphUpdated.Edges) != 1 {
		t.Fatalf("accepted input published %d edges, want the chain from the anchor", len(chain.GraphUpdated.Edges))
	}
	chained := chain.GraphUpdated.Edges[0]
	if chained.Kind != SemanticEdgeFollowedBy || chained.FromNodeID != anchor.ID {
		t.Fatalf("goal edge = %q from %q, want followed_by from the anchor", chained.Kind, chained.FromNodeID)
	}
	if chained.SourceEventIDs[0] != accepted.ID {
		t.Fatalf("goal edge provenance = %v, want the accepted input event", chained.SourceEventIDs)
	}
}

// awaitAnchor takes the pushed anchor a just-created workstream publishes, and
// the committed conversation event it was drawn from.
func awaitAnchor(
	t *testing.T,
	harness *registryHarness,
	subscription DirectorEventSubscription,
	workstreamID string,
) (SemanticNode, string) {
	t.Helper()
	graph := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if graph.GraphUpdated.WorkstreamID != workstreamID {
		t.Fatalf("graph event names workstream %q, want %q", graph.GraphUpdated.WorkstreamID, workstreamID)
	}
	if len(graph.GraphUpdated.Nodes) != 1 {
		t.Fatalf("registration published %d nodes, want the anchor", len(graph.GraphUpdated.Nodes))
	}
	anchor := graph.GraphUpdated.Nodes[0]
	if anchor.Kind != SemanticNodeWorkstream || anchor.Status != SemanticNodeStatusActive {
		t.Fatalf("anchor node = %q/%q", anchor.Kind, anchor.Status)
	}
	return anchor, harness.lastEvent
}

func TestAwaitRunTerminalDoesNotReturnForTheInterruptionRequest(t *testing.T) {
	harness := newRegistryHarness(t)
	conversationID := "conversation-terminal-wait"
	workstreamID := harness.createConversation(conversationID, "Stop safely", nil)
	runID := "turn-terminal-wait"
	harness.startTurn(conversationID, runID)
	harness.acceptInput(conversationID, runID, "stop safely")
	harness.appendTrajectory(
		conversationID,
		&runID,
		conversation.TrajectoryEventTurnStarted,
		conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.TurnStarted = &conversation.TrajectoryTurnStarted{
				Invocation: fixtureInvocation(runID),
			}
		},
	)
	registry := harness.start()
	if running := findEntry(t, requireSnapshot(t, registry), workstreamID).Workstream; running.Status != WorkstreamStatusRunning {
		t.Fatalf("workstream status before interruption = %s, want running", running.Status)
	}

	streamID, err := conversation.ConversationStreamID(conversationID)
	if err != nil {
		t.Fatalf("ConversationStreamID: %v", err)
	}
	registry.mutex.Lock()
	requestSequence := registry.state.streamSequences[streamID]
	registry.mutex.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	harness.appendTrajectory(
		conversationID,
		&runID,
		conversation.TrajectoryEventTurnInterrupted,
		conversation.TrajectoryActorUser,
		func(event *conversation.TrajectoryEvent) {
			event.TurnInterrupted = &conversation.TrajectoryTurnInterrupted{
				Reason: conversation.TurnInterruptionUserRequested,
			}
		},
	)
	requestSequence++
	if err := registry.AwaitConversationEvent(ctx, conversationID, requestSequence); err != nil {
		t.Fatalf("wait for interruption request: %v", err)
	}

	result := make(chan error, 1)
	go func() {
		result <- registry.AwaitRunTerminal(ctx, conversationID, runID, requestSequence)
	}()

	select {
	case err := <-result:
		t.Fatalf("terminal wait returned while the named run was active: %v", err)
	case <-time.After(20 * time.Millisecond):
	}

	harness.endTurn(conversationID, runID, conversation.TurnStatusCancelled, nil)
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("AwaitRunTerminal: %v", err)
		}
	case <-ctx.Done():
		t.Fatalf("terminal wait did not observe the cancelled turn: %v", ctx.Err())
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

func TestArchivingTheSelectedWorkstreamRemovesItFromTheLiveShell(t *testing.T) {
	harness := newRegistryHarness(t)
	first := harness.createConversation("conversation-active-first", "First", nil)
	second := harness.createConversation("conversation-active-second", "Second", nil)
	harness.appendFact(DirectorFactEvent{
		Kind:               DirectorFactWorkstreamSelected,
		WorkstreamID:       &second,
		Actor:              SemanticActorUser,
		WorkstreamSelected: &DirectorWorkstreamSelected{},
	})
	registry := harness.start()
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	harness.archiveConversation("conversation-active-second", "Second")
	removed := awaitEvent(t, subscription, DirectorEventWorkstreamRemoved)
	if removed.WorkstreamRemoved.WorkstreamID != second {
		t.Fatalf("archived workstream removal = %s, want %s", removed.WorkstreamRemoved.WorkstreamID, second)
	}

	snapshot := requireSnapshot(t, registry)
	if snapshot.SelectedWorkstreamID != nil {
		t.Fatalf("archived workstream remained selected: %v", snapshot.SelectedWorkstreamID)
	}
	if snapshot.Aggregates.WorkstreamCount != 1 ||
		len(snapshot.Workstreams) != 1 ||
		snapshot.Workstreams[0].Workstream.ID != first {
		t.Fatalf("active snapshot after archive = %+v", snapshot)
	}
	if _, err := registry.SelectWorkstream(context.Background(), second); err == nil {
		t.Fatal("archived workstream could be selected again")
	}

	harness.archiveConversation("conversation-active-first", "First")
	removed = awaitEvent(t, subscription, DirectorEventWorkstreamRemoved)
	if removed.WorkstreamRemoved.WorkstreamID != first {
		t.Fatalf("last workstream removal = %s, want %s", removed.WorkstreamRemoved.WorkstreamID, first)
	}
	selected, err := registry.MoveSelection(context.Background(), DirectorSelectionNext)
	if err != nil {
		t.Fatalf("MoveSelection with no active workstreams: %v", err)
	}
	if selected != nil {
		t.Fatalf("empty active registry reported archived selection %q", *selected)
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

// TestRegistryProjectsForksAsChildWorkstreams proves parentage reaches the
// projection: the branch record lands before the conversation record it
// describes, and the child is registered and anchored as a child.
func TestRegistryProjectsForksAsChildWorkstreams(t *testing.T) {
	harness := newRegistryHarness(t)
	parent := harness.createConversation("conversation-parent", "Parent", nil)
	harness.publishBranch("conversation-child", "conversation-parent")
	child := harness.createConversation("conversation-child", "Child", nil)

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
			// A row entering the visible window receives the graph its new level
			// promises, which for work that has never run is its anchor. Any
			// other workstream's graph would be a rerender.
			if !changedLevels[event.GraphUpdated.WorkstreamID] {
				t.Fatalf("title-only background update published graph work: %+v", event.GraphUpdated)
			}
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

func TestSelectedGraphClearsWhenItBecomesBackground(t *testing.T) {
	harness := newRegistryHarness(t)
	var oldest string
	var newest string
	for index := 0; index < MaxSnapshotAdjacentGraphs+2; index++ {
		workstreamID := harness.createConversation(
			fmt.Sprintf("conversation-level-%02d", index),
			fmt.Sprintf("Level work %02d", index),
			nil,
		)
		if index == 0 {
			oldest = workstreamID
		}
		newest = workstreamID
	}
	harness.appendFact(DirectorFactEvent{
		Kind:         DirectorFactWorkstreamSelected,
		WorkstreamID: &oldest,
		Actor:        SemanticActorUser,
		WorkstreamSelected: &DirectorWorkstreamSelected{
			PreviousWorkstreamID: nil,
		},
	})
	registry := harness.start()
	before := requireSnapshot(t, registry)
	if requireWorkstreamGraph(t, before, oldest).DetailLevel != WorkstreamDetailSelected {
		t.Fatalf("oldest workstream did not begin selected")
	}
	subscription, err := registry.Subscribe(before.EventCursor)
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	defer subscription.Unsubscribe()

	if _, err := registry.SelectWorkstream(context.Background(), newest); err != nil {
		t.Fatalf("SelectWorkstream: %v (registry failure: %v)", err, registry.Err())
	}
	cleared := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if cleared.GraphUpdated.WorkstreamID != oldest ||
		cleared.GraphUpdated.DetailLevel != WorkstreamDetailBackground ||
		len(cleared.GraphUpdated.RemovedNodeIDs) == 0 {
		t.Fatalf("background graph clear = %+v", cleared.GraphUpdated)
	}
	after := requireSnapshot(t, registry)
	for _, graph := range after.Graphs {
		if graph.WorkstreamID == oldest {
			t.Fatalf("background workstream retained graph %+v", graph)
		}
	}
}

// TestDirectorConversationIsPushedIntoTheLane proves the Director's own turns
// reach the canvas the way everything else does: the durable conversation is
// folded from the same log, and the lane's delta is pushed without a reload and
// without anything asking for it.
func TestDirectorConversationIsPushedIntoTheLane(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	request := directorLaneEntry("entry-request", conversation.DirectorConversationUserTurn, harness.now())
	request.Text = &conversation.DirectorConversationText{Text: "what is running?"}
	if err := harness.store.AppendDirectorConversation(
		context.Background(),
		[]conversation.DirectorConversationEntry{request},
	); err != nil {
		t.Fatalf("AppendDirectorConversation: %v", err)
	}

	pushed := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if pushed.GraphUpdated.WorkstreamID != DirectorLaneID {
		t.Fatalf("pushed graph names %q, want the director lane", pushed.GraphUpdated.WorkstreamID)
	}
	if len(pushed.GraphUpdated.Nodes) != 1 ||
		pushed.GraphUpdated.Nodes[0].Kind != SemanticNodeUserGoal ||
		pushed.GraphUpdated.Nodes[0].PublicSummary != "what is running?" {
		t.Fatalf("pushed director lane nodes = %+v", pushed.GraphUpdated.Nodes)
	}

	snapshot := requireSnapshot(t, registry)
	lane := requireWorkstreamGraph(t, snapshot, DirectorLaneID)
	if len(lane.Nodes) != 1 || lane.DetailLevel != WorkstreamDetailSelected {
		t.Fatalf("snapshot director lane = %+v", lane)
	}
	if len(snapshot.Workstreams) != 0 {
		t.Fatalf("the director lane was listed as work: %+v", snapshot.Workstreams)
	}
}

// TestRootCreateDecisionIsDrawnInTheDirectorLane proves a decision that started
// a workstream from nothing has a home. It was made before the work existed, so
// it belongs where the Director was — in its own lane — rather than nowhere.
func TestRootCreateDecisionIsDrawnInTheDirectorLane(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()
	subscription := subscribeFromSnapshot(t, registry)
	defer subscription.Unsubscribe()

	created, err := WorkstreamIDForConversation("conversation-created")
	if err != nil {
		t.Fatalf("WorkstreamIDForConversation: %v", err)
	}
	harness.appendFact(DirectorFactEvent{
		Kind:  DirectorFactDecisionCommitted,
		Actor: SemanticActorDirector,
		DecisionCommitted: &DirectorDecisionCommitted{
			Decision:             DirectorDecisionCreateWorkstream,
			IntentID:             "director-intent-1",
			PublicSummary:        "Started the workstream \"Parser rewrite\".",
			TargetWorkstreamID:   &created,
			WorkspaceRequirement: workspaceRequirementPointer(WorkspaceRequired),
		},
	})

	pushed := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if pushed.GraphUpdated.WorkstreamID != DirectorLaneID {
		t.Fatalf("pushed graph names %q, want the director lane", pushed.GraphUpdated.WorkstreamID)
	}
	if len(pushed.GraphUpdated.Nodes) != 1 ||
		pushed.GraphUpdated.Nodes[0].Kind != SemanticNodeDirectorDecision ||
		pushed.GraphUpdated.Nodes[0].PublicSummary != "Started the workstream \"Parser rewrite\"." {
		t.Fatalf("pushed director lane nodes = %+v", pushed.GraphUpdated.Nodes)
	}

	harness.createConversation("conversation-created", "Parser rewrite", nil)
	anchor := awaitEvent(t, subscription, DirectorEventGraphUpdated)
	if anchor.GraphUpdated.WorkstreamID != created {
		t.Fatalf("the created workstream published %q", anchor.GraphUpdated.WorkstreamID)
	}
	snapshot := requireSnapshot(t, registry)
	lane := requireWorkstreamGraph(t, snapshot, DirectorLaneID)
	if len(lane.Edges) != 0 {
		t.Fatalf("a root workstream was drawn as delegated work: %+v", lane.Edges)
	}
}
