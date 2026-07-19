package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"setta/internal/master"
	"setta/internal/speech"
)

func (store *Store) ResolveSpeechSource(
	ctx context.Context,
	source speech.SpeechSource,
) (speech.ResolvedSpeechSource, error) {
	if store == nil {
		return speech.ResolvedSpeechSource{}, errors.New("conversation store is required")
	}
	if err := source.Validate(); err != nil {
		return speech.ResolvedSpeechSource{}, err
	}
	if source.Speaker == speech.SpeechSpeakerMaster {
		return store.resolveMasterSpeechSource(ctx, source)
	}
	if source.Kind == speech.SpeechSourceKindProgressHighlight {
		return store.resolveProgressHighlightSpeechSource(ctx, source)
	}
	record, err := store.readNarrationSpeechSource(ctx, source)
	if err != nil {
		return speech.ResolvedSpeechSource{}, err
	}
	if !record.found {
		return speech.ResolvedSpeechSource{}, speech.SourceUnavailable(
			"The requested narration event is not available in this conversation.",
			nil,
		)
	}
	return store.resolveNarrationSpeechSource(source, record)
}

type masterSpeechSourceRecord struct {
	found bool
	state master.InputRoutingState
	voice speech.MasterVoiceSelection
}

func (store *Store) resolveMasterSpeechSource(
	ctx context.Context,
	source speech.SpeechSource,
) (speech.ResolvedSpeechSource, error) {
	record, err := store.readMasterSpeechSource(ctx, source)
	if err != nil {
		return speech.ResolvedSpeechSource{}, err
	}
	if !record.found ||
		!masterSpeechSourceHasAnswer(record.state) {
		return speech.ResolvedSpeechSource{}, speech.SourceUnavailable(
			"The requested master speech event is not available.",
			nil,
		)
	}
	resolved := speech.ResolvedSpeechSource{
		Source:          source,
		Text:            record.state.Decision.ResultingCommand.AnswerGlobal.Text,
		ResolvedVoiceID: *record.voice.ResolvedVoiceID,
	}
	if err := resolved.Validate(); err != nil {
		return speech.ResolvedSpeechSource{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return resolved, nil
}

func (store *Store) readMasterSpeechSource(
	ctx context.Context,
	source speech.SpeechSource,
) (masterSpeechSourceRecord, error) {
	var record masterSpeechSourceRecord
	err := store.read(ctx, "resolve master speech source", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		state, err := readMasterInputRoutingStateTransaction(ctx, reader, source.EventID, store.dbPath)
		if IsStateConflict(err) {
			return nil
		}
		if err != nil {
			return err
		}
		record.found = true
		record.state = state
		if !masterSpeechSourceHasAnswer(state) {
			return reader.Commit()
		}
		stored, selectionFound, markerFound, err := inspectMasterVoiceSelectionState(
			ctx,
			reader,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		voice, err := resolveMasterVoiceSelectionState(
			stored,
			selectionFound,
			markerFound,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		if voice == nil {
			return corruptMasterVoiceConfiguration(store.dbPath, "master voice selection is missing")
		}
		if err := voice.Validate(); err != nil {
			return &CorruptStateError{
				Path: store.dbPath,
				Err:  fmt.Errorf("validate master voice selection: %w", err),
			}
		}
		record.voice = *voice
		return reader.Commit()
	})
	if err != nil {
		return masterSpeechSourceRecord{}, err
	}
	return record, nil
}

func masterSpeechSourceHasAnswer(state master.InputRoutingState) bool {
	return state.Status == master.InputRoutingStatusDecided &&
		state.Decision != nil &&
		state.Decision.ResultingCommand.Kind == master.RouteDecisionKindAnswerGlobal &&
		state.Decision.ResultingCommand.AnswerGlobal != nil
}

type progressHighlightSpeechSourceRecord struct {
	artifact *ArtifactMetadata
	event    TrajectoryEvent
	found    bool
	profile  ConversationPresentationProfile
	turn     *ConversationTurn
}

func (store *Store) resolveProgressHighlightSpeechSource(
	ctx context.Context,
	source speech.SpeechSource,
) (speech.ResolvedSpeechSource, error) {
	record, err := store.readProgressHighlightSpeechSource(ctx, source)
	if err != nil {
		return speech.ResolvedSpeechSource{}, err
	}
	if !record.found {
		return speech.ResolvedSpeechSource{}, speech.SourceUnavailable(
			"The requested progress highlight is not available in this conversation.",
			nil,
		)
	}
	if !record.profile.NarratorSpeechEnabled {
		return speech.ResolvedSpeechSource{}, speech.SourceUnavailable(
			"Narrator speech is disabled for this conversation.",
			nil,
		)
	}
	text, err := progressHighlightSpeechText(record)
	if err != nil {
		return speech.ResolvedSpeechSource{}, err
	}
	resolved := speech.ResolvedSpeechSource{
		Source:          source,
		Text:            text,
		ResolvedVoiceID: *record.profile.ResolvedNarratorVoiceID,
	}
	if err := resolved.Validate(); err != nil {
		return speech.ResolvedSpeechSource{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return resolved, nil
}

func (store *Store) readProgressHighlightSpeechSource(
	ctx context.Context,
	source speech.SpeechSource,
) (progressHighlightSpeechSourceRecord, error) {
	var record progressHighlightSpeechSourceRecord
	err := store.read(ctx, "resolve progress highlight speech source", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		if err := store.populateProgressHighlightSpeechSourceRecord(ctx, reader, *source.ConversationID, source.EventID, &record); err != nil {
			return err
		}
		return reader.Commit()
	})
	if err != nil {
		return progressHighlightSpeechSourceRecord{}, err
	}
	return store.validateProgressHighlightSpeechSourceRecord(source.EventID, record)
}

func (store *Store) populateProgressHighlightSpeechSourceRecord(
	ctx context.Context,
	reader *sql.Tx,
	conversationID string,
	eventID string,
	record *progressHighlightSpeechSourceRecord,
) error {
	event, found, err := readProgressHighlightSpeechEvent(ctx, reader, conversationID, eventID)
	if err != nil || !found {
		return err
	}
	record.event = event
	record.found = true
	profile, err := store.readProgressHighlightSpeechProfile(ctx, reader, conversationID)
	if err != nil {
		return err
	}
	record.profile = profile
	if err := store.attachProgressHighlightSpeechTurn(ctx, reader, conversationID, record); err != nil {
		return err
	}
	return store.attachProgressHighlightSpeechArtifact(ctx, reader, conversationID, record)
}

func readProgressHighlightSpeechEvent(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	eventID string,
) (TrajectoryEvent, bool, error) {
	event, err := readTrajectorySpeechEvent(ctx, reader, conversationID, eventID)
	if errors.Is(err, sql.ErrNoRows) {
		return TrajectoryEvent{}, false, nil
	}
	if err != nil {
		return TrajectoryEvent{}, false, err
	}
	return event, true, nil
}

func (store *Store) readProgressHighlightSpeechProfile(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
) (ConversationPresentationProfile, error) {
	profile, err := readSnapshotPresentation(ctx, reader, conversationID)
	if errors.Is(err, sql.ErrNoRows) {
		return ConversationPresentationProfile{}, &CorruptStateError{
			Path: store.dbPath,
			Err:  fmt.Errorf("progress highlight speech presentation profile is missing for conversation %s", conversationID),
		}
	}
	return profile, err
}

func (store *Store) attachProgressHighlightSpeechTurn(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	record *progressHighlightSpeechSourceRecord,
) error {
	if record.event.TurnID == nil {
		return nil
	}
	turn, err := readSpeechSourceTurn(ctx, reader, conversationID, *record.event.TurnID)
	if errors.Is(err, sql.ErrNoRows) {
		return &CorruptStateError{
			Path: store.dbPath,
			Err:  fmt.Errorf("progress highlight speech turn %s is missing", *record.event.TurnID),
		}
	}
	if err != nil {
		return err
	}
	record.turn = &turn
	return nil
}

func (store *Store) attachProgressHighlightSpeechArtifact(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	record *progressHighlightSpeechSourceRecord,
) error {
	if record.event.ArtifactEmitted == nil {
		return nil
	}
	artifactID := record.event.ArtifactEmitted.ArtifactID
	artifact, err := readSpeechSourceArtifactMetadata(ctx, reader, conversationID, artifactID)
	if errors.Is(err, sql.ErrNoRows) {
		return &CorruptStateError{
			Path: store.dbPath,
			Err:  fmt.Errorf("progress highlight speech artifact %s is missing", artifactID),
		}
	}
	if err != nil {
		return err
	}
	record.artifact = &artifact
	return nil
}

func (store *Store) validateProgressHighlightSpeechSourceRecord(
	eventID string,
	record progressHighlightSpeechSourceRecord,
) (progressHighlightSpeechSourceRecord, error) {
	if !record.found {
		return record, nil
	}
	if err := record.event.Validate(); err != nil {
		return progressHighlightSpeechSourceRecord{}, &CorruptStateError{
			Path: store.dbPath,
			Err:  fmt.Errorf("validate progress highlight speech event %s: %w", eventID, err),
		}
	}
	if err := record.profile.Validate(); err != nil {
		return progressHighlightSpeechSourceRecord{}, &CorruptStateError{
			Path: store.dbPath,
			Err:  fmt.Errorf("validate progress highlight speech presentation profile: %w", err),
		}
	}
	if err := store.validateProgressHighlightSpeechTurn(record.turn); err != nil {
		return progressHighlightSpeechSourceRecord{}, err
	}
	if err := store.validateProgressHighlightSpeechArtifact(record.artifact); err != nil {
		return progressHighlightSpeechSourceRecord{}, err
	}
	return record, nil
}

func (store *Store) validateProgressHighlightSpeechTurn(turn *ConversationTurn) error {
	if turn == nil {
		return nil
	}
	if err := turn.Validate(); err != nil {
		return &CorruptStateError{
			Path: store.dbPath,
			Err:  fmt.Errorf("validate progress highlight speech turn: %w", err),
		}
	}
	return nil
}

func (store *Store) validateProgressHighlightSpeechArtifact(artifact *ArtifactMetadata) error {
	if artifact == nil {
		return nil
	}
	if err := artifact.Validate(); err != nil {
		return &CorruptStateError{
			Path: store.dbPath,
			Err:  fmt.Errorf("validate progress highlight speech artifact: %w", err),
		}
	}
	return nil
}

func readTrajectorySpeechEvent(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	eventID string,
) (TrajectoryEvent, error) {
	return scanTrajectoryEvent(reader.QueryRowContext(ctx, `
SELECT id, conversation_id, turn_id, sequence, emitted_at, kind, actor,
       provider_event_id, provider_thread_id, provider_turn_id, payload_json
FROM trajectory_events
WHERE conversation_id = ? AND id = ?
`, conversationID, eventID))
}

func readSpeechSourceTurn(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	turnID string,
) (ConversationTurn, error) {
	return scanConversationTurn(reader.QueryRowContext(ctx, `
SELECT id, conversation_id, authored_input_json, delivery, status, accepted_at,
       started_at, ended_at, requested_role_profile_json,
       resolved_invocation_json, provider_turn_id, error_json
FROM conversation_turns
WHERE conversation_id = ? AND id = ?
`, conversationID, turnID))
}

func readSpeechSourceArtifactMetadata(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	artifactID string,
) (ArtifactMetadata, error) {
	return scanArtifactMetadata(reader.QueryRowContext(ctx, `
SELECT id, conversation_id, turn_id, trajectory_sequence, kind, title, created_at
FROM artifacts
WHERE conversation_id = ? AND id = ?
`, conversationID, artifactID))
}

func progressHighlightSpeechText(record progressHighlightSpeechSourceRecord) (string, error) {
	title, body, err := progressHighlightSpeechTitleBody(record)
	if err != nil {
		return "", err
	}
	return speechLine(title, body), nil
}

func progressHighlightSpeechTitleBody(
	record progressHighlightSpeechSourceRecord,
) (string, string, error) {
	switch record.event.Kind {
	case TrajectoryEventTurnStarted:
		return turnStartedSpeechTitleBody(record)
	case TrajectoryEventApprovalRequested:
		return approvalRequestedSpeechTitleBody(record)
	case TrajectoryEventApprovalResolved:
		return approvalResolvedSpeechTitleBody(record)
	case TrajectoryEventArtifactEmitted:
		return artifactEmittedSpeechTitleBody(record)
	case TrajectoryEventTurnCompleted:
		return "Complete", "Work completed.", nil
	case TrajectoryEventTurnFailed:
		return turnFailedSpeechTitleBody(record)
	case TrajectoryEventTurnInterrupted:
		return turnInterruptedSpeechTitleBody(record)
	default:
		return "", "", unavailableProgressHighlight(record.event.ID)
	}
}

func turnStartedSpeechTitleBody(record progressHighlightSpeechSourceRecord) (string, string, error) {
	if record.turn == nil {
		return "", "", unavailableProgressHighlight(record.event.ID)
	}
	return "Working", objectiveSpeechBody(*record.turn), nil
}

func approvalRequestedSpeechTitleBody(record progressHighlightSpeechSourceRecord) (string, string, error) {
	if record.event.ApprovalRequested == nil {
		return "", "", unavailableProgressHighlight(record.event.ID)
	}
	return "Needs approval", approvalRequestSpeechBody(record.event.ApprovalRequested.Approval), nil
}

func approvalResolvedSpeechTitleBody(record progressHighlightSpeechSourceRecord) (string, string, error) {
	if record.event.ApprovalResolved == nil {
		return "", "", unavailableProgressHighlight(record.event.ID)
	}
	decision := record.event.ApprovalResolved.Resolution.Decision
	return approvalResolutionSpeechTitle(decision), approvalResolutionSpeechBody(record, decision), nil
}

func artifactEmittedSpeechTitleBody(record progressHighlightSpeechSourceRecord) (string, string, error) {
	if record.event.ArtifactEmitted == nil || record.artifact == nil {
		return "", "", unavailableProgressHighlight(record.event.ID)
	}
	return artifactReadySpeechTitle(record.artifact.Kind),
		displaySpeechLine(record.artifact.Title, "A result artifact is ready."),
		nil
}

func turnFailedSpeechTitleBody(record progressHighlightSpeechSourceRecord) (string, string, error) {
	if record.event.TurnFailed == nil {
		return "", "", unavailableProgressHighlight(record.event.ID)
	}
	return "Failed", displaySpeechLine(record.event.TurnFailed.Failure.Message, "Work failed."), nil
}

func turnInterruptedSpeechTitleBody(record progressHighlightSpeechSourceRecord) (string, string, error) {
	if record.event.TurnInterrupted == nil {
		return "", "", unavailableProgressHighlight(record.event.ID)
	}
	return "Stopped", turnInterruptedSpeechBody(record.event.TurnInterrupted.Reason), nil
}

func unavailableProgressHighlight(eventID string) error {
	return speech.SourceUnavailable(
		fmt.Sprintf("The requested progress highlight %s is not speech-worthy.", eventID),
		nil,
	)
}

func speechLine(title string, body string) string {
	title = displaySpeechLine(title, "Working")
	body = displaySpeechLine(body, "Working on your request.")
	if strings.HasSuffix(title, ".") || strings.HasSuffix(title, "!") || strings.HasSuffix(title, "?") {
		return title + " " + body
	}
	return title + ". " + body
}

func objectiveSpeechBody(turn ConversationTurn) string {
	return displaySpeechLine(turn.AuthoredInput.Text, "Working on your request.")
}

func approvalRequestSpeechBody(approval TrajectoryApprovalRequest) string {
	if text := displaySpeechLine(approval.Body, ""); text != "" {
		return text
	}
	if approval.Command != nil {
		if text := displaySpeechLine(*approval.Command, ""); text != "" {
			return text
		}
	}
	if len(approval.Questions) > 0 {
		if text := displaySpeechLine(approval.Questions[0].Question, ""); text != "" {
			return text
		}
	}
	return displaySpeechLine(approval.Title, "Approval is required to continue.")
}

func approvalResolutionSpeechTitle(decision TrajectoryApprovalDecision) string {
	switch decision {
	case TrajectoryApprovalDecisionApproved, TrajectoryApprovalDecisionApprovedForSession:
		return "Approval received"
	case TrajectoryApprovalDecisionAnswered:
		return "Answer received"
	case TrajectoryApprovalDecisionDenied:
		return "Approval denied"
	case TrajectoryApprovalDecisionCancelled:
		return "Approval cancelled"
	default:
		return "Approval updated"
	}
}

func approvalResolutionSpeechBody(
	record progressHighlightSpeechSourceRecord,
	decision TrajectoryApprovalDecision,
) string {
	switch decision {
	case TrajectoryApprovalDecisionApproved,
		TrajectoryApprovalDecisionApprovedForSession,
		TrajectoryApprovalDecisionAnswered:
		if record.turn == nil {
			return "Continuing work."
		}
		return objectiveSpeechBody(*record.turn)
	case TrajectoryApprovalDecisionDenied:
		return "Continuing without that approval."
	case TrajectoryApprovalDecisionCancelled:
		return "The approval request was cancelled."
	default:
		return "Continuing work."
	}
}

func artifactReadySpeechTitle(kind ArtifactKind) string {
	switch kind {
	case ArtifactKindMarkdown:
		return "Markdown ready"
	case ArtifactKindTable:
		return "Table ready"
	case ArtifactKindBarChart:
		return "Chart ready"
	case ArtifactKindFile:
		return "File ready"
	default:
		return "Artifact ready"
	}
}

func turnInterruptedSpeechBody(reason TurnInterruptionReason) string {
	switch reason {
	case TurnInterruptionUserRequested:
		return "Work stopped at your request."
	case TurnInterruptionProviderInterrupted:
		return "The turn was interrupted."
	case TurnInterruptionRuntimeShutdown:
		return "The turn stopped during shutdown."
	case TurnInterruptionReconciliation:
		return "The turn stopped during recovery."
	default:
		return "Work stopped."
	}
}

func displaySpeechLine(text string, fallback string) string {
	const maxLength = 120
	normalized := strings.Join(strings.Fields(text), " ")
	if normalized == "" {
		normalized = fallback
	}
	if len(normalized) <= maxLength {
		return normalized
	}
	runes := []rune(normalized)
	if len(runes) <= maxLength {
		return normalized
	}
	return strings.TrimSpace(string(runes[:maxLength-3])) + "..."
}

type narrationSpeechSourceRecord struct {
	event   NarrationEvent
	found   bool
	profile ConversationPresentationProfile
}

func (store *Store) readNarrationSpeechSource(
	ctx context.Context,
	source speech.SpeechSource,
) (narrationSpeechSourceRecord, error) {
	var record narrationSpeechSourceRecord
	err := store.read(ctx, "resolve narration speech source", func(ctx context.Context, connection *sql.Conn) error {
		reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
		if err != nil {
			return err
		}
		defer func() { _ = reader.Rollback() }()
		record.event, err = readNarrationSpeechEvent(ctx, reader, *source.ConversationID, source.EventID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		record.found = true
		record.profile, err = readSnapshotPresentation(ctx, reader, *source.ConversationID)
		if errors.Is(err, sql.ErrNoRows) {
			return &CorruptStateError{
				Path: store.dbPath,
				Err:  fmt.Errorf("narration speech presentation profile is missing for conversation %s", *source.ConversationID),
			}
		}
		if err != nil {
			return err
		}
		return reader.Commit()
	})
	if err != nil {
		return narrationSpeechSourceRecord{}, err
	}
	if !record.found {
		return record, nil
	}
	if err := record.event.Validate(); err != nil {
		return narrationSpeechSourceRecord{}, &CorruptStateError{
			Path: store.dbPath,
			Err:  fmt.Errorf("validate narration speech event %s: %w", source.EventID, err),
		}
	}
	if err := record.profile.Validate(); err != nil {
		return narrationSpeechSourceRecord{}, &CorruptStateError{
			Path: store.dbPath,
			Err:  fmt.Errorf("validate narration speech presentation profile: %w", err),
		}
	}
	return record, nil
}

func (store *Store) resolveNarrationSpeechSource(
	source speech.SpeechSource,
	record narrationSpeechSourceRecord,
) (speech.ResolvedSpeechSource, error) {
	if !record.profile.NarratorSpeechEnabled {
		return speech.ResolvedSpeechSource{}, speech.SourceUnavailable(
			"Narrator speech is disabled for this conversation.",
			nil,
		)
	}
	text, err := narrationSpeechText(record.event)
	if err != nil {
		return speech.ResolvedSpeechSource{}, err
	}
	resolved := speech.ResolvedSpeechSource{
		Source:          source,
		Text:            text,
		ResolvedVoiceID: *record.profile.ResolvedNarratorVoiceID,
	}
	if err := resolved.Validate(); err != nil {
		return speech.ResolvedSpeechSource{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return resolved, nil
}

func readNarrationSpeechEvent(
	ctx context.Context,
	reader snapshotReader,
	conversationID string,
	eventID string,
) (NarrationEvent, error) {
	return scanNarrationEvent(reader.QueryRowContext(ctx, `
SELECT id, conversation_id, turn_id, stream_sequence, kind,
       source_sequence_start, source_sequence_end, trigger, payload_json,
       resolved_invocation_json, created_at
FROM narration_events
WHERE conversation_id = ? AND id = ?
`, conversationID, eventID))
}

func narrationSpeechText(event NarrationEvent) (string, error) {
	switch event.Kind {
	case NarrationEventKindMilestone:
		return event.Milestone.Text, nil
	case NarrationEventKindStatusReply:
		return event.StatusReply.Text, nil
	case NarrationEventKindFinalSummary:
		return event.FinalSummary.Text, nil
	case NarrationEventKindTopicDescriptor:
		return "", speech.SourceUnavailable(
			"Topic descriptor events are retrieval metadata and cannot be synthesized.",
			nil,
		)
	default:
		return "", fmt.Errorf("unsupported narration speech event kind %q", event.Kind)
	}
}
