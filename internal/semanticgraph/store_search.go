package semanticgraph

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"unicode"
)

const (
	semanticSearchIndexedTextLimit = 4000

	semanticSearchRecordNode            = "semantic_node"
	semanticSearchRecordEvidence        = "evidence"
	semanticSearchRecordActivity        = "activity"
	semanticSearchRecordContextPackItem = "context_pack_item"
)

type SemanticSearchRequest struct {
	WorkspaceID string
	Query       string
	ExactPaths  []string
	ExactTexts  []string
	Limit       int
}

type semanticSearchRecord struct {
	WorkspaceID             string
	RecordKind              string
	RecordID                string
	SemanticNodeID          string
	EvidenceAnchorID        string
	ActivityIntervalID      string
	SteeringDirectiveID     string
	ContextPackID           string
	ContextPackItemID       string
	ItemKind                SemanticContextPackItemKind
	SourceKind              string
	SourceID                string
	URI                     string
	Path                    string
	WorkflowDefinitionID    string
	WorkflowExecutionID     string
	WorkflowNodeID          string
	WorkflowNodeExecutionID string
	ChatConversationID      string
	ChatRunID               string
	ChatMessageID           string
	RunItemID               string
	Title                   string
	Summary                 string
	Body                    string
	UpdatedAt               string
	FTSScore                float64
}

func (store *Store) SearchSemanticText(ctx context.Context, request SemanticSearchRequest) ([]SemanticRetrievalResult, error) {
	if err := validateSemanticSearchRequest(ctx, request); err != nil {
		return nil, err
	}
	limit := request.Limit
	query := semanticSearchFTSQuery(request.Query)
	recordsByKey := map[string]semanticSearchRecord{}
	if query != "" {
		records, err := store.querySemanticSearchFTS(ctx, request.WorkspaceID, query, limit)
		if err != nil {
			return nil, err
		}
		mergeSemanticSearchRecords(recordsByKey, records)
	}
	pathRecords, err := store.querySemanticSearchExactPaths(ctx, request.WorkspaceID, request.ExactPaths, limit)
	if err != nil {
		return nil, err
	}
	mergeSemanticSearchRecords(recordsByKey, pathRecords)
	textRecords, err := store.querySemanticSearchExactTexts(ctx, request.WorkspaceID, request.ExactTexts, limit)
	if err != nil {
		return nil, err
	}
	mergeSemanticSearchRecords(recordsByKey, textRecords)

	results := make([]SemanticRetrievalResult, 0, len(recordsByKey))
	for _, record := range recordsByKey {
		results = append(results, semanticRetrievalResultFromSearchRecord(record, semanticRetrievalSourceForSearchRecord(request, record)))
	}
	sortSemanticSearchResults(results)
	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

func validateSemanticSearchRequest(ctx context.Context, request SemanticSearchRequest) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if err := validateStoreIDs("workspace id", request.WorkspaceID); err != nil {
		return err
	}
	if request.Limit <= 0 {
		return fmt.Errorf("semantic search limit must be positive: %d", request.Limit)
	}
	return nil
}

func mergeSemanticSearchRecords(recordsByKey map[string]semanticSearchRecord, records []semanticSearchRecord) {
	for _, record := range records {
		key := semanticSearchRecordKey(record)
		if existing, ok := recordsByKey[key]; ok && compareSemanticSearchRecords(existing, record) <= 0 {
			continue
		}
		recordsByKey[key] = record
	}
}

func semanticSearchRecordKey(record semanticSearchRecord) string {
	return record.RecordKind + ":" + record.RecordID
}

func compareSemanticSearchRecords(left semanticSearchRecord, right semanticSearchRecord) int {
	if left.FTSScore != right.FTSScore {
		if left.FTSScore < right.FTSScore {
			return -1
		}
		return 1
	}
	if left.UpdatedAt != right.UpdatedAt {
		if left.UpdatedAt > right.UpdatedAt {
			return -1
		}
		return 1
	}
	if value := strings.Compare(left.RecordKind, right.RecordKind); value != 0 {
		return value
	}
	return strings.Compare(left.RecordID, right.RecordID)
}

