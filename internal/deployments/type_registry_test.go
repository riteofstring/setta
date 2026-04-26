package deployments

import (
	"context"
	"errors"
	"testing"
)

func TestNewTypeRegistryRejectsDuplicateTypes(t *testing.T) {
	t.Parallel()

	_, err := NewTypeRegistry([]TypeRegistration{
		ShareTypeRegistration(),
		ShareTypeRegistration(),
	})
	if !errors.Is(err, ErrTypeRegistrationDuplicate) {
		t.Fatalf("expected duplicate type error, got %v", err)
	}
}

func TestNewTypeRegistryRejectsDuplicateStartupModes(t *testing.T) {
	t.Parallel()

	_, err := NewTypeRegistry([]TypeRegistration{
		ShareTypeRegistration(),
		{
			Type: TypeApp,
			Startup: StartupRegistration{
				ModeName: "share",
				URLLabel: "App URL",
			},
			OpenRuntime: Open,
		},
	})
	if !errors.Is(err, ErrStartupModeRegistrationDuplicate) {
		t.Fatalf("expected duplicate startup mode error, got %v", err)
	}
}

func TestNewTypeRegistryAcceptsPluginOwnedDeploymentTypes(t *testing.T) {
	t.Parallel()

	registry, err := NewTypeRegistry([]TypeRegistration{
		ShareTypeRegistration(),
		{
			Type: Type(" plugin-app "),
			Startup: StartupRegistration{
				ModeName: "plugin-app",
				URLLabel: "Plugin App URL",
			},
			OpenRuntime: Open,
		},
	})
	if err != nil {
		t.Fatalf("new type registry: %v", err)
	}

	registration, err := registry.RegistrationForStartupMode("plugin-app")
	if err != nil {
		t.Fatalf("lookup plugin deployment startup mode: %v", err)
	}
	if registration.Type != Type("plugin-app") {
		t.Fatalf("expected normalized plugin deployment type, got %#v", registration)
	}
}

func TestTypeRegistryResolveStartupRegistrationMatchesModeAndManifest(t *testing.T) {
	t.Parallel()

	registry, err := NewTypeRegistry([]TypeRegistration{
		ShareTypeRegistration(),
		{
			Type: TypeApp,
			Startup: StartupRegistration{
				ModeName: "app",
				URLLabel: "App URL",
			},
			OpenRuntime: Open,
		},
	})
	if err != nil {
		t.Fatalf("new type registry: %v", err)
	}

	registration, err := registry.ResolveStartupRegistration("app", Manifest{
		DeploymentName:    "demo-app",
		DeploymentType:    TypeApp,
		DeploymentVersion: "v2",
	})
	if err != nil {
		t.Fatalf("resolve startup registration: %v", err)
	}
	if registration.Type != TypeApp {
		t.Fatalf("expected app registration, got %#v", registration)
	}
}

func TestTypeRegistryResolveStartupRegistrationRejectsMismatchedManifest(t *testing.T) {
	t.Parallel()

	registry, err := NewTypeRegistry([]TypeRegistration{ShareTypeRegistration()})
	if err != nil {
		t.Fatalf("new type registry: %v", err)
	}

	_, err = registry.ResolveStartupRegistration("share", Manifest{
		DeploymentName:    "demo-app",
		DeploymentType:    TypeApp,
		DeploymentVersion: "v7",
	})
	if err == nil || err.Error() != "deployment is not a share deployment: demo-app/v7" {
		t.Fatalf("expected share mismatch error, got %v", err)
	}
}

func TestTypeRegistryResolvedRegistrationUsesRegisteredOpener(t *testing.T) {
	t.Parallel()

	called := false
	registry, err := NewTypeRegistry([]TypeRegistration{
		{
			Type: TypeShare,
			Startup: StartupRegistration{
				ModeName: "share",
				URLLabel: "Share URL",
			},
			OpenRuntime: func(context.Context, RuntimeOptions) (*Runtime, error) {
				called = true
				return nil, nil
			},
		},
	})
	if err != nil {
		t.Fatalf("new type registry: %v", err)
	}

	registration, err := registry.ResolveStartupRegistration("share", Manifest{
		DeploymentName:    "demo-share",
		DeploymentType:    TypeShare,
		DeploymentVersion: "v1",
	})
	if err != nil {
		t.Fatalf("resolve startup registration: %v", err)
	}
	if _, err := registration.OpenRuntime(context.Background(), RuntimeOptions{}); err != nil {
		t.Fatalf("open runtime through resolved registration: %v", err)
	}
	if !called {
		t.Fatal("expected registered opener to be called")
	}
}
