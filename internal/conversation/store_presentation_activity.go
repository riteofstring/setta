package conversation

import (
	"fmt"

	"setta/internal/speech"
)

func (transaction *WriteTransaction) capturePresentationActivity() error {
	if transaction.presentationActivityPrevious != nil {
		return nil
	}
	presentations, err := readConversationPresentations(
		transaction.ctx,
		transaction.tx,
		transaction.store.dbPath,
	)
	if err != nil {
		return err
	}
	transaction.presentationActivityPrevious = presentationActivityStates(presentations)
	return nil
}

func (transaction *WriteTransaction) reconcilePresentationActivity() error {
	if transaction.presentationActivityPrevious == nil ||
		transaction.presentationActivityUpdatedAt == "" {
		return nil
	}
	presentations, err := readConversationPresentations(
		transaction.ctx,
		transaction.tx,
		transaction.store.dbPath,
	)
	if err != nil {
		return err
	}
	if !presentationActivityChanged(
		transaction.presentationActivityPrevious,
		presentationActivityStates(presentations),
	) {
		return nil
	}
	if len(presentations) == 0 {
		return nil
	}
	director, found, markerFound, err := inspectDirectorVoiceSelectionState(
		transaction.ctx,
		transaction.tx,
		transaction.store.dbPath,
	)
	if err != nil {
		return err
	}
	resolvedDirector, err := resolveDirectorVoiceSelectionState(
		director,
		found,
		markerFound,
		transaction.store.dbPath,
	)
	if err != nil {
		return err
	}
	if resolvedDirector == nil {
		return nil
	}
	updates, directorUpdate, err := reconcileAutomaticPresentationIdentities(
		presentations,
		transaction.presentationActivityPrevious,
		*resolvedDirector,
		transaction.presentationActivityUpdatedAt,
	)
	if err != nil {
		return err
	}
	return transaction.commitPresentationActivityUpdates(*resolvedDirector, directorUpdate, updates)
}

func presentationActivityChanged(
	previous map[string]presentationActivityState,
	current map[string]presentationActivityState,
) bool {
	if len(previous) != len(current) {
		return true
	}
	for conversationID, currentState := range current {
		if previousState, ok := previous[conversationID]; !ok || previousState != currentState {
			return true
		}
	}
	return false
}

func (transaction *WriteTransaction) commitPresentationActivityUpdates(
	director speech.DirectorVoiceSelection,
	directorUpdate *speech.DirectorVoiceSelection,
	updates []ConversationPresentationProfile,
) error {
	if directorUpdate != nil {
		if err := transaction.UpdateDirectorVoiceSelection(director.UpdatedAt, *directorUpdate); err != nil {
			return err
		}
	}
	for _, update := range updates {
		if err := transaction.UpsertConversationPresentationProfile(update); err != nil {
			return err
		}
	}
	if directorUpdate != nil {
		if err := transaction.appendPresentationActivityDirectorEvent(director, *directorUpdate); err != nil {
			return err
		}
	}
	for _, update := range updates {
		if err := transaction.appendPresentationActivityProfileEvent(update); err != nil {
			return err
		}
	}
	return nil
}

func (transaction *WriteTransaction) appendPresentationActivityDirectorEvent(
	previous speech.DirectorVoiceSelection,
	updated speech.DirectorVoiceSelection,
) error {
	eventID, err := randomServiceID("speech_event")
	if err != nil {
		return err
	}
	payload := speech.NewDirectorVoiceSelectionUpdate(
		previous,
		updated,
		speech.DirectorVoiceSelectionUpdateNarratorAssignment,
	)
	if err := payload.Validate(); err != nil {
		return err
	}
	_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          eventID,
		StreamID:    speech.DirectorVoiceSelectionStreamID,
		Kind:        speech.DirectorVoiceSelectionUpdatedEventKind,
		Payload:     payload,
		CommittedAt: updated.UpdatedAt,
	})
	return err
}

func (transaction *WriteTransaction) appendPresentationActivityProfileEvent(
	profile ConversationPresentationProfile,
) error {
	eventID, err := randomServiceID("conversation_event")
	if err != nil {
		return err
	}
	streamID, err := ConversationStreamID(profile.ConversationID)
	if err != nil {
		return err
	}
	_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:       eventID,
		StreamID: streamID,
		Kind:     string(ConversationEventTypePresentationProfileUpdated),
		Payload: ConversationPresentationProfileUpdatedEventPayload{
			Type:    ConversationEventTypePresentationProfileUpdated,
			Profile: profile,
		},
		CommittedAt: profile.UpdatedAt,
	})
	if err != nil {
		return fmt.Errorf("append presentation activity event for %s: %w", profile.ConversationID, err)
	}
	return nil
}
