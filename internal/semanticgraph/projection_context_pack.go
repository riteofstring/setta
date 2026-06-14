package semanticgraph

import (
	"context"
	"database/sql"
	"fmt"
)

func projectContextPackCreated(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[contextPackCreatedPayload](event)
	if err != nil {
		return err
	}
	if err := validateContextPackCreatedPayload(event, payload); err != nil {
		return err
	}
	if payload.TargetEntityID != "" {
		if err := requireSemanticEntity(ctx, tx, event.WorkspaceID, payload.TargetEntityID); err != nil {
			return err
		}
	}
	itemsJSON, err := marshalJSONColumn(payload.Items)
	if err != nil {
		return fmt.Errorf("encode semantic context pack items: %w", err)
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO semantic_context_pack_history (
  workspace_id, id, trigger_kind, target_entity_id, workflow_definition_id,
  workflow_execution_id, workflow_node_id, workflow_node_execution_id,
  chat_conversation_id, chat_run_id, chat_message_id, run_item_id,
  authored_prompt_hash, delivered_context_hash, token_budget, estimated_tokens,
  item_count, items_json, delivered_context, created_by_event_id, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.WorkspaceID,
		payload.PackID,
		payload.TriggerKind,
		payload.TargetEntityID,
		payload.SourceRefs.WorkflowDefinitionID,
		payload.SourceRefs.WorkflowExecutionID,
		payload.SourceRefs.WorkflowNodeID,
		payload.SourceRefs.WorkflowNodeExecutionID,
		payload.SourceRefs.ChatConversationID,
		payload.SourceRefs.ChatRunID,
		payload.SourceRefs.ChatMessageID,
		payload.SourceRefs.RunItemID,
		payload.AuthoredPromptHash,
		payload.DeliveredContextHash,
		payload.TokenBudget,
		payload.EstimatedTokens,
		payload.ItemCount,
		itemsJSON,
		payload.DeliveredContext,
		event.EventID,
		event.ObservedAt,
	)
	if err != nil {
		return fmt.Errorf("record semantic context pack: %w", err)
	}
	record := SemanticContextPackRecord{
		ID:                   payload.PackID,
		WorkspaceID:          event.WorkspaceID,
		TriggerKind:          payload.TriggerKind,
		TargetEntityID:       payload.TargetEntityID,
		SourceRefs:           payload.SourceRefs,
		AuthoredPromptHash:   payload.AuthoredPromptHash,
		DeliveredContextHash: payload.DeliveredContextHash,
		TokenBudget:          payload.TokenBudget,
		EstimatedTokens:      payload.EstimatedTokens,
		ItemCount:            payload.ItemCount,
		Items:                append([]SemanticContextPackItem{}, payload.Items...),
		DeliveredContext:     payload.DeliveredContext,
		CreatedByEventID:     event.EventID,
		CreatedAt:            event.ObservedAt,
	}
	return upsertSemanticContextPackSearchRows(ctx, tx, record)
}

func validateContextPackCreatedPayload(event SemanticEvent, payload contextPackCreatedPayload) error {
	if err := validateContextPackIdentity(event, payload); err != nil {
		return err
	}
	if err := validateContextPackAudit(payload); err != nil {
		return err
	}
	return validateContextPackItems(payload)
}

func validateContextPackIdentity(event SemanticEvent, payload contextPackCreatedPayload) error {
	if err := validateStoreIDs("context pack id", payload.PackID); err != nil {
		return err
	}
	if err := requireOptionalEntityID(payload.TargetEntityID, "target entity id"); err != nil {
		return err
	}
	if event.TargetEntityID != "" && event.TargetEntityID != payload.TargetEntityID {
		return fmt.Errorf("semantic event %s targetEntityId = %s, want %s", event.EventID, event.TargetEntityID, payload.TargetEntityID)
	}
	if !isSemanticContextTriggerKind(payload.TriggerKind) {
		return fmt.Errorf("context pack triggerKind is unsupported: %s", payload.TriggerKind)
	}
	return validateContextSourceRefs(payload.SourceRefs, "context pack")
}

func validateContextPackAudit(payload contextPackCreatedPayload) error {
	if err := requireNonEmpty(payload.AuthoredPromptHash, "authored prompt hash"); err != nil {
		return err
	}
	if err := requireNonEmpty(payload.DeliveredContextHash, "delivered context hash"); err != nil {
		return err
	}
	if err := requireNonEmpty(payload.DeliveredContext, "delivered context"); err != nil {
		return err
	}
	if payload.TokenBudget < 0 {
		return fmt.Errorf("context pack tokenBudget must not be negative")
	}
	if payload.EstimatedTokens < 0 {
		return fmt.Errorf("context pack estimatedTokens must not be negative")
	}
	if payload.ItemCount < 0 {
		return fmt.Errorf("context pack itemCount must not be negative")
	}
	return nil
}

func validateContextPackItems(payload contextPackCreatedPayload) error {
	if payload.ItemCount != len(payload.Items) {
		return fmt.Errorf("context pack itemCount = %d, want %d items", payload.ItemCount, len(payload.Items))
	}
	for _, item := range payload.Items {
		if err := validateContextPackItem(item); err != nil {
			return err
		}
	}
	return nil
}

func validateContextPackItem(item SemanticContextPackItem) error {
	if err := validateStoreIDs("context pack item id", item.ItemID); err != nil {
		return err
	}
	if !isSemanticContextPackItemKind(item.Kind) {
		return fmt.Errorf("context pack item kind is unsupported: %s", item.Kind)
	}
	if !isSemanticContextPackPriority(item.Priority) {
		return fmt.Errorf("context pack item priority is unsupported: %s", item.Priority)
	}
	if err := validateContextPackItemReferences(item); err != nil {
		return err
	}
	if err := requireNonEmpty(item.Title, "context pack item title"); err != nil {
		return err
	}
	if err := requireNonEmpty(item.ReasonIncluded, "context pack item reason"); err != nil {
		return err
	}
	if item.EstimatedTokens < 0 {
		return fmt.Errorf("context pack item estimatedTokens must not be negative")
	}
	return nil
}

func validateContextPackItemReferences(item SemanticContextPackItem) error {
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "context pack item semantic node id", value: item.SemanticNodeID},
		{label: "context pack item evidence anchor id", value: item.EvidenceAnchorID},
		{label: "context pack item activity interval id", value: item.ActivityIntervalID},
		{label: "context pack item steering directive id", value: item.SteeringDirectiveID},
	}); err != nil {
		return err
	}
	return validateContextSourceRefs(item.SourceRefs, "context pack item")
}

func validateContextSourceRefs(refs SemanticContextSourceRefs, label string) error {
	return validateOptionalStoreIDs([]optionalStoreID{
		{label: label + " workflow definition id", value: refs.WorkflowDefinitionID},
		{label: label + " workflow execution id", value: refs.WorkflowExecutionID},
		{label: label + " workflow node id", value: refs.WorkflowNodeID},
		{label: label + " workflow node execution id", value: refs.WorkflowNodeExecutionID},
		{label: label + " chat conversation id", value: refs.ChatConversationID},
		{label: label + " chat run id", value: refs.ChatRunID},
		{label: label + " chat message id", value: refs.ChatMessageID},
		{label: label + " run item id", value: refs.RunItemID},
	})
}
