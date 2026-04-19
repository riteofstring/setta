package app

import (
	"errors"
	"strings"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/appsubsystem"
	"setta/internal/chatmodes"
	"setta/internal/plugins"
	"setta/internal/testutil/appsubsystemprovider"
)

func TestNewAppGenerationModeResolverUsesUnknownProviderContributions(t *testing.T) {
	capabilities := newAppSubsystemCapabilityState()
	capabilities.Set(plugins.PluginAppSubsystemCapabilities{
		PluginID:               appsubsystemprovider.PluginID,
		PluginEnabled:          true,
		AppGenerationChatModes: true,
	})

	resolver, err := newAppGenerationModeResolver(capabilities)
	if err != nil {
		t.Fatalf("newAppGenerationModeResolver returned error: %v", err)
	}

	mode := string(agentruns.AppGenerationModeJSONRenderWithImage)
	normalized, ok := resolver.NormalizeOptionalMode(&mode)
	if !ok || normalized == nil || *normalized != mode {
		t.Fatalf("expected resolver to normalize %q, got ok=%t normalized=%v", mode, ok, normalized)
	}
	if !resolver.AllowsReferenceImage(&mode) {
		t.Fatalf("expected resolver to allow reference images for %q", mode)
	}

	referenceImageURL := "https://example.com/reference.png"
	prompt := resolver.BuildPrompt(&mode, chatmodes.AppGenerationPromptOptions{
		ReferenceImageURL: &referenceImageURL,
	})
	if !strings.Contains(prompt, "Reference image URL: https://example.com/reference.png") {
		t.Fatalf("expected prompt to include reference image URL, got %q", prompt)
	}
}

func TestNewAppGenerationModeResolverErrorsForUnregisteredProvider(t *testing.T) {
	capabilities := newAppSubsystemCapabilityState()
	capabilities.Set(plugins.PluginAppSubsystemCapabilities{
		PluginID:               "setta-unregistered-app-provider",
		PluginEnabled:          true,
		AppGenerationChatModes: true,
	})

	_, err := newAppGenerationModeResolver(capabilities)
	if err == nil {
		t.Fatal("expected unregistered provider error")
	}
	if !errors.Is(err, appsubsystem.ErrBackendProviderUnregistered) {
		t.Fatalf("expected ErrBackendProviderUnregistered, got %v", err)
	}
}
