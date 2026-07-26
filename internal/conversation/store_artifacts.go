package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// ReadArtifact reads one artifact by the conversation that published it.
// WorkspaceID scopes a bound artifact read when present. A nil workspace
// addresses an artifact that the Director recorded without a folder, including
// one whose conversation gained a folder after publication.
func (store *Store) ReadArtifact(
	ctx context.Context,
	workspaceID *string,
	conversationID string,
	artifactID string,
) (Artifact, error) {
	if workspaceID != nil {
		if err := validateIdentifier("artifact workspace id", *workspaceID); err != nil {
			return Artifact{}, err
		}
	}
	if err := validateIdentifier("artifact conversation id", conversationID); err != nil {
		return Artifact{}, err
	}
	if err := validateIdentifier("artifact id", artifactID); err != nil {
		return Artifact{}, err
	}
	var artifact Artifact
	err := store.read(ctx, "read conversation artifact", func(ctx context.Context, reader *sql.Conn) error {
		read, scanErr := scanArtifact(artifactRow(ctx, reader, workspaceID, conversationID, artifactID))
		if scanErr != nil {
			return scanErr
		}
		artifact = read
		return nil
	})
	if errors.Is(err, sql.ErrNoRows) {
		return Artifact{}, fmt.Errorf(
			"%w: %s/%s/%s",
			ErrArtifactNotFound,
			optionalWorkspaceLabel(workspaceID),
			conversationID,
			artifactID,
		)
	}
	if err != nil {
		return Artifact{}, err
	}
	return artifact, nil
}

func artifactRow(
	ctx context.Context,
	reader *sql.Conn,
	workspaceID *string,
	conversationID string,
	artifactID string,
) *sql.Row {
	if workspaceID == nil {
		return reader.QueryRowContext(ctx, `
SELECT artifacts.id, artifacts.conversation_id, artifacts.turn_id,
       artifacts.trajectory_sequence, artifacts.title, artifacts.kind,
       artifacts.summary, artifacts.language, artifacts.catalog_id,
       artifacts.source, artifacts.created_at
FROM artifacts
WHERE artifacts.id = ? AND artifacts.conversation_id = ?
`, artifactID, conversationID)
	}
	return reader.QueryRowContext(ctx, `
SELECT artifacts.id, artifacts.conversation_id, artifacts.turn_id,
       artifacts.trajectory_sequence, artifacts.title, artifacts.kind,
       artifacts.summary, artifacts.language, artifacts.catalog_id,
       artifacts.source, artifacts.created_at
FROM artifacts
JOIN conversations ON conversations.id = artifacts.conversation_id
WHERE artifacts.id = ? AND artifacts.conversation_id = ? AND conversations.workspace_id = ?
`, artifactID, conversationID, *workspaceID)
}
