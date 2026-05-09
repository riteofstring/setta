package plugins

import (
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/config"
	"setta/internal/testutil/firstpartyplugin"
)

func TestServiceRuntimeBuildsFrontendListAndStatusPayloads(t *testing.T) {
	// Runtime reads should expose active frontend bootstrap data plus full status entries.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"pluginConfigById": map[string]any{
			string(PluginScopeWorkspace) + ":setta-fixture-full": map[string]any{
				"enabled": true,
				"label":   "fixture",
			},
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if runtimeResponse.SchemaVersion != pluginRuntimeSchemaVersion {
		t.Fatalf("expected runtime schema version %d, got %d", pluginRuntimeSchemaVersion, runtimeResponse.SchemaVersion)
	}
	if runtimeResponse.List.SchemaVersion != pluginListSchemaVersion {
		t.Fatalf("expected list schema version %d, got %d", pluginListSchemaVersion, runtimeResponse.List.SchemaVersion)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active list plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	listEntry := runtimeResponse.List.Plugins[0]
	if listEntry.PluginID != "setta-fixture-full" {
		t.Fatalf("expected full fixture plugin id, got %#v", listEntry.PluginID)
	}
	if len(listEntry.Components) != 3 || listEntry.Components[0] != "backend" || listEntry.Components[1] != "frontend" || listEntry.Components[2] != "content" {
		t.Fatalf("expected backend/frontend/content components, got %#v", listEntry.Components)
	}
	if listEntry.Frontend.EntrypointURL == nil || !strings.Contains(*listEntry.Frontend.EntrypointURL, "/plugins/setta-fixture-full/frontend/src/index.js?v=") {
		t.Fatalf("expected versioned frontend entrypoint url, got %#v", listEntry.Frontend.EntrypointURL)
	}
	if !listEntry.Content.HasBlueprints || !listEntry.Content.HasProjectTemplates || !listEntry.Content.HasPrompts {
		t.Fatalf("expected full content descriptor, got %#v", listEntry.Content)
	}
	if !listEntry.Config.HasSchema || listEntry.Config.SchemaJSON == nil {
		t.Fatalf("expected config schema payload, got %#v", listEntry.Config)
	}
	if got := listEntry.Config.CurrentConfig["label"]; got != "fixture" {
		t.Fatalf("expected current config label fixture, got %#v", got)
	}
	if listEntry.Config.SchemaJSONDigestSHA256 == nil || len(*listEntry.Config.SchemaJSONDigestSHA256) != 64 {
		t.Fatalf("expected schema digest, got %#v", listEntry.Config.SchemaJSONDigestSHA256)
	}
	if listEntry.Config.CurrentConfigDigestSHA256 == nil || len(*listEntry.Config.CurrentConfigDigestSHA256) != 64 {
		t.Fatalf("expected current config digest, got %#v", listEntry.Config.CurrentConfigDigestSHA256)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active status entry, got %#v", statusEntry.State)
	}
	if len(statusEntry.Components) != 3 || statusEntry.Components[0] != "backend" || statusEntry.Components[1] != "frontend" || statusEntry.Components[2] != "content" {
		t.Fatalf("expected backend/frontend/content status components, got %#v", statusEntry.Components)
	}
	if statusEntry.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace source scope label, got %#v", statusEntry.SourceScopeLabel)
	}
}

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

func TestServiceRuntimeWatchCodeCapabilitiesDefaultToUnavailableWithoutPlugin(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusNoProvider,
		nil,
		nil,
		nil,
		nil,
		nil,
	)
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected watch code unavailable without provider, got %#v", watchCode)
	}
	if watchCode.Python || watchCode.RequiresLanguageServer || watchCode.CanvasControlsUI {
		t.Fatalf("expected watch code surfaces unavailable without provider, got %#v", watchCode)
	}
	assertRuntimeWatchCodeSelection(
		t,
		runtimeResponse.Status.WatchCodeSelection,
		PluginWatchCodeProviderSelectionStatusNoProvider,
		nil,
		nil,
		nil,
		nil,
		nil,
	)
}

