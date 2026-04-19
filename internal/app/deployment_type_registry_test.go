package app

import (
	"testing"

	"setta/internal/deployments"
)

func TestNewDeploymentTypeRegistryIncludesPluginAppRegistration(t *testing.T) {
	t.Parallel()

	registry, err := NewDeploymentTypeRegistry()
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
