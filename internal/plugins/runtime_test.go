package plugins

import (
	"context"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

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
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
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
		PluginID:         pluginID,
		FixtureName:      "frontend",
		EnabledByDefault: false,
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
		PluginID:         pluginID,
		FixtureName:      "frontend",
		EnabledByDefault: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi":         true,
			"appPreviewUi":           true,
			"appGenerationChatModes": false,
			"appDeploymentRuntime":   false,
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

func TestServiceRuntimeAppSubsystemCapabilitiesTreatInvalidProviderAsUnavailable(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginID := "acme-invalid-app-provider"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:         pluginID,
		FixtureName:      "full",
		EnabledByDefault: true,
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

func TestServiceRuntimeAppSubsystemCapabilitiesFailClosedOnProviderConflict(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	firstPluginID := "acme-primary-app-provider"
	secondPluginID := "contoso-secondary-app-provider"
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:         firstPluginID,
		FixtureName:      "frontend",
		EnabledByDefault: true,
		AppSubsystem: map[string]any{
			"appAuthoringUi": true,
			"appPreviewUi":   true,
		},
	})
	installRuntimeAppSubsystemFixture(t, roots, runtimeAppSubsystemFixtureOptions{
		PluginID:         secondPluginID,
		FixtureName:      "frontend",
		EnabledByDefault: true,
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
	PluginID         string
	FixtureName      string
	EnabledByDefault bool
	AppSubsystem     map[string]any
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
		payload["featureCapabilities"] = map[string]any{
			"appSubsystem": options.AppSubsystem,
		}
	})
	return targetRoot
}

func assertRuntimeAppSubsystemSelection(
	t *testing.T,
	selection *PluginAppSubsystemProviderSelection,
	expectedStatus PluginAppSubsystemProviderSelectionStatusKind,
	expectedSelectedPluginID *string,
	expectedActive []string,
	expectedDisabled []string,
	expectedInvalid []string,
	expectedConflicting []string,
) {
	t.Helper()

	if selection == nil {
		t.Fatal("expected app subsystem provider selection")
	}
	if selection.Status != expectedStatus {
		t.Fatalf("expected selection status %q, got %#v", expectedStatus, selection)
	}
	if expectedSelectedPluginID == nil {
		if selection.SelectedPluginID != nil {
			t.Fatalf("expected no selected provider, got %#v", selection.SelectedPluginID)
		}
	} else {
		if selection.SelectedPluginID == nil || *selection.SelectedPluginID != *expectedSelectedPluginID {
			t.Fatalf("expected selected provider %q, got %#v", *expectedSelectedPluginID, selection.SelectedPluginID)
		}
	}
	if !slices.Equal(selection.ActivePluginIDs, emptyStrings(expectedActive)) {
		t.Fatalf("expected active provider ids %#v, got %#v", expectedActive, selection.ActivePluginIDs)
	}
	if !slices.Equal(selection.DisabledPluginIDs, emptyStrings(expectedDisabled)) {
		t.Fatalf("expected disabled provider ids %#v, got %#v", expectedDisabled, selection.DisabledPluginIDs)
	}
	if !slices.Equal(selection.InvalidPluginIDs, emptyStrings(expectedInvalid)) {
		t.Fatalf("expected invalid provider ids %#v, got %#v", expectedInvalid, selection.InvalidPluginIDs)
	}
	if !slices.Equal(selection.ConflictingPluginIDs, emptyStrings(expectedConflicting)) {
		t.Fatalf("expected conflicting provider ids %#v, got %#v", expectedConflicting, selection.ConflictingPluginIDs)
	}
}

func emptyStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	return values
}

