package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"setta/internal/conversationindex"
)

const topicIndexTimestampSortLayout = "2006-01-02T15:04:05.000000000"

var _ conversationindex.CandidateStore = (*Store)(nil)

type topicIndexDocument struct {
	conversation         TopicConversation
	recentUserRequests   []string
	recentFinalSummaries []string
	updatedAt            string
	updatedSortKey       string
}

func (store *Store) ReconcileTopicIndex(ctx context.Context) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("conversation index reconciliation context is required")
	}
	return store.write(ctx, "reconcile conversation index", func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, "DELETE FROM topic_index_search"); err != nil {
			return fmt.Errorf("clear conversation full-text index: %w", err)
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM topic_index_documents"); err != nil {
			return fmt.Errorf("clear conversation topic cards: %w", err)
		}
		conversationIDs, err := readTopicIndexConversationIDs(ctx, tx)
		if err != nil {
			return err
		}
		for _, conversationID := range conversationIDs {
			if err := rebuildTopicIndexDocument(ctx, tx, conversationID); err != nil {
				return &CorruptStateError{Path: store.dbPath, Err: err}
			}
		}
		return nil
	})
}

func rebuildTopicIndexDocument(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
) error {
	document, err := materializeTopicIndexDocument(ctx, tx, conversationID)
	if err != nil {
		return err
	}
	requestsJSON, err := json.Marshal(document.recentUserRequests)
	if err != nil {
		return fmt.Errorf("encode topic card user requests for %s: %w", conversationID, err)
	}
	summariesJSON, err := json.Marshal(document.recentFinalSummaries)
	if err != nil {
		return fmt.Errorf("encode topic card final summaries for %s: %w", conversationID, err)
	}
	resourceScope := conversationindex.ResourceScopeForWorkspaceID(document.conversation.WorkspaceID)
	resourceScopeKind, folderWorkspaceID := topicIndexResourceScopeValues(resourceScope)
	_, err = tx.ExecContext(ctx, `
INSERT INTO topic_index_documents (
  conversation_id, resource_scope_kind, folder_workspace_id, title, topic_descriptor,
  recent_user_requests_json, recent_final_summaries_json,
  updated_at, updated_sort_key
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(conversation_id) DO UPDATE SET
  resource_scope_kind = excluded.resource_scope_kind,
  folder_workspace_id = excluded.folder_workspace_id,
  title = excluded.title,
  topic_descriptor = excluded.topic_descriptor,
  recent_user_requests_json = excluded.recent_user_requests_json,
  recent_final_summaries_json = excluded.recent_final_summaries_json,
  updated_at = excluded.updated_at,
  updated_sort_key = excluded.updated_sort_key
`,
		document.conversation.ID,
		resourceScopeKind,
		nullableString(folderWorkspaceID),
		document.conversation.Title,
		document.conversation.TopicDescriptor,
		string(requestsJSON),
		string(summariesJSON),
		document.updatedAt,
		document.updatedSortKey,
	)
	if err != nil {
		return fmt.Errorf("persist topic card %s: %w", conversationID, err)
	}
	return replaceTopicIndexSearch(ctx, tx, document)
}

func materializeTopicIndexDocument(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
) (topicIndexDocument, error) {
	conversation, err := readTopicIndexConversation(ctx, tx, conversationID)
	if err != nil {
		return topicIndexDocument{}, err
	}
	recentUserRequests, err := readTopicIndexRecentUserRequests(ctx, tx, conversationID)
	if err != nil {
		return topicIndexDocument{}, err
	}
	recentFinalSummaries, err := readTopicIndexRecentFinalSummaries(ctx, tx, conversationID)
	if err != nil {
		return topicIndexDocument{}, err
	}
	updatedAt, err := readTopicIndexUpdatedAt(ctx, tx, conversation)
	if err != nil {
		return topicIndexDocument{}, err
	}
	updatedSortKey, err := topicIndexTimestampSortKey(updatedAt)
	if err != nil {
		return topicIndexDocument{}, err
	}
	return topicIndexDocument{
		conversation:         conversation,
		recentUserRequests:   recentUserRequests,
		recentFinalSummaries: recentFinalSummaries,
		updatedAt:            updatedAt,
		updatedSortKey:       updatedSortKey,
	}, nil
}

