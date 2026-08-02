package appsubsystemproviders

import "setta/internal/plugins"

const openAPIGeneratedPluginID = "openapi-generated-app-subsystem-provider"

// MergeOpenAPICapabilities converts manifest-level capability declarations into
// a single document-generation capability set. OpenAPI generation still needs a
// non-empty plugin id for app-definition/app-spec storage wiring, but that id
// must stay generic rather than baking in a first-party provider.
func MergeOpenAPICapabilities(
	providers []plugins.PluginAppSubsystemFeatureManifest,
) (plugins.PluginAppSubsystemCapabilities, bool) {
	if len(providers) == 0 {
		return plugins.PluginAppSubsystemCapabilities{}, false
	}

	merged := plugins.PluginAppSubsystemCapabilities{
		PluginID:      openAPIGeneratedPluginID,
		PluginEnabled: true,
	}
	for _, provider := range providers {
		merged.AppAuthoringUI = merged.AppAuthoringUI || provider.AppAuthoringUI
		merged.AppPreviewUI = merged.AppPreviewUI || provider.AppPreviewUI
		merged.AppGenerationChatModes =
			merged.AppGenerationChatModes || provider.AppGenerationChatModes
		merged.AppDeploymentRuntime =
			merged.AppDeploymentRuntime || provider.AppDeploymentRuntime
	}
	if !merged.AppAuthoringUI &&
		!merged.AppGenerationChatModes &&
		!merged.AppDeploymentRuntime {
		return plugins.PluginAppSubsystemCapabilities{}, false
	}
	return merged, true
}
