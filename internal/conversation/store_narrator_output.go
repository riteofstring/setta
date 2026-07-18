package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

func (store *Store) CommitNarratorProjection(
	ctx context.Context,
	request NarratorProjectionCommit,
) (NarratorProjectionCommitResult, error) {
	if store == nil {
		return NarratorProjectionCommitResult{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return NarratorProjectionCommitResult{}, errors.New("narrator projection commit context is required")
	}
	if err := request.Validate(); err != nil {
		return NarratorProjectionCommitResult{}, err
	}
	var committed NarratorProjectionCommitResult
	_, err := store.transactPresentationAware(ctx, "commit narrator projection", func(transaction *WriteTransaction) error {
		result, err := commitNarratorProjection(transaction, request)
		if err != nil {
			return err
		}
		committed = result
		return nil
	})
	if err != nil {
		return NarratorProjectionCommitResult{}, err
	}
	return committed, nil
}

func (store *Store) CommitNarratorFocus(
	ctx context.Context,
	request NarratorFocusCommit,
) (NarratorFocusCommitResult, error) {
	if store == nil {
		return NarratorFocusCommitResult{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return NarratorFocusCommitResult{}, errors.New("narrator focus commit context is required")
	}
	if err := request.Validate(); err != nil {
		return NarratorFocusCommitResult{}, err
	}
	var committed NarratorFocusCommitResult
	_, err := store.transactPresentationAware(ctx, "commit narrator focus", func(transaction *WriteTransaction) error {
		result, err := commitNarratorFocus(transaction, request)
		if err != nil {
			return err
		}
		committed = result
		return nil
	})
	if err != nil {
		return NarratorFocusCommitResult{}, err
	}
	return committed, nil
}

func (store *Store) CommitNarratorStatus(
	ctx context.Context,
	request NarratorStatusCommit,
) (NarratorStatusCommitResult, error) {
	if store == nil {
		return NarratorStatusCommitResult{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return NarratorStatusCommitResult{}, errors.New("narrator status commit context is required")
	}
	if err := request.Validate(); err != nil {
		return NarratorStatusCommitResult{}, err
	}
	var committed NarratorStatusCommitResult
	_, err := store.transactPresentationAware(ctx, "commit narrator status reply", func(transaction *WriteTransaction) error {
		result, err := commitNarratorStatus(transaction, request)
		if err != nil {
			return err
		}
		committed = result
		return nil
	})
	if err != nil {
		return NarratorStatusCommitResult{}, err
	}
	return committed, nil
}

func commitNarratorProjection(
	transaction *WriteTransaction,
	request NarratorProjectionCommit,
) (NarratorProjectionCommitResult, error) {
	state, err := readNarratorStateForMutation(transaction, request.ConversationID)
	if err != nil {
		return NarratorProjectionCommitResult{}, err
	}
	if err := requireNarratorProjectionCoverage(transaction, request); err != nil {
		return NarratorProjectionCommitResult{}, err
	}
	if err := requireProjectionMilestoneBudget(transaction, request); err != nil {
		return NarratorProjectionCommitResult{}, err
	}
	state.ObservedThroughSequence = request.ObservedThroughSequence
	state.LastInvocationAt = stringPointerValue(request.CommittedAt)
	state.Status = NarratorStatusReady
	state.Degradation = nil
	state.UpdatedAt = request.CommittedAt
	if err := transaction.UpdateNarratorState(request.Expected, state); err != nil {
		return NarratorProjectionCommitResult{}, err
	}

	result := NarratorProjectionCommitResult{State: state, Events: []NarrationEvent{}}
	events, err := appendProjectionNarrationEvents(transaction, request)
	if err != nil {
		return NarratorProjectionCommitResult{}, err
	}
	result.Events = events
	if err := publishNarratorProjection(transaction, request, result); err != nil {
		return NarratorProjectionCommitResult{}, err
	}
	return result, nil
}

func commitNarratorFocus(
	transaction *WriteTransaction,
	request NarratorFocusCommit,
) (NarratorFocusCommitResult, error) {
	state, err := readNarratorStateForMutation(transaction, request.ConversationID)
	if err != nil {
		return NarratorFocusCommitResult{}, err
	}
	if state.CurrentFocusRevision != request.Expected.CurrentFocusRevision {
		return NarratorFocusCommitResult{}, stateConflict(
			"narrator focus",
			request.ConversationID,
			fmt.Sprintf("focus revision is %d, want %d", state.CurrentFocusRevision, request.Expected.CurrentFocusRevision),
		)
	}
	if err := requireNarratorFocusSource(transaction, request); err != nil {
		return NarratorFocusCommitResult{}, err
	}
	updated := state
	updated.CurrentFocus = request.CurrentFocus
	if narratorFocusRevisionChanged(state, request) {
		updated.CurrentFocusRevision = state.CurrentFocusRevision + 1
	}
	if request.TopicDescriptor != nil {
		updated.TopicDescriptor = request.TopicDescriptor.Text
	}
	updated.LastInvocationAt = stringPointerValue(request.CommittedAt)
	updated.Status = NarratorStatusReady
	updated.Degradation = nil
	updated.UpdatedAt = advanceTimestamp(state.UpdatedAt, request.CommittedAt)
	if err := transaction.UpdateNarratorState(narratorStateExpectationFromState(state), updated); err != nil {
		return NarratorFocusCommitResult{}, err
	}

	result := NarratorFocusCommitResult{State: updated}
	if request.TopicDescriptor != nil {
		event := narratorFocusTopicDescriptorEvent(request, updated.UpdatedAt)
		appended, err := transaction.AppendNarrationEvent(event)
		if err != nil {
			return NarratorFocusCommitResult{}, err
		}
		result.Event = &appended
	}
	if err := publishNarratorFocus(transaction, request, result); err != nil {
		return NarratorFocusCommitResult{}, err
	}
	return result, nil
}

func narratorFocusRevisionChanged(state NarratorState, request NarratorFocusCommit) bool {
	if request.CurrentFocus != state.CurrentFocus {
		return true
	}
	return request.TopicDescriptor != nil && request.TopicDescriptor.Text != state.TopicDescriptor
}

func commitNarratorStatus(
	transaction *WriteTransaction,
	request NarratorStatusCommit,
) (NarratorStatusCommitResult, error) {
	state, err := readNarratorStateForMutation(transaction, request.ConversationID)
	if err != nil {
		return NarratorStatusCommitResult{}, err
	}
	state.LastInvocationAt = stringPointerValue(request.CommittedAt)
	state.Status = NarratorStatusReady
	state.Degradation = nil
	state.UpdatedAt = request.CommittedAt
	if err := transaction.UpdateNarratorState(request.Expected, state); err != nil {
		return NarratorStatusCommitResult{}, err
	}
	event, err := transaction.AppendNarrationEvent(NarrationEvent{
		ID:                  request.Reply.NarrationEventID,
		ConversationID:      request.ConversationID,
		TurnID:              cloneOptionalStringValue(request.TurnID),
		Kind:                NarrationEventKindStatusReply,
		SourceSequenceStart: request.SourceSequenceStart,
		SourceSequenceEnd:   request.SourceThroughSequence,
		Trigger:             NarrationTriggerExplicitStatusRequested,
		ResolvedInvocation:  request.ResolvedInvocation,
		CreatedAt:           request.CommittedAt,
		StatusReply: &NarrationStatusReply{
			Question: request.Question,
			Text:     request.Reply.Text,
		},
	})
	if err != nil {
		return NarratorStatusCommitResult{}, err
	}
	result := NarratorStatusCommitResult{State: state, Event: event}
	if err := appendNarratorCommittedEvent(
		transaction,
		request.NarratorStateCommittedID,
		request.ConversationID,
		ConversationEventTypeNarratorStateUpdated,
		ConversationNarratorStateUpdatedEventPayload{
			Type:  ConversationEventTypeNarratorStateUpdated,
			State: state,
		},
		request.CommittedAt,
	); err != nil {
		return NarratorStatusCommitResult{}, err
	}
	if err := appendNarratorCommittedEvent(
		transaction,
		request.Reply.CommittedEventID,
		request.ConversationID,
		ConversationEventTypeNarrationCreated,
		ConversationNarrationCreatedEventPayload{
			Type:  ConversationEventTypeNarrationCreated,
			Event: event,
		},
		request.CommittedAt,
	); err != nil {
		return NarratorStatusCommitResult{}, err
	}
	return result, nil
}

func requireNarratorProjectionCoverage(
	transaction *WriteTransaction,
	request NarratorProjectionCommit,
) error {
	sourceRange := narratorProjectionSourceRange(request)
	start := sourceRange.Start
	wantCount := request.ObservedThroughSequence - start + 1
	var count int
	if err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT COUNT(*)
FROM trajectory_events
WHERE conversation_id = ? AND sequence BETWEEN ? AND ?
`, request.ConversationID, start, request.ObservedThroughSequence).Scan(&count); err != nil {
		return fmt.Errorf("read narrator projection trajectory coverage for %s: %w", request.ConversationID, err)
	}
	if count != wantCount {
		return stateConflict(
			"narrator projection",
			request.ConversationID,
			fmt.Sprintf("trajectory range %d..%d is not contiguous", start, request.ObservedThroughSequence),
		)
	}
	if request.Trigger != NarrationTriggerTurnTerminal {
		return nil
	}
	return requireTerminalNarratorProjection(transaction, request)
}

func requireProjectionMilestoneBudget(
	transaction *WriteTransaction,
	request NarratorProjectionCommit,
) error {
	if len(request.Milestones) == 0 {
		return nil
	}
	if err := requireNoOverlappingMilestoneRange(transaction, request); err != nil {
		return err
	}
	if err := requireUniqueMilestoneText(transaction, request); err != nil {
		return err
	}
	return requireAutomaticMilestoneCadence(transaction, request)
}

func requireNoOverlappingMilestoneRange(
	transaction *WriteTransaction,
	request NarratorProjectionCommit,
) error {
	sourceRange := narratorProjectionSourceRange(request)
	start := sourceRange.Start
	end := sourceRange.End
	var existing int
	if err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT COUNT(*)
FROM narration_events
WHERE conversation_id = ?
  AND turn_id = ?
  AND kind = 'milestone'
  AND NOT (source_sequence_end < ? OR source_sequence_start > ?)
`, request.ConversationID, request.TurnID, start, end).Scan(&existing); err != nil {
		return fmt.Errorf("read narrator milestone source ranges for %s: %w", request.ConversationID, err)
	}
	if existing > 0 {
		return stateConflict(
			"narrator milestone",
			request.ConversationID,
			fmt.Sprintf("source range %d..%d already produced a milestone", start, end),
		)
	}
	return nil
}

func requireUniqueMilestoneText(
	transaction *WriteTransaction,
	request NarratorProjectionCommit,
) error {
	text := request.Milestones[0].Text
	var existing int
	if err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT COUNT(*)
FROM narration_events
WHERE conversation_id = ?
  AND turn_id = ?
  AND kind = 'milestone'
  AND json_extract(payload_json, '$.text') = ?
`, request.ConversationID, request.TurnID, text).Scan(&existing); err != nil {
		return fmt.Errorf("read narrator milestone text for %s: %w", request.ConversationID, err)
	}
	if existing > 0 {
		return stateConflict(
			"narrator milestone",
			request.ConversationID,
			fmt.Sprintf("milestone text %q was already committed for this turn", text),
		)
	}
	return nil
}

func requireAutomaticMilestoneCadence(
	transaction *WriteTransaction,
	request NarratorProjectionCommit,
) error {
	if !automaticMilestoneTrigger(request.Trigger) {
		return nil
	}
	var count int
	var lastCreatedAt sql.NullString
	if err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT COUNT(*), MAX(created_at)
FROM narration_events
WHERE conversation_id = ?
  AND turn_id = ?
  AND kind = 'milestone'
  AND trigger IN ('progress_window_elapsed', 'plan_changed', 'phase_activity_completed', 'user_steered')
`, request.ConversationID, request.TurnID).Scan(&count, &lastCreatedAt); err != nil {
		return fmt.Errorf("read narrator automatic milestone budget for %s: %w", request.ConversationID, err)
	}
	if count >= 6 {
		return stateConflict("narrator milestone", request.ConversationID, "automatic milestone budget is exhausted for this turn")
	}
	if !lastCreatedAt.Valid {
		return nil
	}
	last, err := validateTimestamp("last automatic narrator milestone", lastCreatedAt.String)
	if err != nil {
		return err
	}
	current, err := validateTimestamp("narrator milestone committedAt", request.CommittedAt)
	if err != nil {
		return err
	}
	if current.Sub(last) < 30*time.Second {
		return stateConflict(
			"narrator milestone",
			request.ConversationID,
			"automatic milestone spacing is below 30 seconds",
		)
	}
	return nil
}

func automaticMilestoneTrigger(trigger NarrationTrigger) bool {
	switch trigger {
	case NarrationTriggerProgressWindowElapsed,
		NarrationTriggerPlanChanged,
		NarrationTriggerPhaseActivityCompleted,
		NarrationTriggerUserSteered:
		return true
	default:
		return false
	}
}

func requireNarratorFocusSource(
	transaction *WriteTransaction,
	request NarratorFocusCommit,
) error {
	var turnID string
	var kind TrajectoryEventKind
	err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT turn_id, kind
FROM trajectory_events
WHERE conversation_id = ? AND sequence = ?
`, request.ConversationID, request.SourceThroughSequence).Scan(&turnID, &kind)
	if errors.Is(err, sql.ErrNoRows) {
		return stateConflict("narrator focus", request.ConversationID, "source trajectory event does not exist")
	}
	if err != nil {
		return fmt.Errorf("read narrator focus source for %s: %w", request.ConversationID, err)
	}
	if turnID != request.TurnID {
		return stateConflict(
			"narrator focus",
			request.ConversationID,
			fmt.Sprintf("source event belongs to turn %s, want %s", turnID, request.TurnID),
		)
	}
	wantKind := TrajectoryEventUserInputAccepted
	if request.Trigger == NarrationTriggerUserSteered {
		wantKind = TrajectoryEventTurnSteered
	}
	if kind != wantKind {
		return stateConflict(
			"narrator focus",
			request.ConversationID,
			fmt.Sprintf("source event kind is %s, want %s", kind, wantKind),
		)
	}
	return nil
}

func requireTerminalNarratorProjection(
	transaction *WriteTransaction,
	request NarratorProjectionCommit,
) error {
	var turnStatus TurnStatus
	var eventKind TrajectoryEventKind
	err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT turn.status, trajectory.kind
FROM conversation_turns AS turn
JOIN trajectory_events AS trajectory
  ON trajectory.conversation_id = turn.conversation_id
 AND trajectory.turn_id = turn.id
 AND trajectory.sequence = ?
WHERE turn.id = ? AND turn.conversation_id = ?
`, request.ObservedThroughSequence, request.TurnID, request.ConversationID).Scan(&turnStatus, &eventKind)
	if errors.Is(err, sql.ErrNoRows) {
		return stateConflict("narrator projection", request.ConversationID, "terminal source event does not match target turn")
	}
	if err != nil {
		return fmt.Errorf("read narrator terminal source for %s: %w", request.ConversationID, err)
	}
	if !terminalTurnMatchesTrajectory(turnStatus, eventKind) {
		return stateConflict(
			"narrator projection",
			request.ConversationID,
			fmt.Sprintf(
				"turn %s status %s does not match terminal source event %s",
				request.TurnID,
				turnStatus,
				eventKind,
			),
		)
	}
	var existing int
	if err := transaction.tx.QueryRowContext(transaction.ctx, `
SELECT COUNT(*)
FROM narration_events
WHERE conversation_id = ?
  AND turn_id = ?
  AND kind = 'final_summary'
`, request.ConversationID, request.TurnID).Scan(&existing); err != nil {
		return fmt.Errorf("read narrator terminal final summary for %s: %w", request.ConversationID, err)
	}
	if existing > 0 {
		return stateConflict("narrator projection", request.ConversationID, "terminal final summary already exists for this turn")
	}
	return nil
}

