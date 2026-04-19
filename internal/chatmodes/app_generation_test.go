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

func TestAppGenerationModeRegistryTracksReferenceImageCapability(t *testing.T) {
	t.Parallel()

	registry, err := NewAppGenerationModeRegistry(AppGenerationModeRegistryOptions{
		Contributions: []AppGenerationModeContribution{
			{
				Mode:                 "json_render_with_image",
				AllowsReferenceImage: true,
				PromptBuilder: func(options AppGenerationPromptOptions) string {
					return "image"
				},
			},
			{
				Mode: "prompt_builder",
				PromptBuilder: func(options AppGenerationPromptOptions) string {
					return "prompt"
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	imageMode := "json_render_with_image"
	if !registry.AllowsReferenceImage(&imageMode) {
		t.Fatalf("expected image mode to allow reference-image inputs")
	}

	promptBuilderMode := "prompt_builder"
	if registry.AllowsReferenceImage(&promptBuilderMode) {
		t.Fatalf("expected prompt_builder mode to reject reference-image inputs")
	}
}

func TestAppGenerationModeRegistryRunsCurrentTurnValidatorForMatchingMode(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("image required")
	registry, err := NewAppGenerationModeRegistry(AppGenerationModeRegistryOptions{
		Contributions: []AppGenerationModeContribution{
			{
				Mode: "json_render_with_image",
				PromptBuilder: func(options AppGenerationPromptOptions) string {
					return "image"
				},
				ValidateCurrentTurn: func(options AppGenerationTurnValidationOptions) error {
					if options.Message["id"] != "user-1" {
						t.Fatalf("unexpected validation message %#v", options.Message)
					}
					if len(options.PriorMessages) != 1 {
						t.Fatalf("unexpected validation history %#v", options.PriorMessages)
					}
					if got := options.AppGenerationByMessageID["user-1"]; got != "json_render_with_image" {
						t.Fatalf("unexpected validation provenance %#v", options.AppGenerationByMessageID)
					}
					return wantErr
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	mode := "json_render_with_image"
	err = registry.ValidateCurrentTurn(&mode, AppGenerationTurnValidationOptions{
		Message: map[string]any{"id": "user-1"},
		PriorMessages: []map[string]any{
			{"id": "user-0"},
		},
		AppGenerationByMessageID: map[string]string{
			"user-1": "json_render_with_image",
		},
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("expected validator error %v, got %v", wantErr, err)
	}

	plainMode := "prompt_builder"
	if err := registry.ValidateCurrentTurn(&plainMode, AppGenerationTurnValidationOptions{}); err != nil {
		t.Fatalf("expected unrelated mode validation to skip, got %v", err)
	}
}
