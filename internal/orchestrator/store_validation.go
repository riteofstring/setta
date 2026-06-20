package orchestrator

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

func (store *Store) SaveDefinitionValidationSnapshot(snapshot WorkflowValidationSnapshot) error {
	if err := validateDefinitionValidationSnapshot(snapshot); err != nil {
		return err
	}
	resultJSON, err := json.Marshal(snapshot.Result)
	if err != nil {
		return fmt.Errorf("encode workflow validation result: %w", err)
	}
	_, err = store.db.ExecContext(context.Background(), `
INSERT INTO workflow_validation_snapshots (
  workspace_id, definition_id, schema_version, graph_fingerprint,
  validator_fingerprint, result_json, validated_at
) VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, definition_id) DO UPDATE SET
  schema_version = excluded.schema_version,
  graph_fingerprint = excluded.graph_fingerprint,
  validator_fingerprint = excluded.validator_fingerprint,
  result_json = excluded.result_json,
  validated_at = excluded.validated_at
`, snapshot.WorkspaceID, snapshot.DefinitionID, snapshot.SchemaVersion, snapshot.GraphFingerprint, snapshot.ValidatorFingerprint, string(resultJSON), snapshot.ValidatedAt)
	if err != nil {
		return store.persistenceError("save workflow validation snapshot", err)
	}
	return nil
}

func (store *Store) LoadDefinitionValidationSnapshot(workspaceID string, definitionID string) (WorkflowValidationSnapshot, bool, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "definition id", definitionID); err != nil {
		return WorkflowValidationSnapshot{}, false, err
	}
	var snapshot WorkflowValidationSnapshot
	var resultJSON string
	err := store.db.QueryRowContext(context.Background(), `
SELECT schema_version, workspace_id, definition_id, graph_fingerprint,
       validator_fingerprint, result_json, validated_at
FROM workflow_validation_snapshots
WHERE workspace_id = ? AND definition_id = ?
`, workspaceID, definitionID).Scan(
		&snapshot.SchemaVersion,
		&snapshot.WorkspaceID,
		&snapshot.DefinitionID,
		&snapshot.GraphFingerprint,
		&snapshot.ValidatorFingerprint,
		&resultJSON,
		&snapshot.ValidatedAt,
	)
	if err == sql.ErrNoRows {
		return WorkflowValidationSnapshot{}, false, nil
	}
	if err != nil {
		return WorkflowValidationSnapshot{}, false, store.persistenceError("read workflow validation snapshot", err)
	}
	if err := json.Unmarshal([]byte(resultJSON), &snapshot.Result); err != nil {
		return WorkflowValidationSnapshot{}, false, fmt.Errorf("decode workflow validation result: %w", err)
	}
	if err := validateDefinitionValidationSnapshot(snapshot); err != nil {
		return WorkflowValidationSnapshot{}, false, store.corruptError("workflow_validation_snapshots/"+definitionID, err)
	}
	return snapshot, true, nil
}

func validateDefinitionValidationSnapshot(snapshot WorkflowValidationSnapshot) error {
	if snapshot.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", snapshot.SchemaVersion)
	}
	if err := validateStoreIDs("workspace id", snapshot.WorkspaceID, "definition id", snapshot.DefinitionID); err != nil {
		return err
	}
	if snapshot.GraphFingerprint == "" {
		return fmt.Errorf("workflow validation snapshot graphFingerprint is required")
	}
	if snapshot.ValidatorFingerprint == "" {
		return fmt.Errorf("workflow validation snapshot validatorFingerprint is required")
	}
	if snapshot.ValidatedAt == "" {
		return fmt.Errorf("workflow validation snapshot validatedAt is required")
	}
	if snapshot.Result.Diagnostics == nil {
		return fmt.Errorf("workflow validation snapshot diagnostics must not be null")
	}
	return nil
}
