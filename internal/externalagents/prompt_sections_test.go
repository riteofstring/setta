package externalagents

import (
	"errors"
	"strings"
	"testing"

	"setta/internal/agentruns"
	appsubsystemchatmodes "setta/internal/appsubsystem/chatmodes"
	"setta/internal/chatmodes"
)

func testExternalAppGenerationModes(t *testing.T) chatmodes.AppGenerationModeResolver {
	t.Helper()

	resolver, err := chatmodes.NewAppGenerationModeRegistry(chatmodes.AppGenerationModeRegistryOptions{
		Available:     func() bool { return true },
		Contributions: appsubsystemchatmodes.BuildChatModeContributions(),
	})
	if err != nil {
		t.Fatalf("new app generation mode resolver: %v", err)
	}
	return resolver
}

func TestNormalizeStartChatGenerationOptionsUsesChatmodesOwner(t *testing.T) {
	t.Parallel()

	mode, prompt, err := normalizeStartChatGenerationOptions(StartChatRequest{
		AppGenerationMode:              stringPtr(string(agentruns.AppGenerationModeJSONRenderWithImage)),
		AppSpecStreamingEnabled:        true,
		AppGenerationReferenceImageURL: stringPtr(" https://example.com/reference.png "),
		AppGenerationReferenceImageNotes: stringPtr(
			" Match spacing and heading scale first. ",
		),
	}, testExternalAppGenerationModes(t))
	if err != nil {
		t.Fatalf("normalize app-generation options: %v", err)
	}
	if mode == nil || *mode != string(agentruns.AppGenerationModeJSONRenderWithImage) {
		t.Fatalf("unexpected app-generation mode %#v", mode)
	}
	if !strings.Contains(prompt, "streamingPreview: enabled") {
		t.Fatalf("expected streaming flag in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "Reference image URL: https://example.com/reference.png") {
		t.Fatalf("expected normalized reference image URL in prompt, got %q", prompt)
	}
	if !strings.Contains(prompt, "Match spacing and heading scale first.") {
		t.Fatalf("expected normalized reference image notes in prompt, got %q", prompt)
	}
}

func TestNormalizeStartChatGenerationOptionsDropsImageInputsForNonImageMode(t *testing.T) {
	t.Parallel()

	_, prompt, err := normalizeStartChatGenerationOptions(StartChatRequest{
		AppGenerationMode:              stringPtr(string(agentruns.AppGenerationModePromptBuilder)),
		AppSpecStreamingEnabled:        true,
		AppGenerationReferenceImageURL: stringPtr("https://example.com/reference.png"),
		AppGenerationReferenceImageNotes: stringPtr(
			"Ignore outside image mode.",
		),
	}, testExternalAppGenerationModes(t))
	if err != nil {
		t.Fatalf("normalize app-generation options: %v", err)
	}
	if strings.Contains(prompt, "Reference image URL") {
		t.Fatalf("expected non-image mode to drop reference image URL, got %q", prompt)
	}
	if strings.Contains(prompt, "Ignore outside image mode.") {
		t.Fatalf("expected non-image mode to drop reference image notes, got %q", prompt)
	}
}

func TestNormalizeStartChatGenerationOptionsPropagatesOwnerErrors(t *testing.T) {
	t.Parallel()

	_, _, err := normalizeStartChatGenerationOptions(StartChatRequest{
		AppGenerationMode: stringPtr("unknown_mode"),
	}, testExternalAppGenerationModes(t))
	if !errors.Is(err, ErrAppGenerationModeInvalid) {
		t.Fatalf("expected invalid mode error, got %v", err)
	}

	_, _, err = normalizeStartChatGenerationOptions(StartChatRequest{
		AppGenerationReferenceImageURL: stringPtr(strings.Repeat("x", chatmodes.MaxAppGenerationReferenceImageURLChars+1)),
	}, testExternalAppGenerationModes(t))
	if !errors.Is(err, ErrAppGenerationReferenceImageURLTooLarge) {
		t.Fatalf("expected oversized URL error, got %v", err)
	}
}
