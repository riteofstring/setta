package director

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"testing"
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

	idleTarget := requireDecisionTarget(t, decisionContext, idle)
	if !slices.Equal(idleTarget.AllowedDecisionKinds, []DirectorDecisionKind{
		DirectorDecisionSelectWorkstream,
		DirectorDecisionSendToWorkstream,
	}) {
		t.Fatalf("idle target allows %v", idleTarget.AllowedDecisionKinds)
	}
	if len(idleTarget.ForkPoints) != 1 || idleTarget.ForkPoints[0].RunID != "turn-idle-1" {
		t.Fatalf("idle target fork points = %+v", idleTarget.ForkPoints)
	}
	if idleTarget.ForkPoints[0].InputExcerpt != "do the work" {
		t.Fatalf("fork point excerpt = %q, want the run's authored input", idleTarget.ForkPoints[0].InputExcerpt)
	}

	runningTarget := requireDecisionTarget(t, decisionContext, running)
	if !slices.Equal(runningTarget.AllowedDecisionKinds, []DirectorDecisionKind{
		DirectorDecisionSelectWorkstream,
		DirectorDecisionQueueBehindRun,
		DirectorDecisionSteerRun,
	}) {
		t.Fatalf("running target allows %v", runningTarget.AllowedDecisionKinds)
	}
	if runningTarget.ActiveRunID == nil || *runningTarget.ActiveRunID != "turn-running-1" {
		t.Fatalf("running target active run = %v", runningTarget.ActiveRunID)
	}
	if len(runningTarget.ForkPoints) != 0 {
		t.Fatalf("a run that has not completed is offered as a fork point: %+v", runningTarget.ForkPoints)
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
		DirectorDecisionAnswerDirectly,
		DirectorDecisionCreateWorkstream,
		DirectorDecisionAskClarification,
		DirectorDecisionRecoverPath,
	} {
		if !slices.Contains(decisionContext.AllowedDecisionKinds, kind) {
			t.Fatalf("context allows %v, missing %q", decisionContext.AllowedDecisionKinds, kind)
		}
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
		DirectorDecisionAnswerDirectly,
		DirectorDecisionCreateWorkstream,
	}) {
		t.Fatalf("empty registry allows %v", decisionContext.AllowedDecisionKinds)
	}
	if decisionContext.SelectedID != nil || decisionContext.Clarification != nil {
		t.Fatalf("empty registry context selects %v and clarifies %v",
			decisionContext.SelectedID, decisionContext.Clarification)
	}
	if len(decisionContext.Workspaces) != 1 || decisionContext.Workspaces[0].WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("workspace options = %+v", decisionContext.Workspaces)
	}
}

// TestDecisionContextCarriesNoResourcePathsOrExecutionIdentity proves the hard
// line the Master route context could not hold: nothing the model sees names a
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
	if len(supersededTarget.ForkPoints) != 1 || supersededTarget.ForkPoints[0].RunID != "turn-superseded-2" {
		t.Fatalf("completed run is not a fork point: %+v", supersededTarget.ForkPoints)
	}
}

// TestDecisionContextResumesTheClarificationItAsked proves a question survives
// a restart with the candidates it offered, so the next intent is understood as
// the answer rather than as a new request.
func TestDecisionContextResumesTheClarificationItAsked(t *testing.T) {
	harness := newRegistryHarness(t)
	first := harness.createConversation("conversation-first", "Parser rewrite", nil)
	second := harness.createConversation("conversation-second", "Release notes", nil)

	sent := harness.appendFact(DirectorFactEvent{
		Kind:         DirectorFactDecisionCommitted,
		WorkstreamID: &first,
		Actor:        SemanticActorDirector,
		DecisionCommitted: &DirectorDecisionCommitted{
			Decision:           DirectorDecisionSendToWorkstream,
			IntentID:           "intent-sent",
			PublicSummary:      "Sent new work to \"Parser rewrite\".",
			TargetWorkstreamID: &first,
		},
	})
	// A clarification happens in no workstream: it starts work nowhere, and the
	// workstreams it is choosing between are its candidates rather than its home.
	asked := harness.appendFact(DirectorFactEvent{
		Kind:  DirectorFactDecisionCommitted,
		Actor: SemanticActorDirector,
		DecisionCommitted: &DirectorDecisionCommitted{
			Decision:      DirectorDecisionAskClarification,
			IntentID:      "intent-asked",
			PublicSummary: "Asked one clarifying question before routing this request.",
			Clarification: &DirectorClarificationAsked{
				Question:               "Which workstream should handle this: \"Parser rewrite\", \"Release notes\"?",
				CandidateWorkstreamIDs: []string{first, second},
			},
		},
	})

	registry := harness.start()
	pending := requireDecisionContext(t, registry)
	if pending.Clarification == nil {
		t.Fatalf("a committed clarification is not pending")
	}
	if pending.Clarification.DecisionID != asked.ID || pending.Clarification.IntentID != "intent-asked" {
		t.Fatalf("pending clarification = %+v", pending.Clarification)
	}
	if !slices.Equal(pending.Clarification.CandidateWorkstreamIDs, []string{first, second}) {
		t.Fatalf("pending clarification candidates = %v", pending.Clarification.CandidateWorkstreamIDs)
	}
	if len(pending.RecentDecisions) != 2 {
		t.Fatalf("recent decisions = %+v", pending.RecentDecisions)
	}
	if pending.RecentDecisions[0].IntentID != "intent-sent" ||
		pending.RecentDecisions[0].DecidedAt != sent.EmittedAt {
		t.Fatalf("first recent decision = %+v", pending.RecentDecisions[0])
	}
	if pending.RecentDecisions[1].TargetWorkstreamID != nil {
		t.Fatalf("a clarification reports target %v", pending.RecentDecisions[1].TargetWorkstreamID)
	}
	registry.Close()

	harness.appendFact(DirectorFactEvent{
		Kind:         DirectorFactDecisionCommitted,
		WorkstreamID: &second,
		Actor:        SemanticActorDirector,
		DecisionCommitted: &DirectorDecisionCommitted{
			Decision:           DirectorDecisionSendToWorkstream,
			IntentID:           "intent-answered",
			PublicSummary:      "Sent new work to \"Release notes\".",
			TargetWorkstreamID: &second,
		},
	})

	answered := requireDecisionContext(t, harness.start())
	if answered.Clarification != nil {
		t.Fatalf("an answered clarification is still pending: %+v", answered.Clarification)
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
