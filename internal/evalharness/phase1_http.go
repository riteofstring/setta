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
	WorkspaceID         string
	WorkstreamID        string
	ConversationID      string
	ObservedTurnID      string
	TurnID              string
	Roles               []EvaluatedRoleConfiguration
	ResolvedInvocations []conversation.ResolvedInvocation
	ExecutionOutcome    ScenarioExecutionOutcome
	ScenarioDiagnostic  *ScenarioDiagnostic
	transcript          *ScenarioTranscript
	submissions         []scenarioSubmissionObservation
	triggers            []evaluationTriggerCandidate
	directorEvents      []director.DirectorEvent
	finalSnapshotAt     time.Time
	events              []EvaluationEvent
}

type scenarioSubmissionObservation struct {
	stepIndex   int
	submittedAt time.Time
	receivedAt  time.Time
	receipt     director.DirectorReceipt
}

type evaluationTriggerCandidate struct {
	observation EvaluationTriggerObservation
	observedAt  time.Time
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
	candidate *loadedCandidateConfiguration,
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
	observation, runErr := runPhase1ScenarioOverHTTP(scenarioCtx, client, scenario, root, candidate)
	if runErr == nil {
		return observation, nil
	}
	if ctx.Err() != nil {
		return observation, ctx.Err()
	}
	if errors.Is(scenarioCtx.Err(), context.DeadlineExceeded) {
		return phase1FailureObservation(
			observation,
			ScenarioExecutionTimedOut,
			"scenario_timeout",
			fmt.Sprintf("scenario exceeded its %d-second runaway ceiling", scenario.TimeoutSeconds),
		)
	}
	var candidateFailure *candidateConfigurationError
	if errors.As(runErr, &candidateFailure) {
		return observation, candidateFailure
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
	candidate *loadedCandidateConfiguration,
) (Phase1HTTPObservation, error) {
	observation, directorEvents, err := preparePhase1Scenario(
		ctx,
		client,
		workspaceRoot,
		candidate,
	)
	if err != nil {
		return observation, err
	}
	defer directorEvents.Close()
	return orchestrateEvaluationScenario(
		ctx,
		client,
		directorEvents,
		scenario,
		observation,
	)
}

func preparePhase1Scenario(
	ctx context.Context,
	client *BackendClient,
	workspaceRoot string,
	candidate *loadedCandidateConfiguration,
) (Phase1HTTPObservation, *EventStream[director.DirectorEvent], error) {
	opened, err := client.OpenWorkspace(ctx, workspaceRoot)
	if err != nil {
		return Phase1HTTPObservation{}, nil, err
	}
	observation := Phase1HTTPObservation{WorkspaceID: opened.Workspace.ID}
	roles, err := configureEvaluationRoleConfigurations(
		ctx,
		client,
		observation.WorkspaceID,
		candidate,
	)
	if err != nil {
		if candidate != nil {
			return observation, nil, &candidateConfigurationError{cause: err}
		}
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

type candidateConfigurationError struct {
	cause error
}

func (failure *candidateConfigurationError) Error() string {
	if failure == nil || failure.cause == nil {
		return "candidate role configuration failed"
	}
	return failure.cause.Error()
}

func (failure *candidateConfigurationError) Unwrap() error {
	if failure == nil {
		return nil
	}
	return failure.cause
}

func configureEvaluationRoleConfigurations(
	ctx context.Context,
	client *BackendClient,
	workspaceID string,
	candidate *loadedCandidateConfiguration,
) ([]EvaluatedRoleConfiguration, error) {
	global, err := client.ReadGlobalRoleConfiguration(ctx)
	if err != nil {
		return nil, err
	}
	workspace, err := client.ReadWorkspaceRoleConfiguration(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	if candidate == nil {
		return CaptureBaselineRoleConfigurations(global, workspace)
	}
	globalUpdates, workspaceUpdates, err := candidateRoleProfileUpdates(
		global,
		workspace,
		candidate.configuration,
	)
	if err != nil {
		return nil, err
	}
	if len(globalUpdates) > 0 {
		global, err = client.UpdateGlobalRoleConfiguration(ctx, globalUpdates)
		if err != nil {
			return nil, fmt.Errorf("apply candidate %s global role settings: %w", candidate.configuration.ID, err)
		}
	}
	if len(workspaceUpdates) > 0 {
		workspace, err = client.UpdateWorkspaceRoleConfiguration(ctx, workspaceID, workspaceUpdates)
		if err != nil {
			return nil, fmt.Errorf("apply candidate %s workspace role settings: %w", candidate.configuration.ID, err)
		}
	}
	roles, err := CaptureBaselineRoleConfigurations(global, workspace)
	if err != nil {
		return nil, err
	}
	if err := validateAppliedCandidate(candidate.configuration, roles); err != nil {
		return nil, err
	}
	return roles, nil
}

func collectPhase2ConversationEvidence(
	scenario Scenario,
	observation Phase1HTTPObservation,
	snapshot conversation.ConversationSnapshot,
) (Phase1HTTPObservation, error) {
	if err := validateCompletePhase2Snapshot(snapshot); err != nil {
		return observation, err
	}
	events, err := buildEvaluationEvents(scenario, observation, snapshot)
	if err != nil {
		return observation, fmt.Errorf("build evaluation event log: %w", err)
	}
	transcript, err := buildScenarioTranscript(scenario, events)
	if err != nil {
		return observation, fmt.Errorf("build user-visible transcript: %w", err)
	}
	observation.transcript = &transcript
	observation.events = events
	return observation, nil
}

func validateCompletePhase2Snapshot(snapshot conversation.ConversationSnapshot) error {
	if snapshot.Trajectory.HasEarlier {
		return errors.New("Phase 2 event evidence exceeded the trajectory snapshot window")
	}
	if snapshot.Narration.HasEarlier {
		return errors.New("Phase 2 transcript evidence exceeded the narration snapshot window")
	}
	if snapshot.SideEvents.HasEarlier {
		return errors.New("Phase 2 event evidence exceeded the side-trajectory snapshot window")
	}
	return nil
}

func validatePhase1HTTPScenario(scenario Scenario) error {
	if err := scenario.Validate(); err != nil {
		return fmt.Errorf("validate evaluation HTTP scenario: %w", err)
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
) (director.Workstream, director.DirectorEvent, error) {
	reader := newEventStreamReader("Director", events)
	for {
		event, err := reader.Next(ctx)
		if err != nil {
			return director.Workstream{}, director.DirectorEvent{}, err
		}
		if event.Kind == director.DirectorEventResyncRequired {
			return director.Workstream{}, director.DirectorEvent{}, errors.New("Director event stream required a snapshot resync")
		}
		if event.Kind == director.DirectorEventWorkstreamUpdated &&
			event.WorkstreamUpdated.Entry.Workstream.ID == workstreamID {
			return event.WorkstreamUpdated.Entry.Workstream, event, nil
		}
	}
}

type phase1NarrationSettlement struct {
	terminalSequence int
	finalSummaryEnd  int
	degradedThrough  int
}

func phase1NarrationSettlementFromSnapshot(
	snapshot conversation.ConversationSnapshot,
	turnID string,
) phase1NarrationSettlement {
	settlement := phase1NarrationSettlement{}
	for _, event := range snapshot.Trajectory.Events {
		settlement.observeTrajectory(event, turnID)
	}
	for _, event := range snapshot.Narration.Events {
		settlement.observeNarration(event, turnID)
	}
	settlement.observeNarratorState(snapshot.NarratorState)
	return settlement
}

func phase1NarrationSettled(snapshot conversation.ConversationSnapshot, turnID string) bool {
	return phase1NarrationSettlementFromSnapshot(snapshot, turnID).settled()
}

func (settlement *phase1NarrationSettlement) observeTrajectory(
	event conversation.TrajectoryEvent,
	turnID string,
) {
	if event.TurnID == nil || *event.TurnID != turnID {
		return
	}
	switch event.Kind {
	case conversation.TrajectoryEventTurnCompleted,
		conversation.TrajectoryEventTurnFailed,
		conversation.TrajectoryEventTurnInterrupted:
		if event.Sequence > settlement.terminalSequence {
			settlement.terminalSequence = event.Sequence
		}
	}
}

func (settlement *phase1NarrationSettlement) observeNarration(
	event conversation.NarrationEvent,
	turnID string,
) {
	if event.TurnID == nil || *event.TurnID != turnID ||
		event.Kind != conversation.NarrationEventKindFinalSummary ||
		event.Trigger != conversation.NarrationTriggerTurnTerminal {
		return
	}
	if event.SourceSequenceEnd > settlement.finalSummaryEnd {
		settlement.finalSummaryEnd = event.SourceSequenceEnd
	}
}

func (settlement *phase1NarrationSettlement) observeNarratorState(state conversation.NarratorState) {
	if state.Status == conversation.NarratorStatusDegraded &&
		state.ObservedThroughSequence > settlement.degradedThrough {
		settlement.degradedThrough = state.ObservedThroughSequence
	}
}

func (settlement phase1NarrationSettlement) settled() bool {
	return settlement.terminalSequence > 0 &&
		(settlement.finalSummaryEnd >= settlement.terminalSequence ||
			settlement.degradedThrough >= settlement.terminalSequence)
}

func phase1SnapshotInvocations(
	snapshot conversation.ConversationSnapshot,
) ([]conversation.ResolvedInvocation, error) {
	if phase1SnapshotHasEarlierInvocations(snapshot) {
		return nil, errors.New("Phase 1 invocation correlation exceeded a bounded snapshot window")
	}
	invocations := make([]conversation.ResolvedInvocation, 0)
	for _, turn := range snapshot.Turns.Turns {
		if turn.ResolvedInvocation != nil {
			invocations = append(invocations, *turn.ResolvedInvocation)
		}
	}
	for _, event := range snapshot.Narration.Events {
		invocations = append(invocations, event.ResolvedInvocation)
	}
	for _, sideEvent := range snapshot.SideEvents.Events {
		if sideEvent.Event.Kind == conversation.TrajectoryEventTurnStarted &&
			sideEvent.Event.TurnStarted != nil {
			invocations = append(invocations, sideEvent.Event.TurnStarted.Invocation)
		}
	}
	for index, invocation := range invocations {
		if err := invocation.Validate(); err != nil {
			return nil, fmt.Errorf("Phase 1 resolved invocation[%d]: %w", index, err)
		}
	}
	return invocations, nil
}

func phase1SnapshotHasEarlierInvocations(snapshot conversation.ConversationSnapshot) bool {
	return snapshot.Turns.HasEarlier ||
		snapshot.Narration.HasEarlier ||
		snapshot.SideEvents.HasEarlier
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
