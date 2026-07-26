package conversation

import (
	"encoding/json"
	"testing"
)

func TestEveryTrajectoryKindHasAValidatedTypedPayload(t *testing.T) {
	command := "./scripts/go.sh test ./internal/conversation"
	cwd := "/workspace"
	duration := 1200
	exitCode := 0
	changes := []FileChange{{Path: "internal/conversation/domain.go", Kind: FileChangeUpdate, Diff: "+type TopicConversation struct"}}
	activity := TrajectoryActivity{
		ID:      "activity-1",
		Kind:    TrajectoryActivityCommand,
		Title:   "Run focused tests",
		Command: &command,
		CWD:     &cwd,
	}
	approval := TrajectoryApprovalRequest{
		ID:             "approval-1",
		ProviderItemID: "provider-item-approval",
		Kind:           TrajectoryApprovalKindCommand,
		Title:          "Run command",
		Body:           "Allow the focused test command.",
		Command:        &command,
		CWD:            &cwd,
		FilePaths:      []string{},
		Questions:      []TrajectoryApprovalQuestion{},
		RequestedAt:    testTimeStarted,
	}
	subagent := Subagent{
		ID:      "subagent-1",
		Status:  SubagentStatusRunning,
		ModelID: stringPointer("gpt-subagent"),
	}
	tests := []struct {
		kind  TrajectoryEventKind
		apply func(*TrajectoryEvent)
	}{
		{TrajectoryEventUserInputAccepted, func(event *TrajectoryEvent) {
			event.UserInputAccepted = &TrajectoryUserInputAccepted{Input: AuthoredInput{Text: "Implement the domain."}, Delivery: TurnDeliveryNormal}
		}},
		{TrajectoryEventTurnQueued, func(event *TrajectoryEvent) {
			event.TurnQueued = &TrajectoryTurnQueued{QueueOrdinal: 2}
		}},
		{TrajectoryEventTurnPromoted, func(event *TrajectoryEvent) {
			event.TurnPromoted = &TrajectoryTurnPromoted{FormerQueueOrdinal: 2}
		}},
		{TrajectoryEventTurnStarted, func(event *TrajectoryEvent) {
			event.TurnStarted = &TrajectoryTurnStarted{Invocation: validInvocation(RoleAgent, InvocationOutcomeRunning)}
		}},
		{TrajectoryEventTurnSteered, func(event *TrajectoryEvent) {
			event.TurnSteered = &TrajectoryTurnSteered{Input: AuthoredInput{Text: "Also update the plan."}}
		}},
		{TrajectoryEventTurnInterrupted, func(event *TrajectoryEvent) {
			event.TurnInterrupted = &TrajectoryTurnInterrupted{Reason: TurnInterruptionUserRequested}
		}},
		{TrajectoryEventTurnCompleted, func(event *TrajectoryEvent) {
			event.TurnCompleted = &TrajectoryTurnCompleted{}
		}},
		{TrajectoryEventTurnFailed, func(event *TrajectoryEvent) {
			event.TurnFailed = &TrajectoryTurnFailed{Failure: testFailure()}
		}},
		{TrajectoryEventAgentPublicTextDelta, func(event *TrajectoryEvent) {
			event.AgentPublicTextDelta = &TrajectoryAgentPublicTextDelta{ProviderItemID: "provider-item-message", Delta: "Working"}
		}},
		{TrajectoryEventAgentMessageCompleted, func(event *TrajectoryEvent) {
			event.AgentMessageCompleted = &TrajectoryAgentMessageCompleted{ProviderItemID: "provider-item-message", Text: "The work is complete."}
		}},
		{TrajectoryEventPublicReasoningSummaryUpdated, func(event *TrajectoryEvent) {
			event.PublicReasoningSummaryUpdated = &TrajectoryPublicReasoningSummaryUpdated{ProviderItemID: "provider-item-reasoning", Summary: []string{"Reviewing the schema."}}
		}},
		{TrajectoryEventPlanChanged, func(event *TrajectoryEvent) {
			event.PlanChanged = &TrajectoryPlanChanged{Steps: []PlanStep{{Text: "Define domain types", Status: PlanStepStatusCompleted}}}
		}},
		{TrajectoryEventActivityStarted, func(event *TrajectoryEvent) {
			event.ActivityStarted = &TrajectoryActivityStarted{Activity: activity}
		}},
		{TrajectoryEventActivityProgressed, func(event *TrajectoryEvent) {
			event.ActivityProgressed = &TrajectoryActivityProgressed{ActivityID: activity.ID, Progress: "Tests are running."}
		}},
		{TrajectoryEventActivityCompleted, func(event *TrajectoryEvent) {
			event.ActivityCompleted = &TrajectoryActivityCompleted{Activity: activity, Summary: "Focused tests passed.", DurationMs: &duration, ExitCode: &exitCode}
		}},
		{TrajectoryEventActivityFailed, func(event *TrajectoryEvent) {
			event.ActivityFailed = &TrajectoryActivityFailed{Activity: activity, Failure: testFailure()}
		}},
		{TrajectoryEventFileChangeProposed, func(event *TrajectoryEvent) {
			event.FileChangeProposed = &TrajectoryFileChangeProposed{ProviderItemID: "provider-item-file", Changes: changes}
		}},
		{TrajectoryEventFileChangeCompleted, func(event *TrajectoryEvent) {
			event.FileChangeCompleted = &TrajectoryFileChangeCompleted{ProviderItemID: "provider-item-file", Changes: changes, Outcome: FileChangeOutcomeCompleted}
		}},
		{TrajectoryEventApprovalRequested, func(event *TrajectoryEvent) {
			event.ApprovalRequested = &TrajectoryApprovalRequested{Approval: approval}
		}},
		{TrajectoryEventApprovalResolved, func(event *TrajectoryEvent) {
			event.ApprovalResolved = &TrajectoryApprovalResolved{Resolution: TrajectoryApprovalResolution{ApprovalID: approval.ID, Decision: TrajectoryApprovalDecisionApproved, Answers: []ConversationApprovalAnswer{}, ResolvedAt: testTimeEnded}}
		}},
		{TrajectoryEventSubagentStarted, func(event *TrajectoryEvent) {
			event.SubagentStarted = &TrajectorySubagentStarted{Subagent: subagent}
		}},
		{TrajectoryEventSubagentUpdated, func(event *TrajectoryEvent) {
			event.SubagentUpdated = &TrajectorySubagentUpdated{Subagent: subagent}
		}},
		{TrajectoryEventSubagentCompleted, func(event *TrajectoryEvent) {
			completed := subagent
			completed.Status = SubagentStatusCompleted
			completed.Message = stringPointer("The delegated work completed.")
			event.SubagentCompleted = &TrajectorySubagentCompleted{Subagent: completed}
		}},
		{TrajectoryEventArtifactEmitted, func(event *TrajectoryEvent) {
			event.ArtifactEmitted = &TrajectoryArtifactEmitted{
				ArtifactID: "artifact-1",
				Kind:       ArtifactKindMarkdown,
				Title:      "Focused test summary",
			}
		}},
		{TrajectoryEventProviderLifecycleChanged, func(event *TrajectoryEvent) {
			event.ProviderLifecycleChanged = &TrajectoryProviderLifecycleChanged{Lifecycle: ProviderLifecycle{
				Provider: ProviderCodex,
				Status:   ProviderLifecycleReady,
				Reason:   ProviderLifecycleReasonThreadIdle,
			}}
		}},
		{TrajectoryEventValidationRecorded, func(event *TrajectoryEvent) {
			event.ValidationRecorded = &TrajectoryValidationRecorded{Validation: TrajectoryValidation{
				ID:      "review-1",
				Kind:    TrajectoryValidationGuardianReview,
				Status:  TrajectoryValidationStatusPassed,
				Subject: stringPointer("provider-item-file"),
				Summary: "Automatic approval review allowed the change (risk low)",
			}}
		}},
		{TrajectoryEventModelRerouted, func(event *TrajectoryEvent) {
			event.ModelRerouted = &TrajectoryModelRerouted{Reroute: InvocationModelReroute{FromModelID: "gpt-heavy", ToModelID: "gpt-safe", Reason: InvocationModelRerouteReasonHighRiskCyberActivity}}
		}},
	}

	wantKinds := TrajectoryEventKinds()
	if len(tests) != len(wantKinds) {
		t.Fatalf("trajectory payload fixture count = %d, owner kind count = %d", len(tests), len(wantKinds))
	}
	seen := map[TrajectoryEventKind]bool{}
	for _, test := range tests {
		t.Run(string(test.kind), func(t *testing.T) {
			if seen[test.kind] {
				t.Fatalf("duplicate trajectory kind fixture %s", test.kind)
			}
			seen[test.kind] = true
			event := baseTrajectoryEvent(test.kind)
			test.apply(&event)
			if err := event.Validate(); err != nil {
				t.Fatalf("valid event: %v", err)
			}

			encoded, err := json.Marshal(event)
			if err != nil {
				t.Fatalf("marshal event: %v", err)
			}
			var decoded TrajectoryEvent
			if err := json.Unmarshal(encoded, &decoded); err != nil {
				t.Fatalf("unmarshal event: %v", err)
			}
			if err := decoded.Validate(); err != nil {
				t.Fatalf("validate JSON round trip: %v", err)
			}
		})
	}
	for _, kind := range wantKinds {
		if !seen[kind] {
			t.Errorf("trajectory kind %s has no payload fixture", kind)
		}
	}
}

