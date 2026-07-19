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
		ConversationID:            request.ConversationID,
		TurnID:                    &request.TurnID,
		Kind:                      conversation.NarratorContextReadProjection,
		ProjectionThroughSequence: request.ThroughSequence,
		MaxTrajectoryEvents:       request.Limits.MaxTrajectoryEvents,
		MaxFinalSummaries:         request.Limits.RecentFinalSummaries,
	})
	if err != nil {
		return ProjectionContextBundle{}, err
	}
	if err := validateMaterializationSource(
		source,
		request.ConversationID,
		&request.TurnID,
		conversation.NarratorContextReadProjection,
		request.ThroughSequence,
		request.Limits.MaxTrajectoryEvents,
	); err != nil {
		return ProjectionContextBundle{}, err
	}
	return materializeProjection(source, request)
}

func (materializer *ContextMaterializer) Focus(
	ctx context.Context,
	request FocusContextRequest,
) (FocusContextBundle, error) {
	if materializer == nil || materializer.source == nil {
		return FocusContextBundle{}, errors.New("narrator context materializer is required")
	}
	if ctx == nil {
		return FocusContextBundle{}, errors.New("narrator focus context is required")
	}
	if err := validateFocusContextRequest(request); err != nil {
		return FocusContextBundle{}, err
	}
	source, err := materializer.source.ReadNarratorContextSource(ctx, conversation.NarratorContextReadRequest{
		ConversationID:      request.ConversationID,
		TurnID:              &request.TurnID,
		Kind:                conversation.NarratorContextReadStatus,
		MaxTrajectoryEvents: 1,
		MaxFinalSummaries:   0,
	})
	if err != nil {
		return FocusContextBundle{}, err
	}
	if err := validateMaterializationSource(
		source,
		request.ConversationID,
		&request.TurnID,
		conversation.NarratorContextReadStatus,
		0,
		1,
	); err != nil {
		return FocusContextBundle{}, err
	}
	return materializeFocus(source, request)
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
		0,
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
		0,
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
	if request.Trigger == conversation.NarrationTriggerTurnTerminal {
		return materializeTerminalProjection(source, request)
	}
	state := source.NarratorState
	if state.ObservedThroughSequence >= request.ThroughSequence {
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

func materializeTerminalProjection(
	source conversation.NarratorContextSource,
	request ProjectionContextRequest,
) (ProjectionContextBundle, error) {
	state := source.NarratorState
	if source.CurrentTurnFinalSummary != nil || state.ObservedThroughSequence > request.ThroughSequence {
		return ProjectionContextBundle{}, ErrNoProjectionWork
	}
	if state.ObservedThroughSequence == request.ThroughSequence {
		return materializeObservedTerminalProjection(source, request)
	}
	bundle, _, err := newProjectionBundle(source, request)
	if err != nil {
		return ProjectionContextBundle{}, err
	}
	bundle.EvaluationRange = conversation.TrajectorySequenceRange{
		Start: state.ObservedThroughSequence + 1,
		End:   request.ThroughSequence,
	}
	bundle.Trajectory = terminalBoundaryTrajectory(source, request.ThroughSequence)
	if len(bundle.Trajectory) > 0 {
		bundle.IncludedRange = conversation.TrajectorySequenceRange{
			Start: request.ThroughSequence,
			End:   request.ThroughSequence,
		}
	}
	size, err := contextBytes(bundle)
	if err != nil {
		return ProjectionContextBundle{}, err
	}
	if size > request.Limits.MaxInputBytes && len(bundle.Trajectory) > 0 {
		bundle.Trajectory = []conversation.TrajectoryEvent{}
		bundle.IncludedRange = conversation.TrajectorySequenceRange{}
		size, err = contextBytes(bundle)
		if err != nil {
			return ProjectionContextBundle{}, err
		}
	}
	if size > request.Limits.MaxInputBytes {
		return ProjectionContextBundle{}, budgetError(
			ContextKindProjection,
			request.Limits.MaxInputBytes,
			size,
			"authoritative terminal fields and prior narration are required",
		)
	}
	bundle.InputBytes = size
	return bundle, nil
}

func terminalBoundaryTrajectory(
	source conversation.NarratorContextSource,
	throughSequence int,
) []conversation.TrajectoryEvent {
	for _, event := range source.Trajectory.Events {
		if event.Sequence == throughSequence {
			return []conversation.TrajectoryEvent{event}
		}
	}
	return []conversation.TrajectoryEvent{}
}

func materializeObservedTerminalProjection(
	source conversation.NarratorContextSource,
	request ProjectionContextRequest,
) (ProjectionContextBundle, error) {
	bundle, _, err := newProjectionBundle(source, request)
	if err != nil {
		return ProjectionContextBundle{}, err
	}
	bundle.EvaluationRange = conversation.TrajectorySequenceRange{
		Start: request.ThroughSequence,
		End:   request.ThroughSequence,
	}
	size, err := contextBytes(bundle)
	if err != nil {
		return ProjectionContextBundle{}, err
	}
	if size > request.Limits.MaxInputBytes {
		return ProjectionContextBundle{}, budgetError(
			ContextKindProjection,
			request.Limits.MaxInputBytes,
			size,
			"authoritative fields, checkpoint, and terminal final-summary boundary are required",
		)
	}
	bundle.InputBytes = size
	for _, event := range source.Trajectory.Events {
		candidate := bundle
		candidate.Trajectory = appendCopy(bundle.Trajectory, event)
		candidate.IncludedRange = conversation.TrajectorySequenceRange{
			Start: candidate.Trajectory[0].Sequence,
			End:   event.Sequence,
		}
		candidate.InputBytes = 0
		nextSize, sizeErr := contextBytes(candidate)
		if sizeErr != nil {
			return ProjectionContextBundle{}, sizeErr
		}
		if nextSize > request.Limits.MaxInputBytes {
			break
		}
		candidate.InputBytes = nextSize
		bundle = candidate
	}
	return bundle, nil
}

func materializeFocus(
	source conversation.NarratorContextSource,
	request FocusContextRequest,
) (FocusContextBundle, error) {
	if request.SourceSequence > source.Conversation.LastTrajectorySequence {
		return FocusContextBundle{}, fmt.Errorf(
			"narrator focus source sequence %d exceeds conversation %s latest trajectory %d",
			request.SourceSequence,
			request.ConversationID,
			source.Conversation.LastTrajectorySequence,
		)
	}
	if source.CurrentTurn.Turn == nil || source.CurrentTurn.Turn.ID != request.TurnID {
		return FocusContextBundle{}, fmt.Errorf("narrator focus source does not contain target turn %s", request.TurnID)
	}
	bundle := FocusContextBundle{
		Kind:                  ContextKindFocus,
		Trigger:               request.Trigger,
		SourceThroughSequence: request.SourceSequence,
		Authoritative:         authoritativeContext(source),
		PreCallCursor:         narratorCursor(source.NarratorState),
	}
	size, err := contextBytes(bundle)
	if err != nil {
		return FocusContextBundle{}, err
	}
	if size > request.Limits.MaxInputBytes {
		return FocusContextBundle{}, budgetError(
			ContextKindFocus,
			request.Limits.MaxInputBytes,
			size,
			"authoritative fields for stable focus projection are required",
		)
	}
	bundle.InputBytes = size
	return bundle, nil
}

func newProjectionBundle(
	source conversation.NarratorContextSource,
	request ProjectionContextRequest,
) (ProjectionContextBundle, int, error) {
	bundle := ProjectionContextBundle{
		Kind:                     ContextKindProjection,
		Trigger:                  request.Trigger,
		RequestedChannel:         projectionChannel(request.Trigger),
		RequestedThroughSequence: request.ThroughSequence,
		Authoritative:            authoritativeContext(source),
		HistoricalCheckpoint:     historicalCheckpoint(source.NarratorState),
		PreCallCursor:            narratorCursor(source.NarratorState),
		Trajectory:               []conversation.TrajectoryEvent{},
		PriorMilestones:          priorMilestones(source.PriorMilestones),
		PriorFinalSummaries:      priorFinalSummaries(source.RecentFinalSummaries),
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
		Trigger:               conversation.NarrationTriggerExplicitStatusRequested,
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
	var newestEventBytes int
	for index := len(source.Trajectory.Events) - 1; index >= 0; index-- {
		candidate := bundle
		candidate.LatestEvents = prependCopy(source.Trajectory.Events[index], bundle.LatestEvents)
		setStatusRanges(&candidate, source.Trajectory.AvailableRange, source.NarratorState.ObservedThroughSequence)
		size, sizeErr := contextBytes(candidate)
		if sizeErr != nil {
			return StatusContextBundle{}, sizeErr
		}
		if size > request.Limits.MaxInputBytes {
			newestEventBytes = size
			break
		}
		candidate.InputBytes = size
		bundle = candidate
	}
	if source.Trajectory.AvailableRange != nil && len(bundle.LatestEvents) == 0 {
		return StatusContextBundle{}, budgetError(
			ContextKindStatus,
			request.Limits.MaxInputBytes,
			newestEventBytes,
			"the latest complete trajectory event is required for current status",
		)
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
		Trigger:                   conversation.NarrationTriggerCheckpointWindowExceeded,
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
