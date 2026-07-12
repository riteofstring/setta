package narration

import (
	"errors"
	"testing"

	"setta/internal/conversation"
)

func TestFailedNarratorAttemptOmitsProviderRequestBeforeCallPreparation(t *testing.T) {
	attempt, err := failedNarratorAttempt(
		Invocation{
			Request:    statusRequest("narrator-pre-call-failure", "conversation-pre-call-failure"),
			Generation: 1,
			StartedAt:  "2026-07-15T10:00:00Z",
		},
		NewAttemptFailure(FailureKindConfigurationInvalid, errors.New("invalid role profile")),
		conversation.Failure{
			Code:                "configuration_invalid",
			Message:             "Narration configuration is invalid.",
			DiagnosticReference: "diagnostic-pre-call-failure",
		},
		"2026-07-15T10:00:01Z",
	)
	if err != nil {
		t.Fatalf("failedNarratorAttempt: %v", err)
	}
	if attempt.ProviderReferences.RequestID != nil {
		t.Fatalf(
			"provider request id = %q, want nil before call preparation",
			*attempt.ProviderReferences.RequestID,
		)
	}
}
