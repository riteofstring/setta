package semanticgraph

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

const defaultSemanticPageLimit = 100

func (store *Store) ReadGraph(ctx context.Context, workspaceID string) (SemanticGraph, error) {
	if ctx == nil {
		return SemanticGraph{}, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID); err != nil {
		return SemanticGraph{}, err
	}
	nodes, err := store.loadSemanticNodes(ctx, workspaceID, "", nil)
	if err != nil {
		return SemanticGraph{}, err
	}
	edges, err := store.loadSemanticEdges(ctx, workspaceID, "", nil)
	if err != nil {
		return SemanticGraph{}, err
	}
	positions, err := store.loadSemanticLayoutPositions(ctx, workspaceID)
	if err != nil {
		return SemanticGraph{}, err
	}
	return SemanticGraph{
		WorkspaceID:     workspaceID,
		Nodes:           nodes,
		Edges:           edges,
		LayoutPositions: positions,
	}, nil
}

func (store *Store) ReadNodeDetail(ctx context.Context, workspaceID string, nodeID string) (SemanticNodeDetail, bool, error) {
	if ctx == nil {
		return SemanticNodeDetail{}, false, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "node id", nodeID); err != nil {
		return SemanticNodeDetail{}, false, err
	}
	node, ok, err := store.loadSemanticNode(ctx, workspaceID, nodeID)
	if err != nil || !ok {
		return SemanticNodeDetail{}, ok, err
	}
	incoming, err := store.loadSemanticEdges(ctx, workspaceID, "to_node_id = ?", []any{nodeID})
	if err != nil {
		return SemanticNodeDetail{}, false, err
	}
	outgoing, err := store.loadSemanticEdges(ctx, workspaceID, "from_node_id = ?", []any{nodeID})
	if err != nil {
		return SemanticNodeDetail{}, false, err
	}
	evidence, err := store.loadSemanticEvidence(ctx, workspaceID, nodeID)
	if err != nil {
		return SemanticNodeDetail{}, false, err
	}
	activity, err := store.loadSemanticActivity(ctx, workspaceID, nodeID, defaultSemanticPageLimit)
	if err != nil {
		return SemanticNodeDetail{}, false, err
	}
	steering, err := store.loadSemanticSteering(ctx, workspaceID, nodeID)
	if err != nil {
		return SemanticNodeDetail{}, false, err
	}
	contextPacks, err := store.loadSemanticContextPacks(ctx, workspaceID, nodeID)
	if err != nil {
		return SemanticNodeDetail{}, false, err
	}
	return SemanticNodeDetail{
		WorkspaceID:        workspaceID,
		Node:               node,
		IncomingEdges:      incoming,
		OutgoingEdges:      outgoing,
		Evidence:           evidence,
		Activity:           activity,
		SteeringDirectives: steering,
		ContextPackHistory: contextPacks,
	}, true, nil
}

func (store *Store) ListEvidence(ctx context.Context, workspaceID string, targetEntityID string) (SemanticEvidenceList, error) {
	if ctx == nil {
		return SemanticEvidenceList{}, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "target entity id", targetEntityID); err != nil {
		return SemanticEvidenceList{}, err
	}
	evidence, err := store.loadSemanticEvidence(ctx, workspaceID, targetEntityID)
	if err != nil {
		return SemanticEvidenceList{}, err
	}
	return SemanticEvidenceList{WorkspaceID: workspaceID, TargetEntityID: targetEntityID, Evidence: evidence}, nil
}

func (store *Store) ListActivity(ctx context.Context, workspaceID string, targetEntityID string, limit int) (SemanticActivityList, error) {
	if ctx == nil {
		return SemanticActivityList{}, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "target entity id", targetEntityID); err != nil {
		return SemanticActivityList{}, err
	}
	if limit <= 0 {
		return SemanticActivityList{}, fmt.Errorf("semantic activity limit must be positive: %d", limit)
	}
	activity, err := store.loadSemanticActivity(ctx, workspaceID, targetEntityID, limit)
	if err != nil {
		return SemanticActivityList{}, err
	}
	return SemanticActivityList{WorkspaceID: workspaceID, TargetEntityID: targetEntityID, Activity: activity}, nil
}

