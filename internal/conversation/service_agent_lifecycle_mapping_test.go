package conversation

import (
	"errors"
	"strings"
	"testing"

	"setta/internal/agent"
)

func TestUnexpectedProviderLifecycleFailureUsesStableProductCopy(t *testing.T) {
	const providerDiagnostic = "DO_NOT_PERSIST_PROVIDER_LIFECYCLE_ERROR"
	failure := unexpectedTurnFailure(errors.Join(
		errors.New("DO_NOT_PERSIST_PROVIDER_ERROR_WRAPPER"),
		&agent.ProviderLifecycleError{Err: errors.New(providerDiagnostic)},
	))
	if failure.Code != "provider_unavailable" ||
		failure.Message != "Provider is temporarily unavailable. Try again." ||
		!failure.Retryable ||
		strings.Contains(failure.Message, providerDiagnostic) ||
		strings.Contains(failure.Message, "DO_NOT_PERSIST_PROVIDER_ERROR_WRAPPER") {
		t.Fatalf("provider lifecycle failure = %+v", failure)
	}
}

func TestUnexpectedProviderThreadMissingFailureUsesStableProductCopy(t *testing.T) {
	const providerDiagnostic = "DO_NOT_PERSIST_PROVIDER_THREAD_ID"
	failure := unexpectedTurnFailure(&agent.ProviderThreadMissingError{
		Operation: "resume agent thread",
		ThreadID:  providerDiagnostic,
		Err:       errors.New("provider returned an internal lookup error"),
	})
	if failure.Code != "provider_thread_missing" ||
		failure.Message != "This run cannot continue because its provider session is no longer available. Start a new run." ||
		failure.Retryable ||
		strings.Contains(failure.Message, providerDiagnostic) {
		t.Fatalf("provider thread failure = %+v", failure)
	}
}

func TestUnexpectedRuntimeFailureUsesStableProductCopy(t *testing.T) {
	const runtimeDiagnostic = "DO_NOT_PERSIST_RUNTIME_ERROR"
	failure := unexpectedTurnFailure(errors.New(runtimeDiagnostic))
	if failure.Code != "agent_runtime_failed" ||
		failure.Message != "The run stopped unexpectedly. Try again." ||
		!failure.Retryable ||
		strings.Contains(failure.Message, runtimeDiagnostic) {
		t.Fatalf("runtime failure = %+v", failure)
	}
}

func TestDurableProviderLifecycleKeepsTheTrustedCause(t *testing.T) {
	service := activityMappingTestService()
	for _, testCase := range []struct {
		name      string
		lifecycle agent.LifecycleEvent
		status    ProviderLifecycleStatus
		reason    ProviderLifecycleReason
	}{
		{
			name: "a disconnected environment blocks the run",
			lifecycle: agent.LifecycleEvent{
				State:  agent.LifecycleStateUnavailable,
				Reason: agent.LifecycleReasonEnvironmentDisconnected,
			},
			status: ProviderLifecycleUnavailable,
			reason: ProviderLifecycleReasonEnvironmentDisconnected,
		},
		{
			name: "a closed thread is execution liveness, not a failure",
			lifecycle: agent.LifecycleEvent{
				State:  agent.LifecycleStateClosed,
				Reason: agent.LifecycleReasonThreadClosed,
			},
			status: ProviderLifecycleClosed,
			reason: ProviderLifecycleReasonThreadClosed,
		},
		{
			name: "an idle thread stays healthy metadata",
			lifecycle: agent.LifecycleEvent{
				State:  agent.LifecycleStateReady,
				Reason: agent.LifecycleReasonThreadIdle,
			},
			status: ProviderLifecycleReady,
			reason: ProviderLifecycleReasonThreadIdle,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			event := lifecycleMappingEvent(agent.EventKindLifecycleChanged)
			event.Lifecycle = &testCase.lifecycle
			trajectory, _, err := service.populateAgentTrajectory(
				activityMappingTrajectory(),
				lifecycleMappingActiveTurn(),
				ConversationSnapshot{},
				event,
				testTimeStarted,
			)
			if err != nil {
				t.Fatalf("populate lifecycle trajectory: %v", err)
			}
			if trajectory.Kind != TrajectoryEventProviderLifecycleChanged {
				t.Fatalf("trajectory kind = %q", trajectory.Kind)
			}
			lifecycle := trajectory.ProviderLifecycleChanged.Lifecycle
			if lifecycle.Status != testCase.status || lifecycle.Reason != testCase.reason {
				t.Fatalf("durable lifecycle = %s/%s, want %s/%s",
					lifecycle.Status, lifecycle.Reason, testCase.status, testCase.reason)
			}
			if err := lifecycle.Validate(); err != nil {
				t.Fatalf("durable lifecycle is invalid: %v", err)
			}
		})
	}
}

