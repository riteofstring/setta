package appsubsystemproviders

import "setta/internal/plugins"

type DiscoveredProvider struct {
	PluginID     string
	Capabilities plugins.PluginAppSubsystemFeatureManifest
}

func (p DiscoveredProvider) AppSubsystemCapabilities() plugins.PluginAppSubsystemCapabilities {
	return plugins.PluginAppSubsystemCapabilities{
		PluginID:               p.PluginID,
		PluginEnabled:          true,
		AppAuthoringUI:         p.Capabilities.AppAuthoringUI,
		AppPreviewUI:           p.Capabilities.AppPreviewUI,
		AppGenerationChatModes: p.Capabilities.AppGenerationChatModes,
		AppDeploymentRuntime:   p.Capabilities.AppDeploymentRuntime,
	}
}
