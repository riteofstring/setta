package agent

import (
	"errors"
	"testing"

	"setta/internal/codexapp"
)

func TestNormalizedThreadLifecycleNotificationsCarryTypedCauses(t *testing.T) {
	base := providerNotificationTestBase()
	for _, testCase := range []struct {
		name      string
		method    string
		params    map[string]any
		lifecycle LifecycleEvent
	}{
		{
			name:   "idle thread stays healthy metadata",
			method: codexapp.CodexNotificationThreadStatusChanged,
			params: map[string]any{
				"status": map[string]any{"type": "idle"}, "threadId": base.ProviderThreadID,
			},
			lifecycle: LifecycleEvent{State: LifecycleStateReady, Reason: LifecycleReasonThreadIdle},
		},
		{
			name:   "system error makes the substrate unavailable",
			method: codexapp.CodexNotificationThreadStatusChanged,
			params: map[string]any{
				"status": map[string]any{"type": "systemError"}, "threadId": base.ProviderThreadID,
			},
			lifecycle: LifecycleEvent{State: LifecycleStateUnavailable, Reason: LifecycleReasonThreadSystemError},
		},
		{
			name:   "environment connected",
			method: codexapp.CodexNotificationThreadEnvironmentConnected,
			params: map[string]any{
				"environmentId": "env-1", "threadId": base.ProviderThreadID,
			},
			lifecycle: LifecycleEvent{State: LifecycleStateReady, Reason: LifecycleReasonEnvironmentConnected},
		},
		{
			name:   "environment disconnected",
			method: codexapp.CodexNotificationThreadEnvironmentDisconnected,
			params: map[string]any{
				"environmentId": "env-1", "threadId": base.ProviderThreadID,
			},
			lifecycle: LifecycleEvent{State: LifecycleStateUnavailable, Reason: LifecycleReasonEnvironmentDisconnected},
		},
		{
			name:      "thread closed",
			method:    codexapp.CodexNotificationThreadClosed,
			params:    map[string]any{"threadId": base.ProviderThreadID},
			lifecycle: LifecycleEvent{State: LifecycleStateClosed, Reason: LifecycleReasonThreadClosed},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			events, terminal, err := normalizedProviderNotification(
				newTestRuntime(),
				providerNotificationMessage(t, testCase.method, testCase.params),
				base,
			)
			if err != nil {
				t.Fatalf("normalize %s: %v", testCase.method, err)
			}
			if terminal != nil {
				t.Fatalf("%s produced a terminal turn result", testCase.method)
			}
			if len(events) != 1 {
				t.Fatalf("%s produced %d events, want 1", testCase.method, len(events))
			}
			event := events[0]
			if err := event.Validate(); err != nil {
				t.Fatalf("%s event is invalid: %v", testCase.method, err)
			}
			if event.Kind != EventKindLifecycleChanged {
				t.Fatalf("%s event kind = %q, want %q", testCase.method, event.Kind, EventKindLifecycleChanged)
			}
			if event.Lifecycle == nil {
				t.Fatalf("%s event has no lifecycle payload", testCase.method)
			}
			if event.Lifecycle.State != testCase.lifecycle.State || event.Lifecycle.Reason != testCase.lifecycle.Reason {
				t.Fatalf("%s lifecycle = %s/%s, want %s/%s", testCase.method,
					event.Lifecycle.State, event.Lifecycle.Reason,
					testCase.lifecycle.State, testCase.lifecycle.Reason)
			}
		})
	}
}

func TestNormalizedThreadLifecycleRejectsAnotherThreadsScope(t *testing.T) {
	base := providerNotificationTestBase()
	message := providerNotificationMessage(t, codexapp.CodexNotificationThreadClosed, map[string]any{
		"threadId": "provider-thread-other",
	})
	if _, _, err := normalizedProviderNotification(newTestRuntime(), message, base); err == nil {
		t.Fatal("thread close for another thread was accepted")
	}
}

