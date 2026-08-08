package plugins

import (
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/testutil/firstpartyplugin"
)

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
	installBuiltFirstPartyPackageManagerPluginInSearchPath(
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

	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	assertAppSubsystemPackageManagerRuntime(t, runtimeResponse, firstpartyplugin.AppSubsystemPluginID, false)
}

func TestServiceRuntimeActivatesUnknownIDAppSubsystemPackageManagerPlugin(t *testing.T) {
	const unknownAppSubsystemPluginID = "acme-app-subsystem-fixture"

	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))

	roots := newFilesystemResolverTestRoots(t)
	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installPackageManagerFixtureInSearchPath(
		t,
		sitePackages,
		"app-subsystem-unknown-id",
		unknownAppSubsystemPluginID,
		"0.1.0",
		nil,
	)

	service := mustNewPluginMutationServiceWithPackageManager(
		t,
		roots,
		nil,
		config.ModeIDE,
		[]string{sitePackages},
	)
	if err := service.store.SavePluginsState(PluginsStateFile{
		EnabledPluginIDs: []string{unknownAppSubsystemPluginID},
	}); err != nil {
		t.Fatalf("save unknown-id app subsystem plugin state: %v", err)
	}

	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	assertAppSubsystemPackageManagerRuntime(t, runtimeResponse, unknownAppSubsystemPluginID, true)
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

func assertAppSubsystemPackageManagerRuntime(t *testing.T, runtimeResponse PluginRuntimeResponse, pluginID string, expectVersionedURLs bool) {
	t.Helper()

	if len(runtimeResponse.List.Plugins) != 1 || len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one app subsystem package-manager plugin, got list=%#v status=%#v", runtimeResponse.List.Plugins, runtimeResponse.Status.Plugins)
	}
	assertAppSubsystemFeatureCapabilities(t, runtimeResponse, pluginID)
	assertAppSubsystemPackageManagerListEntry(t, runtimeResponse.List.Plugins[0], pluginID, expectVersionedURLs)
	assertAppSubsystemPackageManagerStatusEntry(t, runtimeResponse.Status.Plugins[0], pluginID)
}

func assertAppSubsystemFeatureCapabilities(t *testing.T, runtimeResponse PluginRuntimeResponse, pluginID string) {
	t.Helper()

	if runtimeResponse.FeatureCapabilities == nil {
		t.Fatal("expected runtime feature capabilities")
	}
	appSubsystem := runtimeResponse.FeatureCapabilities.AppSubsystem
	if appSubsystem.PluginID != pluginID || !appSubsystem.PluginEnabled {
		t.Fatalf("expected enabled app subsystem runtime capability for %s, got %#v", pluginID, appSubsystem)
	}
	if !appSubsystem.AppAuthoringUI || !appSubsystem.AppPreviewUI || !appSubsystem.AppGenerationChatModes || !appSubsystem.AppDeploymentRuntime {
		t.Fatalf("expected full app subsystem capability surface, got %#v", appSubsystem)
	}
}

func assertAppSubsystemPackageManagerListEntry(t *testing.T, entry PluginListEntry, pluginID string, expectVersionedURLs bool) {
	t.Helper()

	if entry.PluginID != pluginID || entry.SourceManager != PluginSourceManagerPackageManager {
		t.Fatalf("expected package-manager app subsystem plugin list entry, got %#v", entry)
	}
	if len(entry.Components) != 2 || entry.Components[0] != "backend" || entry.Components[1] != "frontend" {
		t.Fatalf("expected backend/frontend app subsystem components, got %#v", entry.Components)
	}
	if entry.Frontend.EntrypointURL == nil || entry.Frontend.StyleURL == nil {
		t.Fatalf("expected package-manager app subsystem frontend URLs, got %#v", entry.Frontend)
	}
	if expectVersionedURLs {
		assertAppSubsystemVersionedFrontendURLs(t, entry, pluginID)
	}
}

func assertAppSubsystemVersionedFrontendURLs(t *testing.T, entry PluginListEntry, pluginID string) {
	t.Helper()

	if !strings.Contains(*entry.Frontend.EntrypointURL, "/plugins/"+pluginID+"/frontend/dist/index.js?v=") {
		t.Fatalf("expected app subsystem frontend entrypoint URL, got %#v", entry.Frontend.EntrypointURL)
	}
	if !strings.Contains(*entry.Frontend.StyleURL, "/plugins/"+pluginID+"/frontend/dist/index.css?v=") {
		t.Fatalf("expected app subsystem frontend style URL, got %#v", entry.Frontend.StyleURL)
	}
}

func assertAppSubsystemPackageManagerStatusEntry(t *testing.T, entry PluginStatusEntry, pluginID string) {
	t.Helper()

	if entry.PluginID != pluginID || entry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active app subsystem package-manager plugin, got %#v", entry)
	}
	if len(entry.Components) != 2 || entry.Components[0] != "backend" || entry.Components[1] != "frontend" {
		t.Fatalf("expected backend/frontend app subsystem status components, got %#v", entry.Components)
	}
}
