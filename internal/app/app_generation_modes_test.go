package app

import (
	"strings"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/chatmodes"
	"setta/internal/plugins"
	"setta/internal/testutil/appsubsystemprovider"
)

const (
	testProviderAID = "setta-test-app-provider-a"
	testProviderBID = "setta-test-app-provider-b"
	customMode      = "provider_a_mode"
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

func TestNewAppGenerationModeResolverTracksCapabilityChangesAfterConstruction(t *testing.T) {
	capabilities := newAppSubsystemCapabilityState()

	resolver, err := newAppGenerationModeResolver(capabilities)
	if err != nil {
		t.Fatalf("newAppGenerationModeResolver returned error: %v", err)
	}

	mode := string(agentruns.AppGenerationModeJSONRenderWithImage)
	if normalized, ok := resolver.NormalizeOptionalMode(&mode); ok || normalized != nil {
		t.Fatalf("expected resolver to reject %q before provider activation, got ok=%t normalized=%v", mode, ok, normalized)
	}

	capabilities.Set(plugins.PluginAppSubsystemCapabilities{
		PluginID:               appsubsystemprovider.PluginID,
		PluginEnabled:          true,
		AppGenerationChatModes: true,
	})

	normalized, ok := resolver.NormalizeOptionalMode(&mode)
	if !ok || normalized == nil || *normalized != mode {
		t.Fatalf("expected resolver to normalize %q after provider activation, got ok=%t normalized=%v", mode, ok, normalized)
	}
	if !resolver.AllowsReferenceImage(&mode) {
		t.Fatalf("expected resolver to allow reference images for %q after provider activation", mode)
	}

	referenceImageURL := "https://example.com/reference.png"
	prompt := resolver.BuildPrompt(&mode, chatmodes.AppGenerationPromptOptions{
		ReferenceImageURL: &referenceImageURL,
	})
	if !strings.Contains(prompt, "Reference image URL: https://example.com/reference.png") {
		t.Fatalf("expected prompt to include reference image URL after provider activation, got %q", prompt)
	}
}

func TestNewAppGenerationModeResolverUsesGenericModesAcrossProviderSwitch(t *testing.T) {
	capabilities := newAppSubsystemCapabilityState()
	capabilities.Set(plugins.PluginAppSubsystemCapabilities{
		PluginID:               testProviderAID,
		PluginEnabled:          true,
		AppGenerationChatModes: true,
	})

	resolver, err := newAppGenerationModeResolver(capabilities)
	if err != nil {
		t.Fatalf("newAppGenerationModeResolver returned error: %v", err)
	}

	if normalized, ok := resolver.NormalizeOptionalMode(stringPointer(customMode)); ok || normalized != nil {
		t.Fatalf("expected custom provider mode to stay unavailable, got ok=%t normalized=%v", ok, normalized)
	}

	mode := string(agentruns.AppGenerationModeJSONRenderWithImage)
	normalized, ok := resolver.NormalizeOptionalMode(&mode)
	if !ok || normalized == nil || *normalized != mode {
		t.Fatalf("expected generic app mode to normalize for provider A, got ok=%t normalized=%v", ok, normalized)
	}

	capabilities.Set(plugins.PluginAppSubsystemCapabilities{
		PluginID:               testProviderBID,
		PluginEnabled:          true,
		AppGenerationChatModes: true,
	})

	if normalized, ok := resolver.NormalizeOptionalMode(stringPointer(customMode)); ok || normalized != nil {
		t.Fatalf("expected custom provider mode to stay unavailable after switch, got ok=%t normalized=%v", ok, normalized)
	}

	normalized, ok = resolver.NormalizeOptionalMode(&mode)
	if !ok || normalized == nil || *normalized != mode {
		t.Fatalf("expected generic app mode to normalize after provider switch, got ok=%t normalized=%v", ok, normalized)
	}
	if !resolver.AllowsReferenceImage(&mode) {
		t.Fatalf("expected generic image mode to allow reference images after switch")
	}
	referenceImageURL := "https://example.com/reference.png"
	prompt := resolver.BuildPrompt(&mode, chatmodes.AppGenerationPromptOptions{
		ReferenceImageURL: &referenceImageURL,
	})
	if !strings.Contains(prompt, "Reference image URL: https://example.com/reference.png") {
		t.Fatalf("expected generic prompt after switch, got %q", prompt)
	}
}

func TestNewAppGenerationModeResolverTreatsUnavailableProviderAsNoop(t *testing.T) {
	capabilities := newAppSubsystemCapabilityState()
	capabilities.Set(plugins.PluginAppSubsystemCapabilities{
		ProviderSelection: &plugins.PluginAppSubsystemProviderSelection{
			Status:           plugins.PluginAppSubsystemProviderSelectionStatusInvalidProvider,
			InvalidPluginIDs: []string{"setta-unregistered-app-provider"},
		},
	})

	resolver, err := newAppGenerationModeResolver(capabilities)
	if err != nil {
		t.Fatalf("new app generation mode resolver: %v", err)
	}
	mode := string(agentruns.AppGenerationModeJSONRenderWithImage)
	normalized, ok := resolver.NormalizeOptionalMode(&mode)
	if ok || normalized != nil {
		t.Fatalf("expected unavailable provider mode to fail closed, got ok=%t normalized=%v", ok, normalized)
	}
}

func stringPointer(value string) *string {
	return &value
}
