package plugins

import (
	"os"
	"path/filepath"
	"testing"

	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/config"
)

func TestServiceRuntimeAppSubsystemCapabilitiesDefaultToUnavailableWithoutPlugin(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}
	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusNoProvider,
		nil,
		nil,
		nil,
		nil,
		nil,
	)
	if appSubsystem.PluginID != "" {
		t.Fatalf("expected no selected app subsystem plugin, got %q", appSubsystem.PluginID)
	}
	if appSubsystem.PluginEnabled {
		t.Fatalf("expected app subsystem plugin disabled without fixture plugin, got %#v", appSubsystem)
	}
	if appSubsystem.AppAuthoringUI || appSubsystem.AppPreviewUI || appSubsystem.AppGenerationChatModes || appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected app subsystem surfaces unavailable without plugin, got %#v", appSubsystem)
	}
	assertRuntimeAppSubsystemSelection(
		t,
		runtimeResponse.Status.AppSubsystemSelection,
		PluginAppSubsystemProviderSelectionStatusNoProvider,
		nil,
		nil,
		nil,
		nil,
		nil,
	)
}

func TestServiceRuntimeAppSubsystemCapabilitiesTreatDisabledPluginAsUnavailable(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-disabled-app-provider"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    pluginID,
		FixtureName:                 "frontend",
		EnabledByDefault:            false,
		RegisterAppSubsystemBackend: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":         true,
			"appPreviewUi":           true,
			"appGenerationChatModes": true,
			"appDeploymentRuntime":   true,
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}
	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusDisabledProvider,
		nil,
		nil,
		[]string{pluginID},
		nil,
		nil,
	)
	if appSubsystem.PluginEnabled {
		t.Fatalf("expected disabled app subsystem plugin to stay unavailable, got %#v", appSubsystem)
	}
	if appSubsystem.AppAuthoringUI || appSubsystem.AppPreviewUI || appSubsystem.AppGenerationChatModes || appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected disabled app subsystem surfaces unavailable, got %#v", appSubsystem)
	}
	assertRuntimeAppSubsystemSelection(
		t,
		runtimeResponse.Status.AppSubsystemSelection,
		PluginAppSubsystemProviderSelectionStatusDisabledProvider,
		nil,
		nil,
		[]string{pluginID},
		nil,
		nil,
	)
}

func TestServiceRuntimeAppSubsystemCapabilitiesFollowActivePluginManifest(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-active-app-provider"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    pluginID,
		FixtureName:                 "frontend",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":         true,
			"appPreviewUi":           true,
			"appGenerationChatModes": false,
			"appDeploymentRuntime":   false,
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}
	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusActive,
		stringPointer(pluginID),
		[]string{pluginID},
		nil,
		nil,
		nil,
	)
	if appSubsystem.PluginID != pluginID {
		t.Fatalf("expected selected app subsystem plugin %q, got %#v", pluginID, appSubsystem.PluginID)
	}
	if !appSubsystem.PluginEnabled {
		t.Fatalf("expected enabled app subsystem plugin, got %#v", appSubsystem)
	}
	if !appSubsystem.AppAuthoringUI || !appSubsystem.AppPreviewUI {
		t.Fatalf("expected enabled app authoring and preview surfaces, got %#v", appSubsystem)
	}
	if appSubsystem.AppGenerationChatModes || appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected disabled chat-mode/runtime surfaces to stay false, got %#v", appSubsystem)
	}
	assertRuntimeAppSubsystemSelection(
		t,
		runtimeResponse.Status.AppSubsystemSelection,
		PluginAppSubsystemProviderSelectionStatusActive,
		stringPointer(pluginID),
		[]string{pluginID},
		nil,
		nil,
		nil,
	)
}

func TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithoutBackendContractAsInvalid(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-unregistered-app-provider"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:         pluginID,
		FixtureName:      "frontend",
		EnabledByDefault: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":         true,
			"appPreviewUi":           true,
			"appGenerationChatModes": true,
			"appDeploymentRuntime":   true,
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected runtime feature capabilities")
	}

	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
	if appSubsystem.PluginEnabled || appSubsystem.PluginID != "" {
		t.Fatalf("expected provider without backend contract to fail closed, got %#v", appSubsystem)
	}
	if appSubsystem.AppAuthoringUI || appSubsystem.AppPreviewUI || appSubsystem.AppGenerationChatModes || appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected provider without backend contract surfaces unavailable, got %#v", appSubsystem)
	}
}

func TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithoutRequiredBackendEndpointsAsInvalid(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-app-provider-without-required-endpoints"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    pluginID,
		FixtureName:                 "frontend",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		OmitAppSubsystemEndpoints:   true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":         true,
			"appPreviewUi":           true,
			"appGenerationChatModes": true,
			"appDeploymentRuntime":   true,
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected runtime feature capabilities")
	}

	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
	if appSubsystem.PluginEnabled || appSubsystem.PluginID != "" {
		t.Fatalf("expected provider without required endpoints to fail closed, got %#v", appSubsystem)
	}
	if appSubsystem.AppAuthoringUI || appSubsystem.AppPreviewUI || appSubsystem.AppGenerationChatModes || appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected provider without required endpoints surfaces unavailable, got %#v", appSubsystem)
	}
}

func TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithPartialBackendEndpointSetAsInvalid(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-app-provider-with-partial-endpoints"
	requiredEndpoints := backendruntime.RequiredListenerEndpointNames()
	if len(requiredEndpoints) < 2 {
		t.Fatalf("expected multiple required app subsystem endpoints, got %#v", requiredEndpoints)
	}
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    pluginID,
		FixtureName:                 "frontend",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		AppSubsystemEndpointNames:   requiredEndpoints[:len(requiredEndpoints)-1],
		AppSubsystem: map[string]any{
			"appAuthoringUi":         true,
			"appPreviewUi":           true,
			"appGenerationChatModes": true,
			"appDeploymentRuntime":   true,
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected runtime feature capabilities")
	}

	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
	if appSubsystem.PluginEnabled || appSubsystem.PluginID != "" {
		t.Fatalf("expected provider with partial endpoints to fail closed, got %#v", appSubsystem)
	}
	if appSubsystem.AppAuthoringUI || appSubsystem.AppPreviewUI || appSubsystem.AppGenerationChatModes || appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected provider with partial endpoints surfaces unavailable, got %#v", appSubsystem)
	}
}

func TestServiceRuntimeAppSubsystemCapabilitiesTreatMixedContractAndNoContractActiveProvidersAsInvalid(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	activePluginID := "acme-active-app-provider"
	invalidPluginID := "acme-app-provider-without-contract"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    activePluginID,
		FixtureName:                 "frontend",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":         true,
			"appPreviewUi":           true,
			"appGenerationChatModes": true,
			"appDeploymentRuntime":   true,
		},
	})
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:         invalidPluginID,
		FixtureName:      "frontend",
		EnabledByDefault: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":         true,
			"appPreviewUi":           true,
			"appGenerationChatModes": true,
			"appDeploymentRuntime":   true,
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected runtime feature capabilities")
	}

	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusInvalidProvider,
		nil,
		[]string{activePluginID},
		nil,
		[]string{invalidPluginID},
		nil,
	)
	if appSubsystem.PluginEnabled || appSubsystem.PluginID != "" {
		t.Fatalf("expected mixed active providers to fail closed, got %#v", appSubsystem)
	}
	if appSubsystem.AppAuthoringUI || appSubsystem.AppPreviewUI || appSubsystem.AppGenerationChatModes || appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected mixed active providers to keep app subsystem unavailable, got %#v", appSubsystem)
	}
	assertRuntimeAppSubsystemSelection(
		t,
		runtimeResponse.Status.AppSubsystemSelection,
		PluginAppSubsystemProviderSelectionStatusInvalidProvider,
		nil,
		[]string{activePluginID},
		nil,
		[]string{invalidPluginID},
		nil,
	)
}

func TestServiceRuntimeAppSubsystemCapabilitiesIgnorePendingRestartProviders(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	activePluginID := "acme-active-app-provider"
	pendingRestartPluginID := "acme-pending-restart-app-provider"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    activePluginID,
		FixtureName:                 "frontend",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":       true,
			"appPreviewUi":         true,
			"appDeploymentRuntime": true,
		},
	})
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    pendingRestartPluginID,
		FixtureName:                 "frontend",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":       true,
			"appPreviewUi":         true,
			"appDeploymentRuntime": true,
		},
	})
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"enabledPluginIds":               []string{activePluginID, pendingRestartPluginID},
		"pendingRestartBackendPluginIds": []string{pendingRestartPluginID},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected runtime feature capabilities")
	}

	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusActive,
		stringPointer(activePluginID),
		[]string{activePluginID},
		nil,
		nil,
		nil,
	)
	if appSubsystem.PluginID != activePluginID {
		t.Fatalf("expected active app subsystem provider %q, got %#v", activePluginID, appSubsystem.PluginID)
	}
}

