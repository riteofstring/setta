package chatmodes

import (
	"errors"
	"strings"
)

var (
	ErrAppGenerationModeContributionInvalid   = errors.New("app generation mode contribution is invalid")
	ErrAppGenerationModeContributionDuplicate = errors.New("app generation mode contribution is duplicated")
)

type AppGenerationPromptOptions struct {
	AppSpecStreamingEnabled bool
	ReferenceImageURL       *string
	ReferenceImageNotes     *string
}

type AppGenerationModeContribution struct {
	Mode          string
	PromptBuilder func(AppGenerationPromptOptions) string
}

type AppGenerationModeResolver interface {
	NormalizeOptionalMode(value *string) (*string, bool)
	BuildPrompt(mode *string, options AppGenerationPromptOptions) string
}

type AppGenerationModeRegistryOptions struct {
	Available     func() bool
	Contributions []AppGenerationModeContribution
}

type AppGenerationModeRegistry struct {
	available    func() bool
	promptByMode map[string]func(AppGenerationPromptOptions) string
}

func NewAppGenerationModeRegistry(
	options AppGenerationModeRegistryOptions,
) (*AppGenerationModeRegistry, error) {
	promptByMode := map[string]func(AppGenerationPromptOptions) string{}
	for _, contribution := range options.Contributions {
		mode := strings.TrimSpace(contribution.Mode)
		if mode == "" || contribution.PromptBuilder == nil {
			return nil, ErrAppGenerationModeContributionInvalid
		}
		if _, exists := promptByMode[mode]; exists {
			return nil, ErrAppGenerationModeContributionDuplicate
		}
		promptByMode[mode] = contribution.PromptBuilder
	}

	available := options.Available
	if available == nil {
		available = func() bool {
			return true
		}
	}

	return &AppGenerationModeRegistry{
		available:    available,
		promptByMode: promptByMode,
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
