package conversation

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/jsonio"
	"setta/internal/master"
)

func (store *Store) ReadMasterTranscript(
	ctx context.Context,
	limit int,
) (master.Transcript, error) {
	if store == nil {
		return master.Transcript{}, errors.New("conversation store is required")
	}
	if ctx == nil {
		return master.Transcript{}, errors.New("master transcript context is required")
	}
	if err := master.ValidateTranscriptReadLimit(limit); err != nil {
		return master.Transcript{}, err
	}
	var transcript master.Transcript
	err := store.read(ctx, "read master transcript", func(ctx context.Context, reader *sql.Conn) error {
		events, err := readLatestMasterTranscriptEvents(ctx, reader, store.dbPath, limit)
		if err != nil {
			return err
		}
		transcript, err = masterTranscriptFromCommittedEvents(events, store.dbPath)
		return err
	})
	if err != nil {
		return master.Transcript{}, err
	}
	return master.CloneTranscript(transcript), nil
}

func readLatestMasterTranscriptEvents(
	ctx context.Context,
	reader *sql.Conn,
	dbPath string,
	limit int,
) ([]CommittedEvent, error) {
	rows, err := reader.QueryContext(ctx, `
SELECT commit_sequence, id, stream_id, stream_sequence, kind, payload_json, committed_at
FROM (
  SELECT commit_sequence, id, stream_id, stream_sequence, kind, payload_json, committed_at
  FROM committed_events
  WHERE stream_id = ?
  ORDER BY stream_sequence DESC
  LIMIT ?
)
ORDER BY stream_sequence ASC
`, master.TranscriptStreamID, limit)
	if err != nil {
		return nil, fmt.Errorf("read master transcript events: %w", err)
	}
	defer rows.Close()
	return scanCommittedEvents(rows, dbPath)
}

func masterTranscriptFromCommittedEvents(
	events []CommittedEvent,
	dbPath string,
) (master.Transcript, error) {
	entries := make([]master.TranscriptEntry, 0, len(events))
	for _, event := range events {
		entry, err := masterTranscriptEntryFromCommittedEvent(event)
		if err != nil {
			return master.Transcript{}, &CorruptStateError{
				Path: dbPath,
				Err:  fmt.Errorf("decode master transcript event %s: %w", event.ID, err),
			}
		}
		entries = append(entries, entry)
	}
	transcript := master.Transcript{Entries: entries}
	if len(entries) > 0 {
		transcript.LastSequence = entries[len(entries)-1].Sequence
	}
	if err := transcript.Validate(); err != nil {
		return master.Transcript{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("validate master transcript: %w", err),
		}
	}
	return transcript, nil
}

func masterTranscriptEntryFromCommittedEvent(
	event CommittedEvent,
) (master.TranscriptEntry, error) {
	if event.StreamID != master.TranscriptStreamID {
		return master.TranscriptEntry{}, fmt.Errorf("event stream = %q, want %q", event.StreamID, master.TranscriptStreamID)
	}
	if event.Kind != master.TranscriptEntryAddedKind {
		return master.TranscriptEntry{}, fmt.Errorf("event kind = %q, want %q", event.Kind, master.TranscriptEntryAddedKind)
	}
	var payload master.TranscriptEntryPayload
	if err := jsonio.DecodeSingle(bytes.NewBuffer(event.Payload), &payload); err != nil {
		return master.TranscriptEntry{}, err
	}
	if payload.ID != event.ID {
		return master.TranscriptEntry{}, errors.New("transcript payload id does not match event id")
	}
	if payload.CreatedAt != event.CommittedAt {
		return master.TranscriptEntry{}, errors.New("transcript payload timestamp does not match event timestamp")
	}
	return master.TranscriptEntryFromPayload(event.StreamSequence, payload)
}

func appendMasterTranscriptAcceptedInput(
	transaction *WriteTransaction,
	accepted master.AcceptedMasterInput,
) error {
	payload, ok, err := master.TranscriptPayloadForAcceptedInput(accepted)
	if err != nil || !ok {
		return err
	}
	return appendMasterTranscriptEntry(transaction, payload)
}

func appendMasterTranscriptRouteCommand(
	transaction *WriteTransaction,
	dbPath string,
	record master.RouteDecisionRecord,
	completedAt string,
) error {
	accepted, found, err := readMasterInputRow(
		transaction.ctx,
		transaction.tx,
		record.InputID,
		dbPath,
	)
	if err != nil {
		return err
	}
	if !found {
		return stateConflict("master transcript input", record.InputID, "input was not found")
	}
	payload, ok, err := master.TranscriptPayloadForRouteCommand(accepted, record, completedAt)
	if err != nil || !ok {
		return err
	}
	return appendMasterTranscriptEntry(transaction, payload)
}

func appendMasterTranscriptCancellation(
	transaction *WriteTransaction,
	state master.InputRoutingState,
) error {
	payload, ok, err := master.TranscriptPayloadForCancellation(state)
	if err != nil || !ok {
		return err
	}
	return appendMasterTranscriptEntry(transaction, payload)
}

func appendMasterTranscriptFailure(
	transaction *WriteTransaction,
	accepted master.AcceptedMasterInput,
	failure master.InputRoutingFailure,
) error {
	payload, ok, err := master.TranscriptPayloadForFailure(accepted, failure)
	if err != nil || !ok {
		return err
	}
	return appendMasterTranscriptEntry(transaction, payload)
}

func appendMasterTranscriptEntry(
	transaction *WriteTransaction,
	payload master.TranscriptEntryPayload,
) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := payload.Validate(); err != nil {
		return err
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          payload.ID,
		StreamID:    master.TranscriptStreamID,
		Kind:        master.TranscriptEntryAddedKind,
		Payload:     payload,
		CommittedAt: payload.CreatedAt,
	}); err != nil {
		return err
	}
	return nil
}