func readTopicIndexConversationIDs(ctx context.Context, tx *sql.Tx) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `
SELECT id
FROM conversations
ORDER BY id ASC
`)
	if err != nil {
		return nil, fmt.Errorf("list conversations for topic index: %w", err)
	}
	defer rows.Close()
	conversationIDs := make([]string, 0)
	for rows.Next() {
		var conversationID string
		if err := rows.Scan(&conversationID); err != nil {
			return nil, fmt.Errorf("decode conversation id for topic index: %w", err)
		}
		conversationIDs = append(conversationIDs, conversationID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list conversations for topic index: %w", err)
	}
	return conversationIDs, nil
}

func readTopicIndexConversation(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
) (TopicConversation, error) {
	conversation, err := scanTopicConversation(tx.QueryRowContext(ctx, `
SELECT id, workspace_id, title, topic_descriptor, status, created_at, updated_at,
       archived_at, last_trajectory_sequence
FROM conversations
WHERE id = ?
`, conversationID))
	if errors.Is(err, sql.ErrNoRows) {
		return TopicConversation{}, stateConflict("topic card", conversationID, "conversation does not exist")
	}
	if err != nil {
		return TopicConversation{}, fmt.Errorf("read conversation for topic card %s: %w", conversationID, err)
	}
	if err := conversation.Validate(); err != nil {
		return TopicConversation{}, fmt.Errorf("validate conversation for topic card %s: %w", conversationID, err)
	}
	return conversation, nil
}

func readTopicIndexRecentUserRequests(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `
WITH user_requests AS (
  SELECT input_text AS request_text, accepted_at AS occurred_at,
         0 AS source_rank, sequence AS source_sequence, id AS source_id
  FROM conversation_inputs
  WHERE conversation_id = ?
  UNION ALL
  SELECT json_extract(turn.authored_input_json, '$.text') AS request_text,
         turn.accepted_at AS occurred_at,
         1 AS source_rank, 0 AS source_sequence, turn.id AS source_id
  FROM conversation_turns AS turn
  WHERE turn.conversation_id = ?
    AND NOT EXISTS (
      SELECT 1
      FROM conversation_route_decisions AS decision
      WHERE decision.conversation_id = turn.conversation_id
        AND decision.resulting_command_key = ? || turn.id
    )
), normalized_requests AS (
  SELECT
    request_text,
    substr(occurred_at, 1, 19) || '.' ||
      substr(
        CASE
          WHEN instr(occurred_at, '.') = 20
            THEN substr(occurred_at, 21, length(occurred_at) - 21)
          ELSE ''
        END || '000000000',
        1,
        9
      ) AS occurred_sort_key,
    source_rank,
    source_sequence,
    source_id
  FROM user_requests
)
SELECT request_text
FROM normalized_requests
ORDER BY occurred_sort_key DESC, source_rank ASC, source_sequence DESC, source_id ASC
LIMIT ?
`, conversationID, conversationID, conversationRouteTurnCommandKeyPrefix, conversationindex.MaxRecentUserRequests)
	if err != nil {
		return nil, fmt.Errorf("read recent user requests for topic card %s: %w", conversationID, err)
	}
	return scanTopicIndexTextValues(rows, "recent user request", conversationID)
}

func readTopicIndexRecentFinalSummaries(
	ctx context.Context,
	tx *sql.Tx,
	conversationID string,
) ([]string, error) {
	rows, err := tx.QueryContext(ctx, `
SELECT json_extract(payload_json, '$.text')
FROM narration_events
WHERE conversation_id = ? AND kind = 'final_summary'
ORDER BY stream_sequence DESC
LIMIT ?
`, conversationID, conversationindex.MaxRecentFinalSummaries)
	if err != nil {
		return nil, fmt.Errorf("read recent final summaries for topic card %s: %w", conversationID, err)
	}
	return scanTopicIndexTextValues(rows, "recent final summary", conversationID)
}

