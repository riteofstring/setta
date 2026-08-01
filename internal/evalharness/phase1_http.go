package evalharness

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"setta/internal/conversation"
	"setta/internal/director"
)

type Phase1HTTPObservation struct {
	WorkspaceID        string
	WorkstreamID       string
	ConversationID     string
	TurnID             string
	Roles              []EvaluatedRoleConfiguration
	ExecutionOutcome   ScenarioExecutionOutcome
	ScenarioDiagnostic *ScenarioDiagnostic
}

// RunPhase1ScenarioOverHTTP drives one validated Phase 1 scenario through the
// same authenticated endpoints and pushed event streams as the product. Docker
// ownership and hidden verification wrap this boundary in the vertical runner;
// neither is replaced with an eval-only service call here.
func RunPhase1ScenarioOverHTTP(
	ctx context.Context,
	client *BackendClient,
	scenario Scenario,
	workspaceRoot string,
) (Phase1HTTPObservation, error) {
	if ctx == nil {
		return Phase1HTTPObservation{}, errors.New("Phase 1 scenario context is required")
	}
	if client == nil {
		return Phase1HTTPObservation{}, errors.New("Phase 1 backend client is required")
	}
	if err := validatePhase1HTTPScenario(scenario); err != nil {
		return Phase1HTTPObservation{}, err
	}
	root, err := validatePhase1WorkspaceRoot(workspaceRoot)
	if err != nil {
		return Phase1HTTPObservation{}, err
	}
	scenarioCtx, cancel := context.WithTimeout(
		ctx,
		time.Duration(scenario.TimeoutSeconds)*time.Second,
	)
	defer cancel()
	observation, runErr := runPhase1ScenarioOverHTTP(scenarioCtx, client, scenario, root)
	if runErr == nil {
		return observation, nil
	}
	if ctx.Err() != nil {
		return Phase1HTTPObservation{}, ctx.Err()
	}
	if errors.Is(scenarioCtx.Err(), context.DeadlineExceeded) {
		return phase1FailureObservation(
			observation,
			ScenarioExecutionTimedOut,
			"scenario_timeout",
			fmt.Sprintf("scenario exceeded its %d-second runaway ceiling", scenario.TimeoutSeconds),
		)
	}
	return phase1FailureObservation(
		observation,
		ScenarioExecutionInfrastructureFailed,
		"http_or_event_boundary_failed",
		boundedResultDiagnostic(runErr.Error()),
	)
}

func runPhase1ScenarioOverHTTP(
	ctx context.Context,
	client *BackendClient,
	scenario Scenario,
	workspaceRoot string,
) (Phase1HTTPObservation, error) {
	observation, directorEvents, err := preparePhase1Scenario(
		ctx,
		client,
		workspaceRoot,
	)
	if err != nil {
		return observation, err
	}
	defer directorEvents.Close()
	observation, finished, err := observePhase1Workstream(
		ctx,
		client,
		directorEvents,
		scenario.Steps[0].Text,
		observation,
	)
	if err != nil || finished {
		return observation, err
	}
	return observePhase1Turn(ctx, client, observation)
}

func preparePhase1Scenario(
	ctx context.Context,
	client *BackendClient,
	workspaceRoot string,
) (Phase1HTTPObservation, *EventStream[director.DirectorEvent], error) {
	opened, err := client.OpenWorkspace(ctx, workspaceRoot)
	if err != nil {
		return Phase1HTTPObservation{}, nil, err
	}
	observation := Phase1HTTPObservation{WorkspaceID: opened.Workspace.ID}
	roles, err := readPhase1RoleConfigurations(ctx, client, observation.WorkspaceID)
	if err != nil {
		return observation, nil, err
	}
	observation.Roles = roles
	directorSnapshot, err := client.ReadDirectorSnapshot(ctx)
	if err != nil {
		return observation, nil, err
	}
	if err := validatePhase1DirectorBaseline(directorSnapshot); err != nil {
		return observation, nil, err
	}
	directorEvents, err := client.SubscribeDirectorEvents(ctx, directorSnapshot.EventCursor)
	if err != nil {
		return observation, nil, err
	}
	return observation, directorEvents, nil
}

func observePhase1Workstream(
	ctx context.Context,
	client *BackendClient,
	directorEvents *EventStream[director.DirectorEvent],
	requestText string,
	observation Phase1HTTPObservation,
) (Phase1HTTPObservation, bool, error) {
	receipt, err := client.DispatchDirectorIntent(ctx, phase1SubmitIntent(requestText))
	if err != nil {
		return observation, false, err
	}
	workstreamID, behaviorCode, behaviorMessage := phase1ReceiptWorkstream(receipt)
	if behaviorCode != "" {
		failed, err := phase1FailureObservation(
			observation,
			ScenarioExecutionFailed,
			behaviorCode,
			behaviorMessage,
		)
		return failed, true, err
	}
	observation.WorkstreamID = workstreamID
	workstream, err := awaitPhase1Workstream(ctx, directorEvents, workstreamID)
	if err != nil {
		return observation, false, err
	}
	if workstream.ResourceScope.Kind != director.WorkstreamResourceScopeFolder ||
		workstream.ResourceScope.Folder == nil ||
		workstream.ResourceScope.Folder.WorkspaceID != observation.WorkspaceID {
		failed, err := phase1FailureObservation(
			observation,
			ScenarioExecutionFailed,
			"director_routed_outside_fixture",
			"Director did not bind the observed workstream to the opened fixture workspace",
		)
		return failed, true, err
	}
	observation.ConversationID = workstream.ConversationID
	return observation, false, nil
}

