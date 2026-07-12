package conversation

import (
	"context"
	"fmt"

	"setta/internal/speech"
	"setta/internal/workspaceui/conversationpalette"
)

func (service *Service) UpdatePresentationProfile(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	settings ConversationPresentationSettings,
) (ConversationPresentationProfile, error) {
	if err := service.requireOpen(); err != nil {
		return ConversationPresentationProfile{}, err
	}
	if err := settings.Validate(); err != nil {
		return ConversationPresentationProfile{}, err
	}
	var result ConversationPresentationProfile
	err := service.store.withPresentationConfigurationLock(func() error {
		var err error
		result, err = service.updatePresentationProfileLocked(
			ctx,
			workspaceID,
			conversationID,
			settings,
		)
		return err
	})
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	return result, nil
}

func (service *Service) updatePresentationProfileLocked(
	ctx context.Context,
	workspaceID string,
	conversationID string,
	settings ConversationPresentationSettings,
) (ConversationPresentationProfile, error) {
	snapshot, err := service.snapshotLocked(ctx, workspaceID, conversationID)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	current := snapshot.PresentationProfile
	if presentationSettingsMatchProfile(current, settings) {
		return current, nil
	}
	presentations, err := service.store.readActiveConversationPresentations(ctx)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	updates, master, masterUpdate, err := service.resolvePresentationSettings(
		ctx,
		workspaceID,
		current,
		settings,
		presentations,
		service.timestamp(),
	)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	return service.commitResolvedPresentationSettings(
		ctx,
		conversationID,
		updates,
		master,
		masterUpdate,
	)
}

func (service *Service) resolvePresentationSettings(
	ctx context.Context,
	workspaceID string,
	current ConversationPresentationProfile,
	settings ConversationPresentationSettings,
	presentations []activeConversationPresentation,
	updatedAt string,
) (
	[]ConversationPresentationProfile,
	*speech.MasterVoiceSelection,
	*speech.MasterVoiceSelection,
	error,
) {
	updates := narratorSpeechProfileUpdates(current, settings.NarratorSpeechEnabled, updatedAt)
	updates, err := resolveRequestedPaletteSetting(
		presentations,
		current,
		workspaceID,
		settings.PaletteSelection,
		updatedAt,
		updates,
	)
	if err != nil {
		return nil, nil, nil, err
	}
	updates, master, err := service.resolveRequestedNarratorSetting(
		ctx,
		presentations,
		current,
		settings.NarratorVoiceSelection,
		updatedAt,
		updates,
	)
	if err != nil || master == nil {
		return updates, master, nil, err
	}
	updates, masterUpdate, err := service.refreshAutomaticMasterAfterNarratorUpdates(
		*master,
		presentations,
		updates,
	)
	return updates, master, masterUpdate, err
}

func narratorSpeechProfileUpdates(
	current ConversationPresentationProfile,
	enabled bool,
	updatedAt string,
) []ConversationPresentationProfile {
	updates := make([]ConversationPresentationProfile, 0, 1)
	if current.NarratorSpeechEnabled != enabled {
		current.NarratorSpeechEnabled = enabled
		current.UpdatedAt = advanceTimestamp(current.UpdatedAt, updatedAt)
		updates = append(updates, current)
	}
	return updates
}

func resolveRequestedPaletteSetting(
	presentations []activeConversationPresentation,
	current ConversationPresentationProfile,
	workspaceID string,
	request PresentationSelectionRequest,
	updatedAt string,
	updates []ConversationPresentationProfile,
) ([]ConversationPresentationProfile, error) {
	current = profileAfterUpdates(current, updates)
	if paletteSelectionMatchesRequest(current, request) {
		return updates, nil
	}
	paletteUpdates, err := resolvePaletteUpdates(
		applyPresentationProfileUpdates(presentations, updates),
		current,
		workspaceID,
		request,
		updatedAt,
	)
	if err != nil {
		return nil, err
	}
	return mergePresentationProfileUpdates(updates, paletteUpdates), nil
}

func (service *Service) resolveRequestedNarratorSetting(
	ctx context.Context,
	presentations []activeConversationPresentation,
	current ConversationPresentationProfile,
	request speech.VoiceSelectionRequest,
	updatedAt string,
	updates []ConversationPresentationProfile,
) ([]ConversationPresentationProfile, *speech.MasterVoiceSelection, error) {
	current = profileAfterUpdates(current, updates)
	if narratorVoiceSelectionMatchesRequest(current, request) {
		return updates, nil, nil
	}
	master, err := service.store.ReadMasterVoiceSelection(ctx)
	if err != nil {
		return nil, nil, err
	}
	if master.ResolvedVoiceID == nil {
		return nil, nil, fmt.Errorf("master voice selection has no resolved voice")
	}
	voiceUpdates, err := resolveNarratorVoiceUpdates(
		applyPresentationProfileUpdates(presentations, updates),
		current,
		request,
		*master.ResolvedVoiceID,
		updatedAt,
	)
	if err != nil {
		return nil, nil, err
	}
	return mergePresentationProfileUpdates(updates, voiceUpdates), &master, nil
}