func scanTopicIndexTextValues(
	rows *sql.Rows,
	label string,
	conversationID string,
) ([]string, error) {
	defer rows.Close()
	values := make([]string, 0)
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			return nil, fmt.Errorf("decode topic card %s for %s: %w", label, conversationID, err)
		}
		if strings.TrimSpace(value) == "" {
			return nil, fmt.Errorf("topic card %s for %s is empty", label, conversationID)
		}
		values = append(values, value)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read topic card %s for %s: %w", label, conversationID, err)
	}
	return values, nil
}

func readTopicIndexUpdatedAt(
	ctx context.Context,
	tx *sql.Tx,
	conversation TopicConversation,
) (string, error) {
	timestamps := []string{conversation.UpdatedAt}
	for _, query := range []string{
		`SELECT accepted_at FROM conversation_inputs WHERE conversation_id = ? ORDER BY sequence DESC LIMIT 1`,
		`SELECT created_at FROM narration_events WHERE conversation_id = ? ORDER BY stream_sequence DESC LIMIT 1`,
	} {
		var timestamp string
		err := tx.QueryRowContext(ctx, query, conversation.ID).Scan(&timestamp)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return "", fmt.Errorf("read topic card activity time for %s: %w", conversation.ID, err)
		}
		timestamps = append(timestamps, timestamp)
	}
	latest := timestamps[0]
	latestTime, err := validateTimestamp("topic card updatedAt", latest)
	if err != nil {
		return "", err
	}
	for _, candidate := range timestamps[1:] {
		candidateTime, err := validateTimestamp("topic card activity time", candidate)
		if err != nil {
			return "", err
		}
		if candidateTime.After(latestTime) {
			latest = candidate
			latestTime = candidateTime
		}
	}
	return latest, nil
}

func topicIndexTimestampSortKey(timestamp string) (string, error) {
	parsed, err := validateTimestamp("topic card updatedAt", timestamp)
	if err != nil {
		return "", err
	}
	return parsed.UTC().Format(topicIndexTimestampSortLayout), nil
}

func replaceTopicIndexSearch(
	ctx context.Context,
	tx *sql.Tx,
	document topicIndexDocument,
) error {
	if _, err := tx.ExecContext(
		ctx,
		"DELETE FROM topic_index_search WHERE conversation_id = ?",
		document.conversation.ID,
	); err != nil {
		return fmt.Errorf("remove full-text topic card %s: %w", document.conversation.ID, err)
	}
	resourceScope := conversationindex.ResourceScopeForWorkspaceID(document.conversation.WorkspaceID)
	resourceScopeKind, folderWorkspaceID := topicIndexResourceScopeValues(resourceScope)
	_, err := tx.ExecContext(ctx, `
INSERT INTO topic_index_search (
  conversation_id, resource_scope_kind, folder_workspace_id, title, topic_descriptor,
  recent_user_requests, recent_final_summaries
) VALUES (?, ?, ?, ?, ?, ?, ?)
`,
		document.conversation.ID,
		resourceScopeKind,
		nullableString(folderWorkspaceID),
		document.conversation.Title,
		document.conversation.TopicDescriptor,
		strings.Join(document.recentUserRequests, "\n"),
		strings.Join(document.recentFinalSummaries, "\n"),
	)
	if err != nil {
		return fmt.Errorf("persist full-text topic card %s: %w", document.conversation.ID, err)
	}
	return nil
}

