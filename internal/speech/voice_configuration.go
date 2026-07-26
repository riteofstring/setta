package speech

import (
	"errors"
	"fmt"
	"time"
)

const (
	DirectorVoiceSelectionStreamID             = "speech:director-voice-selection"
	DirectorVoiceSelectionInitializedEventID   = "speech-director-voice-selection-initialized"
	DirectorVoiceSelectionInitializedEventKind = "speech.director_voice_selection.initialized"
	DirectorVoiceSelectionUpdatedEventKind     = "speech.director_voice_selection.updated"
	NarratorVoiceDefaultStreamID               = "speech:narrator-voice-default"
	NarratorVoiceDefaultInitializedEventID     = "speech-narrator-voice-default-initialized"
	NarratorVoiceDefaultInitializedEventKind   = "speech.narrator_voice_default.initialized"
	NarratorVoiceDefaultUpdatedEventKind       = "speech.narrator_voice_default.updated"
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

func DefaultDirectorVoiceSelection(updatedAt string) DirectorVoiceSelection {
	requested := SynthesisVoice
	resolved := SynthesisVoice
	return DirectorVoiceSelection{
		Selection:        VoiceSelectionExact,
		RequestedVoiceID: &requested,
		ResolvedVoiceID:  &resolved,
		UpdatedAt:        updatedAt,
	}
}

func DefaultNarratorVoiceSelection(updatedAt string) NarratorVoiceDefault {
	return NarratorVoiceDefault{
		Selection: VoiceSelectionAutoDistinct,
		UpdatedAt: updatedAt,
	}
}

func NewNarratorVoiceDefaultInitialization(
	value NarratorVoiceDefault,
) NarratorVoiceDefaultInitialization {
	return NarratorVoiceDefaultInitialization{
		Catalog: SynthesisVoiceCatalog(),
		Default: CloneNarratorVoiceDefault(value),
	}
}

func NewNarratorVoiceDefaultUpdate(
	previous NarratorVoiceDefault,
	value NarratorVoiceDefault,
) NarratorVoiceDefaultUpdate {
	return NarratorVoiceDefaultUpdate{
		Catalog:  SynthesisVoiceCatalog(),
		Previous: CloneNarratorVoiceDefault(previous),
		Default:  CloneNarratorVoiceDefault(value),
	}
}

func (initialization NarratorVoiceDefaultInitialization) Validate() error {
	available, err := validateVoiceCatalogSnapshot(initialization.Catalog)
	if err != nil {
		return fmt.Errorf("narrator voice default initialization catalog: %w", err)
	}
	return initialization.Default.validateAgainstCatalog(func(voiceID SpeechVoiceID) bool {
		return available[voiceID]
	})
}

func (update NarratorVoiceDefaultUpdate) Validate() error {
	available, err := validateVoiceCatalogSnapshot(update.Catalog)
	if err != nil {
		return fmt.Errorf("narrator voice default update catalog: %w", err)
	}
	validate := func(value NarratorVoiceDefault) error {
		return value.validateAgainstCatalog(func(voiceID SpeechVoiceID) bool {
			return available[voiceID]
		})
	}
	if err := validate(update.Previous); err != nil {
		return fmt.Errorf("narrator voice default update previous value: %w", err)
	}
	if err := validate(update.Default); err != nil {
		return fmt.Errorf("narrator voice default update value: %w", err)
	}
	previousAt, _ := time.Parse(time.RFC3339Nano, update.Previous.UpdatedAt)
	updatedAt, _ := time.Parse(time.RFC3339Nano, update.Default.UpdatedAt)
	if !updatedAt.After(previousAt) {
		return errors.New("narrator voice default update timestamp must advance")
	}
	return nil
}

func (value NarratorVoiceDefault) Validate() error {
	return value.validateAgainstCatalog(LookupVoice)
}

func (value NarratorVoiceDefault) validateAgainstCatalog(
	available func(SpeechVoiceID) bool,
) error {
	if err := validateVoiceSelectionRequestAgainstCatalog(
		VoiceSelectionRequest{
			Selection:        value.Selection,
			RequestedVoiceID: value.RequestedVoiceID,
		},
		available,
	); err != nil {
		return fmt.Errorf("narrator voice default: %w", err)
	}
	return validateCanonicalTimestamp("narrator voice default updatedAt", value.UpdatedAt)
}

func (value NarratorVoiceDefault) Request() VoiceSelectionRequest {
	return VoiceSelectionRequest{
		Selection:        value.Selection,
		RequestedVoiceID: cloneVoiceID(value.RequestedVoiceID),
	}
}

func CloneNarratorVoiceDefault(value NarratorVoiceDefault) NarratorVoiceDefault {
	value.RequestedVoiceID = cloneVoiceID(value.RequestedVoiceID)
	return value
}

func NewDirectorVoiceSelectionInitialization(
	selection DirectorVoiceSelection,
) DirectorVoiceSelectionInitialization {
	return DirectorVoiceSelectionInitialization{
		Catalog:   SynthesisVoiceCatalog(),
		Selection: CloneDirectorVoiceSelection(selection),
	}
}

func NewDirectorVoiceSelectionUpdate(
	previous DirectorVoiceSelection,
	selection DirectorVoiceSelection,
	reason DirectorVoiceSelectionUpdateReason,
) DirectorVoiceSelectionUpdate {
	return DirectorVoiceSelectionUpdate{
		Catalog:   SynthesisVoiceCatalog(),
		Previous:  CloneDirectorVoiceSelection(previous),
		Selection: CloneDirectorVoiceSelection(selection),
		Reason:    reason,
	}
}

func (initialization DirectorVoiceSelectionInitialization) Validate() error {
	available, err := validateVoiceCatalogSnapshot(initialization.Catalog)
	if err != nil {
		return fmt.Errorf("director voice selection initialization catalog: %w", err)
	}
	return initialization.Selection.validateAgainstCatalog(func(voiceID SpeechVoiceID) bool {
		return available[voiceID]
	})
}

func (update DirectorVoiceSelectionUpdate) Validate() error {
	available, err := validateVoiceCatalogSnapshot(update.Catalog)
	if err != nil {
		return fmt.Errorf("director voice selection update catalog: %w", err)
	}
	validateAgainstSnapshot := func(selection DirectorVoiceSelection) error {
		return selection.validateAgainstCatalog(func(voiceID SpeechVoiceID) bool {
			return available[voiceID]
		})
	}
	if err := validateAgainstSnapshot(update.Previous); err != nil {
		return fmt.Errorf("director voice selection update previous value: %w", err)
	}
	if err := validateAgainstSnapshot(update.Selection); err != nil {
		return fmt.Errorf("director voice selection update value: %w", err)
	}
	switch update.Reason {
	case DirectorVoiceSelectionUpdateUserOverride,
		DirectorVoiceSelectionUpdateNarratorAssignment:
	default:
		return fmt.Errorf("unsupported director voice selection update reason %q", update.Reason)
	}
	previousAt, _ := time.Parse(time.RFC3339Nano, update.Previous.UpdatedAt)
	updatedAt, _ := time.Parse(time.RFC3339Nano, update.Selection.UpdatedAt)
	if !updatedAt.After(previousAt) {
		return errors.New("director voice selection update timestamp must advance")
	}
	return nil
}

func CloneDirectorVoiceSelection(selection DirectorVoiceSelection) DirectorVoiceSelection {
	selection.RequestedVoiceID = cloneVoiceID(selection.RequestedVoiceID)
	selection.ResolvedVoiceID = cloneVoiceID(selection.ResolvedVoiceID)
	selection.Reuse = cloneVoiceReuse(selection.Reuse)
	return selection
}

func (selection DirectorVoiceSelection) Validate() error {
	return selection.validateAgainstCatalog(LookupVoice)
}

func (selection DirectorVoiceSelection) validateAgainstCatalog(
	available func(SpeechVoiceID) bool,
) error {
	if err := validateVoiceSelectionAgainstCatalog(
		selection.Selection,
		selection.RequestedVoiceID,
		selection.ResolvedVoiceID,
		available,
	); err != nil {
		return fmt.Errorf("director voice selection: %w", err)
	}
	if selection.ResolvedVoiceID == nil {
		return errors.New("director voice selection requires resolved voice id")
	}
	if selection.Reuse != nil {
		if selection.Selection == VoiceSelectionExact {
			return errors.New("exact director voice selection must not contain automatic reuse metadata")
		}
		if err := selection.Reuse.validateAgainstCatalog(*selection.ResolvedVoiceID, available); err != nil {
			return fmt.Errorf("director voice selection reuse: %w", err)
		}
	}
	return validateCanonicalTimestamp("director voice selection updatedAt", selection.UpdatedAt)
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
