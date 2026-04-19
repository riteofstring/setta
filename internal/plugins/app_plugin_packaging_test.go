package plugins

import (
	"archive/zip"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
)

func TestServiceRuntimeActivatesLinkedFirstPartyAppSubsystemPluginWithRuntimeManagedComponents(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	registerRuntimeAppSubsystemProvider(t, AppSubsystemPluginID)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	scope := PluginScopeWorkspace
	linkResult, err := service.Link(LinkOptions{
		LocalPluginRoot: filepath.Join(
			workerRPCTestRepoRoot(t),
			"plugins",
			AppSubsystemPluginID,
		),
		Scope:  &scope,
		Enable: true,
	})
	if err != nil {
		t.Fatalf("link first-party app subsystem plugin: %v", err)
	}
	if !linkResult.RestartRequired {
		t.Fatalf("expected linked app subsystem plugin to require refresh, got %#v", linkResult)
	}
	if len(linkResult.Components) != 2 || linkResult.Components[0] != "backend" || linkResult.Components[1] != "frontend" {
		t.Fatalf("expected backend/frontend link result components, got %#v", linkResult.Components)
	}

	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh after link: %v", err)
	}

	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime after link: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 || len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one linked app subsystem plugin, got list=%#v status=%#v", runtimeResponse.List.Plugins, runtimeResponse.Status.Plugins)
	}

	listEntry := runtimeResponse.List.Plugins[0]
	if listEntry.PluginID != AppSubsystemPluginID || listEntry.SourceScope != PluginScopeWorkspace {
		t.Fatalf("expected linked workspace app subsystem plugin list entry, got %#v", listEntry)
	}
	if len(listEntry.Components) != 2 || listEntry.Components[0] != "backend" || listEntry.Components[1] != "frontend" {
		t.Fatalf("expected backend/frontend linked app subsystem components, got %#v", listEntry.Components)
	}
	if listEntry.Frontend.EntrypointURL == nil || !strings.Contains(*listEntry.Frontend.EntrypointURL, "/plugins/setta-json-render-app-gen/frontend/dist/index.js?v=") {
		t.Fatalf("expected linked app subsystem frontend entrypoint URL, got %#v", listEntry.Frontend.EntrypointURL)
	}
	if listEntry.Frontend.StyleURL == nil || !strings.Contains(*listEntry.Frontend.StyleURL, "/plugins/setta-json-render-app-gen/frontend/dist/index.css?v=") {
		t.Fatalf("expected linked app subsystem frontend style URL, got %#v", listEntry.Frontend.StyleURL)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.PluginID != AppSubsystemPluginID || statusEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active linked app subsystem plugin status entry, got %#v", statusEntry)
	}
	if len(statusEntry.Components) != 2 || statusEntry.Components[0] != "backend" || statusEntry.Components[1] != "frontend" {
		t.Fatalf("expected backend/frontend linked app subsystem status components, got %#v", statusEntry.Components)
	}
	if runtimeResponse.FeatureCapabilities == nil || runtimeResponse.FeatureCapabilities.AppSubsystem.PluginID != AppSubsystemPluginID {
		t.Fatalf("expected linked app subsystem provider capabilities, got %#v", runtimeResponse.FeatureCapabilities)
	}
}

func TestBuildFirstPartyAppSubsystemWheelIncludesRuntimeManagedAssets(t *testing.T) {
	repoRoot := workerRPCTestRepoRoot(t)
	stagingRoot := filepath.Join(t.TempDir(), AppSubsystemPluginID)
	copyBackendCodegenFixtureDir(
		t,
		filepath.Join(repoRoot, "plugins", AppSubsystemPluginID),
		stagingRoot,
	)

	wheelPath := buildLocalBuiltPyPIWheelFromRoot(t, t.TempDir(), stagingRoot)
	archive, err := zip.OpenReader(wheelPath)
	if err != nil {
		t.Fatalf("open built wheel: %v", err)
	}
	defer archive.Close()

	for _, suffix := range []string{
		"setta-json-render-app-gen/README.md",
		"setta-json-render-app-gen/setta.plugin.json",
		"setta-json-render-app-gen/runtime_backend/main.py",
		"setta-json-render-app-gen/frontend/dist/index.css",
		"setta-json-render-app-gen/frontend/dist/index.js",
	} {
		if !wheelArchiveContainsPathSuffix(archive.File, suffix) {
			t.Fatalf("expected built wheel to contain %s", suffix)
		}
	}
}

func wheelArchiveContainsPathSuffix(files []*zip.File, suffix string) bool {
	for _, file := range files {
		if strings.HasSuffix(file.Name, suffix) {
			return true
		}
	}
	return false
}
