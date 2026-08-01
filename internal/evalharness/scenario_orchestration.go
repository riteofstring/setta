package evalharness

import (
	"context"
	"fmt"
	"time"

	"setta/internal/conversation"
	"setta/internal/director"
)

type scenarioBehaviorFailure struct {
	outcome ScenarioExecutionOutcome
	code    string
	message string
}

func orchestrateEvaluationScenario(
	ctx context.Context,
	client *BackendClient,
	directorEvents *EventStream[director.DirectorEvent],
	scenario Scenario,
	observation Phase1HTTPObservation,
) (Phase1HTTPObservation, error) {
	observation, workingStepIndex, err := prepareEvaluationWorkingSubmission(
		ctx,
		client,
		scenario,
		observation,
	)
	if err != nil {
		return observation, err
	}
	if observation.ExecutionOutcome != "" {
		return observation, nil
	}
	workingReceipt := observation.submissions[workingStepIndex].receipt
	workstreamID, code, message := evaluationWorkingReceiptWorkstream(workingReceipt)
	if code != "" {
		return scenarioBehaviorObservation(
			observation,
			missingEvaluationWorkOutcome(scenario, workingStepIndex),
			code,
			message,
		)
	}
	if behavior := validateClarificationWorkstream(observation.triggers, workstreamID); behavior != nil {
		return scenarioBehaviorObservation(observation, behavior.outcome, behavior.code, behavior.message)
	}
	observation.WorkstreamID = workstreamID
	workstream, workstreamEvent, err := awaitPhase1Workstream(ctx, directorEvents, workstreamID)
	if err != nil {
		return observation, err
	}
	observation.directorEvents = append(observation.directorEvents, workstreamEvent)
	if !evaluationWorkstreamTargetsWorkspace(workstream, observation.WorkspaceID) {
		return scenarioBehaviorObservation(
			observation,
			ScenarioExecutionFailed,
			"director_routed_outside_fixture",
			"Director did not bind the observed workstream to the opened fixture workspace",
		)
	}
	observation.ConversationID = workstream.ConversationID
	return orchestrateEvaluationConversation(
		ctx,
		client,
		scenario,
		workingStepIndex,
		observation,
	)
}

func prepareEvaluationWorkingSubmission(
	ctx context.Context,
	client *BackendClient,
	scenario Scenario,
	observation Phase1HTTPObservation,
) (Phase1HTTPObservation, int, error) {
	observation, err := dispatchEvaluationStep(ctx, client, scenario, 0, observation)
	if err != nil {
		return observation, 0, err
	}
	if !scenarioHasDirectorCompletionTrigger(scenario) {
		return observation, 0, nil
	}
	observation, err = observeDirectorCompletionTrigger(ctx, client, scenario, observation)
	if err != nil || observation.ExecutionOutcome != "" {
		return observation, 1, err
	}
	observation, err = dispatchEvaluationStep(ctx, client, scenario, 1, observation)
	return observation, 1, err
}

func missingEvaluationWorkOutcome(
	scenario Scenario,
	workingStepIndex int,
) ScenarioExecutionOutcome {
	if workingStepIndex > 0 || scenario.Expect.Clarification == ScenarioClarificationForbidden {
		return ScenarioExecutionControlFailed
	}
	return ScenarioExecutionFailed
}

func evaluationWorkstreamTargetsWorkspace(workstream director.Workstream, workspaceID string) bool {
	return workstream.ResourceScope.Kind == director.WorkstreamResourceScopeFolder &&
		workstream.ResourceScope.Folder != nil &&
		workstream.ResourceScope.Folder.WorkspaceID == workspaceID
}

