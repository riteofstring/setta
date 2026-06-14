package semanticgraph

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

func (store *Store) ReadSemanticCartographerSettings(ctx context.Context) (SemanticCartographerSettingsRecord, error) {
	if ctx == nil {
		return SemanticCartographerSettingsRecord{}, errors.New("context is required")
	}
	record, err := store.readSemanticCartographerSettings(ctx)
	if err != nil {
		return SemanticCartographerSettingsRecord{}, err
	}
	return record, nil
}

func (store *Store) UpdateSemanticCartographerSettings(ctx context.Context, settings SemanticCartographerSettings) (SemanticCartographerSettingsRecord, error) {
	if ctx == nil {
		return SemanticCartographerSettingsRecord{}, errors.New("context is required")
	}
	settings.UpdatedAt = timestamp(time.Now())
	settingsJSON, settingsHash, err := prepareSemanticCartographerSettingsJSON(settings)
	if err != nil {
		return SemanticCartographerSettingsRecord{}, err
	}
	result, err := store.db.ExecContext(ctx, `
UPDATE semantic_cartographer_settings
SET schema_version = ?,
    settings_json = ?,
    settings_hash = ?,
    updated_at = ?
WHERE id = ?
`, settings.SchemaVersion, settingsJSON, settingsHash, settings.UpdatedAt, semanticCartographerSettingsID)
	if err != nil {
		return SemanticCartographerSettingsRecord{}, store.persistenceError("update semantic cartographer settings", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return SemanticCartographerSettingsRecord{}, store.persistenceError("update semantic cartographer settings", err)
	}
	if affected != 1 {
		return SemanticCartographerSettingsRecord{}, store.corruptError("semantic cartographer settings", fmt.Errorf("singleton row %q is missing", semanticCartographerSettingsID))
	}
	return store.readSemanticCartographerSettings(ctx)
}

func (store *Store) createDefaultSemanticCartographerSettings(ctx context.Context) error {
	now := timestamp(time.Now())
	settings := DefaultSemanticCartographerSettings(now)
	settingsJSON, settingsHash, err := prepareSemanticCartographerSettingsJSON(settings)
	if err != nil {
		return err
	}
	_, err = store.db.ExecContext(ctx, `
INSERT INTO semantic_cartographer_settings (
  id, schema_version, settings_json, settings_hash, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?)
`, semanticCartographerSettingsID, settings.SchemaVersion, settingsJSON, settingsHash, now, now)
	if err != nil {
		return store.persistenceError("create default semantic cartographer settings", err)
	}
	return nil
}

func (store *Store) validateSemanticCartographerSettingsRow(ctx context.Context) error {
	_, err := store.readSemanticCartographerSettings(ctx)
	return err
}

type semanticCartographerSettingsRow struct {
	record        SemanticCartographerSettingsRecord
	schemaVersion int
	settingsJSON  string
}

func (store *Store) readSemanticCartographerSettingsRow(ctx context.Context) (semanticCartographerSettingsRow, error) {
	var record SemanticCartographerSettingsRecord
	var schemaVersion int
	var settingsJSON string
	err := store.db.QueryRowContext(ctx, `
SELECT id, schema_version, settings_json, settings_hash, created_at, updated_at
FROM semantic_cartographer_settings
WHERE id = ?
`, semanticCartographerSettingsID).Scan(
		&record.ID,
		&schemaVersion,
		&settingsJSON,
		&record.SettingsHash,
		&record.CreatedAt,
		&record.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return semanticCartographerSettingsRow{}, store.corruptError("semantic cartographer settings", fmt.Errorf("singleton row %q is missing", semanticCartographerSettingsID))
	}
	if err != nil {
		return semanticCartographerSettingsRow{}, store.persistenceError("read semantic cartographer settings", err)
	}
	return semanticCartographerSettingsRow{
		record:        record,
		schemaVersion: schemaVersion,
		settingsJSON:  settingsJSON,
	}, nil
}

func (store *Store) readSemanticCartographerSettings(ctx context.Context) (SemanticCartographerSettingsRecord, error) {
	row, err := store.readSemanticCartographerSettingsRow(ctx)
	if err != nil {
		return SemanticCartographerSettingsRecord{}, err
	}
	record, err := semanticCartographerSettingsRecordFromRow(row)
	if err != nil {
		return SemanticCartographerSettingsRecord{}, store.corruptError("semantic cartographer settings", err)
	}
	return record, nil
}

func semanticCartographerSettingsRecordFromRow(row semanticCartographerSettingsRow) (SemanticCartographerSettingsRecord, error) {
	record := row.record
	settingsJSON := row.settingsJSON
	settings, err := decodeSemanticCartographerSettings(settingsJSON)
	if err != nil {
		return SemanticCartographerSettingsRecord{}, err
	}
	if err := validateSemanticCartographerSettings(settings); err != nil {
		return SemanticCartographerSettingsRecord{}, err
	}
	if row.schemaVersion != settings.SchemaVersion {
		return SemanticCartographerSettingsRecord{}, fmt.Errorf("row schema_version %d does not match settings schemaVersion %d", row.schemaVersion, settings.SchemaVersion)
	}
	if record.UpdatedAt != settings.UpdatedAt {
		return SemanticCartographerSettingsRecord{}, fmt.Errorf("row updated_at %q does not match settings updatedAt %q", record.UpdatedAt, settings.UpdatedAt)
	}
	if err := validateTimestamp("semantic cartographer settings created_at", record.CreatedAt); err != nil {
		return SemanticCartographerSettingsRecord{}, err
	}
	if err := validateTimestamp("semantic cartographer settings updated_at", record.UpdatedAt); err != nil {
		return SemanticCartographerSettingsRecord{}, err
	}
	canonicalJSON, err := canonicalSemanticCartographerSettingsJSON(settings)
	if err != nil {
		return SemanticCartographerSettingsRecord{}, err
	}
	if settingsJSON != canonicalJSON {
		return SemanticCartographerSettingsRecord{}, errors.New("settings_json is not canonical")
	}
	expectedHash := hashBytes([]byte(canonicalJSON))
	if record.SettingsHash != expectedHash {
		return SemanticCartographerSettingsRecord{}, fmt.Errorf("settings_hash %q does not match canonical settings hash %q", record.SettingsHash, expectedHash)
	}
	record.Settings = settings
	return record, nil
}

func prepareSemanticCartographerSettingsJSON(settings SemanticCartographerSettings) (string, string, error) {
	settingsJSON, err := canonicalSemanticCartographerSettingsJSON(settings)
	if err != nil {
		return "", "", err
	}
	return settingsJSON, hashBytes([]byte(settingsJSON)), nil
}
