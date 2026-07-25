package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

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
