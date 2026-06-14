package semanticgraph

import (
	"context"
	"database/sql"
	"fmt"
)

type semanticProjectionHandler func(context.Context, *sql.Tx, SemanticEvent) error

var semanticProjectionHandlers = map[SemanticEventType]semanticProjectionHandler{
	EventNodeCreated:             projectNodeCreated,
	EventNodeUpdated:             projectNodeUpdated,
	EventNodeRenamed:             projectNodeRenamed,
	EventNodeDismissed:           projectNodeDismissed,
	EventNodePromoted:            projectNodePromoted,
	EventNodeSplit:               projectNodeSplit,
	EventNodeMerged:              projectNodeMerged,
	EventEdgeCreated:             projectEdgeCreated,
	EventEdgeUpdated:             projectEdgeUpdated,
	EventEdgeRemoved:             projectEdgeRemoved,
	EventEvidenceAttached:        projectEvidenceAttached,
	EventActivityStarted:         projectActivityStarted,
	EventActivityEnded:           projectActivityEnded,
	EventSteeringCreated:         projectSteeringCreated,
	EventSteeringUpdated:         projectSteeringUpdated,
	EventContextPackCreated:      projectContextPackCreated,
	EventConstraintCheckRecorded: projectConstraintCheckRecorded,
}

func applySemanticEventProjection(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	handler, ok := semanticProjectionHandlers[event.EventType]
	if !ok {
		return fmt.Errorf("unsupported semantic event type %s", event.EventType)
	}
	return handler(ctx, tx, event)
}

func projectNodeCreated(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[nodeCreatedPayload](event)
	if err != nil {
		return err
	}
	if err := validateNodeCreatedPayload(event, payload); err != nil {
		return err
	}
	return insertSemanticNode(ctx, tx, event, payload, "", "")
}

func projectNodeUpdated(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[nodeUpdatedPayload](event)
	if err != nil {
		return err
	}
	if err := requireEntityID(event, payload.NodeID, "node id"); err != nil {
		return err
	}
	if payload.Kind == nil && payload.Summary == nil {
		return fmt.Errorf("node.updated payload must include kind or summary")
	}
	node, ok, err := loadSemanticNodeForProjection(ctx, tx, event.WorkspaceID, payload.NodeID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("semantic node %s does not exist", payload.NodeID)
	}
	if payload.Kind != nil {
		if !isSemanticNodeKind(*payload.Kind) {
			return fmt.Errorf("node kind is unsupported: %s", *payload.Kind)
		}
		node.Kind = *payload.Kind
	}
	if payload.Summary != nil {
		node.Summary = *payload.Summary
	}
	node.UpdatedByEventID = event.EventID
	node.UpdatedAt = event.ObservedAt
	return replaceSemanticNode(ctx, tx, node)
}

func projectNodeRenamed(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[nodeRenamedPayload](event)
	if err != nil {
		return err
	}
	if err := requireEntityID(event, payload.NodeID, "node id"); err != nil {
		return err
	}
	if err := requireNonEmpty(payload.Label, "node label"); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `
UPDATE semantic_nodes_current
SET label = ?, updated_by_event_id = ?, updated_at = ?
WHERE workspace_id = ? AND id = ?
`, payload.Label, event.EventID, event.ObservedAt, event.WorkspaceID, payload.NodeID)
	if err != nil {
		return fmt.Errorf("rename semantic node: %w", err)
	}
	if err := requireRowsAffected(result, "semantic node", payload.NodeID); err != nil {
		return err
	}
	return reindexSemanticNodeByID(ctx, tx, event.WorkspaceID, payload.NodeID)
}

func projectNodeDismissed(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[nodeDismissedPayload](event)
	if err != nil {
		return err
	}
	if err := requireEntityID(event, payload.NodeID, "node id"); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `
UPDATE semantic_nodes_current
SET dismissed = 1, updated_by_event_id = ?, updated_at = ?
WHERE workspace_id = ? AND id = ?
`, event.EventID, event.ObservedAt, event.WorkspaceID, payload.NodeID)
	if err != nil {
		return fmt.Errorf("dismiss semantic node: %w", err)
	}
	if err := requireRowsAffected(result, "semantic node", payload.NodeID); err != nil {
		return err
	}
	return reindexSemanticNodeByID(ctx, tx, event.WorkspaceID, payload.NodeID)
}