func observePhase1Turn(
	ctx context.Context,
	client *BackendClient,
	observation Phase1HTTPObservation,
) (Phase1HTTPObservation, error) {
	conversationSnapshot, err := client.ReadConversationSnapshot(
		ctx,
		observation.WorkspaceID,
		observation.ConversationID,
	)
	if err != nil {
		return observation, err
	}
	conversationEvents, err := client.SubscribeConversationEvents(
		ctx,
		observation.WorkspaceID,
		observation.ConversationID,
		conversationSnapshot.EventCursor,
	)
	if err != nil {
		return observation, err
	}
	defer conversationEvents.Close()
	turn, behaviorCode, behaviorMessage := phase1ObservedTurn(conversationSnapshot)
	if behaviorCode != "" {
		return phase1FailureObservation(
			observation,
			ScenarioExecutionFailed,
			behaviorCode,
			behaviorMessage,
		)
	}
	observation.TurnID = turn.ID
	terminal := phase1TurnTerminal(turn.Status)
	if !terminal {
		turn, err = awaitPhase1TerminalTurn(ctx, conversationEvents, turn)
		if err != nil {
			return observation, err
		}
	}
	return phase1TerminalObservation(observation, turn)
}

func validatePhase1HTTPScenario(scenario Scenario) error {
	if err := scenario.Validate(); err != nil {
		return fmt.Errorf("validate Phase 1 HTTP scenario: %w", err)
	}
	if scenario.ID != ScenarioVerifierStraightforward || len(scenario.Steps) != 1 ||
		scenario.Steps[0].Kind != ScenarioStepSubmit {
		return errors.New("Phase 1 HTTP runner accepts only the one-step straightforward-task scenario")
	}
	return nil
}

func validatePhase1WorkspaceRoot(workspaceRoot string) (string, error) {
	if strings.TrimSpace(workspaceRoot) == "" {
		return "", errors.New("Phase 1 workspace root is required")
	}
	root, err := filepath.Abs(workspaceRoot)
	if err != nil {
		return "", fmt.Errorf("resolve Phase 1 workspace root: %w", err)
	}
	if root != filepath.Clean(workspaceRoot) {
		return "", fmt.Errorf("Phase 1 workspace root must be an absolute clean path: %s", workspaceRoot)
	}
	return root, nil
}

