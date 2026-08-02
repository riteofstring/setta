package evalharness

import (
	"context"
	"fmt"
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
				for index := range events {
					if events[index].TriggerObserved != nil {
						events[index].TriggerObserved.WorkstreamID = &other
						return
					}
				}
			},
		},
		{
			name:     "clarification started replacement work",
			scenario: controlTestGenuineAmbiguityScenario(),
			events:   genuineAmbiguityControlEvents(),
			checks:   []evalverifier.Check{{ID: "ready_route", Passed: true, Detail: "Ready."}},
			mutate: func(events []EvaluationEvent) {
				for index := range events {
					receipt := events[index].DirectorReceipt
					if receipt == nil || receipt.StepIndex != 1 {
						continue
					}
					workstreamID := "workstream-eval"
					receipt.Receipt.Submit.ToolCalls = append(
						receipt.Receipt.Submit.ToolCalls,
						director.DirectorToolCall{
							Tool: "submit_work", Succeeded: true, WorkstreamID: &workstreamID,
						},
					)
					return
				}
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

func TestNoMutationBeforeReplyUsesWorkspaceEvidenceForCompletedCommands(t *testing.T) {
	scenario := controlTestGenuineAmbiguityScenario()
	events := genuineAmbiguityControlEvents()
	for index := range events {
		if events[index].Sequence < 4 {
			continue
		}
		switch events[index].Kind {
		case EvaluationEventUserSubmission:
			events[index].UserSubmission.Workspace = testWorkspaceObservation(1)
		case EvaluationEventTriggerObserved:
			events[index].TriggerObserved.Workspace = testWorkspaceObservation(1)
		case EvaluationEventTrajectory:
			events[index].TrajectoryWorkspace = testWorkspaceObservationPointer(1)
		case EvaluationEventConversationState:
			events[index].ConversationState.Workspace = testWorkspaceObservation(1)
		}
	}
	verification := evalverifier.NewResult(
		scenario.Verifier,
		[]evalverifier.Check{{ID: "ready_route", Passed: true, Detail: "Ready."}},
		[]string{},
	)
	result, err := buildScenarioControlResult(
		scenario,
		ScenarioExecutionCompleted,
		events,
		&verification,
		nil,
	)
	if err != nil {
		t.Fatalf("build control result: %v", err)
	}
	for _, assertion := range result.Assertions {
		if assertion.Assertion == ScenarioControlNoMutationBeforeReply {
			if assertion.Passed {
				t.Fatal("completed command workspace mutation passed no-mutation assertion")
			}
			return
		}
	}
	t.Fatal("no-mutation assertion was omitted")
}

func TestNoMutationAfterCancelRejectsMutationAfterObservedInterruption(t *testing.T) {
	scenario := controlTestQueueScenario()
	events := queueControlEvents()
	for index := range events {
		if events[index].Sequence < 12 {
			continue
		}
		switch events[index].Kind {
		case EvaluationEventTrajectory:
			events[index].TrajectoryWorkspace = testWorkspaceObservationPointer(1)
		case EvaluationEventConversationState:
			events[index].ConversationState.Workspace = testWorkspaceObservation(1)
		}
	}
	verification := evalverifier.NewResult(
		scenario.Verifier,
		[]evalverifier.Check{{ID: "version_route", Passed: true, Detail: "Version."}},
		[]string{},
	)
	result, err := buildScenarioControlResult(
		scenario,
		ScenarioExecutionCompleted,
		events,
		&verification,
		nil,
	)
	if err != nil {
		t.Fatalf("build control result: %v", err)
	}
	for _, assertion := range result.Assertions {
		if assertion.Assertion == ScenarioControlNoMutationAfterCancel {
			if assertion.Passed {
				t.Fatal("post-cancel workspace mutation passed no-mutation assertion")
			}
			return
		}
	}
	t.Fatal("post-cancel no-mutation assertion was omitted")
}

func TestNoMutationAfterCancelStartsAtObservedInterruption(t *testing.T) {
	scenario := controlTestQueueScenario()
	events := queueControlEvents()
	// The cancellation submission observes revision 0. A legitimate write lands
	// before the interruption is observed at revision 1, which then remains
	// unchanged through queued-work promotion.
	for index := range events {
		if events[index].Sequence < 11 {
			continue
		}
		switch events[index].Kind {
		case EvaluationEventTrajectory:
			events[index].TrajectoryWorkspace = testWorkspaceObservationPointer(1)
		case EvaluationEventConversationState:
			events[index].ConversationState.Workspace = testWorkspaceObservation(1)
		}
	}
	verification := evalverifier.NewResult(
		scenario.Verifier,
		[]evalverifier.Check{{ID: "version_route", Passed: true, Detail: "Version."}},
		[]string{},
	)
	result, err := buildScenarioControlResult(
		scenario,
		ScenarioExecutionCompleted,
		events,
		&verification,
		nil,
	)
	if err != nil {
		t.Fatalf("build control result: %v", err)
	}
	for _, assertion := range result.Assertions {
		if assertion.Assertion == ScenarioControlNoMutationAfterCancel {
			if !assertion.Passed {
				t.Fatal("mutation before observed interruption failed no-mutation assertion")
			}
			return
		}
	}
	t.Fatal("post-cancel no-mutation assertion was omitted")
}

func TestConversationStateObservesConversationAndWorkspaceTriggers(t *testing.T) {
	observedID := "turn-observed"
	queuedID := "turn-queued"
	state := &evaluationConversationState{
		workspace: testWorkspaceObservation(1),
		snapshot: conversation.ConversationSnapshot{
			Conversation: conversation.TopicConversation{ID: "conversation-eval"},
			Turns: conversation.ConversationTurnWindow{Turns: []conversation.ConversationTurn{
				{ID: observedID, Status: conversation.TurnStatusRunning},
				{ID: queuedID, Status: conversation.TurnStatusQueued},
			}},
			Queue: []conversation.QueuedConversationTurn{{TurnID: queuedID}},
			Trajectory: conversation.ConversationTrajectoryWindow{Events: []conversation.TrajectoryEvent{
				{
					TurnID: &observedID,
					Kind:   conversation.TrajectoryEventApprovalRequested,
					ApprovalRequested: &conversation.TrajectoryApprovalRequested{Approval: conversation.TrajectoryApprovalRequest{
						ID:   "approval-input",
						Kind: conversation.TrajectoryApprovalKindStructuredInput,
						Questions: []conversation.TrajectoryApprovalQuestion{{
							ID: "question-input", Question: "Which contract should be used?",
						}},
					}},
				},
			}},
		},
	}
	for _, trigger := range []ScenarioTrigger{
		ScenarioTriggerAgentUserInputRequested,
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

func TestConversationStateReplaysTruncatedSnapshotHistoryFromStreamStart(t *testing.T) {
	conversationID := "conversation-eval"
	streamID, err := conversation.ConversationStreamID(conversationID)
	if err != nil {
		t.Fatalf("build conversation stream ID: %v", err)
	}
	target := conversation.ConversationEventCursor{StreamID: streamID, Sequence: 2}
	snapshot := conversation.ConversationSnapshot{
		Conversation: conversation.TopicConversation{ID: conversationID},
		Trajectory: conversation.ConversationTrajectoryWindow{
			Events:     []conversation.TrajectoryEvent{{Sequence: 2}},
			HasEarlier: true,
		},
		EventCursor: target,
	}
	events := make(chan conversation.ConversationEvent, target.Sequence)
	for sequence := 1; sequence <= target.Sequence; sequence++ {
		events <- conversation.ConversationEvent{
			StreamID: streamID,
			Sequence: sequence,
			Payload: &conversation.ConversationTrajectoryAppendedEventPayload{
				Type:  conversation.ConversationEventTypeTrajectoryAppended,
				Event: conversation.TrajectoryEvent{Sequence: sequence},
			},
		}
	}
	close(events)
	errors := make(chan error)
	close(errors)
	state, err := newEvaluationConversationState(snapshot, &EventStream[conversation.ConversationEvent]{
		events: events,
		errors: errors,
	}, nil)
	if err != nil {
		t.Fatalf("create conversation state: %v", err)
	}
	if err := state.replayThrough(context.Background(), target); err != nil {
		t.Fatalf("replay conversation event history: %v", err)
	}
	if got := len(state.snapshot.Trajectory.Events); got != target.Sequence {
		t.Fatalf("replayed trajectory events = %d, want %d", got, target.Sequence)
	}
	if state.snapshot.Trajectory.HasEarlier {
		t.Fatal("complete replayed history was marked as truncated")
	}
	for index, event := range state.snapshot.Trajectory.Events {
		if event.Sequence != index+1 {
			t.Fatalf("replayed trajectory sequence[%d] = %d, want %d", index, event.Sequence, index+1)
		}
	}
	if state.snapshot.EventCursor != target {
		t.Fatalf("replayed cursor = %+v, want %+v", state.snapshot.EventCursor, target)
	}
}

func controlTestGenuineAmbiguityScenario() Scenario {
	return controlTestScenario(
		ScenarioVerifierGenuineAmbiguity,
		[]ScenarioStep{
			{Kind: ScenarioStepSubmit, Text: "Choose the diagnostics endpoint."},
			{Kind: ScenarioStepSubmitWhen, Trigger: ScenarioTriggerAgentUserInputRequested, Text: "Use readiness."},
		},
		ScenarioClarificationRequiredOnce,
		[]ScenarioControlAssertion{
			ScenarioControlNoMutationBeforeReply,
			ScenarioControlInvestigationBeforeReply,
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
	approvalID := "approval-ready-contract"
	questionID := "ready-contract"
	running := conversation.TurnStatusRunning
	command := "rg -n 'ready|live' docs src"
	cwd := "/workspace"
	trigger := controlTriggerEvent(
		6,
		1,
		ScenarioTriggerAgentUserInputRequested,
		workstreamID,
		"conversation-eval",
		turnID,
		&running,
	)
	trigger.TriggerObserved.ObservedApprovalID = &approvalID
	return controlScenarioEvents(ScenarioVerifierGenuineAmbiguity, []EvaluationEvent{
		controlUserEvent(1, 0, nil, "Choose the diagnostics endpoint."),
		controlReceiptEvent(2, 0, "create_workstream", workstreamID),
		controlTrajectoryEvent(3, turnID, conversation.TrajectoryEventUserInputAccepted, func(event *conversation.TrajectoryEvent) {
			event.UserInputAccepted = &conversation.TrajectoryUserInputAccepted{
				Input:    conversation.AuthoredInput{Text: "Choose and implement the diagnostics endpoint."},
				Delivery: conversation.TurnDeliveryNormal,
			}
		}),
		controlTrajectoryEvent(4, turnID, conversation.TrajectoryEventActivityCompleted, func(event *conversation.TrajectoryEvent) {
			event.ActivityCompleted = &conversation.TrajectoryActivityCompleted{
				Activity: conversation.TrajectoryActivity{
					ID: "activity-inspect-contract", Kind: conversation.TrajectoryActivityCommand,
					Title: "Inspect diagnostics conventions", Command: &command, CWD: &cwd,
				},
				Summary: "Inspected the repository's diagnostics contracts.",
			}
		}),
		controlTrajectoryEvent(5, turnID, conversation.TrajectoryEventApprovalRequested, func(event *conversation.TrajectoryEvent) {
			event.ApprovalRequested = &conversation.TrajectoryApprovalRequested{Approval: conversation.TrajectoryApprovalRequest{
				ID: approvalID, Kind: conversation.TrajectoryApprovalKindStructuredInput,
				Questions: []conversation.TrajectoryApprovalQuestion{{
					ID: questionID, Question: "Should the deployment monitor use liveness or readiness?",
				}},
			}}
		}),
		trigger,
		controlUserEvent(7, 1, triggerPointer(ScenarioTriggerAgentUserInputRequested), "Use readiness."),
		controlReceiptEvent(8, 1, "resolve_approval", workstreamID),
		controlTrajectoryEvent(9, turnID, conversation.TrajectoryEventApprovalResolved, func(event *conversation.TrajectoryEvent) {
			event.ApprovalResolved = &conversation.TrajectoryApprovalResolved{Resolution: conversation.TrajectoryApprovalResolution{
				ApprovalID: approvalID,
				Decision:   conversation.TrajectoryApprovalDecisionAnswered,
				Answers: []conversation.ConversationApprovalAnswer{{
					QuestionID: questionID, Answers: []string{"Use readiness."},
				}},
			}}
		}),
		controlFinalStateEvent(10, workstreamID, []EvaluationConversationTurnState{{
			TurnID: turnID, AuthoredInput: conversation.AuthoredInput{Text: "Choose and implement the diagnostics endpoint."},
			Delivery: conversation.TurnDeliveryNormal, Status: conversation.TurnStatusCompleted,
		}}),
	})
}

func steeringControlEvents() []EvaluationEvent {
	workstreamID := "workstream-eval"
	turnID := "turn-health"
	running := conversation.TurnStatusRunning
	events := []EvaluationEvent{
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
			TurnID: turnID, AuthoredInput: conversation.AuthoredInput{Text: "Implement the service health route."},
			Delivery: conversation.TurnDeliveryNormal, Status: conversation.TurnStatusCompleted,
		}}),
	}
	events[2].TrajectoryWorkspace = testWorkspaceObservationPointer(1)
	events[3].TriggerObserved.Workspace = testWorkspaceObservation(1)
	events[4].UserSubmission.Workspace = testWorkspaceObservation(1)
	events[6].ConversationState.Workspace = testWorkspaceObservation(1)
	return controlScenarioEvents(ScenarioVerifierMidRunSteering, events)
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
				Input:    conversation.AuthoredInput{Text: "After logging, add a package-version endpoint."},
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
			{TurnID: observedID, AuthoredInput: conversation.AuthoredInput{Text: "Include method and path in request logs."}, Delivery: conversation.TurnDeliveryNormal, Status: conversation.TurnStatusCancelled},
			{TurnID: queuedID, AuthoredInput: conversation.AuthoredInput{Text: "After logging, add a package-version endpoint."}, Delivery: conversation.TurnDeliveryQueued, Status: conversation.TurnStatusCompleted},
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
			Workspace: testWorkspaceObservation(0),
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
		Workspace:          testWorkspaceObservation(0),
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
		observation.Workspace = testWorkspaceObservation(1)
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
		Sequence:            sequence,
		Kind:                EvaluationEventTrajectory,
		Trajectory:          &trajectory,
		TrajectoryWorkspace: testWorkspaceObservationPointer(0),
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
			Workspace:      testWorkspaceObservation(0),
		},
	}
}

func testWorkspaceObservation(revision int) EvaluationWorkspaceObservation {
	return EvaluationWorkspaceObservation{
		Digest:   fmt.Sprintf("%064x", revision+1),
		Revision: revision,
	}
}

func testWorkspaceObservationPointer(revision int) *EvaluationWorkspaceObservation {
	observation := testWorkspaceObservation(revision)
	return &observation
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
