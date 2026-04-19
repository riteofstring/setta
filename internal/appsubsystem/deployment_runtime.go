package appsubsystem

import (
	"errors"

	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/plugins"
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
	capabilities, err := LoadAppSubsystemCapabilities(options)
	if err != nil {
		return nil, err
	}
	if err := requireAppModeRuntimeCapabilities(capabilities); err != nil {
		return nil, err
	}
	registration, err := DeploymentTypeRegistration(capabilities)
	if err != nil {
		return nil, err
	}
	registrations = append(registrations, registration)
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
	return requireAppModeRuntimeCapabilities(capabilities)
}

func requireAppModeRuntimeCapabilities(
	capabilities plugins.PluginAppSubsystemCapabilities,
) error {
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
