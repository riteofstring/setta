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

func TestActivityAndRerouteLabelsUseTypedPublicVocabulary(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "failure_and_recovery"))
	graph, err := projection.Graph("ws-epsilon", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	activityID, err := SemanticNodeID(SemanticNodeIdentityActivity, "activity-epsilon-1")
	if err != nil {
		t.Fatalf("activity node id: %v", err)
	}
	activity, found := nodeByID(graph, activityID)
	if !found {
		t.Fatalf("activity node %s is missing", activityID)
	}
	if activity.PublicSummary != "Command" ||
		strings.Contains(activity.PublicSummary, "make installer") {
		t.Fatalf("command activity leaked provider detail: %+v", activity)
	}
	foundReroute := false
	for _, node := range graph.Nodes {
		if !strings.HasPrefix(node.PublicSummary, "Model rerouted") {
			continue
		}
		foundReroute = true
		if !strings.Contains(node.PublicSummary, "for high-risk cyber activity") {
			t.Fatalf("model reroute did not use its typed reason: %q", node.PublicSummary)
		}
	}
	if !foundReroute {
		t.Fatal("typed model-reroute node is missing")
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
	trajectorySequences := map[string]int{}
	for _, event := range fixture.Events {
		if event.Trajectory != nil && event.Trajectory.Kind == conversation.TrajectoryEventAgentPublicTextDelta {
			continue
		}
		sequence++
		resequenced := event
		resequenced.Sequence = sequence
		if event.Trajectory != nil {
			trajectory := *event.Trajectory
			trajectorySequences[trajectory.ConversationID]++
			trajectory.Sequence = trajectorySequences[trajectory.ConversationID]
			resequenced.Trajectory = &trajectory
		}
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

func TestConversationTrajectorySequenceGapRequiresResync(t *testing.T) {
	fixture := fixtureByName(t, "folderless_start")
	projector := NewDirectorGraphProjector()
	for _, event := range fixture.Events[:2] {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply setup event: %v", err)
		}
	}
	gapped := *fixture.Events[2].Trajectory
	gapped.Sequence = 2
	assertResyncReason(
		t,
		projector.Apply(ProjectorEvent{Sequence: 3, Trajectory: &gapped}),
		DirectorResyncEventSequenceGap,
	)
}

func TestRunIdentityCannotCrossWorkstreams(t *testing.T) {
	builder := fixtureBuilder{}
	builder.register("ws-run-owner-a", "conv-run-owner-a", "Run owner A", folderlessScope())
	builder.director("ws-run-owner-b", DirectorFactWorkstreamRegistered, SemanticActorSystem, func(fact *DirectorFactEvent) {
		fact.WorkstreamRegistered = &DirectorWorkstreamRegistered{
			Title:          "Run owner B",
			ConversationID: "conv-run-owner-b",
			ResourceScope:  folderlessScope(),
		}
	})
	builder.acceptInput("conv-run-owner-a", "turn-shared", "Start in A")
	builder.startTurn("conv-run-owner-a", "turn-shared")
	builder.acceptInput("conv-run-owner-b", "turn-shared", "Illegally reuse the run in B")

	projector := NewDirectorGraphProjector()
	for _, event := range builder.events[:len(builder.events)-1] {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply run owner setup: %v", err)
		}
	}
	err := projector.Apply(builder.events[len(builder.events)-1])
	if err == nil || !strings.Contains(err.Error(), "belongs to workstream") {
		t.Fatalf("cross-workstream run identity produced %v", err)
	}
}

func TestDuplicateDurableFactIDFailsBeforeProjection(t *testing.T) {
	fixture := fixtureByName(t, "folderless_start")
	projector := NewDirectorGraphProjector()
	for _, event := range fixture.Events[:3] {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply setup event: %v", err)
		}
	}
	duplicate := *fixture.Events[3].Director
	duplicate.ID = fixture.Events[0].Director.ID
	err := projector.Apply(ProjectorEvent{Sequence: 4, Director: &duplicate})
	if err == nil || !strings.Contains(err.Error(), "repeats durable fact id") {
		t.Fatalf("duplicate durable fact id produced %v", err)
	}
	graph, graphErr := projector.Projection().Graph("ws-alpha", WorkstreamDetailSelected)
	if graphErr != nil || len(graph.Nodes) != 1 {
		t.Fatalf("duplicate fact changed graph state: graph=%+v err=%v", graph, graphErr)
	}
}