func terminalTurnMatchesTrajectory(status TurnStatus, kind TrajectoryEventKind) bool {
	switch status {
	case TurnStatusCompleted:
		return kind == TrajectoryEventTurnCompleted
	case TurnStatusCancelled:
		return kind == TrajectoryEventTurnInterrupted
	case TurnStatusFailed:
		return kind == TrajectoryEventTurnFailed
	default:
		return false
	}
}

func appendProjectionNarrationEvents(
	transaction *WriteTransaction,
	request NarratorProjectionCommit,
) ([]NarrationEvent, error) {
	outputs := make([]struct {
		identity NarrationTextCommit
		kind     NarrationEventKind
	}, 0, len(request.Milestones)+2)
	for _, milestone := range request.Milestones {
		outputs = append(outputs, struct {
			identity NarrationTextCommit
			kind     NarrationEventKind
		}{identity: milestone, kind: NarrationEventKindMilestone})
	}
	if request.FinalSummary != nil {
		outputs = append(outputs, struct {
			identity NarrationTextCommit
			kind     NarrationEventKind
		}{identity: *request.FinalSummary, kind: NarrationEventKindFinalSummary})
	}

	events := make([]NarrationEvent, 0, len(outputs))
	for _, output := range outputs {
		event := narratorProjectionEvent(request, output.identity, output.kind)
		appended, err := transaction.AppendNarrationEvent(event)
		if err != nil {
			return nil, err
		}
		events = append(events, appended)
	}
	return events, nil
}

