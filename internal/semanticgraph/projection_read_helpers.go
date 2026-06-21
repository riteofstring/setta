package semanticgraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

func loadSemanticNodeForProjection(ctx context.Context, tx *sql.Tx, workspaceID string, nodeID string) (SemanticNode, bool, error) {
	row := tx.QueryRowContext(ctx, `
SELECT workspace_id, id, kind, label, summary, why_it_exists, future_use,
       dismissed, promoted,
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
SELECT workspace_id, id, target_entity_id, kind, instruction, status, scope,
       workflow_definition_id, workflow_execution_id, workflow_node_id,
       workflow_node_execution_id, chat_conversation_id, chat_run_id,
       chat_message_id, run_item_id, supersedes_directive_id,
       reassigned_from_directive_id, created_by_event_id, updated_by_event_id,
       created_at, updated_at, completed_at
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

func loadSemanticActivityIntervalForProjection(ctx context.Context, tx *sql.Tx, workspaceID string, intervalID string) (SemanticActivityInterval, bool, error) {
	row := tx.QueryRowContext(ctx, `
SELECT workspace_id, id, target_entity_id, kind, summary, source_kind, source_id,
       evidence_anchor_id, workflow_definition_id, workflow_execution_id,
       workflow_node_id, workflow_node_execution_id, chat_conversation_id,
       chat_run_id, chat_message_id, run_item_id, reassigned_from_interval_id,
       actor_kind, actor_id,
       started_by_event_id, ended_by_event_id, started_at, ended_at, updated_at
FROM semantic_activity_intervals
WHERE workspace_id = ? AND id = ?
`, workspaceID, intervalID)
	interval, err := scanSemanticActivityInterval(row)
	if err == nil {
		return interval, true, nil
	}
	if errorsIsNoRows(err) {
		return SemanticActivityInterval{}, false, nil
	}
	return SemanticActivityInterval{}, false, fmt.Errorf("load semantic activity interval: %w", err)
}

func reindexSemanticNodeByID(ctx context.Context, tx *sql.Tx, workspaceID string, nodeID string) error {
	node, ok, err := loadSemanticNodeForProjection(ctx, tx, workspaceID, nodeID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("semantic node %s does not exist", nodeID)
	}
	return upsertSemanticNodeSearchRow(ctx, tx, node)
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
		&node.WhyItExists,
		&node.FutureUse,
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
	if err := scanner.Scan(
		&directive.WorkspaceID,
		&directive.ID,
		&directive.TargetEntityID,
		&directive.Kind,
		&directive.Instruction,
		&directive.Status,
		&directive.Scope,
		&directive.WorkflowDefinitionID,
		&directive.WorkflowExecutionID,
		&directive.WorkflowNodeID,
		&directive.WorkflowNodeExecutionID,
		&directive.ChatConversationID,
		&directive.ChatRunID,
		&directive.ChatMessageID,
		&directive.RunItemID,
		&directive.SupersedesDirectiveID,
		&directive.ReassignedFromDirectiveID,
		&directive.CreatedByEventID,
		&directive.UpdatedByEventID,
		&directive.CreatedAt,
		&directive.UpdatedAt,
		&directive.CompletedAt,
	); err != nil {
		return SemanticSteeringDirective{}, err
	}
	return directive, nil
}

func errorsIsNoRows(err error) bool {
	return err == sql.ErrNoRows
}
