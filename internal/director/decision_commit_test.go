package director

import (
	"strings"
	"testing"
)

// mintedWorkstreamID is the id trusted product code assigns to a workstream a
// create decision asked for. The protocol never names it.
const mintedWorkstreamID = "workstream-new"

func TestCommittedDecisionsAreDurableFacts(t *testing.T) {
	context := decisionContextFixture()
	for _, decision := range authorizedDecisionsForFixture() {
		var minted *string
		if decision.Kind == DirectorDecisionCreateWorkstream {
			id := mintedWorkstreamID
			minted = &id
		}
		committed, err := NewCommittedDecision(context, decision, minted)
		if err != nil {
			t.Fatalf("commit %q: %v", decision.Kind, err)
		}
		fact := decisionFactFixture(committed, decisionFactWorkstream(decision))
		if err := ValidateDirectorFactEvent(fact); err != nil {
			t.Fatalf("committed %q is not a durable fact: %v", decision.Kind, err)
		}
	}
}

func TestCommittedDecisionSummariesUseTrustedText(t *testing.T) {
	context := decisionContextFixture()
	cases := []struct {
		decision DirectorDecision
		contains string
	}{
		{sendDecisionFixture(fixtureIdleWorkstream), "Parser rewrite"},
		{
			DirectorDecision{Kind: DirectorDecisionSteerRun, SteerRun: &SteerRunDecision{
				WorkstreamID: fixtureActiveWorkstream, AuthoredInput: "shorter, please",
			}},
			"Release notes",
		},
		{
			DirectorDecision{Kind: DirectorDecisionRecoverPath, RecoverPath: &RecoverPathDecision{
				WorkstreamID: fixtureFailedWorkstream, FailureEventID: fixtureFailureEventID,
			}},
			"the run ended before it finished importing",
		},
		{createRootDecisionFixture(folderlessDecisionScope()), "Migration draft"},
	}
	for _, testCase := range cases {
		summary, err := DecisionPublicSummary(context, testCase.decision)
		if err != nil {
			t.Fatalf("summarize %q: %v", testCase.decision.Kind, err)
		}
		if !strings.Contains(summary, testCase.contains) {
			t.Fatalf("summary %q must mention %q", summary, testCase.contains)
		}
	}
	steer := DirectorDecision{Kind: DirectorDecisionSteerRun, SteerRun: &SteerRunDecision{
		WorkstreamID: fixtureActiveWorkstream, AuthoredInput: "rm -rf ./build && redeploy",
	}}
	summary, err := DecisionPublicSummary(context, steer)
	if err != nil {
		t.Fatalf("summarize steer: %v", err)
	}
	if strings.Contains(summary, "rm -rf") {
		t.Fatalf("a public summary must not carry authored input verbatim: %q", summary)
	}
}

func TestCommittedDecisionsGuardMintedIdentity(t *testing.T) {
	context := decisionContextFixture()
	if _, err := NewCommittedDecision(context, createRootDecisionFixture(folderlessDecisionScope()), nil); err == nil {
		t.Fatal("create_workstream without a minted id must fail loudly")
	}
	minted := mintedWorkstreamID
	if _, err := NewCommittedDecision(context, sendDecisionFixture(fixtureIdleWorkstream), &minted); err == nil {
		t.Fatal("a non-create decision must not mint a workstream")
	}
	if _, err := NewCommittedDecision(context, sendDecisionFixture(fixtureActiveWorkstream), nil); err == nil {
		t.Fatal("an unauthorized decision must never reach a durable fact")
	}
}

func TestCommittedDecisionTargetsFollowTheCatalog(t *testing.T) {
	context := decisionContextFixture()
	for _, decision := range authorizedDecisionsForFixture() {
		target := DecisionTargetWorkstreamID(decision)
		switch decision.Kind {
		case DirectorDecisionCreateWorkstream:
			if target != nil {
				t.Fatalf("%q must not carry an existing target, got %q", decision.Kind, *target)
			}
		default:
			if target == nil {
				t.Fatalf("%q must name the workstream it acts on", decision.Kind)
			}
			if _, found := context.Target(*target); !found {
				t.Fatalf("%q names %q which the context did not supply", decision.Kind, *target)
			}
		}
	}
	fork := DirectorDecision{
		Kind: DirectorDecisionCreateWorkstream,
		CreateWorkstream: &CreateWorkstreamDecision{
			Origin: WorkstreamCreationOrigin{Kind: WorkstreamCreationFork, Fork: &ForkWorkstreamOrigin{
				ParentWorkstreamID: fixtureIdleWorkstream, ForkedAtRunID: fixtureForkRunID,
			}},
			InitialInput:  "try the other approach",
			ProposedTitle: "Alternate parser",
		},
	}
	parent := DecisionParentWorkstreamID(fork)
	if parent == nil || *parent != fixtureIdleWorkstream {
		t.Fatalf("a fork must name its parent, got %v", parent)
	}
	if DecisionParentWorkstreamID(sendDecisionFixture(fixtureIdleWorkstream)) != nil {
		t.Fatal("only a create decision has a parent")
	}
}

func decisionFactFixture(committed DirectorDecisionCommitted, workstreamID *string) DirectorFactEvent {
	return DirectorFactEvent{
		ID:                "fact-decision-1",
		EmittedAt:         "2026-07-24T12:00:01Z",
		Kind:              DirectorFactDecisionCommitted,
		WorkstreamID:      workstreamID,
		Actor:             SemanticActorDirector,
		DecisionCommitted: &committed,
	}
}

// decisionFactWorkstream is where a decision happened, which is what the
// executor commits the fact against. A root workstream was created before one
// existed, and every other decision happened in the workstream it acted on.
func decisionFactWorkstream(decision DirectorDecision) *string {
	switch decision.Kind {
	case DirectorDecisionCreateWorkstream:
		return DecisionParentWorkstreamID(decision)
	default:
		return DecisionTargetWorkstreamID(decision)
	}
}
