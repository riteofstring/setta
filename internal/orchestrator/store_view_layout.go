package orchestrator

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

func (store *Store) LoadGraphViewLayout(workspaceID string, target WorkflowGraphViewLayoutTarget) (WorkflowGraphViewLayout, error) {
	key, err := graphViewLayoutKeyForTarget(workspaceID, target)
	if err != nil {
		return WorkflowGraphViewLayout{}, err
	}
	row := store.db.QueryRowContext(context.Background(), `
SELECT schema_version, positions_json, updated_at
FROM workflow_graph_view_layouts
WHERE workspace_id = ?
  AND target_kind = ?
  AND definition_id = ?
  AND definition_version_id = ?
  AND execution_id = ?
`, key.workspaceID, key.targetKind, key.definitionID, key.versionID, key.executionID)
	var schemaVersion int
	var positionsJSON string
	var updatedAt string
	if err := row.Scan(&schemaVersion, &positionsJSON, &updatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return WorkflowGraphViewLayout{
				SchemaVersion: SchemaVersion,
				WorkspaceID:   key.workspaceID,
				Target:        key.target(),
				Positions:     []WorkflowGraphNodeLayout{},
			}, nil
		}
		return WorkflowGraphViewLayout{}, store.persistenceError("read workflow graph view layout", err)
	}
	var positions []WorkflowGraphNodeLayout
	if err := json.Unmarshal([]byte(positionsJSON), &positions); err != nil {
		return WorkflowGraphViewLayout{}, store.corruptError("workflow_graph_view_layouts/"+key.storageID(), fmt.Errorf("decode positions: %w", err))
	}
	layout := WorkflowGraphViewLayout{
		SchemaVersion: schemaVersion,
		WorkspaceID:   key.workspaceID,
		Target:        key.target(),
		Positions:     positions,
		UpdatedAt:     updatedAt,
	}
	if err := validateGraphViewLayoutSnapshot(layout); err != nil {
		return WorkflowGraphViewLayout{}, store.corruptError("workflow_graph_view_layouts/"+key.storageID(), err)
	}
	return layout, nil
}

func (store *Store) SaveGraphViewLayout(layout WorkflowGraphViewLayout) error {
	if err := validateGraphViewLayoutSnapshot(layout); err != nil {
		return err
	}
	key, err := graphViewLayoutKeyForTarget(layout.WorkspaceID, layout.Target)
	if err != nil {
		return err
	}
	positionsJSON, err := marshalJSONColumn(layout.Positions)
	if err != nil {
		return fmt.Errorf("encode workflow graph view layout positions: %w", err)
	}
	_, err = store.db.ExecContext(context.Background(), `
INSERT INTO workflow_graph_view_layouts (
  workspace_id, target_kind, definition_id, definition_version_id, execution_id,
  schema_version, positions_json, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, target_kind, definition_id, definition_version_id, execution_id)
DO UPDATE SET
  schema_version = excluded.schema_version,
  positions_json = excluded.positions_json,
  updated_at = excluded.updated_at
`,
		key.workspaceID,
		key.targetKind,
		key.definitionID,
		key.versionID,
		key.executionID,
		layout.SchemaVersion,
		positionsJSON,
		layout.UpdatedAt,
	)
	if err != nil {
		return store.persistenceError("save workflow graph view layout", err)
	}
	return nil
}

func validateGraphViewLayoutSnapshot(layout WorkflowGraphViewLayout) error {
	if layout.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", layout.SchemaVersion)
	}
	if _, err := graphViewLayoutKeyForTarget(layout.WorkspaceID, layout.Target); err != nil {
		return err
	}
	if layout.Positions == nil {
		return errors.New("workflow graph view layout positions must not be null")
	}
	if layout.UpdatedAt == "" && len(layout.Positions) > 0 {
		return errors.New("workflow graph view layout updatedAt is required when positions are present")
	}
	seen := map[string]bool{}
	for _, position := range layout.Positions {
		if err := validateStorageID("workflow graph view layout node id", position.NodeID); err != nil {
			return err
		}
		if seen[position.NodeID] {
			return fmt.Errorf("workflow graph view layout contains duplicate position for node %s", position.NodeID)
		}
		seen[position.NodeID] = true
	}
	return nil
}

