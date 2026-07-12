package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type WorkspacePaneBinding struct {
	PaneID         string
	ConversationID string
	Focused        bool
}

type workspacePaneBindingHistory struct {
	conversationID string
	createdAt      string
	lastFocusedAt  sql.NullString
}

// ReplaceWorkspacePaneBindings projects one authoritative workspace layout
// into the conversation store. Rows absent from the layout are removed so a
// routed side command cannot target a pane that has already closed.
func (store *Store) ReplaceWorkspacePaneBindings(
	ctx context.Context,
	workspaceID string,
	bindings []WorkspacePaneBinding,
	updatedAt string,
) error {
	if err := validateWorkspacePaneBindingReplacement(
		store,
		ctx,
		workspaceID,
		bindings,
		updatedAt,
	); err != nil {
		return err
	}
	return store.write(ctx, "replace workspace pane bindings", func(ctx context.Context, tx *sql.Tx) error {
		return replaceWorkspacePaneBindingsTransaction(
			ctx,
			tx,
			workspaceID,
			bindings,
			updatedAt,
		)
	})
}

func validateWorkspacePaneBindingReplacement(
	store *Store,
	ctx context.Context,
	workspaceID string,
	bindings []WorkspacePaneBinding,
	updatedAt string,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("workspace pane binding context is required")
	}
	if err := validateIdentifier("pane binding workspace id", workspaceID); err != nil {
		return err
	}
	if _, err := validateTimestamp("pane binding updatedAt", updatedAt); err != nil {
		return err
	}
	if bindings == nil {
		return errors.New("workspace pane bindings must be an array")
	}
	return validateWorkspacePaneBindings(bindings)
}

func replaceWorkspacePaneBindingsTransaction(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	bindings []WorkspacePaneBinding,
	updatedAt string,
) error {
	history, err := readWorkspacePaneBindingHistory(ctx, tx, workspaceID)
	if err != nil {
		return err
	}
	if err := requireWorkspacePaneBindingOwners(ctx, tx, workspaceID, bindings); err != nil {
		return err
	}
	if _, err := tx.ExecContext(
		ctx,
		`DELETE FROM pane_bindings WHERE workspace_id = ?`,
		workspaceID,
	); err != nil {
		return fmt.Errorf("remove stale workspace pane bindings: %w", err)
	}
	for _, binding := range bindings {
		createdAt, lastFocusedAt := workspacePaneBindingTimestamps(
			binding,
			history[binding.PaneID],
			updatedAt,
		)
		if _, err := tx.ExecContext(ctx, `
INSERT INTO pane_bindings(
  pane_id, workspace_id, conversation_id, created_at, updated_at, last_focused_at
) VALUES(?, ?, ?, ?, ?, ?)
`,
			binding.PaneID,
			workspaceID,
			binding.ConversationID,
			createdAt,
			updatedAt,
			lastFocusedAt,
		); err != nil {
			return fmt.Errorf("insert workspace pane binding %s: %w", binding.PaneID, err)
		}
	}
	return nil
}

func workspacePaneBindingTimestamps(
	binding WorkspacePaneBinding,
	previous workspacePaneBindingHistory,
	updatedAt string,
) (string, any) {
	createdAt := updatedAt
	var lastFocusedAt any
	if previous.conversationID == binding.ConversationID && previous.createdAt != "" {
		createdAt = previous.createdAt
		if previous.lastFocusedAt.Valid {
			lastFocusedAt = previous.lastFocusedAt.String
		}
	}
	if binding.Focused {
		lastFocusedAt = updatedAt
	}
	return createdAt, lastFocusedAt
}

func readWorkspacePaneBindingHistory(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
) (map[string]workspacePaneBindingHistory, error) {
	rows, err := tx.QueryContext(ctx, `
SELECT pane_id, conversation_id, created_at, last_focused_at
FROM pane_bindings
WHERE workspace_id = ?
`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("read workspace pane binding history: %w", err)
	}
	defer rows.Close()

	history := map[string]workspacePaneBindingHistory{}
	for rows.Next() {
		var paneID string
		var previous workspacePaneBindingHistory
		if err := rows.Scan(
			&paneID,
			&previous.conversationID,
			&previous.createdAt,
			&previous.lastFocusedAt,
		); err != nil {
			return nil, fmt.Errorf("scan workspace pane binding history: %w", err)
		}
		history[paneID] = previous
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate workspace pane binding history: %w", err)
	}
	return history, nil
}

func validateWorkspacePaneBindings(bindings []WorkspacePaneBinding) error {
	seen := map[string]bool{}
	focused := 0
	for _, binding := range bindings {
		if err := validateIdentifier("pane binding pane id", binding.PaneID); err != nil {
			return err
		}
		if err := validateIdentifier("pane binding conversation id", binding.ConversationID); err != nil {
			return err
		}
		if seen[binding.PaneID] {
			return fmt.Errorf("pane binding %s is duplicated", binding.PaneID)
		}
		seen[binding.PaneID] = true
		if binding.Focused {
			focused++
		}
	}
	if focused > 1 {
		return errors.New("workspace pane bindings contain more than one focused pane")
	}
	return nil
}

func requireWorkspacePaneBindingOwners(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	bindings []WorkspacePaneBinding,
) error {
	for _, binding := range bindings {
		var ownerWorkspaceID string
		err := tx.QueryRowContext(
			ctx,
			`SELECT workspace_id FROM conversations WHERE id = ?`,
			binding.ConversationID,
		).Scan(&ownerWorkspaceID)
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("%w: %s", ErrConversationNotFound, binding.ConversationID)
		}
		if err != nil {
			return fmt.Errorf("read pane binding conversation %s: %w", binding.ConversationID, err)
		}
		if ownerWorkspaceID != workspaceID {
			return stateConflict(
				"conversation",
				binding.ConversationID,
				fmt.Sprintf("belongs to workspace %s, not %s", ownerWorkspaceID, workspaceID),
			)
		}
	}
	return nil
}
