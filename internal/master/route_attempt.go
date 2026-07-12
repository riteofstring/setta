package master

import (
	"errors"
	"fmt"
	"reflect"
	"time"
)

type RouteInvocationCallKind string
type RouteInvocationAttemptOutcome string
type RouteInvocationValidationResult string
type RouteInvocationCommitDecision string

const (
	RouteInvocationCallRoute RouteInvocationCallKind = "route"

	RouteInvocationOutcomeCompleted RouteInvocationAttemptOutcome = "completed"
	RouteInvocationOutcomeFailed    RouteInvocationAttemptOutcome = "failed"
	RouteInvocationOutcomeCancelled RouteInvocationAttemptOutcome = "cancelled"

	RouteInvocationValidationNotRun RouteInvocationValidationResult = "not_run"
	RouteInvocationValidationPassed RouteInvocationValidationResult = "passed"
	RouteInvocationValidationFailed RouteInvocationValidationResult = "failed"

	RouteInvocationCommitOutput  RouteInvocationCommitDecision = "output_committed"
	RouteInvocationCommitFailure RouteInvocationCommitDecision = "failure_committed"
	RouteInvocationCommitCancel  RouteInvocationCommitDecision = "cancelled"
)

// RouteInvocationAttempt is the bounded terminal audit for one global-master
// route generation. Context and model configuration remain optional because a
// failure or cancellation can happen before either boundary is reached.
type RouteInvocationAttempt struct {
	ID                    string                          `json:"id"`
	CallKind              RouteInvocationCallKind         `json:"callKind"`
	MasterSessionID       *string                         `json:"masterSessionId"`
	InputID               string                          `json:"inputId"`
	RoutingAttempt        int                             `json:"routingAttempt"`
	Context               *RouteContextAudit              `json:"context"`
	Configuration         *RouteModelConfigurationAudit   `json:"configuration"`
	ProviderRequestID     *string                         `json:"providerRequestId"`
	ProviderThreadID      *string                         `json:"providerThreadId"`
	ProviderTurnID        *string                         `json:"providerTurnId"`
	InputBytes            int                             `json:"inputBytes"`
	EstimatedInputTokens  int                             `json:"estimatedInputTokens"`
	OutputBytes           int                             `json:"outputBytes"`
	EstimatedOutputTokens int                             `json:"estimatedOutputTokens"`
	StartedAt             string                          `json:"startedAt"`
	EndedAt               string                          `json:"endedAt"`
	DecisionKind          *RouteDecisionKind              `json:"decisionKind"`
	ValidationResult      RouteInvocationValidationResult `json:"validationResult"`
	CommitDecision        RouteInvocationCommitDecision   `json:"commitDecision"`
	Outcome               RouteInvocationAttemptOutcome   `json:"outcome"`
	Failure               *RouteFailure                   `json:"failure"`
}

func (attempt RouteInvocationAttempt) Validate() error {
	if err := validateRouteInvocationIdentity(attempt); err != nil {
		return err
	}
	if err := validateRouteInvocationAttemptReferences(attempt); err != nil {
		return err
	}
	if err := validateRouteInvocationInputs(attempt); err != nil {
		return err
	}
	if err := validateRouteInvocationTimeline(attempt); err != nil {
		return err
	}
	if err := validateRouteInvocationResult(attempt); err != nil {
		return err
	}
	return validateRouteInvocationTerminalState(attempt)
}

func validateRouteInvocationIdentity(attempt RouteInvocationAttempt) error {
	if err := validateRouteReference("master route invocation attempt id", attempt.ID); err != nil {
		return err
	}
	if attempt.CallKind != RouteInvocationCallRoute {
		return fmt.Errorf("unsupported master route invocation call kind %q", attempt.CallKind)
	}
	if err := ValidateInputID(attempt.InputID); err != nil {
		return err
	}
	if attempt.RoutingAttempt <= 0 {
		return errors.New("master route invocation attempt must be positive")
	}
	return nil
}