type graphViewLayoutKey struct {
	workspaceID  string
	targetKind   WorkflowGraphViewLayoutTargetKind
	definitionID string
	versionID    string
	executionID  string
}

func graphViewLayoutKeyForTarget(workspaceID string, target WorkflowGraphViewLayoutTarget) (graphViewLayoutKey, error) {
	if err := validateStoreIDs("workspace id", workspaceID); err != nil {
		return graphViewLayoutKey{}, err
	}
	switch target.Kind {
	case GraphViewLayoutTargetDefinitionVersion:
		if target.DefinitionVersion == nil {
			return graphViewLayoutKey{}, errors.New("workflow graph view layout definitionVersion target is required")
		}
		if target.WorkflowExecution != nil {
			return graphViewLayoutKey{}, errors.New("workflow graph view layout definitionVersion target must not include workflowExecution")
		}
		if err := validateStoreIDs(
			"definition id", target.DefinitionVersion.DefinitionID,
			"definition version id", target.DefinitionVersion.VersionID,
		); err != nil {
			return graphViewLayoutKey{}, err
		}
		return graphViewLayoutKey{
			workspaceID:  workspaceID,
			targetKind:   target.Kind,
			definitionID: target.DefinitionVersion.DefinitionID,
			versionID:    target.DefinitionVersion.VersionID,
		}, nil
	case GraphViewLayoutTargetWorkflowExecution:
		if target.WorkflowExecution == nil {
			return graphViewLayoutKey{}, errors.New("workflow graph view layout workflowExecution target is required")
		}
		if target.DefinitionVersion != nil {
			return graphViewLayoutKey{}, errors.New("workflow graph view layout workflowExecution target must not include definitionVersion")
		}
		if err := validateStoreIDs(
			"definition id", target.WorkflowExecution.DefinitionID,
			"definition version id", target.WorkflowExecution.VersionID,
			"execution id", target.WorkflowExecution.ExecutionID,
		); err != nil {
			return graphViewLayoutKey{}, err
		}
		return graphViewLayoutKey{
			workspaceID:  workspaceID,
			targetKind:   target.Kind,
			definitionID: target.WorkflowExecution.DefinitionID,
			versionID:    target.WorkflowExecution.VersionID,
			executionID:  target.WorkflowExecution.ExecutionID,
		}, nil
	default:
		return graphViewLayoutKey{}, fmt.Errorf("unsupported workflow graph view layout target kind %s", target.Kind)
	}
}

func (key graphViewLayoutKey) target() WorkflowGraphViewLayoutTarget {
	switch key.targetKind {
	case GraphViewLayoutTargetDefinitionVersion:
		return WorkflowGraphViewLayoutTarget{
			Kind: key.targetKind,
			DefinitionVersion: &WorkflowGraphDefinitionVersionViewLayoutTarget{
				DefinitionID: key.definitionID,
				VersionID:    key.versionID,
			},
		}
	case GraphViewLayoutTargetWorkflowExecution:
		return WorkflowGraphViewLayoutTarget{
			Kind: key.targetKind,
			WorkflowExecution: &WorkflowGraphExecutionViewLayoutTarget{
				DefinitionID: key.definitionID,
				VersionID:    key.versionID,
				ExecutionID:  key.executionID,
			},
		}
	default:
		return WorkflowGraphViewLayoutTarget{Kind: key.targetKind}
	}
}

func (key graphViewLayoutKey) storageID() string {
	if key.executionID == "" {
		return fmt.Sprintf("%s/%s/%s/%s", key.workspaceID, key.targetKind, key.definitionID, key.versionID)
	}
	return fmt.Sprintf("%s/%s/%s/%s/%s", key.workspaceID, key.targetKind, key.definitionID, key.versionID, key.executionID)
}