func projectNodePromoted(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[nodePromotedPayload](event)
	if err != nil {
		return err
	}
	if err := requireEntityID(event, payload.NodeID, "node id"); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `
UPDATE semantic_nodes_current
SET promoted = 1, updated_by_event_id = ?, updated_at = ?
WHERE workspace_id = ? AND id = ?
`, event.EventID, event.ObservedAt, event.WorkspaceID, payload.NodeID)
	if err != nil {
		return fmt.Errorf("promote semantic node: %w", err)
	}
	if err := requireRowsAffected(result, "semantic node", payload.NodeID); err != nil {
		return err
	}
	return reindexSemanticNodeByID(ctx, tx, event.WorkspaceID, payload.NodeID)
}

func projectNodeSplit(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[nodeSplitPayload](event)
	if err != nil {
		return err
	}
	if err := requireEntityID(event, payload.SourceNodeID, "source node id"); err != nil {
		return err
	}
	if len(payload.Nodes) == 0 {
		return fmt.Errorf("node.split payload must include new nodes")
	}
	source, ok, err := loadSemanticNodeForProjection(ctx, tx, event.WorkspaceID, payload.SourceNodeID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("semantic node %s does not exist", payload.SourceNodeID)
	}
	splitInto, err := validateSplitNodes(payload.SourceNodeID, payload.Nodes)
	if err != nil {
		return err
	}
	source.Dismissed = true
	source.SplitIntoNodeIDs = splitInto
	source.UpdatedByEventID = event.EventID
	source.UpdatedAt = event.ObservedAt
	if err := updateSplitSourceNode(ctx, tx, event, source); err != nil {
		return err
	}
	return insertSplitNodes(ctx, tx, event, payload)
}

func validateSplitNodes(sourceNodeID string, nodes []nodeCreatedPayload) ([]string, error) {
	splitInto := make([]string, 0, len(nodes))
	seen := map[string]bool{}
	for _, node := range nodes {
		if err := validateNodeSeedPayload(node); err != nil {
			return nil, err
		}
		if node.NodeID == sourceNodeID {
			return nil, fmt.Errorf("split node %s cannot reuse source node id", node.NodeID)
		}
		if seen[node.NodeID] {
			return nil, fmt.Errorf("node.split payload contains duplicate node id %s", node.NodeID)
		}
		seen[node.NodeID] = true
		splitInto = append(splitInto, node.NodeID)
	}
	return splitInto, nil
}

func updateSplitSourceNode(ctx context.Context, tx *sql.Tx, event SemanticEvent, source SemanticNode) error {
	splitJSON, err := marshalJSONColumn(source.SplitIntoNodeIDs)
	if err != nil {
		return fmt.Errorf("encode split node ids: %w", err)
	}
	_, err = tx.ExecContext(ctx, `
UPDATE semantic_nodes_current
SET dismissed = ?, split_into_node_ids_json = ?, updated_by_event_id = ?, updated_at = ?
WHERE workspace_id = ? AND id = ?
`,
		intFromBool(source.Dismissed),
		splitJSON,
		event.EventID,
		event.ObservedAt,
		event.WorkspaceID,
		source.ID,
	)
	if err != nil {
		return fmt.Errorf("update split source node: %w", err)
	}
	return upsertSemanticNodeSearchRow(ctx, tx, source)
}

func insertSplitNodes(ctx context.Context, tx *sql.Tx, event SemanticEvent, payload nodeSplitPayload) error {
	for _, node := range payload.Nodes {
		if err := insertSemanticNode(ctx, tx, event, node, payload.SourceNodeID, ""); err != nil {
			return err
		}
	}
	return nil
}