func narratorProjectionEvent(
	request NarratorProjectionCommit,
	output NarrationTextCommit,
	kind NarrationEventKind,
) NarrationEvent {
	sourceRange := narratorProjectionSourceRange(request)
	event := NarrationEvent{
		ID:                  output.NarrationEventID,
		ConversationID:      request.ConversationID,
		TurnID:              stringPointerValue(request.TurnID),
		Kind:                kind,
		SourceSequenceStart: sourceRange.Start,
		SourceSequenceEnd:   sourceRange.End,
		Trigger:             request.Trigger,
		ResolvedInvocation:  request.ResolvedInvocation,
		CreatedAt:           request.CommittedAt,
	}
	switch kind {
	case NarrationEventKindMilestone:
		event.Milestone = &NarrationMilestone{Text: output.Text}
	case NarrationEventKindFinalSummary:
		event.FinalSummary = &NarrationFinalSummary{Text: output.Text}
	}
	return event
}

func narratorProjectionSourceRange(request NarratorProjectionCommit) TrajectorySequenceRange {
	if request.Trigger == NarrationTriggerTurnTerminal &&
		request.ObservedThroughSequence == request.Expected.ObservedThroughSequence {
		return TrajectorySequenceRange{
			Start: request.ObservedThroughSequence,
			End:   request.ObservedThroughSequence,
		}
	}
	return TrajectorySequenceRange{
		Start: request.Expected.ObservedThroughSequence + 1,
		End:   request.ObservedThroughSequence,
	}
}

