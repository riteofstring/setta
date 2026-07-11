package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

type TopicIndexDocument struct {
	ConversationID  string `json:"conversationId"`
	WorkspaceID     string `json:"workspaceId"`
	Title           string `json:"title"`
	TopicDescriptor string `json:"topicDescriptor"`
	Keywords        string `json:"keywords"`
	UpdatedAt       string `json:"updatedAt"`
}

type TopicIndexMatch struct {
	Document TopicIndexDocument `json:"document"`
	Rank     float64            `json:"rank"`
}

type PaneBinding struct {
	PaneID         string  `json:"paneId"`
	WorkspaceID    string  `json:"workspaceId"`
	ConversationID string  `json:"conversationId"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
	LastFocusedAt  *string `json:"lastFocusedAt"`
}

func (document TopicIndexDocument) Validate() error {
	if err := validateIdentifier("topic index conversation id", document.ConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("topic index workspace id", document.WorkspaceID); err != nil {
		return err
	}
	if err := validateTrimmedText("topic index title", document.Title); err != nil {
		return err
	}
	if document.TopicDescriptor != "" && strings.TrimSpace(document.TopicDescriptor) != document.TopicDescriptor {
		return errors.New("topic descriptor must not have surrounding whitespace")
	}
	if document.Keywords != "" && strings.TrimSpace(document.Keywords) != document.Keywords {
		return errors.New("topic keywords must not have surrounding whitespace")
	}
	_, err := validateTimestamp("topic index updatedAt", document.UpdatedAt)
	return err
}

func (binding PaneBinding) Validate() error {
	if err := validateIdentifier("pane binding pane id", binding.PaneID); err != nil {
		return err
	}
	if err := validateIdentifier("pane binding workspace id", binding.WorkspaceID); err != nil {
		return err
	}
	if err := validateIdentifier("pane binding conversation id", binding.ConversationID); err != nil {
		return err
	}
	createdAt, err := validateTimestamp("pane binding createdAt", binding.CreatedAt)
	if err != nil {
		return err
	}
	updatedAt, err := validateTimestamp("pane binding updatedAt", binding.UpdatedAt)
	if err != nil {
		return err
	}
	if updatedAt.Before(createdAt) {
		return errors.New("pane binding updatedAt precedes createdAt")
	}
	if binding.LastFocusedAt != nil {
		focusedAt, err := validateTimestampPointer("pane binding lastFocusedAt", binding.LastFocusedAt)
		if err != nil {
			return err
		}
		if focusedAt.Before(createdAt) || focusedAt.After(updatedAt) {
			return errors.New("pane binding lastFocusedAt is outside its lifecycle")
		}
	}
	return nil
}

func (transaction *WriteTransaction) UpsertTopicIndexDocument(document TopicIndexDocument) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := document.Validate(); err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO topic_index_documents (
  conversation_id, workspace_id, title, topic_descriptor, keywords, updated_at
)
SELECT id, workspace_id, ?, ?, ?, ?
FROM conversations WHERE id = ? AND workspace_id = ?
ON CONFLICT(conversation_id) DO UPDATE SET
  workspace_id = excluded.workspace_id,
  title = excluded.title,
  topic_descriptor = excluded.topic_descriptor,
  keywords = excluded.keywords,
  updated_at = excluded.updated_at
`, document.Title, document.TopicDescriptor, document.Keywords, document.UpdatedAt, document.ConversationID, document.WorkspaceID)
	if err != nil {
		return fmt.Errorf("upsert topic index document %s: %w", document.ConversationID, err)
	}
	if err := requireOneRow(result, "topic index document", document.ConversationID, "conversation ownership did not match"); err != nil {
		return err
	}
	if _, err := transaction.tx.ExecContext(transaction.ctx, `DELETE FROM topic_index_search WHERE conversation_id = ?`, document.ConversationID); err != nil {
		return fmt.Errorf("delete prior topic search document %s: %w", document.ConversationID, err)
	}
	if _, err := transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO topic_index_search (conversation_id, workspace_id, title, topic_descriptor, keywords)