func TestWatchCodeProviderSelectionHelpersUseTrimmedOwnerBuckets(t *testing.T) {
	providerID := "setta-watch-code"
	selectedProviderID := " " + providerID + " "
	selection := PluginWatchCodeProviderSelection{
		Status:                  PluginWatchCodeProviderSelectionStatusActive,
		SelectedPluginID:        &selectedProviderID,
		ActivePluginIDs:         []string{" " + providerID + " "},
		DisabledPluginIDs:       []string{" disabled-provider "},
		InvalidPluginIDs:        []string{" invalid-provider "},
		PendingRestartPluginIDs: []string{" pending-provider "},
		ConflictingPluginIDs:    []string{" conflict-provider "},
	}

	if !selection.ActivePluginIDMatches(providerID) {
		t.Fatalf("expected selected active provider %q to match %#v", providerID, selection)
	}
	for _, candidate := range []string{
		providerID,
		"disabled-provider",
		"invalid-provider",
		"pending-provider",
		"conflict-provider",
	} {
		if !selection.ContainsPluginID(candidate) {
			t.Fatalf("expected provider selection to contain %q in %#v", candidate, selection)
		}
	}
	if selection.ContainsPluginID("missing-provider") {
		t.Fatalf("did not expect missing provider to match %#v", selection)
	}
}

