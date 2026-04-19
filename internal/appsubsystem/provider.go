package appsubsystem

import (
	"errors"
	"fmt"
	"strings"
	"sync"

	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	neutralappuisettings "setta/internal/appsubsystem/appuisettings"
	appsubsystemchatmodes "setta/internal/appsubsystem/chatmodes"
	neutralmcptools "setta/internal/appsubsystem/mcptools"
	"setta/internal/chatmodes"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/uisettings"
)

var ErrBackendProviderUnregistered = errors.New(
	"app subsystem backend provider is not registered",
)

type CapabilityProvider interface {
	AppSubsystemCapabilities() plugins.PluginAppSubsystemCapabilities
}

type FrontendRouteRegistrationOptions struct {
	Capabilities              CapabilityProvider
	ProjectState              *projectstate.Runtime
	ModePolicy                modes.Policy
	AppGenSkill               httpapi.AppGenSkillRouteDependencies
	ShareDeploymentIDE        httpapi.ShareDeploymentIDERouteDependencies
	AppDeployment             httpapi.DeploymentRouteDependencies
	AppDeploymentIDEPublisher deployments.AppPublishService
}

type BackendProvider interface {
	BuildFrontendAPIRouteRegistrations(
		options FrontendRouteRegistrationOptions,
	) httpapi.FrontendAPIRouteRegistrations
	BuildMCPToolRegistrations(
		projectRuntime *projectstate.Runtime,
	) []mcpx.ToolRegistration
	BuildScopedUISettingEntries(
		projectRuntime *projectstate.Runtime,
	) ([]uisettings.RuntimeEntry, error)
	AppGenerationModeContributions() []chatmodes.AppGenerationModeContribution
	NewAppPublishService(
		options deployments.AppPublisherOptions,
		projectRuntime *projectstate.Runtime,
	) (deployments.AppPublishService, error)
	DeploymentTypeRegistration() deployments.TypeRegistration
}

var (
	backendProvidersMu         sync.RWMutex
	backendProvidersByPluginID = map[string]BackendProvider{}
)

func RegisterBackendProvider(pluginID string, provider BackendProvider) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	switch {
	case trimmedPluginID == "":
		panic("app subsystem backend provider plugin id is required")
	case provider == nil:
		panic("app subsystem backend provider is required")
	}

	backendProvidersMu.Lock()
	defer backendProvidersMu.Unlock()

	if _, exists := backendProvidersByPluginID[trimmedPluginID]; exists {
		panic(fmt.Sprintf("app subsystem backend provider already registered for %q", trimmedPluginID))
	}
	backendProvidersByPluginID[trimmedPluginID] = provider
}

func BackendProviderForCapabilities(
	capabilities plugins.PluginAppSubsystemCapabilities,
) (BackendProvider, error) {
	if !capabilities.PluginEnabled {
		return nil, nil
	}
	return backendProviderByPluginID(capabilities.PluginID)
}

func BuildFrontendAPIRouteRegistrations(
	options FrontendRouteRegistrationOptions,
) (httpapi.FrontendAPIRouteRegistrations, error) {
	if options.Capabilities == nil {
		return httpapi.FrontendAPIRouteRegistrations{}, nil
	}
	provider, err := BackendProviderForCapabilities(
		options.Capabilities.AppSubsystemCapabilities(),
	)
	if err != nil {
		return httpapi.FrontendAPIRouteRegistrations{}, err
	}
	if provider == nil {
		return httpapi.FrontendAPIRouteRegistrations{}, nil
	}
	return provider.BuildFrontendAPIRouteRegistrations(options), nil
}

func BuildMCPToolRegistrations(
	capabilities plugins.PluginAppSubsystemCapabilities,
	projectRuntime *projectstate.Runtime,
) ([]mcpx.ToolRegistration, error) {
	if projectRuntime == nil {
		return nil, nil
	}
	service, defaultAppSpecPath, ok := appDefinitionToolRuntime(
		capabilities,
		projectRuntime,
	)
	if !ok {
		return nil, nil
	}
	return neutralmcptools.BuildMCPToolRegistrations(service, defaultAppSpecPath), nil
}

func BuildScopedUISettingEntries(
	capabilities plugins.PluginAppSubsystemCapabilities,
	projectRuntime *projectstate.Runtime,
) ([]uisettings.RuntimeEntry, error) {
	if projectRuntime == nil {
		return nil, nil
	}
	service, ok := appDefinitionRuntimeForCapabilities(capabilities, projectRuntime)
	if !ok {
		return nil, nil
	}
	return neutralappuisettings.BuildEntries(service, strings.TrimSpace(capabilities.PluginID))
}

func AppGenerationModeContributions(
	capabilities plugins.PluginAppSubsystemCapabilities,
) ([]chatmodes.AppGenerationModeContribution, error) {
	if !capabilities.PluginEnabled || !capabilities.AppGenerationChatModes {
		return nil, nil
	}
	return appsubsystemchatmodes.BuildChatModeContributions(), nil
}

func NewAppPublishService(
	capabilities plugins.PluginAppSubsystemCapabilities,
	options deployments.AppPublisherOptions,
	projectRuntime *projectstate.Runtime,
) (deployments.AppPublishService, error) {
	provider, err := BackendProviderForCapabilities(capabilities)
	if err != nil {
		return nil, err
	}
	if provider == nil {
		return nil, nil
	}
	return provider.NewAppPublishService(options, projectRuntime)
}

func DeploymentTypeRegistration(
	capabilities plugins.PluginAppSubsystemCapabilities,
) (deployments.TypeRegistration, error) {
	if err := requireAppModeRuntimeCapabilities(capabilities); err != nil {
		return deployments.TypeRegistration{}, err
	}
	provider, err := BackendProviderForCapabilities(capabilities)
	if err != nil {
		return deployments.TypeRegistration{}, err
	}
	if provider == nil {
		return deployments.TypeRegistration{}, ErrBackendProviderUnregistered
	}
	return provider.DeploymentTypeRegistration(), nil
}

func backendProviderByPluginID(pluginID string) (BackendProvider, error) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return nil, nil
	}

	backendProvidersMu.RLock()
	provider, ok := backendProvidersByPluginID[trimmedPluginID]
	backendProvidersMu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrBackendProviderUnregistered, trimmedPluginID)
	}
	return provider, nil
}

func appDefinitionRuntimeForCapabilities(
	capabilities plugins.PluginAppSubsystemCapabilities,
	projectRuntime *projectstate.Runtime,
) (appdefinition.Runtime, bool) {
	if projectRuntime == nil || !capabilities.PluginEnabled {
		return nil, false
	}
	pluginID := strings.TrimSpace(capabilities.PluginID)
	if pluginID == "" {
		return nil, false
	}
	return appdefinition.NewAppDefinitionService(projectRuntime, pluginID), true
}

func appDefinitionToolRuntime(
	capabilities plugins.PluginAppSubsystemCapabilities,
	projectRuntime *projectstate.Runtime,
) (appdefinition.Runtime, string, bool) {
	service, ok := appDefinitionRuntimeForCapabilities(capabilities, projectRuntime)
	if !ok {
		return nil, "", false
	}
	pluginID := strings.TrimSpace(capabilities.PluginID)
	return service, appspec.MustForPlugin(pluginID).DefaultPath(), true
}
