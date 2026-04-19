package chatmodes

import (
	"errors"
	"testing"
)

func TestNewAppGenerationModeRegistryRejectsDuplicateModes(t *testing.T) {
	t.Parallel()

	_, err := NewAppGenerationModeRegistry(AppGenerationModeRegistryOptions{
		Contributions: []AppGenerationModeContribution{
			{
				Mode: "json_render",
				PromptBuilder: func(options AppGenerationPromptOptions) string {
					return "first"
				},
			},
			{
				Mode: "json_render",
				PromptBuilder: func(options AppGenerationPromptOptions) string {
					return "second"
				},
			},
		},
	})
	if !errors.Is(err, ErrAppGenerationModeContributionDuplicate) {
		t.Fatalf("expected duplicate contribution error, got %v", err)
	}
}

func TestAppGenerationModeRegistryRejectsUnavailableModes(t *testing.T) {
	t.Parallel()

	registry, err := NewAppGenerationModeRegistry(AppGenerationModeRegistryOptions{
		Available: func() bool { return false },
		Contributions: []AppGenerationModeContribution{
			{
				Mode: "json_render",
				PromptBuilder: func(options AppGenerationPromptOptions) string {
					return "disabled"
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	mode := "json_render"
	if _, ok := registry.NormalizeOptionalMode(&mode); ok {
		t.Fatalf("expected unavailable mode to reject normalization")
	}
	if prompt := registry.BuildPrompt(&mode, AppGenerationPromptOptions{}); prompt != "" {
		t.Fatalf("expected unavailable mode prompt to be empty, got %q", prompt)
	}
}

func TestAppGenerationModeRegistryBuildsPromptForRegisteredMode(t *testing.T) {
	t.Parallel()

	registry, err := NewAppGenerationModeRegistry(AppGenerationModeRegistryOptions{
		Available: func() bool { return true },
		Contributions: []AppGenerationModeContribution{
			{
				Mode: "json_render",
				PromptBuilder: func(options AppGenerationPromptOptions) string {
					if !options.AppSpecStreamingEnabled {
						return "missing"
					}
					return "streaming"
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	mode := "json_render"
	normalized, ok := registry.NormalizeOptionalMode(&mode)
	if !ok || normalized == nil || *normalized != "json_render" {
		t.Fatalf("expected normalized json_render mode, got %v ok=%v", normalized, ok)
	}
	if prompt := registry.BuildPrompt(&mode, AppGenerationPromptOptions{
		AppSpecStreamingEnabled: true,
	}); prompt != "streaming" {
		t.Fatalf("expected streaming prompt, got %q", prompt)
	}
}
