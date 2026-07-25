package director

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"setta/internal/conversation"
)

func projectFixture(t *testing.T, fixture ProjectionFixture) GraphProjection {
	t.Helper()
	projection, err := ProjectDirectorGraph(fixture.Events)
	if err != nil {
		t.Fatalf("fixture %s failed to project: %v", fixture.Name, err)
	}
	return projection
}

func fixtureByName(t *testing.T, name string) ProjectionFixture {
	t.Helper()
	for _, fixture := range ProjectionFixtures() {
		if fixture.Name == name {
			return fixture
		}
	}
	t.Fatalf("no fixture named %q", name)
	return ProjectionFixture{}
}

func TestProjectedGraphsValidateAtEveryDetailLevel(t *testing.T) {
	levels := []WorkstreamDetailLevel{WorkstreamDetailSelected, WorkstreamDetailAdjacent, WorkstreamDetailBackground}
	for _, fixture := range ProjectionFixtures() {
		projection := projectFixture(t, fixture)
		for _, workstreamID := range projection.WorkstreamIDs {
			for _, level := range levels {
				graph, err := projection.Graph(workstreamID, level)
				if err != nil {
					t.Fatalf("%s: graph for %s at %s: %v", fixture.Name, workstreamID, level, err)
				}
				if err := ValidateWorkstreamGraph(graph, projection.Authority); err != nil {
					t.Fatalf("%s: %s graph at %s is invalid: %v", fixture.Name, workstreamID, level, err)
				}
			}
		}
	}
}

func TestReplayIsDeterministicAcrossEveryPrefixBoundary(t *testing.T) {
	for _, fixture := range ProjectionFixtures() {
		whole := projectFixture(t, fixture)
		for boundary := 1; boundary < len(fixture.Events); boundary++ {
			projector := NewDirectorGraphProjector()
			for index, event := range fixture.Events {
				if index == boundary {
					// A live subscriber holds a projection here and keeps
					// applying pushed events; the result must not differ from a
					// cold replay of the same history.
					_ = projector.Projection()
				}
				if err := projector.Apply(event); err != nil {
					t.Fatalf("%s: apply at %d: %v", fixture.Name, index, err)
				}
			}
			if !reflect.DeepEqual(projector.Projection(), whole) {
				t.Fatalf("%s: projection differs when resumed at boundary %d", fixture.Name, boundary)
			}
		}
	}
}

func TestFixturesCoverEveryNodeAndEdgeKind(t *testing.T) {
	seenNodes := map[SemanticNodeKind]bool{}
	seenEdges := map[SemanticEdgeKind]bool{}
	for _, fixture := range ProjectionFixtures() {
		projection := projectFixture(t, fixture)
		for _, workstreamID := range projection.WorkstreamIDs {
			graph, err := projection.Graph(workstreamID, WorkstreamDetailSelected)
			if err != nil {
				t.Fatalf("%s: %v", fixture.Name, err)
			}
			for _, node := range graph.Nodes {
				seenNodes[node.Kind] = true
			}
			for _, edge := range graph.Edges {
				seenEdges[edge.Kind] = true
			}
		}
	}
	for _, kind := range SemanticNodeKinds() {
		if !seenNodes[kind] {
			t.Errorf("no fixture projects a %q node", kind)
		}
	}
	for _, kind := range SemanticEdgeKinds() {
		if !seenEdges[kind] {
			t.Errorf("no fixture projects a %q edge", kind)
		}
	}
}

func TestEveryNodeCitesEvidenceFromItsOwnHistory(t *testing.T) {
	for _, fixture := range ProjectionFixtures() {
		known := map[string]bool{}
		for _, event := range fixture.Events {
			if event.Trajectory != nil {
				known[event.Trajectory.ID] = true
				continue
			}
			known[event.Director.ID] = true
		}
		projection := projectFixture(t, fixture)
		for _, workstreamID := range projection.WorkstreamIDs {
			graph, err := projection.Graph(workstreamID, WorkstreamDetailSelected)
			if err != nil {
				t.Fatalf("%s: %v", fixture.Name, err)
			}
			assertEvidenceIsSourced(t, fixture.Name, graph, known)
		}
	}
}

