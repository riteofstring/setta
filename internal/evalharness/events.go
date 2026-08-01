package evalharness

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/director"
)

const (
	EvaluationEventSchemaVersion   = 3
	EvaluationMaximumEvents        = 8192
	EvaluationMaximumAttemptEvents = 4096
	EvaluationMaximumEventBytes    = 256 * 1024
)

type EvaluationEventKind string

const (
	EvaluationEventUserSubmission    EvaluationEventKind = "user_submission"
	EvaluationEventDirectorReceipt   EvaluationEventKind = "director_receipt"
	EvaluationEventDirectorState     EvaluationEventKind = "director_event"
	EvaluationEventTriggerObserved   EvaluationEventKind = "trigger_observed"
	EvaluationEventConversationState EvaluationEventKind = "conversation_state"
	EvaluationEventTrajectory        EvaluationEventKind = "trajectory_event"
	EvaluationEventNarration         EvaluationEventKind = "narration_event"
	EvaluationEventSideTrajectory    EvaluationEventKind = "side_trajectory_event"
	EvaluationEventTokenUsage        EvaluationEventKind = "token_usage"
)

type EvaluationUserSubmission struct {
	StepIndex int              `json:"stepIndex"`
	Trigger   *ScenarioTrigger `json:"trigger"`
	Text      string           `json:"text"`
}

type EvaluationDirectorReceipt struct {
	StepIndex int                      `json:"stepIndex"`
	Receipt   director.DirectorReceipt `json:"receipt"`
}

type EvaluationTriggerObservation struct {
	StepIndex              int                      `json:"stepIndex"`
	Trigger                ScenarioTrigger          `json:"trigger"`
	WorkstreamID           *string                  `json:"workstreamId"`
	ConversationID         *string                  `json:"conversationId"`
	ObservedTurnID         *string                  `json:"observedTurnId"`
	ObservedTurnStatus     *conversation.TurnStatus `json:"observedTurnStatus"`
	QueueTurnIDs           []string                 `json:"queueTurnIds"`
	WorkspaceMutationCount int                      `json:"workspaceMutationCount"`
}

type EvaluationConversationTurnState struct {
	TurnID        string                     `json:"turnId"`
	AuthoredInput conversation.AuthoredInput `json:"authoredInput"`
	Delivery      conversation.TurnDelivery  `json:"delivery"`
	Status        conversation.TurnStatus    `json:"status"`
}

type EvaluationConversationState struct {
	WorkstreamID   string                            `json:"workstreamId"`
	ConversationID string                            `json:"conversationId"`
	Turns          []EvaluationConversationTurnState `json:"turns"`
	QueueTurnIDs   []string                          `json:"queueTurnIds"`
}

type EvaluationEvent struct {
	SchemaVersion     int                                 `json:"schemaVersion"`
	ScenarioID        string                              `json:"scenarioId"`
	Attempt           int                                 `json:"attempt"`
	Sequence          int                                 `json:"sequence"`
	RecordedAt        string                              `json:"recordedAt"`
	Kind              EvaluationEventKind                 `json:"kind"`
	UserSubmission    *EvaluationUserSubmission           `json:"userSubmission"`
	DirectorReceipt   *EvaluationDirectorReceipt          `json:"directorReceipt"`
	DirectorEvent     *director.DirectorEvent             `json:"directorEvent"`
	TriggerObserved   *EvaluationTriggerObservation       `json:"triggerObserved"`
	ConversationState *EvaluationConversationState        `json:"conversationState"`
	Trajectory        *conversation.TrajectoryEvent       `json:"trajectory"`
	Narration         *conversation.NarrationEvent        `json:"narration"`
	SideTrajectory    *conversation.SideConversationEvent `json:"sideTrajectory"`
	TokenUsage        *agent.TokenUsageObservation        `json:"tokenUsage"`
}

type evaluationEventCandidate struct {
	event   EvaluationEvent
	when    time.Time
	ordinal int
}

