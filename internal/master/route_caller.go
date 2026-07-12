package master

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"setta/internal/tokenestimate"
)

type RouteFailureKind string

const (
	RouteFailureKindProviderUnavailable   RouteFailureKind = "provider_unavailable"
	RouteFailureKindProviderOutputInvalid RouteFailureKind = "provider_output_invalid"
	RouteFailureKindConfigurationInvalid  RouteFailureKind = "configuration_invalid"
	RouteFailureKindContextBudgetExceeded RouteFailureKind = "context_budget_exceeded"
	RouteFailureKindStateUnavailable      RouteFailureKind = "state_unavailable"
	RouteFailureKindStateCorrupt          RouteFailureKind = "state_corrupt"
	RouteFailureKindInternal              RouteFailureKind = "internal"
)

type RouteAttemptFailure struct {
	Kind RouteFailureKind
	Err  error
}

func (failure *RouteAttemptFailure) Error() string {
	return fmt.Sprintf("master route %s: %v", failure.Kind, failure.Err)
}

func (failure *RouteAttemptFailure) Unwrap() error {
	return failure.Err
}

func NewRouteAttemptFailure(kind RouteFailureKind, err error) error {
	if err == nil {
		return nil
	}
	return &RouteAttemptFailure{Kind: kind, Err: err}
}

func ClassifyRouteAttemptFailure(err error) (RouteFailureKind, bool) {
	var failure *RouteAttemptFailure
	if !errors.As(err, &failure) {
		return "", false
	}
	return failure.Kind, true
}

type StructuredSessionCaller interface {
	RunStructuredTurn(context.Context, StructuredSessionTurnRequest) (StructuredSessionTurnResult, error)
}

type RouteCallResult struct {
	RequestID        string
	Session          Session
	ProviderThreadID string
	ProviderTurnID   string
	InputBytes       int
	InputTokens      int
	OutputBytes      int
	OutputTokens     int
	StructuredOutput json.RawMessage
	Decision         RouteDecision
	StartedAt        string
	EndedAt          string
}

type RouteCaller struct {
	sessions StructuredSessionCaller
	now      func() time.Time
}

func NewRouteCaller(sessions StructuredSessionCaller) (*RouteCaller, error) {
	if sessions == nil {
		return nil, errors.New("master route caller requires a structured session")
	}
	return &RouteCaller{sessions: sessions, now: time.Now}, nil
}

func (caller *RouteCaller) Call(
	ctx context.Context,
	requestID string,
	materialized RouteContextMaterialization,
) (RouteCallResult, error) {
	return caller.call(ctx, requestID, materialized, nil)
}

func (caller *RouteCaller) CallObserved(
	ctx context.Context,
	requestID string,
	materialized RouteContextMaterialization,
	started func(RouteCallResult),
) (RouteCallResult, error) {
	return caller.call(ctx, requestID, materialized, started)
}

