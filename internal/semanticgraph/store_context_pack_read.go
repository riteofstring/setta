package semanticgraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

func (store *Store) ReadContextPack(ctx context.Context, workspaceID string, packID string) (SemanticContextPackRecord, bool, error) {
	if ctx == nil {
		return SemanticContextPackRecord{}, false, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "context pack id", packID); err != nil {
		return SemanticContextPackRecord{}, false, err
	}
	row := store.db.QueryRowContext(ctx, semanticContextPackSelectSQL+`
WHERE workspace_id = ? AND id = ?
`, workspaceID, packID)
	record, err := scanSemanticContextPackRecord(row)
	if err == nil {
		return record, true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return SemanticContextPackRecord{}, false, nil
	}
	return SemanticContextPackRecord{}, false, store.persistenceError("read semantic context pack", err)
}

func (store *Store) ListContextPacks(ctx context.Context, filter SemanticContextPackFilter) (SemanticContextPackList, error) {
	if err := validateContextPackFilter(ctx, filter); err != nil {
		return SemanticContextPackList{}, err
	}
	condition, args := semanticContextPackFilterCondition(filter)
	args = append(args, filter.Limit+1, filter.Offset)
	rows, err := store.db.QueryContext(ctx, fmt.Sprintf(semanticContextPackSelectSQL+`
WHERE %s
ORDER BY created_at DESC, id DESC
LIMIT ? OFFSET ?
`, condition), args...)
	if err != nil {
		return SemanticContextPackList{}, store.persistenceError("list semantic context packs", err)
	}
	defer rows.Close()
	packs, err := store.scanSemanticContextPackRows(rows)
	if err != nil {
		return SemanticContextPackList{}, err
	}
	hasMore := len(packs) > filter.Limit
	if hasMore {
		packs = packs[:filter.Limit]
	}
	nextOffset := filter.Offset
	if hasMore {
		nextOffset = filter.Offset + filter.Limit
	}
	return SemanticContextPackList{
		WorkspaceID: filter.WorkspaceID,
		Packs:       packs,
		HasMore:     hasMore,
		NextOffset:  nextOffset,
		Offset:      filter.Offset,
		Limit:       filter.Limit,
	}, nil
}

func validateContextPackFilter(ctx context.Context, filter SemanticContextPackFilter) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", filter.WorkspaceID); err != nil {
		return err
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "target entity id", value: filter.TargetEntityID},
		{label: "workflow execution id", value: filter.WorkflowExecutionID},
		{label: "chat run id", value: filter.ChatRunID},
	}); err != nil {
		return err
	}
	if filter.Offset < 0 {
		return fmt.Errorf("semantic context pack offset must not be negative: %d", filter.Offset)
	}
	if filter.Limit <= 0 {
		return fmt.Errorf("semantic context pack limit must be positive: %d", filter.Limit)
	}
	return nil
}

func semanticContextPackFilterCondition(filter SemanticContextPackFilter) (string, []any) {
	clauses := []string{"workspace_id = ?"}
	args := []any{filter.WorkspaceID}
	add := func(column string, value string) {
		if value == "" {
			return
		}
		clauses = append(clauses, column+" = ?")
		args = append(args, value)
	}
	add("target_entity_id", filter.TargetEntityID)
	add("workflow_execution_id", filter.WorkflowExecutionID)
	add("chat_run_id", filter.ChatRunID)
	return strings.Join(clauses, " AND "), args
}

func (store *Store) loadSemanticContextPacks(ctx context.Context, workspaceID string, targetEntityID string) ([]SemanticContextPackRecord, error) {
	rows, err := store.db.QueryContext(ctx, semanticContextPackSelectSQL+`
WHERE workspace_id = ? AND target_entity_id = ?
ORDER BY created_at DESC, id DESC
`, workspaceID, targetEntityID)
	if err != nil {
		return nil, store.persistenceError("read semantic context pack history", err)
	}
	defer rows.Close()
	contextPacks := []SemanticContextPackRecord{}
	for rows.Next() {
		record, err := scanSemanticContextPackRecord(rows)
		if err != nil {
			return nil, store.corruptError("semantic_context_pack_history", err)
		}
		contextPacks = append(contextPacks, record)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic context pack history", err)
	}
	return contextPacks, nil
}

const semanticContextPackSelectSQL = `
SELECT workspace_id, id, trigger_kind, target_entity_id, workflow_definition_id,
       workflow_execution_id, workflow_node_id, workflow_node_execution_id,
       chat_conversation_id, chat_run_id, chat_message_id, run_item_id,
       authored_prompt_hash, delivered_context_hash, token_budget,
       estimated_tokens, item_count, items_json, delivered_context,
       created_by_event_id, created_at
FROM semantic_context_pack_history
`

func (store *Store) scanSemanticContextPackRows(rows *sql.Rows) ([]SemanticContextPackRecord, error) {
	packs := []SemanticContextPackRecord{}
	for rows.Next() {
		record, err := scanSemanticContextPackRecord(rows)
		if err != nil {
			return nil, store.corruptError("semantic_context_pack_history", err)
		}
		packs = append(packs, record)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic context packs", err)
	}
	return packs, nil
}

func scanSemanticContextPackRecord(scanner interface{ Scan(dest ...any) error }) (SemanticContextPackRecord, error) {
	var record SemanticContextPackRecord
	var itemsJSON string
	if err := scanner.Scan(
		&record.WorkspaceID,
		&record.ID,
		&record.TriggerKind,
		&record.TargetEntityID,
		&record.SourceRefs.WorkflowDefinitionID,
		&record.SourceRefs.WorkflowExecutionID,
		&record.SourceRefs.WorkflowNodeID,
		&record.SourceRefs.WorkflowNodeExecutionID,
		&record.SourceRefs.ChatConversationID,
		&record.SourceRefs.ChatRunID,
		&record.SourceRefs.ChatMessageID,
		&record.SourceRefs.RunItemID,
		&record.AuthoredPromptHash,
		&record.DeliveredContextHash,
		&record.TokenBudget,
		&record.EstimatedTokens,
		&record.ItemCount,
		&itemsJSON,
		&record.DeliveredContext,
		&record.CreatedByEventID,
		&record.CreatedAt,
	); err != nil {
		return SemanticContextPackRecord{}, err
	}
	if err := json.Unmarshal([]byte(itemsJSON), &record.Items); err != nil {
		return SemanticContextPackRecord{}, fmt.Errorf("decode context pack items: %w", err)
	}
	if record.Items == nil {
		record.Items = []SemanticContextPackItem{}
	}
	return record, nil
}