func (store *Store) RetrieveTopicCandidates(
	ctx context.Context,
	request conversationindex.CandidateRequest,
) ([]conversationindex.StoredCandidate, error) {
	if store == nil {
		return nil, errors.New("conversation store is required")
	}
	if ctx == nil {
		return nil, errors.New("conversation index retrieval context is required")
	}
	normalized, err := conversationindex.NormalizeCandidateRequest(request)
	if err != nil {
		return nil, err
	}
	terms := conversationindex.SearchTerms(normalized.Query)
	if normalized.Query != "" && len(terms) == 0 {
		return []conversationindex.StoredCandidate{}, nil
	}
	var candidates []conversationindex.StoredCandidate
	err = store.read(ctx, "retrieve conversation index candidates", func(ctx context.Context, connection *sql.Conn) error {
		var readErr error
		candidates, readErr = readTopicIndexCandidateSnapshot(
			ctx,
			connection,
			store.dbPath,
			normalized,
			terms,
		)
		return readErr
	})
	if err != nil {
		return nil, err
	}
	return cloneTopicIndexCandidates(candidates), nil
}

func readTopicIndexCandidateSnapshot(
	ctx context.Context,
	connection *sql.Conn,
	dbPath string,
	request conversationindex.CandidateRequest,
	terms []string,
) ([]conversationindex.StoredCandidate, error) {
	reader, err := connection.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = reader.Rollback() }()
	query, arguments := topicIndexCandidateQuery(request, terms)
	rows, err := reader.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, err
	}
	candidates, err := scanTopicIndexCandidates(rows, dbPath)
	if err != nil {
		return nil, err
	}
	for index := range candidates {
		if err := readTopicIndexOpenPanes(ctx, reader, &candidates[index].Card); err != nil {
			return nil, err
		}
	}
	if err := conversationindex.ValidateStoredCandidates(candidates, request); err != nil {
		return nil, &CorruptStateError{Path: dbPath, Err: err}
	}
	if err := reader.Commit(); err != nil {
		return nil, err
	}
	return candidates, nil
}

func topicIndexCandidateQuery(
	request conversationindex.CandidateRequest,
	terms []string,
) (string, []any) {
	ranked := request.Query != ""
	lexicalRank := "NULL"
	join := ""
	conditions := []string{"conversation.archived_at IS NULL"}
	arguments := make([]any, 0, len(request.Scope.FolderResourceWorkspaceIDs)+3)
	if ranked {
		lexicalRank = "bm25(topic_index_search, 0.0, 0.0, 8.0, 4.0, 1.5, 1.5)"
		join = "JOIN topic_index_search ON topic_index_search.conversation_id = document.conversation_id"
		conditions = append(conditions, "topic_index_search MATCH ?")
		arguments = append(arguments, quotedTopicIndexTerms(terms))
	}
	scopeCondition, scopeArguments := topicIndexScopeFilterCondition(request.Scope)
	if scopeCondition != "" {
		conditions = append(conditions, scopeCondition)
		arguments = append(arguments, scopeArguments...)
	}
	if request.UpdatedSince != nil {
		sortKey, _ := topicIndexTimestampSortKey(*request.UpdatedSince)
		conditions = append(conditions, "document.updated_sort_key >= ?")
		arguments = append(arguments, sortKey)
	}
	order := "document.updated_sort_key DESC, document.conversation_id ASC"
	if ranked {
		order = "lexical_rank ASC, " + order
	}
	arguments = append(arguments, request.Limit)
	query := fmt.Sprintf(`
SELECT
  document.conversation_id,
  document.resource_scope_kind,
  document.folder_workspace_id,
  document.title,
  document.topic_descriptor,
  document.recent_user_requests_json,
  document.recent_final_summaries_json,
  document.updated_at,
  conversation.status,
  conversation.workspace_id,
  %s AS lexical_rank
FROM topic_index_documents AS document
JOIN conversations AS conversation ON conversation.id = document.conversation_id
%s
WHERE %s
ORDER BY %s
LIMIT ?
`, lexicalRank, join, strings.Join(conditions, "\n  AND "), order)
	return query, arguments
}

func topicIndexResourceScopeValues(scope conversationindex.ResourceScope) (string, *string) {
	if workspaceID, ok := scope.FolderWorkspaceID(); ok {
		return string(scope.Kind), &workspaceID
	}
	return string(scope.Kind), nil
}

