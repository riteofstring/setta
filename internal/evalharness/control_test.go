package evalharness

import (
	"testing"

	"setta/internal/conversation"
	"setta/internal/director"
	evalverifier "setta/internal/evalharness/verifier"
)

func TestScenarioControlEvidenceGradesMultiTurnContracts(t *testing.T) {
	for _, test := range []struct {
		name     string
		scenario Scenario
		events   []EvaluationEvent
		checks   []evalverifier.Check
	}{
		{
			name:     "genuine ambiguity",
			scenario: controlTestGenuineAmbiguityScenario(),
			events:   genuineAmbiguityControlEvents(),
			checks:   []evalverifier.Check{{ID: "ready_route", Passed: true, Detail: "Ready."}},
		},
		{
			name:     "mid-run steering",
			scenario: controlTestSteeringScenario(),
			events:   steeringControlEvents(),
			checks: []evalverifier.Check{
				{ID: "related_changes_only", Passed: true, Detail: "Related."},
				{ID: "status_route", Passed: true, Detail: "Status."},
				{ID: "health_absent", Passed: true, Detail: "Absent."},
			},
		},
		{
			name:     "queue then cancel",
			scenario: controlTestQueueScenario(),
			events:   queueControlEvents(),
			checks:   []evalverifier.Check{{ID: "version_route", Passed: true, Detail: "Version."}},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			verification := evalverifier.NewResult(test.scenario.Verifier, test.checks, []string{})
			result, err := buildScenarioControlResult(
				test.scenario,
				ScenarioExecutionCompleted,
				test.events,
				&verification,
				nil,
			)
			if err != nil {
				t.Fatalf("build control result: %v", err)
			}
			if !result.Passed || len(result.Assertions) != len(test.scenario.Expect.ControlAssertions) {
				t.Fatalf("control result = %#v", result)
			}
			for _, assertion := range result.Assertions {
				if !assertion.Passed {
					t.Fatalf("control assertion failed: %#v", assertion)
				}
			}
		})
	}
}

func TestScenarioControlEvidenceRejectsMismatchedDirectorControl(t *testing.T) {
	for _, test := range []struct {
		name     string
		scenario Scenario
		events   []EvaluationEvent
		checks   []evalverifier.Check
		mutate   func([]EvaluationEvent)
	}{
		{
			name:     "forbidden clarification did not start work",
			scenario: controlTestSteeringScenario(),
			events:   steeringControlEvents(),
			checks: []evalverifier.Check{
				{ID: "related_changes_only", Passed: true, Detail: "Related."},
				{ID: "status_route", Passed: true, Detail: "Status."},
				{ID: "health_absent", Passed: true, Detail: "Absent."},
			},
			mutate: func(events []EvaluationEvent) {
				events[1].DirectorReceipt.Receipt.Submit.ToolCalls = []director.DirectorToolCall{}
			},
		},
		{
			name:     "clarified work changed workstreams",
			scenario: controlTestGenuineAmbiguityScenario(),
			events:   genuineAmbiguityControlEvents(),
			checks:   []evalverifier.Check{{ID: "ready_route", Passed: true, Detail: "Ready."}},
			mutate: func(events []EvaluationEvent) {
				other := "workstream-other"
				events[2].TriggerObserved.WorkstreamID = &other
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			test.mutate(test.events)
			verification := evalverifier.NewResult(test.scenario.Verifier, test.checks, []string{})
			result, err := buildScenarioControlResult(
				test.scenario,
				ScenarioExecutionCompleted,
				test.events,
				&verification,
				nil,
			)
			if err != nil {
				t.Fatalf("build control result: %v", err)
			}
			if result.Passed || result.Clarification.Passed {
				t.Fatalf("mismatched control passed: %#v", result)
			}
		})
	}
}

