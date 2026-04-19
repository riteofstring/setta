package app

import (
	"setta/internal/chatmodes"
	appsubsystemchatmodes "setta/plugins/setta-json-render-app-gen/backend/chatmodes"
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
	return chatmodes.NewAppGenerationModeRegistry(chatmodes.AppGenerationModeRegistryOptions{
		Available: func() bool {
			if capabilities == nil {
				return false
			}
			current := capabilities.AppSubsystemCapabilities()
			return current.PluginEnabled && current.AppGenerationChatModes
		},
		Contributions: appsubsystemchatmodes.BuildChatModeContributions(),
	})
}