func (service *Service) commitResolvedPresentationSettings(
	ctx context.Context,
	conversationID string,
	updates []ConversationPresentationProfile,
	master *speech.MasterVoiceSelection,
	masterUpdate *speech.MasterVoiceSelection,
) (ConversationPresentationProfile, error) {
	publications, result, err := service.preparePresentationPublications(updates, conversationID)
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	if masterUpdate != nil {
		if master == nil {
			return ConversationPresentationProfile{}, fmt.Errorf("master voice update requires current selection")
		}
		err = service.store.commitMasterVoiceUpdate(
			ctx,
			*master,
			*masterUpdate,
			updates,
			publications,
			speech.MasterVoiceSelectionUpdateNarratorOverride,
		)
	} else {
		err = service.commitPresentationUpdates(ctx, updates, publications)
	}
	if err != nil {
		return ConversationPresentationProfile{}, err
	}
	return result, nil
}

func (service *Service) refreshAutomaticMasterAfterNarratorUpdates(
	master speech.MasterVoiceSelection,
	presentations []activeConversationPresentation,
	updates []ConversationPresentationProfile,
) ([]ConversationPresentationProfile, *speech.MasterVoiceSelection, error) {
	if master.Selection != speech.VoiceSelectionAutoDistinct {
		return updates, nil, nil
	}
	presentationsAfterUpdate := applyPresentationProfileUpdates(presentations, updates)
	refreshed, changed, err := speech.RefreshAutomaticMasterVoiceSelection(
		master,
		narratorVoiceAssignments(presentationsAfterUpdate, nil),
		advanceTimestamp(master.UpdatedAt, service.timestamp()),
	)
	if err != nil || !changed {
		return updates, nil, err
	}
	followups, err := narratorUpdatesForMasterVoice(
		presentationsAfterUpdate,
		*refreshed.ResolvedVoiceID,
		refreshed.UpdatedAt,
	)
	if err != nil {
		return nil, nil, err
	}
	updates = mergePresentationProfileUpdates(updates, followups)
	for index := range updates {
		updates[index].UpdatedAt = advanceTimestamp(updates[index].UpdatedAt, refreshed.UpdatedAt)
		if err := updates[index].Validate(); err != nil {
			return nil, nil, err
		}
	}
	finalPresentations := applyPresentationProfileUpdates(presentations, updates)
	refreshed.Reuse = speech.VoiceReuseForAssignments(
		*refreshed.ResolvedVoiceID,
		narratorVoiceAssignments(finalPresentations, nil),
	)
	if err := refreshed.Validate(); err != nil {
		return nil, nil, err
	}
	return updates, &refreshed, nil
}

func applyPresentationProfileUpdates(
	presentations []activeConversationPresentation,
	updates []ConversationPresentationProfile,
) []activeConversationPresentation {
	updatedByConversationID := make(map[string]ConversationPresentationProfile, len(updates))
	for _, update := range updates {
		updatedByConversationID[update.ConversationID] = update
	}
	result := make([]activeConversationPresentation, 0, len(presentations))
	for _, presentation := range presentations {
		if update, ok := updatedByConversationID[presentation.Profile.ConversationID]; ok {
			presentation.Profile = update
		}
		result = append(result, presentation)
	}
	return result
}

func mergePresentationProfileUpdates(
	initial []ConversationPresentationProfile,
	followups []ConversationPresentationProfile,
) []ConversationPresentationProfile {
	followupByConversationID := make(map[string]ConversationPresentationProfile, len(followups))
	for _, followup := range followups {
		followupByConversationID[followup.ConversationID] = followup
	}
	result := make([]ConversationPresentationProfile, 0, len(initial)+len(followups))
	seen := make(map[string]bool, len(initial)+len(followups))
	for _, update := range initial {
		if followup, ok := followupByConversationID[update.ConversationID]; ok {
			update = followup
		}
		result = append(result, update)
		seen[update.ConversationID] = true
	}
	for _, followup := range followups {
		if seen[followup.ConversationID] {
			continue
		}
		result = append(result, followup)
	}
	return result
}