func projectNodeMerged(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[nodeMergedPayload](event)
	if err != nil {
		return err
	}
	if err := validateNodeCreatedPayload(event, payload.TargetNode); err != nil {
		return err
	}
	if err := requireEntityID(event, payload.TargetNode.NodeID, "target node id"); err != nil {
		return err
	}
	if len(payload.SourceNodeIDs) == 0 {
		return fmt.Errorf("node.merged payload must include source nodes")
	}
	if err := validateMergeSources(ctx, tx, event.WorkspaceID, payload.SourceNodeIDs, payload.TargetNode.NodeID); err != nil {
		return err
	}
	if err := insertSemanticNode(ctx, tx, event, payload.TargetNode, "", ""); err != nil {
		return err
	}
	return markMergedSourceNodes(ctx, tx, event, payload.SourceNodeIDs, payload.TargetNode.NodeID)
}

func validateMergeSources(ctx context.Context, tx *sql.Tx, workspaceID string, sourceNodeIDs []string, targetNodeID string) error {
	seen := map[string]bool{}
	for _, sourceID := range sourceNodeIDs {
		if err := validateMergeSourceID(ctx, tx, workspaceID, sourceID, targetNodeID, seen); err != nil {
			return err
		}
		seen[sourceID] = true
	}
	return nil
}

func validateMergeSourceID(ctx context.Context, tx *sql.Tx, workspaceID string, sourceID string, targetNodeID string, seen map[string]bool) error {
	if err := validateStoreIDs("source node id", sourceID); err != nil {
		return err
	}
	if sourceID == targetNodeID {
		return fmt.Errorf("merge source node %s cannot equal target node", sourceID)
	}
	if seen[sourceID] {
		return fmt.Errorf("node.merged payload contains duplicate source node id %s", sourceID)
	}
	exists, err := semanticNodeExists(ctx, tx, workspaceID, sourceID)
	if err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("semantic node %s does not exist", sourceID)
	}
	return nil
}

func markMergedSourceNodes(ctx context.Context, tx *sql.Tx, event SemanticEvent, sourceNodeIDs []string, targetNodeID string) error {
	for _, sourceID := range sourceNodeIDs {
		result, err := tx.ExecContext(ctx, `
UPDATE semantic_nodes_current
SET dismissed = 1, merged_into_node_id = ?, updated_by_event_id = ?, updated_at = ?
WHERE workspace_id = ? AND id = ?
`, targetNodeID, event.EventID, event.ObservedAt, event.WorkspaceID, sourceID)
		if err != nil {
			return fmt.Errorf("mark merged source node: %w", err)
		}
		if err := requireRowsAffected(result, "semantic node", sourceID); err != nil {
			return err
		}
		if err := reindexSemanticNodeByID(ctx, tx, event.WorkspaceID, sourceID); err != nil {
			return err
		}
	}
	return nil
}

func projectEdgeCreated(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[edgeCreatedPayload](event)
	if err != nil {
		return err
	}
	if err := validateEdgeCreatedPayload(event, payload); err != nil {
		return err
	}
	return insertSemanticEdge(ctx, tx, event, payload)
}

func projectEdgeUpdated(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[edgeUpdatedPayload](event)
	if err != nil {
		return err
	}
	if err := requireEntityID(event, payload.EdgeID, "edge id"); err != nil {
		return err
	}
	if payload.Kind == nil && payload.Label == nil && payload.Summary == nil {
		return fmt.Errorf("edge.updated payload must include kind, label, or summary")
	}
	edge, ok, err := loadSemanticEdgeForProjection(ctx, tx, event.WorkspaceID, payload.EdgeID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("semantic edge %s does not exist", payload.EdgeID)
	}
	edge, err = applyEdgeUpdatePayload(edge, payload)
	if err != nil {
		return err
	}
	edge.UpdatedByEventID = event.EventID
	edge.UpdatedAt = event.ObservedAt
	return replaceSemanticEdge(ctx, tx, edge)
}

func applyEdgeUpdatePayload(edge SemanticEdge, payload edgeUpdatedPayload) (SemanticEdge, error) {
	if payload.Kind != nil {
		if !isSemanticEdgeKind(*payload.Kind) {
			return SemanticEdge{}, fmt.Errorf("edge kind is unsupported: %s", *payload.Kind)
		}
		edge.Kind = *payload.Kind
	}
	if payload.Label != nil {
		edge.Label = *payload.Label
	}
	if payload.Summary != nil {
		edge.Summary = *payload.Summary
	}
	return edge, nil
}

