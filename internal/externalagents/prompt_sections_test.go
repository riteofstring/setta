package externalagents

import (
	"errors"
	"strings"
	"testing"
)

func TestBuildAppGenerationModePromptIncludesStreamingAndReferenceImageContext(t *testing.T) {
	t.Parallel()

	prompt := buildAppGenerationModePrompt(
		stringPtr(AppGenerationModeJSONRenderWithImage),
		true,
		stringPtr("https://example.com/reference.png"),
		stringPtr("Match spacing and heading scale first."),
	)
	if !strings.Contains(prompt, "mode: json_render_with_image") {
		t.Fatalf("expected mode in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "streamingPreview: enabled") {
		t.Fatalf("expected streaming flag in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "setta__stream_app_definition") {
		t.Fatalf("expected stream tool in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "Reference image URL: https://example.com/reference.png") {
		t.Fatalf("expected reference image URL in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "Match spacing and heading scale first.") {
		t.Fatalf("expected reference image notes in prompt, got %q", prompt)
	}
}

func TestBuildAppGenerationModePromptReturnsEmptyWithoutMode(t *testing.T) {
	t.Parallel()

	if prompt := buildAppGenerationModePrompt(nil, true, nil, nil); prompt != "" {
		t.Fatalf("expected empty prompt, got %q", prompt)
	}
}

func TestBuildAppGenerationModePromptIgnoresReferenceImageForNonImageModes(t *testing.T) {
	t.Parallel()

	prompt := buildAppGenerationModePrompt(
		stringPtr(AppGenerationModePromptBuilder),
		true,
		stringPtr("https://example.com/reference.png"),
		stringPtr("Ignore outside image mode."),
	)
	if !strings.Contains(prompt, "mode: prompt_builder") {
		t.Fatalf("expected prompt builder mode, got %q", prompt)
	}
	if strings.Contains(prompt, "Reference image URL") {
		t.Fatalf("expected image URL to be ignored, got %q", prompt)
	}
	if strings.Contains(prompt, "Ignore outside image mode.") {
		t.Fatalf("expected image notes to be ignored, got %q", prompt)
	}
}

func TestBuildAppGenerationModePromptMCPModeSwitchesPersistenceInstruction(t *testing.T) {
	t.Parallel()

	streamingPrompt := buildAppGenerationModePrompt(stringPtr(AppGenerationModeMCPServer), true, nil, nil)
	if !strings.Contains(streamingPrompt, "setta__stream_app_definition") {
		t.Fatalf("expected MCP streaming prompt to use stream tool, got %q", streamingPrompt)
	}
	if strings.Contains(streamingPrompt, "setta__set_app_definition") {
		t.Fatalf("expected MCP streaming prompt to omit full-spec tool, got %q", streamingPrompt)
	}

	fullSpecPrompt := buildAppGenerationModePrompt(stringPtr(AppGenerationModeMCPServer), false, nil, nil)
	if !strings.Contains(fullSpecPrompt, "setta__set_app_definition") {
		t.Fatalf("expected MCP full-spec prompt to use set_app_definition, got %q", fullSpecPrompt)
	}
	if strings.Contains(fullSpecPrompt, "setta__stream_app_definition") {
		t.Fatalf("expected MCP full-spec prompt to omit stream tool, got %q", fullSpecPrompt)
	}
}

func TestNormalizeReferenceImageInputsTrimsAndValidates(t *testing.T) {
	t.Parallel()

	url, notes, err := normalizeReferenceImageInputs(
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

	emptyURL, emptyNotes, err := normalizeReferenceImageInputs(stringPtr("   "), nil)
	if err != nil {
		t.Fatalf("normalize empty reference image inputs: %v", err)
	}
	if emptyURL != nil || emptyNotes != nil {
		t.Fatalf("expected empty reference image inputs to normalize to nil, got %#v %#v", emptyURL, emptyNotes)
	}
}

func TestNormalizeReferenceImageInputsRejectsOversizedValues(t *testing.T) {
	t.Parallel()

	_, _, err := normalizeReferenceImageInputs(stringPtr(strings.Repeat("x", maxReferenceImageURLChars+1)), nil)
	if !errors.Is(err, ErrAppGenerationReferenceImageURLTooLarge) {
		t.Fatalf("expected oversized URL error, got %v", err)
	}

	_, _, err = normalizeReferenceImageInputs(nil, stringPtr(strings.Repeat("x", maxReferenceImageNotesChars+1)))
	if !errors.Is(err, ErrAppGenerationReferenceImageNotesTooLarge) {
		t.Fatalf("expected oversized notes error, got %v", err)
	}
}

func TestNormalizeAppGenerationModeRejectsUnknownValue(t *testing.T) {
	t.Parallel()

	_, err := normalizeAppGenerationMode(stringPtr("unknown_mode"))
	if !errors.Is(err, ErrAppGenerationModeInvalid) {
		t.Fatalf("expected invalid mode error, got %v", err)
	}
}
