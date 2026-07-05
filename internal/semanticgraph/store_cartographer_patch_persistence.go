package semanticgraph

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

func (store *Store) SaveCartographerPatch(ctx context.Context, patch CartographerPatchRecord) (CartographerPatchRecord, error) {
	if err := validateCartographerPatchRecord(ctx, patch); err != nil {
		return CartographerPatchRecord{}, err
	}
	normalizeCartographerPatchRecord(&patch)
	columns, err := cartographerPatchJSONColumns(patch)
	if err != nil {
		return CartographerPatchRecord{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return CartographerPatchRecord{}, store.persistenceError("begin cartographer patch save", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := store.saveCartographerPatchLocked(ctx, tx, patch, columns); err != nil {
		return CartographerPatchRecord{}, err
	}
	if err := store.replaceCartographerValidationDiagnostics(ctx, tx, patch); err != nil {
		return CartographerPatchRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return CartographerPatchRecord{}, store.persistenceError("commit cartographer patch save", err)
	}
	committed = true
	return patch, nil
}

func (store *Store) SaveCartographerPatchesAndAppendEvents(ctx context.Context, patches []CartographerPatchRecord, events []SemanticEvent) ([]SemanticEvent, error) {
	if ctx == nil {
		return nil, errors.New("context is required")
	}
	patchColumns, err := prepareCartographerPatchColumns(ctx, patches)
	if err != nil {
		return nil, err
	}
	prepared, err := prepareOptionalSemanticEventsForAppend(events)
	if err != nil {
		return nil, err
	}
	return store.saveCartographerPatchesAndAppendEvents(ctx, patches, patchColumns, prepared)
}

func (store *Store) SaveCartographerRunPatchesAndAppendEvents(ctx context.Context, run CartographerRun, patches []CartographerPatchRecord, events []SemanticEvent) ([]SemanticEvent, error) {
	if ctx == nil {
		return nil, errors.New("context is required")
	}
	if err := validateCartographerRun(ctx, run); err != nil {
		return nil, err
	}
	normalizeCartographerRun(&run)
	runColumns, err := prepareCartographerRunJSONColumns(run)
	if err != nil {
		return nil, err
	}
	patchColumns, err := prepareCartographerPatchColumns(ctx, patches)
	if err != nil {
		return nil, err
	}
	prepared, err := prepareOptionalSemanticEventsForAppend(events)
	if err != nil {
		return nil, err
	}
	return store.saveCartographerRunPatchesAndAppendEvents(ctx, run, runColumns, patches, patchColumns, prepared)
}

func (store *Store) saveCartographerRunPatchesAndAppendEvents(ctx context.Context, run CartographerRun, runColumns cartographerRunJSONColumns, patches []CartographerPatchRecord, patchColumns []cartographerPatchColumns, prepared []SemanticEvent) ([]SemanticEvent, error) {
	store.mu.Lock()
	defer store.mu.Unlock()

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, store.persistenceError("begin cartographer run patch application", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := saveCartographerRunLocked(ctx, tx, run, runColumns); err != nil {
		return nil, store.persistenceError("save cartographer run", err)
	}
	if err := store.saveCartographerPatchesLocked(ctx, tx, patches, patchColumns); err != nil {
		return nil, err
	}
	if err := store.appendPreparedSemanticEventsLocked(ctx, tx, prepared); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, store.persistenceError("commit cartographer run patch application", err)
	}
	committed = true
	return prepared, nil
}

func (store *Store) saveCartographerPatchesAndAppendEvents(ctx context.Context, patches []CartographerPatchRecord, patchColumns []cartographerPatchColumns, prepared []SemanticEvent) ([]SemanticEvent, error) {
	store.mu.Lock()
	defer store.mu.Unlock()

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, store.persistenceError("begin cartographer patch application", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := store.saveCartographerPatchesLocked(ctx, tx, patches, patchColumns); err != nil {
		return nil, err
	}
	if err := store.appendPreparedSemanticEventsLocked(ctx, tx, prepared); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, store.persistenceError("commit cartographer patch application", err)
	}
	committed = true
	return prepared, nil
}

func (store *Store) saveCartographerPatchesLocked(ctx context.Context, tx *sql.Tx, patches []CartographerPatchRecord, patchColumns []cartographerPatchColumns) error {
	for index := range patches {
		if err := store.saveCartographerPatchLocked(ctx, tx, patches[index], patchColumns[index]); err != nil {
			return err
		}
		if err := store.replaceCartographerValidationDiagnostics(ctx, tx, patches[index]); err != nil {
			return err
		}
	}
	return nil
}

func (store *Store) appendPreparedSemanticEventsLocked(ctx context.Context, tx *sql.Tx, prepared []SemanticEvent) error {
	if len(prepared) == 0 {
		return nil
	}
	nextClock, err := nextSemanticLogicalClock(ctx, tx, prepared[0].WorkspaceID)
	if err != nil {
		return store.persistenceError("read next semantic logical clock", err)
	}
	if err := assignSemanticEventLogicalClocks(prepared, nextClock); err != nil {
		return err
	}
	return store.insertSemanticEvents(ctx, tx, prepared)
}

func prepareCartographerPatchColumns(ctx context.Context, patches []CartographerPatchRecord) ([]cartographerPatchColumns, error) {
	if len(patches) == 0 {
		return nil, errors.New("cartographer patches are required")
	}
	columns := make([]cartographerPatchColumns, 0, len(patches))
	for _, patch := range patches {
		if err := validateCartographerPatchRecord(ctx, patch); err != nil {
			return nil, err
		}
		normalizeCartographerPatchRecord(&patch)
		next, err := cartographerPatchJSONColumns(patch)
		if err != nil {
			return nil, err
		}
		columns = append(columns, next)
	}
	return columns, nil
}

func prepareOptionalSemanticEventsForAppend(events []SemanticEvent) ([]SemanticEvent, error) {
	if len(events) == 0 {
		return []SemanticEvent{}, nil
	}
	return prepareSemanticEventsForAppend(events)
}

type cartographerPatchColumns struct {
	patchJSON           string
	validationJSON      string
	applicationJSON     string
	createdEventIDsJSON string
}

func cartographerPatchJSONColumns(patch CartographerPatchRecord) (cartographerPatchColumns, error) {
	normalizeCartographerPatchRecord(&patch)
	patchJSON, err := marshalJSONColumn(patch.Patch)
	if err != nil {
		return cartographerPatchColumns{}, fmt.Errorf("encode cartographer patch: %w", err)
	}
	validationJSON, err := marshalJSONColumn(patch.ValidationResult)
	if err != nil {
		return cartographerPatchColumns{}, fmt.Errorf("encode cartographer validation result: %w", err)
	}
	applicationJSON, err := marshalJSONColumn(patch.ApplicationResult)
	if err != nil {
		return cartographerPatchColumns{}, fmt.Errorf("encode cartographer application result: %w", err)
	}
	createdEventIDsJSON, err := marshalJSONColumn(patch.CreatedSemanticEventIDs)
	if err != nil {
		return cartographerPatchColumns{}, fmt.Errorf("encode cartographer created semantic event ids: %w", err)
	}
	return cartographerPatchColumns{
		patchJSON:           patchJSON,
		validationJSON:      validationJSON,
		applicationJSON:     applicationJSON,
		createdEventIDsJSON: createdEventIDsJSON,
	}, nil
}

func (store *Store) saveCartographerPatchLocked(ctx context.Context, tx *sql.Tx, patch CartographerPatchRecord, columns cartographerPatchColumns) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO semantic_cartographer_patches (
  workspace_id, id, run_id, window_id, status, patch_json,
  validation_result_json, application_result_json,
  created_semantic_event_ids_json, created_at, validated_at, applied_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, id) DO UPDATE SET
  run_id = excluded.run_id,
  window_id = excluded.window_id,
  status = excluded.status,
  patch_json = excluded.patch_json,
  validation_result_json = excluded.validation_result_json,
  application_result_json = excluded.application_result_json,
  created_semantic_event_ids_json = excluded.created_semantic_event_ids_json,
  validated_at = excluded.validated_at,
  applied_at = excluded.applied_at
`,
		patch.WorkspaceID,
		patch.ID,
		patch.RunID,
		patch.WindowID,
		patch.Status,
		columns.patchJSON,
		columns.validationJSON,
		columns.applicationJSON,
		columns.createdEventIDsJSON,
		patch.CreatedAt,
		patch.ValidatedAt,
		patch.AppliedAt,
	)
	if err != nil {
		return store.persistenceError("save cartographer patch", err)
	}
	return nil
}

func (store *Store) replaceCartographerValidationDiagnostics(ctx context.Context, tx *sql.Tx, patch CartographerPatchRecord) error {
	if _, err := tx.ExecContext(ctx, `
DELETE FROM semantic_cartographer_validation_diagnostics
WHERE workspace_id = ? AND patch_id = ?
`, patch.WorkspaceID, patch.ID); err != nil {
		return store.persistenceError("replace cartographer validation diagnostics", err)
	}
	for _, diagnostic := range patch.ValidationResult.Diagnostics {
		if err := insertCartographerDiagnostic(ctx, tx, patch.WorkspaceID, diagnostic); err != nil {
			return err
		}
	}
	return nil
}
