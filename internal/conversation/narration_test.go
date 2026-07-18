package conversation

import "testing"

func TestNarratorStateEnforcesContiguousCursorAndDegradationInvariants(t *testing.T) {
	state := NarratorState{
		ConversationID:             "conversation-1",
		ObservedThroughSequence:    12,
		CheckpointThroughSequence:  8,
		CheckpointText:             "Historical work through sequence eight.",
		CurrentFocus:               "Verifying the domain types.",
		CurrentFocusRevision:       2,
		CurrentFocusSourceSequence: 6,
		TopicDescriptor:            "Topic conversation refactor",
		LastInvocationAt:           stringPointer(testTimeStarted),
		Status:                     NarratorStatusReady,
		UpdatedAt:                  testTimeEnded,
	}
	if err := state.Validate(); err != nil {
		t.Fatalf("valid narrator state: %v", err)
	}

	invalid := state
	invalid.CheckpointThroughSequence = 13
	assertValidationErrorContains(t, invalid.Validate(), "exceeds observed cursor")
	invalid = state
	invalid.CheckpointThroughSequence = 0
	assertValidationErrorContains(t, invalid.Validate(), "checkpoint text without covered trajectory")
	invalid = state
	invalid.Status = NarratorStatusDegraded
	assertValidationErrorContains(t, invalid.Validate(), "requires degradation")
	invalid = state
	invalid.LastInvocationAt = stringPointer("2026-07-11T20:02:00Z")
	assertValidationErrorContains(t, invalid.Validate(), "follows updatedAt")

	state.Status = NarratorStatusDegraded
	state.Degradation = &NarratorDegradation{
		Code:                "model_unavailable",
		Message:             "Narration is temporarily unavailable.",
		Retryable:           true,
		DiagnosticReference: "diagnostic-2",
		DegradedAt:          testTimeEnded,
	}
	if err := state.Validate(); err != nil {
		t.Fatalf("valid degraded narrator state: %v", err)
	}
	state.Degradation.DiagnosticReference = ""
	assertValidationErrorContains(t, state.Validate(), "diagnostic reference is required")
}

func TestNarrationEventsAreStrictChannelSpecificRecords(t *testing.T) {
	tests := []struct {
		name  string
		kind  NarrationEventKind
		apply func(*NarrationEvent)
	}{
		{
			name: "milestone",
			kind: NarrationEventKindMilestone,
			apply: func(event *NarrationEvent) {
				event.Trigger = NarrationTriggerPhaseActivityCompleted
				event.Milestone = &NarrationMilestone{Text: "The persistence model is now defined."}
			},
		},
		{
			name: "status reply",
			kind: NarrationEventKindStatusReply,
			apply: func(event *NarrationEvent) {
				event.Trigger = NarrationTriggerExplicitStatusRequested
				event.StatusReply = &NarrationStatusReply{Question: "What is happening?", Text: "The agent is running focused tests."}
			},
		},
		{
			name: "final summary",
			kind: NarrationEventKindFinalSummary,
			apply: func(event *NarrationEvent) {
				event.Trigger = NarrationTriggerTurnTerminal
				event.FinalSummary = &NarrationFinalSummary{Text: "The requested domain slice is complete."}
			},
		},
		{
			name: "topic descriptor",
			kind: NarrationEventKindTopicDescriptor,
			apply: func(event *NarrationEvent) {
				event.Trigger = NarrationTriggerPlanChanged
				event.TopicDescriptor = &NarrationTopicDescriptor{Text: "Conversation persistence and runtime architecture"}
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			event := baseNarrationEvent(test.kind)
			test.apply(&event)
			if err := event.Validate(); err != nil {
				t.Fatalf("valid narration event: %v", err)
			}
		})
	}

	event := baseNarrationEvent(NarrationEventKindMilestone)
	event.Trigger = NarrationTriggerPhaseActivityCompleted
	event.Milestone = &NarrationMilestone{Text: "Milestone"}
	event.FinalSummary = &NarrationFinalSummary{Text: "Summary"}
	assertValidationErrorContains(t, event.Validate(), "exactly one payload branch")

	event = baseNarrationEvent(NarrationEventKindStatusReply)
	event.Trigger = NarrationTriggerPlanChanged
	event.StatusReply = &NarrationStatusReply{Question: "Status?", Text: "Working."}
	assertValidationErrorContains(t, event.Validate(), "explicit status trigger")

	event = baseNarrationEvent(NarrationEventKindMilestone)
	event.Trigger = NarrationTriggerCheckpointWindowExceeded
	event.Milestone = &NarrationMilestone{Text: "Must not be emitted."}
	assertValidationErrorContains(t, event.Validate(), "unsupported projection trigger")

	event = baseNarrationEvent(NarrationEventKindMilestone)
	event.Trigger = NarrationTriggerExplicitStatusRequested
	event.Milestone = &NarrationMilestone{Text: "Must not be emitted by a status call."}
	assertValidationErrorContains(t, event.Validate(), "status-only call")

	event = baseNarrationEvent(NarrationEventKindTopicDescriptor)
	event.Trigger = NarrationTriggerExplicitStatusRequested
	event.TopicDescriptor = &NarrationTopicDescriptor{Text: "Must not be emitted by a status call."}
	assertValidationErrorContains(t, event.Validate(), "status-only call")
}

func baseNarrationEvent(kind NarrationEventKind) NarrationEvent {
	return NarrationEvent{
		StreamSequence:      1,
		ID:                  "narration-1",
		ConversationID:      "conversation-1",
		TurnID:              stringPointer("turn-1"),
		Kind:                kind,
		SourceSequenceStart: 1,
		SourceSequenceEnd:   12,
		ResolvedInvocation:  validInvocation(RoleNarrator, InvocationOutcomeSucceeded),
		CreatedAt:           testTimeEnded,
	}
}
