package semanticgraph

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

type semanticEvidenceIdentityDocument struct {
	Version                 int                        `json:"version"`
	WorkspaceID             string                     `json:"workspaceId"`
	TargetEntityID          string                     `json:"targetEntityId"`
	SourceKind              SemanticEvidenceSourceKind `json:"sourceKind"`
	SourceID                string                     `json:"sourceId"`
	URI                     string                     `json:"uri"`
	Path                    string                     `json:"path"`
	RangeStart              int                        `json:"rangeStart"`
	RangeEnd                int                        `json:"rangeEnd"`
	ContentHash             string                     `json:"contentHash"`
	WorkflowDefinitionID    string                     `json:"workflowDefinitionId"`
	WorkflowExecutionID     string                     `json:"workflowExecutionId"`
	WorkflowNodeID          string                     `json:"workflowNodeId"`
	WorkflowNodeExecutionID string                     `json:"workflowNodeExecutionId"`
	ChatConversationID      string                     `json:"chatConversationId"`
	ChatRunID               string                     `json:"chatRunId"`
	ChatMessageID           string                     `json:"chatMessageId"`
	RunItemID               string                     `json:"runItemId"`
}

func semanticEvidenceIdentityForPayload(workspaceID string, payload evidenceAttachedPayload) string {
	contentHash := payload.ContentHash
	if contentHash == "" {
		contentHash = cartographerObservationContentHash(payload.Text)
	}
	data, err := json.Marshal(semanticEvidenceIdentityDocument{
		Version:                 1,
		WorkspaceID:             workspaceID,
		TargetEntityID:          payload.TargetEntityID,
		SourceKind:              payload.SourceKind,
		SourceID:                payload.SourceID,
		URI:                     payload.URI,
		Path:                    payload.Path,
		RangeStart:              payload.RangeStart,
		RangeEnd:                payload.RangeEnd,
		ContentHash:             contentHash,
		WorkflowDefinitionID:    payload.WorkflowDefinitionID,
		WorkflowExecutionID:     payload.WorkflowExecutionID,
		WorkflowNodeID:          payload.WorkflowNodeID,
		WorkflowNodeExecutionID: payload.WorkflowNodeExecutionID,
		ChatConversationID:      payload.ChatConversationID,
		ChatRunID:               payload.ChatRunID,
		ChatMessageID:           payload.ChatMessageID,
		RunItemID:               payload.RunItemID,
	})
	if err != nil {
		return hashBytes([]byte(workspaceID + ":" + payload.AnchorID))
	}
	return hashBytes(data)
}

func semanticEvidenceAnchorFromPayload(event SemanticEvent, payload evidenceAttachedPayload) SemanticEvidenceAnchor {
	return SemanticEvidenceAnchor{
		ID:                      payload.AnchorID,
		WorkspaceID:             event.WorkspaceID,
		TargetEntityID:          payload.TargetEntityID,
		SourceKind:              payload.SourceKind,
		SourceID:                payload.SourceID,
		URI:                     payload.URI,
		Path:                    payload.Path,
		RangeStart:              payload.RangeStart,
		RangeEnd:                payload.RangeEnd,
		Text:                    payload.Text,
		Summary:                 payload.Summary,
		ContentHash:             payload.ContentHash,
		WorkflowDefinitionID:    payload.WorkflowDefinitionID,
		WorkflowExecutionID:     payload.WorkflowExecutionID,
		WorkflowNodeID:          payload.WorkflowNodeID,
		WorkflowNodeExecutionID: payload.WorkflowNodeExecutionID,
		ChatConversationID:      payload.ChatConversationID,
		ChatRunID:               payload.ChatRunID,
		ChatMessageID:           payload.ChatMessageID,
		RunItemID:               payload.RunItemID,
		ReassignedFromAnchorID:  payload.ReassignedFromAnchorID,
		CreatedByEventID:        event.EventID,
		CreatedAt:               event.ObservedAt,
	}
}