func validateRouteInvocationAttemptReferences(attempt RouteInvocationAttempt) error {
	for label, value := range map[string]*string{
		"session id":          attempt.MasterSessionID,
		"provider request id": attempt.ProviderRequestID,
		"provider thread id":  attempt.ProviderThreadID,
		"provider turn id":    attempt.ProviderTurnID,
	} {
		if value != nil {
			if err := validateRouteReference("master route invocation "+label, *value); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateRouteInvocationInputs(attempt RouteInvocationAttempt) error {
	if attempt.Context != nil {
		if err := attempt.Context.Validate(); err != nil {
			return fmt.Errorf("master route invocation context: %w", err)
		}
	}
	if attempt.Configuration != nil {
		if err := attempt.Configuration.Validate(); err != nil {
			return fmt.Errorf("master route invocation configuration: %w", err)
		}
	}
	if attempt.InputBytes < 0 || attempt.OutputBytes < 0 ||
		attempt.EstimatedInputTokens < 0 || attempt.EstimatedOutputTokens < 0 {
		return errors.New("master route invocation byte and token counts must be non-negative")
	}
	if attempt.Configuration != nil && attempt.InputBytes > attempt.Configuration.MaxInputBytes {
		return errors.New("master route invocation input exceeds its configured byte budget")
	}
	return nil
}

func validateRouteInvocationTimeline(attempt RouteInvocationAttempt) error {
	startedAt, err := normalizeTimestamp("master route invocation startedAt", attempt.StartedAt)
	if err != nil || startedAt != attempt.StartedAt {
		return errors.New("master route invocation startedAt must be normalized")
	}
	endedAt, err := normalizeTimestamp("master route invocation endedAt", attempt.EndedAt)
	if err != nil || endedAt != attempt.EndedAt {
		return errors.New("master route invocation endedAt must be normalized")
	}
	started, _ := time.Parse(time.RFC3339Nano, startedAt)
	ended, _ := time.Parse(time.RFC3339Nano, endedAt)
	if ended.Before(started) {
		return errors.New("master route invocation end precedes its start")
	}
	return nil
}

func validateRouteInvocationResult(attempt RouteInvocationAttempt) error {
	switch attempt.ValidationResult {
	case RouteInvocationValidationNotRun,
		RouteInvocationValidationPassed,
		RouteInvocationValidationFailed:
	default:
		return fmt.Errorf(
			"unsupported master route invocation validation result %q",
			attempt.ValidationResult,
		)
	}
	if attempt.DecisionKind != nil && !validRouteDecisionKind(*attempt.DecisionKind) {
		return fmt.Errorf("unsupported master route invocation decision kind %q", *attempt.DecisionKind)
	}
	if attempt.Failure != nil {
		if err := attempt.Failure.Validate(); err != nil {
			return err
		}
	}
	return nil
}

func validateRouteInvocationTerminalState(attempt RouteInvocationAttempt) error {
	switch attempt.Outcome {
	case RouteInvocationOutcomeCompleted:
		if !routeInvocationChecksPass(
			attempt.Context != nil,
			attempt.Configuration != nil,
			attempt.MasterSessionID != nil,
			attempt.ProviderRequestID != nil,
			attempt.ProviderThreadID != nil,
			attempt.ProviderTurnID != nil,
			attempt.InputBytes > 0,
			attempt.EstimatedInputTokens > 0,
			attempt.OutputBytes > 0,
			attempt.EstimatedOutputTokens > 0,
			attempt.DecisionKind != nil,
			attempt.Failure == nil,
			attempt.ValidationResult == RouteInvocationValidationPassed,
			attempt.CommitDecision == RouteInvocationCommitOutput,
		) {
			return errors.New("completed master route invocation attempt is incomplete")
		}
	case RouteInvocationOutcomeFailed:
		if !routeInvocationChecksPass(
			attempt.Failure != nil,
			attempt.CommitDecision == RouteInvocationCommitFailure,
		) {
			return errors.New("failed master route invocation attempt requires a committed failure")
		}
	case RouteInvocationOutcomeCancelled:
		if !routeInvocationChecksPass(
			attempt.Failure == nil,
			attempt.CommitDecision == RouteInvocationCommitCancel,
		) {
			return errors.New("cancelled master route invocation attempt has invalid terminal state")
		}
	default:
		return fmt.Errorf("unsupported master route invocation outcome %q", attempt.Outcome)
	}
	return nil
}

func validateCompletedRouteInvocationAttempt(commit RouteDecisionCommit) error {
	attempt := commit.InvocationAttempt
	if err := attempt.Validate(); err != nil {
		return err
	}
	invocation := commit.ResolvedInvocation
	if !routeInvocationChecksPass(
		attempt.InputID == commit.InputID,
		attempt.RoutingAttempt == commit.RoutingAttempt,
		attempt.Outcome == RouteInvocationOutcomeCompleted,
		routeInvocationStringEquals(attempt.MasterSessionID, commit.MasterSessionID),
		routeInvocationContextEquals(attempt.Context, commit.Context),
		routeInvocationConfigurationEquals(attempt.Configuration, invocation.Configuration),
		routeInvocationStringEquals(attempt.ProviderRequestID, invocation.ProviderRequestID),
		routeInvocationStringEquals(attempt.ProviderThreadID, invocation.ProviderThreadID),
		routeInvocationStringEquals(attempt.ProviderTurnID, invocation.ProviderTurnID),
		attempt.InputBytes == invocation.InputBytes,
		attempt.EstimatedInputTokens == invocation.EstimatedInputTokens,
		attempt.OutputBytes == invocation.OutputBytes,
		attempt.EstimatedOutputTokens == invocation.EstimatedOutputTokens,
		attempt.StartedAt == invocation.StartedAt,
		attempt.EndedAt == invocation.EndedAt,
		routeInvocationDecisionEquals(attempt.DecisionKind, commit.Decision.Kind),
	) {
		return errors.New("master route invocation attempt does not match committed decision")
	}
	return nil
}

func validateFailedRouteInvocationAttempt(failure InputRoutingFailure) error {
	attempt := failure.InvocationAttempt
	if err := attempt.Validate(); err != nil {
		return err
	}
	if !routeInvocationChecksPass(
		attempt.InputID == failure.InputID,
		attempt.RoutingAttempt == failure.RoutingAttempt,
		attempt.Outcome == RouteInvocationOutcomeFailed,
		routeInvocationFailureEquals(attempt.Failure, failure.Failure),
		attempt.EndedAt == failure.FailedAt,
	) {
		return errors.New("master route invocation attempt does not match routing failure")
	}
	return nil
}

func validateCancelledRouteInvocationAttempt(cancellation InputRoutingCancellation) error {
	attempt := *cancellation.InvocationAttempt
	if err := attempt.Validate(); err != nil {
		return err
	}
	if !routeInvocationChecksPass(
		attempt.InputID == cancellation.InputID,
		attempt.RoutingAttempt == cancellation.RoutingAttempt,
		attempt.Outcome == RouteInvocationOutcomeCancelled,
		attempt.EndedAt == cancellation.CancelledAt,
	) {
		return errors.New("master route invocation attempt does not match routing cancellation")
	}
	return nil
}

func routeInvocationChecksPass(checks ...bool) bool {
	for _, check := range checks {
		if !check {
			return false
		}
	}
	return true
}

func routeInvocationStringEquals(actual *string, want string) bool {
	return actual != nil && *actual == want
}

func routeInvocationContextEquals(actual *RouteContextAudit, want RouteContextAudit) bool {
	return actual != nil && reflect.DeepEqual(*actual, want)
}

func routeInvocationConfigurationEquals(
	actual *RouteModelConfigurationAudit,
	want RouteModelConfigurationAudit,
) bool {
	return actual != nil && reflect.DeepEqual(*actual, want)
}

func routeInvocationDecisionEquals(actual *RouteDecisionKind, want RouteDecisionKind) bool {
	return actual != nil && *actual == want
}

func routeInvocationFailureEquals(actual *RouteFailure, want RouteFailure) bool {
	return actual != nil && reflect.DeepEqual(*actual, want)
}
