package master

import (
	"strings"
	"testing"
)

func TestRouteInvocationAttemptRejectsUnsupportedValidationResult(t *testing.T) {
	failure := RouteFailure{
		Code:                "master_route_provider_unavailable",
		Message:             "Global routing is temporarily unavailable.",
		Retryable:           true,
		DiagnosticReference: "master-route:input-validation:1",
	}
	attempt := RouteInvocationAttempt{
		ID:               "master-route-attempt-validation",
		CallKind:         RouteInvocationCallRoute,
		InputID:          "master-input-validation",
		RoutingAttempt:   1,
		StartedAt:        "2026-07-15T10:00:00Z",
		EndedAt:          "2026-07-15T10:00:01Z",
		ValidationResult: RouteInvocationValidationNotRun,
		CommitDecision:   RouteInvocationCommitFailure,
		Outcome:          RouteInvocationOutcomeFailed,
		Failure:          &failure,
	}
	if err := attempt.Validate(); err != nil {
		t.Fatalf("valid failed route invocation attempt: %v", err)
	}

	attempt.ValidationResult = RouteInvocationValidationResult("invalid")
	if err := attempt.Validate(); err == nil {
		t.Fatal("unsupported route invocation validation result was accepted")
	}
}

func TestTerminalMasterRouteAttemptIDIsBoundedForMaximumInputID(t *testing.T) {
	inputID := strings.Repeat("a", MaxInputIDBytes)
	attempt, err := cancelledMasterRouteAttempt(
		InputRoutingWork{
			Input: AcceptedMasterInput{
				Input: MasterInput{ID: inputID},
			},
			RoutingAttempt:   1,
			RoutingStartedAt: "2026-07-15T10:00:00Z",
		},
		masterRouteAttemptState{},
		"2026-07-15T10:00:01Z",
	)
	if err != nil {
		t.Fatalf("cancelledMasterRouteAttempt: %v", err)
	}
	if len(attempt.ID) > MaxRouteReferenceBytes {
		t.Fatalf("synthetic attempt id has %d bytes, want at most %d", len(attempt.ID), MaxRouteReferenceBytes)
	}
}

func TestCancelledMasterRouteAttemptRetainsObservedTokenUsage(t *testing.T) {
	work := InputRoutingWork{
		Input:            AcceptedMasterInput{Input: MasterInput{ID: "master-input-cancel-usage"}},
		RoutingAttempt:   1,
		RoutingStartedAt: "2026-07-15T10:00:00Z",
	}
	call := RouteCallResult{
		RequestID:    "master-route-cancel-usage",
		InputBytes:   400,
		InputTokens:  101,
		OutputBytes:  80,
		OutputTokens: 29,
		StartedAt:    "2026-07-15T10:00:00Z",
	}
	attempt, err := cancelledMasterRouteAttempt(
		work,
		masterRouteAttemptState{call: &call},
		"2026-07-15T10:00:01Z",
	)
	if err != nil {
		t.Fatalf("cancelledMasterRouteAttempt: %v", err)
	}
	if attempt.EstimatedInputTokens != 101 || attempt.EstimatedOutputTokens != 29 {
		t.Fatalf("cancelled master route token usage = %+v", attempt)
	}
}