// Content descriptor scans should ignore symlinked directory loops until a real file appears.
func TestRuntimeDirectoryHasFilesIgnoresSymlinkDirectoryCycles(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := filepath.Join(roots.workspaceRoot, "content-plugin")
	promptsRoot := filepath.Join(pluginRoot, "content", "prompts")
	if err := os.MkdirAll(promptsRoot, 0o755); err != nil {
		t.Fatalf("mkdir prompts root: %v", err)
	}
	if err := os.Symlink(promptsRoot, filepath.Join(promptsRoot, "loop")); err != nil {
		t.Fatalf("create prompts symlink loop: %v", err)
	}

	if runtimeDirectoryHasFiles(pluginRoot, "content/prompts") {
		t.Fatal("expected symlink directory loop alone not to count as content")
	}

	if err := os.WriteFile(filepath.Join(promptsRoot, "prompt.md"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("write prompt file: %v", err)
	}
	if !runtimeDirectoryHasFiles(pluginRoot, "content/prompts") {
		t.Fatal("expected real prompt file to count as content")
	}
}

func TestServiceRuntimeWaitsForServiceLock(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	assertServiceCallWaitsForLock(t, service, func() error {
		_, err := service.Runtime(RuntimeOptions{})
		return err
	})
}

func TestServiceRuntimeAndStatusExposePackageManagerDiscoveryMetadata(t *testing.T) {
	// Runtime/status reads should preserve package-manager discovery metadata for active environment plugins.
	roots := newFilesystemResolverTestRoots(t)
	sitePackages, _ := installPackageManagerFixture(t, "frontend", "setta-fixture-frontend", "0.1.0", nil)
	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one runtime list entry, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one runtime status entry, got %#v", runtimeResponse.Status.Plugins)
	}

	listEntry := runtimeResponse.List.Plugins[0]
	if listEntry.PluginID != "setta-fixture-frontend" {
		t.Fatalf("expected package-manager plugin id, got %#v", listEntry.PluginID)
	}
	if listEntry.SourceScope != PluginScopeSettaFiles || listEntry.SourceScopeLabel != "setta_files" {
		t.Fatalf("expected setta_files package-manager scope, got %#v / %#v", listEntry.SourceScope, listEntry.SourceScopeLabel)
	}
	if listEntry.SourceManager != PluginSourceManagerPackageManager {
		t.Fatalf("expected package-manager source manager, got %#v", listEntry.SourceManager)
	}
	if listEntry.CanonicalSourceKey != "pypi:setta-fixture-frontend" {
		t.Fatalf("unexpected package-manager canonical source key %q", listEntry.CanonicalSourceKey)
	}
	if listEntry.SourceManagerHint == nil || *listEntry.SourceManagerHint != packageManagerSourceHint {
		t.Fatalf("unexpected package-manager hint %#v", listEntry.SourceManagerHint)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.SourceScope != PluginScopeSettaFiles || statusEntry.SourceScopeLabel != "setta_files" {
		t.Fatalf("expected setta_files package-manager status scope, got %#v / %#v", statusEntry.SourceScope, statusEntry.SourceScopeLabel)
	}
	if statusEntry.SourceManager != PluginSourceManagerPackageManager {
		t.Fatalf("expected package-manager status source manager, got %#v", statusEntry.SourceManager)
	}
	if statusEntry.CanonicalSourceKey != "pypi:setta-fixture-frontend" {
		t.Fatalf("unexpected status canonical source key %q", statusEntry.CanonicalSourceKey)
	}
	if statusEntry.SourceManagerHint == nil || *statusEntry.SourceManagerHint != packageManagerSourceHint {
		t.Fatalf("unexpected status package-manager hint %#v", statusEntry.SourceManagerHint)
	}
}

func TestServiceRuntimeEncodesFrontendAssetURLs(t *testing.T) {
	// Frontend entrypoint URLs should escape reserved path characters and keep digest versioning.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/entry #main.js"
		frontend["style"] = "frontend/src/index.css"
	})
	if err := os.Rename(
		filepath.Join(pluginRoot, "frontend", "src", "index.js"),
		filepath.Join(pluginRoot, "frontend", "src", "entry #main.js"),
	); err != nil {
		t.Fatalf("rename frontend entrypoint: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one plugin, got %#v", runtimeResponse.List.Plugins)
	}
	entrypointURL := runtimeResponse.List.Plugins[0].Frontend.EntrypointURL
	if entrypointURL == nil {
		t.Fatal("expected frontend entrypoint url")
	}
	if !strings.Contains(*entrypointURL, "/plugins/setta-fixture-frontend/frontend/src/entry%20%23main.js") {
		t.Fatalf("expected encoded frontend asset url, got %q", *entrypointURL)
	}
	if !strings.Contains(*entrypointURL, "?v=") {
		t.Fatalf("expected version digest in frontend asset url, got %q", *entrypointURL)
	}
	if strings.Contains(*entrypointURL, "#") {
		t.Fatalf("expected frontend asset url to escape '#', got %q", *entrypointURL)
	}
}

func TestServiceRuntimeRedactsConfigAndSourceOutsideIDE(t *testing.T) {
	// Share/app runtime payloads should hide raw source identity and config payload contents.
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
				"secret":  "value",
			},
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeShare)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load redacted runtime payload: %v", err)
	}

	listEntry := runtimeResponse.List.Plugins[0]
	if !strings.Contains(listEntry.CanonicalSourceKey, "redacted:workspace:setta:setta-fixture-full:") {
		t.Fatalf("expected redacted canonical source key, got %q", listEntry.CanonicalSourceKey)
	}
	if listEntry.Config.HasSchema != true || listEntry.Config.SchemaJSON != nil {
		t.Fatalf("expected redacted schema payload, got %#v", listEntry.Config)
	}
	if len(listEntry.Config.CurrentConfig) != 0 {
		t.Fatalf("expected empty redacted config payload, got %#v", listEntry.Config.CurrentConfig)
	}
	if listEntry.Config.CurrentConfigDigestSHA256 != nil {
		t.Fatalf("expected redacted config digest to be omitted, got %#v", listEntry.Config.CurrentConfigDigestSHA256)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if !strings.Contains(statusEntry.SourcePath, "[redacted]:workspace:setta:setta-fixture-full:") {
		t.Fatalf("expected redacted source path, got %q", statusEntry.SourcePath)
	}
}

func TestServiceRuntimeConfigDigestsChangeAfterConfigWrite(t *testing.T) {
	// Runtime list entries should expose config digests and change the current-config digest after writes.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	if _, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
		},
	}); err != nil {
		t.Fatalf("write initial plugin config: %v", err)
	}

	firstRuntime, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load first runtime payload: %v", err)
	}
	firstEntry := mustFindRuntimeListEntry(t, firstRuntime.List.Plugins, "setta-fixture-full")
	if firstEntry.Config.SchemaJSONDigestSHA256 == nil || len(*firstEntry.Config.SchemaJSONDigestSHA256) != 64 {
		t.Fatalf("expected schema digest on first runtime read, got %#v", firstEntry.Config.SchemaJSONDigestSHA256)
	}
	if firstEntry.Config.CurrentConfigDigestSHA256 == nil || len(*firstEntry.Config.CurrentConfigDigestSHA256) != 64 {
		t.Fatalf("expected current-config digest on first runtime read, got %#v", firstEntry.Config.CurrentConfigDigestSHA256)
	}
	firstSchemaDigest := *firstEntry.Config.SchemaJSONDigestSHA256
	firstCurrentConfigDigest := *firstEntry.Config.CurrentConfigDigestSHA256

	if _, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
			"label":   "digest-change",
		},
	}); err != nil {
		t.Fatalf("write updated plugin config: %v", err)
	}

	secondRuntime, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load second runtime payload: %v", err)
	}
	secondEntry := mustFindRuntimeListEntry(t, secondRuntime.List.Plugins, "setta-fixture-full")
	if secondEntry.Config.SchemaJSONDigestSHA256 == nil || *secondEntry.Config.SchemaJSONDigestSHA256 != firstSchemaDigest {
		t.Fatalf("expected stable schema digest after config write, got first=%q second=%#v", firstSchemaDigest, secondEntry.Config.SchemaJSONDigestSHA256)
	}
	if secondEntry.Config.CurrentConfigDigestSHA256 == nil {
		t.Fatalf("expected updated current-config digest, got %#v", secondEntry.Config.CurrentConfigDigestSHA256)
	}
	if *secondEntry.Config.CurrentConfigDigestSHA256 == firstCurrentConfigDigest {
		t.Fatalf("expected current-config digest to change after config write, got first=%q second=%q", firstCurrentConfigDigest, *secondEntry.Config.CurrentConfigDigestSHA256)
	}
	if got := secondEntry.Config.CurrentConfig["label"]; got != "digest-change" {
		t.Fatalf("expected updated config label, got %#v", got)
	}
}

