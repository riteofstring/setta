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
	EvaluationEventSchemaVersion = 1
	EvaluationMaximumEvents      = 4096
	EvaluationMaximumEventBytes  = 256 * 1024
)

type EvaluationEventKind string

const (
	EvaluationEventUserSubmission  EvaluationEventKind = "user_submission"
	EvaluationEventDirectorReceipt EvaluationEventKind = "director_receipt"
	EvaluationEventDirectorState   EvaluationEventKind = "director_event"
	EvaluationEventTrajectory      EvaluationEventKind = "trajectory_event"
	EvaluationEventNarration       EvaluationEventKind = "narration_event"
	EvaluationEventSideTrajectory  EvaluationEventKind = "side_trajectory_event"
	EvaluationEventTokenUsage      EvaluationEventKind = "token_usage"
)

type EvaluationUserSubmission struct {
	Text string `json:"text"`
}

type EvaluationEvent struct {
	SchemaVersion   int                                 `json:"schemaVersion"`
	ScenarioID      string                              `json:"scenarioId"`
	Sequence        int                                 `json:"sequence"`
	RecordedAt      string                              `json:"recordedAt"`
	Kind            EvaluationEventKind                 `json:"kind"`
	UserSubmission  *EvaluationUserSubmission           `json:"userSubmission"`
	DirectorReceipt *director.DirectorReceipt           `json:"directorReceipt"`
	DirectorEvent   *director.DirectorEvent             `json:"directorEvent"`
	Trajectory      *conversation.TrajectoryEvent       `json:"trajectory"`
	Narration       *conversation.NarrationEvent        `json:"narration"`
	SideTrajectory  *conversation.SideConversationEvent `json:"sideTrajectory"`
	TokenUsage      *agent.TokenUsageObservation        `json:"tokenUsage"`
}

type evaluationEventCandidate struct {
	event   EvaluationEvent
	when    time.Time
	ordinal int
}

func buildPhase1EvaluationEvents(
	scenario Scenario,
	observation Phase1HTTPObservation,
	snapshot conversation.ConversationSnapshot,
) ([]EvaluationEvent, error) {
	candidates, err := initialEvaluationEventCandidates(scenario, observation)
	if err != nil {
		return nil, err
	}
	candidates, err = appendDirectorEventCandidate(candidates, observation.directorEvent)
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
	return finalizeEvaluationEventCandidates(scenario.ID, candidates)
}

func initialEvaluationEventCandidates(
	scenario Scenario,
	observation Phase1HTTPObservation,
) ([]evaluationEventCandidate, error) {
	if err := scenario.Validate(); err != nil {
		return nil, err
	}
	if observation.submittedAt.IsZero() || observation.directorReceivedAt.IsZero() ||
		observation.directorReceipt.Submit == nil {
		return nil, errors.New("completed evaluation event log requires the Director submission timeline")
	}
	return []evaluationEventCandidate{
		{
			event: EvaluationEvent{
				Kind: EvaluationEventUserSubmission,
				UserSubmission: &EvaluationUserSubmission{
					Text: scenario.Steps[0].Text,
				},
			},
			when: observation.submittedAt.UTC(),
		},
		{
			event: EvaluationEvent{
				Kind:            EvaluationEventDirectorReceipt,
				DirectorReceipt: cloneDirectorReceipt(observation.directorReceipt),
			},
			when:    observation.directorReceivedAt.UTC(),
			ordinal: 1,
		},
	}, nil
}

func appendDirectorEventCandidate(
	candidates []evaluationEventCandidate,
	event *director.DirectorEvent,
) ([]evaluationEventCandidate, error) {
	if event == nil {
		return candidates, nil
	}
	emittedAt, err := time.Parse(time.RFC3339Nano, event.EmittedAt)
	if err != nil {
		return nil, fmt.Errorf("parse Director event timestamp: %w", err)
	}
	cloned := *event
	return append(candidates, evaluationEventCandidate{
		event:   EvaluationEvent{Kind: EvaluationEventDirectorState, DirectorEvent: &cloned},
		when:    emittedAt.UTC(),
		ordinal: len(candidates),
	}), nil
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
	candidates []evaluationEventCandidate,
) ([]EvaluationEvent, error) {
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
	observations []agent.TokenUsageObservation,
	recordedAt time.Time,
) ([]EvaluationEvent, error) {
	if len(events)+len(observations) > EvaluationMaximumEvents {
		return nil, fmt.Errorf("evaluation event log would exceed %d entries", EvaluationMaximumEvents)
	}
	appended := append([]EvaluationEvent{}, events...)
	for index := range observations {
		observation := observations[index]
		event := EvaluationEvent{
			SchemaVersion: EvaluationEventSchemaVersion,
			ScenarioID:    scenarioID,
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

func validateEvaluationEvents(events []EvaluationEvent, scenarioIDs []string) error {
	if events == nil {
		return errors.New("evaluation events must be an array, not null")
	}
	if len(events) > EvaluationMaximumEvents {
		return fmt.Errorf("evaluation event log contains %d entries, maximum is %d", len(events), EvaluationMaximumEvents)
	}
	allowed := make(map[string]bool, len(scenarioIDs))
	for _, id := range scenarioIDs {
		allowed[id] = true
	}
	sequences := map[string]int{}
	previousTimes := map[string]time.Time{}
	for index, event := range events {
		if err := event.Validate(); err != nil {
			return fmt.Errorf("evaluation event[%d]: %w", index, err)
		}
		if !allowed[event.ScenarioID] {
			return fmt.Errorf("evaluation event[%d] belongs to unknown scenario %s", index, event.ScenarioID)
		}
		sequences[event.ScenarioID]++
		if event.Sequence != sequences[event.ScenarioID] {
			return fmt.Errorf("evaluation event[%d] sequence is %d, want %d", index, event.Sequence, sequences[event.ScenarioID])
		}
		recordedAt, _ := time.Parse(time.RFC3339Nano, event.RecordedAt)
		if previous, exists := previousTimes[event.ScenarioID]; exists && recordedAt.Before(previous) {
			return fmt.Errorf("evaluation event[%d] precedes the prior event for scenario %s", index, event.ScenarioID)
		}
		previousTimes[event.ScenarioID] = recordedAt
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
		EvaluationEventUserSubmission:  event.UserSubmission != nil,
		EvaluationEventDirectorReceipt: event.DirectorReceipt != nil,
		EvaluationEventDirectorState:   event.DirectorEvent != nil,
		EvaluationEventTrajectory:      event.Trajectory != nil,
		EvaluationEventNarration:       event.Narration != nil,
		EvaluationEventSideTrajectory:  event.SideTrajectory != nil,
		EvaluationEventTokenUsage:      event.TokenUsage != nil,
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
		return ValidateDirectorReceiptForEvaluation(*event.DirectorReceipt)
	case EvaluationEventDirectorState:
		return director.ValidateDirectorEvent(*event.DirectorEvent)
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
	if strings.TrimSpace(submission.Text) == "" ||
		strings.TrimSpace(submission.Text) != submission.Text ||
		len(submission.Text) > ScenarioMaximumMessageBytes {
		return errors.New("evaluation user submission text is invalid")
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