func (store *Store) ReadSteeringState(ctx context.Context, workspaceID string, targetEntityID string) (SemanticSteeringState, error) {
	if ctx == nil {
		return SemanticSteeringState{}, errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID, "target entity id", targetEntityID); err != nil {
		return SemanticSteeringState{}, err
	}
	directives, err := store.loadSemanticSteering(ctx, workspaceID, targetEntityID)
	if err != nil {
		return SemanticSteeringState{}, err
	}
	return SemanticSteeringState{WorkspaceID: workspaceID, TargetEntityID: targetEntityID, SteeringDirectives: directives}, nil
}

func (store *Store) ReadEventHistory(ctx context.Context, workspaceID string, targetEntityID string, beforeLogicalClock int, limit int) (SemanticEventHistory, error) {
	if err := validateEventHistoryRequest(ctx, workspaceID, targetEntityID, beforeLogicalClock, limit); err != nil {
		return SemanticEventHistory{}, err
	}
	condition, args := semanticEventHistoryQuery(workspaceID, targetEntityID, beforeLogicalClock, limit)
	rows, err := store.db.QueryContext(ctx, fmt.Sprintf(`
SELECT event_id, workspace_id, session_id, run_id, workflow_execution_id,
       actor_kind, actor_id, event_type, target_entity_id, causation_id,
       correlation_id, trace_id, span_id, logical_clock, observed_at,
       payload_json, model_info_json, confidence, supersedes_event_id,
       retracted_by_event_id
FROM semantic_events
WHERE %s
ORDER BY logical_clock DESC, event_id DESC
LIMIT ?
`, condition), args...)
	if err != nil {
		return SemanticEventHistory{}, store.persistenceError("read semantic event history", err)
	}
	defer rows.Close()
	reversed, err := store.scanSemanticEventHistoryRows(rows)
	if err != nil {
		return SemanticEventHistory{}, err
	}
	return semanticEventHistoryFromDescending(workspaceID, targetEntityID, reversed, limit), nil
}

func validateEventHistoryRequest(ctx context.Context, workspaceID string, targetEntityID string, beforeLogicalClock int, limit int) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", workspaceID); err != nil {
		return err
	}
	if err := requireOptionalEntityID(targetEntityID, "target entity id"); err != nil {
		return err
	}
	if beforeLogicalClock < 0 {
		return fmt.Errorf("semantic event beforeLogicalClock must not be negative: %d", beforeLogicalClock)
	}
	if limit <= 0 {
		return fmt.Errorf("semantic event history limit must be positive: %d", limit)
	}
	return nil
}

func semanticEventHistoryQuery(workspaceID string, targetEntityID string, beforeLogicalClock int, limit int) (string, []any) {
	condition := "workspace_id = ?"
	args := []any{workspaceID}
	if targetEntityID != "" {
		condition += " AND target_entity_id = ?"
		args = append(args, targetEntityID)
	}
	if beforeLogicalClock > 0 {
		condition += " AND logical_clock < ?"
		args = append(args, beforeLogicalClock)
	}
	args = append(args, limit+1)
	return condition, args
}

func (store *Store) scanSemanticEventHistoryRows(rows *sql.Rows) ([]SemanticEvent, error) {
	reversed := []SemanticEvent{}
	for rows.Next() {
		event, err := scanSemanticEvent(rows)
		if err != nil {
			return nil, store.corruptError("semantic_events", err)
		}
		reversed = append(reversed, event)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic event history", err)
	}
	return reversed, nil
}

func semanticEventHistoryFromDescending(workspaceID string, targetEntityID string, reversed []SemanticEvent, limit int) SemanticEventHistory {
	hasMoreOlder := len(reversed) > limit
	if hasMoreOlder {
		reversed = reversed[:limit]
	}
	events := make([]SemanticEvent, len(reversed))
	for index := range reversed {
		events[len(reversed)-1-index] = reversed[index]
	}
	olderBeforeLogicalClock := 0
	if len(events) > 0 {
		olderBeforeLogicalClock = events[0].LogicalClock
	}
	return SemanticEventHistory{
		WorkspaceID:             workspaceID,
		TargetEntityID:          targetEntityID,
		Events:                  events,
		HasMoreOlder:            hasMoreOlder,
		OlderBeforeLogicalClock: olderBeforeLogicalClock,
	}
}