func TestProjectorRejectsMalformedTrajectoryBeforeChangingGraphTruth(t *testing.T) {
	fixture := fixtureByName(t, "folderless_start")
	projector := NewDirectorGraphProjector()
	for _, event := range fixture.Events[:2] {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply setup event: %v", err)
		}
	}
	malformed := *fixture.Events[2].Trajectory
	malformed.UserInputAccepted = &conversation.TrajectoryUserInputAccepted{
		Input:    conversation.AuthoredInput{},
		Delivery: conversation.TurnDeliveryNormal,
	}
	if err := projector.Apply(ProjectorEvent{Sequence: 3, Trajectory: &malformed}); err == nil {
		t.Fatal("a malformed durable trajectory event changed graph truth")
	}
	if graph, err := projector.Projection().Graph("ws-alpha", WorkstreamDetailSelected); err != nil || len(graph.Nodes) != 0 {
		t.Fatalf("malformed trajectory left graph state: graph=%+v err=%v", graph, err)
	}
}

func TestSelectionFactMustNameTheActualPreviousWorkstream(t *testing.T) {
	fixture := fixtureByName(t, "folderless_start")
	projector := NewDirectorGraphProjector()
	for _, event := range fixture.Events[:2] {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply setup event: %v", err)
		}
	}
	selection := DirectorFactEvent{
		ID:                 "director-invalid-selection",
		EmittedAt:          "2026-07-24T13:00:00Z",
		Kind:               DirectorFactWorkstreamSelected,
		WorkstreamID:       "ws-alpha",
		Actor:              SemanticActorUser,
		WorkstreamSelected: &DirectorWorkstreamSelected{},
	}
	if err := projector.Apply(ProjectorEvent{Sequence: 3, Director: &selection}); err == nil {
		t.Fatal("a stale selection fact was accepted")
	}
}

func TestCreateDecisionCanRegisterOnlyItsOwnChild(t *testing.T) {
	fixture := fixtureByName(t, "delegation")
	projector := NewDirectorGraphProjector()
	for _, event := range fixture.Events {
		if event.Director != nil &&
			event.Director.Kind == DirectorFactWorkstreamRegistered &&
			event.Director.WorkstreamID == "ws-child" {
			registration := *event.Director
			payload := *registration.WorkstreamRegistered
			payload.ParentID = nil
			registration.WorkstreamRegistered = &payload
			err := projector.Apply(ProjectorEvent{Sequence: event.Sequence, Director: &registration})
			if err == nil || !strings.Contains(err.Error(), "must be a child") {
				t.Fatalf("non-child registration produced %v", err)
			}
			return
		}
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply setup event: %v", err)
		}
	}
	t.Fatal("delegation fixture has no child registration")
}

func TestInterpretationCannotCiteAnotherWorkstreamsFact(t *testing.T) {
	fixture := fixtureByName(t, "delegation")
	projector := NewDirectorGraphProjector()
	for _, event := range fixture.Events {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply fixture: %v", err)
		}
	}
	parentEventID := fixture.Events[0].Director.ID
	confidence := 0.8
	fact := DirectorFactEvent{
		ID:           "director-cross-workstream-interpretation",
		EmittedAt:    "2026-07-24T13:00:00Z",
		Kind:         DirectorFactInterpretationPublished,
		WorkstreamID: "ws-child",
		Actor:        SemanticActorDirector,
		InterpretationPublished: &DirectorInterpretationPublished{
			InterpretationID:    "interpretation-cross-workstream",
			PublicSummary:       "This conclusion cites another workstream",
			InterpretedEventIDs: []string{parentEventID},
			Metadata: InterpretationMetadata{
				InterpretedBy: SemanticActorDirector,
				Model: InterpretationModelIdentity{
					Provider:  "codex",
					Model:     "gpt-5.1-codex",
					RuntimeID: "runtime-cross-workstream",
				},
				Confidence:    &confidence,
				InterpretedAt: "2026-07-24T12:59:59Z",
			},
		},
	}
	err := projector.Apply(ProjectorEvent{Sequence: len(fixture.Events) + 1, Director: &fact})
	if err == nil || !strings.Contains(err.Error(), "without cross-workstream authority") {
		t.Fatalf("cross-workstream interpretation produced %v", err)
	}
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
	restart.Sequence++
	restart.TurnCompleted = nil
	restart.TurnStarted = &conversation.TrajectoryTurnStarted{Invocation: fixtureInvocation("turn-alpha-1")}
	err := projector.Apply(ProjectorEvent{Sequence: last.Sequence + 1, Trajectory: &restart})
	if err == nil {
		t.Fatal("expected a completed run to reject being restarted")
	}
	if !strings.Contains(err.Error(), "already has a terminal fact") {
		t.Fatalf("expected a terminal-run failure, got %v", err)
	}
}

