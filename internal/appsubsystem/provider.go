package appsubsystem

import (
	"fmt"
	"strings"

	"github.com/go-chi/chi/v5"
	"setta/internal/appsubsystem/appdefinition"
	appdefinitionhttp "setta/internal/appsubsystem/appdefinitionhttp"
	appdeploymenthttp "setta/internal/appsubsystem/appdeploymenthttp"
	"setta/internal/appsubsystem/apppublish"
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

type CapabilityProvider interface {
	AppSubsystemCapabilities() plugins.PluginAppSubsystemCapabilities
}

type FrontendRouteRegistrationOptions struct {
	Capabilities              CapabilityProvider
	BackendListenerInvoker    appdefinition.BackendListenerInvoker
	ProjectState              *projectstate.Runtime
	ModePolicy                modes.Policy
	AppGenSkill               httpapi.AppGenSkillRouteDependencies
	ShareDeploymentIDE        httpapi.ShareDeploymentIDERouteDependencies
	AppDeployment             httpapi.DeploymentRouteDependencies
	AppDeploymentIDEPublisher deployments.AppPublishService
}

func BuildFrontendAPIRouteRegistrations(
	options FrontendRouteRegistrationOptions,
) (httpapi.FrontendAPIRouteRegistrations, error) {
	if options.Capabilities == nil {
		return httpapi.FrontendAPIRouteRegistrations{}, nil
	}
	capabilities := options.Capabilities.AppSubsystemCapabilities()
	if !capabilities.PluginEnabled {
		return httpapi.FrontendAPIRouteRegistrations{}, nil
	}
	projectRegistrations, err := buildProjectFrontendRouteRegistrations(options, capabilities)
	if err != nil {
		return httpapi.FrontendAPIRouteRegistrations{}, err
	}
	if !capabilities.AppDeploymentRuntime {
		return httpapi.FrontendAPIRouteRegistrations{
			Project: projectRegistrations,
		}, nil
	}

	deploymentRegistrations, err := buildDeploymentFrontendRouteRegistrations(
		options,
		capabilities.PluginID,
	)
	if err != nil {
		return httpapi.FrontendAPIRouteRegistrations{}, err
	}
	return httpapi.FrontendAPIRouteRegistrations{
		Project:    projectRegistrations,
		Deployment: deploymentRegistrations,
	}, nil
}

func buildProjectFrontendRouteRegistrations(
	options FrontendRouteRegistrationOptions,
	capabilities plugins.PluginAppSubsystemCapabilities,
) ([]httpapi.FrontendAPIRouteContribution, error) {
	contributions := []httpapi.FrontendAPIRouteContribution{}
	if capabilities.AppAuthoringUI {
		service, err := appDefinitionRuntimeForCapabilities(
			capabilities,
			options.ProjectState,
			options.BackendListenerInvoker,
		)
		if err != nil {
			return nil, err
		}
		contributions = append(contributions, httpapi.FrontendAPIRouteContribution{
			Family: "app definition",
			Register: func(router chi.Router) error {
				return appdefinitionhttp.RegisterRoutes(router, appdefinitionhttp.RouteDependencies{
					ModePolicy: options.ModePolicy,
					Service:    service,
				})
			},
		})
	}
	if capabilities.AppGenerationChatModes {
		contributions = append(contributions, httpapi.FrontendAPIRouteContribution{
			Family: "app generation skill",
			Register: func(router chi.Router) error {
				return httpapi.RegisterAppGenSkillRoutes(router, options.AppGenSkill)
			},
		})
	}
	return contributions, nil
}

func buildDeploymentFrontendRouteRegistrations(
	options FrontendRouteRegistrationOptions,
	pluginID string,
) ([]httpapi.FrontendAPIRouteContribution, error) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return nil, appdefinition.ErrPluginIDRequired
	}

	appDeploymentIDE := appdeploymenthttp.IDERouteDependencies{
		ModePolicy:   options.ShareDeploymentIDE.ModePolicy,
		ProjectState: options.ShareDeploymentIDE.ProjectState,
		Catalog:      options.ShareDeploymentIDE.Catalog,
		AppPublisher: options.AppDeploymentIDEPublisher,
	}
	return []httpapi.FrontendAPIRouteContribution{
		{
			Family: "app deployment",
			Register: func(router chi.Router) error {
				return appdeploymenthttp.RegisterDeploymentRoutes(
					router,
					options.AppDeployment,
					trimmedPluginID,
				)
			},
		},
		{
			Family: "app deployment ide",
			Register: func(router chi.Router) error {
				return appdeploymenthttp.RegisterIDERoutes(router, appDeploymentIDE)
			},
		},
	}, nil
}