func sortSemanticSearchResults(results []SemanticRetrievalResult) {
	for i := 1; i < len(results); i++ {
		for j := i; j > 0 && compareSemanticSearchResults(results[j], results[j-1]) < 0; j-- {
			results[j], results[j-1] = results[j-1], results[j]
		}
	}
}

func compareSemanticSearchResults(left SemanticRetrievalResult, right SemanticRetrievalResult) int {
	if left.Score != right.Score {
		if left.Score > right.Score {
			return -1
		}
		return 1
	}
	if left.UpdatedAt != right.UpdatedAt {
		if left.UpdatedAt > right.UpdatedAt {
			return -1
		}
		return 1
	}
	if value := strings.Compare(left.RecordKind, right.RecordKind); value != 0 {
		return value
	}
	return strings.Compare(left.RecordID, right.RecordID)
}

func semanticRetrievalSourceForSearchRecord(request SemanticSearchRequest, record semanticSearchRecord) string {
	for _, path := range request.ExactPaths {
		if path != "" && path == record.Path {
			return "exact_path"
		}
	}
	for _, text := range request.ExactTexts {
		if text != "" && semanticSearchRecordContainsExactText(record, text) {
			return "exact_text"
		}
	}
	return "fts"
}

func semanticSearchRecordContainsExactText(record semanticSearchRecord, text string) bool {
	return strings.Contains(record.Title, text) ||
		strings.Contains(record.Summary, text) ||
		strings.Contains(record.Body, text)
}

func semanticRetrievalResultFromSearchRecord(record semanticSearchRecord, source string) SemanticRetrievalResult {
	reason := source
	if source == "fts" {
		reason = "FTS match"
	}
	if source == "exact_path" {
		reason = "exact path match"
	}
	if source == "exact_text" {
		reason = "exact text match"
	}
	return SemanticRetrievalResult{
		ID:                  source + ":" + record.RecordKind + ":" + record.RecordID,
		Source:              source,
		RecordKind:          record.RecordKind,
		RecordID:            record.RecordID,
		SemanticNodeID:      record.SemanticNodeID,
		EvidenceAnchorID:    record.EvidenceAnchorID,
		ActivityIntervalID:  record.ActivityIntervalID,
		SteeringDirectiveID: record.SteeringDirectiveID,
		ContextPackID:       record.ContextPackID,
		ContextPackItemID:   record.ContextPackItemID,
		ItemKind:            record.ItemKind,
		SourceKind:          record.SourceKind,
		SourceID:            record.SourceID,
		URI:                 record.URI,
		Path:                record.Path,
		SourceRefs: SemanticContextSourceRefs{
			WorkflowDefinitionID:    record.WorkflowDefinitionID,
			WorkflowExecutionID:     record.WorkflowExecutionID,
			WorkflowNodeID:          record.WorkflowNodeID,
			WorkflowNodeExecutionID: record.WorkflowNodeExecutionID,
			ChatConversationID:      record.ChatConversationID,
			ChatRunID:               record.ChatRunID,
			ChatMessageID:           record.ChatMessageID,
			RunItemID:               record.RunItemID,
		},
		Title:     record.Title,
		Summary:   record.Summary,
		Reasons:   []string{reason},
		Score:     semanticSearchResultScore(source, record.FTSScore),
		FTSScore:  record.FTSScore,
		UpdatedAt: record.UpdatedAt,
	}
}

func semanticSearchResultScore(source string, ftsScore float64) float64 {
	switch source {
	case "exact_path":
		return 800
	case "exact_text":
		return 700
	default:
		return 600 - ftsScore
	}
}

func (store *Store) querySemanticSearchFTS(ctx context.Context, workspaceID string, query string, limit int) ([]semanticSearchRecord, error) {
	rows, err := store.db.QueryContext(ctx, semanticSearchSelectSQL("bm25(semantic_search_fts)", `
WHERE workspace_id = ? AND semantic_search_fts MATCH ?
ORDER BY rank ASC, updated_at DESC, record_kind ASC, record_id ASC
LIMIT ?
`), workspaceID, query, limit)
	if err != nil {
		return nil, store.persistenceError("query semantic search FTS", err)
	}
	defer rows.Close()
	return scanSemanticSearchRows(store, rows)
}

