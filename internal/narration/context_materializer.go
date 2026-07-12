package narration

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/conversation"
)

type ContextSource interface {
	ReadNarratorContextSource(
		context.Context,
		conversation.NarratorContextReadRequest,
	) (conversation.NarratorContextSource, error)
}

type ContextMaterializer struct {
	source ContextSource
}

func NewContextMaterializer(source ContextSource) (*ContextMaterializer, error) {
	if source == nil {
		return nil, errors.New("narrator context source is required")
	}
	return &ContextMaterializer{source: source}, nil
}

func (materializer *ContextMaterializer) Projection(
	ctx context.Context,
	request ProjectionContextRequest,
) (ProjectionContextBundle, error) {
	if materializer == nil || materializer.source == nil {
		return ProjectionContextBundle{}, errors.New("narrator context materializer is required")
	}
	if ctx == nil {
		return ProjectionContextBundle{}, errors.New("narrator projection context is required")
	}
	if err := validateProjectionContextRequest(request); err != nil {
		return ProjectionContextBundle{}, err
	}
	source, err := materializer.source.ReadNarratorContextSource(ctx, conversation.NarratorContextReadRequest{
		ConversationID:      request.ConversationID,
		TurnID:              &request.TurnID,
		Kind:                conversation.NarratorContextReadProjection,
		MaxTrajectoryEvents: request.Limits.MaxTrajectoryEvents,
		MaxFinalSummaries:   request.Limits.RecentFinalSummaries,
	})
	if err != nil {
		return ProjectionContextBundle{}, err
	}
	if err := validateMaterializationSource(
		source,
		request.ConversationID,
		&request.TurnID,
		conversation.NarratorContextReadProjection,
		request.Limits.MaxTrajectoryEvents,
	); err != nil {
		return ProjectionContextBundle{}, err
	}
	return materializeProjection(source, request)
}

func (materializer *ContextMaterializer) Status(
	ctx context.Context,
	request StatusContextRequest,
) (StatusContextBundle, error) {
	if materializer == nil || materializer.source == nil {
		return StatusContextBundle{}, errors.New("narrator context materializer is required")
	}
	if ctx == nil {
		return StatusContextBundle{}, errors.New("narrator status context is required")
	}
	if err := validateStatusContextRequest(request); err != nil {
		return StatusContextBundle{}, err
	}
	source, err := materializer.source.ReadNarratorContextSource(ctx, conversation.NarratorContextReadRequest{
		ConversationID:      request.ConversationID,
		TurnID:              request.TurnID,
		Kind:                conversation.NarratorContextReadStatus,
		MaxTrajectoryEvents: request.Limits.MaxTrajectoryEvents,
		MaxFinalSummaries:   request.Limits.RecentFinalSummaries,
	})
	if err != nil {
		return StatusContextBundle{}, err
	}
	if err := validateMaterializationSource(
		source,
		request.ConversationID,
		request.TurnID,
		conversation.NarratorContextReadStatus,
		request.Limits.MaxTrajectoryEvents,
	); err != nil {
		return StatusContextBundle{}, err
	}
	return materializeStatus(source, request)
}

func (materializer *ContextMaterializer) Checkpoint(
	ctx context.Context,
	request CheckpointContextRequest,
) (CheckpointContextBundle, error) {
	if materializer == nil || materializer.source == nil {
		return CheckpointContextBundle{}, errors.New("narrator context materializer is required")
	}
	if ctx == nil {
		return CheckpointContextBundle{}, errors.New("narrator checkpoint context is required")
	}
	if err := validateCheckpointContextRequest(request); err != nil {
		return CheckpointContextBundle{}, err
	}
	source, err := materializer.source.ReadNarratorContextSource(ctx, conversation.NarratorContextReadRequest{
		ConversationID:      request.ConversationID,
		TurnID:              request.TurnID,
		Kind:                conversation.NarratorContextReadCheckpoint,
		MaxTrajectoryEvents: request.Limits.MaxTrajectoryEvents,
		MaxFinalSummaries:   0,
	})
	if err != nil {
		return CheckpointContextBundle{}, err
	}
	if err := validateMaterializationSource(
		source,
		request.ConversationID,
		request.TurnID,
		conversation.NarratorContextReadCheckpoint,
		request.Limits.MaxTrajectoryEvents,
	); err != nil {
		return CheckpointContextBundle{}, err
	}
	return materializeCheckpoint(source, request)
}