func loadSemanticEvidenceAnchorByIdentityForProjection(ctx context.Context, tx *sql.Tx, workspaceID string, identity string) (SemanticEvidenceAnchor, bool, error) {
	row := tx.QueryRowContext(ctx, `
SELECT workspace_id, id, target_entity_id, source_kind, source_id, uri, path,
       range_start, range_end, text, summary, content_hash,
       workflow_definition_id, workflow_execution_id, workflow_node_id,
       workflow_node_execution_id, chat_conversation_id, chat_run_id,
       chat_message_id, run_item_id, reassigned_from_anchor_id,
       created_by_event_id, created_at
FROM semantic_evidence_anchors
WHERE workspace_id = ? AND evidence_identity = ?
`, workspaceID, identity)
	anchor, err := scanSemanticEvidenceAnchor(row)
	if err == nil {
		return anchor, true, nil
	}
	if errorsIsNoRows(err) {
		return SemanticEvidenceAnchor{}, false, nil
	}
	return SemanticEvidenceAnchor{}, false, fmt.Errorf("load semantic evidence by identity: %w", err)
}

func (store *Store) semanticEvidenceIdentityExists(ctx context.Context, workspaceID string, identity string) (bool, error) {
	var exists int
	if err := store.db.QueryRowContext(ctx, `
SELECT EXISTS(
  SELECT 1 FROM semantic_evidence_anchors WHERE workspace_id = ? AND evidence_identity = ?
)
`, workspaceID, identity).Scan(&exists); err != nil {
		return false, store.persistenceError("check semantic evidence identity", err)
	}
	return exists != 0, nil
}

func updateDuplicateSemanticEvidenceAnchor(ctx context.Context, tx *sql.Tx, event SemanticEvent, identity string, existing SemanticEvidenceAnchor, payload evidenceAttachedPayload) (SemanticEvidenceAnchor, error) {
	merged := existing
	merged.Text = firstNonEmpty(existing.Text, payload.Text)
	merged.Summary = firstNonEmpty(payload.Summary, existing.Summary)
	merged.ContentHash = firstNonEmpty(existing.ContentHash, payload.ContentHash)
	merged.URI = firstNonEmpty(existing.URI, payload.URI)
	merged.Path = firstNonEmpty(existing.Path, payload.Path)
	merged.WorkflowDefinitionID = firstNonEmpty(existing.WorkflowDefinitionID, payload.WorkflowDefinitionID)
	merged.WorkflowExecutionID = firstNonEmpty(existing.WorkflowExecutionID, payload.WorkflowExecutionID)
	merged.WorkflowNodeID = firstNonEmpty(existing.WorkflowNodeID, payload.WorkflowNodeID)
	merged.WorkflowNodeExecutionID = firstNonEmpty(existing.WorkflowNodeExecutionID, payload.WorkflowNodeExecutionID)
	merged.ChatConversationID = firstNonEmpty(existing.ChatConversationID, payload.ChatConversationID)
	merged.ChatRunID = firstNonEmpty(existing.ChatRunID, payload.ChatRunID)
	merged.ChatMessageID = firstNonEmpty(existing.ChatMessageID, payload.ChatMessageID)
	merged.RunItemID = firstNonEmpty(existing.RunItemID, payload.RunItemID)
	merged.ReassignedFromAnchorID = firstNonEmpty(existing.ReassignedFromAnchorID, payload.ReassignedFromAnchorID)
	_, err := tx.ExecContext(ctx, `
UPDATE semantic_evidence_anchors
SET uri = ?, path = ?, text = ?, summary = ?, content_hash = ?,
    workflow_definition_id = ?, workflow_execution_id = ?, workflow_node_id = ?,
    workflow_node_execution_id = ?, chat_conversation_id = ?, chat_run_id = ?,
    chat_message_id = ?, run_item_id = ?, reassigned_from_anchor_id = ?,
    updated_by_event_id = ?, updated_at = ?, duplicate_count = duplicate_count + 1
WHERE workspace_id = ? AND evidence_identity = ?
`,
		merged.URI,
		merged.Path,
		merged.Text,
		merged.Summary,
		merged.ContentHash,
		merged.WorkflowDefinitionID,
		merged.WorkflowExecutionID,
		merged.WorkflowNodeID,
		merged.WorkflowNodeExecutionID,
		merged.ChatConversationID,
		merged.ChatRunID,
		merged.ChatMessageID,
		merged.RunItemID,
		merged.ReassignedFromAnchorID,
		event.EventID,
		event.ObservedAt,
		event.WorkspaceID,
		identity,
	)
	if err != nil {
		return SemanticEvidenceAnchor{}, fmt.Errorf("merge duplicate semantic evidence: %w", err)
	}
	return merged, nil
}