func projectEdgeRemoved(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[edgeRemovedPayload](event)
	if err != nil {
		return err
	}
	if err := requireEntityID(event, payload.EdgeID, "edge id"); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `
DELETE FROM semantic_edges_current
WHERE workspace_id = ? AND id = ?
`, event.WorkspaceID, payload.EdgeID)
	if err != nil {
		return fmt.Errorf("remove semantic edge: %w", err)
	}
	return requireRowsAffected(result, "semantic edge", payload.EdgeID)
}

func projectEvidenceAttached(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[evidenceAttachedPayload](event)
	if err != nil {
		return err
	}
	if err := validateEvidenceAttachedPayload(event, payload); err != nil {
		return err
	}
	if err := requireSemanticEntity(ctx, tx, event.WorkspaceID, payload.TargetEntityID); err != nil {
		return err
	}
	identity := semanticEvidenceIdentityForPayload(event.WorkspaceID, payload)
	if existing, ok, err := loadSemanticEvidenceAnchorByIdentityForProjection(ctx, tx, event.WorkspaceID, identity); err != nil || ok {
		if err != nil {
			return err
		}
		merged, err := updateDuplicateSemanticEvidenceAnchor(ctx, tx, event, identity, existing, payload)
		if err != nil {
			return err
		}
		return upsertSemanticEvidenceSearchRow(ctx, tx, merged)
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO semantic_evidence_anchors (
  workspace_id, id, evidence_identity, target_entity_id, source_kind, source_id, uri, path,
  range_start, range_end, text, summary, content_hash, workflow_definition_id,
  workflow_execution_id, workflow_node_id, workflow_node_execution_id,
  chat_conversation_id, chat_run_id, chat_message_id, run_item_id,
  reassigned_from_anchor_id, created_by_event_id, updated_by_event_id, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.WorkspaceID,
		payload.AnchorID,
		identity,
		payload.TargetEntityID,
		payload.SourceKind,
		payload.SourceID,
		payload.URI,
		payload.Path,
		payload.RangeStart,
		payload.RangeEnd,
		payload.Text,
		payload.Summary,
		payload.ContentHash,
		payload.WorkflowDefinitionID,
		payload.WorkflowExecutionID,
		payload.WorkflowNodeID,
		payload.WorkflowNodeExecutionID,
		payload.ChatConversationID,
		payload.ChatRunID,
		payload.ChatMessageID,
		payload.RunItemID,
		payload.ReassignedFromAnchorID,
		event.EventID,
		event.EventID,
		event.ObservedAt,
		event.ObservedAt,
	)
	if err != nil {
		return fmt.Errorf("attach semantic evidence: %w", err)
	}
	return upsertSemanticEvidenceSearchRow(ctx, tx, semanticEvidenceAnchorFromPayload(event, payload))
}

func projectActivityStarted(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[activityStartedPayload](event)
	if err != nil {
		return err
	}
	if err := validateActivityStartedPayload(event, payload); err != nil {
		return err
	}
	if err := requireSemanticEntity(ctx, tx, event.WorkspaceID, payload.TargetEntityID); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO semantic_activity_intervals (
  workspace_id, id, target_entity_id, kind, summary, source_kind, source_id,
  evidence_anchor_id, workflow_definition_id, workflow_execution_id,
  workflow_node_id, workflow_node_execution_id, chat_conversation_id,
  chat_run_id, chat_message_id, run_item_id, reassigned_from_interval_id,
  actor_kind, actor_id,
  started_by_event_id, started_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.WorkspaceID,
		payload.IntervalID,
		payload.TargetEntityID,
		payload.Kind,
		payload.Summary,
		payload.SourceKind,
		payload.SourceID,
		payload.EvidenceAnchorID,
		payload.WorkflowDefinitionID,
		payload.WorkflowExecutionID,
		payload.WorkflowNodeID,
		payload.WorkflowNodeExecutionID,
		payload.ChatConversationID,
		payload.ChatRunID,
		payload.ChatMessageID,
		payload.RunItemID,
		payload.ReassignedFromIntervalID,
		payload.ActorKind,
		payload.ActorID,
		event.EventID,
		event.ObservedAt,
		event.ObservedAt,
	)
	if err != nil {
		return fmt.Errorf("start semantic activity interval: %w", err)
	}
	return upsertSemanticActivitySearchRow(ctx, tx, SemanticActivityInterval{
		ID:                       payload.IntervalID,
		WorkspaceID:              event.WorkspaceID,
		TargetEntityID:           payload.TargetEntityID,
		Kind:                     payload.Kind,
		Summary:                  payload.Summary,
		SourceKind:               payload.SourceKind,
		SourceID:                 payload.SourceID,
		EvidenceAnchorID:         payload.EvidenceAnchorID,
		WorkflowDefinitionID:     payload.WorkflowDefinitionID,
		WorkflowExecutionID:      payload.WorkflowExecutionID,
		WorkflowNodeID:           payload.WorkflowNodeID,
		WorkflowNodeExecutionID:  payload.WorkflowNodeExecutionID,
		ChatConversationID:       payload.ChatConversationID,
		ChatRunID:                payload.ChatRunID,
		ChatMessageID:            payload.ChatMessageID,
		RunItemID:                payload.RunItemID,
		ReassignedFromIntervalID: payload.ReassignedFromIntervalID,
		ActorKind:                payload.ActorKind,
		ActorID:                  payload.ActorID,
		StartedByEventID:         event.EventID,
		StartedAt:                event.ObservedAt,
		UpdatedAt:                event.ObservedAt,
	})
}

func projectActivityEnded(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[activityEndedPayload](event)
	if err != nil {
		return err
	}
	if err := validateStoreIDs("activity interval id", payload.IntervalID); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `
UPDATE semantic_activity_intervals
SET ended_by_event_id = ?, ended_at = ?, updated_at = ?
WHERE workspace_id = ? AND id = ? AND ended_at = '' AND (? = '' OR target_entity_id = ?)
`, event.EventID, event.ObservedAt, event.ObservedAt, event.WorkspaceID, payload.IntervalID, event.TargetEntityID, event.TargetEntityID)
	if err != nil {
		return fmt.Errorf("end semantic activity interval: %w", err)
	}
	if err := requireRowsAffected(result, "active semantic activity interval", payload.IntervalID); err != nil {
		return err
	}
	interval, ok, err := loadSemanticActivityIntervalForProjection(ctx, tx, event.WorkspaceID, payload.IntervalID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("semantic activity interval %s does not exist", payload.IntervalID)
	}
	return upsertSemanticActivitySearchRow(ctx, tx, interval)
}