func materializeProjection(
	source conversation.NarratorContextSource,
	request ProjectionContextRequest,
) (ProjectionContextBundle, error) {
	state := source.NarratorState
	if state.ObservedThroughSequence >= source.Conversation.LastTrajectorySequence {
		return ProjectionContextBundle{}, ErrNoProjectionWork
	}
	bundle, baseBytes, err := newProjectionBundle(source, request)
	if err != nil {
		return ProjectionContextBundle{}, err
	}
	if baseBytes > request.Limits.MaxInputBytes {
		return ProjectionContextBundle{}, budgetError(
			ContextKindProjection,
			request.Limits.MaxInputBytes,
			baseBytes,
			"authoritative fields, checkpoint, and prior narration are required",
		)
	}
	bundle, firstRejectedBytes, err := selectProjectionTrajectory(bundle, source, request.Limits.MaxInputBytes)
	if err != nil {
		return ProjectionContextBundle{}, err
	}
	if projectionCanAdvance(bundle, state) {
		return bundle, nil
	}
	return ProjectionContextBundle{}, projectionAdvanceError(source, request, baseBytes, firstRejectedBytes)
}

func newProjectionBundle(
	source conversation.NarratorContextSource,
	request ProjectionContextRequest,
) (ProjectionContextBundle, int, error) {
	bundle := ProjectionContextBundle{
		Kind:                 ContextKindProjection,
		Trigger:              request.Trigger,
		RequestedChannel:     projectionChannel(request.Trigger),
		Authoritative:        authoritativeContext(source),
		HistoricalCheckpoint: historicalCheckpoint(source.NarratorState),
		PreCallCursor:        narratorCursor(source.NarratorState),
		Trajectory:           []conversation.TrajectoryEvent{},
		PriorMilestones:      priorMilestones(source.PriorMilestones),
		PriorFinalSummaries:  priorFinalSummaries(source.RecentFinalSummaries),
	}
	baseBytes, err := contextBytes(bundle)
	return bundle, baseBytes, err
}

func selectProjectionTrajectory(
	bundle ProjectionContextBundle,
	source conversation.NarratorContextSource,
	maxInputBytes int,
) (ProjectionContextBundle, int, error) {
	state := source.NarratorState
	var firstRejectedBytes int
	for _, event := range source.Trajectory.Events {
		candidate := bundle
		candidate.Trajectory = appendCopy(bundle.Trajectory, event)
		candidate.IncludedRange = conversation.TrajectorySequenceRange{
			Start: candidate.Trajectory[0].Sequence,
			End:   event.Sequence,
		}
		if event.Sequence > state.ObservedThroughSequence {
			candidate.EvaluationRange = conversation.TrajectorySequenceRange{
				Start: state.ObservedThroughSequence + 1,
				End:   event.Sequence,
			}
			candidate.RemainingUnobservedRange = sequenceRange(
				event.Sequence+1,
				source.Conversation.LastTrajectorySequence,
			)
		}
		size, sizeErr := contextBytes(candidate)
		if sizeErr != nil {
			return ProjectionContextBundle{}, 0, sizeErr
		}
		if size > maxInputBytes {
			firstRejectedBytes = size
			break
		}
		candidate.InputBytes = size
		bundle = candidate
	}
	return bundle, firstRejectedBytes, nil
}

func projectionCanAdvance(bundle ProjectionContextBundle, state conversation.NarratorState) bool {
	return len(bundle.Trajectory) > 0 &&
		bundle.Trajectory[len(bundle.Trajectory)-1].Sequence > state.ObservedThroughSequence
}