func narratorFocusTopicDescriptorEvent(
	request NarratorFocusCommit,
	createdAt string,
) NarrationEvent {
	return NarrationEvent{
		ID:                  request.TopicDescriptor.NarrationEventID,
		ConversationID:      request.ConversationID,
		TurnID:              stringPointerValue(request.TurnID),
		Kind:                NarrationEventKindTopicDescriptor,
		SourceSequenceStart: request.SourceThroughSequence,
		SourceSequenceEnd:   request.SourceThroughSequence,
		Trigger:             request.Trigger,
		ResolvedInvocation:  request.ResolvedInvocation,
		CreatedAt:           createdAt,
		TopicDescriptor:     &NarrationTopicDescriptor{Text: request.TopicDescriptor.Text},
	}
}

func publishNarratorProjection(
	transaction *WriteTransaction,
	request NarratorProjectionCommit,
	result NarratorProjectionCommitResult,
) error {
	if err := appendNarratorCommittedEvent(
		transaction,
		request.NarratorStateCommittedID,
		request.ConversationID,
		ConversationEventTypeNarratorStateUpdated,
		ConversationNarratorStateUpdatedEventPayload{
			Type:  ConversationEventTypeNarratorStateUpdated,
			State: result.State,
		},
		request.CommittedAt,
	); err != nil {
		return err
	}
	for index, event := range result.Events {
		identity := projectionOutputIdentity(request, event.Kind, index)
		if err := appendNarratorCommittedEvent(
			transaction,
			identity.CommittedEventID,
			request.ConversationID,
			ConversationEventTypeNarrationCreated,
			ConversationNarrationCreatedEventPayload{
				Type:  ConversationEventTypeNarrationCreated,
				Event: event,
			},
			request.CommittedAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func publishNarratorFocus(
	transaction *WriteTransaction,
	request NarratorFocusCommit,
	result NarratorFocusCommitResult,
) error {
	if err := appendNarratorCommittedEvent(
		transaction,
		request.NarratorStateCommittedID,
		request.ConversationID,
		ConversationEventTypeNarratorStateUpdated,
		ConversationNarratorStateUpdatedEventPayload{
			Type:  ConversationEventTypeNarratorStateUpdated,
			State: result.State,
		},
		result.State.UpdatedAt,
	); err != nil {
		return err
	}
	if result.Event != nil {
		if err := appendNarratorCommittedEvent(
			transaction,
			request.TopicDescriptor.CommittedEventID,
			request.ConversationID,
			ConversationEventTypeNarrationCreated,
			ConversationNarrationCreatedEventPayload{
				Type:  ConversationEventTypeNarrationCreated,
				Event: *result.Event,
			},
			result.State.UpdatedAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func projectionOutputIdentity(
	request NarratorProjectionCommit,
	kind NarrationEventKind,
	index int,
) NarrationTextCommit {
	switch kind {
	case NarrationEventKindMilestone:
		return request.Milestones[index]
	case NarrationEventKindFinalSummary:
		return *request.FinalSummary
	default:
		panic(fmt.Sprintf("validated narrator projection has unsupported output kind %q", kind))
	}
}

func narratorStateExpectationFromState(state NarratorState) NarratorStateExpectation {
	return NarratorStateExpectation{
		ObservedThroughSequence:   state.ObservedThroughSequence,
		CheckpointThroughSequence: state.CheckpointThroughSequence,
		CurrentFocusRevision:      state.CurrentFocusRevision,
		UpdatedAt:                 state.UpdatedAt,
	}
}

func appendNarratorCommittedEvent(
	transaction *WriteTransaction,
	id string,
	conversationID string,
	kind ConversationEventType,
	payload ConversationEventPayload,
	committedAt string,
) error {
	streamID, err := ConversationStreamID(conversationID)
	if err != nil {
		return err
	}
	_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          id,
		StreamID:    streamID,
		Kind:        string(kind),
		Payload:     payload,
		CommittedAt: committedAt,
	})
	return err
}

func cloneOptionalStringValue(value *string) *string {
	if value == nil {
		return nil
	}
	return stringPointerValue(*value)
}