func TestStructuredInputContractsRejectAmbiguousQuestionAndResolutionShapes(t *testing.T) {
	question := TrajectoryApprovalQuestion{
		ID:       "question-1",
		Header:   "Scope",
		Question: "Which scope should be used?",
		Options:  []string{"Workspace", "Conversation"},
	}
	if err := question.Validate(); err != nil {
		t.Fatalf("valid approval question: %v", err)
	}
	question.Header = ""
	assertValidationErrorContains(t, question.Validate(), "header is required")
	question.Header = "Scope"
	question.Options = []string{"Workspace", "Workspace"}
	assertValidationErrorContains(t, question.Validate(), "is duplicated")

	resolution := TrajectoryApprovalResolution{
		ApprovalID: "approval-1",
		Decision:   TrajectoryApprovalDecisionApproved,
		Response:   "unexpected",
		Answers:    []ConversationApprovalAnswer{},
		ResolvedAt: testTimeEnded,
	}
	assertValidationErrorContains(t, resolution.Validate(), "must not include a response")
	resolution.Decision = TrajectoryApprovalDecisionAnswered
	resolution.Response = " padded "
	assertValidationErrorContains(t, resolution.Validate(), "surrounding whitespace")
}

func TestTrajectoryEventRejectsMismatchedAndMultiplePayloadBranches(t *testing.T) {
	event := baseTrajectoryEvent(TrajectoryEventTurnQueued)
	event.TurnQueued = &TrajectoryTurnQueued{QueueOrdinal: 1}
	event.Kind = TrajectoryEventTurnPromoted
	assertValidationErrorContains(t, event.Validate(), "does not match populated")

	event.Kind = TrajectoryEventTurnQueued
	event.TurnPromoted = &TrajectoryTurnPromoted{FormerQueueOrdinal: 1}
	assertValidationErrorContains(t, event.Validate(), "exactly one payload branch")

	event = baseTrajectoryEvent(TrajectoryEventFileChangeCompleted)
	event.FileChangeCompleted = &TrajectoryFileChangeCompleted{
		ProviderItemID: "provider-item-file",
		Changes:        []FileChange{{Path: "file.go", Kind: FileChangeUpdate}},
		Outcome:        FileChangeOutcomeFailed,
	}
	assertValidationErrorContains(t, event.Validate(), "failed file change requires failure")
}