func TestServiceRuntimeRedactionKeepsEntriesDistinctAcrossScopes(t *testing.T) {
	// Share/app redaction should keep duplicate plugin ids in different scopes distinguishable.
	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
			settaFilesRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "frontend")
			for _, pluginRoot := range []string{workspaceRoot, settaFilesRoot} {
				rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
					frontend := payload["frontend"].(map[string]any)
					frontend["entrypoint"] = "frontend/src/index.js"
					frontend["style"] = "frontend/src/index.css"
				})
			}

			service := mustNewPluginMutationService(t, roots, nil, mode)
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load redacted runtime payload: %v", err)
			}

			sourcePaths := map[string]struct{}{}
			canonicalSourceKeys := map[string]struct{}{}
			entryCount := 0
			for _, entry := range runtimeResponse.Status.Plugins {
				if entry.PluginID != "setta-fixture-frontend" {
					continue
				}
				entryCount++
				sourcePaths[entry.SourcePath] = struct{}{}
				canonicalSourceKeys[entry.CanonicalSourceKey] = struct{}{}
			}
			if entryCount != 2 {
				t.Fatalf("expected two redacted status entries, got %#v", runtimeResponse.Status.Plugins)
			}
			if len(sourcePaths) != 2 {
				t.Fatalf("expected distinct redacted source paths across scopes, got %#v", sourcePaths)
			}
			if len(canonicalSourceKeys) != 2 {
				t.Fatalf("expected distinct redacted canonical source keys across scopes, got %#v", canonicalSourceKeys)
			}

			activeEntry := mustFindStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-frontend", PluginRuntimeStateActive)
			shadowedEntry := mustFindStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-frontend", PluginRuntimeStateShadowed)
			if activeEntry.SourceScope != PluginScopeWorkspace {
				t.Fatalf("expected workspace entry to stay active, got %#v", activeEntry.SourceScope)
			}
			if shadowedEntry.SourceScope != PluginScopeSettaFiles {
				t.Fatalf("expected setta_files entry to stay shadowed, got %#v", shadowedEntry.SourceScope)
			}
			if !strings.Contains(activeEntry.SourcePath, "[redacted]:workspace:setta:setta-fixture-frontend:") {
				t.Fatalf("expected workspace redacted source path, got %q", activeEntry.SourcePath)
			}
			if !strings.Contains(activeEntry.CanonicalSourceKey, "redacted:workspace:setta:setta-fixture-frontend:") {
				t.Fatalf("expected workspace redacted canonical source key, got %q", activeEntry.CanonicalSourceKey)
			}
			if !strings.Contains(shadowedEntry.SourcePath, "[redacted]:setta_files:setta:setta-fixture-frontend:") {
				t.Fatalf("expected setta_files redacted source path, got %q", shadowedEntry.SourcePath)
			}
			if !strings.Contains(shadowedEntry.CanonicalSourceKey, "redacted:setta_files:setta:setta-fixture-frontend:") {
				t.Fatalf("expected setta_files redacted canonical source key, got %q", shadowedEntry.CanonicalSourceKey)
			}
			if shadowedEntry.ShadowedBySourcePath == nil || *shadowedEntry.ShadowedBySourcePath != activeEntry.SourcePath {
				t.Fatalf("expected redacted shadow path %q, got %#v", activeEntry.SourcePath, shadowedEntry.ShadowedBySourcePath)
			}
		})
	}
}

