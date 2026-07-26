package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

func (store *Store) ReadArtifact(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	artifactID string,
) (Artifact, error) {
	if err := validateIdentifier("artifact workspace id", workspaceID); err != nil {
		return Artifact{}, err
	}
	if err := validateIdentifier("artifact conversation id", conversationID); err != nil {
		return Artifact{}, err
	}
	if err := validateIdentifier("artifact id", artifactID); err != nil {
		return Artifact{}, err
	}
	var artifact Artifact
	err := store.read(ctx, "read conversation artifact", func(ctx context.Context, reader *sql.Conn) error {
		row := reader.QueryRowContext(ctx, `
SELECT artifacts.id, artifacts.conversation_id, artifacts.turn_id,
       artifacts.trajectory_sequence, artifacts.title, artifacts.language,
       artifacts.catalog_id, artifacts.source, artifacts.created_at
FROM artifacts
JOIN conversations ON conversations.id = artifacts.conversation_id
WHERE artifacts.id = ? AND artifacts.conversation_id = ? AND conversations.workspace_id = ?
`, artifactID, conversationID, workspaceID)
		read, scanErr := scanArtifact(row)
		if scanErr != nil {
			return scanErr
		}
		artifact = read
		return nil
	})
	if errors.Is(err, sql.ErrNoRows) {
		return Artifact{}, fmt.Errorf("%w: %s/%s/%s", ErrArtifactNotFound, workspaceID, conversationID, artifactID)
	}
	if err != nil {
		return Artifact{}, err
	}
	return artifact, nil
}
