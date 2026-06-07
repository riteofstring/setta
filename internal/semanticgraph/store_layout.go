package semanticgraph

import (
	"context"
	"database/sql"
	"errors"
)

func (store *Store) UpdateLayoutPositions(ctx context.Context, workspaceID string, positions []SemanticLayoutPositionInput, updatedAt string) (SemanticLayoutPositionList, error) {
	if ctx == nil {
		return SemanticLayoutPositionList{}, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID); err != nil {
		return SemanticLayoutPositionList{}, err
	}
	if err := validateTimestamp("updatedAt", updatedAt); err != nil {
		return SemanticLayoutPositionList{}, err
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return SemanticLayoutPositionList{}, store.persistenceError("begin semantic layout position update", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	for _, position := range positions {
		if err := updateSemanticLayoutPosition(ctx, tx, workspaceID, position, updatedAt); err != nil {
			return SemanticLayoutPositionList{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return SemanticLayoutPositionList{}, store.persistenceError("commit semantic layout position update", err)
	}
	committed = true
	current, err := store.loadSemanticLayoutPositions(ctx, workspaceID)
	if err != nil {
		return SemanticLayoutPositionList{}, err
	}
	return SemanticLayoutPositionList{WorkspaceID: workspaceID, Positions: current}, nil
}

func updateSemanticLayoutPosition(ctx context.Context, tx *sql.Tx, workspaceID string, position SemanticLayoutPositionInput, updatedAt string) error {
	if err := validateStoreIDs("semantic layout entity id", position.EntityID); err != nil {
		return err
	}
	if err := requireSemanticEntity(ctx, tx, workspaceID, position.EntityID); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `
INSERT INTO semantic_layout_positions (
  workspace_id, entity_id, x, y, pinned, updated_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, entity_id) DO UPDATE SET
  x = excluded.x,
  y = excluded.y,
  pinned = excluded.pinned,
  updated_at = excluded.updated_at
`, workspaceID, position.EntityID, position.X, position.Y, intFromBool(position.Pinned), updatedAt)
	return err
}
