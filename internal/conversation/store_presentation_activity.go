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
	master, found, markerFound, err := inspectMasterVoiceSelectionState(
		transaction.ctx,
		transaction.tx,
		transaction.store.dbPath,
	)
	if err != nil {
		return err
	}
	resolvedMaster, err := resolveMasterVoiceSelectionState(
		master,
		found,
		markerFound,
		transaction.store.dbPath,
	)
	if err != nil {
		return err
	}
	if resolvedMaster == nil {
		return nil
	}
	updates, masterUpdate, err := reconcileAutomaticPresentationIdentities(
		presentations,
		transaction.presentationActivityPrevious,
		*resolvedMaster,
		transaction.presentationActivityUpdatedAt,
	)
	if err != nil {
		return err
	}
	return transaction.commitPresentationActivityUpdates(*resolvedMaster, masterUpdate, updates)
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
	master speech.MasterVoiceSelection,
	masterUpdate *speech.MasterVoiceSelection,
	updates []ConversationPresentationProfile,
) error {
	if masterUpdate != nil {
		if err := transaction.UpdateMasterVoiceSelection(master.UpdatedAt, *masterUpdate); err != nil {
			return err
		}
	}
	for _, update := range updates {
		if err := transaction.UpsertConversationPresentationProfile(update); err != nil {
			return err
		}
	}
	if masterUpdate != nil {
		if err := transaction.appendPresentationActivityMasterEvent(master, *masterUpdate); err != nil {
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

func (transaction *WriteTransaction) appendPresentationActivityMasterEvent(
	previous speech.MasterVoiceSelection,
	updated speech.MasterVoiceSelection,
) error {
	eventID, err := randomServiceID("speech_event")
	if err != nil {
		return err
	}
	payload := speech.NewMasterVoiceSelectionUpdate(
		previous,
		updated,
		speech.MasterVoiceSelectionUpdateNarratorAssignment,
	)
	if err := payload.Validate(); err != nil {
		return err
	}
	_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          eventID,
		StreamID:    speech.MasterVoiceSelectionStreamID,
		Kind:        speech.MasterVoiceSelectionUpdatedEventKind,
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
