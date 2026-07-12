package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

func readSnapshotTrajectory(ctx context.Context, reader snapshotReader, conversationID string) (ConversationTrajectoryWindow, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, sequence, emitted_at, kind, actor,
       provider_event_id, provider_thread_id, provider_turn_id, payload_json
FROM trajectory_events
WHERE conversation_id = ?
ORDER BY sequence DESC
LIMIT ?
`, conversationID, MaxSnapshotTrajectoryEvents+1)
	if err != nil {
		return ConversationTrajectoryWindow{}, err
	}
	defer rows.Close()
	events := make([]TrajectoryEvent, 0, MaxSnapshotTrajectoryEvents+1)
	for rows.Next() {
		event, scanErr := scanTrajectoryEvent(rows)
		if scanErr != nil {
			return ConversationTrajectoryWindow{}, scanErr
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return ConversationTrajectoryWindow{}, err
	}
	hasEarlier := len(events) > MaxSnapshotTrajectoryEvents
	if hasEarlier {
		events = events[:MaxSnapshotTrajectoryEvents]
	}
	reverseSlice(events)
	return ConversationTrajectoryWindow{Events: events, HasEarlier: hasEarlier}, nil
}

func readSnapshotArtifacts(ctx context.Context, reader snapshotReader, conversationID string) (ConversationArtifactWindow, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, trajectory_sequence, kind, uri, title,
       media_type, metadata_json, created_at
FROM artifacts
WHERE conversation_id = ?
ORDER BY created_at DESC, id DESC
LIMIT ?
`, conversationID, MaxSnapshotArtifacts+1)
	if err != nil {
		return ConversationArtifactWindow{}, err
	}
	defer rows.Close()
	artifacts := make([]Artifact, 0, MaxSnapshotArtifacts+1)
	for rows.Next() {
		artifact, scanErr := scanArtifact(rows)
		if scanErr != nil {
			return ConversationArtifactWindow{}, scanErr
		}
		artifacts = append(artifacts, artifact)
	}
	if err := rows.Err(); err != nil {
		return ConversationArtifactWindow{}, err
	}
	hasEarlier := len(artifacts) > MaxSnapshotArtifacts
	if hasEarlier {
		artifacts = artifacts[:MaxSnapshotArtifacts]
	}
	reverseSlice(artifacts)
	return ConversationArtifactWindow{Artifacts: artifacts, HasEarlier: hasEarlier}, nil
}

func readSnapshotNarrator(ctx context.Context, reader snapshotReader, conversationID string) (NarratorState, error) {
	row := reader.QueryRowContext(ctx, `
SELECT conversation_id, observed_through_sequence, checkpoint_through_sequence,
       checkpoint_text, current_focus, current_focus_revision, topic_descriptor,
       last_invocation_at, status, degradation_json, updated_at
FROM narrator_state
WHERE conversation_id = ?
`, conversationID)
	return scanNarratorState(row)
}

func readSnapshotNarration(ctx context.Context, reader snapshotReader, conversationID string) (ConversationNarrationWindow, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, stream_sequence, kind,
       source_sequence_start, source_sequence_end, trigger, payload_json,
       resolved_invocation_json, created_at
FROM narration_events
WHERE conversation_id = ?
ORDER BY stream_sequence DESC
LIMIT ?
`, conversationID, MaxSnapshotNarrationEvents+1)
	if err != nil {
		return ConversationNarrationWindow{}, err
	}
	defer rows.Close()
	events := make([]NarrationEvent, 0, MaxSnapshotNarrationEvents+1)
	for rows.Next() {
		event, scanErr := scanNarrationEvent(rows)
		if scanErr != nil {
			return ConversationNarrationWindow{}, scanErr
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return ConversationNarrationWindow{}, err
	}
	hasEarlier := len(events) > MaxSnapshotNarrationEvents
	if hasEarlier {
		events = events[:MaxSnapshotNarrationEvents]
	}
	reverseSlice(events)
	return ConversationNarrationWindow{Events: events, HasEarlier: hasEarlier}, nil
}

func readSnapshotRoleOverrides(ctx context.Context, reader snapshotReader, conversationID string) ([]RoleProfileOverride, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT scope_kind, scope_id, profile_json, updated_at
FROM role_profile_overrides
WHERE scope_kind = 'conversation' AND scope_id = ?
ORDER BY role ASC
LIMIT ?
`, conversationID, MaxSnapshotRoleOverrides)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	overrides := make([]RoleProfileOverride, 0)
	for rows.Next() {
		var override RoleProfileOverride
		var profileJSON string
		if err := rows.Scan(&override.ScopeKind, &override.ScopeID, &profileJSON, &override.UpdatedAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(profileJSON), &override.Profile); err != nil {
			return nil, err
		}
		overrides = append(overrides, override)
	}
	return overrides, rows.Err()
}

