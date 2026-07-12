package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
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
	state.ObservedThroughSequence = request.ObservedThroughSequence
	state.CurrentFocus = request.CurrentFocus
	state.CurrentFocusRevision = request.Expected.CurrentFocusRevision + 1
	if request.TopicDescriptor != nil {
		state.TopicDescriptor = request.TopicDescriptor.Text
	}
	state.LastInvocationAt = stringPointerValue(request.CommittedAt)
	state.Status = NarratorStatusReady
	state.Degradation = nil
	state.UpdatedAt = request.CommittedAt
	if err := transaction.UpdateNarratorState(request.Expected, state); err != nil {
		return NarratorProjectionCommitResult{}, err
	}

	result := NarratorProjectionCommitResult{State: state, Events: []NarrationEvent{}}
	if request.TopicDescriptor != nil {
		updated, err := updateConversationTopicDescriptor(transaction, request)
		if err != nil {
			return NarratorProjectionCommitResult{}, err
		}
		result.Conversation = &updated
	}
	events, err := appendProjectionNarrationEvents(transaction, request)
	if err != nil {
		return NarratorProjectionCommitResult{}, err
	}
	result.Events = events
	if err := publishNarratorProjection(transaction, request, result); err != nil {
		return NarratorProjectionCommitResult{}, err
	}
	if err := appendInvocationAttemptEvent(
		transaction,
		request.InvocationAttemptCommittedID,
		request.InvocationAttempt,
		request.CommittedAt,
	); err != nil {
		return NarratorProjectionCommitResult{}, err
	}
	return result, nil
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
	if err := appendInvocationAttemptEvent(
		transaction,
		request.InvocationAttemptCommittedID,
		request.InvocationAttempt,
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
	start := request.Expected.ObservedThroughSequence + 1
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

func updateConversationTopicDescriptor(
	transaction *WriteTransaction,
	request NarratorProjectionCommit,
) (TopicConversation, error) {
	current, err := scanTopicConversation(transaction.tx.QueryRowContext(transaction.ctx, `
SELECT id, workspace_id, title, topic_descriptor, status, created_at, updated_at,
       archived_at, last_trajectory_sequence
FROM conversations
WHERE id = ?
`, request.ConversationID))
	if errors.Is(err, sql.ErrNoRows) {
		return TopicConversation{}, stateConflict("conversation", request.ConversationID, "conversation does not exist")
	}
	if err != nil {
		return TopicConversation{}, fmt.Errorf("read conversation for narrator topic descriptor %s: %w", request.ConversationID, err)
	}
	updated := current
	updated.TopicDescriptor = request.TopicDescriptor.Text
	updated.UpdatedAt = advanceTimestamp(current.UpdatedAt, request.CommittedAt)
	if err := transaction.UpdateConversation(ConversationExpectation{
		UpdatedAt:              current.UpdatedAt,
		LastTrajectorySequence: current.LastTrajectorySequence,
	}, updated); err != nil {
		return TopicConversation{}, err
	}
	return updated, nil
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
	if request.TopicDescriptor != nil {
		outputs = append(outputs, struct {
			identity NarrationTextCommit
			kind     NarrationEventKind
		}{identity: *request.TopicDescriptor, kind: NarrationEventKindTopicDescriptor})
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
	event := NarrationEvent{
		ID:                  output.NarrationEventID,
		ConversationID:      request.ConversationID,
		TurnID:              stringPointerValue(request.TurnID),
		Kind:                kind,
		SourceSequenceStart: request.Expected.ObservedThroughSequence + 1,
		SourceSequenceEnd:   request.ObservedThroughSequence,
		Trigger:             request.Trigger,
		ResolvedInvocation:  request.ResolvedInvocation,
		CreatedAt:           request.CommittedAt,
	}
	switch kind {
	case NarrationEventKindMilestone:
		event.Milestone = &NarrationMilestone{Text: output.Text}
	case NarrationEventKindFinalSummary:
		event.FinalSummary = &NarrationFinalSummary{Text: output.Text}
	case NarrationEventKindTopicDescriptor:
		event.TopicDescriptor = &NarrationTopicDescriptor{Text: output.Text}
	}
	return event
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
	if result.Conversation != nil {
		if err := appendNarratorCommittedEvent(
			transaction,
			*request.ConversationCommittedID,
			request.ConversationID,
			ConversationEventTypeConversationUpdated,
			ConversationUpdatedEventPayload{
				Type:         ConversationEventTypeConversationUpdated,
				Conversation: *result.Conversation,
			},
			request.CommittedAt,
		); err != nil {
			return err
		}
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
	case NarrationEventKindTopicDescriptor:
		return *request.TopicDescriptor
	default:
		panic(fmt.Sprintf("validated narrator projection has unsupported output kind %q", kind))
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