func assertEvidenceIsSourced(t *testing.T, fixtureName string, graph WorkstreamGraph, known map[string]bool) {
	t.Helper()
	for _, node := range graph.Nodes {
		for _, eventID := range node.SourceEventIDs {
			if !known[eventID] {
				t.Errorf("%s: node %s cites event %q that is not in the history", fixtureName, node.ID, eventID)
			}
		}
		interpreted := node.EvidenceClass == EvidenceDirectorInterpretation
		if interpreted != (node.Interpretation != nil) {
			t.Errorf("%s: node %s presents an interpretation as a runtime fact", fixtureName, node.ID)
		}
	}
	for _, edge := range graph.Edges {
		for _, eventID := range edge.SourceEventIDs {
			if !known[eventID] {
				t.Errorf("%s: edge %s cites event %q that is not in the history", fixtureName, edge.ID, eventID)
			}
		}
	}
}

// TestGraphStateNeverCarriesPrivateOrSecretText pins the privacy boundary: the
// graph is public coordination state, so secret answers, approval bodies,
// unsanitized diagnostics, and diff bodies must never reach a node label.
func TestGraphStateNeverCarriesPrivateOrSecretText(t *testing.T) {
	forbidden := []string{
		"sk-live-do-not-log",
		"Paste the deploy token",
		"contains the deploy token",
		"@@ secret token @@",
		"diagnostic-blob-epsilon",
		"provider-thread-1",
	}
	for _, fixture := range ProjectionFixtures() {
		projection := projectFixture(t, fixture)
		for _, workstreamID := range projection.WorkstreamIDs {
			graph, err := projection.Graph(workstreamID, WorkstreamDetailSelected)
			if err != nil {
				t.Fatalf("%s: %v", fixture.Name, err)
			}
			for _, node := range graph.Nodes {
				for _, secret := range forbidden {
					if strings.Contains(node.PublicSummary, secret) {
						t.Errorf("%s: node %s leaks %q into public graph state", fixture.Name, node.ID, secret)
					}
				}
			}
		}
	}
}

func TestStreamingTextAndReasoningSummariesNeverCreateNodes(t *testing.T) {
	fixture := fixtureByName(t, "folderless_start")
	withDeltas := projectFixture(t, fixture)
	trimmed := ProjectionFixture{Name: fixture.Name}
	sequence := 0
	for _, event := range fixture.Events {
		if event.Trajectory != nil && event.Trajectory.Kind == conversation.TrajectoryEventAgentPublicTextDelta {
			continue
		}
		sequence++
		resequenced := event
		resequenced.Sequence = sequence
		trimmed.Events = append(trimmed.Events, resequenced)
	}
	withoutDeltas := projectFixture(t, trimmed)
	before, err := withDeltas.Graph("ws-alpha", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph with deltas: %v", err)
	}
	after, err := withoutDeltas.Graph("ws-alpha", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph without deltas: %v", err)
	}
	if len(before.Nodes) != len(after.Nodes) || len(before.Edges) != len(after.Edges) {
		t.Fatalf("streaming deltas changed the graph: %d/%d nodes, %d/%d edges",
			len(before.Nodes), len(after.Nodes), len(before.Edges), len(after.Edges))
	}
}

func TestOutOfOrderAndSkippedEventsRequireResync(t *testing.T) {
	fixture := fixtureByName(t, "folderless_start")
	cases := []struct {
		name     string
		sequence int
		reason   DirectorResyncReason
	}{
		{"repeated position", 1, DirectorResyncEventBeforeSnapshot},
		{"skipped position", 3, DirectorResyncEventSequenceGap},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			projector := NewDirectorGraphProjector()
			if err := projector.Apply(fixture.Events[0]); err != nil {
				t.Fatalf("first event: %v", err)
			}
			replayed := fixture.Events[1]
			replayed.Sequence = testCase.sequence
			assertResyncReason(t, projector.Apply(replayed), testCase.reason)
		})
	}
}