func (caller *RouteCaller) call(
	ctx context.Context,
	requestID string,
	materialized RouteContextMaterialization,
	started func(RouteCallResult),
) (RouteCallResult, error) {
	if err := validateRouteCallRequest(caller, ctx, requestID, materialized); err != nil {
		return RouteCallResult{}, err
	}
	schema, err := routeOutputSchema(materialized.Bundle)
	if err != nil {
		return RouteCallResult{}, NewRouteAttemptFailure(RouteFailureKindInternal, err)
	}
	result := RouteCallResult{
		RequestID:   requestID,
		InputBytes:  len(materialized.Input),
		InputTokens: materialized.EstimatedInputTokens,
		StartedAt:   caller.timestamp(),
	}
	if started != nil {
		started(result)
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	provider, err := caller.sessions.RunStructuredTurn(ctx, StructuredSessionTurnRequest{
		ID:           requestID,
		Input:        materialized.Input,
		OutputSchema: schema,
	})
	result, usageErr := applyStructuredSessionResult(result, provider)
	if usageErr != nil {
		return result, NewRouteAttemptFailure(RouteFailureKindProviderOutputInvalid, usageErr)
	}
	if err != nil {
		return result, routeProviderCallFailure(ctx, err)
	}
	return caller.completeRouteCall(result, materialized)
}

func applyStructuredSessionResult(
	result RouteCallResult,
	provider StructuredSessionTurnResult,
) (RouteCallResult, error) {
	result.Session = CloneSession(provider.Session)
	result.ProviderThreadID = provider.ProviderThreadID
	result.ProviderTurnID = provider.ProviderTurnID
	if provider.Usage.InputTokens > 0 {
		result.InputTokens = provider.Usage.InputTokens
	}
	result.OutputBytes = len(provider.Output)
	result.OutputTokens = provider.Usage.OutputTokens
	result.StructuredOutput = append(json.RawMessage{}, provider.Output...)
	if result.OutputBytes > 0 && result.OutputTokens == 0 {
		outputTokens, err := tokenestimate.CountBytes(provider.Output)
		if err != nil {
			return result, err
		}
		result.OutputTokens = outputTokens
	}
	return result, nil
}

func validateRouteCallRequest(
	caller *RouteCaller,
	ctx context.Context,
	requestID string,
	materialized RouteContextMaterialization,
) error {
	if caller == nil || caller.sessions == nil || caller.now == nil {
		return NewRouteAttemptFailure(RouteFailureKindInternal, errors.New("master route caller is unavailable"))
	}
	if ctx == nil {
		return NewRouteAttemptFailure(RouteFailureKindInternal, errors.New("master route caller context is required"))
	}
	if err := validateRouteReference("master route provider request id", requestID); err != nil {
		return NewRouteAttemptFailure(RouteFailureKindInternal, err)
	}
	if err := materialized.Validate(); err != nil {
		return NewRouteAttemptFailure(RouteFailureKindInternal, err)
	}
	return nil
}

func routeProviderCallFailure(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return NewRouteAttemptFailure(
		RouteFailureKindProviderUnavailable,
		fmt.Errorf("run durable master route turn: %w", err),
	)
}

func (caller *RouteCaller) completeRouteCall(
	result RouteCallResult,
	materialized RouteContextMaterialization,
) (RouteCallResult, error) {
	endedAt, err := caller.timestampAfter(result.StartedAt)
	if err != nil {
		return result, NewRouteAttemptFailure(RouteFailureKindInternal, err)
	}
	result.EndedAt = endedAt
	if result.Session.ID != materialized.Bundle.SessionID || result.Session.ProviderThreadID == nil ||
		*result.Session.ProviderThreadID != result.ProviderThreadID {
		return result, NewRouteAttemptFailure(
			RouteFailureKindStateUnavailable,
			errors.New("durable master session changed during route generation"),
		)
	}
	if err := validateRouteReference("master route provider thread id", result.ProviderThreadID); err != nil {
		return result, NewRouteAttemptFailure(RouteFailureKindProviderOutputInvalid, err)
	}
	if err := validateRouteReference("master route provider turn id", result.ProviderTurnID); err != nil {
		return result, NewRouteAttemptFailure(RouteFailureKindProviderOutputInvalid, err)
	}
	decision, err := decodeRouteOutput(result.StructuredOutput, materialized.Bundle)
	if err != nil {
		return result, NewRouteAttemptFailure(RouteFailureKindProviderOutputInvalid, err)
	}
	result.Decision = decision
	return result, nil
}

func (caller *RouteCaller) timestamp() string {
	return caller.now().UTC().Format(time.RFC3339Nano)
}

func (caller *RouteCaller) timestampAfter(previous string) (string, error) {
	parsed, err := time.Parse(time.RFC3339Nano, previous)
	if err != nil {
		return "", err
	}
	candidate := caller.now().UTC()
	if !candidate.After(parsed) {
		candidate = parsed.Add(time.Nanosecond)
	}
	return candidate.Format(time.RFC3339Nano), nil
}

func routeInvocationAudit(call RouteCallResult) (RouteInvocationAudit, error) {
	configuration, err := NewRouteModelConfigurationAudit(call.Session.Configuration)
	if err != nil {
		return RouteInvocationAudit{}, err
	}
	audit := RouteInvocationAudit{
		Configuration:         configuration,
		ProviderRequestID:     call.RequestID,
		ProviderThreadID:      call.ProviderThreadID,
		ProviderTurnID:        call.ProviderTurnID,
		InputBytes:            call.InputBytes,
		EstimatedInputTokens:  call.InputTokens,
		OutputBytes:           call.OutputBytes,
		EstimatedOutputTokens: call.OutputTokens,
		StartedAt:             call.StartedAt,
		EndedAt:               call.EndedAt,
	}
	if err := audit.Validate(); err != nil {
		return RouteInvocationAudit{}, err
	}
	return audit, nil
}
