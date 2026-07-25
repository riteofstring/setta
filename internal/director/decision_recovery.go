package director

import (
	"fmt"
	"strings"
)

// Model output recovery.
//
// Invalid model output is an implementation failure to repair or route around.
// Nothing here reads provider text, and nothing here reaches the user as a
// schema, JSON, routing, or provider-format error: the retry diagnostic is a
// fixed sentence chosen by the typed rejection reason, the invariant decision
// is built from trusted context alone, and the clarification question is built
// from trusted workstream titles.

// DecisionRejectionReason is why a decision was refused before any product
// effect. The recovery policy routes on the reason, so a new reason has to
// declare its own diagnostic rather than fall into a generic one.
type DecisionRejectionReason string

const (
	// DecisionRejectedMalformedOutput could not be decoded as the schema.
	DecisionRejectedMalformedOutput DecisionRejectionReason = "malformed_output"
	// DecisionRejectedUnknownKind named a kind outside the catalog.
	DecisionRejectedUnknownKind DecisionRejectionReason = "unknown_kind"
	// DecisionRejectedUnauthorizedKind named a catalog kind the context did
	// not allow for this intent.
	DecisionRejectedUnauthorizedKind DecisionRejectionReason = "unauthorized_kind"
	// DecisionRejectedInvalidPayload violated the decision's own shape.
	DecisionRejectedInvalidPayload DecisionRejectionReason = "invalid_payload"
	// DecisionRejectedUnknownTarget named a workstream the context did not
	// supply.
	DecisionRejectedUnknownTarget DecisionRejectionReason = "unknown_target"
	// DecisionRejectedUnauthorizedTarget named a supplied workstream that does
	// not allow the action.
	DecisionRejectedUnauthorizedTarget DecisionRejectionReason = "unauthorized_target"
	// DecisionRejectedUnauthorizedForkPoint named a run that is not a fork
	// point of its parent.
	DecisionRejectedUnauthorizedForkPoint DecisionRejectionReason = "unauthorized_fork_point"
	// DecisionRejectedUnauthorizedFailure named a failure that is not
	// recoverable on its workstream.
	DecisionRejectedUnauthorizedFailure DecisionRejectionReason = "unauthorized_failure"
	// DecisionRejectedUnauthorizedResourceScope named a folder resource the
	// app has not offered.
	DecisionRejectedUnauthorizedResourceScope DecisionRejectionReason = "unauthorized_resource_scope"
	// DecisionRejectedStaleContext means the authoritative context itself no
	// longer validates, so retrying against it cannot succeed.
	DecisionRejectedStaleContext DecisionRejectionReason = "stale_context"
)

var decisionRejectionReasons = []DecisionRejectionReason{
	DecisionRejectedMalformedOutput,
	DecisionRejectedUnknownKind,
	DecisionRejectedUnauthorizedKind,
	DecisionRejectedInvalidPayload,
	DecisionRejectedUnknownTarget,
	DecisionRejectedUnauthorizedTarget,
	DecisionRejectedUnauthorizedForkPoint,
	DecisionRejectedUnauthorizedFailure,
	DecisionRejectedUnauthorizedResourceScope,
	DecisionRejectedStaleContext,
}

// DecisionRejectionReasons returns the ordered rejection catalog.
func DecisionRejectionReasons() []DecisionRejectionReason {
	return append([]DecisionRejectionReason(nil), decisionRejectionReasons...)
}

// decisionRejectionDiagnostics is the public-safe sentence handed back to the
// model on a retry. It is keyed by reason and never contains provider output,
// user text, or an internal error string.
var decisionRejectionDiagnostics = map[DecisionRejectionReason]string{
	DecisionRejectedMalformedOutput: "The previous response did not match the output schema. " +
		"Return exactly one decision object from the schema.",
	DecisionRejectedUnknownKind: "The previous response named a decision kind that does not exist. " +
		"Use one of the kinds in the output schema.",
	DecisionRejectedUnauthorizedKind: "The previous response used a decision kind that is not allowed for this request. " +
		"Use only allowedDecisionKinds.",
	DecisionRejectedInvalidPayload: "The previous response filled the wrong fields for its decision kind. " +
		"Fill exactly the fields the chosen schema branch declares.",
	DecisionRejectedUnknownTarget: "The previous response named a workstream that was not supplied. " +
		"Use only workstreamId values from workstreams.",
	DecisionRejectedUnauthorizedTarget: "The previous response asked a workstream to do something it does not allow. " +
		"Check that workstream's allowedDecisionKinds.",
	DecisionRejectedUnauthorizedForkPoint: "The previous response forked from a run that is not a fork point. " +
		"Use only forkPoints of the chosen parent.",
	DecisionRejectedUnauthorizedFailure: "The previous response recovered a failure that is not recoverable. " +
		"Use only recoverableFailures of the chosen workstream.",
	DecisionRejectedUnauthorizedResourceScope: "The previous response scoped a new workstream to a folder that was not offered. " +
		"Use folderless scope or one supplied workspaceId.",
	DecisionRejectedStaleContext: "The supplied context is no longer current. Decide against the refreshed context.",
}

