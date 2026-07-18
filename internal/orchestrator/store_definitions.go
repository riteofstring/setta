package orchestrator

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

func (store *Store) SaveDefinitionVersion(version WorkflowDefinitionVersion) error {
	if err := validateDefinitionVersionSnapshot(version); err != nil {
		return err
	}
	graphJSON, err := marshalJSONColumn(version.Graph)
	if err != nil {
		return fmt.Errorf("encode workflow definition version graph: %w", err)
	}
	return store.insertDefinitionVersion(context.Background(), store.db, version, graphJSON)
}

type workflowDefinitionVersionInserter interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func (store *Store) insertDefinitionVersion(ctx context.Context, execer workflowDefinitionVersionInserter, version WorkflowDefinitionVersion, graphJSON string) error {
	_, err := execer.ExecContext(ctx, `
INSERT INTO workflow_versions (
  id, schema_version, workspace_id, definition_id, version_number,
  name, description, graph_json, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		version.ID,
		version.SchemaVersion,
		version.WorkspaceID,
		version.DefinitionID,
		version.VersionNumber,
		version.Name,
		version.Description,
		graphJSON,
		version.CreatedAt,
	)
	if err != nil {
		return store.persistenceError("save workflow definition version", err)
	}
	return nil
}

func (store *Store) LatestDefinitionVersionNumber(workspaceID string, definitionID string) (int, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "definition id", definitionID); err != nil {
		return 0, err
	}
	var versionNumber int
	err := store.db.QueryRowContext(context.Background(), `
SELECT COALESCE(MAX(version_number), 0)
FROM workflow_versions
WHERE workspace_id = ? AND definition_id = ?
`, workspaceID, definitionID).Scan(&versionNumber)
	if err != nil {
		return 0, store.persistenceError("read latest workflow definition version number", err)
	}
	return versionNumber, nil
}

func (store *Store) LoadDefinitionVersion(workspaceID string, definitionID string, versionID string) (WorkflowDefinitionVersion, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "definition id", definitionID, "version id", versionID); err != nil {
		return WorkflowDefinitionVersion{}, err
	}
	row := store.db.QueryRowContext(context.Background(), `
SELECT schema_version, id, workspace_id, definition_id, version_number,
       name, description, graph_json, created_at
FROM workflow_versions
WHERE workspace_id = ? AND definition_id = ? AND id = ?
`, workspaceID, definitionID, versionID)
	version, err := scanWorkflowDefinitionVersion(row)
	if err != nil {
		return WorkflowDefinitionVersion{}, store.persistenceError("read workflow definition version", err)
	}
	if err := validateDefinitionVersionSnapshot(version); err != nil {
		return WorkflowDefinitionVersion{}, store.corruptError("workflow_versions/"+versionID, err)
	}
	return version, nil
}

type workflowDefinitionScanner interface {
	Scan(dest ...any) error
}

func scanWorkflowDefinitionVersion(scanner workflowDefinitionScanner) (WorkflowDefinitionVersion, error) {
	var version WorkflowDefinitionVersion
	var graphJSON string
	if err := scanner.Scan(
		&version.SchemaVersion,
		&version.ID,
		&version.WorkspaceID,
		&version.DefinitionID,
		&version.VersionNumber,
		&version.Name,
		&version.Description,
		&graphJSON,
		&version.CreatedAt,
	); err != nil {
		return WorkflowDefinitionVersion{}, err
	}
	if err := json.Unmarshal([]byte(graphJSON), &version.Graph); err != nil {
		return WorkflowDefinitionVersion{}, fmt.Errorf("decode workflow definition version graph: %w", err)
	}
	return version, nil
}
