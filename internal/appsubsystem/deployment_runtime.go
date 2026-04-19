package appsubsystem

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/plugins"
)

var ErrAppModeProviderRequired = errors.New(
	"app mode requires a single active app subsystem provider with app deployment runtime support",
)

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
	return appModeProviderRequirementError(capabilities)
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

func appModeProviderRequirementError(
	capabilities plugins.PluginAppSubsystemCapabilities,
) error {
	selection := capabilities.ProviderSelection
	if selection == nil {
		return fmt.Errorf("%w: no app subsystem provider is active", ErrAppModeProviderRequired)
	}

	switch selection.Status {
	case plugins.PluginAppSubsystemProviderSelectionStatusDisabledProvider:
		return fmt.Errorf(
			"%w: installed app subsystem providers are disabled (%s)",
			ErrAppModeProviderRequired,
			quotedPluginIDList(selection.DisabledPluginIDs),
		)
	case plugins.PluginAppSubsystemProviderSelectionStatusInvalidProvider:
		return fmt.Errorf(
			"%w: installed app subsystem providers are invalid (%s)",
			ErrAppModeProviderRequired,
			quotedPluginIDList(selection.InvalidPluginIDs),
		)
	case plugins.PluginAppSubsystemProviderSelectionStatusConflict:
		return fmt.Errorf(
			"%w: multiple app subsystem providers are active (%s); disable all but one",
			ErrAppModeProviderRequired,
			quotedPluginIDList(selection.ConflictingPluginIDs),
		)
	case plugins.PluginAppSubsystemProviderSelectionStatusActive:
		pluginID := strings.TrimSpace(capabilities.PluginID)
		if pluginID == "" && selection.SelectedPluginID != nil {
			pluginID = strings.TrimSpace(*selection.SelectedPluginID)
		}
		if pluginID != "" {
			return fmt.Errorf(
				"%w: app subsystem provider %q does not declare app deployment runtime support",
				ErrAppModeProviderRequired,
				pluginID,
			)
		}
		return fmt.Errorf(
			"%w: the selected app subsystem provider does not declare app deployment runtime support",
			ErrAppModeProviderRequired,
		)
	case plugins.PluginAppSubsystemProviderSelectionStatusNoProvider:
		fallthrough
	default:
		return fmt.Errorf("%w: no app subsystem provider is active", ErrAppModeProviderRequired)
	}
}

func quotedPluginIDList(pluginIDs []string) string {
	if len(pluginIDs) == 0 {
		return "none"
	}

	normalized := make([]string, 0, len(pluginIDs))
	for _, pluginID := range pluginIDs {
		trimmed := strings.TrimSpace(pluginID)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}
	if len(normalized) == 0 {
		return "none"
	}

	sort.Strings(normalized)
	quoted := make([]string, 0, len(normalized))
	for _, pluginID := range normalized {
		quoted = append(quoted, fmt.Sprintf("%q", pluginID))
	}
	return strings.Join(quoted, ", ")
}