func TestNormalizedGuardianReviewRecordsTypedVerdicts(t *testing.T) {
	base := providerNotificationTestBase()
	for _, testCase := range []struct {
		name    string
		status  string
		want    ValidationStatus
		summary string
	}{
		{name: "approved", status: "approved", want: ValidationStatusPassed, summary: "Automatic approval review passed (risk low)"},
		{name: "denied", status: "denied", want: ValidationStatusFailed, summary: "Automatic approval review failed (risk low)"},
		{name: "timed out", status: "timedOut", want: ValidationStatusInconclusive, summary: "Automatic approval review ended without a verdict (risk low)"},
		{name: "aborted", status: "aborted", want: ValidationStatusInconclusive, summary: "Automatic approval review ended without a verdict (risk low)"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			message := providerNotificationMessage(t, codexapp.CodexNotificationItemAutoApprovalReviewCompleted, map[string]any{
				"action":         map[string]any{"type": "command", "source": "shell", "command": "ls", "cwd": "/repo"},
				"completedAtMs":  2,
				"decisionSource": "agent",
				"review": map[string]any{
					"status": testCase.status, "riskLevel": "low",
					"rationale": "DO_NOT_LEAK_PROVIDER_RATIONALE",
				},
				"reviewId": "review-1", "startedAtMs": 1, "targetItemId": "item-command",
				"threadId": base.ProviderThreadID, "turnId": base.ProviderTurnID,
			})
			events, _, err := normalizedProviderNotification(newTestRuntime(), message, base)
			if err != nil {
				t.Fatalf("normalize guardian review: %v", err)
			}
			if len(events) != 1 {
				t.Fatalf("guardian review produced %d events, want 1", len(events))
			}
			event := events[0]
			if err := event.Validate(); err != nil {
				t.Fatalf("guardian review event is invalid: %v", err)
			}
			if event.Kind != EventKindValidationRecorded {
				t.Fatalf("guardian review event kind = %q", event.Kind)
			}
			validation := event.Validation
			if validation.ID != "review-1" || validation.Kind != ValidationKindGuardianReview {
				t.Fatalf("validation identity = %s/%s", validation.ID, validation.Kind)
			}
			if validation.Status != testCase.want {
				t.Fatalf("validation status = %q, want %q", validation.Status, testCase.want)
			}
			if validation.Subject == nil || *validation.Subject != "item-command" {
				t.Fatalf("validation subject = %v, want the reviewed item", validation.Subject)
			}
			if validation.Risk == nil || *validation.Risk != ValidationRiskLow {
				t.Fatalf("validation risk = %v, want %q", validation.Risk, ValidationRiskLow)
			}
			if validation.Summary != testCase.summary {
				t.Fatalf("validation summary = %q, want %q", validation.Summary, testCase.summary)
			}
		})
	}
}

func TestValidationEventsRejectUntrimmedPublicIdentifiers(t *testing.T) {
	base := providerNotificationTestBase()
	valid := ValidationEvent{
		ID:      "review-1",
		Kind:    ValidationKindGuardianReview,
		Status:  ValidationStatusPassed,
		Subject: stringPointer("item-1"),
		Summary: "Automatic approval review passed",
	}
	for _, testCase := range []struct {
		name   string
		mutate func(*ValidationEvent)
	}{
		{
			name: "validation id",
			mutate: func(validation *ValidationEvent) {
				validation.ID = " review-1"
			},
		},
		{
			name: "subject",
			mutate: func(validation *ValidationEvent) {
				validation.Subject = stringPointer("item-1 ")
			},
		},
		{
			name: "summary",
			mutate: func(validation *ValidationEvent) {
				validation.Summary = " Automatic approval review passed"
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			validation := valid
			testCase.mutate(&validation)
			event := base
			event.Kind = EventKindValidationRecorded
			event.ProviderEventID = stringPointer(validation.ID)
			event.Validation = &validation
			if err := event.Validate(); err == nil {
				t.Fatalf("untrimmed %s was accepted", testCase.name)
			}
		})
	}
}