// DecisionRejection is a typed refusal of model output. The detail is for logs
// and tests; PublicSafeDiagnostic is the only string that leaves the process.
type DecisionRejection struct {
	Reason DecisionRejectionReason
	detail string
}

func newDecisionRejection(reason DecisionRejectionReason, detail string) *DecisionRejection {
	return &DecisionRejection{Reason: reason, detail: detail}
}

func (rejection *DecisionRejection) Error() string {
	return fmt.Sprintf("director decision rejected (%s): %s", rejection.Reason, rejection.detail)
}

// PublicSafeDiagnostic returns the sentence a retry may include.
func (rejection *DecisionRejection) PublicSafeDiagnostic() (string, error) {
	diagnostic, known := decisionRejectionDiagnostics[rejection.Reason]
	if !known {
		return "", fmt.Errorf("director decision rejection %q has no diagnostic", rejection.Reason)
	}
	return diagnostic, nil
}

// DecisionRecoveryStep is what trusted product code should do next.
type DecisionRecoveryStep string

const (
	// DecisionRecoveryRetrySameContext re-asks with the same authoritative
	// context plus the public-safe diagnostic.
	DecisionRecoveryRetrySameContext DecisionRecoveryStep = "retry_same_context"
	// DecisionRecoveryRematerialize rebuilds trusted context and re-asks
	// against the decisions that are allowed now.
	DecisionRecoveryRematerialize DecisionRecoveryStep = "rematerialize_and_retry"
	// DecisionRecoveryProductInvariant commits a decision that needs no model
	// judgment because only one authorized outcome exists.
	DecisionRecoveryProductInvariant DecisionRecoveryStep = "product_invariant"
	// DecisionRecoveryClarify asks the user the one question whose answer
	// changes the outcome.
	DecisionRecoveryClarify DecisionRecoveryStep = "clarify"
	// DecisionRecoveryBlocked commits a durable blocked state with a public
	// summary.
	DecisionRecoveryBlocked DecisionRecoveryStep = "blocked"
)

var decisionRecoverySteps = []DecisionRecoveryStep{
	DecisionRecoveryRetrySameContext,
	DecisionRecoveryRematerialize,
	DecisionRecoveryProductInvariant,
	DecisionRecoveryClarify,
	DecisionRecoveryBlocked,
}

// DecisionRecoverySteps returns the ordered recovery ladder.
func DecisionRecoverySteps() []DecisionRecoveryStep {
	return append([]DecisionRecoveryStep(nil), decisionRecoverySteps...)
}

// DecisionRecoveryRequest is what the caller has already tried.
type DecisionRecoveryRequest struct {
	// Context is the authoritative context as it stands now.
	Context DirectorDecisionContext
	// Rejection is the typed refusal that ended the last attempt.
	Rejection *DecisionRejection
	// Retried records that a same-context retry already happened.
	Retried bool
	// Rematerialized records that a rebuilt-context retry already happened.
	Rematerialized bool
	// ContextChanged records that trusted state moved during the last call, so
	// the model answered a question the app no longer asks.
	ContextChanged bool
}

// DecisionRecovery is the next step and everything it needs.
type DecisionRecovery struct {
	Step DecisionRecoveryStep
	// Diagnostic is set for the retry steps.
	Diagnostic string
	// Decision is set for the product-invariant and clarify steps. It has
	// already passed authority validation.
	Decision *DirectorDecision
	// CandidateWorkstreamIDs is set for the clarify step, so the next turn can
	// carry the question's candidates as trusted clarification context.
	CandidateWorkstreamIDs []string
	// PublicSummary is set for the blocked step.
	PublicSummary string
}

// NextDecisionRecovery applies the model-output recovery policy.
func NextDecisionRecovery(request DecisionRecoveryRequest) (DecisionRecovery, error) {
	if request.Rejection == nil {
		return DecisionRecovery{}, fmt.Errorf("director decision recovery requires a rejection")
	}
	diagnostic, err := request.Rejection.PublicSafeDiagnostic()
	if err != nil {
		return DecisionRecovery{}, err
	}
	contextValid := request.Context.Validate() == nil
	if step, retry := nextDecisionRetry(request, contextValid); retry {
		return DecisionRecovery{Step: step, Diagnostic: diagnostic}, nil
	}
	if !contextValid {
		// The context is still not usable after a rebuild, so there is no
		// authorized outcome left to derive. A durable blocked state is the
		// honest end of the policy.
		return DecisionRecovery{Step: DecisionRecoveryBlocked, PublicSummary: blockedDecisionSummary}, nil
	}
	return resolveDecisionWithoutModel(request.Context)
}

// nextDecisionRetry decides whether the model gets another attempt. A context
// that no longer validates is never retried as-is, because the context is what
// failed.
func nextDecisionRetry(request DecisionRecoveryRequest, contextValid bool) (DecisionRecoveryStep, bool) {
	stale := request.ContextChanged ||
		request.Rejection.Reason == DecisionRejectedStaleContext ||
		!contextValid
	if stale {
		if request.Rematerialized {
			return "", false
		}
		return DecisionRecoveryRematerialize, true
	}
	if request.Retried {
		return "", false
	}
	return DecisionRecoveryRetrySameContext, true
}