func (store *Store) querySemanticSearchExactPaths(ctx context.Context, workspaceID string, paths []string, limit int) ([]semanticSearchRecord, error) {
	paths = compactUniqueStrings(paths)
	if len(paths) == 0 {
		return []semanticSearchRecord{}, nil
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(paths)), ",")
	args := []any{workspaceID}
	for _, path := range paths {
		args = append(args, path)
	}
	args = append(args, limit)
	rows, err := store.db.QueryContext(ctx, semanticSearchSelectSQL("0.0", fmt.Sprintf(`
WHERE workspace_id = ? AND path IN (%s)
ORDER BY updated_at DESC, record_kind ASC, record_id ASC
LIMIT ?
`, placeholders)), args...)
	if err != nil {
		return nil, store.persistenceError("query semantic search exact paths", err)
	}
	defer rows.Close()
	return scanSemanticSearchRows(store, rows)
}

func (store *Store) querySemanticSearchExactTexts(ctx context.Context, workspaceID string, texts []string, limit int) ([]semanticSearchRecord, error) {
	texts = compactUniqueStrings(texts)
	if len(texts) == 0 {
		return []semanticSearchRecord{}, nil
	}
	records := []semanticSearchRecord{}
	for _, text := range texts {
		rows, err := store.db.QueryContext(ctx, semanticSearchSelectSQL("0.0", `
WHERE workspace_id = ? AND (instr(title, ?) > 0 OR instr(summary, ?) > 0 OR instr(body, ?) > 0)
ORDER BY updated_at DESC, record_kind ASC, record_id ASC
LIMIT ?
`), workspaceID, text, text, text, limit)
		if err != nil {
			return nil, store.persistenceError("query semantic search exact text", err)
		}
		next, err := scanSemanticSearchRows(store, rows)
		closeErr := rows.Close()
		if err != nil {
			return nil, err
		}
		if closeErr != nil {
			return nil, store.persistenceError("query semantic search exact text", closeErr)
		}
		records = append(records, next...)
	}
	return records, nil
}

func semanticSearchSelectSQL(scoreExpression string, suffix string) string {
	return `
SELECT workspace_id, record_kind, record_id, semantic_node_id,
       evidence_anchor_id, activity_interval_id, steering_directive_id,
       context_pack_id, context_pack_item_id, item_kind, source_kind,
       source_id, uri, path, workflow_definition_id, workflow_execution_id,
       workflow_node_id, workflow_node_execution_id, chat_conversation_id,
       chat_run_id, chat_message_id, run_item_id, title, summary, body,
       updated_at, ` + scoreExpression + ` AS rank
FROM semantic_search_fts
` + suffix
}

