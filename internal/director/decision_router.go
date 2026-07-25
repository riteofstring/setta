package director

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"slices"
)

// Routing one submitted intent into one decision the app can carry out.
//
// This is where the pieces of the decision protocol meet: trusted context is
// materialized from the registry, the strict schema is generated from that
// context, the returned output is decoded and authorized against the same
// context, and invalid output runs the recovery ladder instead of reaching the
// user. The router owns no durable state and no provider identity — it asks the
// registry what is true and a caller to produce structured output.
//
// It deliberately does not commit the decision. A committed decision is a
// durable public claim that the app decided something, so the command center
// commits it before it asks the execution port to carry out the work. The
// execution spans additional durable writes and a provider launch and therefore
// cannot share the decision's transaction.

// DecisionSource is the trusted state a decision is bounded by. The app-scoped
// registry implements it; the router never reads the durable log itself.
type DecisionSource interface {
	DecisionContext(intent SubmittedIntent) (DirectorDecisionContext, error)
}

// DecisionCall is one structured Director turn. The context is the model's
// entire authority, and the schema is generated from it.
type DecisionCall struct {
	Context DirectorDecisionContext
	Schema  json.RawMessage
	// Diagnostic is empty on a first attempt. On a retry it is the public-safe
	// sentence for the typed rejection that ended the previous attempt, which
	// is the only thing about that attempt the next one is told.
	Diagnostic string
}

// DecisionCaller runs one structured decision turn. It is the consumer-owned
// half of the execution boundary: provider identity, credentials, leases, and
// accounting stay behind it, and it returns raw structured output rather than a
// decision, because deciding what output means is the protocol's job.
type DecisionCaller interface {
	CallDecision(ctx context.Context, call DecisionCall) (json.RawMessage, error)
}

// DecisionResolution is who resolved the intent. It is durable provenance: a
// decision the model chose and one a product invariant chose are both valid,
// and the difference is what the app can say about why.
type DecisionResolution string

const (
	// DecisionResolvedByModel is a decision the Director model returned and
	// trusted context authorized.
	DecisionResolvedByModel DecisionResolution = "model"
	// DecisionResolvedByProductInvariant is a decision a deterministic product
	// rule made because only one authorized outcome existed.
	DecisionResolvedByProductInvariant DecisionResolution = "product_invariant"
	// DecisionResolvedByClarification is a question derived from trusted
	// context because the outcome depends on an answer only the user has.
	DecisionResolvedByClarification DecisionResolution = "clarification"
	// DecisionResolvedAsBlocked has no decision. The request could not be
	// routed, and the public summary is what the user is told.
	DecisionResolvedAsBlocked DecisionResolution = "blocked"
)

var decisionResolutions = []DecisionResolution{
	DecisionResolvedByModel,
	DecisionResolvedByProductInvariant,
	DecisionResolvedByClarification,
	DecisionResolvedAsBlocked,
}

func isDecisionResolution(resolution DecisionResolution) bool {
	return slices.Contains(decisionResolutions, resolution)
}

// RoutedIntent is one submitted intent resolved into the decision trusted code
// should carry out.
type RoutedIntent struct {
	Intent SubmittedIntent
	// Context is the trusted context the decision was authorized against. The
	// executor commits the durable fact from it, so the summary a decision
	// commits is derived from the same state that allowed it.
	Context    DirectorDecisionContext
	Resolution DecisionResolution
	// Decision is set for every resolution except blocked.
	Decision *DirectorDecision
	// PublicSummary is the public sentence for a blocked resolution. Blocked
	// routing produces no decision fact, so the receipt is its only owner.
	PublicSummary string
}

// DecisionRouter turns submitted intents into validated decisions.
type DecisionRouter struct {
	source DecisionSource
	caller DecisionCaller
}

// NewDecisionRouter builds a router over trusted state and a structured caller.
func NewDecisionRouter(source DecisionSource, caller DecisionCaller) (*DecisionRouter, error) {
	if source == nil || caller == nil {
		return nil, errors.New("director decision router requires a decision source and a caller")
	}
	return &DecisionRouter{source: source, caller: caller}, nil
}

// Route resolves one submitted intent. A provider that cannot be reached is
// returned as an error, because that is a runtime condition the command center
// retries or records durably; invalid provider output is not an error here at
// all, because the recovery ladder resolves it.
func (router *DecisionRouter) Route(ctx context.Context, intent SubmittedIntent) (RoutedIntent, error) {
	if err := validateRouteRequest(router, ctx, intent); err != nil {
		return RoutedIntent{}, err
	}
	decisionContext, err := router.source.DecisionContext(intent)
	if err != nil {
		return RoutedIntent{}, err
	}
	ladder := DecisionRecoveryRequest{Context: decisionContext}
	diagnostic := ""
	for {
		routed, recovery, retry, err := router.routeAttempt(
			ctx,
			intent,
			decisionContext,
			diagnostic,
			&ladder,
		)
		if err != nil || !retry {
			return routed, err
		}
		decisionContext = ladder.Context
		diagnostic = recovery.Diagnostic
	}
}

