package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/speech"
)

type activeConversationPresentation struct {
	WorkspaceID    string
	CreatedAt      string
	Archived       bool
	Visible        bool
	NarratorActive bool
	Profile        ConversationPresentationProfile
}

func (store *Store) withPresentationConfigurationLock(run func() error) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if run == nil {
		return errors.New("presentation configuration operation is required")
	}
	store.presentationConfigurationMu.Lock()
	defer store.presentationConfigurationMu.Unlock()
	return run()
}

func (store *Store) transactPresentationAware(
	ctx context.Context,
	operation string,
	run func(*WriteTransaction) error,
) ([]CommittedEvent, error) {
	var events []CommittedEvent
	err := store.withPresentationConfigurationLock(func() error {
		var err error
		events, err = store.Transact(ctx, operation, run)
		return err
	})
	return events, err
}

func (store *Store) readConversationPresentations(
	ctx context.Context,
) ([]activeConversationPresentation, error) {
	var presentations []activeConversationPresentation
	err := store.read(ctx, "read conversation presentation assignments", func(ctx context.Context, reader *sql.Conn) error {
		var err error
		presentations, err = readConversationPresentations(ctx, reader, store.dbPath)
		return err
	})
	return presentations, err
}

type presentationQueryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

func readConversationPresentations(
	ctx context.Context,
	query presentationQueryer,
	dbPath string,
) ([]activeConversationPresentation, error) {
	rows, err := query.QueryContext(ctx, `
SELECT conversations.workspace_id, conversations.created_at,
       conversations.archived_at,
       narrator_state.conversation_id,
       profiles.conversation_id, profiles.palette_selection,
       profiles.requested_palette_id, profiles.resolved_palette_id,
       profiles.palette_reuse_json, profiles.narrator_voice_selection,
       profiles.requested_narrator_voice_id, profiles.resolved_narrator_voice_id,
       profiles.narrator_voice_reuse_json, profiles.narrator_speech_enabled,
       profiles.updated_at
FROM conversation_presentation_profiles AS profiles
JOIN conversations ON conversations.id = profiles.conversation_id
LEFT JOIN narrator_state ON narrator_state.conversation_id = profiles.conversation_id
ORDER BY conversations.created_at ASC, conversations.id ASC
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	presentations := make([]activeConversationPresentation, 0)
	for rows.Next() {
		var value activeConversationPresentation
		var workspaceID sql.NullString
		var archivedAt sql.NullString
		var narratorConversationID sql.NullString
		var state presentationProfileScanState
		targets := []any{
			&workspaceID,
			&value.CreatedAt,
			&archivedAt,
			&narratorConversationID,
		}
		targets = append(targets, state.targets(&value.Profile)...)
		if err := rows.Scan(targets...); err != nil {
			return nil, err
		}
		if !narratorConversationID.Valid {
			return nil, &CorruptStateError{
				Path: dbPath,
				Err: fmt.Errorf(
					"presentation profile %s is missing narrator state",
					value.Profile.ConversationID,
				),
			}
		}
		if err := state.finish(&value.Profile); err != nil {
			return nil, err
		}
		if workspaceID.Valid {
			value.WorkspaceID = workspaceID.String
		}
		if err := value.Profile.Validate(); err != nil {
			return nil, &CorruptStateError{
				Path: dbPath,
				Err:  fmt.Errorf("presentation profile %s: %w", value.Profile.ConversationID, err),
			}
		}
		value.Archived = archivedAt.Valid
		value.refreshActivity()
		presentations = append(presentations, value)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return presentations, nil
}

// refreshActivity derives the Setta 4 presentation state of one conversation.
// Every conversation the user has not archived is a live workstream in the
// command center, so it holds a distinguishable palette, and it holds a
// distinguishable narrator voice whenever narrator speech is enabled.
func (presentation *activeConversationPresentation) refreshActivity() {
	presentation.Visible = !presentation.Archived
	presentation.NarratorActive = presentation.Visible && presentation.Profile.NarratorSpeechEnabled
}

func (presentation activeConversationPresentation) withProfile(
	profile ConversationPresentationProfile,
) activeConversationPresentation {
	presentation.Profile = profile
	presentation.refreshActivity()
	return presentation
}

func narratorVoiceAssignments(
	presentations []activeConversationPresentation,
	excluded map[string]bool,
) []speech.NarratorVoiceAssignment {
	assignments := make([]speech.NarratorVoiceAssignment, 0, len(presentations))
	for _, presentation := range presentations {
		profile := presentation.Profile
		if !presentation.NarratorActive || excluded[profile.ConversationID] {
			continue
		}
		if profile.ResolvedNarratorVoiceID == nil {
			continue
		}
		assignments = append(assignments, speech.NarratorVoiceAssignment{
			ConversationID: profile.ConversationID,
			VoiceID:        *profile.ResolvedNarratorVoiceID,
		})
	}
	return assignments
}