func scanSemanticSearchRows(store *Store, rows *sql.Rows) ([]semanticSearchRecord, error) {
	records := []semanticSearchRecord{}
	for rows.Next() {
		record, err := scanSemanticSearchRecord(rows)
		if err != nil {
			return nil, store.corruptError("semantic_search_fts", err)
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, store.persistenceError("read semantic search rows", err)
	}
	return records, nil
}

func scanSemanticSearchRecord(scanner interface{ Scan(dest ...any) error }) (semanticSearchRecord, error) {
	var record semanticSearchRecord
	if err := scanner.Scan(
		&record.WorkspaceID,
		&record.RecordKind,
		&record.RecordID,
		&record.SemanticNodeID,
		&record.EvidenceAnchorID,
		&record.ActivityIntervalID,
		&record.SteeringDirectiveID,
		&record.ContextPackID,
		&record.ContextPackItemID,
		&record.ItemKind,
		&record.SourceKind,
		&record.SourceID,
		&record.URI,
		&record.Path,
		&record.WorkflowDefinitionID,
		&record.WorkflowExecutionID,
		&record.WorkflowNodeID,
		&record.WorkflowNodeExecutionID,
		&record.ChatConversationID,
		&record.ChatRunID,
		&record.ChatMessageID,
		&record.RunItemID,
		&record.Title,
		&record.Summary,
		&record.Body,
		&record.UpdatedAt,
		&record.FTSScore,
	); err != nil {
		return semanticSearchRecord{}, err
	}
	return record, nil
}

func (store *Store) RebuildSearchIndex(ctx context.Context) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	store.mu.Lock()
	defer store.mu.Unlock()

	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return store.persistenceError("begin semantic search rebuild", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := rebuildSemanticSearchIndex(ctx, tx); err != nil {
		return store.persistenceError("rebuild semantic search index", err)
	}
	if err := tx.Commit(); err != nil {
		return store.persistenceError("commit semantic search rebuild", err)
	}
	committed = true
	return nil
}

func rebuildSemanticSearchIndex(ctx context.Context, tx *sql.Tx) error {
	if err := clearSemanticSearchIndex(ctx, tx); err != nil {
		return err
	}
	if err := rebuildSemanticNodeSearchRows(ctx, tx); err != nil {
		return err
	}
	if err := rebuildSemanticEvidenceSearchRows(ctx, tx); err != nil {
		return err
	}
	if err := rebuildSemanticActivitySearchRows(ctx, tx); err != nil {
		return err
	}
	return rebuildSemanticContextPackSearchRows(ctx, tx)
}

func clearSemanticSearchIndex(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, "DELETE FROM semantic_search_fts")
	return err
}

func rebuildSemanticNodeSearchRows(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
SELECT workspace_id, id, kind, label, summary, why_it_exists, future_use,
       dismissed, promoted,
       split_from_node_id, split_into_node_ids_json, merged_into_node_id,
       created_by_event_id, updated_by_event_id, created_at, updated_at
FROM semantic_nodes_current
ORDER BY workspace_id ASC, id ASC
`)
	if err != nil {
		return fmt.Errorf("load semantic nodes for search rebuild: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		node, err := scanSemanticNode(rows)
		if err != nil {
			return fmt.Errorf("scan semantic node for search rebuild: %w", err)
		}
		if err := upsertSemanticNodeSearchRow(ctx, tx, node); err != nil {
			return err
		}
	}
	return rows.Err()
}

func rebuildSemanticEvidenceSearchRows(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
SELECT workspace_id, id, target_entity_id, source_kind, source_id, uri, path,
       range_start, range_end, text, summary, content_hash,
       workflow_definition_id, workflow_execution_id, workflow_node_id,
       workflow_node_execution_id, chat_conversation_id, chat_run_id,
       chat_message_id, run_item_id, reassigned_from_anchor_id,
       created_by_event_id, created_at
FROM semantic_evidence_anchors
ORDER BY workspace_id ASC, id ASC
`)
	if err != nil {
		return fmt.Errorf("load semantic evidence for search rebuild: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		anchor, err := scanSemanticEvidenceAnchor(rows)
		if err != nil {
			return fmt.Errorf("scan semantic evidence for search rebuild: %w", err)
		}
		if err := upsertSemanticEvidenceSearchRow(ctx, tx, anchor); err != nil {
			return err
		}
	}
	return rows.Err()
}

func rebuildSemanticActivitySearchRows(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `
SELECT workspace_id, id, target_entity_id, kind, summary, source_kind, source_id,
       evidence_anchor_id, workflow_definition_id, workflow_execution_id,
       workflow_node_id, workflow_node_execution_id, chat_conversation_id,
       chat_run_id, chat_message_id, run_item_id, reassigned_from_interval_id,
       actor_kind, actor_id,
       started_by_event_id, ended_by_event_id, started_at, ended_at, updated_at
FROM semantic_activity_intervals
ORDER BY workspace_id ASC, id ASC
`)
	if err != nil {
		return fmt.Errorf("load semantic activity for search rebuild: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		interval, err := scanSemanticActivityInterval(rows)
		if err != nil {
			return fmt.Errorf("scan semantic activity for search rebuild: %w", err)
		}
		if err := upsertSemanticActivitySearchRow(ctx, tx, interval); err != nil {
			return err
		}
	}
	return rows.Err()
}

