package conversation

import (
	"fmt"
	"sort"

	"setta/internal/conversation/conversationpalette"
	"setta/internal/speech"
)

type presentationActivityState struct {
	visible        bool
	narratorActive bool
}

func presentationActivityStates(
	presentations []activeConversationPresentation,
) map[string]presentationActivityState {
	states := make(map[string]presentationActivityState, len(presentations))
	for _, presentation := range presentations {
		states[presentation.Profile.ConversationID] = presentationActivityState{
			visible:        presentation.Visible,
			narratorActive: presentation.NarratorActive,
		}
	}
	return states
}

func reconcileAutomaticPresentationIdentities(
	presentations []activeConversationPresentation,
	previous map[string]presentationActivityState,
	director speech.DirectorVoiceSelection,
	updatedAt string,
) ([]ConversationPresentationProfile, *speech.DirectorVoiceSelection, error) {
	if director.ResolvedVoiceID == nil {
		return nil, nil, fmt.Errorf("director voice selection has no resolved voice")
	}
	paletteUpdates, err := reconcileAutomaticPalettes(presentations, previous, updatedAt)
	if err != nil {
		return nil, nil, err
	}
	afterPalette := applyPresentationProfileUpdates(presentations, paletteUpdates)
	voiceUpdates, err := reconcileAutomaticNarratorVoices(
		afterPalette,
		previous,
		*director.ResolvedVoiceID,
		updatedAt,
	)
	if err != nil {
		return nil, nil, err
	}
	updates := mergePresentationProfileUpdates(paletteUpdates, voiceUpdates)
	afterVoice := applyPresentationProfileUpdates(presentations, updates)
	if director.Selection != speech.VoiceSelectionAutoDistinct {
		return updates, nil, nil
	}

	refreshed, changed, err := speech.RefreshAutomaticDirectorVoiceSelection(
		director,
		narratorVoiceAssignments(afterVoice, nil),
		advanceTimestamp(director.UpdatedAt, updatedAt),
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
			!presentation.Visible && profile.PaletteReuse != nil {
			profile.PaletteReuse = nil
			profile.UpdatedAt = advanceTimestamp(profile.UpdatedAt, updatedAt)
			updates = append(updates, profile)
			presentation = presentation.withProfile(profile)
		}
		if presentation.Visible {
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
	directorVoiceID speech.SpeechVoiceID,
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
			return narratorVoicePreferenceUnclaimed(presentation, directorVoiceID, assignments)
		},
	)
	for _, presentation := range automatic {
		profile := presentation.Profile
		allocation, err := speech.AllocateNarratorVoicePreferring(
			directorVoiceID,
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
	directorVoiceID speech.SpeechVoiceID,
	assignments []speech.NarratorVoiceAssignment,
) bool {
	voiceID := presentation.Profile.ResolvedNarratorVoiceID
	return voiceID != nil && *voiceID != directorVoiceID &&
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
		return presentation.Visible && palette || presentation.NarratorActive && !palette
	}
	if palette {
		return state.visible
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