func dispatchEvaluationStep(
	ctx context.Context,
	client *BackendClient,
	scenario Scenario,
	stepIndex int,
	observation Phase1HTTPObservation,
) (Phase1HTTPObservation, error) {
	if stepIndex != len(observation.submissions) || stepIndex < 0 || stepIndex >= len(scenario.Steps) {
		return observation, fmt.Errorf("dispatch evaluation step %d out of order", stepIndex)
	}
	submittedAt := time.Now().UTC()
	receipt, err := client.DispatchDirectorIntent(ctx, phase1SubmitIntent(scenario.Steps[stepIndex].Text))
	receivedAt := time.Now().UTC()
	if err != nil {
		return observation, err
	}
	observation.submissions = append(observation.submissions, scenarioSubmissionObservation{
		stepIndex:   stepIndex,
		submittedAt: submittedAt,
		receivedAt:  receivedAt,
		receipt:     receipt,
	})
	if receipt.Submit != nil {
		observation.ResolvedInvocations = append(
			observation.ResolvedInvocations,
			receipt.Submit.ResolvedInvocations...,
		)
	}
	return observation, nil
}

func scenarioHasDirectorCompletionTrigger(scenario Scenario) bool {
	return len(scenario.Steps) > 1 &&
		scenario.Steps[1].Trigger == ScenarioTriggerDirectorTurnCompleted
}

func observeDirectorCompletionTrigger(
	ctx context.Context,
	client *BackendClient,
	scenario Scenario,
	observation Phase1HTTPObservation,
) (Phase1HTTPObservation, error) {
	snapshot, err := client.ReadDirectorSnapshot(ctx)
	if err != nil {
		return observation, err
	}
	trigger, failure := directorCompletionTriggerObservation(
		observation.WorkspaceID,
		snapshot,
	)
	if failure != nil {
		return scenarioBehaviorObservation(
			observation,
			failure.outcome,
			failure.code,
			failure.message,
		)
	}
	observation.triggers = append(observation.triggers, evaluationTriggerCandidate{
		observation: trigger,
		observedAt:  time.Now().UTC(),
	})
	return observation, nil
}

func directorCompletionTriggerObservation(
	workspaceID string,
	snapshot director.DirectorSnapshot,
) (EvaluationTriggerObservation, *scenarioBehaviorFailure) {
	if directorSnapshotHasExtraWorkstreams(snapshot) {
		return EvaluationTriggerObservation{}, controlBehaviorFailure(
			"clarification_started_multiple_workstreams",
			"Director created more than one workstream before the scripted clarification reply",
		)
	}
	if directorSnapshotHasAgentWork(snapshot) {
		return EvaluationTriggerObservation{}, controlBehaviorFailure(
			"clarification_started_agent_work",
			"Director started or queued Agent work before the scripted clarification reply",
		)
	}
	observation := EvaluationTriggerObservation{
		StepIndex:    1,
		Trigger:      ScenarioTriggerDirectorTurnCompleted,
		QueueTurnIDs: []string{},
	}
	if len(snapshot.Workstreams) == 1 {
		workstream := snapshot.Workstreams[0].Workstream
		if directorWorkstreamHasAgentWork(workstream) {
			return EvaluationTriggerObservation{}, controlBehaviorFailure(
				"clarification_started_agent_work",
				"Director started or queued Agent work before the scripted clarification reply",
			)
		}
		if directorClarificationOutsideWorkspace(workstream, workspaceID) {
			return EvaluationTriggerObservation{}, controlBehaviorFailure(
				"clarification_routed_outside_fixture",
				"Director created clarification context outside the opened fixture workspace",
			)
		}
		observation.WorkstreamID = evaluationStringPointer(workstream.ID)
		observation.ConversationID = evaluationStringPointer(workstream.ConversationID)
	}
	if err := observation.Validate(); err != nil {
		return EvaluationTriggerObservation{}, &scenarioBehaviorFailure{
			outcome: ScenarioExecutionInfrastructureFailed,
			code:    "trigger_evidence_invalid",
			message: boundedResultDiagnostic(err.Error()),
		}
	}
	return observation, nil
}

func directorSnapshotHasExtraWorkstreams(snapshot director.DirectorSnapshot) bool {
	return snapshot.HasMoreWorkstreams ||
		snapshot.Aggregates.WorkstreamCount != len(snapshot.Workstreams) ||
		len(snapshot.Workstreams) > 1
}