func TestConversationStateObservesOnlyExactTypedTriggers(t *testing.T) {
	observedID := "turn-observed"
	queuedID := "turn-queued"
	state := &evaluationConversationState{snapshot: conversation.ConversationSnapshot{
		Conversation: conversation.TopicConversation{ID: "conversation-eval"},
		Turns: conversation.ConversationTurnWindow{Turns: []conversation.ConversationTurn{
			{ID: observedID, Status: conversation.TurnStatusRunning},
			{ID: queuedID, Status: conversation.TurnStatusQueued},
		}},
		Queue: []conversation.QueuedConversationTurn{{TurnID: queuedID}},
		Trajectory: conversation.ConversationTrajectoryWindow{Events: []conversation.TrajectoryEvent{{
			TurnID: &observedID,
			Kind:   conversation.TrajectoryEventFileChangeCompleted,
			FileChangeCompleted: &conversation.TrajectoryFileChangeCompleted{
				Outcome: conversation.FileChangeOutcomeCompleted,
				Changes: []conversation.FileChange{{Path: "src/server.ts", Kind: conversation.FileChangeUpdate}},
			},
		}}},
	}}
	for _, trigger := range []ScenarioTrigger{
		ScenarioTriggerAgentTurnRunning,
		ScenarioTriggerFirstWorkspaceMutation,
		ScenarioTriggerQueueNonempty,
	} {
		observation, ready, err := state.triggerObservation(
			1,
			trigger,
			"workstream-eval",
			observedID,
		)
		if err != nil || !ready {
			t.Fatalf("observe %s = %#v/%t/%v", trigger, observation, ready, err)
		}
		if trigger == ScenarioTriggerQueueNonempty &&
			(len(observation.QueueTurnIDs) != 1 || observation.QueueTurnIDs[0] != queuedID) {
			t.Fatalf("queue trigger = %#v", observation)
		}
	}
}

func controlTestGenuineAmbiguityScenario() Scenario {
	return controlTestScenario(
		ScenarioVerifierGenuineAmbiguity,
		[]ScenarioStep{
			{Kind: ScenarioStepSubmit, Text: "Choose the diagnostics endpoint."},
			{Kind: ScenarioStepSubmitWhen, Trigger: ScenarioTriggerDirectorTurnCompleted, Text: "Use readiness."},
		},
		ScenarioClarificationRequiredOnce,
		[]ScenarioControlAssertion{
			ScenarioControlNoMutationBeforeReply,
			ScenarioControlScriptedReplyConsumed,
			ScenarioControlFollowUpThroughDirector,
		},
	)
}

func controlTestSteeringScenario() Scenario {
	return controlTestScenario(
		ScenarioVerifierMidRunSteering,
		[]ScenarioStep{
			{Kind: ScenarioStepSubmit, Text: "Add health."},
			{Kind: ScenarioStepSubmitWhen, Trigger: ScenarioTriggerFirstWorkspaceMutation, Text: "Use status instead."},
		},
		ScenarioClarificationForbidden,
		[]ScenarioControlAssertion{
			ScenarioControlFollowUpThroughDirector,
			ScenarioControlLatestInstructionWins,
		},
	)
}

func controlTestQueueScenario() Scenario {
	return controlTestScenario(
		ScenarioVerifierQueueThenCancel,
		[]ScenarioStep{
			{Kind: ScenarioStepSubmit, Text: "Update logging."},
			{Kind: ScenarioStepSubmitWhen, Trigger: ScenarioTriggerAgentTurnRunning, Text: "Queue version."},
			{Kind: ScenarioStepSubmitWhen, Trigger: ScenarioTriggerQueueNonempty, Text: "Cancel logging."},
		},
		ScenarioClarificationForbidden,
		[]ScenarioControlAssertion{
			ScenarioControlFollowUpThroughDirector,
			ScenarioControlObservedRunCancelled,
			ScenarioControlNoMutationAfterCancel,
			ScenarioControlQueuedRequestPresentOnce,
			ScenarioControlQueuedRequestPromoted,
			ScenarioControlQueuedRequestCompleted,
			ScenarioControlQueueEmpty,
		},
	)
}

func controlTestScenario(
	id string,
	steps []ScenarioStep,
	clarification ScenarioClarificationPolicy,
	assertions []ScenarioControlAssertion,
) Scenario {
	return Scenario{
		SchemaVersion:  ScenarioSchemaVersion,
		ID:             id,
		Fixture:        ScenarioFixtureTypeScriptService,
		TimeoutSeconds: ScenarioTimeoutSeconds,
		Steps:          steps,
		Expect: ScenarioExpectations{
			TerminalState:     ScenarioTerminalCompleted,
			Clarification:     clarification,
			ControlAssertions: assertions,
		},
		Verifier: id,
		Budget:   ScenarioBudget{HardTotalTokens: 50_000},
		Communication: ScenarioCommunication{
			Progress:            ScenarioProgressWhenUseful,
			FinalResultRequired: true,
		},
	}
}

