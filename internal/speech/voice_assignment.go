package speech

import (
	"errors"
	"fmt"
	"sort"
)

func (request VoiceSelectionRequest) Validate() error {
	return validateVoiceSelectionRequestAgainstCatalog(request, LookupVoice)
}

func validateVoiceSelectionRequestAgainstCatalog(
	request VoiceSelectionRequest,
	available func(SpeechVoiceID) bool,
) error {
	if available == nil {
		return errors.New("voice catalog lookup is required")
	}
	switch request.Selection {
	case VoiceSelectionExact:
		if request.RequestedVoiceID == nil {
			return errors.New("exact voice selection requires requested voice id")
		}
		if !available(*request.RequestedVoiceID) {
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
	var reuse *VoiceReuse
	switch request.Selection {
	case VoiceSelectionExact:
		resolved = *request.RequestedVoiceID
	case VoiceSelectionAutoDistinct:
		resolved = leastUsedVoice(SynthesisVoiceCatalog().VoiceIDs, assignments)
		reuse = VoiceReuseForAssignments(resolved, assignments)
	default:
		return MasterVoiceSelection{}, fmt.Errorf("unsupported voice selection mode %q", request.Selection)
	}
	selection := MasterVoiceSelection{
		Selection:        request.Selection,
		RequestedVoiceID: cloneVoiceID(request.RequestedVoiceID),
		ResolvedVoiceID:  cloneVoiceID(&resolved),
		Reuse:            reuse,
		UpdatedAt:        updatedAt,
	}
	if err := selection.Validate(); err != nil {
		return MasterVoiceSelection{}, err
	}
	return selection, nil
}

func RefreshAutomaticMasterVoiceSelection(
	previous MasterVoiceSelection,
	assignments []NarratorVoiceAssignment,
	updatedAt string,
) (MasterVoiceSelection, bool, error) {
	if err := previous.Validate(); err != nil {
		return MasterVoiceSelection{}, false, err
	}
	if previous.Selection != VoiceSelectionAutoDistinct || previous.ResolvedVoiceID == nil {
		return MasterVoiceSelection{}, false, errors.New("automatic master voice selection is required")
	}
	resolved := leastUsedVoicePreferring(
		SynthesisVoiceCatalog().VoiceIDs,
		assignments,
		*previous.ResolvedVoiceID,
	)
	reuse := VoiceReuseForAssignments(resolved, assignments)
	if resolved == *previous.ResolvedVoiceID && voiceReuseEqual(reuse, previous.Reuse) {
		return CloneMasterVoiceSelection(previous), false, nil
	}
	selection := MasterVoiceSelection{
		Selection:       VoiceSelectionAutoDistinct,
		ResolvedVoiceID: cloneVoiceID(&resolved),
		Reuse:           reuse,
		UpdatedAt:       updatedAt,
	}
	if err := selection.Validate(); err != nil {
		return MasterVoiceSelection{}, false, err
	}
	return selection, true, nil
}

func AllocateNarratorVoice(
	masterVoiceID SpeechVoiceID,
	assignments []NarratorVoiceAssignment,
) (NarratorVoiceAllocation, error) {
	return AllocateNarratorVoicePreferring(masterVoiceID, assignments, nil)
}

func AllocateNarratorVoicePreferring(
	masterVoiceID SpeechVoiceID,
	assignments []NarratorVoiceAssignment,
	preferredVoiceID *SpeechVoiceID,
) (NarratorVoiceAllocation, error) {
	if !LookupVoice(masterVoiceID) {
		return NarratorVoiceAllocation{}, unavailableVoiceError(masterVoiceID)
	}
	return allocateNarratorVoice(
		SynthesisVoiceCatalog().VoiceIDs,
		masterVoiceID,
		assignments,
		preferredVoiceID,
	)
}

func allocateNarratorVoice(
	catalog []SpeechVoiceID,
	masterVoiceID SpeechVoiceID,
	assignments []NarratorVoiceAssignment,
	preferredVoiceID *SpeechVoiceID,
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
	if preferredVoiceID != nil &&
		*preferredVoiceID != masterVoiceID &&
		voiceUsage(*preferredVoiceID, assignments) == voiceUsage(selected, assignments) {
		for _, choice := range choices {
			if choice == *preferredVoiceID {
				selected = choice
				break
			}
		}
	}
	allocation := NarratorVoiceAllocation{VoiceID: selected}
	allocation.Reuse = VoiceReuseForAssignments(selected, assignments)
	return allocation, nil
}

func VoiceReuseForAssignments(
	voiceID SpeechVoiceID,
	assignments []NarratorVoiceAssignment,
) *VoiceReuse {
	conflicts := conflictingConversationIDs(voiceID, assignments)
	if len(conflicts) == 0 {
		return nil
	}
	return &VoiceReuse{
		Reason:                     VoiceReuseCatalogExhausted,
		ResolvedVoiceID:            voiceID,
		ConflictingConversationIDs: conflicts,
	}
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

func leastUsedVoicePreferring(
	choices []SpeechVoiceID,
	assignments []NarratorVoiceAssignment,
	preferred SpeechVoiceID,
) SpeechVoiceID {
	selected := leastUsedVoice(choices, assignments)
	selectedUsage := voiceUsage(selected, assignments)
	for _, candidate := range choices {
		if candidate == preferred && voiceUsage(candidate, assignments) == selectedUsage {
			return candidate
		}
	}
	return selected
}

func voiceUsage(voiceID SpeechVoiceID, assignments []NarratorVoiceAssignment) int {
	usage := 0
	for _, assignment := range assignments {
		if assignment.VoiceID == voiceID {
			usage++
		}
	}
	return usage
}

func voiceReuseEqual(left *VoiceReuse, right *VoiceReuse) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	if left.Reason != right.Reason || left.ResolvedVoiceID != right.ResolvedVoiceID ||
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
	return reuse.validateAgainstCatalog(resolvedVoiceID, LookupVoice)
}

func (reuse VoiceReuse) validateAgainstCatalog(
	resolvedVoiceID SpeechVoiceID,
	available func(SpeechVoiceID) bool,
) error {
	if reuse.Reason != VoiceReuseCatalogExhausted {
		return fmt.Errorf("unsupported voice reuse reason %q", reuse.Reason)
	}
	if available == nil {
		return errors.New("voice reuse catalog lookup is required")
	}
	if !available(reuse.ResolvedVoiceID) {
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