VALUES (?, ?, ?, ?, ?)
`, document.ConversationID, document.WorkspaceID, document.Title, document.TopicDescriptor, document.Keywords); err != nil {
		return fmt.Errorf("insert topic search document %s: %w", document.ConversationID, err)
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) AppendTopicIndexKeywords(conversationID string, text string, updatedAt string) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := validateIdentifier("topic index conversation id", conversationID); err != nil {
		return err
	}
	if err := validateTrimmedText("topic index text", text); err != nil {
		return err
	}
	if _, err := validateTimestamp("topic index updatedAt", updatedAt); err != nil {
		return err
	}
	document, err := readTopicIndexDocument(transaction.ctx, transaction.tx, conversationID)
	if err != nil {
		return err
	}
	document.Keywords = appendBoundedIndexText(document.Keywords, text)
	document.UpdatedAt = updatedAt
	return transaction.UpsertTopicIndexDocument(document)
}

func (transaction *WriteTransaction) UpdateTopicIndexNarration(conversationID string, descriptor *string, finalSummary string, updatedAt string) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	document, err := readTopicIndexDocument(transaction.ctx, transaction.tx, conversationID)
	if err != nil {
		return err
	}
	if descriptor != nil {
		document.TopicDescriptor = *descriptor
	}
	if finalSummary != "" {
		document.Keywords = appendBoundedIndexText(document.Keywords, finalSummary)
	}
	document.UpdatedAt = updatedAt
	return transaction.UpsertTopicIndexDocument(document)
}

func (transaction *WriteTransaction) UpsertPaneBinding(binding PaneBinding) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	if err := binding.Validate(); err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `
INSERT INTO pane_bindings (pane_id, workspace_id, conversation_id, created_at, updated_at, last_focused_at)
SELECT ?, workspace_id, id, ?, ?, ? FROM conversations
WHERE id = ? AND workspace_id = ?
ON CONFLICT(pane_id) DO UPDATE SET
  workspace_id = excluded.workspace_id,
  conversation_id = excluded.conversation_id,
  updated_at = excluded.updated_at,
  last_focused_at = excluded.last_focused_at
`, binding.PaneID, binding.CreatedAt, binding.UpdatedAt, nullableString(binding.LastFocusedAt), binding.ConversationID, binding.WorkspaceID)
	if err != nil {
		return fmt.Errorf("upsert pane binding %s: %w", binding.PaneID, err)
	}
	if err := requireOneRow(result, "pane binding", binding.PaneID, "conversation ownership did not match"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}

func (transaction *WriteTransaction) DeletePaneBinding(paneID string, conversationID string) error {
	if err := transaction.ensureActive(); err != nil {
		return err
	}
	result, err := transaction.tx.ExecContext(transaction.ctx, `DELETE FROM pane_bindings WHERE pane_id = ? AND conversation_id = ?`, paneID, conversationID)
	if err != nil {
		return err
	}
	if err := requireOneRow(result, "pane binding", paneID, "binding did not match conversation"); err != nil {
		return err
	}
	return transaction.recordStateMutation()
}

func (store *Store) SearchTopicIndex(ctx context.Context, query string, workspaceID *string, limit int) ([]TopicIndexMatch, error) {
	if strings.TrimSpace(query) == "" || strings.TrimSpace(query) != query {
		return nil, errors.New("topic search query must be non-empty and trimmed")
	}
	if limit <= 0 || limit > 100 {
		return nil, errors.New("topic search limit must be between 1 and 100")
	}
	var matches []TopicIndexMatch
	err := store.read(ctx, "search topic index", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT d.conversation_id, d.workspace_id, d.title, d.topic_descriptor,
       d.keywords, d.updated_at, bm25(topic_index_search)
FROM topic_index_search
JOIN topic_index_documents d USING (conversation_id)
JOIN conversations c ON c.id = d.conversation_id
WHERE topic_index_search MATCH ?
  AND c.archived_at IS NULL
  AND (? IS NULL OR d.workspace_id = ?)
ORDER BY bm25(topic_index_search) ASC, d.updated_at DESC, d.conversation_id ASC
LIMIT ?
`, ftsTokenQuery(query), nullableString(workspaceID), nullableString(workspaceID), limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		matches = make([]TopicIndexMatch, 0)
		for rows.Next() {
			var match TopicIndexMatch
			if err := rows.Scan(&match.Document.ConversationID, &match.Document.WorkspaceID, &match.Document.Title, &match.Document.TopicDescriptor, &match.Document.Keywords, &match.Document.UpdatedAt, &match.Rank); err != nil {
				return err
			}
			matches = append(matches, match)
		}
		return rows.Err()
	})
	return matches, err
}

