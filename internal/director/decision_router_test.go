package director

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"testing"
)

// The router is where invalid model output stops being a user-facing problem.
// These tests assert the ladder from the outside: what the model is asked, what
// it is told when it answers badly, and what the app does when it never answers
// usefully at all.

// scriptedDecisionSource hands out contexts in order and repeats the last one,
// which is how a test moves trusted state underneath an in-flight call.
type scriptedDecisionSource struct {
	contexts []DirectorDecisionContext
	err      error
	calls    int
}

func (source *scriptedDecisionSource) DecisionContext(intent SubmittedIntent) (DirectorDecisionContext, error) {
	if source.err != nil {
		return DirectorDecisionContext{}, source.err
	}
	index := source.calls
	source.calls++
	if index >= len(source.contexts) {
		index = len(source.contexts) - 1
	}
	materialized := source.contexts[index]
	materialized.Intent = intent
	return materialized, nil
}

// scriptedDecisionCaller replays canned provider output and records what it was
// asked, so a test can assert the retry carried the right context and nothing
// but the public-safe diagnostic.
type scriptedDecisionCaller struct {
	outputs []json.RawMessage
	err     error
	calls   []DecisionCall
}

func (caller *scriptedDecisionCaller) CallDecision(_ context.Context, call DecisionCall) (json.RawMessage, error) {
	caller.calls = append(caller.calls, call)
	if caller.err != nil {
		return nil, caller.err
	}
	if len(caller.calls) > len(caller.outputs) {
		return nil, errors.New("scripted caller ran out of output")
	}
	return caller.outputs[len(caller.calls)-1], nil
}

func decisionOutput(t *testing.T, payload map[string]any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(map[string]any{"decision": payload})
	if err != nil {
		t.Fatalf("marshal decision output: %v", err)
	}
	return encoded
}

func routeIntent(
	t *testing.T,
	source DecisionSource,
	caller DecisionCaller,
) RoutedIntent {
	t.Helper()
	router, err := NewDecisionRouter(source, caller)
	if err != nil {
		t.Fatalf("NewDecisionRouter: %v", err)
	}
	routed, err := router.Route(context.Background(), decisionContextFixture().Intent)
	if err != nil {
		t.Fatalf("Route: %v", err)
	}
	return routed
}

// TestDecisionRouterCarriesAnAuthorizedModelDecision proves the ordinary path:
// one call, and the decision the model returned is the decision trusted code
// carries out.
func TestDecisionRouterCarriesAnAuthorizedModelDecision(t *testing.T) {
	source := &scriptedDecisionSource{contexts: []DirectorDecisionContext{decisionContextFixture()}}
	caller := &scriptedDecisionCaller{outputs: []json.RawMessage{decisionOutput(t, map[string]any{
		"kind":          string(DirectorDecisionSteerRun),
		"workstreamId":  fixtureActiveWorkstream,
		"authoredInput": "focus on the changelog first",
	})}}

	routed := routeIntent(t, source, caller)

	if routed.Resolution != DecisionResolvedByModel {
		t.Fatalf("resolution = %q, want %q", routed.Resolution, DecisionResolvedByModel)
	}
	if routed.Decision == nil || routed.Decision.Kind != DirectorDecisionSteerRun {
		t.Fatalf("routed decision = %+v", routed.Decision)
	}
	if routed.Decision.SteerRun.WorkstreamID != fixtureActiveWorkstream {
		t.Fatalf("steer target = %q", routed.Decision.SteerRun.WorkstreamID)
	}
	if len(caller.calls) != 1 || caller.calls[0].Diagnostic != "" {
		t.Fatalf("first attempt carried a diagnostic: %+v", caller.calls)
	}
	if len(caller.calls[0].Schema) == 0 {
		t.Fatalf("call carried no output schema")
	}
	// The decision is not committed here: the durable fact is written with the
	// work it describes.
	if routed.Context.Intent.ID != decisionContextFixture().Intent.ID {
		t.Fatalf("routed context answers intent %q", routed.Context.Intent.ID)
	}
}