func readSnapshotPresentation(ctx context.Context, reader snapshotReader, conversationID string) (ConversationPresentationProfile, error) {
	row := reader.QueryRowContext(ctx, `
SELECT conversation_id, palette_selection, requested_palette_id,
       resolved_palette_id, palette_reuse_json, narrator_voice_selection,
       requested_narrator_voice_id, resolved_narrator_voice_id,
       narrator_voice_reuse_json, narrator_speech_enabled, updated_at
FROM conversation_presentation_profiles
WHERE conversation_id = ?
`, conversationID)
	return scanPresentationProfile(row)
}

func readSnapshotBranch(ctx context.Context, reader snapshotReader, conversationID string) (*ConversationBranch, error) {
	row := reader.QueryRowContext(ctx, `
SELECT child_conversation_id, parent_conversation_id, branch_kind,
       decision_source, forked_at_turn_id, source_trajectory_sequence,
       provider_metadata_json, created_at
FROM conversation_branches
WHERE child_conversation_id = ?
`, conversationID)
	branch, err := scanConversationBranch(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &branch, nil
}

func readSnapshotSides(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	parentStatus ConversationStatus,
) ([]SideConversation, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, parent_conversation_id, parent_pane_id, decision_source, provider_thread_id,
       source_provider_thread_id, source_provider_turn_id, source_trajectory_sequence,
       last_event_sequence, active_turn_id, active_provider_turn_id, status,
       resolved_side_agent_invocation_json, created_at, updated_at, disposed_at,
       failure_json
FROM (
  SELECT id, parent_conversation_id, parent_pane_id, decision_source, provider_thread_id,
         source_provider_thread_id, source_provider_turn_id, source_trajectory_sequence,
         last_event_sequence, active_turn_id, active_provider_turn_id, status,
         resolved_side_agent_invocation_json, created_at, updated_at, disposed_at,
         failure_json
  FROM side_conversations
  WHERE parent_conversation_id = ?
  ORDER BY CASE
             WHEN disposed_at IS NULL
               AND (status <> 'failed' OR provider_thread_id IS NOT NULL) THEN 0
             WHEN status = 'failed' THEN 2
             ELSE 1
           END ASC,
           created_at DESC, id DESC
  LIMIT ?
)
ORDER BY created_at ASC, id ASC
`, conversationID, MaxSnapshotSideConversations)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sides := make([]SideConversation, 0)
	for rows.Next() {
		side, scanErr := scanSideConversation(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		side.ParentStatus = parentStatus
		sides = append(sides, side)
	}
	return sides, rows.Err()
}

func readSnapshotSideEvents(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
) (ConversationSideEventWindow, error) {
	rows, err := reader.QueryContext(ctx, `
WITH selected_sides AS (
  SELECT id
  FROM side_conversations
  WHERE parent_conversation_id = ?
  ORDER BY CASE
             WHEN disposed_at IS NULL
               AND (status <> 'failed' OR provider_thread_id IS NOT NULL) THEN 0
             WHEN status = 'failed' THEN 2
             ELSE 1
           END ASC,
           created_at DESC, id DESC
  LIMIT ?
)
SELECT event.stream_sequence, side.parent_conversation_id,
       event.side_conversation_id, event.event_json
FROM side_conversation_events AS event
JOIN selected_sides ON selected_sides.id = event.side_conversation_id
JOIN side_conversations AS side ON side.id = event.side_conversation_id
ORDER BY event.stream_sequence DESC
LIMIT ?
`, conversationID, MaxSnapshotSideConversations, MaxSnapshotSideEvents+1)
	if err != nil {
		return ConversationSideEventWindow{}, err
	}
	defer rows.Close()
	events := make([]SideConversationEvent, 0, MaxSnapshotSideEvents+1)
	for rows.Next() {
		var event SideConversationEvent
		var encoded string
		if err := rows.Scan(
			&event.StreamSequence,
			&event.ParentConversationID,
			&event.SideConversationID,
			&encoded,
		); err != nil {
			return ConversationSideEventWindow{}, err
		}
		if err := decodeJSON("side conversation event", encoded, &event.Event); err != nil {
			return ConversationSideEventWindow{}, err
		}
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return ConversationSideEventWindow{}, err
	}
	hasEarlier := len(events) > MaxSnapshotSideEvents
	if hasEarlier {
		events = events[:MaxSnapshotSideEvents]
	}
	reverseSlice(events)
	return ConversationSideEventWindow{
		Events:     events,
		HasEarlier: hasEarlier,
		Limit:      MaxSnapshotSideEvents,
	}, nil
}
