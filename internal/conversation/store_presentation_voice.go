package conversation

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"setta/internal/speech"
)

type activeConversationPresentation struct {
	WorkspaceID string
	CreatedAt   string
	Profile     ConversationPresentationProfile
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

func (store *Store) readActiveConversationPresentations(
	ctx context.Context,
) ([]activeConversationPresentation, error) {
	var presentations []activeConversationPresentation
	err := store.read(ctx, "read active conversation voice assignments", func(ctx context.Context, reader *sql.Conn) error {
		rows, err := reader.QueryContext(ctx, `
SELECT conversations.workspace_id, conversations.created_at,
       profiles.conversation_id, profiles.palette_selection,
       profiles.requested_palette_id, profiles.resolved_palette_id,
       profiles.palette_reuse_json, profiles.narrator_voice_selection,
       profiles.requested_narrator_voice_id, profiles.resolved_narrator_voice_id,
       profiles.narrator_voice_reuse_json, profiles.narrator_speech_enabled,
       profiles.updated_at
FROM conversation_presentation_profiles AS profiles
JOIN conversations ON conversations.id = profiles.conversation_id
WHERE conversations.archived_at IS NULL
ORDER BY conversations.created_at ASC, conversations.id ASC
`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var value activeConversationPresentation
			var state presentationProfileScanState
			targets := []any{&value.WorkspaceID, &value.CreatedAt}
			targets = append(targets, state.targets(&value.Profile)...)
			if err := rows.Scan(targets...); err != nil {
				return err
			}
			if err := state.finish(&value.Profile); err != nil {
				return err
			}
			if err := value.Profile.Validate(); err != nil {
				return &CorruptStateError{
					Path: store.dbPath,
					Err:  fmt.Errorf("active presentation profile %s: %w", value.Profile.ConversationID, err),
				}
			}
			presentations = append(presentations, value)
		}
		return rows.Err()
	})
	return presentations, err
}

func narratorVoiceAssignments(
	presentations []activeConversationPresentation,
	excluded map[string]bool,
) []speech.NarratorVoiceAssignment {
	assignments := make([]speech.NarratorVoiceAssignment, 0, len(presentations))
	for _, presentation := range presentations {
		profile := presentation.Profile
		if excluded[profile.ConversationID] {
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