func rebuildSemanticContextPackSearchRows(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, semanticContextPackSelectSQL+`
ORDER BY workspace_id ASC, id ASC
`)
	if err != nil {
		return fmt.Errorf("load semantic context packs for search rebuild: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		record, err := scanSemanticContextPackRecord(rows)
		if err != nil {
			return fmt.Errorf("scan semantic context pack for search rebuild: %w", err)
		}
		if err := upsertSemanticContextPackSearchRows(ctx, tx, record); err != nil {
			return err
		}
	}
	return rows.Err()
}

func upsertSemanticNodeSearchRow(ctx context.Context, tx *sql.Tx, node SemanticNode) error {
	if err := deleteSemanticSearchRecord(ctx, tx, node.WorkspaceID, semanticSearchRecordNode, node.ID); err != nil {
		return err
	}
	if nodeExcludedFromContext(node) {
		return nil
	}
	return insertSemanticSearchRecord(ctx, tx, semanticSearchRecordFromNode(node))
}

func upsertSemanticEvidenceSearchRow(ctx context.Context, tx *sql.Tx, anchor SemanticEvidenceAnchor) error {
	if err := deleteSemanticSearchRecord(ctx, tx, anchor.WorkspaceID, semanticSearchRecordEvidence, anchor.ID); err != nil {
		return err
	}
	return insertSemanticSearchRecord(ctx, tx, semanticSearchRecordFromEvidence(anchor))
}

func upsertSemanticActivitySearchRow(ctx context.Context, tx *sql.Tx, interval SemanticActivityInterval) error {
	if err := deleteSemanticSearchRecord(ctx, tx, interval.WorkspaceID, semanticSearchRecordActivity, interval.ID); err != nil {
		return err
	}
	return insertSemanticSearchRecord(ctx, tx, semanticSearchRecordFromActivity(interval))
}

func upsertSemanticContextPackSearchRows(ctx context.Context, tx *sql.Tx, record SemanticContextPackRecord) error {
	if err := deleteSemanticSearchRecordsForContextPack(ctx, tx, record.WorkspaceID, record.ID); err != nil {
		return err
	}
	for _, item := range record.Items {
		if err := insertSemanticSearchRecord(ctx, tx, semanticSearchRecordFromContextPackItem(record, item)); err != nil {
			return err
		}
	}
	return nil
}

func deleteSemanticSearchRecord(ctx context.Context, tx *sql.Tx, workspaceID string, recordKind string, recordID string) error {
	_, err := tx.ExecContext(ctx, `
DELETE FROM semantic_search_fts
WHERE workspace_id = ? AND record_kind = ? AND record_id = ?
`, workspaceID, recordKind, recordID)
	if err != nil {
		return fmt.Errorf("delete semantic search record: %w", err)
	}
	return nil
}

func deleteSemanticSearchRecordsForContextPack(ctx context.Context, tx *sql.Tx, workspaceID string, packID string) error {
	_, err := tx.ExecContext(ctx, `
DELETE FROM semantic_search_fts
WHERE workspace_id = ? AND record_kind = ? AND context_pack_id = ?
`, workspaceID, semanticSearchRecordContextPackItem, packID)
	if err != nil {
		return fmt.Errorf("delete semantic context pack search records: %w", err)
	}
	return nil
}

