package appsubsystem

import (
	"errors"

	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/plugins"
	appsubsystemplugin "setta/plugins/setta-json-render-app-gen/backend"
)

var ErrAppModePluginRequired = errors.New(`App mode requires the first-party plugin "setta-json-render-app-gen" to be enabled.`)

type DeploymentRuntimeOptions struct {
	Mode           config.Mode
	DeploymentRoot string
	RuntimeRoot    string
}

func NewDeploymentTypeRegistry(
	options DeploymentRuntimeOptions,
) (*deployments.TypeRegistry, error) {
	registrations := []deployments.TypeRegistration{
		deployments.ShareTypeRegistration(),
	}
	if options.Mode != config.ModeApp {
		return deployments.NewTypeRegistry(registrations)
	}
	if err := RequireAppModeRuntime(options); err != nil {
		return nil, err
	}
	registrations = append(registrations, appsubsystemplugin.AppDeploymentTypeRegistration())
	return deployments.NewTypeRegistry(registrations)
}

func RequireAppModeRuntime(options DeploymentRuntimeOptions) error {
	if options.Mode != config.ModeApp {
		return nil
	}
	capabilities, err := LoadAppSubsystemCapabilities(options)
	if err != nil {
		return err
	}
	if capabilities.PluginEnabled && capabilities.AppDeploymentRuntime {
		return nil
	}
	return ErrAppModePluginRequired
}

func LoadAppSubsystemCapabilities(
	options DeploymentRuntimeOptions,
) (plugins.PluginAppSubsystemCapabilities, error) {
	store, err := plugins.NewStore(plugins.StoreOptions{
		WorkspaceRoot:  options.DeploymentRoot,
		SettaFilesRoot: options.DeploymentRoot,
		SettaHome:      options.RuntimeRoot,
	})
	if err != nil {
		return plugins.PluginAppSubsystemCapabilities{}, err
	}
	discovery, err := plugins.NewDiscoveryService(plugins.DiscoveryServiceOptions{
		Store:      store,
		ServerMode: options.Mode,
	})
	if err != nil {
		return plugins.PluginAppSubsystemCapabilities{}, err
	}
	snapshot, err := discovery.Rescan()
	if err != nil {
		return plugins.PluginAppSubsystemCapabilities{}, err
	}
	return plugins.AppSubsystemCapabilitiesFromSnapshot(snapshot), nil
}
