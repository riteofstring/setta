package app

import (
	"errors"
	"strings"
	"sync"
	"testing"

	"setta/internal/agentruns"
	"setta/internal/appsubsystem"
	"setta/internal/chatmodes"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/testutil/appsubsystemprovider"
	"setta/internal/uisettings"
)

const (
	testProviderAMode = "provider_a_mode"
	testProviderBMode = "provider_b_mode"
	testProviderAID   = "setta-test-app-provider-a"
	testProviderBID   = "setta-test-app-provider-b"
)

var registerAppGenerationModeTestProvidersOnce sync.Once

type appGenerationModeTestProvider struct {
	contributions []chatmodes.AppGenerationModeContribution
}

func (p appGenerationModeTestProvider) BuildFrontendAPIRouteRegistrations(
	appsubsystem.FrontendRouteRegistrationOptions,
) httpapi.FrontendAPIRouteRegistrations {
	return httpapi.FrontendAPIRouteRegistrations{}
}

func (p appGenerationModeTestProvider) BuildMCPToolRegistrations(
	*projectstate.Runtime,
) []appsubsystem.MCPToolRegistration {
	return nil
}

func (p appGenerationModeTestProvider) BuildScopedUISettingEntries(
	*projectstate.Runtime,
) ([]uisettings.RuntimeEntry, error) {
	return nil, nil
}

func (p appGenerationModeTestProvider) AppGenerationModeContributions() []chatmodes.AppGenerationModeContribution {
	return append([]chatmodes.AppGenerationModeContribution(nil), p.contributions...)
}

func (p appGenerationModeTestProvider) NewAppPublishService(
	deployments.AppPublisherOptions,
	*projectstate.Runtime,
) (deployments.AppPublishService, error) {
	return nil, nil
}

func (p appGenerationModeTestProvider) DeploymentTypeRegistration() deployments.TypeRegistration {
	return deployments.TypeRegistration{}
}

func registerAppGenerationModeTestProviders() {
	registerAppGenerationModeTestProvidersOnce.Do(func() {
		appsubsystem.RegisterBackendProvider(testProviderAID, appGenerationModeTestProvider{
			contributions: []chatmodes.AppGenerationModeContribution{
				{
					Mode: testProviderAMode,
					PromptBuilder: func(options chatmodes.AppGenerationPromptOptions) string {
						return "provider A prompt"
					},
				},
			},
		})
		appsubsystem.RegisterBackendProvider(testProviderBID, appGenerationModeTestProvider{
			contributions: []chatmodes.AppGenerationModeContribution{
				{
					Mode:                 testProviderBMode,
					AllowsReferenceImage: true,
					PromptBuilder: func(options chatmodes.AppGenerationPromptOptions) string {
						if options.ReferenceImageURL == nil {
							return "provider B prompt"
						}
						return "provider B prompt with reference image URL: " + *options.ReferenceImageURL
					},
				},
			},
		})
	})
}

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

func TestNewAppGenerationModeResolverUsesCurrentProviderAfterSwitch(t *testing.T) {
	registerAppGenerationModeTestProviders()

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

	modeA := testProviderAMode
	normalized, ok := resolver.NormalizeOptionalMode(&modeA)
	if !ok || normalized == nil || *normalized != modeA {
		t.Fatalf("expected provider A mode to normalize, got ok=%t normalized=%v", ok, normalized)
	}
	if prompt := resolver.BuildPrompt(&modeA, chatmodes.AppGenerationPromptOptions{}); prompt != "provider A prompt" {
		t.Fatalf("expected provider A prompt, got %q", prompt)
	}

	capabilities.Set(plugins.PluginAppSubsystemCapabilities{
		PluginID:               testProviderBID,
		PluginEnabled:          true,
		AppGenerationChatModes: true,
	})

	if normalized, ok := resolver.NormalizeOptionalMode(&modeA); ok || normalized != nil {
		t.Fatalf("expected provider A mode to stop normalizing after switch, got ok=%t normalized=%v", ok, normalized)
	}

	modeB := testProviderBMode
	normalized, ok = resolver.NormalizeOptionalMode(&modeB)
	if !ok || normalized == nil || *normalized != modeB {
		t.Fatalf("expected provider B mode to normalize after switch, got ok=%t normalized=%v", ok, normalized)
	}
	if !resolver.AllowsReferenceImage(&modeB) {
		t.Fatalf("expected provider B mode to allow reference images after switch")
	}
	referenceImageURL := "https://example.com/reference.png"
	prompt := resolver.BuildPrompt(&modeB, chatmodes.AppGenerationPromptOptions{
		ReferenceImageURL: &referenceImageURL,
	})
	if !strings.Contains(prompt, "provider B prompt with reference image URL") {
		t.Fatalf("expected provider B prompt after switch, got %q", prompt)
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