func buildEvaluationEvents(
	scenario Scenario,
	attempt int,
	observation Phase1HTTPObservation,
	snapshot conversation.ConversationSnapshot,
) ([]EvaluationEvent, error) {
	candidates, err := initialEvaluationEventCandidates(scenario, observation)
	if err != nil {
		return nil, err
	}
	candidates, err = appendTriggerEventCandidates(candidates, observation.triggers)
	if err != nil {
		return nil, err
	}
	candidates, err = appendDirectorEventCandidates(candidates, observation.directorEvents)
	if err != nil {
		return nil, err
	}
	candidates, err = appendTrajectoryEventCandidates(candidates, snapshot.Trajectory.Events)
	if err != nil {
		return nil, err
	}
	candidates, err = appendNarrationEventCandidates(candidates, snapshot.Narration.Events)
	if err != nil {
		return nil, err
	}
	candidates, err = appendSideEventCandidates(candidates, snapshot.SideEvents.Events)
	if err != nil {
		return nil, err
	}
	candidates, err = appendConversationStateCandidate(
		candidates,
		observation,
		snapshot,
	)
	if err != nil {
		return nil, err
	}
	return finalizeEvaluationEventCandidates(scenario.ID, attempt, candidates)
}

func initialEvaluationEventCandidates(
	scenario Scenario,
	observation Phase1HTTPObservation,
) ([]evaluationEventCandidate, error) {
	if err := scenario.Validate(); err != nil {
		return nil, err
	}
	if len(observation.submissions) != len(scenario.Steps) {
		return nil, fmt.Errorf(
			"completed evaluation event log has %d Director submissions, want %d",
			len(observation.submissions),
			len(scenario.Steps),
		)
	}
	candidates := make([]evaluationEventCandidate, 0, len(observation.submissions)*2)
	for index, submission := range observation.submissions {
		if submission.stepIndex != index || submission.submittedAt.IsZero() ||
			submission.receivedAt.IsZero() || submission.receivedAt.Before(submission.submittedAt) ||
			submission.receipt.Submit == nil {
			return nil, fmt.Errorf("completed evaluation event log has an invalid Director submission[%d]", index)
		}
		step := scenario.Steps[index]
		var trigger *ScenarioTrigger
		if step.Trigger != "" {
			value := step.Trigger
			trigger = &value
		}
		candidates = append(candidates, evaluationEventCandidate{
			event: EvaluationEvent{
				Kind: EvaluationEventUserSubmission,
				UserSubmission: &EvaluationUserSubmission{
					StepIndex: index,
					Trigger:   trigger,
					Text:      step.Text,
				},
			},
			when:    submission.submittedAt.UTC(),
			ordinal: index * 3,
		})
		candidates = append(candidates, evaluationEventCandidate{
			event: EvaluationEvent{
				Kind: EvaluationEventDirectorReceipt,
				DirectorReceipt: &EvaluationDirectorReceipt{
					StepIndex: index,
					Receipt:   *cloneDirectorReceipt(submission.receipt),
				},
			},
			when:    submission.receivedAt.UTC(),
			ordinal: index*3 + 1,
		})
	}
	return candidates, nil
}

func appendTriggerEventCandidates(
	candidates []evaluationEventCandidate,
	triggers []evaluationTriggerCandidate,
) ([]evaluationEventCandidate, error) {
	for index := range triggers {
		trigger := triggers[index]
		if trigger.observedAt.IsZero() {
			return nil, fmt.Errorf("trigger observation[%d] omitted observedAt", index)
		}
		observation := cloneEvaluationTriggerObservation(trigger.observation)
		candidates = append(candidates, evaluationEventCandidate{
			event: EvaluationEvent{
				Kind:            EvaluationEventTriggerObserved,
				TriggerObserved: &observation,
			},
			when:    trigger.observedAt.UTC(),
			ordinal: observation.StepIndex*3 - 1,
		})
	}
	return candidates, nil
}

