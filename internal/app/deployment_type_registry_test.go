package app

import (
	"errors"
	"path/filepath"
	"testing"

	"setta/internal/appsubsystem"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/plugins"
)

func TestNewDeploymentTypeRegistryIncludesPluginAppRegistration(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfigWithType(t, config.ModeApp, deployments.TypeApp)
	enableAppDeploymentRuntimePlugin(t, cfg.Paths.DeploymentRoot)

	registry, err := NewDeploymentTypeRegistry(cfg)
	if err != nil {
		t.Fatalf("new deployment type registry: %v", err)
	}

	registration, err := registry.RegistrationForStartupMode("app")
	if err != nil {
		t.Fatalf("lookup app deployment registration: %v", err)
	}
	if registration.Type != deployments.TypeApp {
		t.Fatalf("expected app deployment type registration, got %#v", registration)
	}
	if registration.Startup.URLLabel != "App URL" {
		t.Fatalf("expected app url label, got %#v", registration.Startup)
	}
}

func TestNewDeploymentTypeRegistryRequiresAppSubsystemProviderForAppMode(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfigWithType(t, config.ModeApp, deployments.TypeApp)
	_, err := NewDeploymentTypeRegistry(cfg)
	if !errors.Is(err, appsubsystem.ErrAppModeProviderRequired) {
		t.Fatalf("expected app mode provider-required error, got %v", err)
	}
}

func TestNewDeploymentTypeRegistryIncludesUnknownProviderAppRegistration(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfigWithType(t, config.ModeApp, deployments.TypeApp)
	enableAppDeploymentRuntimePluginWithID(
		t,
		cfg.Paths.DeploymentRoot,
		plugins.AppSubsystemPluginID,
		unknownAppSubsystemPluginID,
	)

	registry, err := NewDeploymentTypeRegistry(cfg)
	if err != nil {
		t.Fatalf("new deployment type registry: %v", err)
	}

	registration, err := registry.RegistrationForStartupMode("app")
	if err != nil {
		t.Fatalf("lookup app deployment registration: %v", err)
	}
	if registration.Type != deployments.TypeApp {
		t.Fatalf("expected app deployment type registration, got %#v", registration)
	}
}

func TestNewDeploymentTypeRegistryRejectsUnregisteredProvider(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfigWithType(t, config.ModeApp, deployments.TypeApp)
	enableAppDeploymentRuntimePluginWithID(
		t,
		cfg.Paths.DeploymentRoot,
		plugins.AppSubsystemPluginID,
		"setta-fixture-unregistered-app-provider",
	)

	_, err := NewDeploymentTypeRegistry(cfg)
	if !errors.Is(err, appsubsystem.ErrAppModeProviderRequired) {
		t.Fatalf("expected app mode provider-required error, got %v", err)
	}
	expectedErr := `app mode requires a single active app subsystem provider with app deployment runtime support: installed app subsystem providers are invalid ("setta-fixture-unregistered-app-provider")`
	if err == nil || err.Error() != expectedErr {
		t.Fatalf("expected exact invalid-provider error %q, got %v", expectedErr, err)
	}
}

func TestNewDeploymentTypeRegistryRejectsConflictingActiveProviders(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfigWithType(t, config.ModeApp, deployments.TypeApp)
	enableAppDeploymentRuntimePluginWithID(
		t,
		cfg.Paths.DeploymentRoot,
		plugins.AppSubsystemPluginID,
		"acme.app-provider-b",
	)
	enableAppDeploymentRuntimePluginWithID(
		t,
		cfg.Paths.DeploymentRoot,
		plugins.AppSubsystemPluginID,
		"acme.app-provider-a",
	)
	writeAppJSON(t, filepath.Join(cfg.Paths.DeploymentRoot, "plugins_state.json"), map[string]any{
		"enabledPluginIds": []string{"acme.app-provider-b", "acme.app-provider-a"},
	})

	_, err := NewDeploymentTypeRegistry(cfg)
	if !errors.Is(err, appsubsystem.ErrAppModeProviderRequired) {
		t.Fatalf("expected app mode provider-required error, got %v", err)
	}
	expectedErr := `app mode requires a single active app subsystem provider with app deployment runtime support: multiple app subsystem providers are active ("acme.app-provider-a", "acme.app-provider-b"); disable all but one`
	if err == nil || err.Error() != expectedErr {
		t.Fatalf("expected exact provider-conflict error %q, got %v", expectedErr, err)
	}
}

func TestNewDeploymentTypeRegistryRejectsMixedRegisteredAndUnregisteredActiveProviders(
	t *testing.T,
) {
	t.Parallel()

	cfg := testDeploymentConfigWithType(t, config.ModeApp, deployments.TypeApp)
	enableAppDeploymentRuntimePluginWithID(
		t,
		cfg.Paths.DeploymentRoot,
		plugins.AppSubsystemPluginID,
		plugins.AppSubsystemPluginID,
	)
	enableAppDeploymentRuntimePluginWithID(
		t,
		cfg.Paths.DeploymentRoot,
		plugins.AppSubsystemPluginID,
		"setta-fixture-unregistered-app-provider",
	)
	writeAppJSON(t, filepath.Join(cfg.Paths.DeploymentRoot, "plugins_state.json"), map[string]any{
		"enabledPluginIds": []string{
			plugins.AppSubsystemPluginID,
			"setta-fixture-unregistered-app-provider",
		},
	})

	_, err := NewDeploymentTypeRegistry(cfg)
	if !errors.Is(err, appsubsystem.ErrAppModeProviderRequired) {
		t.Fatalf("expected app mode provider-required error, got %v", err)
	}
	expectedErr := `app mode requires a single active app subsystem provider with app deployment runtime support: installed app subsystem providers are invalid ("setta-fixture-unregistered-app-provider")`
	if err == nil || err.Error() != expectedErr {
		t.Fatalf("expected exact invalid-provider error %q, got %v", expectedErr, err)
	}
}