func topicIndexScopeFilterCondition(filter conversationindex.CandidateScopeFilter) (string, []any) {
	if !filter.Constrained() {
		return "", nil
	}
	arguments := make([]any, 0, len(filter.FolderResourceWorkspaceIDs)+2)
	if filter.IncludeFolderless && len(filter.FolderResourceWorkspaceIDs) == 0 {
		return "document.resource_scope_kind = ?", []any{string(conversationindex.ResourceScopeKindFolderless)}
	}
	if !filter.IncludeFolderless {
		condition := "document.resource_scope_kind = ? AND document.folder_workspace_id IN (" +
			sqlPlaceholders(len(filter.FolderResourceWorkspaceIDs)) + ")"
		arguments = append(arguments, string(conversationindex.ResourceScopeKindFolder))
		for _, workspaceID := range filter.FolderResourceWorkspaceIDs {
			arguments = append(arguments, workspaceID)
		}
		return condition, arguments
	}
	condition := "(document.resource_scope_kind = ? OR (document.resource_scope_kind = ? AND document.folder_workspace_id IN (" +
		sqlPlaceholders(len(filter.FolderResourceWorkspaceIDs)) + ")))"
	arguments = append(arguments, string(conversationindex.ResourceScopeKindFolderless), string(conversationindex.ResourceScopeKindFolder))
	for _, workspaceID := range filter.FolderResourceWorkspaceIDs {
		arguments = append(arguments, workspaceID)
	}
	return condition, arguments
}

func scanTopicIndexResourceScope(
	kind string,
	folderWorkspaceID sql.NullString,
) conversationindex.ResourceScope {
	scopeKind := conversationindex.ResourceScopeKind(kind)
	switch scopeKind {
	case conversationindex.ResourceScopeKindFolderless:
		if folderWorkspaceID.Valid {
			return conversationindex.ResourceScope{
				Kind:   scopeKind,
				Folder: &conversationindex.FolderResourceScope{WorkspaceID: folderWorkspaceID.String},
			}
		}
		return conversationindex.FolderlessResourceScope()
	case conversationindex.ResourceScopeKindFolder:
		if folderWorkspaceID.Valid {
			return conversationindex.FolderResourceScopeForWorkspaceID(folderWorkspaceID.String)
		}
	}
	return conversationindex.ResourceScope{Kind: scopeKind}
}

func nullableStringPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func sqlPlaceholders(count int) string {
	return strings.TrimSuffix(strings.Repeat("?,", count), ",")
}

func quotedTopicIndexTerms(terms []string) string {
	quoted := make([]string, len(terms))
	for index, term := range terms {
		quoted[index] = `"` + strings.ReplaceAll(term, `"`, `""`) + `"`
	}
	return strings.Join(quoted, " OR ")
}

func scanTopicIndexCandidates(
	rows *sql.Rows,
	dbPath string,
) ([]conversationindex.StoredCandidate, error) {
	defer rows.Close()
	candidates := make([]conversationindex.StoredCandidate, 0)
	for rows.Next() {
		var candidate conversationindex.StoredCandidate
		var requestsJSON string
		var summariesJSON string
		var resourceScopeKind string
		var folderWorkspaceID sql.NullString
		var conversationWorkspaceID sql.NullString
		var lexicalRank sql.NullFloat64
		if err := rows.Scan(
			&candidate.Card.ConversationID,
			&resourceScopeKind,
			&folderWorkspaceID,
			&candidate.Card.Title,
			&candidate.Card.TopicDescriptor,
			&requestsJSON,
			&summariesJSON,
			&candidate.Card.UpdatedAt,
			&candidate.Card.ActiveStatus,
			&conversationWorkspaceID,
			&lexicalRank,
		); err != nil {
			return nil, err
		}
		candidate.Card.ResourceScope = scanTopicIndexResourceScope(resourceScopeKind, folderWorkspaceID)
		conversationScope := conversationindex.ResourceScopeForWorkspaceID(nullableStringPointer(conversationWorkspaceID))
		if !candidate.Card.ResourceScope.Equal(conversationScope) {
			return nil, &CorruptStateError{
				Path: dbPath,
				Err:  fmt.Errorf("topic card %s resource scope projection does not match its conversation", candidate.Card.ConversationID),
			}
		}
		if err := decodeTopicIndexExcerpts(requestsJSON, &candidate.Card.RecentUserRequests); err != nil {
			return nil, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("topic card %s user requests: %w", candidate.Card.ConversationID, err)}
		}
		if err := decodeTopicIndexExcerpts(summariesJSON, &candidate.Card.RecentFinalSummaries); err != nil {
			return nil, &CorruptStateError{Path: dbPath, Err: fmt.Errorf("topic card %s final summaries: %w", candidate.Card.ConversationID, err)}
		}
		candidate.Card.OpenPaneIDs = []string{}
		if lexicalRank.Valid {
			candidate.LexicalRank = &lexicalRank.Float64
		}
		candidates = append(candidates, candidate)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return candidates, nil
}