// TestDecisionRouterRetriesWithOnlyAPublicSafeDiagnostic proves the repair path
// tells the model what was wrong in the app's own words. Provider text, user
// text, and internal error strings never reach the retry.
func TestDecisionRouterRetriesWithOnlyAPublicSafeDiagnostic(t *testing.T) {
	source := &scriptedDecisionSource{contexts: []DirectorDecisionContext{decisionContextFixture()}}
	caller := &scriptedDecisionCaller{outputs: []json.RawMessage{
		decisionOutput(t, map[string]any{
			"kind":          string(DirectorDecisionSendToWorkstream),
			"workstreamId":  fixtureActiveWorkstream,
			"authoredInput": "keep going on the parser",
		}),
		decisionOutput(t, map[string]any{
			"kind":          string(DirectorDecisionSendToWorkstream),
			"workstreamId":  fixtureIdleWorkstream,
			"authoredInput": "keep going on the parser",
		}),
	}}

	routed := routeIntent(t, source, caller)

	if routed.Resolution != DecisionResolvedByModel {
		t.Fatalf("resolution = %q, want %q", routed.Resolution, DecisionResolvedByModel)
	}
	if len(caller.calls) != 2 {
		t.Fatalf("router made %d calls, want 2", len(caller.calls))
	}
	diagnostic := caller.calls[1].Diagnostic
	if diagnostic != decisionRejectionDiagnostics[DecisionRejectedUnauthorizedTarget] {
		t.Fatalf("retry diagnostic = %q", diagnostic)
	}
	if strings.Contains(diagnostic, fixtureActiveWorkstream) ||
		strings.Contains(diagnostic, decisionContextFixture().Intent.Text) {
		t.Fatalf("retry diagnostic repeats rejected output or user text: %q", diagnostic)
	}
}

// TestDecisionRouterRematerializesWhenTrustedStateMoved proves a model that
// answered a question the app no longer asks is re-asked against what is true
// now rather than retried against a stale context.
func TestDecisionRouterRematerializesWhenTrustedStateMoved(t *testing.T) {
	moved := decisionContextFixture()
	moved.Workstreams = []WorkstreamDecisionTarget{idleDecisionTarget(), activeDecisionTarget()}
	moved.AllowedDecisionKinds = []DirectorDecisionKind{
		DirectorDecisionAnswerDirectly,
		DirectorDecisionCreateWorkstream,
		DirectorDecisionSendToWorkstream,
		DirectorDecisionQueueBehindRun,
		DirectorDecisionSteerRun,
		DirectorDecisionAskClarification,
		DirectorDecisionSelectWorkstream,
	}
	source := &scriptedDecisionSource{contexts: []DirectorDecisionContext{decisionContextFixture(), moved}}
	caller := &scriptedDecisionCaller{outputs: []json.RawMessage{
		decisionOutput(t, map[string]any{
			"kind":           string(DirectorDecisionRecoverPath),
			"workstreamId":   fixtureFailedWorkstream,
			"failureEventId": "event-that-does-not-exist",
		}),
		decisionOutput(t, map[string]any{
			"kind":          string(DirectorDecisionSendToWorkstream),
			"workstreamId":  fixtureIdleWorkstream,
			"authoredInput": "keep going on the parser",
		}),
	}}

	routed := routeIntent(t, source, caller)

	if routed.Resolution != DecisionResolvedByModel {
		t.Fatalf("resolution = %q", routed.Resolution)
	}
	if len(caller.calls) != 2 {
		t.Fatalf("router made %d calls, want 2", len(caller.calls))
	}
	if _, offered := caller.calls[1].Context.Target(fixtureFailedWorkstream); offered {
		t.Fatalf("the retry was asked against the context the state moved away from")
	}
	if caller.calls[1].Diagnostic != decisionRejectionDiagnostics[DecisionRejectedUnauthorizedFailure] {
		t.Fatalf("rematerialized diagnostic = %q", caller.calls[1].Diagnostic)
	}
	if len(routed.Context.Workstreams) != 2 {
		t.Fatalf("routed context is not the rematerialized one: %d targets", len(routed.Context.Workstreams))
	}
}