func (store *Store) ListTopicIndexDocuments(ctx context.Context, workspaceID *string, cursor *string, limit int) ([]TopicIndexDocument, *string, error) {
	if workspaceID != nil {
		if err := validateIdentifier("topic index workspace id", *workspaceID); err != nil {
			return nil, nil, err
		}
	}
	if limit <= 0 || limit > 200 {
		return nil, nil, errors.New("topic index list limit must be between 1 and 200")
	}
	cursorValue := ""
	if cursor != nil {
		cursorValue = *cursor
	}
	var documents []TopicIndexDocument
	err := store.read(ctx, "list topic index documents", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT d.conversation_id, d.workspace_id, d.title, d.topic_descriptor,
       d.keywords, d.updated_at
FROM topic_index_documents d
JOIN conversations c ON c.id = d.conversation_id
WHERE c.archived_at IS NULL
  AND (? IS NULL OR d.workspace_id = ?)
  AND (? = '' OR (d.updated_at || ':' || d.conversation_id) < ?)
ORDER BY d.updated_at DESC, d.conversation_id DESC
LIMIT ?
`, nullableString(workspaceID), nullableString(workspaceID), cursorValue, cursorValue, limit+1)
		if err != nil {
			return err
		}
		defer rows.Close()
		documents = make([]TopicIndexDocument, 0, limit+1)
		for rows.Next() {
			var document TopicIndexDocument
			if err := rows.Scan(&document.ConversationID, &document.WorkspaceID, &document.Title, &document.TopicDescriptor, &document.Keywords, &document.UpdatedAt); err != nil {
				return err
			}
			documents = append(documents, document)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, nil, err
	}
	var next *string
	if len(documents) > limit {
		documents = documents[:limit]
		value := documents[len(documents)-1].UpdatedAt + ":" + documents[len(documents)-1].ConversationID
		next = &value
	}
	return documents, next, nil
}

func (store *Store) ListPaneBindings(ctx context.Context, conversationID *string) ([]PaneBinding, error) {
	var bindings []PaneBinding
	err := store.read(ctx, "list conversation pane bindings", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT pane_id, workspace_id, conversation_id, created_at, updated_at, last_focused_at
FROM pane_bindings WHERE (? IS NULL OR conversation_id = ?)
ORDER BY conversation_id ASC, last_focused_at DESC, pane_id ASC
`, nullableString(conversationID), nullableString(conversationID))
		if err != nil {
			return err
		}
		defer rows.Close()
		bindings = make([]PaneBinding, 0)
		for rows.Next() {
			var binding PaneBinding
			var focusedAt sql.NullString
			if err := rows.Scan(&binding.PaneID, &binding.WorkspaceID, &binding.ConversationID, &binding.CreatedAt, &binding.UpdatedAt, &focusedAt); err != nil {
				return err
			}
			binding.LastFocusedAt = nullStringPointer(focusedAt)
			bindings = append(bindings, binding)
		}
		return rows.Err()
	})
	return bindings, err
}

func ftsTokenQuery(query string) string {
	tokens := strings.Fields(query)
	quoted := make([]string, 0, len(tokens))
	for _, token := range tokens {
		quoted = append(quoted, `"`+strings.ReplaceAll(token, `"`, `""`)+`"`)
	}
	return strings.Join(quoted, " OR ")
}

type rowQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func readTopicIndexDocument(ctx context.Context, reader rowQuerier, conversationID string) (TopicIndexDocument, error) {
	var document TopicIndexDocument
	err := reader.QueryRowContext(ctx, `
SELECT conversation_id, workspace_id, title, topic_descriptor, keywords, updated_at
FROM topic_index_documents WHERE conversation_id = ?
`, conversationID).Scan(&document.ConversationID, &document.WorkspaceID, &document.Title, &document.TopicDescriptor, &document.Keywords, &document.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return TopicIndexDocument{}, fmt.Errorf("topic index document not found: %s", conversationID)
	}
	return document, err
}

func appendBoundedIndexText(existing string, next string) string {
	const maxBytes = 32 * 1024
	combined := next
	if existing != "" {
		combined = existing + "\n" + next
	}
	if len(combined) <= maxBytes {
		return combined
	}
	return combined[len(combined)-maxBytes:]
}