func TestRunCannotCommitTwoTerminalFacts(t *testing.T) {
	fixture := fixtureByName(t, "folderless_start")
	projector := NewDirectorGraphProjector()
	for _, event := range fixture.Events {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply: %v", err)
		}
	}
	last := fixture.Events[len(fixture.Events)-1]
	duplicate := *last.Trajectory
	duplicate.ID = "trajectory-duplicate-terminal"
	duplicate.Sequence++
	err := projector.Apply(ProjectorEvent{Sequence: last.Sequence + 1, Trajectory: &duplicate})
	if err == nil || !strings.Contains(err.Error(), "already has a terminal fact") {
		t.Fatalf("duplicate terminal fact produced %v", err)
	}
}

func TestTerminalRunRejectsFurtherWorkFacts(t *testing.T) {
	builder := fixtureBuilder{}
	builder.register("ws-terminal", "conv-terminal", "Terminal run", folderlessScope())
	builder.acceptInput("conv-terminal", "turn-terminal", "Finish once")
	builder.startTurn("conv-terminal", "turn-terminal")
	builder.completeTurn("conv-terminal", "turn-terminal")
	builder.trajectory(
		"conv-terminal",
		stringPointer("turn-terminal"),
		conversation.TrajectoryEventActivityStarted,
		conversation.TrajectoryActorAgent,
		func(event *conversation.TrajectoryEvent) {
			event.ActivityStarted = &conversation.TrajectoryActivityStarted{
				Activity: conversation.TrajectoryActivity{
					ID:    "activity-after-terminal",
					Kind:  conversation.TrajectoryActivityOther,
					Title: "Impossible late work",
				},
			}
		},
	)

	projector := NewDirectorGraphProjector()
	for _, event := range builder.events[:len(builder.events)-1] {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply terminal setup: %v", err)
		}
	}
	err := projector.Apply(builder.events[len(builder.events)-1])
	if err == nil || !strings.Contains(err.Error(), "already has a terminal fact") {
		t.Fatalf("late work fact produced %v", err)
	}
}

func TestRunTerminalClosesTheCausalChainAfterItsGoal(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "folderless_start"))
	graph, err := projection.Graph("ws-alpha", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	goalID, err := SemanticNodeID(SemanticNodeIdentityInput, "trajectory-03")
	if err != nil {
		t.Fatalf("goal node id: %v", err)
	}
	terminalID, err := SemanticNodeID(SemanticNodeIdentityRunTerminal, "turn-alpha-1")
	if err != nil {
		t.Fatalf("terminal node id: %v", err)
	}
	if !hasEdge(graph, SemanticEdgeFollowedBy, goalID, terminalID) {
		t.Fatalf("run terminal %s does not follow its closed goal %s", terminalID, goalID)
	}
	milestone, found := projection.Milestone("ws-alpha")
	if !found || milestone.NodeID != terminalID {
		t.Fatalf("last milestone = %+v, want terminal %s", milestone, terminalID)
	}
}