func insertSemanticSearchRecord(ctx context.Context, tx *sql.Tx, record semanticSearchRecord) error {
	record.Title = boundedText(record.Title, semanticSearchIndexedTextLimit).text
	record.Summary = boundedText(record.Summary, semanticSearchIndexedTextLimit).text
	record.Body = boundedText(record.Body, semanticSearchIndexedTextLimit).text
	_, err := tx.ExecContext(ctx, `
INSERT INTO semantic_search_fts (
  workspace_id, record_kind, record_id, semantic_node_id,
  evidence_anchor_id, activity_interval_id, steering_directive_id,
  context_pack_id, context_pack_item_id, item_kind, source_kind, source_id,
  uri, path, workflow_definition_id, workflow_execution_id,
  workflow_node_id, workflow_node_execution_id, chat_conversation_id,
  chat_run_id, chat_message_id, run_item_id, title, summary, body, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		record.WorkspaceID,
		record.RecordKind,
		record.RecordID,
		record.SemanticNodeID,
		record.EvidenceAnchorID,
		record.ActivityIntervalID,
		record.SteeringDirectiveID,
		record.ContextPackID,
		record.ContextPackItemID,
		record.ItemKind,
		record.SourceKind,
		record.SourceID,
		record.URI,
		record.Path,
		record.WorkflowDefinitionID,
		record.WorkflowExecutionID,
		record.WorkflowNodeID,
		record.WorkflowNodeExecutionID,
		record.ChatConversationID,
		record.ChatRunID,
		record.ChatMessageID,
		record.RunItemID,
		record.Title,
		record.Summary,
		record.Body,
		record.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert semantic search record: %w", err)
	}
	return nil
}

func semanticSearchRecordFromNode(node SemanticNode) semanticSearchRecord {
	body := []string{string(node.Kind), node.WhyItExists, node.FutureUse}
	if node.Promoted {
		body = append(body, "promoted")
	}
	return semanticSearchRecord{
		WorkspaceID:    node.WorkspaceID,
		RecordKind:     semanticSearchRecordNode,
		RecordID:       node.ID,
		SemanticNodeID: node.ID,
		ItemKind:       contextItemKindForNode(node.Kind),
		Title:          node.Label,
		Summary:        node.Summary,
		Body:           strings.Join(body, " "),
		UpdatedAt:      node.UpdatedAt,
	}
}

func semanticSearchRecordFromEvidence(anchor SemanticEvidenceAnchor) semanticSearchRecord {
	return semanticSearchRecord{
		WorkspaceID:             anchor.WorkspaceID,
		RecordKind:              semanticSearchRecordEvidence,
		RecordID:                anchor.ID,
		SemanticNodeID:          anchor.TargetEntityID,
		EvidenceAnchorID:        anchor.ID,
		ItemKind:                contextEvidenceItemKind(anchor),
		SourceKind:              string(anchor.SourceKind),
		SourceID:                anchor.SourceID,
		URI:                     anchor.URI,
		Path:                    anchor.Path,
		WorkflowDefinitionID:    anchor.WorkflowDefinitionID,
		WorkflowExecutionID:     anchor.WorkflowExecutionID,
		WorkflowNodeID:          anchor.WorkflowNodeID,
		WorkflowNodeExecutionID: anchor.WorkflowNodeExecutionID,
		ChatConversationID:      anchor.ChatConversationID,
		ChatRunID:               anchor.ChatRunID,
		ChatMessageID:           anchor.ChatMessageID,
		RunItemID:               anchor.RunItemID,
		Title:                   evidenceTitle(anchor),
		Summary:                 anchor.Summary,
		Body:                    strings.Join(compactUniqueStrings([]string{anchor.Text, anchor.ContentHash}), " "),
		UpdatedAt:               anchor.CreatedAt,
	}
}

func semanticSearchRecordFromActivity(interval SemanticActivityInterval) semanticSearchRecord {
	body := []string{string(interval.Kind), string(interval.SourceKind), interval.SourceID}
	if interval.EndedAt == "" {
		body = append(body, "active")
	} else {
		body = append(body, "completed")
	}
	return semanticSearchRecord{
		WorkspaceID:             interval.WorkspaceID,
		RecordKind:              semanticSearchRecordActivity,
		RecordID:                interval.ID,
		SemanticNodeID:          interval.TargetEntityID,
		ActivityIntervalID:      interval.ID,
		ItemKind:                ContextPackItemActivity,
		SourceKind:              string(interval.SourceKind),
		SourceID:                interval.SourceID,
		WorkflowDefinitionID:    interval.WorkflowDefinitionID,
		WorkflowExecutionID:     interval.WorkflowExecutionID,
		WorkflowNodeID:          interval.WorkflowNodeID,
		WorkflowNodeExecutionID: interval.WorkflowNodeExecutionID,
		ChatConversationID:      interval.ChatConversationID,
		ChatRunID:               interval.ChatRunID,
		ChatMessageID:           interval.ChatMessageID,
		RunItemID:               interval.RunItemID,
		Title:                   string(interval.Kind) + " activity",
		Summary:                 interval.Summary,
		Body:                    strings.Join(compactUniqueStrings(body), " "),
		UpdatedAt:               interval.UpdatedAt,
	}
}

func semanticSearchRecordFromContextPackItem(record SemanticContextPackRecord, item SemanticContextPackItem) semanticSearchRecord {
	recordID := item.ItemID
	if recordID == "" {
		recordID = record.ID + ":" + item.Title
	}
	return semanticSearchRecord{
		WorkspaceID:             record.WorkspaceID,
		RecordKind:              semanticSearchRecordContextPackItem,
		RecordID:                recordID,
		SemanticNodeID:          item.SemanticNodeID,
		EvidenceAnchorID:        item.EvidenceAnchorID,
		ActivityIntervalID:      item.ActivityIntervalID,
		SteeringDirectiveID:     item.SteeringDirectiveID,
		ContextPackID:           record.ID,
		ContextPackItemID:       item.ItemID,
		ItemKind:                item.Kind,
		WorkflowDefinitionID:    firstNonEmpty(item.SourceRefs.WorkflowDefinitionID, record.SourceRefs.WorkflowDefinitionID),
		WorkflowExecutionID:     firstNonEmpty(item.SourceRefs.WorkflowExecutionID, record.SourceRefs.WorkflowExecutionID),
		WorkflowNodeID:          firstNonEmpty(item.SourceRefs.WorkflowNodeID, record.SourceRefs.WorkflowNodeID),
		WorkflowNodeExecutionID: firstNonEmpty(item.SourceRefs.WorkflowNodeExecutionID, record.SourceRefs.WorkflowNodeExecutionID),
		ChatConversationID:      firstNonEmpty(item.SourceRefs.ChatConversationID, record.SourceRefs.ChatConversationID),
		ChatRunID:               firstNonEmpty(item.SourceRefs.ChatRunID, record.SourceRefs.ChatRunID),
		ChatMessageID:           firstNonEmpty(item.SourceRefs.ChatMessageID, record.SourceRefs.ChatMessageID),
		RunItemID:               firstNonEmpty(item.SourceRefs.RunItemID, record.SourceRefs.RunItemID),
		Title:                   item.Title,
		Summary:                 item.Summary,
		Body:                    item.ReasonIncluded,
		UpdatedAt:               firstNonEmpty(item.UpdatedAt, record.CreatedAt),
	}
}

func semanticSearchFTSQuery(text string) string {
	tokens := semanticSearchTokens(text, 12)
	if len(tokens) == 0 {
		return ""
	}
	quoted := make([]string, 0, len(tokens))
	for _, token := range tokens {
		quoted = append(quoted, `"`+strings.ReplaceAll(token, `"`, `""`)+`"`)
	}
	return strings.Join(quoted, " OR ")
}

func semanticSearchTokens(text string, limit int) []string {
	state := semanticSearchTokenState{seen: map[string]bool{}}
	for _, value := range text {
		if semanticSearchTokenRune(value) {
			state.builder.WriteRune(value)
			continue
		}
		if state.flush(limit) {
			return state.tokens
		}
	}
	state.flush(limit)
	return state.tokens
}

type semanticSearchTokenState struct {
	builder strings.Builder
	seen    map[string]bool
	tokens  []string
}

func semanticSearchTokenRune(value rune) bool {
	return unicode.IsLetter(value) || unicode.IsDigit(value) || value == '_'
}

func (state *semanticSearchTokenState) flush(limit int) bool {
	if state.builder.Len() == 0 {
		return false
	}
	token := strings.ToLower(state.builder.String())
	state.builder.Reset()
	if len(token) >= 2 && !state.seen[token] {
		state.seen[token] = true
		state.tokens = append(state.tokens, token)
	}
	return limit > 0 && len(state.tokens) >= limit
}

func compactUniqueStrings(values []string) []string {
	seen := map[string]bool{}
	result := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}
