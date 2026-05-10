package plugins

import (
	"context"
	"errors"
	"testing"

	"setta/internal/config"
)

// Enable/disable should follow the highest-precedence discovered entry and keep backend restart requirements explicit.
func TestServiceEnableDisableLifecycleControls(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	frontendRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	rewritePluginManifest(t, frontendRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "backend")

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	disabledFrontend, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("disable frontend plugin: %v", err)
	}
	if disabledFrontend.State != PluginRuntimeStateDisabled || disabledFrontend.RestartRequired {
		t.Fatalf("unexpected frontend disable result %#v", disabledFrontend)
	}

	enabledFrontend, err := service.Enable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("enable frontend plugin: %v", err)
	}
	if enabledFrontend.State != PluginRuntimeStateActive || enabledFrontend.RestartRequired {
		t.Fatalf("unexpected frontend enable result %#v", enabledFrontend)
	}

	disabledBackend, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-backend",
	})
	if err != nil {
		t.Fatalf("disable backend plugin: %v", err)
	}
	if disabledBackend.State != PluginRuntimeStatePendingRestart || !disabledBackend.RestartRequired {
		t.Fatalf("expected backend disable to require restart, got %#v", disabledBackend)
	}

	enabledMissing, err := service.Enable(context.Background(), EnableDisableOptions{
		PluginID: "missing-plugin",
	})
	if err == nil {
		t.Fatalf("expected missing enable to fail, got %#v", enabledMissing)
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeNotFound {
		t.Fatalf("expected not found code, got %q", serviceErr.Code)
	}
}

func TestServiceEnableDisableTracksEnablementSource(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("initial rescan: %v", err)
	}
	initial := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeWorkspace)
	if initial.State != PluginRuntimeStateActive {
		t.Fatalf("expected initial frontend plugin to be active, got %#v", initial)
	}
	if initial.EnablementSource == nil || *initial.EnablementSource != PluginEnablementSourceManifestDefault {
		t.Fatalf("expected manifest-default enablement source, got %#v", initial.EnablementSource)
	}

	if _, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	}); err != nil {
		t.Fatalf("disable frontend plugin: %v", err)
	}

	snapshot, err = service.Rescan()
	if err != nil {
		t.Fatalf("rescan after disable: %v", err)
	}
	disabled := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeWorkspace)
	if disabled.State != PluginRuntimeStateDisabled {
		t.Fatalf("expected disabled frontend plugin, got %#v", disabled)
	}
	if disabled.EnablementSource == nil || *disabled.EnablementSource != PluginEnablementSourceWorkspaceDisabled {
		t.Fatalf("expected workspace-disabled enablement source, got %#v", disabled.EnablementSource)
	}

	if _, err := service.Enable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	}); err != nil {
		t.Fatalf("enable frontend plugin: %v", err)
	}

	snapshot, err = service.Rescan()
	if err != nil {
		t.Fatalf("rescan after enable: %v", err)
	}
	enabled := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeWorkspace)
	if enabled.State != PluginRuntimeStateActive {
		t.Fatalf("expected re-enabled frontend plugin to be active, got %#v", enabled)
	}
	if enabled.EnablementSource == nil || *enabled.EnablementSource != PluginEnablementSourceWorkspaceEnabled {
		t.Fatalf("expected workspace-enabled enablement source, got %#v", enabled.EnablementSource)
	}
}

// Environment-managed plugins should allow runtime enable/disable while still rejecting uninstall and ambiguous scope writes.
func TestServicePackageManagerLifecycleControls(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	sitePackages, _ := installPackageManagerFixture(
		t,
		"frontend",
		"setta-fixture-frontend",
		"0.1.0",
		func(pluginRoot string) {
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				frontend := payload["frontend"].(map[string]any)
				frontend["entrypoint"] = "frontend/src/index.js"
				frontend["style"] = "frontend/src/index.css"
			})
		},
	)
	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})

	disabled, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("disable highest-precedence plugin: %v", err)
	}
	if disabled.State != PluginRuntimeStateDisabled || disabled.RestartRequired {
		t.Fatalf("unexpected package-manager disable result %#v", disabled)
	}

	enabled, err := service.Enable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("enable highest-precedence plugin: %v", err)
	}
	if enabled.State != PluginRuntimeStateActive || enabled.RestartRequired {
		t.Fatalf("unexpected package-manager enable result %#v", enabled)
	}

	_, err = service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-frontend",
		Scope:    pluginScopePointer(PluginScopeSettaFiles),
	})
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error for package-manager uninstall, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeManagedExternally {
		t.Fatalf("expected managed externally code, got %q", serviceErr.Code)
	}

	workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	rewritePluginManifest(t, workspaceRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})

	_, err = service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-frontend",
	})
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error for multi-scope uninstall, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeUninstallScopeRequired {
		t.Fatalf("expected uninstall scope required code, got %q", serviceErr.Code)
	}
}