func directorSnapshotHasAgentWork(snapshot director.DirectorSnapshot) bool {
	return snapshot.Aggregates.RunningCount != 0 || snapshot.Aggregates.QueuedCount != 0
}

func directorWorkstreamHasAgentWork(workstream director.Workstream) bool {
	return workstream.ActiveRunID != nil || workstream.QueuedRunCount != 0
}

func directorClarificationOutsideWorkspace(
	workstream director.Workstream,
	workspaceID string,
) bool {
	return workstream.ResourceScope.Kind == director.WorkstreamResourceScopeFolder &&
		(workstream.ResourceScope.Folder == nil ||
			workstream.ResourceScope.Folder.WorkspaceID != workspaceID)
}

func evaluationWorkingReceiptWorkstream(
	receipt director.DirectorReceipt,
) (string, string, string) {
	workstreamID, code, message := phase1ReceiptWorkstream(receipt)
	if code != "" {
		return "", code, message
	}
	for _, call := range receipt.Submit.ToolCalls {
		if call.Succeeded && call.WorkstreamID != nil &&
			(call.Tool == "create_workstream" || call.Tool == "submit_work") {
			return workstreamID, "", ""
		}
	}
	return "", "director_did_not_start_work", "Director completed its turn without starting fixture work"
}

func validateClarificationWorkstream(
	triggers []evaluationTriggerCandidate,
	workstreamID string,
) *scenarioBehaviorFailure {
	for _, trigger := range triggers {
		if trigger.observation.Trigger != ScenarioTriggerDirectorTurnCompleted ||
			trigger.observation.WorkstreamID == nil {
			continue
		}
		if *trigger.observation.WorkstreamID != workstreamID {
			return controlBehaviorFailure(
				"clarification_changed_workstream",
				"Director started the clarified request in a different workstream from its clarification context",
			)
		}
	}
	return nil
}

func orchestrateEvaluationConversation(
	ctx context.Context,
	client *BackendClient,
	scenario Scenario,
	workingStepIndex int,
	observation Phase1HTTPObservation,
) (Phase1HTTPObservation, error) {
	snapshot, err := client.ReadConversationSnapshot(
		ctx,
		observation.WorkspaceID,
		observation.ConversationID,
	)
	if err != nil {
		return observation, err
	}
	turn, failure := evaluationObservedTurn(
		snapshot,
		scenario.Steps[workingStepIndex].Text,
		missingEvaluationWorkOutcome(scenario, workingStepIndex),
	)
	if failure != nil {
		return scenarioBehaviorObservation(
			observation,
			failure.outcome,
			failure.code,
			failure.message,
		)
	}
	observation.ObservedTurnID = turn.ID
	observation.TurnID = turn.ID
	conversationEvents, err := client.SubscribeConversationEvents(
		ctx,
		observation.WorkspaceID,
		observation.ConversationID,
		snapshot.EventCursor,
	)
	if err != nil {
		return observation, err
	}
	defer conversationEvents.Close()
	state := newEvaluationConversationState(snapshot, conversationEvents)
	observation, queuedTurnID, err := orchestrateTriggeredEvaluationSteps(
		ctx,
		client,
		state,
		scenario,
		workingStepIndex,
		observation,
	)
	if err != nil || observation.ExecutionOutcome != "" {
		return observation, err
	}
	finalTurn, behavior, err := awaitEvaluationTerminal(
		ctx,
		state,
		observation.ObservedTurnID,
		queuedTurnID,
	)
	if err != nil {
		return observation, err
	}
	if behavior != nil {
		return scenarioBehaviorObservation(
			observation,
			behavior.outcome,
			behavior.code,
			behavior.message,
		)
	}
	return completeEvaluationConversationEvidence(ctx, client, scenario, observation, finalTurn)
}

