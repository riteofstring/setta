package semanticgraph

import (
	"context"
)

func (store *Store) loadSemanticSourceLinks(ctx context.Context, workspaceID string) ([]SemanticEvidenceAnchor, error) {
	rows, err := store.db.QueryContext(ctx, `
SELECT workspace_id, id, target_entity_id, source_kind, source_id, uri, path,
       range_start, range_end, text, summary, content_hash,
       workflow_definition_id, workflow_execution_id, workflow_node_id,
       workflow_node_execution_id, chat_conversation_id, chat_run_id,
       chat_message_id, run_item_id, reassigned_from_anchor_id,
       created_by_event_id, created_at
FROM semantic_evidence_anchors
WHERE workspace_id = ?
ORDER BY created_at ASC, id ASC
`, workspaceID)
	if err != nil {
		return nil, store.persistenceError("read semantic source links", err)
	}
	defer rows.Close()

	sourceLinks := []SemanticEvidenceAnchor{}
	for rows.Next() {
		anchor, err := scanSemanticEvidenceAnchor(rows)
		if err != nil {
			return nil, store.corruptError("semantic_evidence_anchors", err)
		}
		sourceLinks = append(sourceLinks, anchor)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic source links", err)
	}
	return sourceLinks, nil
}