func BuildMCPToolRegistrations(
	capabilities plugins.PluginAppSubsystemCapabilities,
	projectRuntime *projectstate.Runtime,
	backendListenerInvoker appdefinition.BackendListenerInvoker,
) ([]mcpx.ToolRegistration, error) {
	if projectRuntime == nil || !capabilities.PluginEnabled {
		return nil, nil
	}
	registrations := []mcpx.ToolRegistration{}
	if capabilities.AppGenerationChatModes {
		registrations = append(
			registrations,
			neutralmcptools.BuildAppCatalogToolRegistrations()...,
		)
	}
	if capabilities.AppAuthoringUI {
		service, defaultAppSpecPath, ok := appDefinitionToolRuntime(
			capabilities,
			projectRuntime,
			backendListenerInvoker,
		)
		if ok {
			registrations = append(
				registrations,
				neutralmcptools.BuildAppDefinitionToolRegistrations(
					service,
					defaultAppSpecPath,
					mcpx.ExecuteScopedProjectStateOperation,
				)...,
			)
		}
	}
	if len(registrations) == 0 {
		return nil, nil
	}
	return registrations, nil
}

func BuildScopedUISettingEntries(
	capabilities plugins.PluginAppSubsystemCapabilities,
	projectRuntime *projectstate.Runtime,
	backendListenerInvoker appdefinition.BackendListenerInvoker,
) ([]uisettings.RuntimeEntry, error) {
	if projectRuntime == nil || !capabilities.PluginEnabled || !capabilities.AppAuthoringUI {
		return nil, nil
	}
	service, err := appDefinitionRuntimeForCapabilities(
		capabilities,
		projectRuntime,
		backendListenerInvoker,
	)
	if err != nil {
		return nil, err
	}
	if service == nil {
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
) (deployments.AppPublishService, error) {
	if !capabilities.PluginEnabled || !capabilities.AppDeploymentRuntime {
		return nil, nil
	}
	pluginID := strings.TrimSpace(capabilities.PluginID)
	if pluginID == "" {
		return nil, appdefinition.ErrPluginIDRequired
	}
	return apppublish.NewService(options, pluginID)
}

func DeploymentTypeRegistration(
	capabilities plugins.PluginAppSubsystemCapabilities,
) (deployments.TypeRegistration, error) {
	if err := requireAppModeRuntimeCapabilities(capabilities); err != nil {
		return deployments.TypeRegistration{}, err
	}
	return AppDeploymentTypeRegistration(), nil
}

func appDefinitionRuntimeForCapabilities(
	capabilities plugins.PluginAppSubsystemCapabilities,
	projectRuntime *projectstate.Runtime,
	backendListenerInvoker appdefinition.BackendListenerInvoker,
) (appdefinition.Runtime, error) {
	if projectRuntime == nil || !capabilities.PluginEnabled {
		return nil, nil
	}
	pluginID := strings.TrimSpace(capabilities.PluginID)
	if pluginID == "" {
		return nil, nil
	}
	service := appdefinition.NewBackendRuntime(
		projectRuntime,
		pluginID,
		backendListenerInvoker,
	)
	if service == nil {
		return nil, fmt.Errorf(
			"app subsystem backend listener invoker is required for plugin %q",
			pluginID,
		)
	}
	return service, nil
}

func appDefinitionToolRuntime(
	capabilities plugins.PluginAppSubsystemCapabilities,
	projectRuntime *projectstate.Runtime,
	backendListenerInvoker appdefinition.BackendListenerInvoker,
) (appdefinition.Runtime, string, bool) {
	service, err := appDefinitionRuntimeForCapabilities(
		capabilities,
		projectRuntime,
		backendListenerInvoker,
	)
	if err != nil || service == nil {
		return nil, "", false
	}
	pluginID := strings.TrimSpace(capabilities.PluginID)
	return service, appspec.MustForPlugin(pluginID).DefaultPath(), true
}