func TestTurnLifecycleReasonsCannotBecomeRunlessFacts(t *testing.T) {
	event := baseTrajectoryEvent(TrajectoryEventProviderLifecycleChanged)
	event.TurnID = nil
	event.ProviderTurnID = nil
	event.Actor = TrajectoryActorProvider
	event.ProviderLifecycleChanged = &TrajectoryProviderLifecycleChanged{Lifecycle: ProviderLifecycle{
		Provider: ProviderCodex,
		Status:   ProviderLifecycleRestarting,
		Reason:   ProviderLifecycleReasonTurnRetrying,
	}}
	assertValidationErrorContains(t, event.Validate(), "requires turn id")

	event.ProviderLifecycleChanged.Lifecycle = ProviderLifecycle{
		Provider: ProviderCodex,
		Status:   ProviderLifecycleUnavailable,
		Reason:   ProviderLifecycleReasonEnvironmentDisconnected,
	}
	if err := event.Validate(); err != nil {
		t.Fatalf("thread-scoped environment lifecycle was rejected: %v", err)
	}
}

func TestOnlyGuardianValidationCarriesTypedRisk(t *testing.T) {
	risk := TrajectoryValidationRiskHigh
	validation := TrajectoryValidation{
		ID:      "validation-1",
		Kind:    TrajectoryValidationModelVerification,
		Status:  TrajectoryValidationStatusInProgress,
		Risk:    &risk,
		Summary: "Extra model safety verification is applied to this run",
	}
	assertValidationErrorContains(t, validation.Validate(), "must not carry Guardian risk")

	validation.Kind = TrajectoryValidationGuardianReview
	if err := validation.Validate(); err != nil {
		t.Fatalf("Guardian validation with typed risk was rejected: %v", err)
	}
	validation.Summary = " Extra model safety verification is applied to this run"
	assertValidationErrorContains(t, validation.Validate(), "surrounding whitespace")
}

func TestTrajectoryLargeOutputUsesTypedBoundedReference(t *testing.T) {
	reference := TrajectoryContentReference{
		URI:       "setta-content://tool-output-1",
		MediaType: "text/plain",
		ByteSize:  2_000_000,
		Truncated: true,
		Summary:   "The full output is stored outside the trajectory event.",
	}
	if err := reference.Validate(); err != nil {
		t.Fatalf("valid content reference: %v", err)
	}
	reference.Summary = ""
	assertValidationErrorContains(t, reference.Validate(), "summary is required")
}

func baseTrajectoryEvent(kind TrajectoryEventKind) TrajectoryEvent {
	return TrajectoryEvent{
		ID:             "trajectory-" + string(kind),
		ConversationID: "conversation-1",
		TurnID:         stringPointer("turn-1"),
		Sequence:       1,
		EmittedAt:      testTimeStarted,
		Kind:           kind,
		Actor:          TrajectoryActorSystem,
		ProviderTurnID: stringPointer("provider-turn-1"),
	}
}