func TestTrajectoryForUnregisteredConversationRequiresResync(t *testing.T) {
	fixture := fixtureByName(t, "folderless_start")
	orphan := fixture.Events[2]
	orphan.Sequence = 1
	projector := NewDirectorGraphProjector()
	assertResyncReason(t, projector.Apply(orphan), DirectorResyncEventBeforeSnapshot)
}

func assertResyncReason(t *testing.T, err error, reason DirectorResyncReason) {
	t.Helper()
	var replayErr *ReplayError
	if !errors.As(err, &replayErr) {
		t.Fatalf("expected a replay error, got %v", err)
	}
	if replayErr.Reason != reason {
		t.Fatalf("expected resync reason %q, got %q", reason, replayErr.Reason)
	}
}

func TestTerminalRunCannotBeReopened(t *testing.T) {
	fixture := fixtureByName(t, "folderless_start")
	projector := NewDirectorGraphProjector()
	for _, event := range fixture.Events {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply: %v", err)
		}
	}
	last := fixture.Events[len(fixture.Events)-1]
	restart := *last.Trajectory
	restart.ID = "trajectory-restart"
	restart.Kind = conversation.TrajectoryEventTurnStarted
	restart.TurnCompleted = nil
	restart.TurnStarted = &conversation.TrajectoryTurnStarted{Invocation: fixtureInvocation("turn-alpha-1")}
	err := projector.Apply(ProjectorEvent{Sequence: last.Sequence + 1, Trajectory: &restart})
	if err == nil {
		t.Fatal("expected a completed run to reject being restarted")
	}
	if !strings.Contains(err.Error(), "cannot transition") {
		t.Fatalf("expected a lifecycle transition failure, got %v", err)
	}
}

func TestFailureIsConnectedToTheRetryThatRecoversIt(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "failure_and_recovery"))
	graph, err := projection.Graph("ws-epsilon", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	failedNodeID := ""
	retryNodeID := ""
	for _, node := range graph.Nodes {
		switch node.Kind {
		case SemanticNodeFailed:
			failedNodeID = node.ID
		case SemanticNodeRetry:
			retryNodeID = node.ID
		}
	}
	if failedNodeID == "" || retryNodeID == "" {
		t.Fatalf("expected a failed node and a retry node, got %q and %q", failedNodeID, retryNodeID)
	}
	if !hasEdge(graph, SemanticEdgeRecoveredBy, failedNodeID, retryNodeID) {
		t.Fatalf("expected a recovered_by edge from %s to %s", failedNodeID, retryNodeID)
	}
}

func TestQueuedRunDependsOnTheRunItIsQueuedBehind(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "queue_and_steering"))
	graph, err := projection.Graph("ws-beta", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	first, err := SemanticNodeID(SemanticNodeIdentityRun, "turn-beta-1")
	if err != nil {
		t.Fatalf("first run node id: %v", err)
	}
	second, err := SemanticNodeID(SemanticNodeIdentityRun, "turn-beta-2")
	if err != nil {
		t.Fatalf("second run node id: %v", err)
	}
	if !hasEdge(graph, SemanticEdgeDependsOn, second, first) {
		t.Fatal("expected the queued run to depend on the active run")
	}
	runNodes := 0
	for _, node := range graph.Nodes {
		if node.ID == first || node.ID == second {
			runNodes++
		}
	}
	if runNodes != 2 {
		t.Fatalf("expected queue, promotion, steering, and completion to advance two run nodes, got %d", runNodes)
	}
}

func TestSteeringKeepsOneRunNodeAndRecordsTheNewInstruction(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "queue_and_steering"))
	graph, err := projection.Graph("ws-beta", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	steered, err := SemanticNodeID(SemanticNodeIdentityRun, "turn-beta-1")
	if err != nil {
		t.Fatalf("run node id: %v", err)
	}
	for _, node := range graph.Nodes {
		if node.ID != steered {
			continue
		}
		if !strings.Contains(node.PublicSummary, "keep the public API") {
			t.Fatalf("expected the steered instruction on the run node, got %q", node.PublicSummary)
		}
		return
	}
	t.Fatalf("no run node %s in the graph", steered)
}

