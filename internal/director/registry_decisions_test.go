package director

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"testing"

	"setta/internal/conversation"
)

// The decision context is the only authority a Director decision has, so these
// tests assert what durable state may and may not put into it: which actions a
// workstream offers, which ids a decision may echo back, and which values must
// never appear in front of the model at all.

func decisionIntentFixture() SubmittedIntent {
	return SubmittedIntent{
		ID:          "intent-registry-1",
		Text:        "keep going on the parser",
		Modality:    DecisionIntentModalityText,
		SubmittedAt: "2026-07-24T12:00:00Z",
	}
}

func requireDecisionContext(t *testing.T, registry *Registry) DirectorDecisionContext {
	t.Helper()
	decisionContext, err := registry.DecisionContext(decisionIntentFixture())
	if err != nil {
		t.Fatalf("DecisionContext: %v", err)
	}
	return decisionContext
}

func requireDecisionTarget(
	t *testing.T,
	decisionContext DirectorDecisionContext,
	workstreamID string,
) WorkstreamDecisionTarget {
	t.Helper()
	target, found := decisionContext.Target(workstreamID)
	if !found {
		t.Fatalf("decision context has no workstream %s", workstreamID)
	}
	return target
}

// TestDecisionContextDerivesTargetAuthorityFromRunState proves the authority a
// target carries is a function of what is durably true rather than a claim: an
// idle workstream can be sent work, a running one can only be queued behind or
// steered, and a failed one can be recovered.
func TestDecisionContextDerivesTargetAuthorityFromRunState(t *testing.T) {
	harness := newRegistryHarness(t)
	idle := harness.createConversation("conversation-idle", "Parser rewrite", nil)
	running := harness.createConversation("conversation-running", "Release notes", nil)
	failed := harness.createConversation("conversation-failed", "Nightly import", nil)

	harness.startTurn("conversation-idle", "turn-idle-1")
	harness.acceptInput("conversation-idle", "turn-idle-1", "rewrite the tokenizer")
	harness.completeTurnTrajectory("conversation-idle", "turn-idle-1")
	harness.completeTurn("conversation-idle", "turn-idle-1")

	harness.startTurn("conversation-running", "turn-running-1")
	harness.acceptInput("conversation-running", "turn-running-1", "draft the release notes")

	harness.startTurn("conversation-failed", "turn-failed-1")
	harness.acceptInput("conversation-failed", "turn-failed-1", "import last night's data")
	failure := harness.failTurn("conversation-failed", "turn-failed-1", "The import ended before it finished")

	registry := harness.start()
	decisionContext := requireDecisionContext(t, registry)

	// The idle workstream finished a turn, so it can be branched as well as sent
	// work: forking is authorized by completed history, not by being free now.
	idleTarget := requireDecisionTarget(t, decisionContext, idle)
	if !slices.Equal(idleTarget.AllowedDecisionKinds, []DirectorDecisionKind{
		DirectorDecisionSelectWorkstream,
		DirectorDecisionSendToWorkstream,
		DirectorDecisionForkWorkstream,
	}) {
		t.Fatalf("idle target allows %v", idleTarget.AllowedDecisionKinds)
	}
	if idleTarget.ForkPointRunID == nil || *idleTarget.ForkPointRunID != "turn-idle-1" {
		t.Fatalf("idle target fork point = %v", idleTarget.ForkPointRunID)
	}

	// The running workstream has never completed a turn, so it cannot be
	// branched: there is no shared history for a child to inherit.
	runningTarget := requireDecisionTarget(t, decisionContext, running)
	if !slices.Equal(runningTarget.AllowedDecisionKinds, []DirectorDecisionKind{
		DirectorDecisionSelectWorkstream,
		DirectorDecisionQueueBehindRun,
		DirectorDecisionSteerRun,
	}) {
		t.Fatalf("running target allows %v", runningTarget.AllowedDecisionKinds)
	}
	if runningTarget.ForkPointRunID != nil {
		t.Fatalf("running target offered a fork point with no completed run: %v", *runningTarget.ForkPointRunID)
	}
	if runningTarget.ActiveRunID == nil || *runningTarget.ActiveRunID != "turn-running-1" {
		t.Fatalf("running target active run = %v", runningTarget.ActiveRunID)
	}

	failedTarget := requireDecisionTarget(t, decisionContext, failed)
	if !slices.Contains(failedTarget.AllowedDecisionKinds, DirectorDecisionRecoverPath) {
		t.Fatalf("failed target allows %v", failedTarget.AllowedDecisionKinds)
	}
	if len(failedTarget.RecoverableFailures) != 1 {
		t.Fatalf("failed target recoverable failures = %+v", failedTarget.RecoverableFailures)
	}
	recoverable := failedTarget.RecoverableFailures[0]
	if recoverable.FailureEventID != failure.ID {
		t.Fatalf("recoverable failure names %q, want the durable failure event", recoverable.FailureEventID)
	}
	if recoverable.PublicSummary != "The import ended before it finished" {
		t.Fatalf("recoverable failure summary = %q", recoverable.PublicSummary)
	}

	for _, kind := range []DirectorDecisionKind{
		DirectorDecisionCreateWorkstream,
		DirectorDecisionRecoverPath,
	} {
		if !slices.Contains(decisionContext.AllowedDecisionKinds, kind) {
			t.Fatalf("context allows %v, missing %q", decisionContext.AllowedDecisionKinds, kind)
		}
	}
}

