package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

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
	if source.Speaker != speech.SpeechSpeakerNarrator {
		return speech.ResolvedSpeechSource{}, speech.SourceUnavailable(
			"The requested speech event is not conversation narration.",
			nil,
		)
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
