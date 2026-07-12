package conversation

import (
	"context"
	"database/sql"
	"fmt"
)

func readNarratorTurnArtifacts(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	turnID string,
) ([]Artifact, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, trajectory_sequence, kind, uri, title,
       media_type, metadata_json, created_at
FROM artifacts
WHERE conversation_id = ? AND turn_id = ?
ORDER BY created_at ASC, id ASC
`, conversationID, turnID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	artifacts := make([]Artifact, 0)
	for rows.Next() {
		artifact, scanErr := scanArtifact(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		artifacts = append(artifacts, artifact)
	}
	return artifacts, rows.Err()
}

func readNarratorTrajectoryWindow(
	ctx context.Context,
	reader snapshotReader,
	conversation TopicConversation,
	state NarratorState,
	request NarratorContextReadRequest,
) (NarratorTrajectoryWindow, error) {
	start, end := narratorTrajectoryBounds(conversation, state, request)
	if start > end {
		return NarratorTrajectoryWindow{Events: []TrajectoryEvent{}}, nil
	}
	available := &TrajectorySequenceRange{Start: start, End: end}
	if request.Kind == NarratorContextReadStatus {
		return readNarratorTrajectorySuffix(ctx, reader, request, available)
	}
	return readNarratorTrajectoryPrefix(ctx, reader, request, available)
}

func narratorTrajectoryBounds(
	conversation TopicConversation,
	state NarratorState,
	request NarratorContextReadRequest,
) (int, int) {
	start := state.CheckpointThroughSequence + 1
	switch request.Kind {
	case NarratorContextReadCheckpoint:
		return start, state.ObservedThroughSequence
	case NarratorContextReadProjection:
		return start, request.ProjectionThroughSequence
	case NarratorContextReadStatus:
		return start, conversation.LastTrajectorySequence
	default:
		panic(fmt.Sprintf("validated narrator context kind is unsupported: %q", request.Kind))
	}
}

func readNarratorTrajectoryPrefix(
	ctx context.Context,
	reader snapshotReader,
	request NarratorContextReadRequest,
	available *TrajectorySequenceRange,
) (NarratorTrajectoryWindow, error) {
	events, err := queryNarratorTrajectory(
		ctx,
		reader,
		request.ConversationID,
		*available,
		"ASC",
		request.MaxTrajectoryEvents+1,
	)
	if err != nil {
		return NarratorTrajectoryWindow{}, err
	}
	hasLater := len(events) > request.MaxTrajectoryEvents
	if hasLater {
		events = events[:request.MaxTrajectoryEvents]
	}
	return narratorTrajectoryWindow(available, events, false, hasLater), nil
}

func readNarratorTrajectorySuffix(
	ctx context.Context,
	reader snapshotReader,
	request NarratorContextReadRequest,
	available *TrajectorySequenceRange,
) (NarratorTrajectoryWindow, error) {
	events, err := queryNarratorTrajectory(
		ctx,
		reader,
		request.ConversationID,
		*available,
		"DESC",
		request.MaxTrajectoryEvents+1,
	)
	if err != nil {
		return NarratorTrajectoryWindow{}, err
	}
	hasEarlier := len(events) > request.MaxTrajectoryEvents
	if hasEarlier {
		events = events[:request.MaxTrajectoryEvents]
	}
	reverseSlice(events)
	return narratorTrajectoryWindow(available, events, hasEarlier, false), nil
}

func queryNarratorTrajectory(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	sequenceRange TrajectorySequenceRange,
	order string,
	limit int,
) ([]TrajectoryEvent, error) {
	query := `
SELECT id, conversation_id, turn_id, sequence, emitted_at, kind, actor,
       provider_event_id, provider_thread_id, provider_turn_id, payload_json
FROM trajectory_events
WHERE conversation_id = ? AND sequence BETWEEN ? AND ?
ORDER BY sequence ` + order + `
LIMIT ?
`
	rows, err := reader.QueryContext(
		ctx,
		query,
		conversationID,
		sequenceRange.Start,
		sequenceRange.End,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events := make([]TrajectoryEvent, 0, limit)
	for rows.Next() {
		event, scanErr := scanTrajectoryEvent(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		events = append(events, event)
	}
	return events, rows.Err()
}

func narratorTrajectoryWindow(
	available *TrajectorySequenceRange,
	events []TrajectoryEvent,
	hasEarlier bool,
	hasLater bool,
) NarratorTrajectoryWindow {
	var included *TrajectorySequenceRange
	if len(events) > 0 {
		included = &TrajectorySequenceRange{
			Start: events[0].Sequence,
			End:   events[len(events)-1].Sequence,
		}
	}
	return NarratorTrajectoryWindow{
		AvailableRange: available,
		IncludedRange:  included,
		Events:         events,
		HasEarlier:     hasEarlier,
		HasLater:       hasLater,
	}
}

func readNarratorPriorMilestones(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	turn *ConversationTurn,
) ([]NarrationEvent, error) {
	if turn == nil {
		return []NarrationEvent{}, nil
	}
	return queryNarrationEvents(ctx, reader, `
SELECT id, conversation_id, turn_id, stream_sequence, kind,
       source_sequence_start, source_sequence_end, trigger, payload_json,
       resolved_invocation_json, created_at
FROM narration_events
WHERE conversation_id = ? AND turn_id = ? AND kind = 'milestone'
ORDER BY stream_sequence ASC
`, conversationID, turn.ID)
}

func readNarratorRecentFinalSummaries(
	ctx context.Context,
	reader snapshotReader,
	request NarratorContextReadRequest,
	turn *ConversationTurn,
) ([]NarrationEvent, error) {
	if request.MaxFinalSummaries == 0 {
		return []NarrationEvent{}, nil
	}
	var rows *sql.Rows
	var err error
	if turn == nil || request.Kind == NarratorContextReadStatus {
		rows, err = reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, stream_sequence, kind,
       source_sequence_start, source_sequence_end, trigger, payload_json,
       resolved_invocation_json, created_at
FROM narration_events
WHERE conversation_id = ? AND kind = 'final_summary'
ORDER BY stream_sequence DESC
LIMIT ?
`, request.ConversationID, request.MaxFinalSummaries)
	} else {
		rows, err = reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, stream_sequence, kind,
       source_sequence_start, source_sequence_end, trigger, payload_json,
       resolved_invocation_json, created_at
FROM narration_events
WHERE conversation_id = ? AND kind = 'final_summary' AND turn_id <> ?
ORDER BY stream_sequence DESC
LIMIT ?
`, request.ConversationID, turn.ID, request.MaxFinalSummaries)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	events, err := scanNarrationEvents(rows)
	if err != nil {
		return nil, err
	}
	reverseSlice(events)
	return events, nil
}

func queryNarrationEvents(
	ctx context.Context,
	reader snapshotReader,
	query string,
	arguments ...any,
) ([]NarrationEvent, error) {
	rows, err := reader.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanNarrationEvents(rows)
}

func scanNarrationEvents(rows *sql.Rows) ([]NarrationEvent, error) {
	events := make([]NarrationEvent, 0)
	for rows.Next() {
		event, scanErr := scanNarrationEvent(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		events = append(events, event)
	}
	return events, rows.Err()
}