func TestServiceRuntimeAppSubsystemCapabilitiesIgnoreShadowedInvalidProviders(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	const pluginID = "acme-shadowed-app-provider"

	workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	renamedWorkspaceRoot := filepath.Join(
		pluginScopeRoot(roots, filesystemPluginScopeWorkspace),
		pluginID,
	)
	if err := os.Rename(workspaceRoot, renamedWorkspaceRoot); err != nil {
		t.Fatalf("rename workspace plugin root: %v", err)
	}
	workspaceRoot = renamedWorkspaceRoot
	rewritePluginManifest(t, workspaceRoot, func(payload map[string]any) {
		payload["id"] = pluginID
		payload["name"] = "Workspace Shadow Primary"
		payload["enabledByDefault"] = true
		delete(payload, "featureCapabilities")
	})

	settaFilesRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "frontend")
	renamedSettaFilesRoot := filepath.Join(
		pluginScopeRoot(roots, filesystemPluginScopeSettaFiles),
		pluginID,
	)
	if err := os.Rename(settaFilesRoot, renamedSettaFilesRoot); err != nil {
		t.Fatalf("rename setta_files plugin root: %v", err)
	}
	settaFilesRoot = renamedSettaFilesRoot
	rewritePluginManifest(t, settaFilesRoot, func(payload map[string]any) {
		payload["id"] = pluginID
		payload["name"] = "Shadowed Invalid App Provider"
		payload["enabledByDefault"] = true
		payload["featureCapabilities"] = map[string]any{
			"appSubsystem": map[string]any{
				"appAuthoringUi":         true,
				"appPreviewUi":           true,
				"appGenerationChatModes": true,
				"appDeploymentRuntime":   true,
			},
		}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected runtime feature capabilities")
	}

	assertRuntimeAppSubsystemSelection(
		t,
		runtimeResponse.FeatureCapabilities.AppSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusNoProvider,
		nil,
		nil,
		nil,
		nil,
		nil,
	)
	assertRuntimeAppSubsystemSelection(
		t,
		runtimeResponse.Status.AppSubsystemSelection,
		PluginAppSubsystemProviderSelectionStatusNoProvider,
		nil,
		nil,
		nil,
		nil,
		nil,
	)

	listEntry := mustFindRuntimeListEntry(t, runtimeResponse.List.Plugins, pluginID)
	if listEntry.SourceScope != PluginScopeWorkspace {
		t.Fatalf("expected workspace entry to remain the active list entry, got %#v", listEntry.SourceScope)
	}
	shadowedEntry := mustFindStatusEntry(t, runtimeResponse.Status.Plugins, pluginID, PluginRuntimeStateShadowed)
	if shadowedEntry.SourceScope != PluginScopeSettaFiles {
		t.Fatalf("expected setta_files entry to stay shadowed, got %#v", shadowedEntry.SourceScope)
	}
}

func TestServiceRuntimeAppSubsystemCapabilitiesTreatInvalidProviderAsUnavailable(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-invalid-app-provider"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    pluginID,
		FixtureName:                 "full",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":         true,
			"appPreviewUi":           true,
			"appGenerationChatModes": true,
			"appDeploymentRuntime":   true,
		},
	})
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"pluginConfigById": map[string]any{
			string(PluginScopeWorkspace) + ":" + pluginID: "invalid-root",
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}
	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
	if appSubsystem.PluginEnabled || appSubsystem.PluginID != "" {
		t.Fatalf("expected invalid provider to stay unavailable, got %#v", appSubsystem)
	}
	if appSubsystem.AppAuthoringUI || appSubsystem.AppPreviewUI || appSubsystem.AppGenerationChatModes || appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected invalid provider surfaces unavailable, got %#v", appSubsystem)
	}
	assertRuntimeAppSubsystemSelection(
		t,
		runtimeResponse.Status.AppSubsystemSelection,
		PluginAppSubsystemProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
}