func TestServiceRuntimeWatchCodeCapabilitiesRejectManifestOnlyProvider(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-watch-code-provider"
	installRuntimeWatchCodeFixture(t, roots, runtimeWatchCodeFixtureOptions{
		PluginID:         pluginID,
		FixtureName:      "frontend",
		EnabledByDefault: true,
		WatchCode: map[string]any{
			"canvasControlsUi": true,
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

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected manifest-only watch code provider to stay unavailable, got %#v", watchCode)
	}
	assertRuntimeWatchCodeSelection(
		t,
		runtimeResponse.Status.WatchCodeSelection,
		PluginWatchCodeProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
}

func TestServiceRuntimeWatchCodeCapabilitiesFollowBackendProbedProvider(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-watch-code-provider"
	installRuntimeWatchCodeFixture(t, roots, runtimeWatchCodeFixtureOptions{
		PluginID:                 pluginID,
		FixtureName:              "frontend",
		EnabledByDefault:         true,
		RegisterWatchCodeBackend: true,
		WatchCode: map[string]any{
			"canvasControlsUi": true,
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

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusActive,
		stringPointer(pluginID),
		[]string{pluginID},
		nil,
		nil,
		nil,
	)
	if watchCode.PluginID != pluginID || !watchCode.PluginEnabled {
		t.Fatalf("expected selected watch code provider %q, got %#v", pluginID, watchCode)
	}
	if !watchCode.Python || !watchCode.RequiresLanguageServer || !watchCode.CanvasControlsUI {
		t.Fatalf("expected full watch code capability surface, got %#v", watchCode)
	}
	assertRuntimeWatchCodeSelection(
		t,
		runtimeResponse.Status.WatchCodeSelection,
		PluginWatchCodeProviderSelectionStatusActive,
		stringPointer(pluginID),
		[]string{pluginID},
		nil,
		nil,
		nil,
	)
}

func TestServiceRuntimeWatchCodeCapabilitiesRejectIncompleteBackendRouteContract(t *testing.T) {
	cases := map[string]runtimeWatchCodeFixtureOptions{
		"missing registerRouter": {
			OmitWatchCodeRouterCapability: true,
		},
		"missing inputs route": {
			WatchCodeBackendRouteSuffixes: []string{},
		},
	}

	for name, options := range cases {
		name := name
		options := options
		t.Run(name, func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			pluginID := "acme-watch-code-provider"
			options.PluginID = pluginID
			options.FixtureName = "frontend"
			options.EnabledByDefault = true
			options.RegisterWatchCodeBackend = true
			options.WatchCode = map[string]any{
				"canvasControlsUi": true,
			}
			installRuntimeWatchCodeFixture(t, roots, options)

			service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load runtime payload: %v", err)
			}
			if runtimeResponse.FeatureCapabilities == nil {
				t.Fatal("expected feature capabilities payload")
			}

			watchCode := runtimeResponse.FeatureCapabilities.WatchCode
			assertRuntimeWatchCodeSelection(
				t,
				watchCode.ProviderSelection,
				PluginWatchCodeProviderSelectionStatusInvalidProvider,
				nil,
				nil,
				nil,
				[]string{pluginID},
				nil,
			)
			if watchCode.PluginEnabled || watchCode.PluginID != "" {
				t.Fatalf("expected incomplete watch code provider unavailable, got %#v", watchCode)
			}
			assertRuntimeWatchCodeSelection(
				t,
				runtimeResponse.Status.WatchCodeSelection,
				PluginWatchCodeProviderSelectionStatusInvalidProvider,
				nil,
				nil,
				nil,
				[]string{pluginID},
				nil,
			)
		})
	}
}

func TestServiceRuntimeWatchCodeCapabilitiesBlockHostlessLauncherProvider(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-watch-code-provider"
	installRuntimeWatchCodeFixture(t, roots, runtimeWatchCodeFixtureOptions{
		PluginID:                 pluginID,
		FixtureName:              "frontend",
		EnabledByDefault:         true,
		RegisterWatchCodeBackend: true,
		WatchCode: map[string]any{
			"canvasControlsUi": true,
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeLauncher)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load launcher runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected launcher watch code provider unavailable, got %#v", watchCode)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status entry, got %#v", runtimeResponse.Status.Plugins)
	}
	statusEntry := runtimeResponse.Status.Plugins[0]
	if len(statusEntry.BlockedCapabilities) != 1 {
		t.Fatalf("expected registerWatchCodeBackend to be blocked, got %#v", statusEntry.BlockedCapabilities)
	}
	if statusEntry.BlockedCapabilities[0].Capability != "registerWatchCodeBackend" ||
		statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonModePolicy {
		t.Fatalf("expected mode-policy Watch Code block, got %#v", statusEntry.BlockedCapabilities[0])
	}
}

func TestServiceRuntimeWatchCodeCapabilitiesUseProbedLanguageServerRequirement(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-watch-code-provider"
	requiresLanguageServer := false
	installRuntimeWatchCodeFixture(t, roots, runtimeWatchCodeFixtureOptions{
		PluginID:                               pluginID,
		FixtureName:                            "frontend",
		EnabledByDefault:                       true,
		RegisterWatchCodeBackend:               true,
		WatchCodeBackendRequiresLanguageServer: &requiresLanguageServer,
		WatchCode: map[string]any{
			"canvasControlsUi": true,
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

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	if watchCode.PluginID != pluginID || !watchCode.PluginEnabled || !watchCode.Python {
		t.Fatalf("expected selected probed watch-code provider %q, got %#v", pluginID, watchCode)
	}
	if watchCode.RequiresLanguageServer {
		t.Fatalf("expected language-server requirement to follow backend probe, got %#v", watchCode)
	}
	if !watchCode.CanvasControlsUI {
		t.Fatalf("expected manifest-owned canvas control flag to remain enabled, got %#v", watchCode)
	}
}

func TestServiceRuntimeWatchCodeCapabilitiesRejectBackendProbeWithoutRegistration(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-watch-code-provider"
	installRuntimeWatchCodeFixture(t, roots, runtimeWatchCodeFixtureOptions{
		PluginID:                         pluginID,
		FixtureName:                      "backend",
		EnabledByDefault:                 true,
		RegisterWatchCodeBackend:         true,
		OmitWatchCodeBackendRegistration: true,
		WatchCode:                        map[string]any{},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected unregistered backend-probed watch code provider unavailable, got %#v", watchCode)
	}
}

func TestServiceRuntimeWatchCodeCapabilitiesFollowFirstPartyPluginManifest(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	pluginID := "setta-watch-code"
	pluginRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), pluginID)
	copyBackendCodegenFixtureDir(t, filepath.Join(repoRoot, "plugins", pluginID), pluginRoot)
	writeWatchCodeRuntimeFrontendBuildOutputs(t, filepath.Join(pluginRoot, "frontend"))

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

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusActive,
		stringPointer(pluginID),
		[]string{pluginID},
		nil,
		nil,
		nil,
	)
	if watchCode.PluginID != pluginID || !watchCode.PluginEnabled {
		t.Fatalf("expected selected first-party watch code provider %q, got %#v", pluginID, watchCode)
	}
	if !watchCode.Python || !watchCode.RequiresLanguageServer || !watchCode.CanvasControlsUI {
		t.Fatalf("expected first-party watch code capability surface, got %#v", watchCode)
	}

	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one runtime plugin, got %#v", runtimeResponse.List.Plugins)
	}
	listEntry := runtimeResponse.List.Plugins[0]
	if listEntry.PluginID != pluginID {
		t.Fatalf("expected first-party watch code plugin list entry, got %#v", listEntry.PluginID)
	}
	if listEntry.Frontend.EntrypointURL == nil || !strings.Contains(*listEntry.Frontend.EntrypointURL, "/plugins/setta-watch-code/frontend/dist/index.js?v=") {
		t.Fatalf("expected watch code frontend entrypoint URL, got %#v", listEntry.Frontend.EntrypointURL)
	}
	if !containsString(listEntry.EffectiveCapabilities, "registerCanvasControl") ||
		!containsString(listEntry.EffectiveCapabilities, "registerSettingRevealHandler") ||
		!containsString(listEntry.EffectiveCapabilities, "registerRouter") ||
		!containsString(listEntry.EffectiveCapabilities, "registerWatchCodeBackend") ||
		!containsString(listEntry.EffectiveCapabilities, "readProjectState") ||
		!containsString(listEntry.EffectiveCapabilities, "subscribeProjectState") {
		t.Fatalf("expected watch code frontend capabilities, got %#v", listEntry.EffectiveCapabilities)
	}
}

func TestServiceRuntimeWatchCodeCapabilitiesTreatDisabledPluginAsUnavailable(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-disabled-watch-code-provider"
	installRuntimeWatchCodeFixture(t, roots, runtimeWatchCodeFixtureOptions{
		PluginID:                 pluginID,
		FixtureName:              "backend",
		EnabledByDefault:         false,
		RegisterWatchCodeBackend: true,
		WatchCode:                map[string]any{},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusDisabledProvider,
		nil,
		nil,
		[]string{pluginID},
		nil,
		nil,
	)
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected disabled watch code provider unavailable, got %#v", watchCode)
	}
	if watchCode.Python || watchCode.RequiresLanguageServer || watchCode.CanvasControlsUI {
		t.Fatalf("expected disabled watch code provider to expose no surfaces, got %#v", watchCode)
	}
}

func TestServiceRuntimeWatchCodeCapabilitiesFailClosedOnPendingRestartProvider(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-pending-restart-watch-code-provider"
	installRuntimeWatchCodeFixture(t, roots, runtimeWatchCodeFixtureOptions{
		PluginID:                 pluginID,
		FixtureName:              "backend",
		EnabledByDefault:         true,
		RegisterWatchCodeBackend: true,
		WatchCode:                map[string]any{},
	})
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"enabledPluginIds":               []string{pluginID},
		"pendingRestartBackendPluginIds": []string{pluginID},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusPendingRestart,
		nil,
		nil,
		nil,
		nil,
		nil,
		[]string{pluginID},
	)
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected pending restart watch code provider to stay unavailable, got %#v", watchCode)
	}
	if watchCode.Python || watchCode.RequiresLanguageServer || watchCode.CanvasControlsUI {
		t.Fatalf("expected pending restart watch code provider to expose no surfaces, got %#v", watchCode)
	}
	assertRuntimeWatchCodeSelection(
		t,
		runtimeResponse.Status.WatchCodeSelection,
		PluginWatchCodeProviderSelectionStatusPendingRestart,
		nil,
		nil,
		nil,
		nil,
		nil,
		[]string{pluginID},
	)
}

func TestServiceRuntimeWatchCodeCapabilitiesFailClosedWhenProviderPendingRestartBesideActive(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	activePluginID := "acme-active-watch-code-provider"
	pendingRestartPluginID := "acme-pending-restart-watch-code-provider"
	for _, pluginID := range []string{activePluginID, pendingRestartPluginID} {
		installRuntimeWatchCodeFixture(t, roots, runtimeWatchCodeFixtureOptions{
			PluginID:                 pluginID,
			FixtureName:              "backend",
			EnabledByDefault:         true,
			RegisterWatchCodeBackend: true,
			WatchCode:                map[string]any{},
		})
	}
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
		t.Fatal("expected feature capabilities payload")
	}

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusPendingRestart,
		nil,
		[]string{activePluginID},
		nil,
		nil,
		nil,
		[]string{pendingRestartPluginID},
	)
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected pending restart provider to fail closed beside active provider, got %#v", watchCode)
	}
	if watchCode.Python || watchCode.RequiresLanguageServer || watchCode.CanvasControlsUI {
		t.Fatalf("expected pending restart provider to keep surfaces unavailable, got %#v", watchCode)
	}
	assertRuntimeWatchCodeSelection(
		t,
		runtimeResponse.Status.WatchCodeSelection,
		PluginWatchCodeProviderSelectionStatusPendingRestart,
		nil,
		[]string{activePluginID},
		nil,
		nil,
		nil,
		[]string{pendingRestartPluginID},
	)
}

