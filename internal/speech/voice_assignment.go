package speech

import (
	"errors"
	"fmt"
	"sort"
)

func (request VoiceSelectionRequest) Validate() error {
	switch request.Selection {
	case VoiceSelectionExact:
		if request.RequestedVoiceID == nil {
			return errors.New("exact voice selection requires requested voice id")
		}
		if !LookupVoice(*request.RequestedVoiceID) {
			return unavailableVoiceError(*request.RequestedVoiceID)
		}
		return nil
	case VoiceSelectionAutoDistinct:
		if request.RequestedVoiceID != nil {
			return errors.New("automatic voice selection must not contain requested voice id")
		}
		return nil
	default:
		return fmt.Errorf("unsupported voice selection mode %q", request.Selection)
	}
}

func ResolveMasterVoiceSelection(
	request VoiceSelectionRequest,
	assignments []NarratorVoiceAssignment,
	updatedAt string,
) (MasterVoiceSelection, error) {
	if err := request.Validate(); err != nil {
		return MasterVoiceSelection{}, err
	}
	var resolved SpeechVoiceID
	switch request.Selection {
	case VoiceSelectionExact:
		resolved = *request.RequestedVoiceID
	case VoiceSelectionAutoDistinct:
		resolved = leastUsedVoice(SynthesisVoiceCatalog().VoiceIDs, assignments)
	default:
		return MasterVoiceSelection{}, fmt.Errorf("unsupported voice selection mode %q", request.Selection)
	}
	selection := MasterVoiceSelection{
		Selection:        request.Selection,
		RequestedVoiceID: cloneVoiceID(request.RequestedVoiceID),
		ResolvedVoiceID:  cloneVoiceID(&resolved),
		UpdatedAt:        updatedAt,
	}
	if err := selection.Validate(); err != nil {
		return MasterVoiceSelection{}, err
	}
	return selection, nil
}

func AllocateNarratorVoice(
	masterVoiceID SpeechVoiceID,
	assignments []NarratorVoiceAssignment,
) (NarratorVoiceAllocation, error) {
	if !LookupVoice(masterVoiceID) {
		return NarratorVoiceAllocation{}, unavailableVoiceError(masterVoiceID)
	}
	return allocateNarratorVoice(SynthesisVoiceCatalog().VoiceIDs, masterVoiceID, assignments)
}

func allocateNarratorVoice(
	catalog []SpeechVoiceID,
	masterVoiceID SpeechVoiceID,
	assignments []NarratorVoiceAssignment,
) (NarratorVoiceAllocation, error) {
	if len(catalog) == 0 {
		return NarratorVoiceAllocation{}, errors.New("speech voice catalog is empty")
	}
	choices := make([]SpeechVoiceID, 0, len(catalog))
	for _, voiceID := range catalog {
		if voiceID != masterVoiceID {
			choices = append(choices, voiceID)
		}
	}
	if len(choices) == 0 {
		return NarratorVoiceAllocation{}, errors.New("speech voice catalog has no narrator voice distinct from the master")
	}
	selected := leastUsedVoice(choices, assignments)
	conflicts := conflictingConversationIDs(selected, assignments)
	allocation := NarratorVoiceAllocation{VoiceID: selected}
	if len(conflicts) > 0 {
		allocation.Reuse = &VoiceReuse{
			Reason:                     VoiceReuseCatalogExhausted,
			ResolvedVoiceID:            selected,
			ConflictingConversationIDs: conflicts,
		}
	}
	return allocation, nil
}

func leastUsedVoice(
	choices []SpeechVoiceID,
	assignments []NarratorVoiceAssignment,
) SpeechVoiceID {
	usage := make(map[SpeechVoiceID]int, len(choices))
	for _, assignment := range assignments {
		usage[assignment.VoiceID]++
	}
	selected := choices[0]
	for _, candidate := range choices[1:] {
		if usage[candidate] < usage[selected] {
			selected = candidate
		}
	}
	return selected
}

func conflictingConversationIDs(
	voiceID SpeechVoiceID,
	assignments []NarratorVoiceAssignment,
) []string {
	conflicts := make([]string, 0)
	seen := map[string]bool{}
	for _, assignment := range assignments {
		if assignment.VoiceID != voiceID || seen[assignment.ConversationID] {
			continue
		}
		seen[assignment.ConversationID] = true
		conflicts = append(conflicts, assignment.ConversationID)
	}
	sort.Strings(conflicts)
	return conflicts
}

func (reuse VoiceReuse) Validate(resolvedVoiceID SpeechVoiceID) error {
	if reuse.Reason != VoiceReuseCatalogExhausted {
		return fmt.Errorf("unsupported voice reuse reason %q", reuse.Reason)
	}
	if !LookupVoice(reuse.ResolvedVoiceID) {
		return unavailableVoiceError(reuse.ResolvedVoiceID)
	}
	if reuse.ResolvedVoiceID != resolvedVoiceID {
		return fmt.Errorf(
			"voice reuse resolved %q, want assignment %q",
			reuse.ResolvedVoiceID,
			resolvedVoiceID,
		)
	}
	if len(reuse.ConflictingConversationIDs) == 0 {
		return errors.New("voice reuse must identify at least one conflicting conversation")
	}
	seen := map[string]bool{}
	for _, conversationID := range reuse.ConflictingConversationIDs {
		if err := validateRequiredTrimmedText("voice reuse conflicting conversation id", conversationID); err != nil {
			return err
		}
		if seen[conversationID] {
			return fmt.Errorf("voice reuse conflicting conversation %q is duplicated", conversationID)
		}
		seen[conversationID] = true
	}
	return nil
}