func projectionAdvanceError(
	source conversation.NarratorContextSource,
	request ProjectionContextRequest,
	baseBytes int,
	firstRejectedBytes int,
) error {
	state := source.NarratorState
	if state.CheckpointThroughSequence < state.ObservedThroughSequence {
		return &CheckpointRequiredError{
			CheckpointThroughSequence: state.CheckpointThroughSequence,
			ObservedThroughSequence:   state.ObservedThroughSequence,
			NextUnobservedSequence:    state.ObservedThroughSequence + 1,
			Reason:                    "the complete observed tail plus the next unevaluated event does not fit",
		}
	}
	if firstRejectedBytes == 0 {
		firstRejectedBytes = baseBytes
	}
	return budgetError(
		ContextKindProjection,
		request.Limits.MaxInputBytes,
		firstRejectedBytes,
		"the next complete trajectory event is required for ordered evaluation",
	)
}

func materializeStatus(
	source conversation.NarratorContextSource,
	request StatusContextRequest,
) (StatusContextBundle, error) {
	bundle := StatusContextBundle{
		Kind:                  ContextKindStatus,
		Question:              request.Question,
		Authoritative:         authoritativeContext(source),
		PreCallCursor:         narratorCursor(source.NarratorState),
		LatestEvents:          []conversation.TrajectoryEvent{},
		SourceThroughSequence: source.Conversation.LastTrajectorySequence,
		RecentFinalSummaries:  priorFinalSummaries(source.RecentFinalSummaries),
	}
	setStatusRanges(&bundle, source.Trajectory.AvailableRange, source.NarratorState.ObservedThroughSequence)
	baseBytes, err := contextBytes(bundle)
	if err != nil {
		return StatusContextBundle{}, err
	}
	if baseBytes > request.Limits.MaxInputBytes {
		return StatusContextBundle{}, budgetError(
			ContextKindStatus,
			request.Limits.MaxInputBytes,
			baseBytes,
			"the question and authoritative current-state projection are required",
		)
	}
	bundle.InputBytes = baseBytes
	for index := len(source.Trajectory.Events) - 1; index >= 0; index-- {
		candidate := bundle
		candidate.LatestEvents = prependCopy(source.Trajectory.Events[index], bundle.LatestEvents)
		setStatusRanges(&candidate, source.Trajectory.AvailableRange, source.NarratorState.ObservedThroughSequence)
		size, sizeErr := contextBytes(candidate)
		if sizeErr != nil {
			return StatusContextBundle{}, sizeErr
		}
		if size > request.Limits.MaxInputBytes {
			break
		}
		candidate.InputBytes = size
		bundle = candidate
	}
	return bundle, nil
}

func materializeCheckpoint(
	source conversation.NarratorContextSource,
	request CheckpointContextRequest,
) (CheckpointContextBundle, error) {
	if source.NarratorState.CheckpointThroughSequence >= source.NarratorState.ObservedThroughSequence {
		return CheckpointContextBundle{}, ErrNoCheckpointWork
	}
	bundle := CheckpointContextBundle{
		Kind:                      ContextKindCheckpoint,
		Authoritative:             authoritativeContext(source),
		HistoricalCheckpoint:      historicalCheckpoint(source.NarratorState),
		PreCallCursor:             narratorCursor(source.NarratorState),
		Trajectory:                []conversation.TrajectoryEvent{},
		MaxHistoricalSummaryBytes: request.Limits.MaxCheckpointSummaryBytes,
	}
	baseBytes, err := contextBytes(bundle)
	if err != nil {
		return CheckpointContextBundle{}, err
	}
	if baseBytes > request.Limits.MaxInputBytes {
		return CheckpointContextBundle{}, budgetError(
			ContextKindCheckpoint,
			request.Limits.MaxInputBytes,
			baseBytes,
			"current authoritative fields and the previous checkpoint are required",
		)
	}
	var firstRejectedBytes int
	for _, event := range source.Trajectory.Events {
		candidate := bundle
		candidate.Trajectory = appendCopy(bundle.Trajectory, event)
		candidate.RequestedRange = conversation.TrajectorySequenceRange{
			Start: source.NarratorState.CheckpointThroughSequence + 1,
			End:   event.Sequence,
		}
		candidate.RemainingEligibleRange = sequenceRange(
			event.Sequence+1,
			source.NarratorState.ObservedThroughSequence,
		)
		size, sizeErr := contextBytes(candidate)
		if sizeErr != nil {
			return CheckpointContextBundle{}, sizeErr
		}
		if size > request.Limits.MaxInputBytes {
			firstRejectedBytes = size
			break
		}
		candidate.InputBytes = size
		bundle = candidate
	}
	if len(bundle.Trajectory) == 0 {
		if firstRejectedBytes == 0 {
			firstRejectedBytes = baseBytes
		}
		return CheckpointContextBundle{}, budgetError(
			ContextKindCheckpoint,
			request.Limits.MaxInputBytes,
			firstRejectedBytes,
			"at least one complete already-observed event is required",
		)
	}
	return bundle, nil
}