func TestServiceRuntimeWatchCodeCapabilitiesTreatBackendProbeWithoutPythonAsInvalid(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-invalid-watch-code-provider"
	installRuntimeWatchCodeFixture(t, roots, runtimeWatchCodeFixtureOptions{
		PluginID:                  pluginID,
		FixtureName:               "frontend",
		EnabledByDefault:          true,
		RegisterWatchCodeBackend:  true,
		WatchCodeBackendLanguages: []string{"typescript"},
		WatchCode: map[string]any{
			"canvasControlsUi": true,
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

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusInvalidProvider,
		nil,
		nil,
		nil,
		[]string{pluginID},
		nil,
	)
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected invalid watch code provider unavailable, got %#v", watchCode)
	}
}

func TestServiceRuntimeWatchCodeCapabilitiesFailClosedOnProviderConflict(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	firstPluginID := "acme-primary-watch-code-provider"
	secondPluginID := "contoso-secondary-watch-code-provider"
	for _, pluginID := range []string{firstPluginID, secondPluginID} {
		installRuntimeWatchCodeFixture(t, roots, runtimeWatchCodeFixtureOptions{
			PluginID:                 pluginID,
			FixtureName:              "backend",
			EnabledByDefault:         true,
			RegisterWatchCodeBackend: true,
			WatchCode:                map[string]any{},
		})
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected feature capabilities payload")
	}

	watchCode := runtimeResponse.FeatureCapabilities.WatchCode
	assertRuntimeWatchCodeSelection(
		t,
		watchCode.ProviderSelection,
		PluginWatchCodeProviderSelectionStatusConflict,
		nil,
		[]string{firstPluginID, secondPluginID},
		nil,
		nil,
		[]string{firstPluginID, secondPluginID},
	)
	if watchCode.PluginEnabled || watchCode.PluginID != "" {
		t.Fatalf("expected conflicting watch code providers unavailable, got %#v", watchCode)
	}
	if watchCode.Python || watchCode.RequiresLanguageServer || watchCode.CanvasControlsUI {
		t.Fatalf("expected conflicting watch code providers to expose no surfaces, got %#v", watchCode)
	}
	assertRuntimeWatchCodeSelection(
		t,
		runtimeResponse.Status.WatchCodeSelection,
		PluginWatchCodeProviderSelectionStatusConflict,
		nil,
		[]string{firstPluginID, secondPluginID},
		nil,
		nil,
		[]string{firstPluginID, secondPluginID},
	)
}

func TestServiceDeploymentSnapshotForActivePluginNormalizesConfigToWorkspaceScope(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-deployment-app-provider"
	pluginRoot := copyPluginFixtureToScope(
		t,
		roots,
		filesystemPluginScopeGlobal,
		"frontend",
	)
	targetRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeGlobal), pluginID)
	if err := os.Rename(pluginRoot, targetRoot); err != nil {
		t.Fatalf("rename plugin root %s -> %s: %v", pluginRoot, targetRoot, err)
	}
	rewritePluginManifest(t, targetRoot, func(payload map[string]any) {
		payload["id"] = pluginID
		payload["name"] = "Deployment Snapshot App Provider"
		payload["enabledByDefault"] = true
		payload["backend"] = map[string]any{
			"entrypoint": "runtime_backend/main.py",
		}
		payload["capabilities"] = []string{"registerAppSubsystemBackend"}
		payload["featureCapabilities"] = map[string]any{
			"appSubsystem": map[string]any{
				"appDeploymentRuntime": true,
			},
		}
	})
	writeRuntimeAppSubsystemBackendProbe(
		t,
		targetRoot,
		true,
		backendruntime.RequiredListenerEndpointNames(),
	)
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"pluginConfigById": map[string]any{
			string(PluginScopeGlobal) + ":" + pluginID: map[string]any{
				"theme": "ocean",
			},
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	snapshot, err := service.DeploymentSnapshotForActivePlugin(pluginID)
	if err != nil {
		t.Fatalf("build deployment snapshot: %v", err)
	}

	if snapshot.SourcePath != targetRoot {
		t.Fatalf("expected deployment snapshot source path %q, got %q", targetRoot, snapshot.SourcePath)
	}
	if len(snapshot.State.EnabledPluginIDs) != 1 || snapshot.State.EnabledPluginIDs[0] != pluginID {
		t.Fatalf("expected deployment snapshot to enable %q, got %#v", pluginID, snapshot.State.EnabledPluginIDs)
	}
	workspaceKey := string(PluginScopeWorkspace) + ":" + pluginID
	if got := snapshot.State.PluginConfigByID[workspaceKey]; got == nil {
		t.Fatalf("expected workspace-scoped deployment config, got %#v", snapshot.State.PluginConfigByID)
	}
	if _, ok := snapshot.State.PluginConfigByID[string(PluginScopeGlobal)+":"+pluginID]; ok {
		t.Fatalf("expected global-scoped config to be remapped for deployment, got %#v", snapshot.State.PluginConfigByID)
	}
}