func orchestrateTriggeredEvaluationSteps(
	ctx context.Context,
	client *BackendClient,
	state *evaluationConversationState,
	scenario Scenario,
	workingStepIndex int,
	observation Phase1HTTPObservation,
) (Phase1HTTPObservation, string, error) {
	queuedTurnID := ""
	for stepIndex := workingStepIndex + 1; stepIndex < len(scenario.Steps); stepIndex++ {
		trigger, behavior, err := awaitEvaluationTrigger(
			ctx,
			state,
			scenario,
			stepIndex,
			observation.WorkstreamID,
			observation.ObservedTurnID,
		)
		if err != nil {
			return observation, queuedTurnID, err
		}
		if behavior != nil {
			failed, failureErr := scenarioBehaviorObservation(
				observation,
				behavior.outcome,
				behavior.code,
				behavior.message,
			)
			return failed, queuedTurnID, failureErr
		}
		observation.triggers = append(observation.triggers, evaluationTriggerCandidate{
			observation: trigger,
			observedAt:  time.Now().UTC(),
		})
		if trigger.Trigger == ScenarioTriggerQueueNonempty {
			queuedTurnID = trigger.QueueTurnIDs[0]
		}
		observation, err = dispatchEvaluationStep(ctx, client, scenario, stepIndex, observation)
		if err != nil {
			return observation, queuedTurnID, err
		}
		if behavior := validateTriggeredDirectorAction(
			scenario.Steps[stepIndex].Trigger,
			observation.WorkstreamID,
			observation.submissions[stepIndex].receipt,
		); behavior != nil {
			failed, failureErr := scenarioBehaviorObservation(
				observation,
				behavior.outcome,
				behavior.code,
				behavior.message,
			)
			return failed, queuedTurnID, failureErr
		}
	}
	return observation, queuedTurnID, nil
}

func completeEvaluationConversationEvidence(
	ctx context.Context,
	client *BackendClient,
	scenario Scenario,
	observation Phase1HTTPObservation,
	finalTurn conversation.ConversationTurn,
) (Phase1HTTPObservation, error) {
	observation.TurnID = finalTurn.ID
	finalSnapshot, err := client.ReadConversationSnapshot(
		ctx,
		observation.WorkspaceID,
		observation.ConversationID,
	)
	if err != nil {
		return observation, err
	}
	observation.finalSnapshotAt = time.Now().UTC()
	observation, err = collectPhase2ConversationEvidence(scenario, observation, finalSnapshot)
	if err != nil {
		return observation, err
	}
	invocations, err := phase1SnapshotInvocations(finalSnapshot)
	if err != nil {
		return observation, err
	}
	observation.ResolvedInvocations = append(observation.ResolvedInvocations, invocations...)
	return phase1TerminalObservation(observation, finalTurn)
}

func evaluationObservedTurn(
	snapshot conversation.ConversationSnapshot,
	text string,
	missingTurnOutcome ScenarioExecutionOutcome,
) (conversation.ConversationTurn, *scenarioBehaviorFailure) {
	if !snapshot.Turns.HasEarlier && len(snapshot.Turns.Turns) == 0 {
		return conversation.ConversationTurn{}, &scenarioBehaviorFailure{
			outcome: missingTurnOutcome,
			code:    "director_did_not_start_agent_turn",
			message: "Director created or selected fixture work without starting an Agent turn",
		}
	}
	if snapshot.Turns.HasEarlier || len(snapshot.Turns.Turns) != 1 {
		return conversation.ConversationTurn{}, &scenarioBehaviorFailure{
			outcome: ScenarioExecutionFailed,
			code:    "director_started_unexpected_agent_turns",
			message: "Director did not start exactly one bounded Agent turn for the fixture request",
		}
	}
	turn := snapshot.Turns.Turns[0]
	if turn.AuthoredInput.Text != text || turn.Delivery != conversation.TurnDeliveryNormal {
		return conversation.ConversationTurn{}, &scenarioBehaviorFailure{
			outcome: ScenarioExecutionFailed,
			code:    "director_delivered_unexpected_agent_input",
			message: "Director did not deliver the exact scripted fixture request as one normal Agent turn",
		}
	}
	return turn, nil
}