func projectConstraintCheckRecorded(_ context.Context, _ *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[constraintCheckRecordedPayload](event)
	if err != nil {
		return err
	}
	if err := validateStoreIDs("constraint check id", payload.CheckID, "target entity id", payload.TargetEntityID); err != nil {
		return err
	}
	if event.TargetEntityID != "" && event.TargetEntityID != payload.TargetEntityID {
		return fmt.Errorf("semantic event %s targetEntityId = %s, want %s", event.EventID, event.TargetEntityID, payload.TargetEntityID)
	}
	if err := requireNonEmpty(payload.Status, "constraint check status"); err != nil {
		return err
	}
	return nil
}

func validateNodeCreatedPayload(event SemanticEvent, payload nodeCreatedPayload) error {
	if err := requireEntityID(event, payload.NodeID, "node id"); err != nil {
		return err
	}
	return validateNodeSeedPayload(payload)
}

func validateNodeSeedPayload(payload nodeCreatedPayload) error {
	if err := validateStoreIDs("node id", payload.NodeID); err != nil {
		return err
	}
	if !isSemanticNodeKind(payload.Kind) {
		return fmt.Errorf("node kind is unsupported: %s", payload.Kind)
	}
	return requireNonEmpty(payload.Label, "node label")
}

func validateEdgeCreatedPayload(event SemanticEvent, payload edgeCreatedPayload) error {
	if err := requireEntityID(event, payload.EdgeID, "edge id"); err != nil {
		return err
	}
	if !isSemanticEdgeKind(payload.Kind) {
		return fmt.Errorf("edge kind is unsupported: %s", payload.Kind)
	}
	return validateStoreIDs("from node id", payload.FromNodeID, "to node id", payload.ToNodeID)
}