func appendConversationStateCandidate(
	candidates []evaluationEventCandidate,
	observation Phase1HTTPObservation,
	snapshot conversation.ConversationSnapshot,
) ([]evaluationEventCandidate, error) {
	if observation.finalSnapshotAt.IsZero() || observation.WorkstreamID == "" ||
		observation.ConversationID == "" {
		return nil, errors.New("completed evaluation event log requires a final conversation state timeline")
	}
	state := EvaluationConversationState{
		WorkstreamID:   observation.WorkstreamID,
		ConversationID: observation.ConversationID,
		Turns:          make([]EvaluationConversationTurnState, len(snapshot.Turns.Turns)),
		QueueTurnIDs:   make([]string, len(snapshot.Queue)),
	}
	for index, turn := range snapshot.Turns.Turns {
		state.Turns[index] = EvaluationConversationTurnState{
			TurnID:        turn.ID,
			AuthoredInput: turn.AuthoredInput,
			Delivery:      turn.Delivery,
			Status:        turn.Status,
		}
	}
	for index, queued := range snapshot.Queue {
		state.QueueTurnIDs[index] = queued.TurnID
	}
	return append(candidates, evaluationEventCandidate{
		event: EvaluationEvent{
			Kind:              EvaluationEventConversationState,
			ConversationState: &state,
		},
		when:    observation.finalSnapshotAt.UTC(),
		ordinal: len(candidates),
	}), nil
}

func cloneEvaluationTriggerObservation(
	observation EvaluationTriggerObservation,
) EvaluationTriggerObservation {
	cloned := observation
	cloned.WorkstreamID = cloneStringPointer(observation.WorkstreamID)
	cloned.ConversationID = cloneStringPointer(observation.ConversationID)
	cloned.ObservedTurnID = cloneStringPointer(observation.ObservedTurnID)
	if observation.ObservedTurnStatus != nil {
		status := *observation.ObservedTurnStatus
		cloned.ObservedTurnStatus = &status
	}
	cloned.QueueTurnIDs = append([]string{}, observation.QueueTurnIDs...)
	return cloned
}

func appendDirectorEventCandidates(
	candidates []evaluationEventCandidate,
	events []director.DirectorEvent,
) ([]evaluationEventCandidate, error) {
	for index := range events {
		event := events[index]
		emittedAt, err := time.Parse(time.RFC3339Nano, event.EmittedAt)
		if err != nil {
			return nil, fmt.Errorf("parse Director event timestamp: %w", err)
		}
		cloned := event
		candidates = append(candidates, evaluationEventCandidate{
			event:   EvaluationEvent{Kind: EvaluationEventDirectorState, DirectorEvent: &cloned},
			when:    emittedAt.UTC(),
			ordinal: len(candidates),
		})
	}
	return candidates, nil
}

func appendTrajectoryEventCandidates(
	candidates []evaluationEventCandidate,
	trajectories []conversation.TrajectoryEvent,
) ([]evaluationEventCandidate, error) {
	for index := range trajectories {
		trajectory := trajectories[index]
		emittedAt, err := time.Parse(time.RFC3339Nano, trajectory.EmittedAt)
		if err != nil {
			return nil, fmt.Errorf("parse trajectory event %s timestamp: %w", trajectory.ID, err)
		}
		candidates = append(candidates, evaluationEventCandidate{
			event:   EvaluationEvent{Kind: EvaluationEventTrajectory, Trajectory: &trajectory},
			when:    emittedAt.UTC(),
			ordinal: len(candidates),
		})
	}
	return candidates, nil
}

func appendNarrationEventCandidates(
	candidates []evaluationEventCandidate,
	narrations []conversation.NarrationEvent,
) ([]evaluationEventCandidate, error) {
	for index := range narrations {
		narration := narrations[index]
		createdAt, err := time.Parse(time.RFC3339Nano, narration.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("parse narration event %s timestamp: %w", narration.ID, err)
		}
		candidates = append(candidates, evaluationEventCandidate{
			event:   EvaluationEvent{Kind: EvaluationEventNarration, Narration: &narration},
			when:    createdAt.UTC(),
			ordinal: len(candidates),
		})
	}
	return candidates, nil
}

func appendSideEventCandidates(
	candidates []evaluationEventCandidate,
	sideEvents []conversation.SideConversationEvent,
) ([]evaluationEventCandidate, error) {
	for index := range sideEvents {
		side := sideEvents[index]
		emittedAt, err := time.Parse(time.RFC3339Nano, side.Event.EmittedAt)
		if err != nil {
			return nil, fmt.Errorf("parse side trajectory event %s timestamp: %w", side.Event.ID, err)
		}
		candidates = append(candidates, evaluationEventCandidate{
			event:   EvaluationEvent{Kind: EvaluationEventSideTrajectory, SideTrajectory: &side},
			when:    emittedAt.UTC(),
			ordinal: len(candidates),
		})
	}
	return candidates, nil
}