func TestDurableValidationRecordsTheProviderCheck(t *testing.T) {
	service := activityMappingTestService()
	event := lifecycleMappingEvent(agent.EventKindValidationRecorded)
	event.Validation = &agent.ValidationEvent{
		ID:      "review-1",
		Kind:    agent.ValidationKindGuardianReview,
		Status:  agent.ValidationStatusFailed,
		Subject: stringPointer("item-command"),
		Summary: "Automatic approval review declined the command (risk high)",
	}
	risk := agent.ValidationRiskHigh
	event.Validation.Risk = &risk
	trajectory, _, err := service.populateAgentTrajectory(
		activityMappingTrajectory(),
		lifecycleMappingActiveTurn(),
		ConversationSnapshot{},
		event,
		testTimeStarted,
	)
	if err != nil {
		t.Fatalf("populate validation trajectory: %v", err)
	}
	if trajectory.Kind != TrajectoryEventValidationRecorded {
		t.Fatalf("trajectory kind = %q", trajectory.Kind)
	}
	validation := trajectory.ValidationRecorded.Validation
	if validation.ID != "review-1" || validation.Kind != TrajectoryValidationGuardianReview {
		t.Fatalf("durable validation identity = %s/%s", validation.ID, validation.Kind)
	}
	if validation.Status != TrajectoryValidationStatusFailed {
		t.Fatalf("durable validation status = %q", validation.Status)
	}
	if validation.Risk == nil || *validation.Risk != TrajectoryValidationRiskHigh {
		t.Fatalf("durable validation risk = %v, want %q", validation.Risk, TrajectoryValidationRiskHigh)
	}
	if validation.Subject == nil || *validation.Subject != "item-command" {
		t.Fatalf("durable validation subject = %v, want the reviewed item", validation.Subject)
	}
	if trajectory.Actor != TrajectoryActorProvider {
		t.Fatalf("durable validation actor = %q, want %q", trajectory.Actor, TrajectoryActorProvider)
	}
}

func TestSupersededApprovalResolvesWithoutAUserDecision(t *testing.T) {
	service := activityMappingTestService()
	event := lifecycleMappingEvent(agent.EventKindApprovalSuperseded)
	event.ApprovalSuperseded = &agent.ApprovalSupersededEvent{ApprovalID: "request-9"}
	turnID := "turn-director"
	snapshot := ConversationSnapshot{Trajectory: ConversationTrajectoryWindow{
		Events: []TrajectoryEvent{{
			TurnID: &turnID,
			ApprovalRequested: &TrajectoryApprovalRequested{Approval: TrajectoryApprovalRequest{
				ID: "request-9",
			}},
		}},
	}}
	trajectory, _, err := service.populateAgentTrajectory(
		activityMappingTrajectory(),
		lifecycleMappingActiveTurn(),
		snapshot,
		event,
		testTimeStarted,
	)
	if err != nil {
		t.Fatalf("populate superseded approval trajectory: %v", err)
	}
	if trajectory.Kind != TrajectoryEventApprovalResolved {
		t.Fatalf("trajectory kind = %q", trajectory.Kind)
	}
	resolution := trajectory.ApprovalResolved.Resolution
	if resolution.ApprovalID != "request-9" {
		t.Fatalf("resolved approval id = %q", resolution.ApprovalID)
	}
	// Nobody in this app chose anything, so recording a cancellation or an
	// answer would attribute a decision that was never made here.
	if resolution.Decision != TrajectoryApprovalDecisionSuperseded {
		t.Fatalf("resolved approval decision = %q, want %q", resolution.Decision, TrajectoryApprovalDecisionSuperseded)
	}
	if err := resolution.Validate(); err != nil {
		t.Fatalf("superseded resolution is invalid: %v", err)
	}
}

func lifecycleMappingEvent(kind agent.EventKind) agent.Event {
	return agent.Event{
		Kind:             kind,
		ConversationID:   "conversation-director",
		TurnID:           "turn-director",
		ProviderThreadID: "provider-thread-1",
		ProviderTurnID:   "provider-turn-1",
	}
}

func lifecycleMappingActiveTurn() *activeConversationTurn {
	return &activeConversationTurn{
		conversationID: "conversation-director",
		turnID:         "turn-director",
	}
}