func TestServiceRuntimeAppSubsystemCapabilitiesTreatProviderWithoutFrontendEntrypointAsInvalid(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-missing-app-frontend-provider"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    pluginID,
		FixtureName:                 "backend",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":         true,
			"appPreviewUi":           true,
			"appGenerationChatModes": true,
			"appDeploymentRuntime":   true,
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}
	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
	if appSubsystem.PluginEnabled || appSubsystem.PluginID != "" {
		t.Fatalf("expected provider without frontend entrypoint to stay unavailable, got %#v", appSubsystem)
	}
	if appSubsystem.AppAuthoringUI || appSubsystem.AppPreviewUI || appSubsystem.AppGenerationChatModes || appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected provider without frontend entrypoint to expose no app subsystem surfaces, got %#v", appSubsystem)
	}
	assertRuntimeAppSubsystemSelection(
		t,
		runtimeResponse.Status.AppSubsystemSelection,
		PluginAppSubsystemProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
}

func TestServiceRuntimeAppSubsystemCapabilitiesFailClosedOnProviderConflict(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	firstPluginID := "acme-primary-app-provider"
	secondPluginID := "contoso-secondary-app-provider"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    firstPluginID,
		FixtureName:                 "frontend",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi": true,
			"appPreviewUi":   true,
		},
	})
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:                    secondPluginID,
		FixtureName:                 "frontend",
		EnabledByDefault:            true,
		RegisterAppSubsystemBackend: true,
		AppSubsystem: map[string]any{
			"appGenerationChatModes": true,
			"appDeploymentRuntime":   true,
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}
	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	assertRuntimeAppSubsystemSelection(
		t,
		appSubsystem.ProviderSelection,
		PluginAppSubsystemProviderSelectionStatusConflict,
		nil,
		[]string{firstPluginID, secondPluginID},
		nil,
		nil,
		[]string{firstPluginID, secondPluginID},
	)
	if appSubsystem.PluginEnabled || appSubsystem.PluginID != "" {
		t.Fatalf("expected conflicting providers to disable app subsystem, got %#v", appSubsystem)
	}
	if appSubsystem.AppAuthoringUI || appSubsystem.AppPreviewUI || appSubsystem.AppGenerationChatModes || appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected conflicting provider surfaces unavailable, got %#v", appSubsystem)
	}
	assertRuntimeAppSubsystemSelection(
		t,
		runtimeResponse.Status.AppSubsystemSelection,
		PluginAppSubsystemProviderSelectionStatusConflict,
		nil,
		[]string{firstPluginID, secondPluginID},
		nil,
		nil,
		[]string{firstPluginID, secondPluginID},
	)
}

type runtimeAppSubsystemFixtureOptions struct {
	PluginID                    string
	FixtureName                 string
	EnabledByDefault            bool
	RegisterAppSubsystemBackend bool
	OmitAppSubsystemEndpoints   bool
	AppSubsystemEndpointNames   []string
	AppSubsystem                map[string]any
}

func installRuntimeAppSubsystemFixture(
	t *testing.T,
	roots filesystemResolverTestRoots,
	options runtimeAppSubsystemFixtureOptions,
) string {
	t.Helper()

	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, options.FixtureName)
	targetRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), options.PluginID)
	if err := os.Rename(pluginRoot, targetRoot); err != nil {
		t.Fatalf("rename plugin root %s -> %s: %v", pluginRoot, targetRoot, err)
	}
	rewritePluginManifest(t, targetRoot, func(payload map[string]any) {
		payload["id"] = options.PluginID
		payload["name"] = "Runtime App Subsystem Fixture"
		payload["enabledByDefault"] = options.EnabledByDefault
		if options.RegisterAppSubsystemBackend {
			payload["backend"] = map[string]any{
				"entrypoint": "runtime_backend/main.py",
			}
			payload["capabilities"] = []string{"registerAppSubsystemBackend"}
		} else {
			delete(payload, "backend")
			payload["capabilities"] = []string{}
		}
		payload["featureCapabilities"] = map[string]any{
			"appSubsystem": options.AppSubsystem,
		}
	})
	if options.RegisterAppSubsystemBackend {
		endpointNames := options.AppSubsystemEndpointNames
		if endpointNames == nil && !options.OmitAppSubsystemEndpoints {
			endpointNames = backendruntime.RequiredListenerEndpointNames()
		}
		writeRuntimeAppSubsystemBackendProbe(t, targetRoot, true, endpointNames)
	}
	return targetRoot
}