func (router *DecisionRouter) routeAttempt(
	ctx context.Context,
	intent SubmittedIntent,
	decisionContext DirectorDecisionContext,
	diagnostic string,
	ladder *DecisionRecoveryRequest,
) (RoutedIntent, DecisionRecovery, bool, error) {
	decision, rejection, err := router.attempt(ctx, decisionContext, diagnostic)
	if err != nil {
		return RoutedIntent{}, DecisionRecovery{}, false, err
	}
	current, err := router.source.DecisionContext(intent)
	if err != nil {
		return RoutedIntent{}, DecisionRecovery{}, false, err
	}
	contextChanged := !reflect.DeepEqual(decisionContext, current)
	if rejection == nil && !contextChanged {
		return RoutedIntent{
			Intent:     intent,
			Context:    decisionContext,
			Resolution: DecisionResolvedByModel,
			Decision:   &decision,
		}, DecisionRecovery{}, false, nil
	}
	if rejection == nil {
		rejection = newDecisionRejection(
			DecisionRejectedStaleContext,
			"trusted decision context changed during the provider call",
		)
	}
	recovery, err := router.nextRecovery(
		decisionContext,
		current,
		contextChanged,
		rejection,
		ladder,
	)
	if err != nil {
		return RoutedIntent{}, DecisionRecovery{}, false, err
	}
	routed, retry, err := applyDecisionRecovery(intent, ladder.Context, recovery, ladder)
	return routed, recovery, retry, err
}

func validateRouteRequest(router *DecisionRouter, ctx context.Context, intent SubmittedIntent) error {
	if router == nil || router.source == nil || router.caller == nil {
		return errors.New("director decision router is unavailable")
	}
	if ctx == nil {
		return errors.New("director decision router context is required")
	}
	return validateSubmittedIntent(intent)
}

// nextRecovery applies the recovery policy against trusted state as it stands
// now rather than the state the attempt saw. A model that answered a question
// the app no longer asks is re-asked even when its old answer was valid.
func (router *DecisionRouter) nextRecovery(
	called DirectorDecisionContext,
	current DirectorDecisionContext,
	contextChanged bool,
	rejection *DecisionRejection,
	attempt *DecisionRecoveryRequest,
) (DecisionRecovery, error) {
	attempt.Context = current
	attempt.Rejection = rejection
	attempt.ContextChanged = contextChanged || !reflect.DeepEqual(called, current)
	return NextDecisionRecovery(*attempt)
}

// applyDecisionRecovery advances one rung of the ladder. A retry step reports
// that the loop continues; every other step is a resolution. The already-taken
// guards are the loop's termination proof: the policy narrows on each rung, so
// a repeated retry step would mean the policy stopped narrowing.
func applyDecisionRecovery(
	intent SubmittedIntent,
	decisionContext DirectorDecisionContext,
	recovery DecisionRecovery,
	attempt *DecisionRecoveryRequest,
) (RoutedIntent, bool, error) {
	switch recovery.Step {
	case DecisionRecoveryRetrySameContext:
		if attempt.Retried {
			return RoutedIntent{}, false, fmt.Errorf("director decision recovery repeated %q", recovery.Step)
		}
		attempt.Retried = true
		return RoutedIntent{}, true, nil
	case DecisionRecoveryRematerialize:
		if attempt.Rematerialized {
			return RoutedIntent{}, false, fmt.Errorf("director decision recovery repeated %q", recovery.Step)
		}
		attempt.Rematerialized = true
		return RoutedIntent{}, true, nil
	case DecisionRecoveryProductInvariant:
		routed, err := resolvedRoutedIntent(intent, decisionContext, DecisionResolvedByProductInvariant, recovery)
		return routed, false, err
	case DecisionRecoveryClarify:
		routed, err := resolvedRoutedIntent(intent, decisionContext, DecisionResolvedByClarification, recovery)
		return routed, false, err
	case DecisionRecoveryBlocked:
		if err := validateTrimmedText("blocked decision public summary", recovery.PublicSummary); err != nil {
			return RoutedIntent{}, false, err
		}
		return RoutedIntent{
			Intent:        intent,
			Context:       decisionContext,
			Resolution:    DecisionResolvedAsBlocked,
			PublicSummary: recovery.PublicSummary,
		}, false, nil
	default:
		return RoutedIntent{}, false, fmt.Errorf("unknown director decision recovery step %q", recovery.Step)
	}
}

func resolvedRoutedIntent(
	intent SubmittedIntent,
	decisionContext DirectorDecisionContext,
	resolution DecisionResolution,
	recovery DecisionRecovery,
) (RoutedIntent, error) {
	if recovery.Decision == nil {
		return RoutedIntent{}, fmt.Errorf("director decision recovery step %q produced no decision", recovery.Step)
	}
	decision := *recovery.Decision
	return RoutedIntent{
		Intent:     intent,
		Context:    decisionContext,
		Resolution: resolution,
		Decision:   &decision,
	}, nil
}

// attempt runs one structured call. A typed rejection is returned as a value
// because it is an expected outcome the ladder handles; anything else is an
// error, so a schema the app could not generate or a provider it could not
// reach never looks like invalid model output.
func (router *DecisionRouter) attempt(
	ctx context.Context,
	decisionContext DirectorDecisionContext,
	diagnostic string,
) (DirectorDecision, *DecisionRejection, error) {
	schema, err := DecisionOutputSchema(decisionContext)
	if err != nil {
		return DirectorDecision{}, nil, err
	}
	raw, err := router.caller.CallDecision(ctx, DecisionCall{
		Context:    decisionContext,
		Schema:     schema,
		Diagnostic: diagnostic,
	})
	if err != nil {
		return DirectorDecision{}, nil, fmt.Errorf("call director decision: %w", err)
	}
	decision, err := DecodeDecisionOutput(raw, decisionContext)
	if err == nil {
		return decision, nil, nil
	}
	var rejection *DecisionRejection
	if errors.As(err, &rejection) {
		return DirectorDecision{}, rejection, nil
	}
	return DirectorDecision{}, nil, err
}