func validateMaterializationSource(
	source conversation.NarratorContextSource,
	conversationID string,
	turnID *string,
	kind conversation.NarratorContextReadKind,
	maxTrajectoryEvents int,
) error {
	if err := validateMaterializationIdentity(source, conversationID); err != nil {
		return err
	}
	if err := validateMaterializationTurn(source, turnID); err != nil {
		return err
	}
	if err := validateMaterializationTrajectory(source, conversationID, kind, maxTrajectoryEvents); err != nil {
		return err
	}
	return validateMaterializationNarration(source)
}

func validateMaterializationIdentity(source conversation.NarratorContextSource, conversationID string) error {
	if err := source.Conversation.Validate(); err != nil {
		return fmt.Errorf("narrator context conversation: %w", err)
	}
	if err := source.NarratorState.Validate(); err != nil {
		return fmt.Errorf("narrator context state: %w", err)
	}
	if source.Conversation.ID != conversationID || source.NarratorState.ConversationID != conversationID {
		return fmt.Errorf("narrator context source does not belong to conversation %s", conversationID)
	}
	if source.NarratorState.ObservedThroughSequence > source.Conversation.LastTrajectorySequence {
		return fmt.Errorf("narrator observed cursor exceeds latest trajectory")
	}
	return nil
}

func validateMaterializationTurn(source conversation.NarratorContextSource, turnID *string) error {
	if turnID != nil {
		if source.CurrentTurn.Turn == nil || source.CurrentTurn.Turn.ID != *turnID {
			return fmt.Errorf("narrator context source does not contain target turn %s", *turnID)
		}
	}
	current := source.CurrentTurn
	if current.AcceptedSteering == nil || current.ActiveActivities == nil || current.PendingApprovals == nil ||
		current.ActiveSubagents == nil || current.Artifacts == nil {
		return fmt.Errorf("narrator authoritative current-state collections must not be nil")
	}
	return nil
}

func validateMaterializationTrajectory(
	source conversation.NarratorContextSource,
	conversationID string,
	kind conversation.NarratorContextReadKind,
	maxTrajectoryEvents int,
) error {
	if source.Trajectory.Events == nil {
		return fmt.Errorf("narrator context source collections must not be nil")
	}
	if len(source.Trajectory.Events) > maxTrajectoryEvents {
		return fmt.Errorf("narrator context source exceeds its requested trajectory limit")
	}
	if err := validateMaterializationWindowCoverage(source, kind); err != nil {
		return err
	}
	previous := 0
	for _, event := range source.Trajectory.Events {
		if err := event.Validate(); err != nil {
			return fmt.Errorf("narrator context trajectory: %w", err)
		}
		if event.ConversationID != conversationID || (previous != 0 && event.Sequence != previous+1) {
			return fmt.Errorf("narrator context trajectory is not a contiguous conversation range")
		}
		previous = event.Sequence
	}
	return nil
}

func validateMaterializationWindowCoverage(
	source conversation.NarratorContextSource,
	kind conversation.NarratorContextReadKind,
) error {
	start := source.NarratorState.CheckpointThroughSequence + 1
	end := source.Conversation.LastTrajectorySequence
	if kind == conversation.NarratorContextReadCheckpoint {
		end = source.NarratorState.ObservedThroughSequence
	}
	window := source.Trajectory
	if start > end {
		return validateEmptyMaterializationWindow(window)
	}
	return validateNonemptyMaterializationWindow(window, kind, start, end)
}

func validateEmptyMaterializationWindow(window conversation.NarratorTrajectoryWindow) error {
	if window.AvailableRange != nil || window.IncludedRange != nil || len(window.Events) != 0 ||
		window.HasEarlier || window.HasLater {
		return fmt.Errorf("empty narrator materialization range contains trajectory")
	}
	return nil
}

