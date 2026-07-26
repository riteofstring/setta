package director

import (
	"strings"
	"testing"

	"setta/internal/conversation"
)

func TestSourceFactMappingIsTotal(t *testing.T) {
	if err := ValidateSourceFactCoverage(); err != nil {
		t.Fatalf("source fact mapping is incomplete: %v", err)
	}
}

func TestProjectorRejectsAnEdgeOmittedByTheSourceFactRule(t *testing.T) {
	workstream := newProjectedWorkstream("ws-edge-rule")
	projector := NewDirectorGraphProjector()
	projector.workstreams[workstream.id] = workstream

	err := projector.addEdge(
		factContext{
			eventID:    "event-edge-rule",
			emittedAt:  "2026-07-24T12:00:00Z",
			workstream: workstream,
			sourceFact: string(conversation.TrajectoryEventTurnPromoted),
		},
		SemanticEdgeBlockedBy,
		"run:from",
		"blocked:to",
	)
	if err == nil || !strings.Contains(err.Error(), "cannot create undeclared semantic edge") {
		t.Fatalf("undeclared source-fact edge was not rejected: %v", err)
	}
}

func TestStreamingTextNeverProjectsANode(t *testing.T) {
	for _, kind := range []conversation.TrajectoryEventKind{
		conversation.TrajectoryEventAgentPublicTextDelta,
		conversation.TrajectoryEventAgentMessageCompleted,
		conversation.TrajectoryEventPublicReasoningSummaryUpdated,
	} {
		rule, err := TrajectoryFactRule(kind)
		if err != nil {
			t.Fatalf("%q has no rule: %v", kind, err)
		}
		if rule.Disposition != SourceFactDetailSurface {
			t.Fatalf("%q must stay a detail surface, got %q", kind, rule.Disposition)
		}
		if rule.NodeKind != SemanticNodeNone || rule.NodeIdentity != SemanticNodeIdentityNone {
			t.Fatalf("%q must not name a node", kind)
		}
	}
}

func TestRunProgressUpdatesOneNode(t *testing.T) {
	queued, err := TrajectoryFactRule(conversation.TrajectoryEventTurnQueued)
	if err != nil {
		t.Fatalf("turn_queued has no rule: %v", err)
	}
	if queued.Disposition != SourceFactCreatesNode || queued.NodeIdentity != SemanticNodeIdentityRun {
		t.Fatalf("turn_queued must create the run node, got %q/%q", queued.Disposition, queued.NodeIdentity)
	}
	for _, kind := range []conversation.TrajectoryEventKind{
		conversation.TrajectoryEventTurnPromoted,
		conversation.TrajectoryEventTurnSteered,
	} {
		rule, err := TrajectoryFactRule(kind)
		if err != nil {
			t.Fatalf("%q has no rule: %v", kind, err)
		}
		if rule.Disposition != SourceFactUpdatesNode || rule.NodeIdentity != SemanticNodeIdentityRun {
			t.Fatalf("%q must update the single run node, got %q/%q", kind, rule.Disposition, rule.NodeIdentity)
		}
	}
	started, err := TrajectoryFactRule(conversation.TrajectoryEventTurnStarted)
	if err != nil {
		t.Fatalf("turn_started has no rule: %v", err)
	}
	if started.Disposition != SourceFactUpsertsNode ||
		started.NodeIdentity != SemanticNodeIdentityRun {
		t.Fatalf(
			"turn_started must create or update the single run node, got %q/%q",
			started.Disposition,
			started.NodeIdentity,
		)
	}
}

func TestInterruptionRequestIsConditionalOnTerminalAuthority(t *testing.T) {
	rule, err := TrajectoryFactRule(conversation.TrajectoryEventTurnInterrupted)
	if err != nil {
		t.Fatalf("turn_interrupted has no rule: %v", err)
	}
	if rule.Disposition != SourceFactConditionalNode ||
		rule.NodeIdentity != SemanticNodeIdentityRunTerminal ||
		rule.NodeKind != SemanticNodeCancelled {
		t.Fatalf(
			"turn_interrupted must conditionally close the run, got %q/%q/%q",
			rule.Disposition,
			rule.NodeIdentity,
			rule.NodeKind,
		)
	}
}