func awaitEvaluationTrigger(
	ctx context.Context,
	state *evaluationConversationState,
	scenario Scenario,
	stepIndex int,
	workstreamID string,
	observedTurnID string,
) (EvaluationTriggerObservation, *scenarioBehaviorFailure, error) {
	trigger := scenario.Steps[stepIndex].Trigger
	for {
		turn, found := state.turn(observedTurnID)
		if !found {
			return EvaluationTriggerObservation{}, nil, fmt.Errorf(
				"observed Agent turn %s disappeared",
				observedTurnID,
			)
		}
		if behavior := duplicateQueueTriggerFailure(trigger, state); behavior != nil {
			return EvaluationTriggerObservation{}, behavior, nil
		}
		observation, ready, err := state.triggerObservation(
			stepIndex,
			trigger,
			workstreamID,
			observedTurnID,
		)
		if err != nil {
			return EvaluationTriggerObservation{}, nil, err
		}
		if ready {
			return observation, validateReadyEvaluationTrigger(state, scenario, stepIndex, observation), nil
		}
		if phase1TurnTerminal(turn.Status) {
			return EvaluationTriggerObservation{}, controlBehaviorFailure(
				"trigger_missed_active_run",
				fmt.Sprintf("observed Agent turn became %s before trigger %s", turn.Status, trigger),
			), nil
		}
		if err := state.next(ctx); err != nil {
			return EvaluationTriggerObservation{}, nil, err
		}
	}
}

func duplicateQueueTriggerFailure(
	trigger ScenarioTrigger,
	state *evaluationConversationState,
) *scenarioBehaviorFailure {
	if trigger == ScenarioTriggerQueueNonempty && len(state.snapshot.Queue) > 1 {
		return controlBehaviorFailure(
			"queued_request_duplicated",
			"Director queued the follow-up request more than once",
		)
	}
	return nil
}

func validateReadyEvaluationTrigger(
	state *evaluationConversationState,
	scenario Scenario,
	stepIndex int,
	observation EvaluationTriggerObservation,
) *scenarioBehaviorFailure {
	if observation.Trigger != ScenarioTriggerQueueNonempty {
		return nil
	}
	queued, found := state.turn(observation.QueueTurnIDs[0])
	wantText := scenario.Steps[stepIndex-1].Text
	if found && queued.AuthoredInput.Text == wantText &&
		queued.Delivery == conversation.TurnDeliveryQueued &&
		queued.Status == conversation.TurnStatusQueued {
		return nil
	}
	return controlBehaviorFailure(
		"queued_request_not_preserved",
		"The exact follow-up request was not present once in the queue behind the observed run",
	)
}

func validateTriggeredDirectorAction(
	trigger ScenarioTrigger,
	workstreamID string,
	receipt director.DirectorReceipt,
) *scenarioBehaviorFailure {
	wantTool := map[ScenarioTrigger]string{
		ScenarioTriggerFirstWorkspaceMutation: "steer_work",
		ScenarioTriggerAgentTurnRunning:       "submit_work",
		ScenarioTriggerQueueNonempty:          "cancel_run",
	}[trigger]
	if wantTool == "" {
		return controlBehaviorFailure(
			"triggered_director_action_unsupported",
			fmt.Sprintf("No Director action is defined for trigger %s", trigger),
		)
	}
	matched := 0
	for _, call := range receipt.Submit.ToolCalls {
		if call.Succeeded && call.Tool == wantTool && call.WorkstreamID != nil &&
			*call.WorkstreamID == workstreamID {
			matched++
		}
		if call.Succeeded && call.WorkstreamID != nil && *call.WorkstreamID != workstreamID {
			return controlBehaviorFailure(
				"follow_up_routed_to_other_workstream",
				"Director routed a scripted follow-up outside the observed fixture workstream",
			)
		}
	}
	if matched != 1 {
		return controlBehaviorFailure(
			"triggered_director_action_missing",
			fmt.Sprintf("Director used %s %d times for the scripted follow-up, want exactly once", wantTool, matched),
		)
	}
	return nil
}