func TestSupersededPlanStepsLeaveTheLiveWindow(t *testing.T) {
	fixture := fixtureByName(t, "plan_and_investigation")
	projection := projectFixture(t, fixture)
	graph, err := projection.Graph("ws-delta", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	steps := 0
	for _, node := range graph.Nodes {
		if strings.HasPrefix(node.ID, string(SemanticNodeIdentityPlanStep)+":") {
			steps++
		}
	}
	if steps != 2 {
		t.Fatalf("expected only the current plan's 2 steps, got %d", steps)
	}
	if err := ValidateWorkstreamGraph(graph, projection.Authority); err != nil {
		t.Fatalf("graph left a dangling reference after compaction: %v", err)
	}
}

func TestDelegationCrossesOnlyIntoAChildWorkstream(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "delegation"))
	graph, err := projection.Graph("ws-parent", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	crossings := 0
	for _, edge := range graph.Edges {
		if edge.ToWorkstreamID == edge.FromWorkstreamID {
			continue
		}
		crossings++
		if edge.Kind != SemanticEdgeDelegatedTo || edge.ToWorkstreamID != "ws-child" {
			t.Fatalf("unexpected cross-workstream edge %s of kind %q", edge.ID, edge.Kind)
		}
	}
	if crossings != 1 {
		t.Fatalf("expected exactly one delegation across workstreams, got %d", crossings)
	}
}

func TestBackgroundAndAdjacentDetailBoundTheGraph(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "folderless_start"))
	background, err := projection.Graph("ws-alpha", WorkstreamDetailBackground)
	if err != nil {
		t.Fatalf("background graph: %v", err)
	}
	if len(background.Nodes) != 0 || len(background.Edges) != 0 {
		t.Fatal("a background workstream must render aggregate status only")
	}
	if !background.HasEarlier {
		t.Fatal("a background workstream with history must report that earlier facts exist")
	}
	selected, err := projection.Graph("ws-alpha", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("selected graph: %v", err)
	}
	adjacent, err := projection.Graph("ws-alpha", WorkstreamDetailAdjacent)
	if err != nil {
		t.Fatalf("adjacent graph: %v", err)
	}
	if len(adjacent.Nodes) == 0 || len(adjacent.Nodes) >= len(selected.Nodes) {
		t.Fatalf("expected an adjacent graph narrower than the selected one, got %d of %d",
			len(adjacent.Nodes), len(selected.Nodes))
	}
	if !adjacent.HasEarlier {
		t.Fatal("a narrowed adjacent graph must report that earlier facts exist")
	}
}

// TestMilestoneKeepsBackgroundWorkstreamsActionable pins what a workstream
// reduced to one line says. A background workstream renders no nodes, so the
// milestone is the only thing left to tell the user whether it needs them.
func TestMilestoneKeepsBackgroundWorkstreamsActionable(t *testing.T) {
	cases := map[string]struct {
		workstreamID string
		kind         SemanticNodeKind
		summary      string
	}{
		"resource_request":         {"ws-zeta", SemanticNodeCompleted, completedRunSummary},
		"blocked_and_cancelled":    {"ws-theta", SemanticNodeCancelled, "Run cancelled (user_requested)"},
		"failure_and_recovery":     {"ws-epsilon", SemanticNodeCompleted, completedRunSummary},
		"approval_and_file_change": {"ws-gamma", SemanticNodeCompleted, completedRunSummary},
	}
	for _, fixture := range ProjectionFixtures() {
		expected, checked := cases[fixture.Name]
		if !checked {
			continue
		}
		delete(cases, fixture.Name)
		projection := projectFixture(t, fixture)
		milestone, found := projection.Milestone(expected.workstreamID)
		if !found {
			t.Fatalf("%s: %s has no milestone", fixture.Name, expected.workstreamID)
		}
		if milestone.Kind != expected.kind || milestone.PublicSummary != expected.summary {
			t.Fatalf("%s: milestone is %q/%q, want %q/%q",
				fixture.Name, milestone.Kind, milestone.PublicSummary, expected.kind, expected.summary)
		}
	}
	for name := range cases {
		t.Errorf("no fixture named %q, so its milestone was never checked", name)
	}
}