func TestServiceRuntimeRedactionKeepsSameScopeSourceManagersDistinct(t *testing.T) {
	// Share/app redaction should keep same-scope setta and package-manager duplicates distinguishable.
	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
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
			localRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "frontend")
			rewritePluginManifest(t, localRoot, func(payload map[string]any) {
				frontend := payload["frontend"].(map[string]any)
				frontend["entrypoint"] = "frontend/src/index.js"
				frontend["style"] = "frontend/src/index.css"
			})

			service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, mode, []string{sitePackages})
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load redacted runtime payload with package manager entry: %v", err)
			}

			sourcePaths := map[string]struct{}{}
			canonicalSourceKeys := map[string]struct{}{}
			entryCount := 0
			for _, entry := range runtimeResponse.Status.Plugins {
				if entry.PluginID != "setta-fixture-frontend" || entry.SourceScope != PluginScopeSettaFiles {
					continue
				}
				entryCount++
				sourcePaths[entry.SourcePath] = struct{}{}
				canonicalSourceKeys[entry.CanonicalSourceKey] = struct{}{}
			}
			if entryCount != 2 {
				t.Fatalf("expected two same-scope status entries, got %#v", runtimeResponse.Status.Plugins)
			}
			if len(sourcePaths) != 2 {
				t.Fatalf("expected distinct redacted source paths across source managers, got %#v", sourcePaths)
			}
			if len(canonicalSourceKeys) != 2 {
				t.Fatalf("expected distinct redacted canonical source keys across source managers, got %#v", canonicalSourceKeys)
			}

			activeEntry := mustFindStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-frontend", PluginRuntimeStateActive)
			shadowedEntry := mustFindStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-frontend", PluginRuntimeStateShadowed)
			if activeEntry.SourceScope != PluginScopeSettaFiles || activeEntry.SourceManager != PluginSourceManagerSetta {
				t.Fatalf("expected active setta entry in setta_files scope, got scope=%q manager=%q", activeEntry.SourceScope, activeEntry.SourceManager)
			}
			if shadowedEntry.SourceScope != PluginScopeSettaFiles || shadowedEntry.SourceManager != PluginSourceManagerPackageManager {
				t.Fatalf("expected shadowed package-manager entry in setta_files scope, got scope=%q manager=%q", shadowedEntry.SourceScope, shadowedEntry.SourceManager)
			}
			if !strings.Contains(activeEntry.SourcePath, "[redacted]:setta_files:setta:setta-fixture-frontend:") {
				t.Fatalf("expected setta redacted source path, got %q", activeEntry.SourcePath)
			}
			if !strings.Contains(activeEntry.CanonicalSourceKey, "redacted:setta_files:setta:setta-fixture-frontend:") {
				t.Fatalf("expected setta redacted canonical source key, got %q", activeEntry.CanonicalSourceKey)
			}
			if !strings.Contains(shadowedEntry.SourcePath, "[redacted]:setta_files:package_manager:setta-fixture-frontend:") {
				t.Fatalf("expected package-manager redacted source path, got %q", shadowedEntry.SourcePath)
			}
			if !strings.Contains(shadowedEntry.CanonicalSourceKey, "redacted:setta_files:package_manager:setta-fixture-frontend:") {
				t.Fatalf("expected package-manager redacted canonical source key, got %q", shadowedEntry.CanonicalSourceKey)
			}
			if shadowedEntry.ShadowedBySourcePath == nil || *shadowedEntry.ShadowedBySourcePath != activeEntry.SourcePath {
				t.Fatalf("expected redacted shadow path %q, got %#v", activeEntry.SourcePath, shadowedEntry.ShadowedBySourcePath)
			}
			if *shadowedEntry.ShadowedBySourcePath == shadowedEntry.SourcePath {
				t.Fatalf("expected shadowed entry to keep a distinct shadow target, got source=%q shadow=%q", shadowedEntry.SourcePath, *shadowedEntry.ShadowedBySourcePath)
			}
		})
	}
}

func TestServiceRuntimePreservesBlockedCapabilitiesInShareMode(t *testing.T) {
	// Runtime status should surface deterministic blocked-capability reasons outside IDE mode.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"writeWorkspacePlugins"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeShare)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load share runtime payload: %v", err)
	}

	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 0 {
		t.Fatalf("expected blocked writeWorkspacePlugins capability to be removed from effective list, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if len(statusEntry.BlockedCapabilities) != 1 {
		t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
	}
	if statusEntry.BlockedCapabilities[0].Capability != "writeWorkspacePlugins" {
		t.Fatalf("expected writeWorkspacePlugins blocked, got %#v", statusEntry.BlockedCapabilities[0])
	}
	if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonModePolicy {
		t.Fatalf("expected mode-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
	}
}

func TestServiceRuntimeBlocksContextMenuCapabilityByHostPolicyInIDE(t *testing.T) {
	// IDE runtime should report registerContextMenu as host-blocked until the host implements it.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerContextMenu", "registerPane"}
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load IDE runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 1 || runtimeResponse.List.Plugins[0].EffectiveCapabilities[0] != "registerPane" {
		t.Fatalf("expected only registerPane to stay effective, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if len(statusEntry.RequestedCapabilities) != 2 {
		t.Fatalf("expected requested capabilities to stay visible, got %#v", statusEntry.RequestedCapabilities)
	}
	if len(statusEntry.BlockedCapabilities) != 1 {
		t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
	}
	if statusEntry.BlockedCapabilities[0].Capability != "registerContextMenu" {
		t.Fatalf("expected registerContextMenu to be blocked, got %#v", statusEntry.BlockedCapabilities[0])
	}
	if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonHostPolicy {
		t.Fatalf("expected host-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
	}
}

func TestServiceRuntimeBlocksExternalAgentAdapterCapabilityByHostPolicy(t *testing.T) {
	// Plugin external-agent adapter capability is intentionally host-blocked on the current Go surface.
	for _, mode := range []config.Mode{config.ModeIDE, config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				payload["capabilities"] = []string{"registerExternalAgentAdapter"}
			})

			service := mustNewPluginMutationService(t, roots, nil, mode)
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load runtime payload: %v", err)
			}
			if len(runtimeResponse.List.Plugins) != 1 {
				t.Fatalf("expected one plugin, got %#v", runtimeResponse.List.Plugins)
			}
			if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 0 {
				t.Fatalf("expected no effective external-agent adapter capability, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
			}

			statusEntry := runtimeResponse.Status.Plugins[0]
			if len(statusEntry.RequestedCapabilities) != 1 || statusEntry.RequestedCapabilities[0] != "registerExternalAgentAdapter" {
				t.Fatalf("expected requested external-agent adapter capability, got %#v", statusEntry.RequestedCapabilities)
			}
			if len(statusEntry.BlockedCapabilities) != 1 {
				t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
			}
			if statusEntry.BlockedCapabilities[0].Capability != "registerExternalAgentAdapter" {
				t.Fatalf("expected registerExternalAgentAdapter to be blocked, got %#v", statusEntry.BlockedCapabilities[0])
			}
			if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonHostPolicy {
				t.Fatalf("expected host-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
			}
		})
	}
}