func (service *Service) preparePresentationPublications(
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

func (service *Service) commitPresentationUpdates(
	ctx context.Context,
	updates []ConversationPresentationProfile,
	publications []preparedPublication,
) error {
	_, err := service.store.Transact(ctx, "update conversation presentation", func(transaction *WriteTransaction) error {
		for _, update := range updates {
			if err := transaction.UpsertConversationPresentationProfile(update); err != nil {
				return err
			}
		}
		return appendPublications(transaction, publications)
	})
	return err
}

func presentationSettingsMatchProfile(
	profile ConversationPresentationProfile,
	settings ConversationPresentationSettings,
) bool {
	return profile.NarratorSpeechEnabled == settings.NarratorSpeechEnabled &&
		paletteSelectionMatchesRequest(profile, settings.PaletteSelection) &&
		narratorVoiceSelectionMatchesRequest(profile, settings.NarratorVoiceSelection)
}

func paletteSelectionMatchesRequest(
	profile ConversationPresentationProfile,
	request PresentationSelectionRequest,
) bool {
	if profile.PaletteSelection != request.Selection {
		return false
	}
	if request.Selection == PresentationSelectionAutoDistinct {
		return true
	}
	return paletteIDsEqual(profile.RequestedPaletteID, request.RequestedPaletteID)
}

func profileAfterUpdates(
	profile ConversationPresentationProfile,
	updates []ConversationPresentationProfile,
) ConversationPresentationProfile {
	for _, update := range updates {
		if update.ConversationID == profile.ConversationID {
			return update
		}
	}
	return profile
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

func resolvePaletteUpdates(
	presentations []activeConversationPresentation,
	current ConversationPresentationProfile,
	workspaceID string,
	request PresentationSelectionRequest,
	updatedAt string,
) ([]ConversationPresentationProfile, error) {
	excluded := map[string]bool{current.ConversationID: true}
	affected := make([]ConversationPresentationProfile, 0)
	if request.Selection == PresentationSelectionExact {
		for _, presentation := range presentations {
			profile := presentation.Profile
			if presentation.WorkspaceID != workspaceID ||
				profile.ConversationID == current.ConversationID ||
				profile.PaletteSelection != PresentationSelectionAutoDistinct ||
				profile.ResolvedPaletteID != *request.RequestedPaletteID {
				continue
			}
			excluded[profile.ConversationID] = true
			affected = append(affected, profile)
		}
	}
	usage := paletteUsage(presentations, workspaceID, excluded)
	selected, err := resolveRequestedPalette(current, request, usage, updatedAt)
	if err != nil {
		return nil, err
	}
	updates := []ConversationPresentationProfile{selected}
	addPaletteUsage(usage, selected)
	for _, profile := range affected {
		resolvedPaletteID, reuse := leastUsedPalette(usage)
		profile.RequestedPaletteID = nil
		profile.ResolvedPaletteID = resolvedPaletteID
		profile.PaletteReuse = reuse
		profile.UpdatedAt = advanceTimestamp(profile.UpdatedAt, updatedAt)
		if err := profile.Validate(); err != nil {
			return nil, err
		}
		updates = append(updates, profile)
		addPaletteUsage(usage, profile)
	}
	return updates, nil
}

func resolveRequestedPalette(
	profile ConversationPresentationProfile,
	request PresentationSelectionRequest,
	usage map[conversationpalette.ConversationPaletteID][]string,
	updatedAt string,
) (ConversationPresentationProfile, error) {
	profile.PaletteSelection = request.Selection
	profile.RequestedPaletteID = clonePaletteID(request.RequestedPaletteID)
	profile.PaletteReuse = nil
	switch request.Selection {
	case PresentationSelectionExact:
		profile.ResolvedPaletteID = *request.RequestedPaletteID
	case PresentationSelectionAutoDistinct:
		profile.ResolvedPaletteID, profile.PaletteReuse = leastUsedPalette(usage)
	default:
		return ConversationPresentationProfile{}, fmt.Errorf(
			"unsupported palette selection mode %q",
			request.Selection,
		)
	}
	profile.UpdatedAt = advanceTimestamp(profile.UpdatedAt, updatedAt)
	if err := profile.Validate(); err != nil {
		return ConversationPresentationProfile{}, err
	}
	return profile, nil
}

func paletteUsage(
	presentations []activeConversationPresentation,
	workspaceID string,
	excluded map[string]bool,
) map[conversationpalette.ConversationPaletteID][]string {
	usage := map[conversationpalette.ConversationPaletteID][]string{}
	for _, presentation := range presentations {
		profile := presentation.Profile
		if presentation.WorkspaceID != workspaceID || excluded[profile.ConversationID] {
			continue
		}
		addPaletteUsage(usage, profile)
	}
	return usage
}

func addPaletteUsage(
	usage map[conversationpalette.ConversationPaletteID][]string,
	profile ConversationPresentationProfile,
) {
	usage[profile.ResolvedPaletteID] = append(
		usage[profile.ResolvedPaletteID],
		profile.ConversationID,
	)
}

func paletteIDsEqual(
	left *conversationpalette.ConversationPaletteID,
	right *conversationpalette.ConversationPaletteID,
) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