func TestTerminalRunsLeaveNoRunBoundNodeActionable(t *testing.T) {
	for _, fixture := range ProjectionFixtures() {
		projection := projectFixture(t, fixture)
		for _, workstreamID := range projection.WorkstreamIDs {
			graph, err := projection.Graph(workstreamID, WorkstreamDetailSelected)
			if err != nil {
				t.Fatalf("%s: graph for %s: %v", fixture.Name, workstreamID, err)
			}
			terminalRuns := map[string]bool{}
			for _, node := range graph.Nodes {
				if node.RunID == nil {
					continue
				}
				switch node.Kind {
				case SemanticNodeCompleted, SemanticNodeFailed, SemanticNodeCancelled:
					terminalRuns[*node.RunID] = true
				}
			}
			for _, node := range graph.Nodes {
				if node.RunID == nil ||
					!terminalRuns[*node.RunID] ||
					IsTerminalSemanticNodeStatus(node.Status) {
					continue
				}
				t.Fatalf(
					"%s: terminal run %s left node %s actionable at %s",
					fixture.Name,
					*node.RunID,
					node.ID,
					node.Status,
				)
			}
		}
	}
}

func TestAPlanAfterATerminalPlanReplacesItsLiveProjection(t *testing.T) {
	builder := &fixtureBuilder{}
	const workstreamID = "ws-replanned"
	const conversationID = "conv-replanned"
	const runID = "turn-replanned"
	builder.register(workstreamID, conversationID, "Replan after steering", folderlessScope())
	builder.acceptInput(conversationID, runID, "Prepare the release")
	builder.startTurn(conversationID, runID)
	firstPlanEventID := builder.planChanged(
		conversationID,
		runID,
		"Initial plan",
		[]conversation.PlanStep{{
			Text:   "Prepare the release",
			Status: conversation.PlanStepStatusCompleted,
		}},
	)
	secondPlanEventID := builder.planChanged(
		conversationID,
		runID,
		"Replacement plan",
		[]conversation.PlanStep{{
			Text:   "Revise the release",
			Status: conversation.PlanStepStatusInProgress,
		}},
	)
	builder.completeTurn(conversationID, runID)

	projection, err := ProjectDirectorGraph(builder.events)
	if err != nil {
		t.Fatalf("project replacement plan: %v", err)
	}
	graph, err := projection.Graph(workstreamID, WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("replacement plan graph: %v", err)
	}
	planNodeID, err := SemanticNodeID(SemanticNodeIdentityPlan, runID)
	if err != nil {
		t.Fatalf("plan node id: %v", err)
	}
	plan, found := nodeByID(graph, planNodeID)
	if !found {
		t.Fatal("replacement plan projected no plan node")
	}
	if plan.Status != SemanticNodeStatusCancelled ||
		containsString(plan.SourceEventIDs, firstPlanEventID) ||
		!containsString(plan.SourceEventIDs, secondPlanEventID) {
		t.Fatalf("replacement plan node = %+v", plan)
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

func TestFolderlessResourceRequestBlocksTheGoalThatNeedsIt(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "resource_request"))
	graph, err := projection.Graph("ws-zeta", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	goalID := ""
	resourceID := ""
	for _, node := range graph.Nodes {
		switch node.Kind {
		case SemanticNodeUserGoal:
			goalID = node.ID
		case SemanticNodeResourceRequired:
			resourceID = node.ID
		}
	}
	if goalID == "" || resourceID == "" ||
		!hasEdge(graph, SemanticEdgeBlockedBy, goalID, resourceID) {
		t.Fatalf("resource request %q does not block folderless goal %q", resourceID, goalID)
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

func TestRoutingToTheCurrentWorkstreamDoesNotClaimDelegation(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "folderless_start"))
	graph, err := projection.Graph("ws-alpha", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	for _, edge := range graph.Edges {
		if edge.Kind == SemanticEdgeDelegatedTo {
			t.Fatalf("send-to-workstream decision invented delegation edge %s", edge.ID)
		}
	}
}

func TestProviderReadyStateResolvesItsVisibleBlock(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "blocked_and_cancelled"))
	graph, err := projection.Graph("ws-theta", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	for _, node := range graph.Nodes {
		if node.Kind != SemanticNodeBlocked ||
			!strings.Contains(node.PublicSummary, "Provider environment") {
			continue
		}
		if node.Status != SemanticNodeStatusSucceeded ||
			node.PublicSummary != "Provider environment connected" {
			t.Fatalf("provider lifecycle block remained %+v after ready state", node)
		}
		return
	}
	t.Fatal("the disconnected provider environment projected no visible block")
}

func TestThreadScopedLifecycleCanResolveAfterRunTerminal(t *testing.T) {
	builder := fixtureBuilder{}
	builder.register(
		"ws-lifecycle",
		"conversation-lifecycle",
		"Provider recovery",
		folderScope("workspace-lifecycle", "/repo/lifecycle"),
	)
	builder.acceptInput("conversation-lifecycle", "turn-lifecycle-1", "Start the work")
	builder.startTurn("conversation-lifecycle", "turn-lifecycle-1")
	builder.providerLifecycle("conversation-lifecycle", "turn-lifecycle-1", conversation.ProviderLifecycle{
		Provider: conversation.ProviderCodex,
		Status:   conversation.ProviderLifecycleUnavailable,
		Reason:   conversation.ProviderLifecycleReasonEnvironmentDisconnected,
	})
	builder.trajectory(
		"conversation-lifecycle",
		stringPointer("turn-lifecycle-1"),
		conversation.TrajectoryEventTurnFailed,
		conversation.TrajectoryActorSystem,
		func(event *conversation.TrajectoryEvent) {
			event.TurnFailed = &conversation.TrajectoryTurnFailed{Failure: conversation.Failure{
				Code:                "provider_unavailable",
				Message:             "The provider disconnected",
				Retryable:           true,
				DiagnosticReference: "diagnostic-lifecycle-1",
			}}
		},
	)
	builder.acceptInput("conversation-lifecycle", "turn-lifecycle-2", "Try again")
	builder.startTurn("conversation-lifecycle", "turn-lifecycle-2")
	builder.providerLifecycle("conversation-lifecycle", "turn-lifecycle-2", conversation.ProviderLifecycle{
		Provider: conversation.ProviderCodex,
		Status:   conversation.ProviderLifecycleReady,
		Reason:   conversation.ProviderLifecycleReasonEnvironmentConnected,
	})

	projection := projectFixture(t, ProjectionFixture{
		Name:   "thread_lifecycle_after_terminal_run",
		Events: builder.events,
	})
	graph, err := projection.Graph("ws-lifecycle", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	for _, node := range graph.Nodes {
		if node.Kind != SemanticNodeBlocked ||
			!strings.Contains(node.PublicSummary, "Provider environment") {
			continue
		}
		if node.RunID != nil {
			t.Fatalf("thread-scoped lifecycle node inherited run %q", *node.RunID)
		}
		if node.Status != SemanticNodeStatusSucceeded ||
			node.PublicSummary != "Provider environment connected" {
			t.Fatalf("provider lifecycle block remained %+v after a later run recovered it", node)
		}
		return
	}
	t.Fatal("the disconnected provider environment projected no visible block")
}

func TestRecoveredLivenessDoesNotLeaveActionableLifecycleNodes(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "blocked_and_cancelled"))
	graph, err := projection.Graph("ws-theta", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	for _, node := range graph.Nodes {
		if (node.Kind == SemanticNodeBlocked || node.Kind == SemanticNodeRecovery) &&
			(node.Status == SemanticNodeStatusWaiting || node.Status == SemanticNodeStatusActive) {
			t.Fatalf("recovered or terminal liveness left actionable node %+v", node)
		}
	}
}

func TestExplicitRecoveryReachesItsTerminalState(t *testing.T) {
	projection := projectFixture(t, fixtureByName(t, "failure_and_recovery"))
	graph, err := projection.Graph("ws-epsilon", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("graph: %v", err)
	}
	nodeID, err := SemanticNodeID(SemanticNodeIdentityRecovery, "recovery-epsilon-1")
	if err != nil {
		t.Fatalf("recovery node id: %v", err)
	}
	node, found := nodeByID(graph, nodeID)
	if !found {
		t.Fatal("explicit recovery projected no node")
	}
	if node.Status != SemanticNodeStatusSucceeded {
		t.Fatalf("recovery node status = %q, want %q", node.Status, SemanticNodeStatusSucceeded)
	}
}

func TestProjectionSnapshotsDoNotShareMutableNodeEvidence(t *testing.T) {
	projector := NewDirectorGraphProjector()
	fixture := fixtureByName(t, "folderless_start")
	for _, event := range fixture.Events {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply fixture: %v", err)
		}
	}
	first, err := projector.Projection().Graph("ws-alpha", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("first graph: %v", err)
	}
	if len(first.Nodes) == 0 || len(first.Nodes[0].SourceEventIDs) == 0 {
		t.Fatal("fixture did not produce mutable node evidence")
	}
	first.Nodes[0].SourceEventIDs[0] = "mutated-event"
	if first.Nodes[0].RunID != nil {
		*first.Nodes[0].RunID = "mutated-run"
	}
	second, err := projector.Projection().Graph("ws-alpha", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("second graph: %v", err)
	}
	if second.Nodes[0].SourceEventIDs[0] == "mutated-event" ||
		(second.Nodes[0].RunID != nil && *second.Nodes[0].RunID == "mutated-run") {
		t.Fatal("a held projection mutated the live projector")
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

func TestArtifactIdentityCannotBeEmittedTwice(t *testing.T) {
	fixture := fixtureByName(t, "folderless_start")
	projector := NewDirectorGraphProjector()
	var original conversation.TrajectoryEvent
	for _, event := range fixture.Events[:len(fixture.Events)-1] {
		if event.Trajectory != nil &&
			event.Trajectory.Kind == conversation.TrajectoryEventArtifactEmitted {
			original = *event.Trajectory
		}
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply fixture: %v", err)
		}
	}
	if original.ArtifactEmitted == nil {
		t.Fatal("folderless fixture has no artifact event")
	}
	last := fixture.Events[len(fixture.Events)-1]
	original.ID = "trajectory-duplicate-artifact"
	original.Sequence = last.Trajectory.Sequence
	original.EmittedAt = last.Trajectory.EmittedAt
	err := projector.Apply(ProjectorEvent{Sequence: last.Sequence, Trajectory: &original})
	if err == nil || !strings.Contains(err.Error(), "emitted more than once") {
		t.Fatalf("duplicate artifact produced %v", err)
	}
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
	events := append([]ProjectorEvent(nil), fixture.Events[:len(fixture.Events)-1]...)
	last := fixture.Events[len(fixture.Events)-1]
	baseline, err := ProjectDirectorGraph(events)
	if err != nil {
		t.Fatalf("project validation baseline: %v", err)
	}
	baselineGraph, err := baseline.Graph("ws-gamma", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("baseline graph: %v", err)
	}
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
	events = append(events, ProjectorEvent{Sequence: last.Sequence, Trajectory: &inProgress})
	extended, err := ProjectDirectorGraph(events)
	if err != nil {
		t.Fatalf("project in-progress validation: %v", err)
	}
	extendedGraph, err := extended.Graph("ws-gamma", WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("extended graph: %v", err)
	}
	if len(extendedGraph.Nodes) != len(baselineGraph.Nodes) {
		t.Fatalf(
			"an in-progress validation changed the node count from %d to %d",
			len(baselineGraph.Nodes),
			len(extendedGraph.Nodes),
		)
	}
}

func TestProviderValidationRejectsAnUnknownTypedSubjectBeforeCreatingANode(t *testing.T) {
	fixture := fixtureByName(t, "approval_and_file_change")
	projector := NewDirectorGraphProjector()
	for _, event := range fixture.Events {
		if event.Trajectory != nil &&
			event.Trajectory.Kind == conversation.TrajectoryEventValidationRecorded {
			before, err := projector.Projection().Graph("ws-gamma", WorkstreamDetailSelected)
			if err != nil {
				t.Fatalf("graph before invalid validation: %v", err)
			}
			invalid := *event.Trajectory
			payload := *invalid.ValidationRecorded
			validation := payload.Validation
			validation.Subject = stringPointer("provider-item-unknown")
			payload.Validation = validation
			invalid.ValidationRecorded = &payload
			err = projector.Apply(ProjectorEvent{Sequence: event.Sequence, Trajectory: &invalid})
			if err == nil || !strings.Contains(err.Error(), "has no projected activity") {
				t.Fatalf("unknown validation subject produced %v", err)
			}
			after, graphErr := projector.Projection().Graph("ws-gamma", WorkstreamDetailSelected)
			if graphErr != nil || len(after.Nodes) != len(before.Nodes) {
				t.Fatalf("invalid validation changed graph state: before=%d after=%d err=%v",
					len(before.Nodes), len(after.Nodes), graphErr)
			}
			return
		}
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply setup event: %v", err)
		}
	}
	t.Fatal("approval fixture has no validation event")
}

