package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/workspaceui/conversationpalette"
)

var ErrConversationNotFound = errors.New("topic conversation not found")

type ConversationListPage struct {
	Conversations []TopicConversation `json:"conversations"`
	NextCursor    *string             `json:"nextCursor"`
}

func (store *Store) ReadSnapshot(ctx context.Context, workspaceID string, conversationID string) (ConversationSnapshot, error) {
	if err := validateIdentifier("snapshot workspace id", workspaceID); err != nil {
		return ConversationSnapshot{}, err
	}
	if err := validateIdentifier("snapshot conversation id", conversationID); err != nil {
		return ConversationSnapshot{}, err
	}
	var snapshot ConversationSnapshot
	err := store.read(ctx, "read topic conversation snapshot", func(ctx context.Context, reader *sql.Conn) error {
		var err error
		snapshot, err = readConversationSnapshot(ctx, reader, workspaceID, conversationID)
		return err
	})
	if err != nil {
		return ConversationSnapshot{}, err
	}
	if err := snapshot.Validate(); err != nil {
		return ConversationSnapshot{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return snapshot, nil
}

func (store *Store) ListConversations(ctx context.Context, workspaceID string, cursor *string, limit int) (ConversationListPage, error) {
	if workspaceID != "" {
		if err := validateIdentifier("conversation list workspace id", workspaceID); err != nil {
			return ConversationListPage{}, err
		}
	}
	if limit <= 0 || limit > 200 {
		return ConversationListPage{}, fmt.Errorf("conversation list limit must be between 1 and 200")
	}
	var page ConversationListPage
	err := store.read(ctx, "list topic conversations", func(ctx context.Context, reader *sql.Conn) error {
		var err error
		page, err = readConversationList(ctx, reader, workspaceID, cursor, limit)
		return err
	})
	return page, err
}

func (store *Store) ReadConversation(ctx context.Context, conversationID string) (TopicConversation, error) {
	if err := validateIdentifier("conversation id", conversationID); err != nil {
		return TopicConversation{}, err
	}
	var conversation TopicConversation
	err := store.read(ctx, "read topic conversation", func(ctx context.Context, reader *sql.Conn) error {
		var archivedAt sql.NullString
		err := reader.QueryRowContext(ctx, `
SELECT id, workspace_id, title, topic_descriptor, status, created_at, updated_at,
       archived_at, last_trajectory_sequence
FROM conversations WHERE id = ?
`, conversationID).Scan(
			&conversation.ID, &conversation.WorkspaceID, &conversation.Title,
			&conversation.TopicDescriptor, &conversation.Status,
			&conversation.CreatedAt, &conversation.UpdatedAt, &archivedAt,
			&conversation.LastTrajectorySequence,
		)
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("%w: %s", ErrConversationNotFound, conversationID)
		}
		conversation.ArchivedAt = nullStringPointer(archivedAt)
		return err
	})
	if err != nil {
		return TopicConversation{}, err
	}
	if err := conversation.Validate(); err != nil {
		return TopicConversation{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return conversation, nil
}

func (store *Store) ReadTrajectoryRange(ctx context.Context, conversationID string, afterSequence int, limit int) ([]TrajectoryEvent, bool, error) {
	if err := validateIdentifier("trajectory conversation id", conversationID); err != nil {
		return nil, false, err
	}
	if afterSequence < 0 || limit <= 0 || limit > MaxCommittedEventReadLimit {
		return nil, false, fmt.Errorf("trajectory range requires a non-negative cursor and limit between 1 and %d", MaxCommittedEventReadLimit)
	}
	var events []TrajectoryEvent
	var hasMore bool
	err := store.read(ctx, "read topic conversation trajectory range", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, sequence, emitted_at, kind, actor,
       provider_event_id, provider_thread_id, provider_turn_id, payload_json
FROM trajectory_events
WHERE conversation_id = ? AND sequence > ?
ORDER BY sequence ASC LIMIT ?
`, conversationID, afterSequence, limit+1)
		if err != nil {
			return err
		}
		defer rows.Close()
		events = make([]TrajectoryEvent, 0, limit+1)
		for rows.Next() {
			event, err := scanTrajectory(rows)
			if err != nil {
				return err
			}
			events = append(events, event)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		hasMore = len(events) > limit
		if hasMore {
			events = events[:limit]
		}
		return nil
	})
	return events, hasMore, err
}

func (store *Store) ReadNarrationHistory(ctx context.Context, conversationID string, turnID *string, limit int) ([]NarrationEvent, error) {
	if err := validateIdentifier("narration conversation id", conversationID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > MaxCommittedEventReadLimit {
		return nil, fmt.Errorf("narration history limit must be between 1 and %d", MaxCommittedEventReadLimit)
	}
	if turnID != nil {
		if err := validateIdentifier("narration turn id", *turnID); err != nil {
			return nil, err
		}
	}
	var events []NarrationEvent
	err := store.read(ctx, "read topic conversation narration history", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT stream_sequence, id, conversation_id, turn_id, kind,
       source_sequence_start, source_sequence_end, trigger, payload_json,
       resolved_invocation_json, created_at
FROM (
  SELECT * FROM narration_events
  WHERE conversation_id = ? AND (? IS NULL OR turn_id = ?)
  ORDER BY stream_sequence DESC LIMIT ?
)
ORDER BY stream_sequence ASC
`, conversationID, nullableString(turnID), nullableString(turnID), limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		events = make([]NarrationEvent, 0, limit)
		for rows.Next() {
			event, err := scanNarration(rows)
			if err != nil {
				return err
			}
			events = append(events, event)
		}
		return rows.Err()
	})
	return events, err
}

func (store *Store) ReadNarrationEvent(ctx context.Context, conversationID string, eventID string) (NarrationEvent, error) {
	if err := validateIdentifier("narration conversation id", conversationID); err != nil {
		return NarrationEvent{}, err
	}
	if err := validateIdentifier("narration event id", eventID); err != nil {
		return NarrationEvent{}, err
	}
	var event NarrationEvent
	err := store.read(ctx, "read narration event", func(ctx context.Context, reader *sql.Conn) error {
		row := reader.QueryRowContext(ctx, `
SELECT stream_sequence, id, conversation_id, turn_id, kind,
       source_sequence_start, source_sequence_end, trigger, payload_json,
       resolved_invocation_json, created_at
FROM narration_events WHERE conversation_id = ? AND id = ?
`, conversationID, eventID)
		var err error
		event, err = scanNarration(row)
		return err
	})
	if errors.Is(err, sql.ErrNoRows) {
		return NarrationEvent{}, fmt.Errorf("narration event not found: %s", eventID)
	}
	return event, err
}

func (store *Store) ReadMasterVoiceSelection(ctx context.Context) (*MasterVoiceSelection, error) {
	var selection MasterVoiceSelection
	var requestedVoiceID, resolvedVoiceID, reuseJSON sql.NullString
	err := store.read(ctx, "read master voice selection", func(ctx context.Context, reader *sql.Conn) error {
		err := reader.QueryRowContext(ctx, `
SELECT selection, requested_voice_id, resolved_voice_id, reuse_json, updated_at
FROM master_voice_selection WHERE singleton = 1
`).Scan(&selection.Selection, &requestedVoiceID, &resolvedVoiceID, &reuseJSON, &selection.UpdatedAt)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		selection.RequestedVoiceID = nullStringPointer(requestedVoiceID)
		selection.ResolvedVoiceID = nullStringPointer(resolvedVoiceID)
		return decodeOptionalJSON(reuseJSON, &selection.Reuse)
	})
	if err != nil {
		return nil, err
	}
	if selection.Selection == "" {
		return nil, nil
	}
	return &selection, selection.Validate()
}

func (store *Store) ListPresentationProfiles(ctx context.Context) ([]ConversationPresentationProfile, error) {
	var profiles []ConversationPresentationProfile
	err := store.read(ctx, "list conversation presentation profiles", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `SELECT conversation_id FROM conversation_presentation_profiles ORDER BY conversation_id ASC`)
		if err != nil {
			return err
		}
		ids := make([]string, 0)
		for rows.Next() {
			var conversationID string
			if err := rows.Scan(&conversationID); err != nil {
				_ = rows.Close()
				return err
			}
			ids = append(ids, conversationID)
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return err
		}
		if err := rows.Close(); err != nil {
			return err
		}
		profiles = make([]ConversationPresentationProfile, 0, len(ids))
		for _, conversationID := range ids {
			profile, err := readPresentation(ctx, reader, conversationID)
			if err != nil {
				return err
			}
			profiles = append(profiles, profile)
		}
		return nil
	})
	return profiles, err
}

