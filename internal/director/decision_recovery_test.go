package director

import (
	"strings"
	"testing"
)

func TestEveryRejectionReasonHasAPublicSafeDiagnostic(t *testing.T) {
	secret := "sk-live-should-never-surface"
	for _, reason := range DecisionRejectionReasons() {
		rejection := newDecisionRejection(reason, "provider said "+secret)
		diagnostic, err := rejection.PublicSafeDiagnostic()
		if err != nil {
			t.Fatalf("rejection %q has no diagnostic: %v", reason, err)
		}
		if strings.TrimSpace(diagnostic) == "" {
			t.Fatalf("rejection %q has an empty diagnostic", reason)
		}
		if strings.Contains(diagnostic, secret) {
			t.Fatalf("rejection %q leaks its internal detail", reason)
		}
		if !strings.Contains(rejection.Error(), secret) {
			t.Fatalf("rejection %q must keep its detail for logs", reason)
		}
	}
	if _, err := (&DecisionRejection{Reason: "invented"}).PublicSafeDiagnostic(); err == nil {
		t.Fatal("an unknown rejection reason must fail loudly rather than produce generic text")
	}
}

func TestDecisionRecoveryRetriesOnceBeforeResolvingWithoutTheModel(t *testing.T) {
	context := decisionContextFixture()
	rejection := newDecisionRejection(DecisionRejectedUnknownTarget, "named workstream-missing")

	first, err := NextDecisionRecovery(DecisionRecoveryRequest{Context: context, Rejection: rejection})
	if err != nil {
		t.Fatalf("first recovery: %v", err)
	}
	if first.Step != DecisionRecoveryRetrySameContext {
		t.Fatalf("the first recovery must retry the same context, got %q", first.Step)
	}
	expected, _ := rejection.PublicSafeDiagnostic()
	if first.Diagnostic != expected {
		t.Fatalf("the retry must carry the public-safe diagnostic, got %q", first.Diagnostic)
	}

	second, err := NextDecisionRecovery(DecisionRecoveryRequest{
		Context: context, Rejection: rejection, Retried: true,
	})
	if err != nil {
		t.Fatalf("second recovery: %v", err)
	}
	if second.Step != DecisionRecoveryClarify {
		t.Fatalf("a second failure with several authorized targets must clarify, got %q", second.Step)
	}
	if second.Decision == nil || second.Decision.Kind != DirectorDecisionAskClarification {
		t.Fatalf("the clarify step must carry a clarification decision, got %+v", second.Decision)
	}
	if len(second.CandidateWorkstreamIDs) != 3 {
		t.Fatalf("the clarification must name its candidates, got %v", second.CandidateWorkstreamIDs)
	}
	question := second.Decision.AskClarification.Question
	if !strings.Contains(question, "Parser rewrite") || !strings.Contains(question, "Release notes") {
		t.Fatalf("the clarification must name workstreams by their trusted titles, got %q", question)
	}
}

func TestDecisionRecoveryRematerializesWhenTrustedStateMoved(t *testing.T) {
	context := decisionContextFixture()
	moved, err := NextDecisionRecovery(DecisionRecoveryRequest{
		Context:        context,
		Rejection:      newDecisionRejection(DecisionRejectedUnauthorizedTarget, "target went active"),
		ContextChanged: true,
	})
	if err != nil {
		t.Fatalf("recovery after a context change: %v", err)
	}
	if moved.Step != DecisionRecoveryRematerialize {
		t.Fatalf("a changed context must be rebuilt before retrying, got %q", moved.Step)
	}

	stale, err := NextDecisionRecovery(DecisionRecoveryRequest{
		Context:   context,
		Rejection: newDecisionRejection(DecisionRejectedStaleContext, "context no longer validates"),
		Retried:   true,
	})
	if err != nil {
		t.Fatalf("recovery after a stale context: %v", err)
	}
	if stale.Step != DecisionRecoveryRematerialize {
		t.Fatalf("a stale context must never be retried as-is, got %q", stale.Step)
	}
}

