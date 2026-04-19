package app

import (
	"errors"
	"testing"

	"setta/internal/appsubsystem"
	"setta/internal/config"
	"setta/internal/deployments"
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

func TestNewDeploymentTypeRegistryRequiresAppSubsystemPluginForAppMode(t *testing.T) {
	t.Parallel()

	cfg := testDeploymentConfigWithType(t, config.ModeApp, deployments.TypeApp)
	_, err := NewDeploymentTypeRegistry(cfg)
	if !errors.Is(err, appsubsystem.ErrAppModePluginRequired) {
		t.Fatalf("expected app mode plugin-required error, got %v", err)
	}
}
