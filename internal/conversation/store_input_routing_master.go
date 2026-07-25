package conversation

import (
	"context"
	"database/sql"
	"fmt"

	"setta/internal/master"
)

func applyConversationRouteDecisionCommand(
	transaction *WriteTransaction,
	dbPath string,
	root conversationInputRecord,
	commit ConversationRouteDecisionCommit,
) error {
	if commit.ResultingCommand.Kind != ConversationRouteDecisionKindEscalateToMaster {
		return nil
	}
	workspaceID, err := readConversationRouteWorkspaceID(
		transaction.ctx,
		transaction.tx,
		commit.ConversationID,
	)
	if err != nil {
		return err
	}
	modality, err := masterInputModalityForConversationInput(root.Accepted.Input.Modality)
	if err != nil {
		return err
	}
	command := commit.ResultingCommand.EscalateToMaster
	conversationID := commit.ConversationID
	inputID := root.Accepted.Input.ID
	input := master.MasterInput{
		ID:                             command.MasterInputID,
		Text:                           command.Input.Text,
		Modality:                       modality,
		Source:                         master.MasterInputSourceConversationEscalation,
		SubmittedAt:                    commit.DecidedAt,
		OriginatingWorkspaceID:         &workspaceID,
		OriginatingConversationID:      &conversationID,
		OriginatingConversationInputID: &inputID,
	}
	accepted, appended, err := acceptMasterInputTransaction(
		transaction.ctx,
		transaction.tx,
		dbPath,
		input,
		commit.DecidedAt,
	)
	if err != nil {
		return fmt.Errorf("accept routed master input %s: %w", input.ID, err)
	}
	if !appended {
		return stateConflict("master input", input.ID, "routed master input already exists")
	}
	if err := accepted.Validate(); err != nil {
		return fmt.Errorf("validate routed master input %s: %w", input.ID, err)
	}
	return nil
}

func readConversationRouteWorkspaceID(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
) (string, error) {
	var workspaceID sql.NullString
	if err := tx.QueryRowContext(ctx, `
SELECT workspace_id
FROM conversations
WHERE id = ?
`, conversationID).Scan(&workspaceID); err != nil {
		return "", fmt.Errorf("read conversation route workspace %s: %w", conversationID, err)
	}
	if !workspaceID.Valid {
		return "", fmt.Errorf("%w: %s", ErrConversationHasNoWorkspace, conversationID)
	}
	return workspaceID.String, nil
}

func masterInputModalityForConversationInput(
	modality ConversationInputModality,
) (master.MasterInputModality, error) {
	switch modality {
	case ConversationInputModalityText:
		return master.MasterInputModalityText, nil
	case ConversationInputModalityVoice:
		return master.MasterInputModalityVoice, nil
	default:
		return "", fmt.Errorf("unsupported routed master input modality %q", modality)
	}
}
