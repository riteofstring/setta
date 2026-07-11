package conversation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/workspaceui/conversationpalette"
)

const maxNavigatorSearchLength = 200
const navigatorTimestampSortLayout = "2006-01-02T15:04:05.000000000"

func (store *Store) ListNavigatorPage(
	ctx context.Context,
	workspaceID string,
	query string,
	cursor *NavigatorCursor,
	limit int,
) (NavigatorPage, error) {
	query, cursorSortKey, err := validateNavigatorPageRequest(store, ctx, workspaceID, query, cursor, limit)
	if err != nil {
		return NavigatorPage{}, err
	}
	page, err := store.readNavigatorPage(ctx, workspaceID, query, cursor, cursorSortKey, limit)
	if err != nil {
		return NavigatorPage{}, err
	}
	if err := page.Validate(workspaceID, limit); err != nil {
		return NavigatorPage{}, &CorruptStateError{Path: store.dbPath, Err: err}
	}
	return page, nil
}

func validateNavigatorPageRequest(
	store *Store,
	ctx context.Context,
	workspaceID string,
	query string,
	cursor *NavigatorCursor,
	limit int,
) (string, string, error) {
	if store == nil {
		return "", "", errors.New("conversation store is required")
	}
	if ctx == nil {
		return "", "", errors.New("conversation navigator context is required")
	}
	if err := validateIdentifier("conversation navigator workspace id", workspaceID); err != nil {
		return "", "", err
	}
	query = strings.TrimSpace(query)
	if len(query) > maxNavigatorSearchLength {
		return "", "", fmt.Errorf("conversation navigator query exceeds %d bytes", maxNavigatorSearchLength)
	}
	cursorSortKey, err := navigatorCursorSortKey(cursor)
	if err != nil {
		return "", "", err
	}
	if limit <= 0 || limit > MaxNavigatorPageLimit {
		return "", "", fmt.Errorf("conversation navigator page limit must be between 1 and %d: %d", MaxNavigatorPageLimit, limit)
	}
	return query, cursorSortKey, nil
}

func navigatorCursorSortKey(cursor *NavigatorCursor) (string, error) {
	if cursor == nil {
		return "", nil
	}
	if err := cursor.Validate(); err != nil {
		return "", err
	}
	updatedAt, err := time.Parse(time.RFC3339Nano, cursor.UpdatedAt)
	if err != nil {
		return "", err
	}
	return updatedAt.UTC().Format(navigatorTimestampSortLayout), nil
}

func (store *Store) readNavigatorPage(
	ctx context.Context,
	workspaceID string,
	query string,
	cursor *NavigatorCursor,
	cursorSortKey string,
	limit int,
) (NavigatorPage, error) {
	page := NavigatorPage{Items: []NavigatorItem{}}
	err := store.read(ctx, "list conversation navigator page", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(
			ctx,
			navigatorPageQuery,
			navigatorPageQueryArguments(workspaceID, query, cursor, cursorSortKey, limit)...,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		items, err := scanNavigatorItems(rows, store.dbPath)
		if err != nil {
			return err
		}
		if len(items) > limit {
			items = items[:limit]
			last := items[len(items)-1].Conversation
			page.NextCursor = &NavigatorCursor{UpdatedAt: last.UpdatedAt, ConversationID: last.ID}
		}
		page.Items = items
		return nil
	})
	if err != nil {
		return NavigatorPage{}, err
	}
	return page, nil
}