func finalizeEvaluationEventCandidates(
	scenarioID string,
	attempt int,
	candidates []evaluationEventCandidate,
) ([]EvaluationEvent, error) {
	if len(candidates) > EvaluationMaximumAttemptEvents {
		return nil, fmt.Errorf(
			"evaluation attempt event log contains %d entries, maximum is %d",
			len(candidates),
			EvaluationMaximumAttemptEvents,
		)
	}
	sort.SliceStable(candidates, func(left int, right int) bool {
		if candidates[left].when.Equal(candidates[right].when) {
			return candidates[left].ordinal < candidates[right].ordinal
		}
		return candidates[left].when.Before(candidates[right].when)
	})
	events := make([]EvaluationEvent, len(candidates))
	for index, candidate := range candidates {
		events[index] = candidate.event
		events[index].SchemaVersion = EvaluationEventSchemaVersion
		events[index].ScenarioID = scenarioID
		events[index].Attempt = attempt
		events[index].Sequence = index + 1
		events[index].RecordedAt = candidate.when.UTC().Format(time.RFC3339Nano)
		if err := events[index].Validate(); err != nil {
			return nil, fmt.Errorf("evaluation event[%d]: %w", index, err)
		}
	}
	return events, nil
}

func appendTokenUsageEvents(
	events []EvaluationEvent,
	scenarioID string,
	attempt int,
	observations []agent.TokenUsageObservation,
	recordedAt time.Time,
) ([]EvaluationEvent, error) {
	if len(events)+len(observations) > EvaluationMaximumAttemptEvents {
		return nil, fmt.Errorf("evaluation attempt event log would exceed %d entries", EvaluationMaximumAttemptEvents)
	}
	appended := append([]EvaluationEvent{}, events...)
	for index := range observations {
		observation := observations[index]
		event := EvaluationEvent{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    scenarioID,
			Attempt:       attempt,
			Sequence:      len(appended) + 1,
			RecordedAt:    recordedAt.UTC().Format(time.RFC3339Nano),
			Kind:          EvaluationEventTokenUsage,
			TokenUsage:    &observation,
		}
		if err := event.Validate(); err != nil {
			return nil, fmt.Errorf("append token usage event[%d]: %w", index, err)
		}
		appended = append(appended, event)
	}
	return appended, nil
}

func validateEvaluationEvents(events []EvaluationEvent, attempts []evaluationAttemptIdentity) error {
	if events == nil {
		return errors.New("evaluation events must be an array, not null")
	}
	if len(events) > EvaluationMaximumEvents {
		return fmt.Errorf("evaluation event log contains %d entries, maximum is %d", len(events), EvaluationMaximumEvents)
	}
	allowed := make(map[evaluationAttemptIdentity]bool, len(attempts))
	for _, attempt := range attempts {
		allowed[attempt] = true
	}
	sequences := map[evaluationAttemptIdentity]int{}
	previousTimes := map[evaluationAttemptIdentity]time.Time{}
	for index, event := range events {
		if err := event.Validate(); err != nil {
			return fmt.Errorf("evaluation event[%d]: %w", index, err)
		}
		identity := evaluationAttemptIdentity{ScenarioID: event.ScenarioID, Attempt: event.Attempt}
		if !allowed[identity] {
			return fmt.Errorf("evaluation event[%d] belongs to unknown scenario attempt %s/%d", index, event.ScenarioID, event.Attempt)
		}
		sequences[identity]++
		if sequences[identity] > EvaluationMaximumAttemptEvents {
			return fmt.Errorf(
				"scenario attempt %s/%d contains more than %d events",
				event.ScenarioID,
				event.Attempt,
				EvaluationMaximumAttemptEvents,
			)
		}
		if event.Sequence != sequences[identity] {
			return fmt.Errorf("evaluation event[%d] sequence is %d, want %d", index, event.Sequence, sequences[identity])
		}
		recordedAt, _ := time.Parse(time.RFC3339Nano, event.RecordedAt)
		if previous, exists := previousTimes[identity]; exists && recordedAt.Before(previous) {
			return fmt.Errorf("evaluation event[%d] precedes the prior event for scenario attempt %s/%d", index, event.ScenarioID, event.Attempt)
		}
		previousTimes[identity] = recordedAt
	}
	return nil
}

