package app

import (
	"setta/internal/appsubsystem"
	"setta/internal/chatmodes"
	"setta/internal/plugins"
	"strings"
)

func initializeAppSubsystemCapabilities(
	projectServices projectServices,
) (*appSubsystemCapabilityState, error) {
	appSubsystemCapabilities, _, err := initializePluginFeatureCapabilities(projectServices)
	return appSubsystemCapabilities, err
}

func initializePluginFeatureCapabilities(
	projectServices projectServices,
) (*appSubsystemCapabilityState, *watchCodeCapabilityState, error) {
	appSubsystemCapabilities := newAppSubsystemCapabilityState()
	watchCodeCapabilities := newWatchCodeCapabilityState()
	if projectServices.pluginMutationService == nil {
		return appSubsystemCapabilities, watchCodeCapabilities, nil
	}
	snapshot, err := projectServices.pluginMutationService.Rescan()
	if err != nil {
		return nil, nil, err
	}
	appSubsystemCapabilities.SetFromSnapshot(snapshot)
	watchCodeCapabilities.SetFromSnapshot(snapshot)
	return appSubsystemCapabilities, watchCodeCapabilities, nil
}

func newAppGenerationModeResolver(
	capabilities *appSubsystemCapabilityState,
) (chatmodes.AppGenerationModeResolver, error) {
	resolver := liveAppGenerationModeResolver{capabilities: capabilities}
	_, err := resolver.currentRegistry()
	if err != nil {
		return nil, err
	}
	return resolver, nil
}

type liveAppGenerationModeResolver struct {
	capabilities *appSubsystemCapabilityState
}

func (r liveAppGenerationModeResolver) NormalizeOptionalMode(value *string) (*string, bool) {
	registry, err := r.currentRegistry()
	if err != nil {
		return nil, false
	}
	return registry.NormalizeOptionalMode(value)
}

func (r liveAppGenerationModeResolver) AllowsReferenceImage(mode *string) bool {
	registry, err := r.currentRegistry()
	if err != nil {
		return false
	}
	return registry.AllowsReferenceImage(mode)
}

func (r liveAppGenerationModeResolver) BuildPrompt(
	mode *string,
	options chatmodes.AppGenerationPromptOptions,
) string {
	registry, err := r.currentRegistry()
	if err != nil {
		return ""
	}
	return registry.BuildPrompt(mode, options)
}

func (r liveAppGenerationModeResolver) ValidateCurrentTurn(
	mode *string,
	options chatmodes.AppGenerationTurnValidationOptions,
) error {
	registry, err := r.currentRegistry()
	if err != nil {
		if mode == nil || strings.TrimSpace(*mode) == "" {
			return nil
		}
		return err
	}
	return registry.ValidateCurrentTurn(mode, options)
}

func (r liveAppGenerationModeResolver) currentRegistry() (*chatmodes.AppGenerationModeRegistry, error) {
	currentCapabilities := plugins.PluginAppSubsystemCapabilities{}
	if r.capabilities != nil {
		currentCapabilities = r.capabilities.AppSubsystemCapabilities()
	}
	contributions, err := appsubsystem.AppGenerationModeContributions(currentCapabilities)
	if err != nil {
		return nil, err
	}
	return chatmodes.NewAppGenerationModeRegistry(chatmodes.AppGenerationModeRegistryOptions{
		Available: func() bool {
			return currentCapabilities.PluginEnabled && currentCapabilities.AppGenerationChatModes
		},
		Contributions: contributions,
	})
}
