package chatmodes

import (
	"errors"
	"strings"
)

var (
	ErrAppGenerationModeContributionInvalid   = errors.New("app generation mode contribution is invalid")
	ErrAppGenerationModeContributionDuplicate = errors.New("app generation mode contribution is duplicated")
	ErrAppGenerationModeInvalid               = errors.New("appGenerationMode is invalid")
	ErrAppGenerationReferenceImageURLTooLarge = errors.New(
		"appGenerationReferenceImageUrl is too large. Reduce it or omit it.",
	)
	ErrAppGenerationReferenceImageNotesTooLarge = errors.New(
		"appGenerationReferenceImageNotes is too large. Reduce it or omit it.",
	)
	ErrAppGenerationImageAttachmentRequired = errors.New(
		"json_render_with_image requires a current attached image or retained image provenance from a prior image-mode turn.",
	)
)

const (
	MaxAppGenerationReferenceImageURLChars   = 4096
	MaxAppGenerationReferenceImageNotesChars = 100000
)

type AppGenerationPromptOptions struct {
	AppSpecStreamingEnabled bool
	ReferenceImageURL       *string
	ReferenceImageNotes     *string
}

type AppGenerationRequestOptions struct {
	Mode                    *string
	AppSpecStreamingEnabled bool
	ReferenceImageURL       *string
	ReferenceImageNotes     *string
}

type NormalizedAppGenerationRequest struct {
	Mode                *string
	ReferenceImageURL   *string
	ReferenceImageNotes *string
	Prompt              string
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

func NormalizeAppGenerationMode(
	resolver AppGenerationModeResolver,
	value *string,
) (*string, error) {
	if resolver == nil {
		if strings.TrimSpace(derefOptionalString(value)) == "" {
			return nil, nil
		}
		return nil, ErrAppGenerationModeInvalid
	}
	normalized, ok := resolver.NormalizeOptionalMode(value)
	if !ok {
		return nil, ErrAppGenerationModeInvalid
	}
	return normalized, nil
}

func appGenerationModeAllowsReferenceImage(
	resolver AppGenerationModeResolver,
	mode *string,
) bool {
	if resolver == nil {
		return false
	}
	return resolver.AllowsReferenceImage(mode)
}

func NormalizeAppGenerationReferenceImageInputs(
	referenceImageURL *string,
	referenceImageNotes *string,
) (*string, *string, error) {
	normalizedURL := strings.TrimSpace(derefOptionalString(referenceImageURL))
	normalizedNotes := strings.TrimSpace(derefOptionalString(referenceImageNotes))
	if len(normalizedURL) > MaxAppGenerationReferenceImageURLChars {
		return nil, nil, ErrAppGenerationReferenceImageURLTooLarge
	}
	if len(normalizedNotes) > MaxAppGenerationReferenceImageNotesChars {
		return nil, nil, ErrAppGenerationReferenceImageNotesTooLarge
	}
	var resolvedURL *string
	var resolvedNotes *string
	if normalizedURL != "" {
		resolvedURL = stringPtr(normalizedURL)
	}
	if normalizedNotes != "" {
		resolvedNotes = stringPtr(normalizedNotes)
	}
	return resolvedURL, resolvedNotes, nil
}

func BuildAppGenerationModePrompt(
	resolver AppGenerationModeResolver,
	mode *string,
	appSpecStreamingEnabled bool,
	referenceImageURL *string,
	referenceImageNotes *string,
) string {
	if resolver == nil {
		return ""
	}
	return resolver.BuildPrompt(mode, AppGenerationPromptOptions{
		AppSpecStreamingEnabled: appSpecStreamingEnabled,
		ReferenceImageURL:       referenceImageURL,
		ReferenceImageNotes:     referenceImageNotes,
	})
}

func NormalizeAppGenerationRequest(
	resolver AppGenerationModeResolver,
	options AppGenerationRequestOptions,
) (NormalizedAppGenerationRequest, error) {
	mode, err := NormalizeAppGenerationMode(resolver, options.Mode)
	if err != nil {
		return NormalizedAppGenerationRequest{}, err
	}
	referenceImageURL, referenceImageNotes, err := NormalizeAppGenerationReferenceImageInputs(
		options.ReferenceImageURL,
		options.ReferenceImageNotes,
	)
	if err != nil {
		return NormalizedAppGenerationRequest{}, err
	}
	if !appGenerationModeAllowsReferenceImage(resolver, mode) {
		referenceImageURL = nil
		referenceImageNotes = nil
	}
	return NormalizedAppGenerationRequest{
		Mode:                mode,
		ReferenceImageURL:   referenceImageURL,
		ReferenceImageNotes: referenceImageNotes,
		Prompt: BuildAppGenerationModePrompt(
			resolver,
			mode,
			options.AppSpecStreamingEnabled,
			referenceImageURL,
			referenceImageNotes,
		),
	}, nil
}

func derefOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func stringPtr(value string) *string {
	return &value
}