func awaitEvaluationTerminal(
	ctx context.Context,
	state *evaluationConversationState,
	observedTurnID string,
	queuedTurnID string,
) (conversation.ConversationTurn, *scenarioBehaviorFailure, error) {
	if queuedTurnID != "" {
		return awaitQueuedEvaluationTerminal(ctx, state, observedTurnID, queuedTurnID)
	}
	return awaitSingleEvaluationTerminal(ctx, state, observedTurnID)
}

func awaitSingleEvaluationTerminal(
	ctx context.Context,
	state *evaluationConversationState,
	turnID string,
) (conversation.ConversationTurn, *scenarioBehaviorFailure, error) {
	for {
		turn, found := state.turn(turnID)
		if !found {
			return conversation.ConversationTurn{}, nil, fmt.Errorf("observed Agent turn %s disappeared", turnID)
		}
		if phase1TurnTerminal(turn.Status) &&
			(turn.Status != conversation.TurnStatusCompleted || phase1NarrationSettled(state.snapshot, turn.ID)) {
			return turn, nil, nil
		}
		if err := state.next(ctx); err != nil {
			return conversation.ConversationTurn{}, nil, err
		}
	}
}

func awaitQueuedEvaluationTerminal(
	ctx context.Context,
	state *evaluationConversationState,
	observedTurnID string,
	queuedTurnID string,
) (conversation.ConversationTurn, *scenarioBehaviorFailure, error) {
	for {
		observed, found := state.turn(observedTurnID)
		if !found {
			return conversation.ConversationTurn{}, nil, fmt.Errorf("observed Agent turn %s disappeared", observedTurnID)
		}
		if behavior := observedQueueCancellationFailure(observed); behavior != nil {
			return conversation.ConversationTurn{}, behavior, nil
		}
		queued, found := state.turn(queuedTurnID)
		if !found {
			return conversation.ConversationTurn{}, nil, fmt.Errorf("queued Agent turn %s disappeared", queuedTurnID)
		}
		if queued.Status == conversation.TurnStatusCancelled {
			return conversation.ConversationTurn{}, controlBehaviorFailure(
				"queued_request_cancelled",
				"Director cancellation stopped the queued request instead of preserving it",
			), nil
		}
		if queued.Status == conversation.TurnStatusFailed || queuedEvaluationSettled(state, observed, queued) {
			return queued, nil, nil
		}
		if err := state.next(ctx); err != nil {
			return conversation.ConversationTurn{}, nil, err
		}
	}
}

func observedQueueCancellationFailure(
	observed conversation.ConversationTurn,
) *scenarioBehaviorFailure {
	switch observed.Status {
	case conversation.TurnStatusCompleted, conversation.TurnStatusFailed:
		return controlBehaviorFailure(
			"observed_run_not_cancelled",
			fmt.Sprintf("observed logging run became %s instead of cancelled", observed.Status),
		)
	default:
		return nil
	}
}

func queuedEvaluationSettled(
	state *evaluationConversationState,
	observed conversation.ConversationTurn,
	queued conversation.ConversationTurn,
) bool {
	return queued.Status == conversation.TurnStatusCompleted &&
		observed.Status == conversation.TurnStatusCancelled &&
		len(state.snapshot.Queue) == 0 &&
		phase1NarrationSettled(state.snapshot, queued.ID)
}

func controlBehaviorFailure(code string, message string) *scenarioBehaviorFailure {
	return &scenarioBehaviorFailure{
		outcome: ScenarioExecutionControlFailed,
		code:    code,
		message: message,
	}
}

func scenarioBehaviorObservation(
	observation Phase1HTTPObservation,
	outcome ScenarioExecutionOutcome,
	code string,
	message string,
) (Phase1HTTPObservation, error) {
	return phase1FailureObservation(observation, outcome, code, message)
}
