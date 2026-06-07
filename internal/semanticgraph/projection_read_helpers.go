package semanticgraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

func loadSemanticNodeForProjection(ctx context.Context, tx *sql.Tx, workspaceID string, nodeID string) (SemanticNode, bool, error) {
	row := tx.QueryRowContext(ctx, `
SELECT workspace_id, id, kind, label, summary, dismissed, promoted,
       split_from_node_id, split_into_node_ids_json, merged_into_node_id,
       created_by_event_id, updated_by_event_id, created_at, updated_at
FROM semantic_nodes_current
WHERE workspace_id = ? AND id = ?
`, workspaceID, nodeID)
	node, err := scanSemanticNode(row)
	if err == nil {
		return node, true, nil
	}
	if errorsIsNoRows(err) {
		return SemanticNode{}, false, nil
	}
	return SemanticNode{}, false, fmt.Errorf("load semantic node: %w", err)
}

func loadSemanticEdgeForProjection(ctx context.Context, tx *sql.Tx, workspaceID string, edgeID string) (SemanticEdge, bool, error) {
	row := tx.QueryRowContext(ctx, `
SELECT workspace_id, id, kind, from_node_id, to_node_id, label, summary,
       created_by_event_id, updated_by_event_id, created_at, updated_at
FROM semantic_edges_current
WHERE workspace_id = ? AND id = ?
`, workspaceID, edgeID)
	edge, err := scanSemanticEdge(row)
	if err == nil {
		return edge, true, nil
	}
	if errorsIsNoRows(err) {
		return SemanticEdge{}, false, nil
	}
	return SemanticEdge{}, false, fmt.Errorf("load semantic edge: %w", err)
}

func loadSemanticSteeringDirectiveForProjection(ctx context.Context, tx *sql.Tx, workspaceID string, directiveID string) (SemanticSteeringDirective, bool, error) {
	row := tx.QueryRowContext(ctx, `
SELECT workspace_id, id, target_entity_id, instruction, active,
       created_by_event_id, updated_by_event_id, created_at, updated_at
FROM semantic_steering_directives
WHERE workspace_id = ? AND id = ?
`, workspaceID, directiveID)
	directive, err := scanSemanticSteeringDirective(row)
	if err == nil {
		return directive, true, nil
	}
	if errorsIsNoRows(err) {
		return SemanticSteeringDirective{}, false, nil
	}
	return SemanticSteeringDirective{}, false, fmt.Errorf("load semantic steering directive: %w", err)
}

func requireSemanticNode(ctx context.Context, tx *sql.Tx, workspaceID string, nodeID string) error {
	exists, err := semanticNodeExists(ctx, tx, workspaceID, nodeID)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("semantic node %s does not exist", nodeID)
	}
	return nil
}

func requireSemanticEntity(ctx context.Context, tx *sql.Tx, workspaceID string, entityID string) error {
	exists, err := semanticEntityExists(ctx, tx, workspaceID, entityID)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("semantic entity %s does not exist", entityID)
	}
	return nil
}

func semanticNodeExists(ctx context.Context, tx *sql.Tx, workspaceID string, nodeID string) (bool, error) {
	var exists int
	if err := tx.QueryRowContext(ctx, `
SELECT EXISTS(
  SELECT 1 FROM semantic_nodes_current WHERE workspace_id = ? AND id = ?
)
`, workspaceID, nodeID).Scan(&exists); err != nil {
		return false, fmt.Errorf("check semantic node existence: %w", err)
	}
	return exists != 0, nil
}

func semanticEntityExists(ctx context.Context, tx *sql.Tx, workspaceID string, entityID string) (bool, error) {
	var exists int
	if err := tx.QueryRowContext(ctx, `
SELECT EXISTS(
  SELECT 1 FROM semantic_nodes_current WHERE workspace_id = ? AND id = ?
  UNION ALL
  SELECT 1 FROM semantic_edges_current WHERE workspace_id = ? AND id = ?
)
`, workspaceID, entityID, workspaceID, entityID).Scan(&exists); err != nil {
		return false, fmt.Errorf("check semantic entity existence: %w", err)
	}
	return exists != 0, nil
}

func requireRowsAffected(result sql.Result, label string, id string) error {
	count, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read %s update result: %w", label, err)
	}
	if count == 0 {
		return fmt.Errorf("%s %s does not exist", label, id)
	}
	return nil
}

func scanSemanticNode(scanner interface{ Scan(dest ...any) error }) (SemanticNode, error) {
	var node SemanticNode
	var dismissed int
	var promoted int
	var splitIntoJSON string
	if err := scanner.Scan(
		&node.WorkspaceID,
		&node.ID,
		&node.Kind,
		&node.Label,
		&node.Summary,
		&dismissed,
		&promoted,
		&node.SplitFromNodeID,
		&splitIntoJSON,
		&node.MergedIntoNodeID,
		&node.CreatedByEventID,
		&node.UpdatedByEventID,
		&node.CreatedAt,
		&node.UpdatedAt,
	); err != nil {
		return SemanticNode{}, err
	}
	if err := json.Unmarshal([]byte(splitIntoJSON), &node.SplitIntoNodeIDs); err != nil {
		return SemanticNode{}, fmt.Errorf("decode split node ids: %w", err)
	}
	if node.SplitIntoNodeIDs == nil {
		node.SplitIntoNodeIDs = []string{}
	}
	node.Dismissed = boolFromInt(dismissed)
	node.Promoted = boolFromInt(promoted)
	return node, nil
}

func scanSemanticEdge(scanner interface{ Scan(dest ...any) error }) (SemanticEdge, error) {
	var edge SemanticEdge
	if err := scanner.Scan(
		&edge.WorkspaceID,
		&edge.ID,
		&edge.Kind,
		&edge.FromNodeID,
		&edge.ToNodeID,
		&edge.Label,
		&edge.Summary,
		&edge.CreatedByEventID,
		&edge.UpdatedByEventID,
		&edge.CreatedAt,
		&edge.UpdatedAt,
	); err != nil {
		return SemanticEdge{}, err
	}
	return edge, nil
}

func scanSemanticSteeringDirective(scanner interface{ Scan(dest ...any) error }) (SemanticSteeringDirective, error) {
	var directive SemanticSteeringDirective
	var active int
	if err := scanner.Scan(
		&directive.WorkspaceID,
		&directive.ID,
		&directive.TargetEntityID,
		&directive.Instruction,
		&active,
		&directive.CreatedByEventID,
		&directive.UpdatedByEventID,
		&directive.CreatedAt,
		&directive.UpdatedAt,
	); err != nil {
		return SemanticSteeringDirective{}, err
	}
	directive.Active = boolFromInt(active)
	return directive, nil
}

func errorsIsNoRows(err error) bool {
	return err == sql.ErrNoRows
}