func validateEvidenceAttachedPayload(event SemanticEvent, payload evidenceAttachedPayload) error {
	if err := validateStoreIDs("evidence anchor id", payload.AnchorID, "target entity id", payload.TargetEntityID); err != nil {
		return err
	}
	if event.TargetEntityID != "" && event.TargetEntityID != payload.TargetEntityID {
		return fmt.Errorf("semantic event %s targetEntityId = %s, want %s", event.EventID, event.TargetEntityID, payload.TargetEntityID)
	}
	if !isSemanticEvidenceSourceKind(payload.SourceKind) {
		return fmt.Errorf("evidence source kind is unsupported: %s", payload.SourceKind)
	}
	return validateEvidenceAnchorDetails(payload)
}

func validateEvidenceAnchorDetails(payload evidenceAttachedPayload) error {
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "evidence source id", value: payload.SourceID},
		{label: "evidence workflow definition id", value: payload.WorkflowDefinitionID},
		{label: "evidence workflow execution id", value: payload.WorkflowExecutionID},
		{label: "evidence workflow node id", value: payload.WorkflowNodeID},
		{label: "evidence workflow node execution id", value: payload.WorkflowNodeExecutionID},
		{label: "evidence chat conversation id", value: payload.ChatConversationID},
		{label: "evidence chat run id", value: payload.ChatRunID},
		{label: "evidence chat message id", value: payload.ChatMessageID},
		{label: "evidence run item id", value: payload.RunItemID},
		{label: "reassigned evidence anchor id", value: payload.ReassignedFromAnchorID},
	}); err != nil {
		return err
	}
	if err := validateEvidenceRange(payload.RangeStart, payload.RangeEnd); err != nil {
		return err
	}
	return validateEvidenceContent(payload)
}

func validateEvidenceRange(start int, end int) error {
	if start < 0 || end < 0 || end < start {
		return fmt.Errorf("evidence range must be non-negative and ordered")
	}
	return nil
}

func validateEvidenceContent(payload evidenceAttachedPayload) error {
	if payload.URI != "" || payload.Path != "" || payload.Text != "" || payload.Summary != "" {
		return nil
	}
	return fmt.Errorf("evidence must include uri, path, text, or summary")
}

func validateActivityStartedPayload(event SemanticEvent, payload activityStartedPayload) error {
	if err := validateStoreIDs("activity interval id", payload.IntervalID, "target entity id", payload.TargetEntityID); err != nil {
		return err
	}
	if event.TargetEntityID != "" && event.TargetEntityID != payload.TargetEntityID {
		return fmt.Errorf("semantic event %s targetEntityId = %s, want %s", event.EventID, event.TargetEntityID, payload.TargetEntityID)
	}
	if !isSemanticActivityKind(payload.Kind) {
		return fmt.Errorf("activity kind is unsupported: %s", payload.Kind)
	}
	if !isSemanticActivitySourceKind(payload.SourceKind) {
		return fmt.Errorf("activity source kind is unsupported: %s", payload.SourceKind)
	}
	if !isSemanticActorKind(payload.ActorKind) {
		return fmt.Errorf("activity actor kind is unsupported: %s", payload.ActorKind)
	}
	return validateActivitySourceReferences(payload)
}

func validateActivitySourceReferences(payload activityStartedPayload) error {
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "activity source id", value: payload.SourceID},
		{label: "activity evidence anchor id", value: payload.EvidenceAnchorID},
		{label: "activity workflow definition id", value: payload.WorkflowDefinitionID},
		{label: "activity workflow execution id", value: payload.WorkflowExecutionID},
		{label: "activity workflow node id", value: payload.WorkflowNodeID},
		{label: "activity workflow node execution id", value: payload.WorkflowNodeExecutionID},
		{label: "activity chat conversation id", value: payload.ChatConversationID},
		{label: "activity chat run id", value: payload.ChatRunID},
		{label: "activity chat message id", value: payload.ChatMessageID},
		{label: "activity run item id", value: payload.RunItemID},
		{label: "reassigned activity interval id", value: payload.ReassignedFromIntervalID},
		{label: "activity actor id", value: payload.ActorID},
	}); err != nil {
		return err
	}
	switch payload.SourceKind {
	case ActivitySourceWorkflowExecution:
		return validateStoreIDs("activity workflow execution id", payload.WorkflowExecutionID)
	case ActivitySourceWorkflowNode:
		return validateStoreIDs("activity workflow node id", payload.WorkflowNodeID)
	case ActivitySourceChatRun:
		return validateStoreIDs("activity chat run id", payload.ChatRunID)
	case ActivitySourceChatMessage:
		return validateStoreIDs("activity chat conversation id", payload.ChatConversationID, "activity chat message id", payload.ChatMessageID)
	case ActivitySourceRunItem, ActivitySourceCommand:
		return validateStoreIDs("activity chat run id", payload.ChatRunID, "activity source id", payload.SourceID)
	case ActivitySourceFileRange, ActivitySourceTest, ActivitySourceDiff:
		return nil
	default:
		return fmt.Errorf("activity source kind is unsupported: %s", payload.SourceKind)
	}
}

