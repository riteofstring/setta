package semanticgraph

import (
	"context"
	"database/sql"
	"fmt"
)

type nodeCreatedPayload struct {
	NodeID  string           `json:"nodeId"`
	Kind    SemanticNodeKind `json:"kind"`
	Label   string           `json:"label"`
	Summary string           `json:"summary"`
}

type nodeUpdatedPayload struct {
	NodeID  string            `json:"nodeId"`
	Kind    *SemanticNodeKind `json:"kind"`
	Summary *string           `json:"summary"`
}

type nodeRenamedPayload struct {
	NodeID string `json:"nodeId"`
	Label  string `json:"label"`
}

type nodeDismissedPayload struct {
	NodeID string `json:"nodeId"`
}

type nodePromotedPayload struct {
	NodeID string `json:"nodeId"`
}

type nodeSplitPayload struct {
	SourceNodeID string               `json:"sourceNodeId"`
	Nodes        []nodeCreatedPayload `json:"nodes"`
}

type nodeMergedPayload struct {
	SourceNodeIDs []string           `json:"sourceNodeIds"`
	TargetNode    nodeCreatedPayload `json:"targetNode"`
}

type edgeCreatedPayload struct {
	EdgeID     string           `json:"edgeId"`
	Kind       SemanticEdgeKind `json:"kind"`
	FromNodeID string           `json:"fromNodeId"`
	ToNodeID   string           `json:"toNodeId"`
	Label      string           `json:"label"`
	Summary    string           `json:"summary"`
}

type edgeUpdatedPayload struct {
	EdgeID  string            `json:"edgeId"`
	Kind    *SemanticEdgeKind `json:"kind"`
	Label   *string           `json:"label"`
	Summary *string           `json:"summary"`
}

type edgeRemovedPayload struct {
	EdgeID string `json:"edgeId"`
}

type evidenceAttachedPayload struct {
	AnchorID       string                     `json:"anchorId"`
	TargetEntityID string                     `json:"targetEntityId"`
	SourceKind     SemanticEvidenceSourceKind `json:"sourceKind"`
	SourceID       string                     `json:"sourceId"`
	URI            string                     `json:"uri"`
	Path           string                     `json:"path"`
	RangeStart     int                        `json:"rangeStart"`
	RangeEnd       int                        `json:"rangeEnd"`
	Text           string                     `json:"text"`
	Summary        string                     `json:"summary"`
}

type activityStartedPayload struct {
	IntervalID     string               `json:"intervalId"`
	TargetEntityID string               `json:"targetEntityId"`
	Kind           SemanticActivityKind `json:"kind"`
	Summary        string               `json:"summary"`
}

type activityEndedPayload struct {
	IntervalID string `json:"intervalId"`
}

type steeringCreatedPayload struct {
	DirectiveID    string `json:"directiveId"`
	TargetEntityID string `json:"targetEntityId"`
	Instruction    string `json:"instruction"`
	Active         bool   `json:"active"`
}

type steeringUpdatedPayload struct {
	DirectiveID string  `json:"directiveId"`
	Instruction *string `json:"instruction"`
	Active      *bool   `json:"active"`
}

type contextPackCreatedPayload struct {
	PackID         string `json:"packId"`
	TargetEntityID string `json:"targetEntityId"`
	Summary        string `json:"summary"`
	Prompt         string `json:"prompt"`
	ItemCount      int    `json:"itemCount"`
}

