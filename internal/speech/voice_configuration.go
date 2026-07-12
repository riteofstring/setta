package speech

import (
	"errors"
	"fmt"
	"time"
)

func SynthesisVoiceCatalog() SpeechVoiceCatalog {
	return SpeechVoiceCatalog{
		Provider: SpeechProviderOpenAI,
		Version:  openAIContractSourceCommit,
		VoiceIDs: append([]SpeechVoiceID(nil), openAISpeechVoiceIDs[:]...),
	}
}

func LookupVoice(voiceID SpeechVoiceID) bool {
	for _, candidate := range openAISpeechVoiceIDs {
		if candidate == voiceID {
			return true
		}
	}
	return false
}

func DefaultMasterVoiceSelection(updatedAt string) MasterVoiceSelection {
	requested := SynthesisVoice
	resolved := SynthesisVoice
	return MasterVoiceSelection{
		Selection:        VoiceSelectionExact,
		RequestedVoiceID: &requested,
		ResolvedVoiceID:  &resolved,
		UpdatedAt:        updatedAt,
	}
}

func CloneMasterVoiceSelection(selection MasterVoiceSelection) MasterVoiceSelection {
	selection.RequestedVoiceID = cloneVoiceID(selection.RequestedVoiceID)
	selection.ResolvedVoiceID = cloneVoiceID(selection.ResolvedVoiceID)
	return selection
}

func (selection MasterVoiceSelection) Validate() error {
	if err := ValidateVoiceSelection(
		selection.Selection,
		selection.RequestedVoiceID,
		selection.ResolvedVoiceID,
	); err != nil {
		return fmt.Errorf("master voice selection: %w", err)
	}
	return validateCanonicalTimestamp("master voice selection updatedAt", selection.UpdatedAt)
}

func ValidateVoiceSelection(
	mode VoiceSelectionMode,
	requestedVoiceID *SpeechVoiceID,
	resolvedVoiceID *SpeechVoiceID,
) error {
	switch mode {
	case VoiceSelectionExact:
		return validateExactVoiceSelection(requestedVoiceID, resolvedVoiceID)
	case VoiceSelectionAutoDistinct:
		return validateAutomaticVoiceSelection(requestedVoiceID, resolvedVoiceID)
	default:
		return fmt.Errorf("unsupported voice selection mode %q", mode)
	}
}

func validateExactVoiceSelection(requestedVoiceID, resolvedVoiceID *SpeechVoiceID) error {
	if requestedVoiceID == nil {
		return errors.New("exact voice selection requires requested voice id")
	}
	if !LookupVoice(*requestedVoiceID) {
		return fmt.Errorf("exact voice selection requested unavailable voice %q", *requestedVoiceID)
	}
	if resolvedVoiceID == nil {
		return errors.New("exact voice selection requires resolved voice id")
	}
	if *resolvedVoiceID != *requestedVoiceID {
		return fmt.Errorf(
			"exact voice selection resolved %q, want requested %q",
			*resolvedVoiceID,
			*requestedVoiceID,
		)
	}
	return nil
}

func validateAutomaticVoiceSelection(requestedVoiceID, resolvedVoiceID *SpeechVoiceID) error {
	if requestedVoiceID != nil {
		return errors.New("automatic voice selection must not contain requested voice id")
	}
	if resolvedVoiceID != nil && !LookupVoice(*resolvedVoiceID) {
		return fmt.Errorf("automatic voice selection resolved unavailable voice %q", *resolvedVoiceID)
	}
	return nil
}

func validateCanonicalTimestamp(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return fmt.Errorf("%s must be RFC3339: %w", label, err)
	}
	_, offset := parsed.Zone()
	if offset != 0 || parsed.UTC().Format(time.RFC3339Nano) != value {
		return fmt.Errorf("%s must be a canonical UTC RFC3339 timestamp", label)
	}
	return nil
}

func cloneVoiceID(value *SpeechVoiceID) *SpeechVoiceID {
	if value == nil {
		return nil
	}
	result := *value
	return &result
}