const navigatorPageQuery = `
WITH navigator_conversations AS (
  SELECT
    conversation.*,
    substr(conversation.updated_at, 1, 19) || '.' ||
      substr(
        CASE
          WHEN instr(conversation.updated_at, '.') = 20
            THEN substr(conversation.updated_at, 21, length(conversation.updated_at) - 21)
          ELSE ''
        END || '000000000',
        1,
        9
      ) AS navigator_updated_at
  FROM conversations AS conversation
)
SELECT
  conversation.id,
  conversation.workspace_id,
  conversation.title,
  conversation.topic_descriptor,
  conversation.status,
  conversation.created_at,
  conversation.updated_at,
  conversation.archived_at,
  conversation.last_trajectory_sequence,
  profile.conversation_id,
  profile.palette_selection,
  profile.requested_palette_id,
  profile.resolved_palette_id,
  profile.palette_reuse_json,
  profile.narrator_voice_selection,
  profile.requested_narrator_voice_id,
  profile.resolved_narrator_voice_id,
  profile.narrator_voice_reuse_json,
  profile.narrator_speech_enabled,
  profile.updated_at,
  branch.child_conversation_id,
  branch.parent_conversation_id,
  branch.branch_kind,
  branch.forked_at_turn_id,
  branch.source_trajectory_sequence,
  branch.provider_metadata_json,
  branch.created_at
FROM navigator_conversations AS conversation
LEFT JOIN conversation_presentation_profiles AS profile
  ON profile.conversation_id = conversation.id
LEFT JOIN conversation_branches AS branch
  ON branch.child_conversation_id = conversation.id
WHERE conversation.workspace_id = ?
  AND conversation.archived_at IS NULL
  AND (
    ? = ''
    OR instr(lower(conversation.title), lower(?)) > 0
    OR instr(lower(conversation.topic_descriptor), lower(?)) > 0
  )
  AND (
    ? = ''
    OR conversation.navigator_updated_at < ?
    OR (conversation.navigator_updated_at = ? AND conversation.id > ?)
  )
ORDER BY conversation.navigator_updated_at DESC, conversation.id ASC
LIMIT ?
`

func navigatorPageQueryArguments(
	workspaceID string,
	query string,
	cursor *NavigatorCursor,
	cursorSortKey string,
	limit int,
) []any {
	cursorConversationID := ""
	if cursor != nil {
		cursorConversationID = cursor.ConversationID
	}
	return []any{
		workspaceID,
		query,
		query,
		query,
		cursorSortKey,
		cursorSortKey,
		cursorSortKey,
		cursorConversationID,
		limit + 1,
	}
}

type navigatorRow struct {
	conversation TopicConversation

	profileConversationID        sql.NullString
	paletteSelection             sql.NullString
	requestedPaletteID           sql.NullString
	resolvedPaletteID            sql.NullString
	paletteReuseJSON             sql.NullString
	narratorVoiceSelection       sql.NullString
	requestedNarratorVoiceID     sql.NullString
	resolvedNarratorVoiceID      sql.NullString
	narratorVoiceReuseJSON       sql.NullString
	narratorSpeechEnabled        sql.NullInt64
	presentationProfileUpdatedAt sql.NullString

	branchChildConversationID      sql.NullString
	branchParentConversationID     sql.NullString
	branchKind                     sql.NullString
	branchForkedAtTurnID           sql.NullString
	branchSourceTrajectorySequence sql.NullInt64
	branchProviderMetadataJSON     sql.NullString
	branchCreatedAt                sql.NullString
}

