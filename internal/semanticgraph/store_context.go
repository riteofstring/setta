package semanticgraph

import (
	"context"
	"fmt"
	"strings"
)

func (store *Store) loadActiveSteeringForContext(ctx context.Context, workspaceID string) ([]SemanticSteeringDirective, error) {
	rows, err := store.db.QueryContext(ctx, `
SELECT workspace_id, id, target_entity_id, kind, instruction, status, scope,
       workflow_definition_id, workflow_execution_id, workflow_node_id,
       workflow_node_execution_id, chat_conversation_id, chat_run_id,
       chat_message_id, run_item_id, supersedes_directive_id,
       reassigned_from_directive_id, created_by_event_id, updated_by_event_id,
       created_at, updated_at, completed_at
FROM semantic_steering_directives
WHERE workspace_id = ? AND status = 'active'
ORDER BY scope ASC, kind ASC, updated_at DESC, id ASC
`, workspaceID)
	if err != nil {
		return nil, store.persistenceError("read active semantic steering directives", err)
	}
	defer rows.Close()
	directives := []SemanticSteeringDirective{}
	for rows.Next() {
		directive, err := scanSemanticSteeringDirective(rows)
		if err != nil {
			return nil, store.corruptError("semantic_steering_directives", err)
		}
		directives = append(directives, directive)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read active semantic steering directives", err)
	}
	return directives, nil
}

func (store *Store) loadEvidenceBySourceRefs(ctx context.Context, workspaceID string, refs SemanticContextSourceRefs) ([]SemanticEvidenceAnchor, error) {
	condition, args, ok := sourceRefCondition(workspaceID, refs)
	if !ok {
		return []SemanticEvidenceAnchor{}, nil
	}
	rows, err := store.db.QueryContext(ctx, fmt.Sprintf(`
SELECT workspace_id, id, target_entity_id, source_kind, source_id, uri, path,
       range_start, range_end, text, summary, content_hash,
       workflow_definition_id, workflow_execution_id, workflow_node_id,
       workflow_node_execution_id, chat_conversation_id, chat_run_id,
       chat_message_id, run_item_id, reassigned_from_anchor_id,
       created_by_event_id, created_at
FROM semantic_evidence_anchors
WHERE %s
ORDER BY created_at DESC, id DESC
`, condition), args...)
	if err != nil {
		return nil, store.persistenceError("read semantic evidence by source refs", err)
	}
	defer rows.Close()
	anchors := []SemanticEvidenceAnchor{}
	for rows.Next() {
		anchor, err := scanSemanticEvidenceAnchor(rows)
		if err != nil {
			return nil, store.corruptError("semantic_evidence_anchors", err)
		}
		anchors = append(anchors, anchor)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic evidence by source refs", err)
	}
	return anchors, nil
}

func (store *Store) loadActivityBySourceRefs(ctx context.Context, workspaceID string, refs SemanticContextSourceRefs, limit int) ([]SemanticActivityInterval, error) {
	condition, args, ok := sourceRefCondition(workspaceID, refs)
	if !ok {
		return []SemanticActivityInterval{}, nil
	}
	args = append(args, limit)
	rows, err := store.db.QueryContext(ctx, fmt.Sprintf(`
SELECT workspace_id, id, target_entity_id, kind, summary, source_kind, source_id,
       evidence_anchor_id, workflow_definition_id, workflow_execution_id,
       workflow_node_id, workflow_node_execution_id, chat_conversation_id,
       chat_run_id, chat_message_id, run_item_id, reassigned_from_interval_id,
       actor_kind, actor_id,
       started_by_event_id, ended_by_event_id, started_at, ended_at, updated_at
FROM semantic_activity_intervals
WHERE %s
ORDER BY started_at DESC, id DESC
LIMIT ?
`, condition), args...)
	if err != nil {
		return nil, store.persistenceError("read semantic activity by source refs", err)
	}
	defer rows.Close()
	return store.scanSemanticActivityRows(rows)
}

func sourceRefCondition(workspaceID string, refs SemanticContextSourceRefs) (string, []any, bool) {
	clauses := []string{}
	args := []any{workspaceID}
	add := func(column string, value string) {
		if value == "" {
			return
		}
		clauses = append(clauses, column+" = ?")
		args = append(args, value)
	}
	add("workflow_definition_id", refs.WorkflowDefinitionID)
	add("workflow_execution_id", refs.WorkflowExecutionID)
	add("workflow_node_id", refs.WorkflowNodeID)
	add("workflow_node_execution_id", refs.WorkflowNodeExecutionID)
	add("chat_conversation_id", refs.ChatConversationID)
	add("chat_run_id", refs.ChatRunID)
	add("chat_message_id", refs.ChatMessageID)
	add("run_item_id", refs.RunItemID)
	if len(clauses) == 0 {
		return "", nil, false
	}
	return "workspace_id = ? AND (" + strings.Join(clauses, " OR ") + ")", args, true
}
