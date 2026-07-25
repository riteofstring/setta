package conversation

import (
	"setta/internal/speech"
	"setta/internal/workspaceui/conversationpalette"
)

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
			presentation = presentation.withProfile(update)
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

func addPaletteUsage(
	usage map[conversationpalette.ConversationPaletteID][]string,
	profile ConversationPresentationProfile,
) {
	usage[profile.ResolvedPaletteID] = append(
		usage[profile.ResolvedPaletteID],
		profile.ConversationID,
	)
}