func TestActivityKindsMapToPreciseNodes(t *testing.T) {
	expected := map[conversation.TrajectoryActivityKind]SemanticNodeKind{
		conversation.TrajectoryActivityCommand:         SemanticNodeAction,
		conversation.TrajectoryActivityMCPTool:         SemanticNodeAction,
		conversation.TrajectoryActivityDynamicTool:     SemanticNodeAction,
		conversation.TrajectoryActivityHook:            SemanticNodeAction,
		conversation.TrajectoryActivityFileChange:      SemanticNodeAction,
		conversation.TrajectoryActivitySleep:           SemanticNodeAction,
		conversation.TrajectoryActivityWebSearch:       SemanticNodeInvestigation,
		conversation.TrajectoryActivityImageView:       SemanticNodeInvestigation,
		conversation.TrajectoryActivityImageGeneration: SemanticNodeAction,
		conversation.TrajectoryActivitySubagent:        SemanticNodeDelegation,
		conversation.TrajectoryActivityOther:           SemanticNodeNone,
	}
	for _, kind := range conversation.TrajectoryActivityKinds() {
		want, declared := expected[kind]
		if !declared {
			t.Fatalf("activity kind %q has no expected semantic mapping", kind)
		}
		got, err := NodeKindForActivity(kind)
		if err != nil {
			t.Fatalf("activity kind %q was rejected: %v", kind, err)
		}
		if got != want {
			t.Fatalf("activity kind %q mapped to %q, want %q", kind, got, want)
		}
	}
}

func TestOnlyActionableLifecycleStatesBecomeNodes(t *testing.T) {
	for status, want := range map[conversation.ProviderLifecycleStatus]SemanticNodeKind{
		conversation.ProviderLifecycleReady:       SemanticNodeNone,
		conversation.ProviderLifecycleRestarting:  SemanticNodeRecovery,
		conversation.ProviderLifecycleClosed:      SemanticNodeBlocked,
		conversation.ProviderLifecycleUnavailable: SemanticNodeBlocked,
	} {
		got, err := NodeKindForProviderLifecycle(status)
		if err != nil {
			t.Fatalf("provider lifecycle %q was rejected: %v", status, err)
		}
		if got != want {
			t.Fatalf("provider lifecycle %q mapped to %q, want %q", status, got, want)
		}
	}
}

func TestTrajectoryActorsBecomeSemanticRoles(t *testing.T) {
	if actor, err := SemanticActorForTrajectoryActor(conversation.TrajectoryActorAgent); err != nil || actor != SemanticActorWorker {
		t.Fatalf("agent must present as a worker, got %q (%v)", actor, err)
	}
	if _, err := SemanticActorForTrajectoryActor("narrator"); err == nil {
		t.Fatal("an unknown trajectory actor must be rejected")
	}
}

func TestNodeIDsAreDerivedDeterministically(t *testing.T) {
	first, err := SemanticNodeID(SemanticNodeIdentityRun, "turn-9")
	if err != nil {
		t.Fatalf("run node id was rejected: %v", err)
	}
	second, err := SemanticNodeID(SemanticNodeIdentityRun, "turn-9")
	if err != nil {
		t.Fatalf("run node id was rejected on replay: %v", err)
	}
	if first != second || first != "run:turn-9" {
		t.Fatalf("run node id must be derived, got %q and %q", first, second)
	}
	if _, err := SemanticNodeID(SemanticNodeIdentityPlanStep, "event-3"); err == nil {
		t.Fatal("plan step ids need a step index")
	}
	stepID, err := PlanStepNodeID("event-3", 2)
	if err != nil {
		t.Fatalf("plan step node id was rejected: %v", err)
	}
	if stepID != "plan_step:event-3:2" {
		t.Fatalf("plan step id must combine the source event and index, got %q", stepID)
	}
	if _, err := PlanStepNodeID("event-3", -1); err == nil {
		t.Fatal("a negative plan step index must be rejected")
	}
}