func (event EvaluationEvent) Validate() error {
	if err := validateEvaluationEventEnvelope(event); err != nil {
		return err
	}
	if err := validateEvaluationEventPayloadPresence(event); err != nil {
		return err
	}
	return validateEvaluationEventPayload(event)
}

func validateEvaluationEventEnvelope(event EvaluationEvent) error {
	if event.SchemaVersion != EvaluationEventSchemaVersion {
		return fmt.Errorf("schemaVersion is %d, want %d", event.SchemaVersion, EvaluationEventSchemaVersion)
	}
	if err := validateScenarioIdentifier("evaluation event scenario id", event.ScenarioID); err != nil {
		return err
	}
	if err := validateEvaluationAttempt(event.Attempt); err != nil {
		return err
	}
	if event.Sequence <= 0 {
		return errors.New("evaluation event sequence must be positive")
	}
	if _, err := time.Parse(time.RFC3339Nano, event.RecordedAt); err != nil {
		return fmt.Errorf("evaluation event recordedAt is invalid: %w", err)
	}
	return nil
}

func validateEvaluationEventPayloadPresence(event EvaluationEvent) error {
	present := map[EvaluationEventKind]bool{
		EvaluationEventUserSubmission:    event.UserSubmission != nil,
		EvaluationEventDirectorReceipt:   event.DirectorReceipt != nil,
		EvaluationEventDirectorState:     event.DirectorEvent != nil,
		EvaluationEventTriggerObserved:   event.TriggerObserved != nil,
		EvaluationEventConversationState: event.ConversationState != nil,
		EvaluationEventTrajectory:        event.Trajectory != nil,
		EvaluationEventNarration:         event.Narration != nil,
		EvaluationEventSideTrajectory:    event.SideTrajectory != nil,
		EvaluationEventTokenUsage:        event.TokenUsage != nil,
	}
	for kind, populated := range present {
		if populated != (event.Kind == kind) {
			return fmt.Errorf("evaluation event kind %s payload presence is inconsistent", event.Kind)
		}
	}
	return nil
}

func validateEvaluationEventPayload(event EvaluationEvent) error {
	switch event.Kind {
	case EvaluationEventUserSubmission:
		return validateEvaluationUserSubmission(*event.UserSubmission)
	case EvaluationEventDirectorReceipt:
		return validateEvaluationDirectorReceipt(*event.DirectorReceipt)
	case EvaluationEventDirectorState:
		return director.ValidateDirectorEvent(*event.DirectorEvent)
	case EvaluationEventTriggerObserved:
		return event.TriggerObserved.Validate()
	case EvaluationEventConversationState:
		return event.ConversationState.Validate()
	case EvaluationEventTrajectory:
		return event.Trajectory.Validate()
	case EvaluationEventNarration:
		return event.Narration.Validate()
	case EvaluationEventSideTrajectory:
		return event.SideTrajectory.Validate()
	case EvaluationEventTokenUsage:
		return event.TokenUsage.Validate()
	default:
		return fmt.Errorf("unsupported evaluation event kind %q", event.Kind)
	}
}

func validateEvaluationUserSubmission(submission EvaluationUserSubmission) error {
	if submission.StepIndex < 0 || submission.StepIndex >= ScenarioMaximumSteps {
		return fmt.Errorf("evaluation user submission stepIndex %d is invalid", submission.StepIndex)
	}
	if submission.StepIndex == 0 {
		if submission.Trigger != nil {
			return errors.New("initial evaluation user submission must not declare a trigger")
		}
	} else if submission.Trigger == nil || !supportedScenarioTrigger(*submission.Trigger) {
		return errors.New("triggered evaluation user submission requires a supported trigger")
	}
	if strings.TrimSpace(submission.Text) == "" ||
		strings.TrimSpace(submission.Text) != submission.Text ||
		len(submission.Text) > ScenarioMaximumMessageBytes {
		return errors.New("evaluation user submission text is invalid")
	}
	return nil
}