func validateNonemptyMaterializationWindow(
	window conversation.NarratorTrajectoryWindow,
	kind conversation.NarratorContextReadKind,
	start int,
	end int,
) error {
	wantAvailable := conversation.TrajectorySequenceRange{Start: start, End: end}
	if window.AvailableRange == nil || *window.AvailableRange != wantAvailable ||
		window.IncludedRange == nil || len(window.Events) == 0 {
		return fmt.Errorf("narrator materialization source range is incomplete")
	}
	return validateMaterializationWindowShape(window, kind, start, end)
}

func validateMaterializationWindowShape(
	window conversation.NarratorTrajectoryWindow,
	kind conversation.NarratorContextReadKind,
	start int,
	end int,
) error {
	included := conversation.TrajectorySequenceRange{
		Start: window.Events[0].Sequence,
		End:   window.Events[len(window.Events)-1].Sequence,
	}
	if *window.IncludedRange != included {
		return fmt.Errorf("narrator materialization included range does not match its events")
	}
	if kind == conversation.NarratorContextReadStatus {
		if window.HasLater || included.End != end || window.HasEarlier != (included.Start > start) {
			return fmt.Errorf("narrator status source is not the latest trajectory suffix")
		}
		return nil
	}
	if window.HasEarlier || included.Start != start || window.HasLater != (included.End < end) {
		return fmt.Errorf("narrator projection source is not the earliest trajectory prefix")
	}
	return nil
}

func validateMaterializationNarration(source conversation.NarratorContextSource) error {
	if source.PriorMilestones == nil || source.RecentFinalSummaries == nil {
		return fmt.Errorf("narrator prior-output collections must not be nil")
	}
	for _, event := range source.PriorMilestones {
		if event.Milestone == nil {
			return fmt.Errorf("narrator prior milestone %s has no milestone payload", event.ID)
		}
	}
	for _, event := range source.RecentFinalSummaries {
		if event.FinalSummary == nil || event.TurnID == nil {
			return fmt.Errorf("narrator prior final summary %s is incomplete", event.ID)
		}
	}
	return nil
}

func authoritativeContext(source conversation.NarratorContextSource) AuthoritativeContext {
	current := source.CurrentTurn
	var instructions *CurrentInstructions
	if current.Turn != nil {
		instructions = &CurrentInstructions{
			TurnID:           current.Turn.ID,
			TurnStatus:       current.Turn.Status,
			Objective:        current.Turn.AuthoredInput,
			AcceptedSteering: append([]conversation.NarratorAcceptedSteering{}, current.AcceptedSteering...),
			Authority:        ContextAuthorityCurrentInputs,
		}
	}
	return AuthoritativeContext{
		Conversation: ConversationIdentity{
			ConversationID:           source.Conversation.ID,
			WorkspaceID:              source.Conversation.WorkspaceID,
			Title:                    source.Conversation.Title,
			TopicDescriptor:          source.Conversation.TopicDescriptor,
			NarratorTopicDescriptor:  source.NarratorState.TopicDescriptor,
			Status:                   source.Conversation.Status,
			LatestTrajectorySequence: source.Conversation.LastTrajectorySequence,
		},
		CurrentInstructions: instructions,
		CurrentPlan:         current.Plan,
		ActiveActivities:    append([]conversation.NarratorActiveActivity{}, current.ActiveActivities...),
		PendingApprovals:    append([]conversation.NarratorPendingApproval{}, current.PendingApprovals...),
		ActiveSubagents:     append([]conversation.NarratorActiveSubagent{}, current.ActiveSubagents...),
		Artifacts:           append([]conversation.Artifact{}, current.Artifacts...),
		CurrentFocus:        source.NarratorState.CurrentFocus,
	}
}

func historicalCheckpoint(state conversation.NarratorState) *HistoricalCheckpoint {
	if state.CheckpointThroughSequence == 0 {
		return nil
	}
	return &HistoricalCheckpoint{
		CoveredThroughSequence: state.CheckpointThroughSequence,
		HistoricalSummary:      state.CheckpointText,
		Authority:              ContextAuthorityHistorical,
	}
}