func TestServicePackageActivePluginForDeploymentVendorsPackageManagerPythonPayload(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	sitePackages, _ := installPackageManagerFixture(
		t,
		"backend",
		"setta-fixture-backend",
		"0.1.0",
		func(pluginRoot string) {
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				payload["backend"] = map[string]any{
					"entrypoint": "runtime_backend/main.py",
				}
			})
			writePackageManagerTestFile(
				t,
				filepath.Join(pluginRoot, "runtime_backend", "main.py"),
				"import shared_dep\nprint(shared_dep.VALUE)\n",
			)
			writePackageManagerTestFile(
				t,
				filepath.Join(filepath.Dir(pluginRoot), "shared_dep", "__init__.py"),
				"VALUE = 'vendored dependency'\n",
			)
		},
	)

	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})
	targetRoot := filepath.Join(t.TempDir(), "packaged-provider")
	state, err := service.PackageActivePluginForDeployment("setta-fixture-backend", targetRoot)
	if err != nil {
		t.Fatalf("package active plugin for deployment: %v", err)
	}

	if !slices.Equal(state.EnabledPluginIDs, []string{"setta-fixture-backend"}) {
		t.Fatalf("expected packaged provider to be enabled, got %#v", state.EnabledPluginIDs)
	}
	vendoredDependency := filepath.Join(
		targetRoot,
		pythonBackendSitePackagesDirName,
		"shared_dep",
		"__init__.py",
	)
	if _, err := os.Stat(vendoredDependency); err != nil {
		t.Fatalf("expected dependency payload to be vendored at %s: %v", vendoredDependency, err)
	}

	if err := os.RemoveAll(sitePackages); err != nil {
		t.Fatalf("remove original site-packages: %v", err)
	}
	env, err := pythonBackendLaunchEnvironment(targetRoot)
	if err != nil {
		t.Fatalf("resolve packaged python launch environment: %v", err)
	}
	output := runPythonWithPluginEnvironment(
		t,
		env,
		"import shared_dep\nprint(shared_dep.VALUE)\n",
	)
	if strings.TrimSpace(output) != "vendored dependency" {
		t.Fatalf("expected packaged dependency import to succeed, got %q", output)
	}
}