func validateSteeringCreatedPayload(event SemanticEvent, payload steeringCreatedPayload) error {
	if err := validateStoreIDs("steering directive id", payload.DirectiveID, "target entity id", payload.TargetEntityID); err != nil {
		return err
	}
	if event.TargetEntityID != "" && event.TargetEntityID != payload.TargetEntityID {
		return fmt.Errorf("semantic event %s targetEntityId = %s, want %s", event.EventID, event.TargetEntityID, payload.TargetEntityID)
	}
	if !isSemanticSteeringKind(payload.Kind) {
		return fmt.Errorf("steering kind is unsupported: %s", payload.Kind)
	}
	if !isSemanticSteeringStatus(payload.Status) {
		return fmt.Errorf("steering status is unsupported: %s", payload.Status)
	}
	if !isSemanticSteeringScope(payload.Scope) {
		return fmt.Errorf("steering scope is unsupported: %s", payload.Scope)
	}
	if err := validateOptionalStoreIDs([]optionalStoreID{
		{label: "steering workflow definition id", value: payload.WorkflowDefinitionID},
		{label: "steering workflow execution id", value: payload.WorkflowExecutionID},
		{label: "steering workflow node id", value: payload.WorkflowNodeID},
		{label: "steering workflow node execution id", value: payload.WorkflowNodeExecutionID},
		{label: "steering chat conversation id", value: payload.ChatConversationID},
		{label: "steering chat run id", value: payload.ChatRunID},
		{label: "steering chat message id", value: payload.ChatMessageID},
		{label: "steering run item id", value: payload.RunItemID},
		{label: "superseded steering directive id", value: payload.SupersedesDirectiveID},
		{label: "reassigned steering directive id", value: payload.ReassignedFromDirectiveID},
	}); err != nil {
		return err
	}
	return requireNonEmpty(payload.Instruction, "steering instruction")
}

func insertSemanticNode(ctx context.Context, tx *sql.Tx, event SemanticEvent, payload nodeCreatedPayload, splitFromNodeID string, mergedIntoNodeID string) error {
	splitIntoJSON := "[]"
	_, err := tx.ExecContext(ctx, `
INSERT INTO semantic_nodes_current (
  workspace_id, id, kind, label, summary, dismissed, promoted,
  split_from_node_id, split_into_node_ids_json, merged_into_node_id,
  created_by_event_id, updated_by_event_id, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)
`,
		event.WorkspaceID,
		payload.NodeID,
		payload.Kind,
		payload.Label,
		payload.Summary,
		splitFromNodeID,
		splitIntoJSON,
		mergedIntoNodeID,
		event.EventID,
		event.EventID,
		event.ObservedAt,
		event.ObservedAt,
	)
	if err != nil {
		return fmt.Errorf("create semantic node: %w", err)
	}
	return upsertSemanticNodeSearchRow(ctx, tx, SemanticNode{
		ID:               payload.NodeID,
		WorkspaceID:      event.WorkspaceID,
		Kind:             payload.Kind,
		Label:            payload.Label,
		Summary:          payload.Summary,
		SplitFromNodeID:  splitFromNodeID,
		SplitIntoNodeIDs: []string{},
		MergedIntoNodeID: mergedIntoNodeID,
		CreatedByEventID: event.EventID,
		UpdatedByEventID: event.EventID,
		CreatedAt:        event.ObservedAt,
		UpdatedAt:        event.ObservedAt,
	})
}