func TestRecoveryRejectsHealthyWorkBeforeCreatingANode(t *testing.T) {
	builder := &fixtureBuilder{}
	const workstreamID = "ws-healthy-recovery"
	const conversationID = "conv-healthy-recovery"
	const runID = "turn-healthy-recovery"
	builder.register(workstreamID, conversationID, "Healthy work", folderlessScope())
	builder.acceptInput(conversationID, runID, "Keep working")
	healthyEventID := builder.startTurn(conversationID, runID)
	builder.director(workstreamID, DirectorFactRecoveryAttempted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		fact.RunID = stringPointer(runID)
		fact.RecoveryAttempted = &DirectorRecoveryAttempted{
			RecoveryID:     "recovery-healthy",
			Status:         RecoveryStatusRetrying,
			FailureEventID: healthyEventID,
			PublicSummary:  "Retry healthy work",
		}
	})

	projector := NewDirectorGraphProjector()
	for _, event := range builder.events[:len(builder.events)-1] {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply healthy setup: %v", err)
		}
	}
	before, err := projector.Projection().Graph(workstreamID, WorkstreamDetailSelected)
	if err != nil {
		t.Fatalf("healthy graph before recovery: %v", err)
	}
	err = projector.Apply(builder.events[len(builder.events)-1])
	if err == nil || !strings.Contains(err.Error(), "healthy node") {
		t.Fatalf("recovery over healthy work produced %v", err)
	}
	after, graphErr := projector.Projection().Graph(workstreamID, WorkstreamDetailSelected)
	if graphErr != nil || len(after.Nodes) != len(before.Nodes) {
		t.Fatalf(
			"invalid recovery changed graph state: before=%d after=%d err=%v",
			len(before.Nodes),
			len(after.Nodes),
			graphErr,
		)
	}
}