func validateEvaluationDirectorReceipt(receipt EvaluationDirectorReceipt) error {
	if receipt.StepIndex < 0 || receipt.StepIndex >= ScenarioMaximumSteps {
		return fmt.Errorf("evaluation Director receipt stepIndex %d is invalid", receipt.StepIndex)
	}
	return ValidateDirectorReceiptForEvaluation(receipt.Receipt)
}

func (observation EvaluationTriggerObservation) Validate() error {
	if observation.StepIndex <= 0 || observation.StepIndex >= ScenarioMaximumSteps {
		return fmt.Errorf("trigger observation stepIndex %d is invalid", observation.StepIndex)
	}
	if !supportedScenarioTrigger(observation.Trigger) {
		return fmt.Errorf("trigger observation %q is unsupported", observation.Trigger)
	}
	if observation.QueueTurnIDs == nil {
		return errors.New("trigger observation queueTurnIds must be an array")
	}
	if observation.WorkspaceMutationCount < 0 {
		return errors.New("trigger observation workspaceMutationCount must be non-negative")
	}
	identities := []struct {
		label string
		value *string
	}{
		{label: "trigger workstream id", value: observation.WorkstreamID},
		{label: "trigger conversation id", value: observation.ConversationID},
		{label: "trigger observed turn id", value: observation.ObservedTurnID},
	}
	for _, identity := range identities {
		if identity.value != nil {
			if err := validateResultIdentifier(identity.label, *identity.value); err != nil {
				return err
			}
		}
	}
	if err := validateUniqueControlIdentifiers("trigger queue turn", observation.QueueTurnIDs); err != nil {
		return err
	}
	return validateTriggerObservationShape(observation)
}

func validateTriggerObservationShape(observation EvaluationTriggerObservation) error {
	switch observation.Trigger {
	case ScenarioTriggerDirectorTurnCompleted:
		return validateDirectorCompletionTriggerShape(observation)
	case ScenarioTriggerFirstWorkspaceMutation,
		ScenarioTriggerAgentTurnRunning,
		ScenarioTriggerQueueNonempty:
		return validateActiveTurnTriggerShape(observation)
	default:
		return fmt.Errorf("unsupported trigger observation %q", observation.Trigger)
	}
}

func validateDirectorCompletionTriggerShape(observation EvaluationTriggerObservation) error {
	if observation.ObservedTurnID != nil || observation.ObservedTurnStatus != nil ||
		len(observation.QueueTurnIDs) != 0 || observation.WorkspaceMutationCount != 0 {
		return errors.New("director_turn_completed trigger must precede Agent work and queued work")
	}
	return nil
}

func validateActiveTurnTriggerShape(observation EvaluationTriggerObservation) error {
	if activeTriggerIdentityMissing(observation) {
		return fmt.Errorf("%s trigger requires workstream, conversation, and observed turn state", observation.Trigger)
	}
	if *observation.ObservedTurnStatus != conversation.TurnStatusRunning {
		return fmt.Errorf("%s trigger observed turn status is %s, want running", observation.Trigger, *observation.ObservedTurnStatus)
	}
	if observation.Trigger == ScenarioTriggerFirstWorkspaceMutation &&
		observation.WorkspaceMutationCount == 0 {
		return errors.New("first_workspace_mutation trigger requires a completed workspace mutation")
	}
	if observation.Trigger == ScenarioTriggerQueueNonempty && len(observation.QueueTurnIDs) != 1 {
		return fmt.Errorf("queue_nonempty trigger observed %d queued turns, want one", len(observation.QueueTurnIDs))
	}
	return nil
}

func activeTriggerIdentityMissing(observation EvaluationTriggerObservation) bool {
	return observation.WorkstreamID == nil || observation.ConversationID == nil ||
		observation.ObservedTurnID == nil || observation.ObservedTurnStatus == nil
}