func genuineAmbiguityControlEvents() []EvaluationEvent {
	workstreamID := "workstream-eval"
	turnID := "turn-ready"
	return controlScenarioEvents(ScenarioVerifierGenuineAmbiguity, []EvaluationEvent{
		controlUserEvent(1, 0, nil, "Choose the diagnostics endpoint."),
		controlReceiptEvent(2, 0, "", workstreamID),
		controlTriggerEvent(3, 1, ScenarioTriggerDirectorTurnCompleted, "", "", "", nil),
		controlUserEvent(4, 1, triggerPointer(ScenarioTriggerDirectorTurnCompleted), "Use readiness."),
		controlReceiptEvent(5, 1, "create_workstream", workstreamID),
		controlTrajectoryEvent(6, turnID, conversation.TrajectoryEventUserInputAccepted, func(event *conversation.TrajectoryEvent) {
			event.UserInputAccepted = &conversation.TrajectoryUserInputAccepted{
				Input:    conversation.AuthoredInput{Text: "Use readiness."},
				Delivery: conversation.TurnDeliveryNormal,
			}
		}),
		controlFinalStateEvent(7, workstreamID, []EvaluationConversationTurnState{{
			TurnID: turnID, AuthoredInput: conversation.AuthoredInput{Text: "Use readiness."},
			Delivery: conversation.TurnDeliveryNormal, Status: conversation.TurnStatusCompleted,
		}}),
	})
}

func steeringControlEvents() []EvaluationEvent {
	workstreamID := "workstream-eval"
	turnID := "turn-health"
	running := conversation.TurnStatusRunning
	return controlScenarioEvents(ScenarioVerifierMidRunSteering, []EvaluationEvent{
		controlUserEvent(1, 0, nil, "Add health."),
		controlReceiptEvent(2, 0, "create_workstream", workstreamID),
		controlTrajectoryEvent(3, turnID, conversation.TrajectoryEventFileChangeCompleted, func(event *conversation.TrajectoryEvent) {
			event.FileChangeCompleted = &conversation.TrajectoryFileChangeCompleted{
				Outcome: conversation.FileChangeOutcomeCompleted,
				Changes: []conversation.FileChange{{Path: "src/server.ts", Kind: conversation.FileChangeUpdate}},
			}
		}),
		controlTriggerEvent(4, 1, ScenarioTriggerFirstWorkspaceMutation, workstreamID, "conversation-eval", turnID, &running),
		controlUserEvent(5, 1, triggerPointer(ScenarioTriggerFirstWorkspaceMutation), "Use status instead."),
		controlReceiptEvent(6, 1, "steer_work", workstreamID),
		controlFinalStateEvent(7, workstreamID, []EvaluationConversationTurnState{{
			TurnID: turnID, AuthoredInput: conversation.AuthoredInput{Text: "Add health."},
			Delivery: conversation.TurnDeliveryNormal, Status: conversation.TurnStatusCompleted,
		}}),
	})
}

func queueControlEvents() []EvaluationEvent {
	workstreamID := "workstream-eval"
	observedID := "turn-logging"
	queuedID := "turn-version"
	running := conversation.TurnStatusRunning
	events := []EvaluationEvent{
		controlUserEvent(1, 0, nil, "Update logging."),
		controlReceiptEvent(2, 0, "create_workstream", workstreamID),
		controlTriggerEvent(3, 1, ScenarioTriggerAgentTurnRunning, workstreamID, "conversation-eval", observedID, &running),
		controlUserEvent(4, 1, triggerPointer(ScenarioTriggerAgentTurnRunning), "Queue version."),
		controlReceiptEvent(5, 1, "submit_work", workstreamID),
		controlTrajectoryEvent(6, queuedID, conversation.TrajectoryEventUserInputAccepted, func(event *conversation.TrajectoryEvent) {
			event.UserInputAccepted = &conversation.TrajectoryUserInputAccepted{
				Input:    conversation.AuthoredInput{Text: "Queue version."},
				Delivery: conversation.TurnDeliveryQueued,
			}
		}),
		controlTrajectoryEvent(7, queuedID, conversation.TrajectoryEventTurnQueued, func(event *conversation.TrajectoryEvent) {
			event.TurnQueued = &conversation.TrajectoryTurnQueued{QueueOrdinal: 1}
		}),
		controlTriggerEvent(8, 2, ScenarioTriggerQueueNonempty, workstreamID, "conversation-eval", observedID, &running),
		controlUserEvent(9, 2, triggerPointer(ScenarioTriggerQueueNonempty), "Cancel logging."),
		controlReceiptEvent(10, 2, "cancel_run", workstreamID),
		controlTrajectoryEvent(11, observedID, conversation.TrajectoryEventTurnInterrupted, func(event *conversation.TrajectoryEvent) {
			event.TurnInterrupted = &conversation.TrajectoryTurnInterrupted{Reason: conversation.TurnInterruptionUserRequested}
		}),
		controlTrajectoryEvent(12, queuedID, conversation.TrajectoryEventTurnPromoted, func(event *conversation.TrajectoryEvent) {
			event.TurnPromoted = &conversation.TrajectoryTurnPromoted{FormerQueueOrdinal: 1}
		}),
		controlTrajectoryEvent(13, queuedID, conversation.TrajectoryEventTurnCompleted, func(event *conversation.TrajectoryEvent) {
			event.TurnCompleted = &conversation.TrajectoryTurnCompleted{}
		}),
		controlFinalStateEvent(14, workstreamID, []EvaluationConversationTurnState{
			{TurnID: observedID, AuthoredInput: conversation.AuthoredInput{Text: "Update logging."}, Delivery: conversation.TurnDeliveryNormal, Status: conversation.TurnStatusCancelled},
			{TurnID: queuedID, AuthoredInput: conversation.AuthoredInput{Text: "Queue version."}, Delivery: conversation.TurnDeliveryQueued, Status: conversation.TurnStatusCompleted},
		}),
	}
	events[7].TriggerObserved.QueueTurnIDs = []string{queuedID}
	return controlScenarioEvents(ScenarioVerifierQueueThenCancel, events)
}