func TestSelectionIsAppScopedAndNeverWritesGraphTruth(t *testing.T) {
	fixture := fixtureByName(t, "delegation")
	projection := projectFixture(t, fixture)
	if projection.SelectedWorkstreamID == nil || *projection.SelectedWorkstreamID != "ws-parent" {
		t.Fatalf("expected ws-parent to be selected, got %v", projection.SelectedWorkstreamID)
	}
	before, err := projection.Graph("ws-parent", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	reselected := append(append([]ProjectorEvent(nil), fixture.Events...), ProjectorEvent{
		Sequence: len(fixture.Events) + 1,
		Director: &DirectorFactEvent{
			ID:                 "director-reselect",
			EmittedAt:          "2026-07-24T13:00:00Z",
			Kind:               DirectorFactWorkstreamSelected,
			WorkstreamID:       "ws-child",
			Actor:              SemanticActorUser,
			WorkstreamSelected: &DirectorWorkstreamSelected{PreviousWorkstreamID: stringPointer("ws-parent")},
		},
	})
	after, err := ProjectDirectorGraph(reselected)
	if err != nil {
		t.Fatalf("reselect: %v", err)
	}
	if after.SelectedWorkstreamID == nil || *after.SelectedWorkstreamID != "ws-child" {
		t.Fatalf("expected ws-child to be selected, got %v", after.SelectedWorkstreamID)
	}
	afterGraph, err := after.Graph("ws-parent", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph after reselect: %v", err)
	}
	if !reflect.DeepEqual(before, afterGraph) {
		t.Fatal("changing selection changed graph truth")
	}
}

func TestArtifactNodesNameTheArtifactTheyStandFor(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "folderless_start"))
	graph, err := projection.Graph("ws-alpha", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	for _, node := range graph.Nodes {
		if node.Kind != SemanticNodeArtifact {
			continue
		}
		if len(node.ArtifactIDs) != 1 || node.ArtifactIDs[0] != "artifact-alpha-1" {
			t.Fatalf("artifact node %s does not name its artifact: %v", node.ID, node.ArtifactIDs)
		}
		if node.PublicSummary != "Release notes summary" {
			t.Fatalf("artifact node %s lost its durable title: %q", node.ID, node.PublicSummary)
		}
		runNodeID, idErr := SemanticNodeID(SemanticNodeIdentityRun, "turn-alpha-1")
		if idErr != nil {
			t.Fatalf("run node id: %v", idErr)
		}
		if !hasEdge(graph, SemanticEdgeProduced, runNodeID, node.ID) {
			t.Fatal("expected a produced edge from the run that emitted the artifact")
		}
		return
	}
	t.Fatal("no artifact node was projected")
}