func TestServicePackageActivePluginForDeploymentPackagesInstalledFirstPartyAppSubsystemPlugin(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installedPluginRoot := installBuiltFirstPartyPackageManagerPluginInSearchPath(
		t,
		sitePackages,
		firstpartyplugin.AppSubsystemPluginID,
	)

	service := mustNewPluginMutationServiceWithPackageManager(
		t,
		roots,
		nil,
		config.ModeIDE,
		[]string{sitePackages},
	)
	if err := service.store.SavePluginsState(PluginsStateFile{
		EnabledPluginIDs: []string{firstpartyplugin.AppSubsystemPluginID},
	}); err != nil {
		t.Fatalf("save app subsystem plugin state: %v", err)
	}

	if _, err := os.Stat(filepath.Join(installedPluginRoot, "frontend", "package.json")); !os.IsNotExist(err) {
		t.Fatalf("expected installed app subsystem wheel root to omit frontend/package.json, got %v", err)
	}

	targetRoot := filepath.Join(t.TempDir(), "packaged-provider")
	state, err := service.PackageActivePluginForDeployment(
		firstpartyplugin.AppSubsystemPluginID,
		targetRoot,
	)
	if err != nil {
		t.Fatalf("package installed app subsystem plugin for deployment: %v", err)
	}

	if !slices.Equal(state.EnabledPluginIDs, []string{firstpartyplugin.AppSubsystemPluginID}) {
		t.Fatalf("expected packaged provider to enable the app subsystem plugin, got %#v", state.EnabledPluginIDs)
	}
	for _, relativePath := range []string{
		filepath.Join("frontend", "dist", "index.js"),
		filepath.Join("frontend", "dist", "index.css"),
		filepath.Join("setta.plugin.json"),
		filepath.Join("runtime_backend", "main.py"),
	} {
		if _, err := os.Stat(filepath.Join(targetRoot, relativePath)); err != nil {
			t.Fatalf("expected packaged installed plugin asset %s: %v", relativePath, err)
		}
	}
	if _, err := os.Stat(filepath.Join(targetRoot, "frontend", "package.json")); !os.IsNotExist(err) {
		t.Fatalf("expected packaged installed plugin root to preserve wheel layout without package.json, got %v", err)
	}
}

func runPythonWithPluginEnvironment(
	t *testing.T,
	environment map[string]string,
	script string,
) string {
	t.Helper()

	command := exec.Command(mustNewPythonRuntime(t).InterpreterPath(), "-c", script)
	command.Env = os.Environ()
	for key, value := range environment {
		command.Env = append(command.Env, key+"="+value)
	}
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("run python with plugin environment: %v\n%s", err, string(output))
	}
	return string(output)
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
