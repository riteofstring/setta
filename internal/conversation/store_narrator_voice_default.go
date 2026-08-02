package conversation

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/speech"
)

func (store *Store) EnsureNarratorVoiceDefault(
	ctx context.Context,
	initial speech.NarratorVoiceDefault,
) (speech.NarratorVoiceDefault, error) {
	if store == nil {
		return speech.NarratorVoiceDefault{}, errors.New("conversation store is required")
	}
	if err := initial.Validate(); err != nil {
		return speech.NarratorVoiceDefault{}, err
	}
	var value speech.NarratorVoiceDefault
	initialized := false
	err := store.write(ctx, "initialize narrator voice default", func(ctx context.Context, tx *sql.Tx) error {
		stored, valueFound, markerFound, err := inspectNarratorVoiceDefaultState(ctx, tx, store.dbPath)
		if err != nil {
			return err
		}
		existing, err := resolveNarratorVoiceDefaultState(stored, valueFound, markerFound, store.dbPath)
		if err != nil {
			return err
		}
		if existing != nil {
			value = *existing
			return nil
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO narrator_voice_default (
  singleton, selection, requested_voice_id, updated_at
) VALUES (1, ?, ?, ?)
`, initial.Selection, nullableString(voiceIDPointerString(initial.RequestedVoiceID)), initial.UpdatedAt); err != nil {
			return err
		}
		value = speech.CloneNarratorVoiceDefault(initial)
		if err := appendNarratorVoiceDefaultInitialization(ctx, tx, value); err != nil {
			return err
		}
		initialized = true
		return nil
	})
	if err != nil {
		return speech.NarratorVoiceDefault{}, err
	}
	if initialized {
		store.notifyCommittedEvents()
	}
	return speech.CloneNarratorVoiceDefault(value), nil
}

func (store *Store) ReadNarratorVoiceDefault(
	ctx context.Context,
) (speech.NarratorVoiceDefault, error) {
	if store == nil {
		return speech.NarratorVoiceDefault{}, errors.New("conversation store is required")
	}
	var value speech.NarratorVoiceDefault
	err := store.read(ctx, "read narrator voice default", func(ctx context.Context, reader *sql.Conn) error {
		stored, valueFound, markerFound, err := inspectNarratorVoiceDefaultState(ctx, reader, store.dbPath)
		if err != nil {
			return err
		}
		existing, err := resolveNarratorVoiceDefaultState(stored, valueFound, markerFound, store.dbPath)
		if err != nil {
			return err
		}
		if existing == nil {
			return corruptNarratorVoiceDefault(store.dbPath, "narrator voice default is missing")
		}
		value = *existing
		return nil
	})
	if err != nil {
		return speech.NarratorVoiceDefault{}, err
	}
	return speech.CloneNarratorVoiceDefault(value), nil
}

func (store *Store) UpdateNarratorVoiceDefault(
	ctx context.Context,
	request speech.VoiceSelectionRequest,
	updatedAt string,
) (speech.NarratorVoiceDefault, error) {
	if ctx == nil {
		return speech.NarratorVoiceDefault{}, errors.New("narrator voice default update context is required")
	}
	if err := request.Validate(); err != nil {
		return speech.NarratorVoiceDefault{}, err
	}
	var result speech.NarratorVoiceDefault
	err := store.withPresentationConfigurationLock(func() error {
		current, err := store.ReadNarratorVoiceDefault(ctx)
		if err != nil {
			return err
		}
		if narratorVoiceDefaultMatchesRequest(current, request) {
			result = current
			return nil
		}
		result = speech.NarratorVoiceDefault{
			Selection:        request.Selection,
			RequestedVoiceID: cloneVoiceID(request.RequestedVoiceID),
			UpdatedAt:        advanceTimestamp(current.UpdatedAt, updatedAt),
		}
		if err := result.Validate(); err != nil {
			return err
		}
		update := speech.NewNarratorVoiceDefaultUpdate(current, result)
		if err := update.Validate(); err != nil {
			return err
		}
		eventID, err := randomServiceID("speech_event")
		if err != nil {
			return err
		}
		_, err = store.Transact(ctx, "update narrator voice default", func(transaction *WriteTransaction) error {
			if err := transaction.UpdateNarratorVoiceDefault(current.UpdatedAt, result); err != nil {
				return err
			}
			_, err := transaction.AppendCommittedEvent(CommittedEventDraft{
				ID:          eventID,
				StreamID:    speech.NarratorVoiceDefaultStreamID,
				Kind:        speech.NarratorVoiceDefaultUpdatedEventKind,
				Payload:     update,
				CommittedAt: result.UpdatedAt,
			})
			return err
		})
		return err
	})
	if err != nil {
		return speech.NarratorVoiceDefault{}, err
	}
	return speech.CloneNarratorVoiceDefault(result), nil
}

func narratorVoiceDefaultMatchesRequest(
	value speech.NarratorVoiceDefault,
	request speech.VoiceSelectionRequest,
) bool {
	if value.Selection != request.Selection {
		return false
	}
	if request.Selection == speech.VoiceSelectionAutoDistinct {
		return true
	}
	return voiceIDsEqual(value.RequestedVoiceID, request.RequestedVoiceID)
}

func inspectNarratorVoiceDefaultState(
	ctx context.Context,
	query directorVoiceSelectionQuery,
	dbPath string,
) (speech.NarratorVoiceDefault, bool, bool, error) {
	value, valueFound, err := findNarratorVoiceDefaultRow(ctx, query, dbPath)
	if err != nil {
		return speech.NarratorVoiceDefault{}, false, false, err
	}
	markerFound, err := findNarratorVoiceDefaultInitialization(ctx, query, dbPath)
	if err != nil {
		return speech.NarratorVoiceDefault{}, false, false, err
	}
	return value, valueFound, markerFound, nil
}

func resolveNarratorVoiceDefaultState(
	value speech.NarratorVoiceDefault,
	valueFound bool,
	markerFound bool,
	dbPath string,
) (*speech.NarratorVoiceDefault, error) {
	switch {
	case valueFound && markerFound:
		return &value, nil
	case valueFound:
		return nil, corruptNarratorVoiceDefault(dbPath, "narrator voice default initialization event is missing")
	case markerFound:
		return nil, corruptNarratorVoiceDefault(dbPath, "narrator voice default is missing after initialization")
	default:
		return nil, nil
	}
}

func findNarratorVoiceDefaultRow(
	ctx context.Context,
	query directorVoiceSelectionQuery,
	dbPath string,
) (speech.NarratorVoiceDefault, bool, error) {
	var value speech.NarratorVoiceDefault
	var requestedVoiceID sql.NullString
	err := query.QueryRowContext(ctx, `
SELECT selection, requested_voice_id, updated_at
FROM narrator_voice_default
WHERE singleton = 1
`).Scan(&value.Selection, &requestedVoiceID, &value.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return speech.NarratorVoiceDefault{}, false, nil
	}
	if err != nil {
		return speech.NarratorVoiceDefault{}, false, err
	}
	value.RequestedVoiceID = scannedSpeechVoiceID(requestedVoiceID)
	if err := value.Validate(); err != nil {
		return speech.NarratorVoiceDefault{}, false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode narrator voice default: %w", err),
		}
	}
	return value, true, nil
}

func findNarratorVoiceDefaultInitialization(
	ctx context.Context,
	query directorVoiceSelectionQuery,
	dbPath string,
) (bool, error) {
	var event CommittedEvent
	var payloadJSON string
	err := query.QueryRowContext(ctx, `
SELECT commit_sequence, id, stream_id, stream_sequence, kind, payload_json, committed_at
FROM committed_events
WHERE id = ?
`, speech.NarratorVoiceDefaultInitializedEventID).Scan(
		&event.CommitSequence,
		&event.ID,
		&event.StreamID,
		&event.StreamSequence,
		&event.Kind,
		&payloadJSON,
		&event.CommittedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	event.Payload = json.RawMessage(payloadJSON)
	if err := event.Validate(); err != nil {
		return false, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("narrator voice default initialization event: %w", err)}
	}
	if event.StreamID != speech.NarratorVoiceDefaultStreamID || event.StreamSequence != 1 ||
		event.Kind != speech.NarratorVoiceDefaultInitializedEventKind {
		return false, corruptNarratorVoiceDefault(dbPath, "narrator voice default initialization event has invalid identity")
	}
	var initialization speech.NarratorVoiceDefaultInitialization
	decoder := json.NewDecoder(bytes.NewBufferString(payloadJSON))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&initialization); err != nil {
		return false, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("decode narrator voice default initialization event: %w", err)}
	}
	if err := initialization.Validate(); err != nil {
		return false, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("validate narrator voice default initialization event: %w", err)}
	}
	if event.CommittedAt != initialization.Default.UpdatedAt {
		return false, corruptNarratorVoiceDefault(dbPath, "narrator voice default initialization event timestamp does not match its value")
	}
	return true, nil
}

func appendNarratorVoiceDefaultInitialization(
	ctx context.Context,
	tx *sql.Tx,
	value speech.NarratorVoiceDefault,
) error {
	transaction := &WriteTransaction{ctx: ctx, tx: tx, active: true}
	defer func() {
		transaction.active = false
	}()
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	initialization := speech.NewNarratorVoiceDefaultInitialization(value)
	if err := initialization.Validate(); err != nil {
		return err
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          speech.NarratorVoiceDefaultInitializedEventID,
		StreamID:    speech.NarratorVoiceDefaultStreamID,
		Kind:        speech.NarratorVoiceDefaultInitializedEventKind,
		Payload:     initialization,
		CommittedAt: value.UpdatedAt,
	}); err != nil {
		return err
	}
	return validateWriteTransactionResult(transaction)
}

func corruptNarratorVoiceDefault(dbPath string, message string) error {
	return &CorruptStateError{Path: dbPath, Err: errors.New(message)}
}