func readPhase1RoleConfigurations(
	ctx context.Context,
	client *BackendClient,
	workspaceID string,
) ([]EvaluatedRoleConfiguration, error) {
	global, err := client.ReadGlobalRoleConfiguration(ctx)
	if err != nil {
		return nil, err
	}
	workspace, err := client.ReadWorkspaceRoleConfiguration(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	return CaptureBaselineRoleConfigurations(global, workspace)
}

func validatePhase1DirectorBaseline(snapshot director.DirectorSnapshot) error {
	if len(snapshot.Workstreams) != 0 || snapshot.Aggregates.WorkstreamCount != 0 ||
		snapshot.SelectedWorkstreamID != nil {
		return errors.New("Phase 1 scenario requires an empty disposable Director profile")
	}
	return nil
}

func phase1SubmitIntent(text string) director.DirectorIntent {
	return director.DirectorIntent{
		Kind: director.DirectorIntentSubmit,
		Submit: &director.DirectorSubmitIntent{
			Text:     text,
			Modality: director.DecisionIntentModalityText,
		},
	}
}

func phase1ReceiptWorkstream(receipt director.DirectorReceipt) (string, string, string) {
	if receipt.Submit == nil {
		return "", "director_did_not_start_work", "Director submission returned no turn receipt"
	}
	workstreamIDs := map[string]struct{}{}
	for _, call := range receipt.Submit.ToolCalls {
		if call.Succeeded && call.WorkstreamID != nil {
			workstreamIDs[*call.WorkstreamID] = struct{}{}
		}
	}
	if len(workstreamIDs) == 0 {
		return "", "director_did_not_start_work", "Director completed its turn without starting fixture work"
	}
	if len(workstreamIDs) > 1 {
		return "", "director_started_multiple_workstreams", "Director started work in more than one workstream"
	}
	var workstreamID string
	for candidate := range workstreamIDs {
		workstreamID = candidate
	}
	return workstreamID, "", ""
}

func awaitPhase1Workstream(
	ctx context.Context,
	events *EventStream[director.DirectorEvent],
	workstreamID string,
) (director.Workstream, error) {
	reader := newEventStreamReader("Director", events)
	for {
		event, err := reader.Next(ctx)
		if err != nil {
			return director.Workstream{}, err
		}
		if event.Kind == director.DirectorEventResyncRequired {
			return director.Workstream{}, errors.New("Director event stream required a snapshot resync")
		}
		if event.Kind == director.DirectorEventWorkstreamUpdated &&
			event.WorkstreamUpdated.Entry.Workstream.ID == workstreamID {
			return event.WorkstreamUpdated.Entry.Workstream, nil
		}
	}
}

func phase1ObservedTurn(
	snapshot conversation.ConversationSnapshot,
) (conversation.ConversationTurn, string, string) {
	if len(snapshot.Turns.Turns) == 0 {
		return conversation.ConversationTurn{},
			"director_did_not_start_agent_turn",
			"Director created or selected fixture work without starting an Agent turn"
	}
	if len(snapshot.Turns.Turns) != 1 || snapshot.Turns.HasEarlier {
		return conversation.ConversationTurn{},
			"director_started_multiple_agent_turns",
			"Director delivered the one-step fixture request more than once"
	}
	return snapshot.Turns.Turns[0], "", ""
}

func awaitPhase1TerminalTurn(
	ctx context.Context,
	events *EventStream[conversation.ConversationEvent],
	observed conversation.ConversationTurn,
) (conversation.ConversationTurn, error) {
	reader := newEventStreamReader("conversation", events)
	for {
		event, err := reader.Next(ctx)
		if err != nil {
			return conversation.ConversationTurn{}, err
		}
		if event.Type() == conversation.ConversationEventTypeResyncRequired {
			return conversation.ConversationTurn{}, errors.New("conversation event stream required a snapshot resync")
		}
		turn, ok := phase1TurnUpdatedPayload(event.Payload)
		if !ok || turn.ID != observed.ID {
			continue
		}
		observed = turn
		if phase1TurnTerminal(turn.Status) {
			return turn, nil
		}
	}
}

func phase1TurnUpdatedPayload(
	payload conversation.ConversationEventPayload,
) (conversation.ConversationTurn, bool) {
	switch value := payload.(type) {
	case conversation.ConversationTurnUpdatedEventPayload:
		return value.Turn, true
	case *conversation.ConversationTurnUpdatedEventPayload:
		return value.Turn, true
	default:
		return conversation.ConversationTurn{}, false
	}
}

func phase1TurnTerminal(status conversation.TurnStatus) bool {
	switch status {
	case conversation.TurnStatusCompleted,
		conversation.TurnStatusCancelled,
		conversation.TurnStatusFailed:
		return true
	case conversation.TurnStatusQueued, conversation.TurnStatusRunning:
		return false
	default:
		return false
	}
}

func phase1TerminalObservation(
	observation Phase1HTTPObservation,
	turn conversation.ConversationTurn,
) (Phase1HTTPObservation, error) {
	switch turn.Status {
	case conversation.TurnStatusCompleted:
		observation.ExecutionOutcome = ScenarioExecutionCompleted
		return observation, nil
	case conversation.TurnStatusCancelled:
		return phase1FailureObservation(
			observation,
			ScenarioExecutionCancelled,
			"agent_turn_cancelled",
			"observed Agent turn was cancelled",
		)
	case conversation.TurnStatusFailed:
		message := "observed Agent turn failed"
		if turn.Error != nil {
			message += ": " + turn.Error.Code + ": " + turn.Error.Message
		}
		return phase1FailureObservation(
			observation,
			ScenarioExecutionFailed,
			"agent_turn_failed",
			boundedResultDiagnostic(message),
		)
	case conversation.TurnStatusQueued, conversation.TurnStatusRunning:
		return Phase1HTTPObservation{}, fmt.Errorf("observed Agent turn ended wait in non-terminal state %s", turn.Status)
	default:
		return Phase1HTTPObservation{}, fmt.Errorf("observed Agent turn has unsupported state %q", turn.Status)
	}
}

func phase1FailureObservation(
	observation Phase1HTTPObservation,
	outcome ScenarioExecutionOutcome,
	code string,
	message string,
) (Phase1HTTPObservation, error) {
	diagnostic, err := NewScenarioDiagnostic(code, message)
	if err != nil {
		return Phase1HTTPObservation{}, err
	}
	observation.ExecutionOutcome = outcome
	observation.ScenarioDiagnostic = diagnostic
	return observation, nil
}

func boundedResultDiagnostic(value string) string {
	value = strings.TrimSpace(strings.ToValidUTF8(value, "�"))
	if len(value) <= ResultMaximumDiagnosticBytes {
		return value
	}
	limit := ResultMaximumDiagnosticBytes - 3
	for !utf8.ValidString(value[:limit]) {
		limit--
	}
	return value[:limit] + "..."
}
