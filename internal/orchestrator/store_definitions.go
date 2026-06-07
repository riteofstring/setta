package orchestrator

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

func (store *Store) SaveDefinitionRevision(definition WorkflowDefinition, version WorkflowDefinitionVersion) error {
	if err := validateDefinitionRevision(definition, version); err != nil {
		return err
	}
	definitionGraphJSON, versionGraphJSON, err := definitionRevisionGraphJSON(definition, version)
	if err != nil {
		return err
	}
	return store.saveDefinitionRevisionTransaction(definition, version, definitionGraphJSON, versionGraphJSON)
}

func validateDefinitionRevision(definition WorkflowDefinition, version WorkflowDefinitionVersion) error {
	if err := validateDefinitionSnapshot(definition); err != nil {
		return err
	}
	if err := validateDefinitionVersionSnapshot(version); err != nil {
		return err
	}
	if version.WorkspaceID != definition.WorkspaceID || version.DefinitionID != definition.ID {
		return fmt.Errorf("definition version %s belongs to workspace %s definition %s, not workspace %s definition %s", version.ID, version.WorkspaceID, version.DefinitionID, definition.WorkspaceID, definition.ID)
	}
	if definition.CurrentVersionID != version.ID || definition.CurrentVersionNumber != version.VersionNumber {
		return fmt.Errorf("definition %s current version %s/%d does not match version %s/%d", definition.ID, definition.CurrentVersionID, definition.CurrentVersionNumber, version.ID, version.VersionNumber)
	}
	return nil
}

func definitionRevisionGraphJSON(definition WorkflowDefinition, version WorkflowDefinitionVersion) (string, string, error) {
	definitionGraphJSON, err := marshalJSONColumn(definition.Graph)
	if err != nil {
		return "", "", fmt.Errorf("encode workflow definition graph: %w", err)
	}
	versionGraphJSON, err := marshalJSONColumn(version.Graph)
	if err != nil {
		return "", "", fmt.Errorf("encode workflow definition version graph: %w", err)
	}
	return definitionGraphJSON, versionGraphJSON, nil
}

func (store *Store) saveDefinitionRevisionTransaction(definition WorkflowDefinition, version WorkflowDefinitionVersion, definitionGraphJSON string, versionGraphJSON string) error {
	ctx := context.Background()
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return store.persistenceError("begin workflow definition transaction", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := store.upsertDefinition(ctx, tx, definition, definitionGraphJSON); err != nil {
		return err
	}
	if err := store.insertDefinitionVersion(ctx, tx, version, versionGraphJSON); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return store.persistenceError("commit workflow definition transaction", err)
	}
	committed = true
	return nil
}

func (store *Store) upsertDefinition(ctx context.Context, tx *sql.Tx, definition WorkflowDefinition, graphJSON string) error {
	_, err := tx.ExecContext(ctx, `
INSERT INTO workflow_definitions (
  id, schema_version, workspace_id, name, description, current_version_id,
  current_version_number, graph_json, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  schema_version = excluded.schema_version,
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  description = excluded.description,
  current_version_id = excluded.current_version_id,
  current_version_number = excluded.current_version_number,
  graph_json = excluded.graph_json,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at
`,
		definition.ID,
		definition.SchemaVersion,
		definition.WorkspaceID,
		definition.Name,
		definition.Description,
		definition.CurrentVersionID,
		definition.CurrentVersionNumber,
		graphJSON,
		definition.CreatedAt,
		definition.UpdatedAt,
	)
	if err != nil {
		return store.persistenceError("save workflow definition", err)
	}
	return nil
}

func (store *Store) insertDefinitionVersion(ctx context.Context, tx *sql.Tx, version WorkflowDefinitionVersion, graphJSON string) error {
	_, err := tx.ExecContext(ctx, `
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

func (store *Store) LoadDefinition(workspaceID string, definitionID string) (WorkflowDefinition, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "definition id", definitionID); err != nil {
		return WorkflowDefinition{}, err
	}
	row := store.db.QueryRowContext(context.Background(), `
SELECT schema_version, id, workspace_id, name, description, current_version_id,
       current_version_number, graph_json, created_at, updated_at
FROM workflow_definitions
WHERE workspace_id = ? AND id = ?
`, workspaceID, definitionID)
	definition, err := scanWorkflowDefinition(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return WorkflowDefinition{}, store.persistenceError("read workflow definition", err)
		}
		return WorkflowDefinition{}, store.persistenceError("read workflow definition", err)
	}
	if err := validateDefinitionSnapshot(definition); err != nil {
		return WorkflowDefinition{}, store.corruptError("workflow_definitions/"+definitionID, err)
	}
	return definition, nil
}

func (store *Store) ListDefinitions(workspaceID string) ([]WorkflowDefinition, error) {
	if err := validateStorageID("workspace id", workspaceID); err != nil {
		return nil, err
	}
	rows, err := store.db.QueryContext(context.Background(), `
SELECT schema_version, id, workspace_id, name, description, current_version_id,
       current_version_number, graph_json, created_at, updated_at
FROM workflow_definitions
WHERE workspace_id = ?
ORDER BY updated_at DESC, id ASC
`, workspaceID)
	if err != nil {
		return nil, store.persistenceError("list workflow definitions", err)
	}
	defer rows.Close()
	definitions := []WorkflowDefinition{}
	for rows.Next() {
		definition, err := scanWorkflowDefinition(rows)
		if err != nil {
			return nil, store.persistenceError("list workflow definitions", err)
		}
		if err := validateDefinitionSnapshot(definition); err != nil {
			return nil, store.corruptError("workflow_definitions/"+definition.ID, err)
		}
		definitions = append(definitions, definition)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("list workflow definitions", err)
	}
	return definitions, nil
}

func (store *Store) DeleteDefinition(workspaceID string, definitionID string) error {
	if err := validateStoreIDs("workspace id", workspaceID, "definition id", definitionID); err != nil {
		return err
	}
	_, err := store.db.ExecContext(context.Background(), `
DELETE FROM workflow_definitions
WHERE workspace_id = ? AND id = ?
`, workspaceID, definitionID)
	if err != nil {
		return store.persistenceError("delete workflow definition", err)
	}
	return nil
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
		if err == sql.ErrNoRows {
			return WorkflowDefinitionVersion{}, store.persistenceError("read workflow definition version", err)
		}
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

func scanWorkflowDefinition(scanner workflowDefinitionScanner) (WorkflowDefinition, error) {
	var definition WorkflowDefinition
	var graphJSON string
	if err := scanner.Scan(
		&definition.SchemaVersion,
		&definition.ID,
		&definition.WorkspaceID,
		&definition.Name,
		&definition.Description,
		&definition.CurrentVersionID,
		&definition.CurrentVersionNumber,
		&graphJSON,
		&definition.CreatedAt,
		&definition.UpdatedAt,
	); err != nil {
		return WorkflowDefinition{}, err
	}
	if err := json.Unmarshal([]byte(graphJSON), &definition.Graph); err != nil {
		return WorkflowDefinition{}, fmt.Errorf("decode workflow definition graph: %w", err)
	}
	return definition, nil
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