func TestDecisionContextWithholdsWorkThatCannotExecuteYet(t *testing.T) {
	harness := newRegistryHarness(t)
	queued := harness.createConversation("conversation-queued", "Queued work", nil)
	failedRunning := harness.createConversation("conversation-retrying", "Retrying import", nil)
	awaitingResource := harness.createConversation("conversation-folderless", "Needs a folder", nil)

	harness.startTurn("conversation-queued", "turn-queued-failed")
	harness.failTurn("conversation-queued", "turn-queued-failed", "Queued path failed")
	harness.publishQueue("conversation-queued", "turn-waiting")

	harness.startTurn("conversation-retrying", "turn-retrying-failed")
	harness.failTurn("conversation-retrying", "turn-retrying-failed", "Retrying path failed")
	harness.startTurn("conversation-retrying", "turn-retrying-active")

	harness.appendFact(DirectorFactEvent{
		Kind:         DirectorFactResourceRequestOpened,
		WorkstreamID: &awaitingResource,
		Actor:        SemanticActorDirector,
		ResourceRequestOpened: &DirectorResourceRequestOpened{
			RequestID:     "resource-folderless",
			Kind:          WorkstreamResourceKindFolder,
			PublicSummary: "Waiting for a project folder before this work can start.",
		},
	})

	context := requireDecisionContext(t, harness.start())
	queuedTarget := requireDecisionTarget(t, context, queued)
	if len(queuedTarget.RecoverableFailures) != 1 ||
		!slices.Equal(queuedTarget.AllowedDecisionKinds, []DirectorDecisionKind{
			DirectorDecisionSelectWorkstream,
		}) {
		t.Fatalf("queued failed target authority = %+v", queuedTarget)
	}
	runningTarget := requireDecisionTarget(t, context, failedRunning)
	if len(runningTarget.RecoverableFailures) != 1 ||
		slices.Contains(runningTarget.AllowedDecisionKinds, DirectorDecisionRecoverPath) {
		t.Fatalf("running failed target authority = %+v", runningTarget)
	}
	resourceTarget := requireDecisionTarget(t, context, awaitingResource)
	if !slices.Equal(resourceTarget.AllowedDecisionKinds, []DirectorDecisionKind{
		DirectorDecisionSelectWorkstream,
	}) {
		t.Fatalf("awaiting-resource target authority = %+v", resourceTarget)
	}
}