func insertSemanticEdge(ctx context.Context, tx *sql.Tx, event SemanticEvent, payload edgeCreatedPayload) error {
	if err := requireSemanticNode(ctx, tx, event.WorkspaceID, payload.FromNodeID); err != nil {
		return err
	}
	if err := requireSemanticNode(ctx, tx, event.WorkspaceID, payload.ToNodeID); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `
INSERT INTO semantic_edges_current (
  workspace_id, id, kind, from_node_id, to_node_id, label, summary,
  created_by_event_id, updated_by_event_id, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.WorkspaceID,
		payload.EdgeID,
		payload.Kind,
		payload.FromNodeID,
		payload.ToNodeID,
		payload.Label,
		payload.Summary,
		event.EventID,
		event.EventID,
		event.ObservedAt,
		event.ObservedAt,
	)
	if err != nil {
		return fmt.Errorf("create semantic edge: %w", err)
	}
	return nil
}

func replaceSemanticNode(ctx context.Context, tx *sql.Tx, node SemanticNode) error {
	splitIntoJSON, err := marshalJSONColumn(node.SplitIntoNodeIDs)
	if err != nil {
		return fmt.Errorf("encode split node ids: %w", err)
	}
	result, err := tx.ExecContext(ctx, `
UPDATE semantic_nodes_current
SET kind = ?, label = ?, summary = ?, dismissed = ?, promoted = ?,
    split_from_node_id = ?, split_into_node_ids_json = ?, merged_into_node_id = ?,
    updated_by_event_id = ?, updated_at = ?
WHERE workspace_id = ? AND id = ?
`,
		node.Kind,
		node.Label,
		node.Summary,
		intFromBool(node.Dismissed),
		intFromBool(node.Promoted),
		node.SplitFromNodeID,
		splitIntoJSON,
		node.MergedIntoNodeID,
		node.UpdatedByEventID,
		node.UpdatedAt,
		node.WorkspaceID,
		node.ID,
	)
	if err != nil {
		return fmt.Errorf("update semantic node: %w", err)
	}
	if err := requireRowsAffected(result, "semantic node", node.ID); err != nil {
		return err
	}
	return upsertSemanticNodeSearchRow(ctx, tx, node)
}

func replaceSemanticEdge(ctx context.Context, tx *sql.Tx, edge SemanticEdge) error {
	result, err := tx.ExecContext(ctx, `
UPDATE semantic_edges_current
SET kind = ?, label = ?, summary = ?, updated_by_event_id = ?, updated_at = ?
WHERE workspace_id = ? AND id = ?
`, edge.Kind, edge.Label, edge.Summary, edge.UpdatedByEventID, edge.UpdatedAt, edge.WorkspaceID, edge.ID)
	if err != nil {
		return fmt.Errorf("update semantic edge: %w", err)
	}
	return requireRowsAffected(result, "semantic edge", edge.ID)
}

func replaceSemanticSteeringDirective(ctx context.Context, tx *sql.Tx, directive SemanticSteeringDirective) error {
	result, err := tx.ExecContext(ctx, `
UPDATE semantic_steering_directives
SET instruction = ?, status = ?, supersedes_directive_id = ?, updated_by_event_id = ?,
    updated_at = ?, completed_at = ?
WHERE workspace_id = ? AND id = ?
`,
		directive.Instruction,
		directive.Status,
		directive.SupersedesDirectiveID,
		directive.UpdatedByEventID,
		directive.UpdatedAt,
		directive.CompletedAt,
		directive.WorkspaceID,
		directive.ID,
	)
	if err != nil {
		return fmt.Errorf("update semantic steering directive: %w", err)
	}
	return requireRowsAffected(result, "semantic steering directive", directive.ID)
}

func completedAtForSteeringStatus(status SemanticSteeringStatus, observedAt string) string {
	if isTerminalSteeringStatus(status) {
		return observedAt
	}
	return ""
}

func isTerminalSteeringStatus(status SemanticSteeringStatus) bool {
	return status == SteeringStatusCompleted ||
		status == SteeringStatusSuperseded ||
		status == SteeringStatusDismissed
}