func TestNormalizedModelVerificationStaysAnInProgressCheck(t *testing.T) {
	base := providerNotificationTestBase()
	message := providerNotificationMessage(t, codexapp.CodexNotificationModelVerification, map[string]any{
		"threadId": base.ProviderThreadID, "turnId": base.ProviderTurnID,
		"verifications": []string{"trustedAccessForCyber"},
	})
	events, _, err := normalizedProviderNotification(newTestRuntime(), message, base)
	if err != nil {
		t.Fatalf("normalize model verification: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("model verification produced %d events, want 1", len(events))
	}
	validation := events[0].Validation
	if validation == nil || validation.Kind != ValidationKindModelVerification {
		t.Fatalf("model verification produced %+v", validation)
	}
	// The provider never reports a verdict for it, so claiming one would be a
	// fact Setta does not have.
	if validation.Status != ValidationStatusInProgress {
		t.Fatalf("model verification status = %q, want %q", validation.Status, ValidationStatusInProgress)
	}
	if validation.Subject != nil {
		t.Fatalf("model verification named subject %v; it covers the whole run", validation.Subject)
	}
}

func TestServerRequestResolvedSupersedesOnlyRequestsThisAppIsStillWaitingOn(t *testing.T) {
	base := providerNotificationTestBase()
	message := providerNotificationMessage(t, codexapp.CodexNotificationServerRequestResolved, map[string]any{
		"requestId": "request-9", "threadId": base.ProviderThreadID,
	})

	// The notification is broadcast to every subscribed client, including the
	// one that answered, so a request this runtime already resolved is not news.
	runtime := newTestRuntime()
	events, _, err := normalizedProviderNotification(runtime, message, base)
	if err != nil {
		t.Fatalf("normalize resolved request: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("resolved request produced %d events for a request this app is not waiting on", len(events))
	}

	runtime.pending["request-9"] = pendingApproval{conversationID: base.ConversationID}
	events, _, err = normalizedProviderNotification(runtime, message, base)
	if err != nil {
		t.Fatalf("normalize resolved pending request: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("resolved pending request produced %d events, want 1", len(events))
	}
	event := events[0]
	if err := event.Validate(); err != nil {
		t.Fatalf("approval superseded event is invalid: %v", err)
	}
	if event.Kind != EventKindApprovalSuperseded {
		t.Fatalf("event kind = %q, want %q", event.Kind, EventKindApprovalSuperseded)
	}
	if event.ApprovalSuperseded.ApprovalID != "request-9" {
		t.Fatalf("superseded approval id = %q", event.ApprovalSuperseded.ApprovalID)
	}
	// Normalization reserves the request while its durable superseded event is
	// committed. The sink owner removes it only after that commit succeeds.
	if pending := runtime.pending["request-9"]; !pending.superseded {
		t.Fatal("a resolved request was not reserved during durable commit")
	}
	if err := runtime.SubmitApproval(ApprovalResponse{
		RequestID: "request-9",
		Decision:  ApprovalDecisionDecline,
	}); err == nil {
		t.Fatal("a provider-resolved request remained answerable during durable commit")
	}
}

func TestServerRequestResolvedRemovesPendingOnlyAfterDurableSinkCommit(t *testing.T) {
	base := providerNotificationTestBase()
	message := providerNotificationMessage(t, codexapp.CodexNotificationServerRequestResolved, map[string]any{
		"requestId": "request-9", "threadId": base.ProviderThreadID,
	})
	runtime := newTestRuntime()
	runtime.pending["request-9"] = pendingApproval{conversationID: base.ConversationID}

	if _, _, err := runtime.handleProviderNotification(message, base, rejectingAgentEventSink{}); err == nil {
		t.Fatal("a rejected durable supersession event was reported as committed")
	}
	pending, waiting := runtime.pending["request-9"]
	if !waiting || pending.superseded {
		t.Fatal("a rejected durable supersession event removed or reserved the pending request")
	}

	if _, _, err := runtime.handleProviderNotification(message, base, &recordingEventSink{}); err != nil {
		t.Fatalf("commit durable supersession event: %v", err)
	}
	if _, waiting := runtime.pending["request-9"]; waiting {
		t.Fatal("a committed durable supersession event left the request pending")
	}
}

func TestInvalidApprovalAnswerLeavesTheRequestPending(t *testing.T) {
	runtime := newTestRuntime()
	runtime.pending["request-input"] = pendingApproval{
		method: codexapp.CodexServerRequestItemToolRequestUserInput,
		questions: []ApprovalQuestion{{
			ID:       "scope",
			Question: "Which scope should be used?",
		}},
	}
	err := runtime.SubmitApproval(ApprovalResponse{
		RequestID: "request-input",
		Decision:  ApprovalDecisionAccept,
	})
	if err == nil {
		t.Fatal("an incomplete structured answer was accepted")
	}
	if _, pending := runtime.pending["request-input"]; !pending {
		t.Fatal("an invalid answer removed the request before the user could correct it")
	}
}

type rejectingAgentEventSink struct{}

func (rejectingAgentEventSink) HandleAgentEvent(Event) error {
	return errors.New("durable sink rejected event")
}
