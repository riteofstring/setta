package speech

import (
	"errors"
	"fmt"
	"time"
)

const (
	MasterVoiceSelectionStreamID             = "speech:master-voice-selection"
	MasterVoiceSelectionInitializedEventID   = "speech-master-voice-selection-initialized"
	MasterVoiceSelectionInitializedEventKind = "speech.master_voice_selection.initialized"
	MasterVoiceSelectionUpdatedEventKind     = "speech.master_voice_selection.updated"
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

func NewMasterVoiceSelectionInitialization(
	selection MasterVoiceSelection,
) MasterVoiceSelectionInitialization {
	return MasterVoiceSelectionInitialization{
		Catalog:   SynthesisVoiceCatalog(),
		Selection: CloneMasterVoiceSelection(selection),
	}
}

func NewMasterVoiceSelectionUpdate(
	previous MasterVoiceSelection,
	selection MasterVoiceSelection,
	reason MasterVoiceSelectionUpdateReason,
) MasterVoiceSelectionUpdate {
	return MasterVoiceSelectionUpdate{
		Catalog:   SynthesisVoiceCatalog(),
		Previous:  CloneMasterVoiceSelection(previous),
		Selection: CloneMasterVoiceSelection(selection),
		Reason:    reason,
	}
}

func (initialization MasterVoiceSelectionInitialization) Validate() error {
	available, err := validateVoiceCatalogSnapshot(initialization.Catalog)
	if err != nil {
		return fmt.Errorf("master voice selection initialization catalog: %w", err)
	}
	return initialization.Selection.validateAgainstCatalog(func(voiceID SpeechVoiceID) bool {
		return available[voiceID]
	})
}

func (update MasterVoiceSelectionUpdate) Validate() error {
	available, err := validateVoiceCatalogSnapshot(update.Catalog)
	if err != nil {
		return fmt.Errorf("master voice selection update catalog: %w", err)
	}
	validateAgainstSnapshot := func(selection MasterVoiceSelection) error {
		return selection.validateAgainstCatalog(func(voiceID SpeechVoiceID) bool {
			return available[voiceID]
		})
	}
	if err := validateAgainstSnapshot(update.Previous); err != nil {
		return fmt.Errorf("master voice selection update previous value: %w", err)
	}
	if err := validateAgainstSnapshot(update.Selection); err != nil {
		return fmt.Errorf("master voice selection update value: %w", err)
	}
	switch update.Reason {
	case MasterVoiceSelectionUpdateUserOverride,
		MasterVoiceSelectionUpdateNarratorOverride:
	default:
		return fmt.Errorf("unsupported master voice selection update reason %q", update.Reason)
	}
	previousAt, _ := time.Parse(time.RFC3339Nano, update.Previous.UpdatedAt)
	updatedAt, _ := time.Parse(time.RFC3339Nano, update.Selection.UpdatedAt)
	if !updatedAt.After(previousAt) {
		return errors.New("master voice selection update timestamp must advance")
	}
	return nil
}

func CloneMasterVoiceSelection(selection MasterVoiceSelection) MasterVoiceSelection {
	selection.RequestedVoiceID = cloneVoiceID(selection.RequestedVoiceID)
	selection.ResolvedVoiceID = cloneVoiceID(selection.ResolvedVoiceID)
	selection.Reuse = cloneVoiceReuse(selection.Reuse)
	return selection
}

func (selection MasterVoiceSelection) Validate() error {
	return selection.validateAgainstCatalog(LookupVoice)
}

func (selection MasterVoiceSelection) validateAgainstCatalog(
	available func(SpeechVoiceID) bool,
) error {
	if err := validateVoiceSelectionAgainstCatalog(
		selection.Selection,
		selection.RequestedVoiceID,
		selection.ResolvedVoiceID,
		available,
	); err != nil {
		return fmt.Errorf("master voice selection: %w", err)
	}
	if selection.ResolvedVoiceID == nil {
		return errors.New("master voice selection requires resolved voice id")
	}
	if selection.Reuse != nil {
		if selection.Selection == VoiceSelectionExact {
			return errors.New("exact master voice selection must not contain automatic reuse metadata")
		}
		if err := selection.Reuse.validateAgainstCatalog(*selection.ResolvedVoiceID, available); err != nil {
			return fmt.Errorf("master voice selection reuse: %w", err)
		}
	}
	return validateCanonicalTimestamp("master voice selection updatedAt", selection.UpdatedAt)
}

func ValidateVoiceSelection(
	mode VoiceSelectionMode,
	requestedVoiceID *SpeechVoiceID,
	resolvedVoiceID *SpeechVoiceID,
) error {
	return validateVoiceSelectionAgainstCatalog(
		mode,
		requestedVoiceID,
		resolvedVoiceID,
		LookupVoice,
	)
}

func validateVoiceSelectionAgainstCatalog(
	mode VoiceSelectionMode,
	requestedVoiceID *SpeechVoiceID,
	resolvedVoiceID *SpeechVoiceID,
	available func(SpeechVoiceID) bool,
) error {
	if available == nil {
		return errors.New("voice catalog lookup is required")
	}
	switch mode {
	case VoiceSelectionExact:
		return validateExactVoiceSelection(requestedVoiceID, resolvedVoiceID, available)
	case VoiceSelectionAutoDistinct:
		return validateAutomaticVoiceSelection(requestedVoiceID, resolvedVoiceID, available)
	default:
		return fmt.Errorf("unsupported voice selection mode %q", mode)
	}
}

func validateExactVoiceSelection(
	requestedVoiceID *SpeechVoiceID,
	resolvedVoiceID *SpeechVoiceID,
	available func(SpeechVoiceID) bool,
) error {
	if requestedVoiceID == nil {
		return errors.New("exact voice selection requires requested voice id")
	}
	if !available(*requestedVoiceID) {
		return unavailableVoiceError(*requestedVoiceID)
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

func validateAutomaticVoiceSelection(
	requestedVoiceID *SpeechVoiceID,
	resolvedVoiceID *SpeechVoiceID,
	available func(SpeechVoiceID) bool,
) error {
	if requestedVoiceID != nil {
		return errors.New("automatic voice selection must not contain requested voice id")
	}
	if resolvedVoiceID != nil && !available(*resolvedVoiceID) {
		return fmt.Errorf("automatic voice selection resolved unavailable voice %q", *resolvedVoiceID)
	}
	return nil
}

func validateVoiceCatalogSnapshot(catalog SpeechVoiceCatalog) (map[SpeechVoiceID]bool, error) {
	if !validValue(catalog.Provider, speechProviderValues) {
		return nil, fmt.Errorf("unsupported speech provider %q", catalog.Provider)
	}
	if err := validateRequiredTrimmedText("speech voice catalog version", catalog.Version); err != nil {
		return nil, err
	}
	if len(catalog.VoiceIDs) == 0 {
		return nil, errors.New("speech voice catalog must contain at least one voice")
	}
	available := make(map[SpeechVoiceID]bool, len(catalog.VoiceIDs))
	for _, voiceID := range catalog.VoiceIDs {
		if err := validateRequiredTrimmedText("speech voice catalog voice id", string(voiceID)); err != nil {
			return nil, err
		}
		if available[voiceID] {
			return nil, fmt.Errorf("speech voice catalog repeats voice %q", voiceID)
		}
		available[voiceID] = true
	}
	return available, nil
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

func cloneVoiceReuse(value *VoiceReuse) *VoiceReuse {
	if value == nil {
		return nil
	}
	result := *value
	result.ConflictingConversationIDs = append([]string(nil), value.ConflictingConversationIDs...)
	return &result
}