func controlUserEvent(
	sequence int,
	stepIndex int,
	trigger *ScenarioTrigger,
	text string,
) EvaluationEvent {
	return EvaluationEvent{
		ScenarioID: "",
		Sequence:   sequence,
		Kind:       EvaluationEventUserSubmission,
		UserSubmission: &EvaluationUserSubmission{
			StepIndex: stepIndex,
			Trigger:   trigger,
			Text:      text,
		},
	}
}

func controlReceiptEvent(
	sequence int,
	stepIndex int,
	tool string,
	workstreamID string,
) EvaluationEvent {
	receipt := director.DirectorReceipt{Submit: &director.DirectorTurnReceipt{ToolCalls: []director.DirectorToolCall{}}}
	if tool != "" {
		receipt.Submit.ToolCalls = append(receipt.Submit.ToolCalls, director.DirectorToolCall{
			Tool: tool, Succeeded: true, WorkstreamID: &workstreamID,
		})
	}
	return EvaluationEvent{
		Sequence: sequence,
		Kind:     EvaluationEventDirectorReceipt,
		DirectorReceipt: &EvaluationDirectorReceipt{
			StepIndex: stepIndex,
			Receipt:   receipt,
		},
	}
}

func controlTriggerEvent(
	sequence int,
	stepIndex int,
	trigger ScenarioTrigger,
	workstreamID string,
	conversationID string,
	observedID string,
	status *conversation.TurnStatus,
) EvaluationEvent {
	observation := EvaluationTriggerObservation{
		StepIndex:          stepIndex,
		Trigger:            trigger,
		QueueTurnIDs:       []string{},
		ObservedTurnStatus: status,
	}
	if workstreamID != "" {
		observation.WorkstreamID = &workstreamID
	}
	if conversationID != "" {
		observation.ConversationID = &conversationID
	}
	if observedID != "" {
		observation.ObservedTurnID = &observedID
	}
	if trigger == ScenarioTriggerFirstWorkspaceMutation {
		observation.WorkspaceMutationCount = 1
	}
	return EvaluationEvent{
		Sequence:        sequence,
		Kind:            EvaluationEventTriggerObserved,
		TriggerObserved: &observation,
	}
}

func controlTrajectoryEvent(
	sequence int,
	turnID string,
	kind conversation.TrajectoryEventKind,
	populate func(*conversation.TrajectoryEvent),
) EvaluationEvent {
	trajectory := conversation.TrajectoryEvent{TurnID: &turnID, Kind: kind}
	populate(&trajectory)
	return EvaluationEvent{
		Sequence:   sequence,
		Kind:       EvaluationEventTrajectory,
		Trajectory: &trajectory,
	}
}

func controlFinalStateEvent(
	sequence int,
	workstreamID string,
	turns []EvaluationConversationTurnState,
) EvaluationEvent {
	return EvaluationEvent{
		Sequence: sequence,
		Kind:     EvaluationEventConversationState,
		ConversationState: &EvaluationConversationState{
			WorkstreamID:   workstreamID,
			ConversationID: "conversation-eval",
			Turns:          turns,
			QueueTurnIDs:   []string{},
		},
	}
}

func triggerPointer(trigger ScenarioTrigger) *ScenarioTrigger {
	value := trigger
	return &value
}

func controlScenarioEvents(scenarioID string, events []EvaluationEvent) []EvaluationEvent {
	for index := range events {
		events[index].ScenarioID = scenarioID
	}
	return events
}