func TestServiceRuntimeBlocksCodegenTargetCapabilityByModePolicy(t *testing.T) {
	// Share/app runtime should block backend codegen target registration and surface deterministic status.
	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				payload["capabilities"] = []string{"registerCodegenTarget"}
			})

			service := mustNewPluginMutationService(t, roots, nil, mode)
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load runtime payload: %v", err)
			}
			if len(runtimeResponse.List.Plugins) != 1 {
				t.Fatalf("expected one plugin, got %#v", runtimeResponse.List.Plugins)
			}
			if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 0 {
				t.Fatalf("expected no effective codegen capability, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
			}

			statusEntry := runtimeResponse.Status.Plugins[0]
			if statusEntry.State != PluginRuntimeStateActive {
				t.Fatalf("expected active status entry, got %#v", statusEntry.State)
			}
			if len(statusEntry.RequestedCapabilities) != 1 || statusEntry.RequestedCapabilities[0] != "registerCodegenTarget" {
				t.Fatalf("expected requested codegen capability, got %#v", statusEntry.RequestedCapabilities)
			}
			if len(statusEntry.RegisteredCodegenTargets) != 0 {
				t.Fatalf("expected no registered codegen targets in %s, got %#v", mode, statusEntry.RegisteredCodegenTargets)
			}
			if len(statusEntry.BlockedCapabilities) != 1 {
				t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
			}
			if statusEntry.BlockedCapabilities[0].Capability != "registerCodegenTarget" {
				t.Fatalf("expected registerCodegenTarget to be blocked, got %#v", statusEntry.BlockedCapabilities[0])
			}
			if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonModePolicy {
				t.Fatalf("expected mode-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
			}
		})
	}
}

func TestServiceRuntimeBlocksLanguageServerCapabilityByModePolicy(t *testing.T) {
	// Share/app runtime should block backend language-server registration and keep specs empty.
	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				payload["capabilities"] = []string{"registerLanguageServer"}
			})

			service := mustNewPluginMutationService(t, roots, nil, mode)
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load runtime payload: %v", err)
			}
			if len(runtimeResponse.List.Plugins) != 1 {
				t.Fatalf("expected one plugin, got %#v", runtimeResponse.List.Plugins)
			}
			if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 0 {
				t.Fatalf("expected no effective language-server capability, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
			}

			statusEntry := runtimeResponse.Status.Plugins[0]
			if statusEntry.State != PluginRuntimeStateActive {
				t.Fatalf("expected active status entry, got %#v", statusEntry.State)
			}
			if len(statusEntry.RequestedCapabilities) != 1 || statusEntry.RequestedCapabilities[0] != "registerLanguageServer" {
				t.Fatalf("expected requested language-server capability, got %#v", statusEntry.RequestedCapabilities)
			}
			if len(statusEntry.BlockedCapabilities) != 1 {
				t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
			}
			if statusEntry.BlockedCapabilities[0].Capability != "registerLanguageServer" {
				t.Fatalf("expected registerLanguageServer to be blocked, got %#v", statusEntry.BlockedCapabilities[0])
			}
			if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonModePolicy {
				t.Fatalf("expected mode-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
			}

			specs, err := service.LanguageServerSpecs(context.Background(), nil)
			if err != nil {
				t.Fatalf("load language server specs: %v", err)
			}
			if len(specs) != 0 {
				t.Fatalf("expected no language server specs in %s, got %#v", mode, specs)
			}
		})
	}
}

func TestServiceRuntimeEnablesBackendTransportCapabilitiesInIDE(t *testing.T) {
	// IDE runtime should expose the routed backend capability set directly from the Go-owned backend contract.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{
			"registerCodegenTarget",
			"registerLanguageServer",
			"registerMcpTools",
			"registerRouter",
			"registerStaticDir",
			"registerListenerEndpoint",
		}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 6 {
		t.Fatalf("expected backend transport capabilities to be effective, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
	}
	if runtimeResponse.List.Plugins[0].EffectiveCapabilities[0] != "registerCodegenTarget" ||
		runtimeResponse.List.Plugins[0].EffectiveCapabilities[1] != "registerLanguageServer" ||
		runtimeResponse.List.Plugins[0].EffectiveCapabilities[2] != "registerMcpTools" ||
		runtimeResponse.List.Plugins[0].EffectiveCapabilities[3] != "registerRouter" ||
		runtimeResponse.List.Plugins[0].EffectiveCapabilities[4] != "registerStaticDir" ||
		runtimeResponse.List.Plugins[0].EffectiveCapabilities[5] != "registerListenerEndpoint" {
		t.Fatalf("unexpected effective backend capabilities %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if len(statusEntry.RequestedCapabilities) != 6 {
		t.Fatalf("expected requested backend capabilities, got %#v", statusEntry.RequestedCapabilities)
	}
	if len(statusEntry.BlockedCapabilities) != 0 {
		t.Fatalf("expected no blocked backend capabilities, got %#v", statusEntry.BlockedCapabilities)
	}
}

func TestServiceRuntimeReportsBackendRegistrationsFromProbe(t *testing.T) {
	// IDE runtime status should expose probed backend routes, static mounts, and listener endpoints.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{
			"registerCodegenTarget",
			"registerRouter",
			"registerStaticDir",
			"registerListenerEndpoint",
		}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active backend fixture, got %#v", statusEntry.State)
	}
	if len(statusEntry.RegisteredCodegenTargets) != 1 {
		t.Fatalf("expected one codegen target, got %#v", statusEntry.RegisteredCodegenTargets)
	}
	if got := statusEntry.RegisteredCodegenTargets[0]; got.TargetID != "typescript" || got.PluginID != "setta-fixture-backend" || got.Language != "setta-fixture-backend-codegen:typescript" || got.Name != "Fixture TypeScript State" || got.DefaultFileName != "fixture_state.ts" {
		t.Fatalf("unexpected codegen target registration %#v", got)
	}
	if len(statusEntry.RegisteredBackendRoutes) != 2 {
		t.Fatalf("expected two backend routes, got %#v", statusEntry.RegisteredBackendRoutes)
	}
	if got := statusEntry.RegisteredBackendRoutes[0]; got.Path != "/health" || len(got.Methods) != 1 || got.Methods[0] != "GET" {
		t.Fatalf("unexpected first backend route %#v", got)
	}
	if got := statusEntry.RegisteredBackendRoutes[1]; got.Path != "/items" || len(got.Methods) != 2 || got.Methods[0] != "DELETE" || got.Methods[1] != "POST" {
		t.Fatalf("unexpected second backend route %#v", got)
	}
	if len(statusEntry.RegisteredStaticDirs) != 1 {
		t.Fatalf("expected one static dir, got %#v", statusEntry.RegisteredStaticDirs)
	}
	if got := statusEntry.RegisteredStaticDirs[0]; got.RoutePrefix != "/static" || got.Dir != "backend/static" {
		t.Fatalf("unexpected static dir registration %#v", got)
	}
	if len(statusEntry.RegisteredListenerEndpoints) != 1 {
		t.Fatalf("expected one listener endpoint, got %#v", statusEntry.RegisteredListenerEndpoints)
	}
	if got := statusEntry.RegisteredListenerEndpoints[0].Name; got != "route_backend_fixture_ping" {
		t.Fatalf("unexpected listener endpoint %q", got)
	}
}