// TestDecisionRouterResolvesTheOnlyAuthorizedOutcome proves the product
// invariant: when exactly one way to put the request into work exists, no model
// judgment is needed and the user is never asked to retry routing.
func TestDecisionRouterResolvesTheOnlyAuthorizedOutcome(t *testing.T) {
	source := &scriptedDecisionSource{contexts: []DirectorDecisionContext{singleTargetContextFixture()}}
	malformed := json.RawMessage(`{"decision":{"kind":"send_to_workstream"}}`)
	caller := &scriptedDecisionCaller{outputs: []json.RawMessage{malformed, malformed}}

	routed := routeIntent(t, source, caller)

	if routed.Resolution != DecisionResolvedByProductInvariant {
		t.Fatalf("resolution = %q, want %q", routed.Resolution, DecisionResolvedByProductInvariant)
	}
	if routed.Decision == nil || routed.Decision.Kind != DirectorDecisionSendToWorkstream {
		t.Fatalf("invariant decision = %+v", routed.Decision)
	}
	if routed.Decision.SendToWorkstream.WorkstreamID != fixtureIdleWorkstream {
		t.Fatalf("invariant target = %q", routed.Decision.SendToWorkstream.WorkstreamID)
	}
	if routed.Decision.SendToWorkstream.AuthoredInput != decisionContextFixture().Intent.Text {
		t.Fatalf("invariant input = %q, want the user's own request", routed.Decision.SendToWorkstream.AuthoredInput)
	}
	if len(caller.calls) != 2 {
		t.Fatalf("router made %d calls, want the attempt and one retry", len(caller.calls))
	}
}

// TestDecisionRouterAsksTheUserOnlyWhenTheAnswerChangesTheOutcome proves the
// last rung before blocking is a product question about which workstream should
// take the work, not a request to try again.
func TestDecisionRouterAsksTheUserOnlyWhenTheAnswerChangesTheOutcome(t *testing.T) {
	source := &scriptedDecisionSource{contexts: []DirectorDecisionContext{decisionContextFixture()}}
	malformed := json.RawMessage(`{"decision":{"kind":"nonsense"}}`)
	caller := &scriptedDecisionCaller{outputs: []json.RawMessage{malformed, malformed}}

	routed := routeIntent(t, source, caller)

	if routed.Resolution != DecisionResolvedByClarification {
		t.Fatalf("resolution = %q, want %q", routed.Resolution, DecisionResolvedByClarification)
	}
	if routed.Decision == nil || routed.Decision.Kind != DirectorDecisionAskClarification {
		t.Fatalf("clarification decision = %+v", routed.Decision)
	}
	question := routed.Decision.AskClarification.Question
	for _, title := range []string{"Parser rewrite", "Release notes", "Nightly import"} {
		if !strings.Contains(question, title) {
			t.Fatalf("question %q omits candidate %q", question, title)
		}
	}
	committed, err := NewCommittedDecision(routed.Context, *routed.Decision, nil)
	if err != nil {
		t.Fatalf("NewCommittedDecision: %v", err)
	}
	if committed.Clarification == nil {
		t.Fatalf("a clarification commits without its question")
	}
	if !slices.Equal(committed.Clarification.CandidateWorkstreamIDs, []string{
		fixtureIdleWorkstream,
		fixtureFailedWorkstream,
		fixtureActiveWorkstream,
	}) {
		t.Fatalf("committed candidates = %v", committed.Clarification.CandidateWorkstreamIDs)
	}
	if committed.IntentID != routed.Intent.ID {
		t.Fatalf("committed decision answers intent %q, want %q", committed.IntentID, routed.Intent.ID)
	}
}