func (state EvaluationConversationState) Validate() error {
	if err := validateResultIdentifier("conversation state workstream id", state.WorkstreamID); err != nil {
		return err
	}
	if err := validateResultIdentifier("conversation state conversation id", state.ConversationID); err != nil {
		return err
	}
	if err := validateConversationStateBounds(state); err != nil {
		return err
	}
	turns, err := indexConversationStateTurns(state.Turns)
	if err != nil {
		return err
	}
	if err := validateUniqueControlIdentifiers("conversation state queue turn", state.QueueTurnIDs); err != nil {
		return err
	}
	return validateConversationStateQueue(state.QueueTurnIDs, turns)
}

func validateConversationStateBounds(state EvaluationConversationState) error {
	if state.Turns == nil || len(state.Turns) == 0 || len(state.Turns) > conversation.MaxSnapshotTurns {
		return fmt.Errorf("conversation state contains %d turns, want 1-%d", len(state.Turns), conversation.MaxSnapshotTurns)
	}
	if state.QueueTurnIDs == nil || len(state.QueueTurnIDs) > conversation.MaxSnapshotQueuedTurns {
		return fmt.Errorf("conversation state contains %d queued turns, maximum is %d", len(state.QueueTurnIDs), conversation.MaxSnapshotQueuedTurns)
	}
	return nil
}

func indexConversationStateTurns(
	values []EvaluationConversationTurnState,
) (map[string]EvaluationConversationTurnState, error) {
	turns := make(map[string]EvaluationConversationTurnState, len(values))
	for index, turn := range values {
		if err := turn.Validate(); err != nil {
			return nil, fmt.Errorf("conversation state turn[%d]: %w", index, err)
		}
		if _, exists := turns[turn.TurnID]; exists {
			return nil, fmt.Errorf("conversation state repeats turn %s", turn.TurnID)
		}
		turns[turn.TurnID] = turn
	}
	return turns, nil
}

func validateConversationStateQueue(
	queueTurnIDs []string,
	turns map[string]EvaluationConversationTurnState,
) error {
	for _, turnID := range queueTurnIDs {
		turn, exists := turns[turnID]
		if !exists || turn.Status != conversation.TurnStatusQueued || turn.Delivery != conversation.TurnDeliveryQueued {
			return fmt.Errorf("conversation state queue turn %s is not a queued delivered turn", turnID)
		}
	}
	return nil
}

func (state EvaluationConversationTurnState) Validate() error {
	if err := validateResultIdentifier("conversation state turn id", state.TurnID); err != nil {
		return err
	}
	if err := state.AuthoredInput.Validate(); err != nil {
		return err
	}
	switch state.Delivery {
	case conversation.TurnDeliveryNormal, conversation.TurnDeliveryQueued:
	default:
		return fmt.Errorf("conversation state turn %s has unsupported delivery %s", state.TurnID, state.Delivery)
	}
	switch state.Status {
	case conversation.TurnStatusQueued,
		conversation.TurnStatusRunning,
		conversation.TurnStatusCompleted,
		conversation.TurnStatusCancelled,
		conversation.TurnStatusFailed:
		return nil
	default:
		return fmt.Errorf("conversation state turn %s has unsupported status %s", state.TurnID, state.Status)
	}
}

func validateUniqueControlIdentifiers(label string, values []string) error {
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		if err := validateResultIdentifier(label, value); err != nil {
			return err
		}
		if seen[value] {
			return fmt.Errorf("%s %s is repeated", label, value)
		}
		seen[value] = true
	}
	return nil
}

func ValidateDirectorReceiptForEvaluation(receipt director.DirectorReceipt) error {
	if err := director.ValidateDirectorReceipt(receipt); err != nil {
		return err
	}
	if receipt.Kind != director.DirectorIntentSubmit || receipt.Submit == nil {
		return errors.New("evaluation Director receipt must be a submit receipt")
	}
	return nil
}

func cloneDirectorReceipt(receipt director.DirectorReceipt) *director.DirectorReceipt {
	payload := receipt
	if receipt.Submit != nil {
		submit := *receipt.Submit
		submit.ToolCalls = append([]director.DirectorToolCall{}, receipt.Submit.ToolCalls...)
		submit.ResolvedInvocations = append(
			[]conversation.ResolvedInvocation{},
			receipt.Submit.ResolvedInvocations...,
		)
		payload.Submit = &submit
	}
	return &payload
}
