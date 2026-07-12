package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/speech"
)

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
	err := store.write(ctx, "initialize master voice selection", func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
INSERT INTO master_voice_selection (
  singleton, selection, requested_voice_id, resolved_voice_id, reuse_json, updated_at
) VALUES (1, ?, ?, ?, NULL, ?)
ON CONFLICT(singleton) DO NOTHING
`,
			initial.Selection,
			nullableString(voiceIDPointerString(initial.RequestedVoiceID)),
			nullableString(voiceIDPointerString(initial.ResolvedVoiceID)),
			initial.UpdatedAt,
		)
		if err != nil {
			return err
		}
		selection, err = readMasterVoiceSelectionRow(ctx, tx, store.dbPath)
		return err
	})
	if err != nil {
		return speech.MasterVoiceSelection{}, err
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
		var err error
		selection, err = readMasterVoiceSelectionRow(ctx, reader, store.dbPath)
		return err
	})
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	return speech.CloneMasterVoiceSelection(selection), nil
}

type masterVoiceSelectionQuery interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readMasterVoiceSelectionRow(
	ctx context.Context,
	query masterVoiceSelectionQuery,
	dbPath string,
) (speech.MasterVoiceSelection, error) {
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
		return speech.MasterVoiceSelection{}, &CorruptStateError{
			Path: dbPath,
			Err:  errors.New("master voice selection is missing"),
		}
	}
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	if reuseJSON.Valid {
		return speech.MasterVoiceSelection{}, &CorruptStateError{
			Path: dbPath,
			Err:  errors.New("master voice selection contains unsupported reuse metadata"),
		}
	}
	selection.RequestedVoiceID = scannedSpeechVoiceID(requestedVoiceID)
	selection.ResolvedVoiceID = scannedSpeechVoiceID(resolvedVoiceID)
	if err := selection.Validate(); err != nil {
		return speech.MasterVoiceSelection{}, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode master voice selection: %w", err),
		}
	}
	return selection, nil
}

func scannedSpeechVoiceID(value sql.NullString) *speech.SpeechVoiceID {
	if !value.Valid {
		return nil
	}
	result := speech.SpeechVoiceID(value.String)
	return &result
}