func readConversationSnapshot(ctx context.Context, reader *sql.Conn, workspaceID string, conversationID string) (ConversationSnapshot, error) {
	conversation, err := readConversation(ctx, reader, workspaceID, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	turns, queue, binding, err := readConversationExecution(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	trajectory, artifacts, err := readConversationHistory(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	currentProjection, err := readCurrentProjection(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	narrator, narration, err := readConversationNarration(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	roles, presentation, branch, sides, err := readConversationConfiguration(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	cursor, err := readConversationEventCursor(ctx, reader, conversationID)
	if err != nil {
		return ConversationSnapshot{}, err
	}
	return ConversationSnapshot{
		SchemaVersion:        ConversationContractSchemaVersion,
		Conversation:         conversation,
		Turns:                turns,
		Queue:                queue,
		ThreadBinding:        binding,
		Trajectory:           trajectory,
		CurrentProjection:    currentProjection,
		Artifacts:            artifacts,
		NarratorState:        narrator,
		Narration:            narration,
		RoleProfileOverrides: roles,
		PresentationProfile:  presentation,
		Branch:               branch,
		SideConversations:    sides,
		EventCursor:          cursor,
	}, nil
}

func readConversation(ctx context.Context, reader *sql.Conn, workspaceID string, conversationID string) (TopicConversation, error) {
	var record TopicConversation
	var archivedAt sql.NullString
	err := reader.QueryRowContext(ctx, `
SELECT id, workspace_id, title, topic_descriptor, status, created_at, updated_at,
       archived_at, last_trajectory_sequence
FROM conversations
WHERE id = ? AND workspace_id = ?
`, conversationID, workspaceID).Scan(
		&record.ID, &record.WorkspaceID, &record.Title, &record.TopicDescriptor,
		&record.Status, &record.CreatedAt, &record.UpdatedAt, &archivedAt,
		&record.LastTrajectorySequence,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return TopicConversation{}, fmt.Errorf("%w: %s", ErrConversationNotFound, conversationID)
	}
	if err != nil {
		return TopicConversation{}, err
	}
	record.ArchivedAt = nullStringPointer(archivedAt)
	return record, nil
}

func readConversationExecution(ctx context.Context, reader *sql.Conn, conversationID string) (ConversationTurnWindow, []QueuedConversationTurn, *AgentThreadBinding, error) {
	turns, hasEarlier, err := readTurns(ctx, reader, conversationID, MaxSnapshotTurns)
	if err != nil {
		return ConversationTurnWindow{}, nil, nil, err
	}
	queue, err := readQueue(ctx, reader, conversationID)
	if err != nil {
		return ConversationTurnWindow{}, nil, nil, err
	}
	binding, err := readBinding(ctx, reader, conversationID)
	return ConversationTurnWindow{Turns: turns, HasEarlier: hasEarlier}, queue, binding, err
}

func readConversationHistory(ctx context.Context, reader *sql.Conn, conversationID string) (ConversationTrajectoryWindow, ConversationArtifactWindow, error) {
	events, trajectoryEarlier, err := readTrajectory(ctx, reader, conversationID, MaxSnapshotTrajectoryEvents)
	if err != nil {
		return ConversationTrajectoryWindow{}, ConversationArtifactWindow{}, err
	}
	artifacts, artifactEarlier, err := readArtifacts(ctx, reader, conversationID, MaxSnapshotArtifacts)
	return ConversationTrajectoryWindow{Events: events, HasEarlier: trajectoryEarlier}, ConversationArtifactWindow{Artifacts: artifacts, HasEarlier: artifactEarlier}, err
}

func readConversationNarration(ctx context.Context, reader *sql.Conn, conversationID string) (NarratorState, ConversationNarrationWindow, error) {
	state, err := readNarratorState(ctx, reader, conversationID)
	if err != nil {
		return NarratorState{}, ConversationNarrationWindow{}, err
	}
	events, hasEarlier, err := readNarration(ctx, reader, conversationID, MaxSnapshotNarrationEvents)
	return state, ConversationNarrationWindow{Events: events, HasEarlier: hasEarlier}, err
}

func readConversationConfiguration(ctx context.Context, reader *sql.Conn, conversationID string) ([]RoleProfileOverride, ConversationPresentationProfile, *ConversationBranch, []SideConversation, error) {
	roles, err := readRoleOverrides(ctx, reader, conversationID)
	if err != nil {
		return nil, ConversationPresentationProfile{}, nil, nil, err
	}
	presentation, err := readPresentation(ctx, reader, conversationID)
	if err != nil {
		return nil, ConversationPresentationProfile{}, nil, nil, err
	}
	branch, err := readBranch(ctx, reader, conversationID)
	if err != nil {
		return nil, ConversationPresentationProfile{}, nil, nil, err
	}
	sides, err := readSides(ctx, reader, conversationID)
	return roles, presentation, branch, sides, err
}

func readTurns(ctx context.Context, reader *sql.Conn, conversationID string, limit int) ([]ConversationTurn, bool, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, authored_input_json, delivery, status, accepted_at,
       started_at, ended_at, requested_role_profile_json,
       resolved_invocation_json, provider_turn_id, error_json
FROM (
  SELECT * FROM conversation_turns
  WHERE conversation_id = ?
  ORDER BY accepted_at DESC, id DESC
  LIMIT ?
)
ORDER BY accepted_at ASC, id ASC
`, conversationID, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	records := make([]ConversationTurn, 0, limit+1)
	for rows.Next() {
		record, err := scanTurn(rows)
		if err != nil {
			return nil, false, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasEarlier := len(records) > limit
	if hasEarlier {
		records = records[1:]
	}
	return records, hasEarlier, nil
}

type rowScanner interface {
	Scan(...any) error
}

func scanTurn(scanner rowScanner) (ConversationTurn, error) {
	var record ConversationTurn
	var authoredInputJSON, requestedProfileJSON string
	var startedAt, endedAt, resolvedInvocationJSON, providerTurnID, failureJSON sql.NullString
	err := scanner.Scan(
		&record.ID, &record.ConversationID, &authoredInputJSON, &record.Delivery,
		&record.Status, &record.AcceptedAt, &startedAt, &endedAt,
		&requestedProfileJSON, &resolvedInvocationJSON, &providerTurnID, &failureJSON,
	)
	if err != nil {
		return ConversationTurn{}, err
	}
	if err := decodeRequiredJSON(authoredInputJSON, &record.AuthoredInput); err != nil {
		return ConversationTurn{}, fmt.Errorf("turn %s authored input: %w", record.ID, err)
	}
	if err := decodeRequiredJSON(requestedProfileJSON, &record.RequestedRoleProfile); err != nil {
		return ConversationTurn{}, fmt.Errorf("turn %s requested profile: %w", record.ID, err)
	}
	record.StartedAt = nullStringPointer(startedAt)
	record.EndedAt = nullStringPointer(endedAt)
	record.ProviderTurnID = nullStringPointer(providerTurnID)
	if err := decodeOptionalJSON(resolvedInvocationJSON, &record.ResolvedInvocation); err != nil {
		return ConversationTurn{}, fmt.Errorf("turn %s resolved invocation: %w", record.ID, err)
	}
	if err := decodeOptionalJSON(failureJSON, &record.Error); err != nil {
		return ConversationTurn{}, fmt.Errorf("turn %s failure: %w", record.ID, err)
	}
	return record, record.Validate()
}

func readQueue(ctx context.Context, reader *sql.Conn, conversationID string) ([]QueuedConversationTurn, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT turn_id, conversation_id, ordinal, queued_at
FROM conversation_queue WHERE conversation_id = ? ORDER BY ordinal ASC
`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]QueuedConversationTurn, 0)
	for rows.Next() {
		var record QueuedConversationTurn
		if err := rows.Scan(&record.TurnID, &record.ConversationID, &record.Ordinal, &record.QueuedAt); err != nil {
			return nil, err
		}
		if err := record.Validate(); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func readBinding(ctx context.Context, reader *sql.Conn, conversationID string) (*AgentThreadBinding, error) {
	var record AgentThreadBinding
	var lastResumedAt, lastTurnID sql.NullString
	var metadataJSON string
	err := reader.QueryRowContext(ctx, `
SELECT conversation_id, provider, thread_id, status, created_at, last_resumed_at,
       last_turn_id, provider_metadata_json
FROM agent_thread_bindings WHERE conversation_id = ?
`, conversationID).Scan(
		&record.ConversationID, &record.Provider, &record.ThreadID, &record.Status,
		&record.CreatedAt, &lastResumedAt, &lastTurnID, &metadataJSON,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	record.LastResumedAt = nullStringPointer(lastResumedAt)
	record.LastTurnID = nullStringPointer(lastTurnID)
	if err := decodeRequiredJSON(metadataJSON, &record.ProviderMetadata); err != nil {
		return nil, err
	}
	return &record, record.Validate()
}

func readTrajectory(ctx context.Context, reader *sql.Conn, conversationID string, limit int) ([]TrajectoryEvent, bool, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, sequence, emitted_at, kind, actor,
       provider_event_id, provider_thread_id, provider_turn_id, payload_json
FROM (
  SELECT * FROM trajectory_events WHERE conversation_id = ?
  ORDER BY sequence DESC LIMIT ?
)
ORDER BY sequence ASC
`, conversationID, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	records := make([]TrajectoryEvent, 0, limit+1)
	for rows.Next() {
		record, err := scanTrajectory(rows)
		if err != nil {
			return nil, false, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasEarlier := len(records) > limit
	if hasEarlier {
		records = records[1:]
	}
	return records, hasEarlier, nil
}

func scanTrajectory(scanner rowScanner) (TrajectoryEvent, error) {
	var record TrajectoryEvent
	var turnID, providerEventID, providerThreadID, providerTurnID sql.NullString
	var payloadJSON string
	err := scanner.Scan(
		&record.ID, &record.ConversationID, &turnID, &record.Sequence,
		&record.EmittedAt, &record.Kind, &record.Actor, &providerEventID,
		&providerThreadID, &providerTurnID, &payloadJSON,
	)
	if err != nil {
		return TrajectoryEvent{}, err
	}
	record.TurnID = nullStringPointer(turnID)
	record.ProviderEventID = nullStringPointer(providerEventID)
	record.ProviderThreadID = nullStringPointer(providerThreadID)
	record.ProviderTurnID = nullStringPointer(providerTurnID)
	if err := decodeTrajectoryPayload(&record, payloadJSON); err != nil {
		return TrajectoryEvent{}, err
	}
	return record, record.Validate()
}

var trajectoryPayloadTargets = map[TrajectoryEventKind]func(*TrajectoryEvent) any{
	TrajectoryEventUserInputAccepted: func(event *TrajectoryEvent) any {
		event.UserInputAccepted = &TrajectoryUserInputAccepted{}
		return event.UserInputAccepted
	},
	TrajectoryEventTurnQueued: func(event *TrajectoryEvent) any { event.TurnQueued = &TrajectoryTurnQueued{}; return event.TurnQueued },
	TrajectoryEventTurnPromoted: func(event *TrajectoryEvent) any {
		event.TurnPromoted = &TrajectoryTurnPromoted{}
		return event.TurnPromoted
	},
	TrajectoryEventTurnStarted: func(event *TrajectoryEvent) any {
		event.TurnStarted = &TrajectoryTurnStarted{}
		return event.TurnStarted
	},
	TrajectoryEventTurnSteered: func(event *TrajectoryEvent) any {
		event.TurnSteered = &TrajectoryTurnSteered{}
		return event.TurnSteered
	},
	TrajectoryEventTurnInterrupted: func(event *TrajectoryEvent) any {
		event.TurnInterrupted = &TrajectoryTurnInterrupted{}
		return event.TurnInterrupted
	},
	TrajectoryEventTurnCompleted: func(event *TrajectoryEvent) any {
		event.TurnCompleted = &TrajectoryTurnCompleted{}
		return event.TurnCompleted
	},
	TrajectoryEventTurnFailed: func(event *TrajectoryEvent) any { event.TurnFailed = &TrajectoryTurnFailed{}; return event.TurnFailed },
	TrajectoryEventAgentPublicTextDelta: func(event *TrajectoryEvent) any {
		event.AgentPublicTextDelta = &TrajectoryAgentPublicTextDelta{}
		return event.AgentPublicTextDelta
	},
	TrajectoryEventAgentMessageCompleted: func(event *TrajectoryEvent) any {
		event.AgentMessageCompleted = &TrajectoryAgentMessageCompleted{}
		return event.AgentMessageCompleted
	},
	TrajectoryEventPublicReasoningSummaryUpdated: func(event *TrajectoryEvent) any {
		event.PublicReasoningSummaryUpdated = &TrajectoryPublicReasoningSummaryUpdated{}
		return event.PublicReasoningSummaryUpdated
	},
	TrajectoryEventPlanChanged: func(event *TrajectoryEvent) any {
		event.PlanChanged = &TrajectoryPlanChanged{}
		return event.PlanChanged
	},
	TrajectoryEventActivityStarted: func(event *TrajectoryEvent) any {
		event.ActivityStarted = &TrajectoryActivityStarted{}
		return event.ActivityStarted
	},
	TrajectoryEventActivityProgressed: func(event *TrajectoryEvent) any {
		event.ActivityProgressed = &TrajectoryActivityProgressed{}
		return event.ActivityProgressed
	},
	TrajectoryEventActivityCompleted: func(event *TrajectoryEvent) any {
		event.ActivityCompleted = &TrajectoryActivityCompleted{}
		return event.ActivityCompleted
	},
	TrajectoryEventActivityFailed: func(event *TrajectoryEvent) any {
		event.ActivityFailed = &TrajectoryActivityFailed{}
		return event.ActivityFailed
	},
	TrajectoryEventFileChangeProposed: func(event *TrajectoryEvent) any {
		event.FileChangeProposed = &TrajectoryFileChangeProposed{}
		return event.FileChangeProposed
	},
	TrajectoryEventFileChangeCompleted: func(event *TrajectoryEvent) any {
		event.FileChangeCompleted = &TrajectoryFileChangeCompleted{}
		return event.FileChangeCompleted
	},
	TrajectoryEventApprovalRequested: func(event *TrajectoryEvent) any {
		event.ApprovalRequested = &TrajectoryApprovalRequested{}
		return event.ApprovalRequested
	},
	TrajectoryEventApprovalResolved: func(event *TrajectoryEvent) any {
		event.ApprovalResolved = &TrajectoryApprovalResolved{}
		return event.ApprovalResolved
	},
	TrajectoryEventSubagentStarted: func(event *TrajectoryEvent) any {
		event.SubagentStarted = &TrajectorySubagentStarted{}
		return event.SubagentStarted
	},
	TrajectoryEventSubagentUpdated: func(event *TrajectoryEvent) any {
		event.SubagentUpdated = &TrajectorySubagentUpdated{}
		return event.SubagentUpdated
	},
	TrajectoryEventSubagentCompleted: func(event *TrajectoryEvent) any {
		event.SubagentCompleted = &TrajectorySubagentCompleted{}
		return event.SubagentCompleted
	},
	TrajectoryEventArtifactEmitted: func(event *TrajectoryEvent) any {
		event.ArtifactEmitted = &TrajectoryArtifactEmitted{}
		return event.ArtifactEmitted
	},
	TrajectoryEventAgentLivenessChanged: func(event *TrajectoryEvent) any {
		event.AgentLivenessChanged = &TrajectoryAgentLivenessChanged{}
		return event.AgentLivenessChanged
	},
	TrajectoryEventProviderLifecycleChanged: func(event *TrajectoryEvent) any {
		event.ProviderLifecycleChanged = &TrajectoryProviderLifecycleChanged{}
		return event.ProviderLifecycleChanged
	},
	TrajectoryEventModelRerouted: func(event *TrajectoryEvent) any {
		event.ModelRerouted = &TrajectoryModelRerouted{}
		return event.ModelRerouted
	},
}

func decodeTrajectoryPayload(event *TrajectoryEvent, payloadJSON string) error {
	createTarget := trajectoryPayloadTargets[event.Kind]
	if createTarget == nil {
		return fmt.Errorf("unsupported trajectory kind %q", event.Kind)
	}
	return decodeRequiredJSON(payloadJSON, createTarget(event))
}

func readArtifacts(ctx context.Context, reader *sql.Conn, conversationID string, limit int) ([]Artifact, bool, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, conversation_id, turn_id, trajectory_sequence, kind, uri, title,
       media_type, metadata_json, created_at
FROM (
  SELECT * FROM artifacts WHERE conversation_id = ?
  ORDER BY created_at DESC, id DESC LIMIT ?
)
ORDER BY created_at ASC, id ASC
`, conversationID, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	records := make([]Artifact, 0, limit+1)
	for rows.Next() {
		var record Artifact
		var turnID sql.NullString
		var sequence sql.NullInt64
		var metadataJSON string
		if err := rows.Scan(&record.ID, &record.ConversationID, &turnID, &sequence, &record.Kind, &record.URI, &record.Title, &record.MediaType, &metadataJSON, &record.CreatedAt); err != nil {
			return nil, false, err
		}
		record.TurnID = nullStringPointer(turnID)
		record.TrajectorySequence = nullIntPointer(sequence)
		if err := decodeRequiredJSON(metadataJSON, &record.Metadata); err != nil {
			return nil, false, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasEarlier := len(records) > limit
	if hasEarlier {
		records = records[1:]
	}
	return records, hasEarlier, nil
}

func readNarratorState(ctx context.Context, reader *sql.Conn, conversationID string) (NarratorState, error) {
	var state NarratorState
	var lastInvocationAt, degradationJSON sql.NullString
	err := reader.QueryRowContext(ctx, `
SELECT conversation_id, observed_through_sequence, checkpoint_through_sequence,
       checkpoint_text, current_focus, current_focus_revision, topic_descriptor,
       last_invocation_at, status, degradation_json, updated_at
FROM narrator_state WHERE conversation_id = ?
`, conversationID).Scan(
		&state.ConversationID, &state.ObservedThroughSequence,
		&state.CheckpointThroughSequence, &state.CheckpointText,
		&state.CurrentFocus, &state.CurrentFocusRevision, &state.TopicDescriptor,
		&lastInvocationAt, &state.Status, &degradationJSON, &state.UpdatedAt,
	)
	if err != nil {
		return NarratorState{}, err
	}
	state.LastInvocationAt = nullStringPointer(lastInvocationAt)
	if err := decodeOptionalJSON(degradationJSON, &state.Degradation); err != nil {
		return NarratorState{}, err
	}
	return state, state.Validate()
}

func readNarration(ctx context.Context, reader *sql.Conn, conversationID string, limit int) ([]NarrationEvent, bool, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT stream_sequence, id, conversation_id, turn_id, kind,
       source_sequence_start, source_sequence_end, trigger, payload_json,
       resolved_invocation_json, created_at
FROM (
  SELECT * FROM narration_events WHERE conversation_id = ?
  ORDER BY stream_sequence DESC LIMIT ?
)
ORDER BY stream_sequence ASC
`, conversationID, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	records := make([]NarrationEvent, 0, limit+1)
	for rows.Next() {
		record, err := scanNarration(rows)
		if err != nil {
			return nil, false, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasEarlier := len(records) > limit
	if hasEarlier {
		records = records[1:]
	}
	return records, hasEarlier, nil
}

func scanNarration(scanner rowScanner) (NarrationEvent, error) {
	var event NarrationEvent
	var turnID sql.NullString
	var payloadJSON, invocationJSON string
	err := scanner.Scan(
		&event.StreamSequence, &event.ID, &event.ConversationID, &turnID,
		&event.Kind, &event.SourceSequenceStart, &event.SourceSequenceEnd,
		&event.Trigger, &payloadJSON, &invocationJSON, &event.CreatedAt,
	)
	if err != nil {
		return NarrationEvent{}, err
	}
	event.TurnID = nullStringPointer(turnID)
	if err := decodeRequiredJSON(invocationJSON, &event.ResolvedInvocation); err != nil {
		return NarrationEvent{}, err
	}
	if err := decodeNarrationPayload(&event, payloadJSON); err != nil {
		return NarrationEvent{}, err
	}
	return event, event.Validate()
}

var narrationPayloadTargets = map[NarrationEventKind]func(*NarrationEvent) any{
	NarrationEventKindMilestone:   func(event *NarrationEvent) any { event.Milestone = &NarrationMilestone{}; return event.Milestone },
	NarrationEventKindStatusReply: func(event *NarrationEvent) any { event.StatusReply = &NarrationStatusReply{}; return event.StatusReply },
	NarrationEventKindFinalSummary: func(event *NarrationEvent) any {
		event.FinalSummary = &NarrationFinalSummary{}
		return event.FinalSummary
	},
	NarrationEventKindTopicDescriptor: func(event *NarrationEvent) any {
		event.TopicDescriptor = &NarrationTopicDescriptor{}
		return event.TopicDescriptor
	},
}

func decodeNarrationPayload(event *NarrationEvent, payloadJSON string) error {
	createTarget := narrationPayloadTargets[event.Kind]
	if createTarget == nil {
		return fmt.Errorf("unsupported narration kind %q", event.Kind)
	}
	return decodeRequiredJSON(payloadJSON, createTarget(event))
}

func readRoleOverrides(ctx context.Context, reader *sql.Conn, conversationID string) ([]RoleProfileOverride, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT scope_kind, scope_id, profile_json, updated_at
FROM role_profile_overrides
WHERE scope_kind = 'conversation' AND scope_id = ?
ORDER BY role ASC
`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]RoleProfileOverride, 0)
	for rows.Next() {
		var record RoleProfileOverride
		var profileJSON string
		if err := rows.Scan(&record.ScopeKind, &record.ScopeID, &profileJSON, &record.UpdatedAt); err != nil {
			return nil, err
		}
		if err := decodeRequiredJSON(profileJSON, &record.Profile); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func readPresentation(ctx context.Context, reader *sql.Conn, conversationID string) (ConversationPresentationProfile, error) {
	var profile ConversationPresentationProfile
	var requestedPaletteID, paletteReuseJSON, requestedVoiceID, resolvedVoiceID, voiceReuseJSON sql.NullString
	var speechEnabled int
	err := reader.QueryRowContext(ctx, `
SELECT conversation_id, palette_selection, requested_palette_id,
       resolved_palette_id, palette_reuse_json, narrator_voice_selection,
       requested_narrator_voice_id, resolved_narrator_voice_id,
       narrator_voice_reuse_json, narrator_speech_enabled, updated_at
FROM conversation_presentation_profiles WHERE conversation_id = ?
`, conversationID).Scan(
		&profile.ConversationID, &profile.PaletteSelection, &requestedPaletteID,
		&profile.ResolvedPaletteID, &paletteReuseJSON, &profile.NarratorVoiceSelection,
		&requestedVoiceID, &resolvedVoiceID, &voiceReuseJSON, &speechEnabled,
		&profile.UpdatedAt,
	)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	if requestedPaletteID.Valid {
		value := conversationpalette.ConversationPaletteID(requestedPaletteID.String)
		profile.RequestedPaletteID = &value
	}
	profile.RequestedNarratorVoiceID = nullStringPointer(requestedVoiceID)
	profile.ResolvedNarratorVoiceID = nullStringPointer(resolvedVoiceID)
	profile.NarratorSpeechEnabled = speechEnabled == 1
	if err := decodeOptionalJSON(paletteReuseJSON, &profile.PaletteReuse); err != nil {
		return ConversationPresentationProfile{}, err
	}
	if err := decodeOptionalJSON(voiceReuseJSON, &profile.NarratorVoiceReuse); err != nil {
		return ConversationPresentationProfile{}, err
	}
	return profile, profile.Validate()
}

func readBranch(ctx context.Context, reader *sql.Conn, conversationID string) (*ConversationBranch, error) {
	var branch ConversationBranch
	var metadataJSON string
	err := reader.QueryRowContext(ctx, `
SELECT child_conversation_id, parent_conversation_id, branch_kind,
       forked_at_turn_id, source_trajectory_sequence, provider_metadata_json,
       created_at
FROM conversation_branches WHERE child_conversation_id = ?
`, conversationID).Scan(
		&branch.ChildConversationID, &branch.ParentConversationID, &branch.Kind,
		&branch.ForkedAtTurnID, &branch.SourceTrajectorySequence, &metadataJSON,
		&branch.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := decodeRequiredJSON(metadataJSON, &branch.ProviderMetadata); err != nil {
		return nil, err
	}
	return &branch, branch.Validate()
}

func readSides(ctx context.Context, reader *sql.Conn, conversationID string) ([]SideConversation, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT id, parent_conversation_id, parent_pane_id, provider_thread_id,
       source_provider_turn_id, source_trajectory_sequence, status,
       resolved_side_agent_invocation_json, created_at, updated_at,
       disposed_at, failure_json
FROM side_conversations WHERE parent_conversation_id = ?
ORDER BY created_at ASC, id ASC LIMIT ?
`, conversationID, MaxSnapshotSideConversations)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]SideConversation, 0)
	for rows.Next() {
		record, err := scanSide(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func scanSide(scanner rowScanner) (SideConversation, error) {
	var record SideConversation
	var providerThreadID, sourceTurnID, disposedAt, failureJSON sql.NullString
	var invocationJSON string
	err := scanner.Scan(
		&record.ID, &record.ParentConversationID, &record.ParentPaneID,
		&providerThreadID, &sourceTurnID, &record.SourceTrajectorySequence,
		&record.Status, &invocationJSON, &record.CreatedAt, &record.UpdatedAt,
		&disposedAt, &failureJSON,
	)
	if err != nil {
		return SideConversation{}, err
	}
	record.ProviderThreadID = nullStringPointer(providerThreadID)
	record.SourceProviderTurnID = nullStringPointer(sourceTurnID)
	record.DisposedAt = nullStringPointer(disposedAt)
	if err := decodeRequiredJSON(invocationJSON, &record.ResolvedSideAgentInvocation); err != nil {
		return SideConversation{}, err
	}
	if err := decodeOptionalJSON(failureJSON, &record.Failure); err != nil {
		return SideConversation{}, err
	}
	return record, record.Validate()
}

func readConversationEventCursor(ctx context.Context, reader *sql.Conn, conversationID string) (ConversationEventCursor, error) {
	streamID, err := ConversationStreamID(conversationID)
	if err != nil {
		return ConversationEventCursor{}, err
	}
	var sequence int
	if err := reader.QueryRowContext(ctx, `
SELECT COALESCE(MAX(stream_sequence), 0) FROM committed_events WHERE stream_id = ?
`, streamID).Scan(&sequence); err != nil {
		return ConversationEventCursor{}, err
	}
	return ConversationEventCursor{StreamID: streamID, Sequence: sequence}, nil
}

func readConversationList(ctx context.Context, reader *sql.Conn, workspaceID string, cursor *string, limit int) (ConversationListPage, error) {
	query := `
SELECT id, workspace_id, title, topic_descriptor, status, created_at, updated_at,
       archived_at, last_trajectory_sequence
FROM conversations
WHERE archived_at IS NULL
  AND (? = '' OR workspace_id = ?)
  AND (? = '' OR (updated_at || ':' || id) < ?)
ORDER BY updated_at DESC, id DESC
LIMIT ?
`
	cursorValue := ""
	if cursor != nil {
		cursorValue = *cursor
	}
	rows, err := reader.QueryContext(ctx, query, workspaceID, workspaceID, cursorValue, cursorValue, limit+1)
	if err != nil {
		return ConversationListPage{}, err
	}
	defer rows.Close()
	records := make([]TopicConversation, 0, limit+1)
	for rows.Next() {
		var record TopicConversation
		var archivedAt sql.NullString
		if err := rows.Scan(&record.ID, &record.WorkspaceID, &record.Title, &record.TopicDescriptor, &record.Status, &record.CreatedAt, &record.UpdatedAt, &archivedAt, &record.LastTrajectorySequence); err != nil {
			return ConversationListPage{}, err
		}
		record.ArchivedAt = nullStringPointer(archivedAt)
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return ConversationListPage{}, err
	}
	var nextCursor *string
	if len(records) > limit {
		records = records[:limit]
		value := records[len(records)-1].UpdatedAt + ":" + records[len(records)-1].ID
		nextCursor = &value
	}
	return ConversationListPage{Conversations: records, NextCursor: nextCursor}, nil
}

func decodeRequiredJSON(raw string, target any) error {
	if !json.Valid([]byte(raw)) {
		return errors.New("stored JSON is invalid")
	}
	return json.Unmarshal([]byte(raw), target)
}

func decodeOptionalJSON(raw sql.NullString, target any) error {
	if !raw.Valid {
		return nil
	}
	return decodeRequiredJSON(raw.String, target)
}

func nullStringPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	copy := value.String
	return &copy
}

func nullIntPointer(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}
	copy := int(value.Int64)
	return &copy
}
