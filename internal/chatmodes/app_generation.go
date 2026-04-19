package chatmodes

import (
	"errors"
	"strings"
)

var (
	ErrAppGenerationModeContributionInvalid   = errors.New("app generation mode contribution is invalid")
	ErrAppGenerationModeContributionDuplicate = errors.New("app generation mode contribution is duplicated")
	ErrAppGenerationImageAttachmentRequired   = errors.New(
		"json_render_with_image requires a current attached image or retained image provenance from a prior image-mode turn.",
	)
)

type AppGenerationPromptOptions struct {
	AppSpecStreamingEnabled bool
	ReferenceImageURL       *string
	ReferenceImageNotes     *string
}

type AppGenerationTurnValidationOptions struct {
	Message                  map[string]any
	PriorMessages            []map[string]any
	AppGenerationByMessageID map[string]string
}

type AppGenerationModeContribution struct {
	Mode                 string
	AllowsReferenceImage bool
	PromptBuilder        func(AppGenerationPromptOptions) string
	ValidateCurrentTurn  func(AppGenerationTurnValidationOptions) error
}

type AppGenerationModeResolver interface {
	NormalizeOptionalMode(value *string) (*string, bool)
	AllowsReferenceImage(mode *string) bool
	BuildPrompt(mode *string, options AppGenerationPromptOptions) string
	ValidateCurrentTurn(mode *string, options AppGenerationTurnValidationOptions) error
}

type AppGenerationModeRegistryOptions struct {
	Available     func() bool
	Contributions []AppGenerationModeContribution
}

type AppGenerationModeRegistry struct {
	available                  func() bool
	allowsReferenceImageByMode map[string]bool
	promptByMode               map[string]func(AppGenerationPromptOptions) string
	validateCurrentTurnByMode  map[string]func(AppGenerationTurnValidationOptions) error
}

func NewAppGenerationModeRegistry(
	options AppGenerationModeRegistryOptions,
) (*AppGenerationModeRegistry, error) {
	allowsReferenceImageByMode := map[string]bool{}
	promptByMode := map[string]func(AppGenerationPromptOptions) string{}
	validateCurrentTurnByMode := map[string]func(AppGenerationTurnValidationOptions) error{}
	for _, contribution := range options.Contributions {
		mode := strings.TrimSpace(contribution.Mode)
		if mode == "" || contribution.PromptBuilder == nil {
			return nil, ErrAppGenerationModeContributionInvalid
		}
		if _, exists := promptByMode[mode]; exists {
			return nil, ErrAppGenerationModeContributionDuplicate
		}
		allowsReferenceImageByMode[mode] = contribution.AllowsReferenceImage
		promptByMode[mode] = contribution.PromptBuilder
		validateCurrentTurnByMode[mode] = contribution.ValidateCurrentTurn
	}

	available := options.Available
	if available == nil {
		available = func() bool {
			return true
		}
	}

	return &AppGenerationModeRegistry{
		available:                  available,
		allowsReferenceImageByMode: allowsReferenceImageByMode,
		promptByMode:               promptByMode,
		validateCurrentTurnByMode:  validateCurrentTurnByMode,
	}, nil
}

func (r *AppGenerationModeRegistry) NormalizeOptionalMode(value *string) (*string, bool) {
	if value == nil {
		return nil, true
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, true
	}
	if r == nil || !r.available() {
		return nil, false
	}
	if _, ok := r.promptByMode[trimmed]; !ok {
		return nil, false
	}
	return &trimmed, true
}

func (r *AppGenerationModeRegistry) AllowsReferenceImage(mode *string) bool {
	normalized, ok := r.NormalizeOptionalMode(mode)
	if !ok || normalized == nil {
		return false
	}
	return r.allowsReferenceImageByMode[*normalized]
}

func (r *AppGenerationModeRegistry) BuildPrompt(
	mode *string,
	options AppGenerationPromptOptions,
) string {
	normalized, ok := r.NormalizeOptionalMode(mode)
	if !ok || normalized == nil {
		return ""
	}

	builder := r.promptByMode[*normalized]
	if builder == nil {
		return ""
	}
	return strings.TrimSpace(builder(options))
}

func (r *AppGenerationModeRegistry) ValidateCurrentTurn(
	mode *string,
	options AppGenerationTurnValidationOptions,
) error {
	normalized, ok := r.NormalizeOptionalMode(mode)
	if !ok || normalized == nil {
		return nil
	}
	validator := r.validateCurrentTurnByMode[*normalized]
	if validator == nil {
		return nil
	}
	return validator(options)
}