// TestDecisionRouterBlocksWithAPublicSummary proves the honest end of the
// ladder: with nothing to route to and no usable output, the app commits a
// blocked state the user can read instead of a routing error.
func TestDecisionRouterBlocksWithAPublicSummary(t *testing.T) {
	empty := decisionContextFixture()
	empty.SelectedID = nil
	empty.Workstreams = []WorkstreamDecisionTarget{}
	empty.RecentDecisions = []DecisionSummary{}
	empty.Clarification = nil
	empty.AllowedDecisionKinds = []DirectorDecisionKind{
		DirectorDecisionAnswerDirectly,
		DirectorDecisionCreateWorkstream,
	}
	source := &scriptedDecisionSource{contexts: []DirectorDecisionContext{empty}}
	malformed := json.RawMessage(`{"decision":{"kind":"answer_directly"}}`)
	caller := &scriptedDecisionCaller{outputs: []json.RawMessage{malformed, malformed}}

	routed := routeIntent(t, source, caller)

	if routed.Resolution != DecisionResolvedAsBlocked {
		t.Fatalf("resolution = %q, want %q", routed.Resolution, DecisionResolvedAsBlocked)
	}
	if routed.Decision != nil {
		t.Fatalf("a blocked resolution carries decision %+v", routed.Decision)
	}
	if routed.PublicSummary != blockedDecisionSummary {
		t.Fatalf("blocked summary = %q", routed.PublicSummary)
	}
}

// TestDecisionRouterReportsProviderFailuresAsErrors proves the router does not
// dress an unreachable provider up as a decision. That is a runtime condition
// the command center owns, not model output the ladder can repair.
func TestDecisionRouterReportsProviderFailuresAsErrors(t *testing.T) {
	source := &scriptedDecisionSource{contexts: []DirectorDecisionContext{decisionContextFixture()}}
	caller := &scriptedDecisionCaller{err: errors.New("provider unavailable")}
	router, err := NewDecisionRouter(source, caller)
	if err != nil {
		t.Fatalf("NewDecisionRouter: %v", err)
	}

	routed, err := router.Route(context.Background(), decisionContextFixture().Intent)
	if err == nil {
		t.Fatalf("an unreachable provider produced %+v", routed)
	}
	if !strings.Contains(err.Error(), "provider unavailable") {
		t.Fatalf("router error = %v", err)
	}
	if routed.Resolution != "" {
		t.Fatalf("failed routing reported resolution %q", routed.Resolution)
	}
}

// TestDecisionRouterRoutesAgainstTheLiveRegistry proves the two halves fit: the
// registry materializes the authority, the schema is generated from it, and a
// decision naming an id the registry offered validates against that same state.
func TestDecisionRouterRoutesAgainstTheLiveRegistry(t *testing.T) {
	harness := newRegistryHarness(t)
	workstreamID := harness.createConversation("conversation-router", "Parser rewrite", nil)
	registry := harness.start()

	caller := &scriptedDecisionCaller{outputs: []json.RawMessage{decisionOutput(t, map[string]any{
		"kind":          string(DirectorDecisionSendToWorkstream),
		"workstreamId":  workstreamID,
		"authoredInput": "keep going on the parser",
	})}}
	router, err := NewDecisionRouter(registry, caller)
	if err != nil {
		t.Fatalf("NewDecisionRouter: %v", err)
	}

	routed, err := router.Route(context.Background(), decisionIntentFixture())
	if err != nil {
		t.Fatalf("Route: %v", err)
	}
	if routed.Resolution != DecisionResolvedByModel {
		t.Fatalf("resolution = %q", routed.Resolution)
	}
	if routed.Decision.SendToWorkstream.WorkstreamID != workstreamID {
		t.Fatalf("decision target = %q, want %q", routed.Decision.SendToWorkstream.WorkstreamID, workstreamID)
	}
	committed, err := NewCommittedDecision(routed.Context, *routed.Decision, nil)
	if err != nil {
		t.Fatalf("NewCommittedDecision: %v", err)
	}
	if committed.PublicSummary != "Sent new work to \"Parser rewrite\"." {
		t.Fatalf("committed summary = %q", committed.PublicSummary)
	}
	if committed.TargetWorkstreamID == nil || *committed.TargetWorkstreamID != workstreamID {
		t.Fatalf("committed target = %v", committed.TargetWorkstreamID)
	}
}