func TestQueueDrainClearsQueuedAuthority(t *testing.T) {
	harness := newRegistryHarness(t)
	workstreamID := harness.createConversation("conversation-queue", "Queued work", nil)
	harness.publishQueue("conversation-queue", "turn-waiting")
	registry := harness.start()

	queued := requireDecisionTarget(t, requireDecisionContext(t, registry), workstreamID)
	if queued.QueuedRunCount != 1 ||
		slices.Contains(queued.AllowedDecisionKinds, DirectorDecisionSendToWorkstream) {
		t.Fatalf("queued target = %+v", queued)
	}
	snapshot := requireSnapshot(t, registry)
	subscription, err := registry.Subscribe(snapshot.EventCursor)
	if err != nil {
		t.Fatalf("Subscribe: %v", err)
	}
	defer subscription.Unsubscribe()

	harness.publishQueue("conversation-queue")
	drained := awaitWorkstreamStatus(
		t,
		subscription,
		workstreamID,
		WorkstreamStatusIdle,
	)
	if drained.QueuedRunCount != 0 {
		t.Fatalf("drained queue count = %d", drained.QueuedRunCount)
	}
	target := requireDecisionTarget(t, requireDecisionContext(t, registry), workstreamID)
	if !slices.Contains(target.AllowedDecisionKinds, DirectorDecisionSendToWorkstream) {
		t.Fatalf("drained target allows %v", target.AllowedDecisionKinds)
	}
}

func TestArchivedWorkstreamLeavesActiveNavigationAndRouting(t *testing.T) {
	harness := newRegistryHarness(t)
	workstreamID := harness.createConversation("conversation-archived", "Old work", nil)
	harness.startTurn("conversation-archived", "turn-before-archive")
	harness.appendTrajectory(
		"conversation-archived",
		stringPointer("turn-before-archive"),
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
	harness.endTurn(
		"conversation-archived",
		"turn-before-archive",
		conversation.TurnStatusCancelled,
		nil,
	)
	harness.archiveConversation("conversation-archived", "Old work")

	registry := harness.start()
	snapshot := requireSnapshot(t, registry)
	if len(snapshot.Workstreams) != 0 || snapshot.Aggregates.WorkstreamCount != 0 {
		t.Fatalf(
			"archived work remained active: workstreams=%+v aggregates=%+v",
			snapshot.Workstreams,
			snapshot.Aggregates,
		)
	}
	if _, found := requireDecisionContext(t, registry).Target(workstreamID); found {
		t.Fatal("archived blocked workstream remained a routing target")
	}
}

// TestDecisionContextOffersNoActionAuthorityWithoutWorkstreams proves the empty
// app is a real product state: with nothing to route to, the Director may only
// answer or start work, and asking which workstream should handle the request
// is not an available action.
func TestDecisionContextOffersNoActionAuthorityWithoutWorkstreams(t *testing.T) {
	harness := newRegistryHarness(t)
	registry := harness.start()

	decisionContext := requireDecisionContext(t, registry)
	if len(decisionContext.Workstreams) != 0 {
		t.Fatalf("empty registry offers %d workstreams", len(decisionContext.Workstreams))
	}
	if !slices.Equal(decisionContext.AllowedDecisionKinds, []DirectorDecisionKind{
		DirectorDecisionCreateWorkstream,
	}) {
		t.Fatalf("empty registry allows %v", decisionContext.AllowedDecisionKinds)
	}
	if decisionContext.SelectedID != nil {
		t.Fatalf("empty registry context selects %v", decisionContext.SelectedID)
	}
	if len(decisionContext.Workspaces) != 1 || decisionContext.Workspaces[0].WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("workspace options = %+v", decisionContext.Workspaces)
	}
}

// TestDecisionContextCarriesNoResourcePathsOrExecutionIdentity proves the hard
// line the legacy route context could not hold: nothing the model sees names a
// filesystem path, a provider identity, an approval, or an artifact.
func TestDecisionContextCarriesNoResourcePathsOrExecutionIdentity(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	harness.createConversation("conversation-bound", "Fix the parser", &workspaceID)
	harness.startTurn("conversation-bound", "turn-bound-1")
	harness.acceptInput("conversation-bound", "turn-bound-1", "fix the parser")
	harness.requestApproval("conversation-bound", "turn-bound-1", "approval-bound-1")

	registry := harness.start()
	decisionContext := requireDecisionContext(t, registry)

	target := decisionContext.Workstreams[0]
	if target.ResourceScope.Kind != WorkstreamResourceScopeFolder {
		t.Fatalf("folder-bound target scope = %q", target.ResourceScope.Kind)
	}
	if target.ResourceScope.Folder == nil || target.ResourceScope.Folder.WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("folder-bound target scope folder = %+v", target.ResourceScope.Folder)
	}

	encoded, err := json.Marshal(decisionContext)
	if err != nil {
		t.Fatalf("marshal decision context: %v", err)
	}
	for _, forbidden := range []string{
		"/tmp/setta-registry-alpha",
		"approval-bound-1",
		"provider-turn-bound-1",
		"rootPath",
	} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("decision context exposes %q", forbidden)
		}
	}
}