func TestServiceRuntimeShadowedEntriesDoNotReportPrimaryBackendRegistrations(t *testing.T) {
	// Shadowed entries should keep their own empty registration slices instead of inheriting the active plugin's backend metadata.
	roots := newFilesystemResolverTestRoots(t)
	workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	settaFilesRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "backend")
	for _, pluginRoot := range []string{workspaceRoot, settaFilesRoot} {
		rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
			payload["capabilities"] = []string{
				"registerCodegenTarget",
				"registerRouter",
				"registerStaticDir",
				"registerListenerEndpoint",
			}
		})
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	entries := make([]PluginStatusEntry, 0, 2)
	for _, entry := range runtimeResponse.Status.Plugins {
		if entry.PluginID == "setta-fixture-backend" {
			entries = append(entries, entry)
		}
	}
	if len(entries) != 2 {
		t.Fatalf("expected two backend status entries, got %#v", entries)
	}

	activeEntry := mustFindStatusEntry(t, entries, "setta-fixture-backend", PluginRuntimeStateActive)
	if activeEntry.SourceScope != PluginScopeWorkspace {
		t.Fatalf("expected workspace entry to stay active, got %#v", activeEntry.SourceScope)
	}
	if len(activeEntry.RegisteredCodegenTargets) != 1 ||
		len(activeEntry.RegisteredBackendRoutes) != 2 ||
		len(activeEntry.RegisteredStaticDirs) != 1 ||
		len(activeEntry.RegisteredListenerEndpoints) != 1 {
		t.Fatalf("expected active entry registrations to stay populated, got %#v", activeEntry)
	}

	shadowedEntry := mustFindStatusEntry(t, entries, "setta-fixture-backend", PluginRuntimeStateShadowed)
	if shadowedEntry.SourceScope != PluginScopeSettaFiles || shadowedEntry.ShadowedBySourcePath == nil || *shadowedEntry.ShadowedBySourcePath != activeEntry.SourcePath {
		t.Fatalf("expected setta_files entry to be shadowed by workspace path, got %#v", shadowedEntry)
	}
	if len(shadowedEntry.RegisteredCodegenTargets) != 0 ||
		len(shadowedEntry.RegisteredBackendRoutes) != 0 ||
		len(shadowedEntry.RegisteredStaticDirs) != 0 ||
		len(shadowedEntry.RegisteredListenerEndpoints) != 0 {
		t.Fatalf("expected shadowed entry registrations to stay empty, got %#v", shadowedEntry)
	}
}

func TestServiceRuntimeClearsBackendRegistrationsAfterUninstallCommit(t *testing.T) {
	// Backend runtime refresh after uninstall should clear the live registration surface.
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	linkedRoot := filepath.Join(t.TempDir(), "backend-linked")
	copyBackendCodegenFixtureDir(t, sourceRoot, linkedRoot)
	rewritePluginManifest(t, linkedRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{
			"registerCodegenTarget",
			"registerLanguageServer",
			"registerRouter",
			"registerStaticDir",
			"registerListenerEndpoint",
		}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	linkResult, err := service.Link(LinkOptions{
		LocalPluginRoot: linkedRoot,
		Scope:           scopePointer(PluginScopeWorkspace),
		Enable:          true,
	})
	if err != nil {
		t.Fatalf("link backend plugin: %v", err)
	}
	if !linkResult.RestartRequired || linkResult.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected linked backend plugin to require refresh, got %#v", linkResult)
	}
	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh after link: %v", err)
	}

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload after link refresh: %v", err)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one runtime status plugin, got %#v", runtimeResponse.Status.Plugins)
	}
	languageServerSpecs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": stringPointer("setta-fixture-backend"),
	})
	if err != nil {
		t.Fatalf("load language server specs after link refresh: %v", err)
	}
	if len(languageServerSpecs) != 1 {
		t.Fatalf("expected one language server spec after link refresh, got %#v", languageServerSpecs)
	}
	statusEntry := runtimeResponse.Status.Plugins[0]
	if len(statusEntry.RegisteredCodegenTargets) != 1 ||
		len(statusEntry.RegisteredBackendRoutes) != 2 ||
		len(statusEntry.RegisteredStaticDirs) != 1 ||
		len(statusEntry.RegisteredListenerEndpoints) != 1 {
		t.Fatalf("expected backend registrations after refresh, got %#v", statusEntry)
	}

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-backend",
		Scope:    scopePointer(PluginScopeWorkspace),
	})
	if err != nil {
		t.Fatalf("uninstall backend plugin: %v", err)
	}
	if !uninstallResult.RestartRequired {
		t.Fatalf("expected backend uninstall to require refresh")
	}
	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh after uninstall: %v", err)
	}

	runtimeResponse, err = service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload after uninstall refresh: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 || len(runtimeResponse.Status.Plugins) != 0 {
		t.Fatalf("expected backend registrations to clear after uninstall refresh, got list=%#v status=%#v", runtimeResponse.List.Plugins, runtimeResponse.Status.Plugins)
	}
	languageServerSpecs, err = service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": stringPointer("setta-fixture-backend"),
	})
	if err != nil {
		t.Fatalf("load language server specs after uninstall refresh: %v", err)
	}
	if len(languageServerSpecs) != 0 {
		t.Fatalf("expected language server specs to clear after uninstall refresh, got %#v", languageServerSpecs)
	}
}