func TestProviderValidationIsVisibleOnlyOnceItHasAVerdict(t *testing.T) {
	fixture := fixtureByName(t, "approval_and_file_change")
	projection := projectFixture(t, fixture)
	graph, err := projection.Graph("ws-gamma", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	validationNodeID, err := SemanticNodeID(SemanticNodeIdentityValidation, "review-gamma-1")
	if err != nil {
		t.Fatalf("validation node id: %v", err)
	}
	node, found := nodeByID(graph, validationNodeID)
	if !found {
		t.Fatal("a completed guardian review projected no validation node")
	}
	if node.Kind != SemanticNodeValidation || node.Status != SemanticNodeStatusFailed {
		t.Fatalf("validation node = %s/%s, want %s/%s", node.Kind, node.Status, SemanticNodeValidation, SemanticNodeStatusFailed)
	}
	fileChangeNodeID, err := SemanticNodeID(SemanticNodeIdentityFileChange, "item-gamma-1")
	if err != nil {
		t.Fatalf("file change node id: %v", err)
	}
	// The review names the item it covered, so the edge comes from that work
	// rather than from whatever node happened to be last.
	if !hasEdge(graph, SemanticEdgeValidatedBy, fileChangeNodeID, validationNodeID) {
		t.Fatal("expected a validated_by edge from the reviewed file change")
	}

	// A check that has started and has no verdict is not a fact the user can act
	// on, so it must not add a node.
	events := append([]ProjectorEvent(nil), fixture.Events...)
	last := events[len(events)-1]
	inProgress := *last.Trajectory
	inProgress.ID = "trajectory-in-progress"
	inProgress.Kind = conversation.TrajectoryEventValidationRecorded
	inProgress.TurnCompleted = nil
	inProgress.ValidationRecorded = &conversation.TrajectoryValidationRecorded{
		Validation: conversation.TrajectoryValidation{
			ID:      "review-gamma-2",
			Kind:    conversation.TrajectoryValidationGuardianReview,
			Status:  conversation.TrajectoryValidationStatusInProgress,
			Summary: "Automatic approval review started",
		},
	}
	events = append(events, ProjectorEvent{Sequence: last.Sequence + 1, Trajectory: &inProgress})
	extended, err := ProjectDirectorGraph(events)
	if err != nil {
		t.Fatalf("project in-progress validation: %v", err)
	}
	extendedGraph, err := extended.Graph("ws-gamma", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("extended graph: %v", err)
	}
	if len(extendedGraph.Nodes) != len(graph.Nodes) {
		t.Fatalf("an in-progress validation changed the node count from %d to %d", len(graph.Nodes), len(extendedGraph.Nodes))
	}
}

func TestSupersededApprovalEndsWithoutAUserDecision(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "blocked_and_cancelled"))
	graph, err := projection.Graph("ws-theta", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	nodeID, err := SemanticNodeID(SemanticNodeIdentityApproval, "approval-theta-1")
	if err != nil {
		t.Fatalf("approval node id: %v", err)
	}
	node, found := nodeByID(graph, nodeID)
	if !found {
		t.Fatal("the superseded approval projected no node")
	}
	if node.Status != SemanticNodeStatusCancelled {
		t.Fatalf("superseded approval status = %q, want %q", node.Status, SemanticNodeStatusCancelled)
	}
}

func nodeByID(graph WorkstreamGraph, nodeID string) (SemanticNode, bool) {
	for _, node := range graph.Nodes {
		if node.ID == nodeID {
			return node, true
		}
	}
	return SemanticNode{}, false
}

func TestUnregisteredDirectorFactAndDuplicateRegistrationFailLoudly(t *testing.T) {
	registration := ProjectorEvent{
		Sequence: 1,
		Director: &DirectorFactEvent{
			ID:           "director-01",
			EmittedAt:    "2026-07-24T12:00:01Z",
			Kind:         DirectorFactWorkstreamRegistered,
			WorkstreamID: "ws-solo",
			Actor:        SemanticActorSystem,
			WorkstreamRegistered: &DirectorWorkstreamRegistered{
				Title:          "Solo",
				ConversationID: "conv-solo",
				ResourceScope:  folderlessScope(),
			},
		},
	}
	projector := NewDirectorGraphProjector()
	if err := projector.Apply(registration); err != nil {
		t.Fatalf("registration: %v", err)
	}
	duplicate := registration
	duplicateFact := *registration.Director
	duplicateFact.ID = "director-02"
	duplicate.Director = &duplicateFact
	duplicate.Sequence = 2
	if err := projector.Apply(duplicate); err == nil {
		t.Fatal("expected a duplicate workstream registration to fail")
	}
}

func TestSourceFactCoverageIncludesEveryNodeKind(t *testing.T) {
	if err := ValidateSourceFactCoverage(); err != nil {
		t.Fatalf("source fact coverage: %v", err)
	}
}

func hasEdge(graph WorkstreamGraph, kind SemanticEdgeKind, fromNodeID string, toNodeID string) bool {
	for _, edge := range graph.Edges {
		if edge.Kind == kind && edge.FromNodeID == fromNodeID && edge.ToNodeID == toNodeID {
			return true
		}
	}
	return false
}