// TestDecisionContextClosesRecoveryOnceItIsAddressed proves a failure stops
// being offered when durable state says it was handled: a recovery attempt
// names it, or a later run of the same workstream finished.
func TestDecisionContextClosesRecoveryOnceItIsAddressed(t *testing.T) {
	harness := newRegistryHarness(t)
	recovered := harness.createConversation("conversation-recovered", "Nightly import", nil)
	superseded := harness.createConversation("conversation-superseded", "Docs build", nil)

	harness.startTurn("conversation-recovered", "turn-recovered-1")
	harness.acceptInput("conversation-recovered", "turn-recovered-1", "import last night's data")
	recoveredFailure := harness.failTurn("conversation-recovered", "turn-recovered-1", "The import failed")

	harness.startTurn("conversation-superseded", "turn-superseded-1")
	harness.acceptInput("conversation-superseded", "turn-superseded-1", "build the docs")
	harness.failTurn("conversation-superseded", "turn-superseded-1", "The docs build failed")

	registry := harness.start()
	pending := requireDecisionContext(t, registry)
	if len(requireDecisionTarget(t, pending, recovered).RecoverableFailures) != 1 {
		t.Fatalf("failed workstream offers no recoverable failure")
	}
	if len(requireDecisionTarget(t, pending, superseded).RecoverableFailures) != 1 {
		t.Fatalf("superseded workstream offers no recoverable failure")
	}
	registry.Close()

	harness.appendFact(DirectorFactEvent{
		Kind:         DirectorFactRecoveryAttempted,
		WorkstreamID: &recovered,
		Actor:        SemanticActorDirector,
		RecoveryAttempted: &DirectorRecoveryAttempted{
			RecoveryID:     "recovery-1",
			Status:         RecoveryStatusRetrying,
			FailureEventID: recoveredFailure.ID,
			PublicSummary:  "Retrying the import",
		},
	})
	harness.startTurn("conversation-superseded", "turn-superseded-2")
	harness.acceptInput("conversation-superseded", "turn-superseded-2", "build the docs again")
	harness.completeTurnTrajectory("conversation-superseded", "turn-superseded-2")
	harness.completeTurn("conversation-superseded", "turn-superseded-2")

	restarted := harness.start()
	addressed := requireDecisionContext(t, restarted)
	recoveredTarget := requireDecisionTarget(t, addressed, recovered)
	if len(recoveredTarget.RecoverableFailures) != 0 {
		t.Fatalf("a recovered failure is still offered: %+v", recoveredTarget.RecoverableFailures)
	}
	if slices.Contains(recoveredTarget.AllowedDecisionKinds, DirectorDecisionRecoverPath) {
		t.Fatalf("recovered target still allows %q", DirectorDecisionRecoverPath)
	}
	supersededTarget := requireDecisionTarget(t, addressed, superseded)
	if len(supersededTarget.RecoverableFailures) != 0 {
		t.Fatalf("a failure a later run moved past is still offered: %+v", supersededTarget.RecoverableFailures)
	}
}