func TestDecisionRecoveryBlocksWhenNothingAuthorizedRemains(t *testing.T) {
	invalid := decisionContextFixture()
	invalid.Intent.Text = ""
	blocked, err := NextDecisionRecovery(DecisionRecoveryRequest{
		Context:        invalid,
		Rejection:      newDecisionRejection(DecisionRejectedStaleContext, "context no longer validates"),
		Retried:        true,
		Rematerialized: true,
	})
	if err != nil {
		t.Fatalf("terminal recovery: %v", err)
	}
	if blocked.Step != DecisionRecoveryBlocked {
		t.Fatalf("an unusable context must end in a durable blocked state, got %q", blocked.Step)
	}
	if strings.TrimSpace(blocked.PublicSummary) == "" {
		t.Fatal("a blocked state must carry a public summary")
	}

	idle, err := NextDecisionRecovery(DecisionRecoveryRequest{
		Context:   selectionOnlyContextFixture(),
		Rejection: newDecisionRejection(DecisionRejectedInvalidPayload, "wrong fields"),
		Retried:   true,
	})
	if err != nil {
		t.Fatalf("recovery with no way to start work: %v", err)
	}
	if idle.Step != DecisionRecoveryBlocked {
		t.Fatalf("no authorized way to start work must block rather than ask, got %q", idle.Step)
	}
}

func TestDecisionRecoveryCommitsTheOnlyAuthorizedOutcome(t *testing.T) {
	context := singleTargetContextFixture()
	recovery, err := NextDecisionRecovery(DecisionRecoveryRequest{
		Context:   context,
		Rejection: newDecisionRejection(DecisionRejectedMalformedOutput, "not json"),
		Retried:   true,
	})
	if err != nil {
		t.Fatalf("product-invariant recovery: %v", err)
	}
	if recovery.Step != DecisionRecoveryProductInvariant {
		t.Fatalf("one authorized outcome needs no model judgment, got %q", recovery.Step)
	}
	if recovery.Decision.Kind != DirectorDecisionSendToWorkstream ||
		recovery.Decision.SendToWorkstream.WorkstreamID != fixtureIdleWorkstream {
		t.Fatalf("the invariant must route to the only allowed target, got %+v", recovery.Decision)
	}
	if recovery.Decision.SendToWorkstream.AuthoredInput != context.Intent.Text {
		t.Fatal("the invariant must send the user's own request, not invented text")
	}

	if _, resolved := ProductInvariantDecision(decisionContextFixture()); resolved {
		t.Fatal("several authorized outcomes must not resolve by invariant")
	}
	if _, resolved := ProductInvariantDecision(selectionOnlyContextFixture()); resolved {
		t.Fatal("no authorized outcome must not resolve by invariant")
	}
}

func TestDecisionRecoveryRequiresARejection(t *testing.T) {
	if _, err := NextDecisionRecovery(DecisionRecoveryRequest{Context: decisionContextFixture()}); err == nil {
		t.Fatal("recovery without a rejection must fail loudly")
	}
}

func selectionOnlyContextFixture() DirectorDecisionContext {
	context := decisionContextFixture()
	target := idleDecisionTarget()
	target.AllowedDecisionKinds = []DirectorDecisionKind{DirectorDecisionSelectWorkstream}
	target.AllowsChildWorkstream = false
	target.ForkPoints = []DecisionForkPoint{}
	context.SelectedID = nil
	context.Workspaces = []DecisionWorkspaceOption{}
	context.Workstreams = []WorkstreamDecisionTarget{target}
	context.AllowedDecisionKinds = []DirectorDecisionKind{
		DirectorDecisionAnswerDirectly,
		DirectorDecisionAskClarification,
		DirectorDecisionSelectWorkstream,
	}
	return context
}