func scanNavigatorItems(rows *sql.Rows, dbPath string) ([]NavigatorItem, error) {
	items := make([]NavigatorItem, 0)
	for rows.Next() {
		var row navigatorRow
		var archivedAt sql.NullString
		if err := rows.Scan(
			&row.conversation.ID,
			&row.conversation.WorkspaceID,
			&row.conversation.Title,
			&row.conversation.TopicDescriptor,
			&row.conversation.Status,
			&row.conversation.CreatedAt,
			&row.conversation.UpdatedAt,
			&archivedAt,
			&row.conversation.LastTrajectorySequence,
			&row.profileConversationID,
			&row.paletteSelection,
			&row.requestedPaletteID,
			&row.resolvedPaletteID,
			&row.paletteReuseJSON,
			&row.narratorVoiceSelection,
			&row.requestedNarratorVoiceID,
			&row.resolvedNarratorVoiceID,
			&row.narratorVoiceReuseJSON,
			&row.narratorSpeechEnabled,
			&row.presentationProfileUpdatedAt,
			&row.branchChildConversationID,
			&row.branchParentConversationID,
			&row.branchKind,
			&row.branchForkedAtTurnID,
			&row.branchSourceTrajectorySequence,
			&row.branchProviderMetadataJSON,
			&row.branchCreatedAt,
		); err != nil {
			return nil, err
		}
		row.conversation.ArchivedAt = optionalScannedString(archivedAt)
		item, err := navigatorItemFromRow(row)
		if err != nil {
			return nil, &CorruptStateError{
				Path: dbPath,
				Err:  fmt.Errorf("conversation navigator row %q: %w", row.conversation.ID, err),
			}
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func navigatorItemFromRow(row navigatorRow) (NavigatorItem, error) {
	profile, err := navigatorPresentationProfile(row)
	if err != nil {
		return NavigatorItem{}, err
	}
	branch, err := navigatorBranch(row)
	if err != nil {
		return NavigatorItem{}, err
	}
	item := NavigatorItem{
		Conversation:        row.conversation,
		PresentationProfile: profile,
		Branch:              branch,
	}
	if err := item.Validate(row.conversation.WorkspaceID); err != nil {
		return NavigatorItem{}, err
	}
	return item, nil
}

func navigatorPresentationProfile(row navigatorRow) (ConversationPresentationProfile, error) {
	if !row.profileConversationID.Valid {
		return ConversationPresentationProfile{}, errors.New("presentation profile is missing")
	}
	if !row.paletteSelection.Valid || !row.resolvedPaletteID.Valid ||
		!row.narratorVoiceSelection.Valid || !row.narratorSpeechEnabled.Valid ||
		!row.presentationProfileUpdatedAt.Valid {
		return ConversationPresentationProfile{}, errors.New("presentation profile contains null required fields")
	}
	paletteReuse, err := decodeOptionalPresentationReuse("palette reuse", row.paletteReuseJSON)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	narratorVoiceReuse, err := decodeOptionalPresentationReuse("narrator voice reuse", row.narratorVoiceReuseJSON)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	requestedPaletteID := optionalPaletteID(row.requestedPaletteID)
	return ConversationPresentationProfile{
		ConversationID:           row.profileConversationID.String,
		PaletteSelection:         PresentationSelectionMode(row.paletteSelection.String),
		RequestedPaletteID:       requestedPaletteID,
		ResolvedPaletteID:        conversationpalette.ConversationPaletteID(row.resolvedPaletteID.String),
		PaletteReuse:             paletteReuse,
		NarratorVoiceSelection:   PresentationSelectionMode(row.narratorVoiceSelection.String),
		RequestedNarratorVoiceID: optionalScannedString(row.requestedNarratorVoiceID),
		ResolvedNarratorVoiceID:  optionalScannedString(row.resolvedNarratorVoiceID),
		NarratorVoiceReuse:       narratorVoiceReuse,
		NarratorSpeechEnabled:    row.narratorSpeechEnabled.Int64 == 1,
		UpdatedAt:                row.presentationProfileUpdatedAt.String,
	}, nil
}

func navigatorBranch(row navigatorRow) (*ConversationBranch, error) {
	if !row.branchChildConversationID.Valid {
		return nil, nil
	}
	if !row.branchParentConversationID.Valid || !row.branchKind.Valid ||
		!row.branchForkedAtTurnID.Valid || !row.branchSourceTrajectorySequence.Valid ||
		!row.branchProviderMetadataJSON.Valid || !row.branchCreatedAt.Valid {
		return nil, errors.New("branch contains null required fields")
	}
	metadata := map[string]string{}
	if err := json.Unmarshal([]byte(row.branchProviderMetadataJSON.String), &metadata); err != nil {
		return nil, fmt.Errorf("decode branch provider metadata: %w", err)
	}
	return &ConversationBranch{
		ChildConversationID:      row.branchChildConversationID.String,
		ParentConversationID:     row.branchParentConversationID.String,
		Kind:                     BranchKind(row.branchKind.String),
		ForkedAtTurnID:           row.branchForkedAtTurnID.String,
		SourceTrajectorySequence: int(row.branchSourceTrajectorySequence.Int64),
		ProviderMetadata:         metadata,
		CreatedAt:                row.branchCreatedAt.String,
	}, nil
}

func decodeOptionalPresentationReuse(label string, value sql.NullString) (*PresentationReuse, error) {
	if !value.Valid {
		return nil, nil
	}
	var reuse PresentationReuse
	if err := json.Unmarshal([]byte(value.String), &reuse); err != nil {
		return nil, fmt.Errorf("decode presentation %s: %w", label, err)
	}
	return &reuse, nil
}

func optionalPaletteID(value sql.NullString) *conversationpalette.ConversationPaletteID {
	if !value.Valid {
		return nil
	}
	paletteID := conversationpalette.ConversationPaletteID(value.String)
	return &paletteID
}

func optionalScannedString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	result := value.String
	return &result
}