func (store *Store) loadSemanticNode(ctx context.Context, workspaceID string, nodeID string) (SemanticNode, bool, error) {
	row := store.db.QueryRowContext(ctx, `
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
	if errors.Is(err, sql.ErrNoRows) {
		return SemanticNode{}, false, nil
	}
	return SemanticNode{}, false, store.persistenceError("read semantic node", err)
}

func (store *Store) loadSemanticNodes(ctx context.Context, workspaceID string, extraCondition string, extraArgs []any) ([]SemanticNode, error) {
	condition := "workspace_id = ?"
	args := []any{workspaceID}
	if extraCondition != "" {
		condition += " AND " + extraCondition
		args = append(args, extraArgs...)
	}
	rows, err := store.db.QueryContext(ctx, fmt.Sprintf(`
SELECT workspace_id, id, kind, label, summary, dismissed, promoted,
       split_from_node_id, split_into_node_ids_json, merged_into_node_id,
       created_by_event_id, updated_by_event_id, created_at, updated_at
FROM semantic_nodes_current
WHERE %s
ORDER BY label ASC, id ASC
`, condition), args...)
	if err != nil {
		return nil, store.persistenceError("read semantic nodes", err)
	}
	defer rows.Close()
	nodes := []SemanticNode{}
	for rows.Next() {
		node, err := scanSemanticNode(rows)
		if err != nil {
			return nil, store.corruptError("semantic_nodes_current", err)
		}
		nodes = append(nodes, node)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic nodes", err)
	}
	return nodes, nil
}

func (store *Store) loadSemanticEdges(ctx context.Context, workspaceID string, extraCondition string, extraArgs []any) ([]SemanticEdge, error) {
	condition := "workspace_id = ?"
	args := []any{workspaceID}
	if extraCondition != "" {
		condition += " AND " + extraCondition
		args = append(args, extraArgs...)
	}
	rows, err := store.db.QueryContext(ctx, fmt.Sprintf(`
SELECT workspace_id, id, kind, from_node_id, to_node_id, label, summary,
       created_by_event_id, updated_by_event_id, created_at, updated_at
FROM semantic_edges_current
WHERE %s
ORDER BY kind ASC, id ASC
`, condition), args...)
	if err != nil {
		return nil, store.persistenceError("read semantic edges", err)
	}
	defer rows.Close()
	edges := []SemanticEdge{}
	for rows.Next() {
		edge, err := scanSemanticEdge(rows)
		if err != nil {
			return nil, store.corruptError("semantic_edges_current", err)
		}
		edges = append(edges, edge)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic edges", err)
	}
	return edges, nil
}

func (store *Store) loadSemanticEvidence(ctx context.Context, workspaceID string, targetEntityID string) ([]SemanticEvidenceAnchor, error) {
	rows, err := store.db.QueryContext(ctx, `
SELECT workspace_id, id, target_entity_id, source_kind, source_id, uri, path,
       range_start, range_end, text, summary, created_by_event_id, created_at
FROM semantic_evidence_anchors
WHERE workspace_id = ? AND target_entity_id = ?
ORDER BY created_at ASC, id ASC
`, workspaceID, targetEntityID)
	if err != nil {
		return nil, store.persistenceError("read semantic evidence", err)
	}
	defer rows.Close()
	evidence := []SemanticEvidenceAnchor{}
	for rows.Next() {
		anchor, err := scanSemanticEvidenceAnchor(rows)
		if err != nil {
			return nil, store.corruptError("semantic_evidence_anchors", err)
		}
		evidence = append(evidence, anchor)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic evidence", err)
	}
	return evidence, nil
}

func (store *Store) loadSemanticActivity(ctx context.Context, workspaceID string, targetEntityID string, limit int) ([]SemanticActivityInterval, error) {
	rows, err := store.db.QueryContext(ctx, `
SELECT workspace_id, id, target_entity_id, kind, summary, started_by_event_id,
       ended_by_event_id, started_at, ended_at, updated_at
FROM semantic_activity_intervals
WHERE workspace_id = ? AND target_entity_id = ?
ORDER BY started_at DESC, id DESC
LIMIT ?
`, workspaceID, targetEntityID, limit)
	if err != nil {
		return nil, store.persistenceError("read semantic activity", err)
	}
	defer rows.Close()
	activity := []SemanticActivityInterval{}
	for rows.Next() {
		interval, err := scanSemanticActivityInterval(rows)
		if err != nil {
			return nil, store.corruptError("semantic_activity_intervals", err)
		}
		activity = append(activity, interval)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic activity", err)
	}
	return activity, nil
}

func (store *Store) loadSemanticSteering(ctx context.Context, workspaceID string, targetEntityID string) ([]SemanticSteeringDirective, error) {
	rows, err := store.db.QueryContext(ctx, `
SELECT workspace_id, id, target_entity_id, instruction, active,
       created_by_event_id, updated_by_event_id, created_at, updated_at
FROM semantic_steering_directives
WHERE workspace_id = ? AND target_entity_id = ?
ORDER BY active DESC, updated_at DESC, id ASC
`, workspaceID, targetEntityID)
	if err != nil {
		return nil, store.persistenceError("read semantic steering", err)
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
		return nil, store.persistenceError("read semantic steering", err)
	}
	return directives, nil
}

func (store *Store) loadSemanticContextPacks(ctx context.Context, workspaceID string, targetEntityID string) ([]SemanticContextPackRecord, error) {
	rows, err := store.db.QueryContext(ctx, `
SELECT workspace_id, id, target_entity_id, summary, prompt, item_count,
       created_by_event_id, created_at
FROM semantic_context_pack_history
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

func (store *Store) loadSemanticLayoutPositions(ctx context.Context, workspaceID string) ([]SemanticLayoutPosition, error) {
	rows, err := store.db.QueryContext(ctx, `
SELECT workspace_id, entity_id, x, y, pinned, updated_at
FROM semantic_layout_positions
WHERE workspace_id = ?
ORDER BY entity_id ASC
`, workspaceID)
	if err != nil {
		return nil, store.persistenceError("read semantic layout positions", err)
	}
	defer rows.Close()
	positions := []SemanticLayoutPosition{}
	for rows.Next() {
		position, err := scanSemanticLayoutPosition(rows)
		if err != nil {
			return nil, store.corruptError("semantic_layout_positions", err)
		}
		positions = append(positions, position)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic layout positions", err)
	}
	return positions, nil
}

func scanSemanticEvidenceAnchor(scanner interface{ Scan(dest ...any) error }) (SemanticEvidenceAnchor, error) {
	var anchor SemanticEvidenceAnchor
	if err := scanner.Scan(
		&anchor.WorkspaceID,
		&anchor.ID,
		&anchor.TargetEntityID,
		&anchor.SourceKind,
		&anchor.SourceID,
		&anchor.URI,
		&anchor.Path,
		&anchor.RangeStart,
		&anchor.RangeEnd,
		&anchor.Text,
		&anchor.Summary,
		&anchor.CreatedByEventID,
		&anchor.CreatedAt,
	); err != nil {
		return SemanticEvidenceAnchor{}, err
	}
	return anchor, nil
}

func scanSemanticActivityInterval(scanner interface{ Scan(dest ...any) error }) (SemanticActivityInterval, error) {
	var interval SemanticActivityInterval
	if err := scanner.Scan(
		&interval.WorkspaceID,
		&interval.ID,
		&interval.TargetEntityID,
		&interval.Kind,
		&interval.Summary,
		&interval.StartedByEventID,
		&interval.EndedByEventID,
		&interval.StartedAt,
		&interval.EndedAt,
		&interval.UpdatedAt,
	); err != nil {
		return SemanticActivityInterval{}, err
	}
	return interval, nil
}

func scanSemanticContextPackRecord(scanner interface{ Scan(dest ...any) error }) (SemanticContextPackRecord, error) {
	var record SemanticContextPackRecord
	if err := scanner.Scan(
		&record.WorkspaceID,
		&record.ID,
		&record.TargetEntityID,
		&record.Summary,
		&record.Prompt,
		&record.ItemCount,
		&record.CreatedByEventID,
		&record.CreatedAt,
	); err != nil {
		return SemanticContextPackRecord{}, err
	}
	return record, nil
}

func scanSemanticLayoutPosition(scanner interface{ Scan(dest ...any) error }) (SemanticLayoutPosition, error) {
	var position SemanticLayoutPosition
	var pinned int
	if err := scanner.Scan(
		&position.WorkspaceID,
		&position.EntityID,
		&position.X,
		&position.Y,
		&pinned,
		&position.UpdatedAt,
	); err != nil {
		return SemanticLayoutPosition{}, err
	}
	position.Pinned = boolFromInt(pinned)
	return position, nil
}
