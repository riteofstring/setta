package conversation

import (
	"fmt"

	"setta/internal/workspaceui/conversationpalette"
)

type PresentationSelectionMode string
type PresentationReuseReason string

const (
	PresentationSelectionAutoDistinct PresentationSelectionMode = "auto_distinct"
	PresentationSelectionExact        PresentationSelectionMode = "exact"

	PresentationReuseCatalogExhausted PresentationReuseReason = "catalog_exhausted"
)

type PresentationReuse struct {
	Reason                     PresentationReuseReason `json:"reason"`
	ResolvedChoiceID           string                  `json:"resolvedChoiceId"`
	ConflictingConversationIDs []string                `json:"conflictingConversationIds"`
}

type ConversationPresentationProfile struct {
	ConversationID           string                                     `json:"conversationId"`
	PaletteSelection         PresentationSelectionMode                  `json:"paletteSelection"`
	RequestedPaletteID       *conversationpalette.ConversationPaletteID `json:"requestedPaletteId"`
	ResolvedPaletteID        conversationpalette.ConversationPaletteID  `json:"resolvedPaletteId"`
	PaletteReuse             *PresentationReuse                         `json:"paletteReuse"`
	NarratorVoiceSelection   PresentationSelectionMode                  `json:"narratorVoiceSelection"`
	RequestedNarratorVoiceID *string                                    `json:"requestedNarratorVoiceId"`
	ResolvedNarratorVoiceID  *string                                    `json:"resolvedNarratorVoiceId"`
	NarratorVoiceReuse       *PresentationReuse                         `json:"narratorVoiceReuse"`
	NarratorSpeechEnabled    bool                                       `json:"narratorSpeechEnabled"`
	UpdatedAt                string                                     `json:"updatedAt"`
}

func (reuse PresentationReuse) Validate(resolvedChoiceID string) error {
	if reuse.Reason != PresentationReuseCatalogExhausted {
		return fmt.Errorf("unsupported presentation reuse reason %q", reuse.Reason)
	}
	if err := validateIdentifier("presentation reuse resolved choice id", reuse.ResolvedChoiceID); err != nil {
		return err
	}
	if reuse.ResolvedChoiceID != resolvedChoiceID {
		return fmt.Errorf("presentation reuse choice %q does not match resolved choice %q", reuse.ResolvedChoiceID, resolvedChoiceID)
	}
	if len(reuse.ConflictingConversationIDs) == 0 {
		return fmt.Errorf("presentation reuse must identify at least one conflicting conversation")
	}
	seen := map[string]bool{}
	for _, conversationID := range reuse.ConflictingConversationIDs {
		if err := validateIdentifier("presentation reuse conflicting conversation id", conversationID); err != nil {
			return err
		}
		if seen[conversationID] {
			return fmt.Errorf("presentation reuse conflicting conversation %q is duplicated", conversationID)
		}
		seen[conversationID] = true
	}
	return nil
}

func (profile ConversationPresentationProfile) Validate() error {
	if err := validateIdentifier("presentation conversation id", profile.ConversationID); err != nil {
		return err
	}
	if _, ok := conversationpalette.Lookup(profile.ResolvedPaletteID); !ok {
		return fmt.Errorf("presentation profile %s has unavailable resolved palette %q", profile.ConversationID, profile.ResolvedPaletteID)
	}
	if err := validatePresentationSelection(
		"palette",
		profile.PaletteSelection,
		paletteIDPointerString(profile.RequestedPaletteID),
		string(profile.ResolvedPaletteID),
		profile.PaletteReuse,
	); err != nil {
		return fmt.Errorf("presentation profile %s: %w", profile.ConversationID, err)
	}
	if err := validatePresentationReuseOwnership(profile.ConversationID, profile.PaletteReuse); err != nil {
		return err
	}
	resolvedVoiceID := ""
	if profile.ResolvedNarratorVoiceID != nil {
		resolvedVoiceID = *profile.ResolvedNarratorVoiceID
		if err := validateIdentifier("resolved narrator voice id", resolvedVoiceID); err != nil {
			return err
		}
	}
	if err := validatePresentationSelection(
		"narrator voice",
		profile.NarratorVoiceSelection,
		profile.RequestedNarratorVoiceID,
		resolvedVoiceID,
		profile.NarratorVoiceReuse,
	); err != nil {
		return fmt.Errorf("presentation profile %s: %w", profile.ConversationID, err)
	}
	if err := validatePresentationReuseOwnership(profile.ConversationID, profile.NarratorVoiceReuse); err != nil {
		return err
	}
	_, err := validateTimestamp("presentation profile updatedAt", profile.UpdatedAt)
	return err
}

func validatePresentationReuseOwnership(conversationID string, reuse *PresentationReuse) error {
	if reuse == nil {
		return nil
	}
	for _, conflictingConversationID := range reuse.ConflictingConversationIDs {
		if conflictingConversationID == conversationID {
			return fmt.Errorf("presentation profile %s cannot conflict with itself", conversationID)
		}
	}
	return nil
}

func validatePresentationSelection(
	label string,
	mode PresentationSelectionMode,
	requestedID *string,
	resolvedID string,
	reuse *PresentationReuse,
) error {
	switch mode {
	case PresentationSelectionExact:
		return validateExactPresentationSelection(label, requestedID, resolvedID, reuse)
	case PresentationSelectionAutoDistinct:
		return validateAutomaticPresentationSelection(label, requestedID, resolvedID, reuse)
	default:
		return fmt.Errorf("unsupported %s selection mode %q", label, mode)
	}
}

func validateExactPresentationSelection(label string, requestedID *string, resolvedID string, reuse *PresentationReuse) error {
	if requestedID == nil {
		return fmt.Errorf("exact %s selection requires requested id", label)
	}
	if err := validateIdentifier("requested "+label+" id", *requestedID); err != nil {
		return err
	}
	if resolvedID == "" {
		return fmt.Errorf("exact %s selection requires resolved id", label)
	}
	if *requestedID != resolvedID {
		return fmt.Errorf("exact %s selection resolved %q, want requested %q", label, resolvedID, *requestedID)
	}
	if reuse != nil {
		return fmt.Errorf("exact %s selection must not contain automatic reuse metadata", label)
	}
	return nil
}

func validateAutomaticPresentationSelection(label string, requestedID *string, resolvedID string, reuse *PresentationReuse) error {
	if requestedID != nil {
		return fmt.Errorf("automatic %s selection must not contain requested id", label)
	}
	if reuse == nil {
		return nil
	}
	if resolvedID == "" {
		return fmt.Errorf("automatic %s reuse requires resolved id", label)
	}
	if err := reuse.Validate(resolvedID); err != nil {
		return fmt.Errorf("%s reuse: %w", label, err)
	}
	return nil
}

func paletteIDPointerString(value *conversationpalette.ConversationPaletteID) *string {
	if value == nil {
		return nil
	}
	result := string(*value)
	return &result
}