func TestServiceRuntimeMarksBackendPluginInvalidWhenProbeFailsForRequestedRegistrations(t *testing.T) {
	// Backend plugins that request route/static/listener registrations must implement the probe contract.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte("package main\n\nfunc main() {}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write backend fixture without probe support: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 {
		t.Fatalf("expected no active list plugins, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid status entry, got %#v", statusEntry.State)
	}
	if len(statusEntry.Errors) != 1 {
		t.Fatalf("expected one backend probe error, got %#v", statusEntry.Errors)
	}
	if statusEntry.Errors[0].Code != string(ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid error code, got %#v", statusEntry.Errors[0])
	}
}

func TestServiceRuntimeMarksBackendPluginInvalidWhenBackendBuildFails(t *testing.T) {
	// Backend build failures should surface as invalid plugins instead of crashing runtime reads.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte("package main\n\nfunc main( {\n"),
		0o644,
	); err != nil {
		t.Fatalf("write backend fixture with invalid Go syntax: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 {
		t.Fatalf("expected no active list plugins, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid status entry, got %#v", statusEntry.State)
	}
	if len(statusEntry.Errors) != 1 {
		t.Fatalf("expected one backend build error, got %#v", statusEntry.Errors)
	}
	if statusEntry.Errors[0].Code != string(ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid error code, got %#v", statusEntry.Errors[0])
	}
	if !strings.Contains(statusEntry.Errors[0].Message, "Plugin backend entrypoint must be valid Go source") {
		t.Fatalf("expected backend build failure message, got %#v", statusEntry.Errors[0].Message)
	}
}

func TestServiceRuntimeMarksBackendPluginInvalidWhenBackendProbeTimesOut(t *testing.T) {
	// Hung backend probes should fail closed instead of stalling runtime/status reads indefinitely.
	previousTimeout := backendProbeTimeout
	backendProbeTimeout = 50 * time.Millisecond
	t.Cleanup(func() {
		backendProbeTimeout = previousTimeout
	})

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte("package main\n\nimport (\n\t\"os\"\n\t\"time\"\n)\n\nconst backendProbeArg = \"--setta-plugin-backend-probe\"\n\nfunc main() {\n\tif len(os.Args) == 2 && os.Args[1] == backendProbeArg {\n\t\ttime.Sleep(200 * time.Millisecond)\n\t}\n}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write backend fixture with hanging probe: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 {
		t.Fatalf("expected no active list plugins, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid status entry, got %#v", statusEntry.State)
	}
	if len(statusEntry.Errors) != 1 {
		t.Fatalf("expected one backend probe timeout error, got %#v", statusEntry.Errors)
	}
	if statusEntry.Errors[0].Code != string(ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid error code, got %#v", statusEntry.Errors[0])
	}
	if !strings.Contains(statusEntry.Errors[0].Message, "Plugin backend runtime probe timed out") {
		t.Fatalf("expected backend probe timeout message, got %#v", statusEntry.Errors[0].Message)
	}
}

func TestServiceRuntimeMarksBackendPluginInvalidWhenGoModuleDependencyIsMissing(t *testing.T) {
	// Missing Go module dependencies should fail closed instead of backfilling a hidden runtime env.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte("package main\n\nimport (\n\t\"fmt\"\n\t\"github.com/google/uuid\"\n)\n\nfunc main() {\n\tfmt.Println(uuid.NewString())\n}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write backend fixture with missing module dependency: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 {
		t.Fatalf("expected no active list plugins, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid status entry, got %#v", statusEntry.State)
	}
	if len(statusEntry.Errors) != 1 {
		t.Fatalf("expected one backend dependency error, got %#v", statusEntry.Errors)
	}
	if statusEntry.Errors[0].Code != string(ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid error code, got %#v", statusEntry.Errors[0])
	}
}

func TestServiceRuntimeActivatesFirstPartyBasedpyrightPackageManagerPlugin(t *testing.T) {
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))

	roots := newFilesystemResolverTestRoots(t)
	sitePackages := firstPartyBasedpyrightSitePackages(t)
	installFirstPartyBasedpyrightPackageManagerPluginInSearchPath(t, sitePackages)

	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 || len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one first-party package-manager plugin, got list=%#v status=%#v", runtimeResponse.List.Plugins, runtimeResponse.Status.Plugins)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.PluginID != "setta-basedpyright" || statusEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active first-party package-manager plugin, got %#v", statusEntry)
	}
	if len(statusEntry.RegisteredLanguageServers) != 1 || statusEntry.RegisteredLanguageServers[0].Language != "python" {
		t.Fatalf("expected one python language server registration, got %#v", statusEntry.RegisteredLanguageServers)
	}
}

func TestServiceRuntimeActivatesFirstPartyAppSubsystemPackageManagerPlugin(t *testing.T) {
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))

	roots := newFilesystemResolverTestRoots(t)
	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installFirstPartyPackageManagerPluginInSearchPath(
		t,
		sitePackages,
		AppSubsystemPluginID,
		"Setta JSON Render App Generation plugin",
	)

	service := mustNewPluginMutationServiceWithPackageManager(
		t,
		roots,
		nil,
		config.ModeIDE,
		[]string{sitePackages},
	)
	if err := service.store.SavePluginsState(PluginsStateFile{
		EnabledPluginIDs: []string{AppSubsystemPluginID},
	}); err != nil {
		t.Fatalf("save app subsystem plugin state: %v", err)
	}

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 || len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf(
			"expected one first-party app subsystem package-manager plugin, got list=%#v status=%#v",
			runtimeResponse.List.Plugins,
			runtimeResponse.Status.Plugins,
		)
	}
	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected runtime feature capabilities")
	}
	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	if appSubsystem.PluginID != AppSubsystemPluginID || !appSubsystem.PluginEnabled {
		t.Fatalf("expected enabled app subsystem runtime capability, got %#v", appSubsystem)
	}
	if !appSubsystem.AppAuthoringUI || !appSubsystem.AppPreviewUI || !appSubsystem.AppGenerationChatModes || !appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected full app subsystem capability surface, got %#v", appSubsystem)
	}

	entry := runtimeResponse.List.Plugins[0]
	if entry.PluginID != AppSubsystemPluginID || entry.SourceManager != PluginSourceManagerPackageManager {
		t.Fatalf("expected package-manager app subsystem plugin list entry, got %#v", entry)
	}
	if len(entry.Components) != 2 || entry.Components[0] != "backend" || entry.Components[1] != "frontend" {
		t.Fatalf("expected backend/frontend app subsystem components, got %#v", entry.Components)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.PluginID != AppSubsystemPluginID || statusEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active app subsystem package-manager plugin, got %#v", statusEntry)
	}
	if len(statusEntry.Components) != 2 || statusEntry.Components[0] != "backend" || statusEntry.Components[1] != "frontend" {
		t.Fatalf("expected backend/frontend app subsystem status components, got %#v", statusEntry.Components)
	}
}

