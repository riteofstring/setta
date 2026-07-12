package conversation

import "testing"

func TestInvocationAttemptRejectsUnsupportedValidationResult(t *testing.T) {
	failure := Failure{
		Code:                "provider_unavailable",
		Message:             "The provider is unavailable.",
		Retryable:           true,
		DiagnosticReference: "diagnostic-invocation-attempt",
	}
	attempt := InvocationAttempt{
		ID:             "invocation-attempt-validation",
		ConversationID: "conversation-invocation-attempt",
		CallKind:       InvocationAttemptCallInputRoute,
		Generation:     1,
		Context: InvocationAttemptContextAudit{
			IncludedRanges:       []TrajectorySequenceRange{},
			EventCounts:          []InvocationAttemptEventCount{},
			AllowedDecisionKinds: []ConversationRouteDecisionKind{},
		},
		StartedAt:        "2026-07-15T10:00:00Z",
		EndedAt:          "2026-07-15T10:00:01Z",
		Outcome:          InvocationAttemptOutcomeFailed,
		ValidationResult: InvocationValidationNotRun,
		CommitDecision:   InvocationCommitFailureCommitted,
		Failure:          &failure,
	}
	if err := attempt.Validate(); err != nil {
		t.Fatalf("valid failed invocation attempt: %v", err)
	}

	attempt.ValidationResult = InvocationValidationResult("invalid")
	if err := attempt.Validate(); err == nil {
		t.Fatal("unsupported invocation validation result was accepted")
	}
}