func narratorCursor(state conversation.NarratorState) NarratorCursor {
	return NarratorCursor{
		ObservedThroughSequence:   state.ObservedThroughSequence,
		CheckpointThroughSequence: state.CheckpointThroughSequence,
		CurrentFocusRevision:      state.CurrentFocusRevision,
		UpdatedAt:                 state.UpdatedAt,
	}
}

func priorMilestones(events []conversation.NarrationEvent) []PriorMilestone {
	result := make([]PriorMilestone, 0, len(events))
	for _, event := range events {
		result = append(result, PriorMilestone{
			ID:                  event.ID,
			SourceSequenceStart: event.SourceSequenceStart,
			SourceSequenceEnd:   event.SourceSequenceEnd,
			Text:                event.Milestone.Text,
			CreatedAt:           event.CreatedAt,
		})
	}
	return result
}

func priorFinalSummaries(events []conversation.NarrationEvent) []PriorFinalSummary {
	result := make([]PriorFinalSummary, 0, len(events))
	for _, event := range events {
		result = append(result, PriorFinalSummary{
			ID:                  event.ID,
			TurnID:              *event.TurnID,
			SourceSequenceStart: event.SourceSequenceStart,
			SourceSequenceEnd:   event.SourceSequenceEnd,
			Text:                event.FinalSummary.Text,
			CreatedAt:           event.CreatedAt,
		})
	}
	return result
}

func projectionChannel(trigger conversation.NarrationTrigger) ProjectionChannel {
	if trigger == conversation.NarrationTriggerTurnTerminal {
		return ProjectionChannelTerminal
	}
	return ProjectionChannelWorking
}

func setStatusRanges(
	bundle *StatusContextBundle,
	available *conversation.TrajectorySequenceRange,
	observedThrough int,
) {
	bundle.IncludedRange = nil
	bundle.OmittedTrajectoryRange = nil
	bundle.OmittedUnobservedRange = nil
	if available == nil {
		return
	}
	omittedEnd := available.End
	if len(bundle.LatestEvents) > 0 {
		bundle.IncludedRange = sequenceRange(
			bundle.LatestEvents[0].Sequence,
			bundle.LatestEvents[len(bundle.LatestEvents)-1].Sequence,
		)
		omittedEnd = bundle.LatestEvents[0].Sequence - 1
	}
	bundle.OmittedTrajectoryRange = sequenceRange(available.Start, omittedEnd)
	if bundle.OmittedTrajectoryRange != nil {
		bundle.OmittedUnobservedRange = intersectRanges(
			*bundle.OmittedTrajectoryRange,
			conversation.TrajectorySequenceRange{Start: observedThrough + 1, End: available.End},
		)
	}
}

func intersectRanges(
	left conversation.TrajectorySequenceRange,
	right conversation.TrajectorySequenceRange,
) *conversation.TrajectorySequenceRange {
	start := max(left.Start, right.Start)
	end := min(left.End, right.End)
	return sequenceRange(start, end)
}

func sequenceRange(start int, end int) *conversation.TrajectorySequenceRange {
	if start <= 0 || end < start {
		return nil
	}
	return &conversation.TrajectorySequenceRange{Start: start, End: end}
}

func appendCopy(events []conversation.TrajectoryEvent, event conversation.TrajectoryEvent) []conversation.TrajectoryEvent {
	result := make([]conversation.TrajectoryEvent, len(events), len(events)+1)
	copy(result, events)
	return append(result, event)
}

func prependCopy(event conversation.TrajectoryEvent, events []conversation.TrajectoryEvent) []conversation.TrajectoryEvent {
	result := make([]conversation.TrajectoryEvent, len(events)+1)
	result[0] = event
	copy(result[1:], events)
	return result
}

func contextBytes(value any) (int, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return 0, fmt.Errorf("encode narrator context: %w", err)
	}
	return len(encoded), nil
}

func budgetError(kind ContextKind, limit int, required int, reason string) *ContextBudgetError {
	return &ContextBudgetError{
		Kind:          kind,
		MaxInputBytes: limit,
		RequiredBytes: required,
		Reason:        reason,
	}
}