func TestServiceRuntimeKeepsCurrentConfigAcrossUsableDuplicatePromotion(t *testing.T) {
	pythonPath := firstpartyplugin.BasedpyrightPython(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installFirstPartyBasedpyrightPackageManagerPluginInSearchPath(t, sitePackages)

	repoRoot := workerRPCTestRepoRoot(t)
	workspaceRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, filepath.Join(repoRoot, "plugins", "setta-basedpyright"), workspaceRoot)

	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})
	if err := service.store.SavePluginsState(PluginsStateFile{
		PluginConfigByID: map[string]any{
			pluginConfigKey("setta-basedpyright", PluginScopeSettaFiles): map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"extraPaths": []any{"/tmp/custom"},
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("save package-manager config state: %v", err)
	}

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active plugin, got %#v", runtimeResponse.List.Plugins)
	}
	entry := runtimeResponse.List.Plugins[0]
	if entry.SourceScope != PluginScopeWorkspace {
		t.Fatalf("expected workspace duplicate to be primary, got %#v", entry.SourceScope)
	}
	basedpyrightSettings, ok := entry.Config.CurrentConfig["basedpyright"].(map[string]any)
	if !ok {
		t.Fatalf("expected runtime current config root, got %#v", entry.Config.CurrentConfig)
	}
	analysis, ok := basedpyrightSettings["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("expected runtime analysis config, got %#v", basedpyrightSettings["analysis"])
	}
	extraPaths, ok := analysis["extraPaths"].([]any)
	if !ok || len(extraPaths) != 1 || extraPaths[0] != "/tmp/custom" {
		t.Fatalf("expected promoted workspace runtime config to keep lower-precedence extraPaths, got %#v", analysis["extraPaths"])
	}
}

func TestServiceRuntimeMarksFirstPartyBasedpyrightInvalidWhenDefaultInterpreterLacksBasedpyright(t *testing.T) {
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", "setta-basedpyright")
	targetRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 {
		t.Fatalf("expected invalid basedpyright plugin to stay out of the runtime list, got %#v", runtimeResponse.List.Plugins)
	}

	statusEntry := mustFindStatusEntry(t, runtimeResponse.Status.Plugins, "setta-basedpyright", PluginRuntimeStateInvalid)
	if len(statusEntry.RegisteredLanguageServers) != 0 {
		t.Fatalf("expected invalid basedpyright plugin to expose no language server registrations, got %#v", statusEntry.RegisteredLanguageServers)
	}
	if len(statusEntry.Errors) != 1 {
		t.Fatalf("expected one backend probe error, got %#v", statusEntry.Errors)
	}
	if statusEntry.Errors[0].Code != string(ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid error code, got %#v", statusEntry.Errors[0])
	}
}

func TestServiceResolveAssetPathRejectsTraversalAndNonFrontendFiles(t *testing.T) {
	// Asset resolution should allow declared frontend files only.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	assetPath, err := service.ResolveAssetPath("setta-fixture-full", "frontend/src/index.js")
	if err != nil {
		t.Fatalf("resolve frontend asset: %v", err)
	}
	if !strings.HasSuffix(assetPath, filepath.ToSlash("frontend/src/index.js")) && !strings.HasSuffix(assetPath, filepath.Join("frontend", "src", "index.js")) {
		t.Fatalf("unexpected frontend asset path %q", assetPath)
	}

	_, err = service.ResolveAssetPath("setta-fixture-full", "../setta.plugin.json")
	if err == nil {
		t.Fatal("expected traversal to fail")
	}
	var traversalErr *ServiceError
	if !errors.As(err, &traversalErr) || traversalErr.Code != ServiceErrorCodeAssetInvalidPath {
		t.Fatalf("expected asset invalid path error, got %v", err)
	}

	_, err = service.ResolveAssetPath("setta-fixture-full", "backend/main.go")
	if err == nil {
		t.Fatal("expected backend file lookup to fail")
	}
	var notFoundErr *ServiceError
	if !errors.As(err, &notFoundErr) || notFoundErr.Code != ServiceErrorCodeAssetNotFound {
		t.Fatalf("expected asset not found error, got %v", err)
	}
}

func testRuntimeAssetURLBuilder(pluginID string, relativePath string, sourceDigestSHA256 *string) string {
	encodedSegments := []string{url.PathEscape(pluginID)}
	for _, segment := range strings.Split(relativePath, "/") {
		if segment == "" {
			continue
		}
		encodedSegments = append(encodedSegments, url.PathEscape(segment))
	}
	baseURL := "/plugins/" + strings.Join(encodedSegments, "/")
	if sourceDigestSHA256 == nil {
		return baseURL
	}
	return baseURL + "?v=" + url.QueryEscape(*sourceDigestSHA256)
}

func mustFindRuntimeListEntry(t *testing.T, entries []PluginListEntry, pluginID string) PluginListEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID {
			return entry
		}
	}
	t.Fatalf("expected runtime list entry %q", pluginID)
	return PluginListEntry{}
}