type constraintCheckRecordedPayload struct {
	CheckID        string `json:"checkId"`
	TargetEntityID string `json:"targetEntityId"`
	Status         string `json:"status"`
	Message        string `json:"message"`
}

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
	return requireRowsAffected(result, "semantic node", payload.NodeID)
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
	return requireRowsAffected(result, "semantic node", payload.NodeID)
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
	return requireRowsAffected(result, "semantic node", payload.NodeID)
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
	return nil
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
	_, err = tx.ExecContext(ctx, `
INSERT INTO semantic_evidence_anchors (
  workspace_id, id, target_entity_id, source_kind, source_id, uri, path,
  range_start, range_end, text, summary, created_by_event_id, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.WorkspaceID,
		payload.AnchorID,
		payload.TargetEntityID,
		payload.SourceKind,
		payload.SourceID,
		payload.URI,
		payload.Path,
		payload.RangeStart,
		payload.RangeEnd,
		payload.Text,
		payload.Summary,
		event.EventID,
		event.ObservedAt,
	)
	if err != nil {
		return fmt.Errorf("attach semantic evidence: %w", err)
	}
	return nil
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
  workspace_id, id, target_entity_id, kind, summary, started_by_event_id,
  started_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.WorkspaceID,
		payload.IntervalID,
		payload.TargetEntityID,
		payload.Kind,
		payload.Summary,
		event.EventID,
		event.ObservedAt,
		event.ObservedAt,
	)
	if err != nil {
		return fmt.Errorf("start semantic activity interval: %w", err)
	}
	return nil
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
	return requireRowsAffected(result, "active semantic activity interval", payload.IntervalID)
}

func projectSteeringCreated(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[steeringCreatedPayload](event)
	if err != nil {
		return err
	}
	if err := validateSteeringCreatedPayload(event, payload); err != nil {
		return err
	}
	if err := requireSemanticEntity(ctx, tx, event.WorkspaceID, payload.TargetEntityID); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO semantic_steering_directives (
  workspace_id, id, target_entity_id, instruction, active,
  created_by_event_id, updated_by_event_id, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.WorkspaceID,
		payload.DirectiveID,
		payload.TargetEntityID,
		payload.Instruction,
		intFromBool(payload.Active),
		event.EventID,
		event.EventID,
		event.ObservedAt,
		event.ObservedAt,
	)
	if err != nil {
		return fmt.Errorf("create semantic steering directive: %w", err)
	}
	return nil
}

func projectSteeringUpdated(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[steeringUpdatedPayload](event)
	if err != nil {
		return err
	}
	if err := validateStoreIDs("steering directive id", payload.DirectiveID); err != nil {
		return err
	}
	if payload.Instruction == nil && payload.Active == nil {
		return fmt.Errorf("steering.updated payload must include instruction or active")
	}
	directive, ok, err := loadSemanticSteeringDirectiveForProjection(ctx, tx, event.WorkspaceID, payload.DirectiveID)
	if err != nil {
		return err
	}
	if !ok {
		return fmt.Errorf("semantic steering directive %s does not exist", payload.DirectiveID)
	}
	if payload.Instruction != nil {
		if err := requireNonEmpty(*payload.Instruction, "steering instruction"); err != nil {
			return err
		}
		directive.Instruction = *payload.Instruction
	}
	if payload.Active != nil {
		directive.Active = *payload.Active
	}
	directive.UpdatedByEventID = event.EventID
	directive.UpdatedAt = event.ObservedAt
	return replaceSemanticSteeringDirective(ctx, tx, directive)
}

func projectContextPackCreated(ctx context.Context, tx *sql.Tx, event SemanticEvent) error {
	payload, err := decodeStrictPayload[contextPackCreatedPayload](event)
	if err != nil {
		return err
	}
	if err := validateContextPackCreatedPayload(event, payload); err != nil {
		return err
	}
	if err := requireSemanticEntity(ctx, tx, event.WorkspaceID, payload.TargetEntityID); err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `
INSERT INTO semantic_context_pack_history (
  workspace_id, id, target_entity_id, summary, prompt, item_count,
  created_by_event_id, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`,
		event.WorkspaceID,
		payload.PackID,
		payload.TargetEntityID,
		payload.Summary,
		payload.Prompt,
		payload.ItemCount,
		event.EventID,
		event.ObservedAt,
	)
	if err != nil {
		return fmt.Errorf("record semantic context pack: %w", err)
	}
	return nil
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
	if err := requireOptionalEntityID(payload.SourceID, "evidence source id"); err != nil {
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
	return nil
}

func validateSteeringCreatedPayload(event SemanticEvent, payload steeringCreatedPayload) error {
	if err := validateStoreIDs("steering directive id", payload.DirectiveID, "target entity id", payload.TargetEntityID); err != nil {
		return err
	}
	if event.TargetEntityID != "" && event.TargetEntityID != payload.TargetEntityID {
		return fmt.Errorf("semantic event %s targetEntityId = %s, want %s", event.EventID, event.TargetEntityID, payload.TargetEntityID)
	}
	return requireNonEmpty(payload.Instruction, "steering instruction")
}

func validateContextPackCreatedPayload(event SemanticEvent, payload contextPackCreatedPayload) error {
	if err := validateStoreIDs("context pack id", payload.PackID, "target entity id", payload.TargetEntityID); err != nil {
		return err
	}
	if event.TargetEntityID != "" && event.TargetEntityID != payload.TargetEntityID {
		return fmt.Errorf("semantic event %s targetEntityId = %s, want %s", event.EventID, event.TargetEntityID, payload.TargetEntityID)
	}
	if payload.ItemCount < 0 {
		return fmt.Errorf("context pack itemCount must not be negative")
	}
	return nil
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
	return nil
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
	return requireRowsAffected(result, "semantic node", node.ID)
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
SET instruction = ?, active = ?, updated_by_event_id = ?, updated_at = ?
WHERE workspace_id = ? AND id = ?
`,
		directive.Instruction,
		intFromBool(directive.Active),
		directive.UpdatedByEventID,
		directive.UpdatedAt,
		directive.WorkspaceID,
		directive.ID,
	)
	if err != nil {
		return fmt.Errorf("update semantic steering directive: %w", err)
	}
	return requireRowsAffected(result, "semantic steering directive", directive.ID)
}
