package app

import (
	"setta/internal/appsubsystem"
	"setta/internal/chatmodes"
	"setta/internal/plugins"
)

func initializeAppSubsystemCapabilities(
	projectServices projectServices,
) (*appSubsystemCapabilityState, error) {
	capabilities := newAppSubsystemCapabilityState()
	if projectServices.pluginMutationService == nil {
		return capabilities, nil
	}
	snapshot, err := projectServices.pluginMutationService.Rescan()
	if err != nil {
		return nil, err
	}
	capabilities.SetFromSnapshot(snapshot)
	return capabilities, nil
}

func newAppGenerationModeResolver(
	capabilities *appSubsystemCapabilityState,
) (chatmodes.AppGenerationModeResolver, error) {
	currentCapabilities := plugins.PluginAppSubsystemCapabilities{}
	if capabilities != nil {
		currentCapabilities = capabilities.AppSubsystemCapabilities()
	}
	contributions, err := appsubsystem.AppGenerationModeContributions(currentCapabilities)
	if err != nil {
		return nil, err
	}
	return chatmodes.NewAppGenerationModeRegistry(chatmodes.AppGenerationModeRegistryOptions{
		Available: func() bool {
			if capabilities == nil {
				return false
			}
			current := capabilities.AppSubsystemCapabilities()
			return current.PluginEnabled && current.AppGenerationChatModes
		},
		Contributions: contributions,
	})
}
