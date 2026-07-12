package conversation

import (
	"fmt"
	"sort"

	"setta/internal/speech"
	"setta/internal/workspaceui/conversationpalette"
)

type presentationActivityState struct {
	paletteVisible bool
	narratorActive bool
}

func presentationActivityStates(
	presentations []activeConversationPresentation,
) map[string]presentationActivityState {
	states := make(map[string]presentationActivityState, len(presentations))
	for _, presentation := range presentations {
		states[presentation.Profile.ConversationID] = presentationActivityState{
			paletteVisible: presentation.PaletteVisible,
			narratorActive: presentation.NarratorActive,
		}
	}
	return states
}

func reconcileAutomaticPresentationIdentities(
	presentations []activeConversationPresentation,
	previous map[string]presentationActivityState,
	master speech.MasterVoiceSelection,
	updatedAt string,
) ([]ConversationPresentationProfile, *speech.MasterVoiceSelection, error) {
	if master.ResolvedVoiceID == nil {
		return nil, nil, fmt.Errorf("master voice selection has no resolved voice")
	}
	paletteUpdates, err := reconcileAutomaticPalettes(presentations, previous, updatedAt)
	if err != nil {
		return nil, nil, err
	}
	afterPalette := applyPresentationProfileUpdates(presentations, paletteUpdates)
	voiceUpdates, err := reconcileAutomaticNarratorVoices(
		afterPalette,
		previous,
		*master.ResolvedVoiceID,
		updatedAt,
	)
	if err != nil {
		return nil, nil, err
	}
	updates := mergePresentationProfileUpdates(paletteUpdates, voiceUpdates)
	afterVoice := applyPresentationProfileUpdates(presentations, updates)
	if master.Selection != speech.VoiceSelectionAutoDistinct {
		return updates, nil, nil
	}

	refreshed, changed, err := speech.RefreshAutomaticMasterVoiceSelection(
		master,
		narratorVoiceAssignments(afterVoice, nil),
		advanceTimestamp(master.UpdatedAt, updatedAt),
	)
	if err != nil || !changed {
		return updates, nil, err
	}
	followups, err := reconcileAutomaticNarratorVoices(
		afterVoice,
		previous,
		*refreshed.ResolvedVoiceID,
		refreshed.UpdatedAt,
	)
	if err != nil {
		return nil, nil, err
	}
	updates = mergePresentationProfileUpdates(updates, followups)
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

func reconcileAutomaticPalettes(
	presentations []activeConversationPresentation,
	previous map[string]presentationActivityState,
	updatedAt string,
) ([]ConversationPresentationProfile, error) {
	updates := make([]ConversationPresentationProfile, 0)
	workspaces := map[string][]activeConversationPresentation{}
	for _, presentation := range presentations {
		profile := presentation.Profile
		if profile.PaletteSelection == PresentationSelectionAutoDistinct &&
			!presentation.PaletteVisible && profile.PaletteReuse != nil {
			profile.PaletteReuse = nil
			profile.UpdatedAt = advanceTimestamp(profile.UpdatedAt, updatedAt)
			updates = append(updates, profile)
			presentation = presentation.withProfile(profile)
		}
		if presentation.PaletteVisible {
			workspaces[presentation.WorkspaceID] = append(
				workspaces[presentation.WorkspaceID],
				presentation,
			)
		}
	}
	workspaceIDs := make([]string, 0, len(workspaces))
	for workspaceID := range workspaces {
		workspaceIDs = append(workspaceIDs, workspaceID)
	}
	sort.Strings(workspaceIDs)
	for _, workspaceID := range workspaceIDs {
		workspaceUpdates, err := reconcileWorkspaceAutomaticPalettes(
			workspaces[workspaceID],
			previous,
			updatedAt,
		)
		if err != nil {
			return nil, err
		}
		updates = mergePresentationProfileUpdates(updates, workspaceUpdates)
	}
	return updates, nil
}

func reconcileWorkspaceAutomaticPalettes(
	presentations []activeConversationPresentation,
	previous map[string]presentationActivityState,
	updatedAt string,
) ([]ConversationPresentationProfile, error) {
	usage := map[conversationpalette.ConversationPaletteID][]string{}
	automatic := make([]activeConversationPresentation, 0, len(presentations))
	for _, presentation := range presentations {
		profile := presentation.Profile
		if profile.PaletteSelection == PresentationSelectionExact {
			addPaletteUsage(usage, profile)
			continue
		}
		automatic = append(automatic, presentation)
	}
	sortPresentationActivityPriority(
		automatic,
		previous,
		true,
		func(presentation activeConversationPresentation) bool {
			return len(usage[presentation.Profile.ResolvedPaletteID]) == 0
		},
	)
	updates := make([]ConversationPresentationProfile, 0, len(automatic))
	for _, presentation := range automatic {
		profile := presentation.Profile
		resolvedPaletteID, reuse := leastUsedPalettePreferring(usage, profile.ResolvedPaletteID)
		if profile.ResolvedPaletteID != resolvedPaletteID ||
			!presentationReuseEqual(profile.PaletteReuse, reuse) {
			profile.ResolvedPaletteID = resolvedPaletteID
			profile.PaletteReuse = reuse
			profile.UpdatedAt = advanceTimestamp(profile.UpdatedAt, updatedAt)
			if err := profile.Validate(); err != nil {
				return nil, err
			}
			updates = append(updates, profile)
		}
		addPaletteUsage(usage, profile)
	}
	return updates, nil
}

func reconcileAutomaticNarratorVoices(
	presentations []activeConversationPresentation,
	previous map[string]presentationActivityState,
	masterVoiceID speech.SpeechVoiceID,
	updatedAt string,
) ([]ConversationPresentationProfile, error) {
	updates, assignments, automatic := narratorVoiceReconciliationInputs(
		presentations,
		updatedAt,
	)
	sortPresentationActivityPriority(
		automatic,
		previous,
		false,
		func(presentation activeConversationPresentation) bool {
			return narratorVoicePreferenceUnclaimed(presentation, masterVoiceID, assignments)
		},
	)
	for _, presentation := range automatic {
		profile := presentation.Profile
		allocation, err := speech.AllocateNarratorVoicePreferring(
			masterVoiceID,
			assignments,
			profile.ResolvedNarratorVoiceID,
		)
		if err != nil {
			return nil, err
		}
		reuse := presentationReuseFromVoiceAllocation(allocation)
		if automaticNarratorVoiceChanged(profile, allocation, reuse) {
			profile.ResolvedNarratorVoiceID = voiceIDPointer(allocation.VoiceID)
			profile.NarratorVoiceReuse = reuse
			profile.UpdatedAt = advanceTimestamp(profile.UpdatedAt, updatedAt)
			if err := profile.Validate(); err != nil {
				return nil, err
			}
			updates = append(updates, profile)
		}
		assignments = append(assignments, narratorVoiceAssignment(profile))
	}
	return updates, nil
}

func narratorVoiceReconciliationInputs(
	presentations []activeConversationPresentation,
	updatedAt string,
) (
	[]ConversationPresentationProfile,
	[]speech.NarratorVoiceAssignment,
	[]activeConversationPresentation,
) {
	updates := make([]ConversationPresentationProfile, 0)
	assignments := make([]speech.NarratorVoiceAssignment, 0, len(presentations))
	automatic := make([]activeConversationPresentation, 0, len(presentations))
	for _, presentation := range presentations {
		profile, cleared := clearInactiveNarratorVoiceReuse(presentation, updatedAt)
		if cleared {
			updates = append(updates, profile)
			presentation = presentation.withProfile(profile)
		}
		if !presentation.NarratorActive {
			continue
		}
		if presentation.Profile.NarratorVoiceSelection == speech.VoiceSelectionExact {
			assignments = append(assignments, narratorVoiceAssignment(presentation.Profile))
			continue
		}
		automatic = append(automatic, presentation)
	}
	return updates, assignments, automatic
}

func clearInactiveNarratorVoiceReuse(
	presentation activeConversationPresentation,
	updatedAt string,
) (ConversationPresentationProfile, bool) {
	profile := presentation.Profile
	if profile.NarratorVoiceSelection != speech.VoiceSelectionAutoDistinct ||
		presentation.NarratorActive || profile.NarratorVoiceReuse == nil {
		return profile, false
	}
	profile.NarratorVoiceReuse = nil
	profile.UpdatedAt = advanceTimestamp(profile.UpdatedAt, updatedAt)
	return profile, true
}

func narratorVoicePreferenceUnclaimed(
	presentation activeConversationPresentation,
	masterVoiceID speech.SpeechVoiceID,
	assignments []speech.NarratorVoiceAssignment,
) bool {
	voiceID := presentation.Profile.ResolvedNarratorVoiceID
	return voiceID != nil && *voiceID != masterVoiceID &&
		speech.VoiceReuseForAssignments(*voiceID, assignments) == nil
}

func automaticNarratorVoiceChanged(
	profile ConversationPresentationProfile,
	allocation speech.NarratorVoiceAllocation,
	reuse *PresentationReuse,
) bool {
	return profile.ResolvedNarratorVoiceID == nil ||
		*profile.ResolvedNarratorVoiceID != allocation.VoiceID ||
		!presentationReuseEqual(profile.NarratorVoiceReuse, reuse)
}

func sortPresentationActivityPriority(
	presentations []activeConversationPresentation,
	previous map[string]presentationActivityState,
	palette bool,
	preferredUnclaimed func(activeConversationPresentation) bool,
) {
	sort.SliceStable(presentations, func(left int, right int) bool {
		leftWasActive := presentationWasActive(presentations[left], previous, palette)
		rightWasActive := presentationWasActive(presentations[right], previous, palette)
		if leftWasActive != rightWasActive {
			return leftWasActive
		}
		leftUnclaimed := preferredUnclaimed(presentations[left])
		rightUnclaimed := preferredUnclaimed(presentations[right])
		if leftUnclaimed != rightUnclaimed {
			return leftUnclaimed
		}
		if presentations[left].CreatedAt != presentations[right].CreatedAt {
			return presentations[left].CreatedAt < presentations[right].CreatedAt
		}
		return presentations[left].Profile.ConversationID <
			presentations[right].Profile.ConversationID
	})
}

func presentationWasActive(
	presentation activeConversationPresentation,
	previous map[string]presentationActivityState,
	palette bool,
) bool {
	state, ok := previous[presentation.Profile.ConversationID]
	if !ok {
		return presentation.PaletteVisible && palette || presentation.NarratorActive && !palette
	}
	if palette {
		return state.paletteVisible
	}
	return state.narratorActive
}

func leastUsedPalettePreferring(
	usage map[conversationpalette.ConversationPaletteID][]string,
	preferred conversationpalette.ConversationPaletteID,
) (conversationpalette.ConversationPaletteID, *PresentationReuse) {
	selected, _ := leastUsedPalette(usage)
	if _, ok := conversationpalette.Lookup(preferred); ok &&
		len(usage[preferred]) == len(usage[selected]) {
		selected = preferred
	}
	if len(usage[selected]) == 0 {
		return selected, nil
	}
	return selected, &PresentationReuse{
		Reason:                     PresentationReuseCatalogExhausted,
		ResolvedChoiceID:           string(selected),
		ConflictingConversationIDs: append([]string(nil), usage[selected]...),
	}
}

func presentationReuseEqual(left *PresentationReuse, right *PresentationReuse) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	if left.Reason != right.Reason || left.ResolvedChoiceID != right.ResolvedChoiceID ||
		len(left.ConflictingConversationIDs) != len(right.ConflictingConversationIDs) {
		return false
	}
	for index := range left.ConflictingConversationIDs {
		if left.ConflictingConversationIDs[index] != right.ConflictingConversationIDs[index] {
			return false
		}
	}
	return true
}