func resolveDecisionWithoutModel(context DirectorDecisionContext) (DecisionRecovery, error) {
	candidates := workCandidates(context)
	if len(candidates) == 1 {
		decision := workCandidateDecision(candidates[0], context.Intent.Text)
		if err := ValidateDecisionAuthority(context, decision); err != nil {
			return DecisionRecovery{}, fmt.Errorf("product-invariant decision is unauthorized: %w", err)
		}
		return DecisionRecovery{Step: DecisionRecoveryProductInvariant, Decision: &decision}, nil
	}
	return clarifyOrBlock(context, candidates)
}

const blockedDecisionSummary = "Setta could not route this request and is waiting for you to direct it."

func clarifyOrBlock(context DirectorDecisionContext, candidates []workCandidate) (DecisionRecovery, error) {
	if len(candidates) == 0 || !context.allowsKind(DirectorDecisionAskClarification) {
		return DecisionRecovery{Step: DecisionRecoveryBlocked, PublicSummary: blockedDecisionSummary}, nil
	}
	ids, titles := candidateWorkstreams(candidates)
	decision := DirectorDecision{
		Kind:             DirectorDecisionAskClarification,
		AskClarification: &AskClarificationDecision{Question: clarificationQuestion(titles)},
	}
	if err := ValidateDecisionAuthority(context, decision); err != nil {
		return DecisionRecovery{}, fmt.Errorf("derived clarification is unauthorized: %w", err)
	}
	return DecisionRecovery{
		Step:                   DecisionRecoveryClarify,
		Decision:               &decision,
		CandidateWorkstreamIDs: ids,
	}, nil
}

func clarificationQuestion(titles []string) string {
	quoted := make([]string, 0, len(titles))
	for _, title := range titles {
		quoted = append(quoted, fmt.Sprintf("%q", title))
	}
	return "Which workstream should handle this: " + strings.Join(quoted, ", ") + "?"
}

// workCandidate is one authorized way to put this intent into work. Selecting
// or recovering a workstream is not a candidate: neither one does the work the
// submitted intent asked for.
type workCandidate struct {
	kind   DirectorDecisionKind
	target WorkstreamDecisionTarget
}

var workDecisionKinds = []DirectorDecisionKind{
	DirectorDecisionSendToWorkstream,
	DirectorDecisionQueueBehindRun,
	DirectorDecisionSteerRun,
}

func workCandidates(context DirectorDecisionContext) []workCandidate {
	candidates := make([]workCandidate, 0, len(context.Workstreams))
	for _, kind := range workDecisionKinds {
		if !context.allowsKind(kind) {
			continue
		}
		for _, target := range context.targetsAllowing(kind) {
			candidates = append(candidates, workCandidate{kind: kind, target: target})
		}
	}
	return candidates
}

func candidateWorkstreams(candidates []workCandidate) ([]string, []string) {
	ids := make([]string, 0, len(candidates))
	titles := make([]string, 0, len(candidates))
	seen := map[string]bool{}
	for _, candidate := range candidates {
		if seen[candidate.target.WorkstreamID] {
			continue
		}
		seen[candidate.target.WorkstreamID] = true
		ids = append(ids, candidate.target.WorkstreamID)
		titles = append(titles, candidate.target.Title)
	}
	return ids, titles
}

// workCandidateDecision builds the decision for one candidate. An unhandled
// kind produces an empty decision, which authority validation then rejects, so
// a new work kind cannot silently become a send.
func workCandidateDecision(candidate workCandidate, authoredInput string) DirectorDecision {
	switch candidate.kind {
	case DirectorDecisionSendToWorkstream:
		return DirectorDecision{Kind: candidate.kind, SendToWorkstream: &SendToWorkstreamDecision{
			WorkstreamID: candidate.target.WorkstreamID, AuthoredInput: authoredInput,
		}}
	case DirectorDecisionQueueBehindRun:
		return DirectorDecision{Kind: candidate.kind, QueueBehindRun: &QueueBehindRunDecision{
			WorkstreamID: candidate.target.WorkstreamID, AuthoredInput: authoredInput,
		}}
	case DirectorDecisionSteerRun:
		return DirectorDecision{Kind: candidate.kind, SteerRun: &SteerRunDecision{
			WorkstreamID: candidate.target.WorkstreamID, AuthoredInput: authoredInput,
		}}
	default:
		return DirectorDecision{}
	}
}

// ProductInvariantDecision returns the decision a deterministic product rule
// resolves without model judgment: exactly one authorized way to put this
// intent into work exists, so choosing it needs no judgment.
func ProductInvariantDecision(context DirectorDecisionContext) (DirectorDecision, bool) {
	candidates := workCandidates(context)
	if len(candidates) != 1 {
		return DirectorDecision{}, false
	}
	return workCandidateDecision(candidates[0], context.Intent.Text), true
}
