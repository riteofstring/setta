package chatmodes

import (
	"errors"
	"strings"
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

func TestNormalizeAppGenerationRequestBuildsPromptAndReferenceImageContext(t *testing.T) {
	t.Parallel()

	registry, err := NewAppGenerationModeRegistry(AppGenerationModeRegistryOptions{
		Contributions: []AppGenerationModeContribution{
			{
				Mode:                 "image_mode",
				AllowsReferenceImage: true,
				PromptBuilder: func(options AppGenerationPromptOptions) string {
					if !options.AppSpecStreamingEnabled {
						return "missing streaming"
					}
					if options.ReferenceImageURL == nil || options.ReferenceImageNotes == nil {
						return "missing reference image"
					}
					return *options.ReferenceImageURL + "\n" + *options.ReferenceImageNotes
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	normalized, err := NormalizeAppGenerationRequest(registry, AppGenerationRequestOptions{
		Mode:                    stringPtr(" image_mode "),
		AppSpecStreamingEnabled: true,
		ReferenceImageURL:       stringPtr(" https://example.com/reference.png "),
		ReferenceImageNotes:     stringPtr(" Match spacing first. "),
	})
	if err != nil {
		t.Fatalf("normalize app-generation request: %v", err)
	}
	if normalized.Mode == nil || *normalized.Mode != "image_mode" {
		t.Fatalf("unexpected normalized mode %#v", normalized.Mode)
	}
	if normalized.ReferenceImageURL == nil || *normalized.ReferenceImageURL != "https://example.com/reference.png" {
		t.Fatalf("unexpected reference image URL %#v", normalized.ReferenceImageURL)
	}
	if normalized.ReferenceImageNotes == nil || *normalized.ReferenceImageNotes != "Match spacing first." {
		t.Fatalf("unexpected reference image notes %#v", normalized.ReferenceImageNotes)
	}
	if normalized.Prompt != "https://example.com/reference.png\nMatch spacing first." {
		t.Fatalf("unexpected prompt %q", normalized.Prompt)
	}
}

func TestNormalizeAppGenerationRequestDropsReferenceImageForUnsupportedMode(t *testing.T) {
	t.Parallel()

	registry, err := NewAppGenerationModeRegistry(AppGenerationModeRegistryOptions{
		Contributions: []AppGenerationModeContribution{
			{
				Mode: "plain_mode",
				PromptBuilder: func(options AppGenerationPromptOptions) string {
					if options.ReferenceImageURL != nil || options.ReferenceImageNotes != nil {
						return "unexpected image"
					}
					return "plain prompt"
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	normalized, err := NormalizeAppGenerationRequest(registry, AppGenerationRequestOptions{
		Mode:                stringPtr("plain_mode"),
		ReferenceImageURL:   stringPtr("https://example.com/reference.png"),
		ReferenceImageNotes: stringPtr("Ignore me."),
	})
	if err != nil {
		t.Fatalf("normalize app-generation request: %v", err)
	}
	if normalized.ReferenceImageURL != nil || normalized.ReferenceImageNotes != nil {
		t.Fatalf("expected reference image inputs to be dropped, got %#v", normalized)
	}
	if normalized.Prompt != "plain prompt" {
		t.Fatalf("unexpected prompt %q", normalized.Prompt)
	}
}

func TestNormalizeAppGenerationRequestRejectsInvalidModeAndNilResolver(t *testing.T) {
	t.Parallel()

	_, err := NormalizeAppGenerationRequest(nil, AppGenerationRequestOptions{
		Mode: stringPtr("json_render"),
	})
	if !errors.Is(err, ErrAppGenerationModeInvalid) {
		t.Fatalf("expected invalid mode error for nil resolver, got %v", err)
	}

	registry, err := NewAppGenerationModeRegistry(AppGenerationModeRegistryOptions{
		Contributions: []AppGenerationModeContribution{
			{
				Mode: "known",
				PromptBuilder: func(options AppGenerationPromptOptions) string {
					return "known"
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}
	_, err = NormalizeAppGenerationRequest(registry, AppGenerationRequestOptions{
		Mode: stringPtr("unknown"),
	})
	if !errors.Is(err, ErrAppGenerationModeInvalid) {
		t.Fatalf("expected invalid mode error, got %v", err)
	}
}

func TestNormalizeAppGenerationReferenceImageInputsTrimsAndLimits(t *testing.T) {
	t.Parallel()

	url, notes, err := NormalizeAppGenerationReferenceImageInputs(
		stringPtr("  https://example.com/reference.png  "),
		stringPtr("  Match spacing first.  "),
	)
	if err != nil {
		t.Fatalf("normalize reference image inputs: %v", err)
	}
	if url == nil || *url != "https://example.com/reference.png" {
		t.Fatalf("unexpected normalized URL %#v", url)
	}
	if notes == nil || *notes != "Match spacing first." {
		t.Fatalf("unexpected normalized notes %#v", notes)
	}

	emptyURL, emptyNotes, err := NormalizeAppGenerationReferenceImageInputs(stringPtr("   "), nil)
	if err != nil {
		t.Fatalf("normalize empty reference image inputs: %v", err)
	}
	if emptyURL != nil || emptyNotes != nil {
		t.Fatalf("expected empty reference image inputs to normalize to nil, got %#v %#v", emptyURL, emptyNotes)
	}

	_, _, err = NormalizeAppGenerationReferenceImageInputs(
		stringPtr(strings.Repeat("x", MaxAppGenerationReferenceImageURLChars+1)),
		nil,
	)
	if !errors.Is(err, ErrAppGenerationReferenceImageURLTooLarge) {
		t.Fatalf("expected oversized URL error, got %v", err)
	}
	_, _, err = NormalizeAppGenerationReferenceImageInputs(
		nil,
		stringPtr(strings.Repeat("x", MaxAppGenerationReferenceImageNotesChars+1)),
	)
	if !errors.Is(err, ErrAppGenerationReferenceImageNotesTooLarge) {
		t.Fatalf("expected oversized notes error, got %v", err)
	}
}
