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

var _ speech.VoiceConfigurationStore = (*Store)(nil)

func (store *Store) EnsureMasterVoiceSelection(
	ctx context.Context,
	initial speech.MasterVoiceSelection,
) (speech.MasterVoiceSelection, error) {
	if store == nil {
		return speech.MasterVoiceSelection{}, errors.New("conversation store is required")
	}
	if err := initial.Validate(); err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	var selection speech.MasterVoiceSelection
	initialized := false
	err := store.write(ctx, "initialize master voice selection", func(ctx context.Context, tx *sql.Tx) error {
		stored, selectionFound, markerFound, err := inspectMasterVoiceSelectionState(
			ctx,
			tx,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		existing, err := resolveMasterVoiceSelectionState(
			stored,
			selectionFound,
			markerFound,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		if existing != nil {
			selection = *existing
			return nil
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO master_voice_selection (
  singleton, selection, requested_voice_id, resolved_voice_id, reuse_json, updated_at
) VALUES (1, ?, ?, ?, NULL, ?)
`,
			initial.Selection,
			nullableString(voiceIDPointerString(initial.RequestedVoiceID)),
			nullableString(voiceIDPointerString(initial.ResolvedVoiceID)),
			initial.UpdatedAt,
		); err != nil {
			return err
		}
		selection = speech.CloneMasterVoiceSelection(initial)
		if err := appendMasterVoiceSelectionInitialization(ctx, tx, selection); err != nil {
			return err
		}
		initialized = true
		return nil
	})
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	if initialized {
		store.notifyCommittedEvents()
	}
	return speech.CloneMasterVoiceSelection(selection), nil
}

func (store *Store) ReadMasterVoiceSelection(
	ctx context.Context,
) (speech.MasterVoiceSelection, error) {
	if store == nil {
		return speech.MasterVoiceSelection{}, errors.New("conversation store is required")
	}
	var selection speech.MasterVoiceSelection
	err := store.read(ctx, "read master voice selection", func(ctx context.Context, reader *sql.Conn) error {
		stored, selectionFound, markerFound, err := inspectMasterVoiceSelectionState(
			ctx,
			reader,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		existing, err := resolveMasterVoiceSelectionState(
			stored,
			selectionFound,
			markerFound,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		if existing == nil {
			return corruptMasterVoiceConfiguration(store.dbPath, "master voice selection is missing")
		}
		selection = *existing
		return nil
	})
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	return speech.CloneMasterVoiceSelection(selection), nil
}

type masterVoiceSelectionQuery interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func inspectMasterVoiceSelectionState(
	ctx context.Context,
	query masterVoiceSelectionQuery,
	dbPath string,
) (speech.MasterVoiceSelection, bool, bool, error) {
	selection, selectionFound, err := findMasterVoiceSelectionRow(ctx, query, dbPath)
	if err != nil {
		return speech.MasterVoiceSelection{}, false, false, err
	}
	markerFound, err := findMasterVoiceSelectionInitialization(ctx, query, dbPath)
	if err != nil {
		return speech.MasterVoiceSelection{}, false, false, err
	}
	return selection, selectionFound, markerFound, nil
}

func resolveMasterVoiceSelectionState(
	selection speech.MasterVoiceSelection,
	selectionFound bool,
	markerFound bool,
	dbPath string,
) (*speech.MasterVoiceSelection, error) {
	switch {
	case selectionFound && markerFound:
		return &selection, nil
	case selectionFound:
		return nil, corruptMasterVoiceConfiguration(
			dbPath,
			"master voice selection initialization event is missing",
		)
	case markerFound:
		return nil, corruptMasterVoiceConfiguration(
			dbPath,
			"master voice selection is missing after initialization",
		)
	default:
		return nil, nil
	}
}

func findMasterVoiceSelectionRow(
	ctx context.Context,
	query masterVoiceSelectionQuery,
	dbPath string,
) (speech.MasterVoiceSelection, bool, error) {
	var selection speech.MasterVoiceSelection
	var requestedVoiceID sql.NullString
	var resolvedVoiceID sql.NullString
	var reuseJSON sql.NullString
	err := query.QueryRowContext(ctx, `
SELECT selection, requested_voice_id, resolved_voice_id, reuse_json, updated_at
FROM master_voice_selection
WHERE singleton = 1
`).Scan(
		&selection.Selection,
		&requestedVoiceID,
		&resolvedVoiceID,
		&reuseJSON,
		&selection.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return speech.MasterVoiceSelection{}, false, nil
	}
	if err != nil {
		return speech.MasterVoiceSelection{}, false, err
	}
	if reuseJSON.Valid {
		return speech.MasterVoiceSelection{}, false, corruptMasterVoiceConfiguration(
			dbPath,
			"master voice selection contains unsupported reuse metadata",
		)
	}
	selection.RequestedVoiceID = scannedSpeechVoiceID(requestedVoiceID)
	selection.ResolvedVoiceID = scannedSpeechVoiceID(resolvedVoiceID)
	if err := selection.Validate(); err != nil {
		return speech.MasterVoiceSelection{}, false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode master voice selection: %w", err),
		}
	}
	return selection, true, nil
}

func findMasterVoiceSelectionInitialization(
	ctx context.Context,
	query masterVoiceSelectionQuery,
	dbPath string,
) (bool, error) {
	var event CommittedEvent
	var payloadJSON string
	err := query.QueryRowContext(ctx, `
SELECT commit_sequence, id, stream_id, stream_sequence, kind, payload_json, committed_at
FROM committed_events
WHERE id = ?
`, speech.MasterVoiceSelectionInitializedEventID).Scan(
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
		return false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("master voice selection initialization event: %w", err),
		}
	}
	if event.StreamID != speech.MasterVoiceSelectionStreamID || event.StreamSequence != 1 ||
		event.Kind != speech.MasterVoiceSelectionInitializedEventKind {
		return false, corruptMasterVoiceConfiguration(
			dbPath,
			"master voice selection initialization event has invalid identity",
		)
	}
	var initialization speech.MasterVoiceSelectionInitialization
	decoder := json.NewDecoder(bytes.NewBufferString(payloadJSON))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&initialization); err != nil {
		return false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode master voice selection initialization event: %w", err),
		}
	}
	if err := initialization.Validate(); err != nil {
		return false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("validate master voice selection initialization event: %w", err),
		}
	}
	if event.CommittedAt != initialization.Selection.UpdatedAt {
		return false, corruptMasterVoiceConfiguration(
			dbPath,
			"master voice selection initialization event timestamp does not match its selection",
		)
	}
	return true, nil
}

func appendMasterVoiceSelectionInitialization(
	ctx context.Context,
	tx *sql.Tx,
	selection speech.MasterVoiceSelection,
) error {
	transaction := &WriteTransaction{ctx: ctx, tx: tx, active: true}
	defer func() {
		transaction.active = false
	}()
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	initialization := speech.NewMasterVoiceSelectionInitialization(selection)
	if err := initialization.Validate(); err != nil {
		return err
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          speech.MasterVoiceSelectionInitializedEventID,
		StreamID:    speech.MasterVoiceSelectionStreamID,
		Kind:        speech.MasterVoiceSelectionInitializedEventKind,
		Payload:     initialization,
		CommittedAt: selection.UpdatedAt,
	}); err != nil {
		return err
	}
	return validateWriteTransactionResult(transaction)
}

func corruptMasterVoiceConfiguration(dbPath string, message string) error {
	return &CorruptStateError{Path: dbPath, Err: errors.New(message)}
}

func scannedSpeechVoiceID(value sql.NullString) *speech.SpeechVoiceID {
	if !value.Valid {
		return nil
	}
	result := speech.SpeechVoiceID(value.String)
	return &result
}