// TestDecisionContextResumesTheDecisionsItCommitted proves the Director's own
// recent decisions survive a restart, so a later tool call is authorized with
// the continuity the app already committed.
func TestDecisionContextResumesTheDecisionsItCommitted(t *testing.T) {
	harness := newRegistryHarness(t)
	first := harness.createConversation("conversation-first", "Parser rewrite", nil)
	second, err := WorkstreamIDForConversation("conversation-second")
	if err != nil {
		t.Fatalf("WorkstreamIDForConversation: %v", err)
	}

	sent := harness.appendFact(DirectorFactEvent{
		Kind:         DirectorFactDecisionCommitted,
		WorkstreamID: &first,
		Actor:        SemanticActorDirector,
		DecisionCommitted: &DirectorDecisionCommitted{
			Decision:             DirectorDecisionSendToWorkstream,
			IntentID:             "intent-sent",
			PublicSummary:        "Sent new work to \"Parser rewrite\".",
			TargetWorkstreamID:   &first,
			WorkspaceRequirement: workspaceRequirementPointer(WorkspaceRequired),
		},
	})
	// Starting a root workstream happens in no workstream: the decision was made
	// before the work it created existed.
	harness.appendFact(DirectorFactEvent{
		Kind:  DirectorFactDecisionCommitted,
		Actor: SemanticActorDirector,
		DecisionCommitted: &DirectorDecisionCommitted{
			Decision:             DirectorDecisionCreateWorkstream,
			IntentID:             "intent-created",
			PublicSummary:        "Started the workstream \"Release notes\".",
			TargetWorkstreamID:   &second,
			WorkspaceRequirement: workspaceRequirementPointer(WorkspaceOptional),
		},
	})
	harness.createConversation("conversation-second", "Release notes", nil)

	registry := harness.start()
	resumed := requireDecisionContext(t, registry)
	if len(resumed.RecentDecisions) != 2 {
		t.Fatalf("recent decisions = %+v", resumed.RecentDecisions)
	}
	if resumed.RecentDecisions[0].IntentID != "intent-sent" ||
		resumed.RecentDecisions[0].DecidedAt != sent.EmittedAt {
		t.Fatalf("first recent decision = %+v", resumed.RecentDecisions[0])
	}
	if resumed.RecentDecisions[1].TargetWorkstreamID == nil ||
		*resumed.RecentDecisions[1].TargetWorkstreamID != second {
		t.Fatalf("second recent decision = %+v", resumed.RecentDecisions[1])
	}
	if _, found := resumed.Target(second); !found {
		t.Fatalf("the second workstream is not a routing target")
	}
}

// TestDecisionContextBoundsTargetsAndKeepsTheSelectedOne proves the routing set
// stays bounded as the app fills up, and that the workstream the user is
// looking at is always somewhere the Director can send their next request.
func TestDecisionContextBoundsTargetsAndKeepsTheSelectedOne(t *testing.T) {
	harness := newRegistryHarness(t)
	oldest := harness.createConversation("conversation-000", "Workstream 000", nil)
	for index := 1; index <= MaxDecisionWorkstreamTargets+2; index++ {
		harness.createConversation(
			fmt.Sprintf("conversation-%03d", index),
			fmt.Sprintf("Workstream %03d", index),
			nil,
		)
	}
	archivedID := fmt.Sprintf("conversation-%03d", MaxDecisionWorkstreamTargets+2)
	archived := harness.archiveConversation(archivedID, "Workstream archived")
	harness.appendFact(DirectorFactEvent{
		Kind:               DirectorFactWorkstreamSelected,
		WorkstreamID:       &oldest,
		Actor:              SemanticActorUser,
		WorkstreamSelected: &DirectorWorkstreamSelected{},
	})

	registry := harness.start()
	decisionContext := requireDecisionContext(t, registry)

	if len(decisionContext.Workstreams) != MaxDecisionWorkstreamTargets {
		t.Fatalf("context offers %d targets, want %d",
			len(decisionContext.Workstreams), MaxDecisionWorkstreamTargets)
	}
	if decisionContext.SelectedID == nil || *decisionContext.SelectedID != oldest {
		t.Fatalf("context selects %v, want the selected workstream %s", decisionContext.SelectedID, oldest)
	}
	if _, found := decisionContext.Target(oldest); !found {
		t.Fatalf("the selected workstream fell out of the bounded routing set")
	}
	if _, found := decisionContext.Target(archived); found {
		t.Fatalf("an archived workstream is offered as a routing target")
	}
}
