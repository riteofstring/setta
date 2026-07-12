package conversation

import (
	"context"
	"fmt"

	"setta/internal/speech"
)

func (service *Service) UpdateNarratorVoiceSelection(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	request speech.VoiceSelectionRequest,
) (ConversationPresentationProfile, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationPresentationProfile{}, err
	}
	if err := request.Validate(); err != nil {
		return ConversationPresentationProfile{}, err
	}
	var result ConversationPresentationProfile
	err := service.store.withVoiceConfigurationLock(func() error {
		var err error
		result, err = service.updateNarratorVoiceSelectionLocked(
			ctx,
			workspaceID,
			conversationID,
			request,
		)
		return err
	})
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	return result, nil
}

func (service *Service) updateNarratorVoiceSelectionLocked(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	request speech.VoiceSelectionRequest,
) (ConversationPresentationProfile, error) {
	snapshot, err := service.snapshotLocked(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	current := snapshot.PresentationProfile
	if narratorVoiceSelectionMatchesRequest(current, request) {
		return current, nil
	}
	master, err := service.store.ReadMasterVoiceSelection(ctx)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	if master.ResolvedVoiceID == nil {
		return ConversationPresentationProfile{}, fmt.Errorf("master voice selection has no resolved voice")
	}
	presentations, err := service.store.readActiveConversationPresentations(ctx)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	updates, err := resolveNarratorVoiceUpdates(
		presentations,
		current,
		request,
		*master.ResolvedVoiceID,
		service.timestamp(),
	)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	publications, result, err := service.prepareNarratorVoicePublications(updates, conversationID)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	if err := service.commitNarratorVoiceUpdates(ctx, updates, publications); err != nil {
		return ConversationPresentationProfile{}, err
	}
	return result, nil
}

func (service *Service) prepareNarratorVoicePublications(
	updates []ConversationPresentationProfile,
	requestedConversationID string,
) ([]preparedPublication, ConversationPresentationProfile, error) {
	publications := make([]preparedPublication, 0, len(updates))
	var result ConversationPresentationProfile
	for _, update := range updates {
		prepared, err := service.publications(
			update.ConversationID,
			update.UpdatedAt,
			ConversationPresentationProfileUpdatedEventPayload{
				Type:    ConversationEventTypePresentationProfileUpdated,
				Profile: update,
			},
		)
		if err != nil {
			return nil, ConversationPresentationProfile{}, err
		}
		publications = append(publications, prepared...)
		if update.ConversationID == requestedConversationID {
			result = update
		}
	}
	return publications, result, nil
}

func (service *Service) commitNarratorVoiceUpdates(
	ctx context.Context,
	updates []ConversationPresentationProfile,
	publications []preparedPublication,
) error {
	_, err := service.store.Transact(ctx, "update narrator voice selection", func(transaction *WriteTransaction) error {
		for _, update := range updates {
			if err := transaction.UpsertConversationPresentationProfile(update); err != nil {
				return err
			}
		}
		return appendPublications(transaction, publications)
	})
	return err
}

func narratorVoiceSelectionMatchesRequest(
	profile ConversationPresentationProfile,
	request speech.VoiceSelectionRequest,
) bool {
	if profile.NarratorVoiceSelection != request.Selection {
		return false
	}
	if request.Selection == speech.VoiceSelectionAutoDistinct {
		return true
	}
	return voiceIDsEqual(profile.RequestedNarratorVoiceID, request.RequestedVoiceID)
}

func resolveNarratorVoiceUpdates(
	presentations []activeConversationPresentation,
	current ConversationPresentationProfile,
	request speech.VoiceSelectionRequest,
	masterVoiceID speech.SpeechVoiceID,
	updatedAt string,
) ([]ConversationPresentationProfile, error) {
	excluded := map[string]bool{current.ConversationID: true}
	affected := make([]ConversationPresentationProfile, 0)
	if request.Selection == speech.VoiceSelectionExact {
		for _, presentation := range presentations {
			profile := presentation.Profile
			if profile.ConversationID == current.ConversationID ||
				profile.NarratorVoiceSelection != speech.VoiceSelectionAutoDistinct ||
				profile.ResolvedNarratorVoiceID == nil ||
				*profile.ResolvedNarratorVoiceID != *request.RequestedVoiceID {
				continue
			}
			excluded[profile.ConversationID] = true
			affected = append(affected, profile)
		}
	}
	assignments := narratorVoiceAssignments(presentations, excluded)
	updates := make([]ConversationPresentationProfile, 0, 1+len(affected))
	selected, err := resolveRequestedNarratorVoice(current, request, masterVoiceID, assignments, updatedAt)
	if err != nil {
		return nil, err
	}
	updates = append(updates, selected)
	assignments = append(assignments, narratorVoiceAssignment(selected))
	for _, profile := range affected {
		allocation, err := speech.AllocateNarratorVoice(masterVoiceID, assignments)
		if err != nil {
			return nil, err
		}
		profile.RequestedNarratorVoiceID = nil
		profile.ResolvedNarratorVoiceID = voiceIDPointer(allocation.VoiceID)
		profile.NarratorVoiceReuse = presentationReuseFromVoiceAllocation(allocation)
		profile.UpdatedAt = advanceTimestamp(profile.UpdatedAt, updatedAt)
		updates = append(updates, profile)
		assignments = append(assignments, narratorVoiceAssignment(profile))
	}
	return updates, nil
}

func resolveRequestedNarratorVoice(
	profile ConversationPresentationProfile,
	request speech.VoiceSelectionRequest,
	masterVoiceID speech.SpeechVoiceID,
	assignments []speech.NarratorVoiceAssignment,
	updatedAt string,
) (ConversationPresentationProfile, error) {
	profile.NarratorVoiceSelection = request.Selection
	profile.RequestedNarratorVoiceID = cloneVoiceID(request.RequestedVoiceID)
	profile.NarratorVoiceReuse = nil
	switch request.Selection {
	case speech.VoiceSelectionExact:
		profile.ResolvedNarratorVoiceID = cloneVoiceID(request.RequestedVoiceID)
	case speech.VoiceSelectionAutoDistinct:
		allocation, err := speech.AllocateNarratorVoice(masterVoiceID, assignments)
		if err != nil {
			return ConversationPresentationProfile{}, err
		}
		profile.ResolvedNarratorVoiceID = voiceIDPointer(allocation.VoiceID)
		profile.NarratorVoiceReuse = presentationReuseFromVoiceAllocation(allocation)
	default:
		return ConversationPresentationProfile{}, fmt.Errorf(
			"unsupported narrator voice selection mode %q",
			request.Selection,
		)
	}
	profile.UpdatedAt = advanceTimestamp(profile.UpdatedAt, updatedAt)
	if err := profile.Validate(); err != nil {
		return ConversationPresentationProfile{}, err
	}
	return profile, nil
}

func narratorVoiceAssignment(
	profile ConversationPresentationProfile,
) speech.NarratorVoiceAssignment {
	return speech.NarratorVoiceAssignment{
		ConversationID: profile.ConversationID,
		VoiceID:        *profile.ResolvedNarratorVoiceID,
	}
}

func voiceIDPointer(value speech.SpeechVoiceID) *speech.SpeechVoiceID {
	result := value
	return &result
}

func cloneVoiceID(value *speech.SpeechVoiceID) *speech.SpeechVoiceID {
	if value == nil {
		return nil
	}
	return voiceIDPointer(*value)
}

func voiceIDsEqual(left *speech.SpeechVoiceID, right *speech.SpeechVoiceID) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