func TestRecoveryRejectsAResolvedBlock(t *testing.T) {
	builder := &fixtureBuilder{}
	const workstreamID = "ws-resolved-block"
	const conversationID = "conv-resolved-block"
	const runID = "turn-resolved-block"
	builder.register(workstreamID, conversationID, "Resolved provider block", folderlessScope())
	builder.acceptInput(conversationID, runID, "Keep working")
	builder.startTurn(conversationID, runID)
	blockedEventID := builder.trajectory(
		conversationID,
		stringPointer(runID),
		conversation.TrajectoryEventProviderLifecycleChanged,
		conversation.TrajectoryActorProvider,
		func(event *conversation.TrajectoryEvent) {
			event.ProviderLifecycleChanged = &conversation.TrajectoryProviderLifecycleChanged{
				Lifecycle: conversation.ProviderLifecycle{
					Provider: conversation.ProviderCodex,
					Status:   conversation.ProviderLifecycleUnavailable,
					Reason:   conversation.ProviderLifecycleReasonEnvironmentDisconnected,
				},
			}
		},
	)
	builder.providerLifecycle(conversationID, runID, conversation.ProviderLifecycle{
		Provider: conversation.ProviderCodex,
		Status:   conversation.ProviderLifecycleReady,
		Reason:   conversation.ProviderLifecycleReasonEnvironmentConnected,
	})
	builder.director(workstreamID, DirectorFactRecoveryAttempted, SemanticActorDirector, func(fact *DirectorFactEvent) {
		fact.RunID = stringPointer(runID)
		fact.RecoveryAttempted = &DirectorRecoveryAttempted{
			RecoveryID:     "recovery-resolved-block",
			Status:         RecoveryStatusRetrying,
			FailureEventID: blockedEventID,
			PublicSummary:  "Retry the resolved provider block",
		}
	})

	projector := NewDirectorGraphProjector()
	for _, event := range builder.events[:len(builder.events)-1] {
		if err := projector.Apply(event); err != nil {
			t.Fatalf("apply resolved block setup: %v", err)
		}
	}
	err := projector.Apply(builder.events[len(builder.events)-1])
	if err == nil || !strings.Contains(err.Error(), "healthy node") {
		t.Fatalf("recovery over resolved block produced %v", err)
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

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
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
