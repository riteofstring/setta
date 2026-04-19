package appsubsystem

import (
	"errors"
	"fmt"
	"strings"
	"sync"

	"setta/internal/chatmodes"
	"setta/internal/deployments"
	"setta/internal/httpapi"
	"setta/internal/modes"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/tools"
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

type MCPToolRegistration struct {
	Spec         tools.Spec
	InputSchema  map[string]any
	OutputSchema map[string]any
}

type BackendProvider interface {
	BuildFrontendAPIRouteRegistrations(
		options FrontendRouteRegistrationOptions,
	) httpapi.FrontendAPIRouteRegistrations
	BuildMCPToolRegistrations(
		projectRuntime *projectstate.Runtime,
	) []MCPToolRegistration
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
) ([]MCPToolRegistration, error) {
	if projectRuntime == nil {
		return nil, nil
	}
	provider, err := BackendProviderForCapabilities(capabilities)
	if err != nil {
		return nil, err
	}
	if provider == nil {
		return nil, nil
	}
	return provider.BuildMCPToolRegistrations(projectRuntime), nil
}

func BuildScopedUISettingEntries(
	capabilities plugins.PluginAppSubsystemCapabilities,
	projectRuntime *projectstate.Runtime,
) ([]uisettings.RuntimeEntry, error) {
	if projectRuntime == nil {
		return nil, nil
	}
	provider, err := BackendProviderForCapabilities(capabilities)
	if err != nil {
		return nil, err
	}
	if provider == nil {
		return nil, nil
	}
	return provider.BuildScopedUISettingEntries(projectRuntime)
}

func AppGenerationModeContributions(
	capabilities plugins.PluginAppSubsystemCapabilities,
) ([]chatmodes.AppGenerationModeContribution, error) {
	if !capabilities.PluginEnabled || !capabilities.AppGenerationChatModes {
		return nil, nil
	}
	provider, err := BackendProviderForCapabilities(capabilities)
	if err != nil {
		return nil, err
	}
	if provider == nil {
		return nil, nil
	}
	return provider.AppGenerationModeContributions(), nil
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
	if !capabilities.PluginEnabled || !capabilities.AppDeploymentRuntime {
		return deployments.TypeRegistration{}, ErrAppModePluginRequired
	}
	provider, err := BackendProviderForCapabilities(capabilities)
	if err != nil {
		return deployments.TypeRegistration{}, err
	}
	if provider == nil {
		return deployments.TypeRegistration{}, ErrAppModePluginRequired
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