func decodeTopicIndexExcerpts(raw string, target *[]conversationindex.TextExcerpt) error {
	var values []string
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return err
	}
	if values == nil {
		return errors.New("stored text values must be an array")
	}
	excerpts := make([]conversationindex.TextExcerpt, len(values))
	for index, value := range values {
		excerpts[index] = conversationindex.NewTextExcerpt(value)
	}
	*target = excerpts
	return nil
}

func readTopicIndexOpenPanes(
	ctx context.Context,
	reader *sql.Tx,
	card *conversationindex.StoredTopicCard,
) error {
	if err := reader.QueryRowContext(ctx, `
SELECT COUNT(*)
FROM pane_bindings
WHERE conversation_id = ?
`, card.ConversationID).Scan(&card.OpenPaneCount); err != nil {
		return fmt.Errorf("count topic card pane bindings for %s: %w", card.ConversationID, err)
	}
	rows, err := reader.QueryContext(ctx, `
WITH pane_activity AS (
  SELECT pane_id, COALESCE(last_focused_at, updated_at) AS focused_at
  FROM pane_bindings
  WHERE conversation_id = ?
), normalized_pane_activity AS (
  SELECT
    pane_id,
    substr(focused_at, 1, 19) || '.' ||
      substr(
        CASE
          WHEN instr(focused_at, '.') = 20
            THEN substr(focused_at, 21, length(focused_at) - 21)
          ELSE ''
        END || '000000000',
        1,
        9
      ) AS focused_sort_key
  FROM pane_activity
)
SELECT pane_id
FROM normalized_pane_activity
ORDER BY focused_sort_key DESC, pane_id ASC
LIMIT ?
`, card.ConversationID, conversationindex.MaxOpenPaneIDs)
	if err != nil {
		return fmt.Errorf("read topic card pane bindings for %s: %w", card.ConversationID, err)
	}
	defer rows.Close()
	card.OpenPaneIDs = []string{}
	for rows.Next() {
		var paneID string
		if err := rows.Scan(&paneID); err != nil {
			return fmt.Errorf("decode topic card pane binding for %s: %w", card.ConversationID, err)
		}
		card.OpenPaneIDs = append(card.OpenPaneIDs, paneID)
	}
	return rows.Err()
}

func cloneTopicIndexCandidates(
	candidates []conversationindex.StoredCandidate,
) []conversationindex.StoredCandidate {
	cloned := make([]conversationindex.StoredCandidate, len(candidates))
	for index, candidate := range candidates {
		candidate.Card.RecentUserRequests = append([]conversationindex.TextExcerpt{}, candidate.Card.RecentUserRequests...)
		candidate.Card.RecentFinalSummaries = append([]conversationindex.TextExcerpt{}, candidate.Card.RecentFinalSummaries...)
		candidate.Card.OpenPaneIDs = append([]string{}, candidate.Card.OpenPaneIDs...)
		if candidate.LexicalRank != nil {
			rank := *candidate.LexicalRank
			candidate.LexicalRank = &rank
		}
		cloned[index] = candidate
	}
	return cloned
}
