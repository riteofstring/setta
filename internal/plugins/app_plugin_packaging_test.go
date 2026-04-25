package plugins

import (
	"archive/zip"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/testutil/firstpartyplugin"
)

func TestServiceRuntimeActivatesLinkedFirstPartyAppSubsystemPluginWithRuntimeManagedComponents(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	sourceRoot := stageFirstPartyAppSubsystemPluginSource(t)
	buildCalls := stubPluginFrontendBuildRunner(t, func(root string, packageManager string, args []string) error {
		if packageManager != pluginFrontendBuildPackageManagerPNPM {
			t.Fatalf("expected pnpm package manager, got %q", packageManager)
		}
		if reflect.DeepEqual(args, []string{"run", "build"}) {
			writeRuntimeManagedFrontendBuildOutputs(t, root)
		}
		return nil
	})

	scope := PluginScopeWorkspace
	linkResult, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Scope:           &scope,
		Enable:          true,
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
	assertRuntimeManagedFrontendBuildCalls(t, buildCalls)

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
	if listEntry.PluginID != firstpartyplugin.AppSubsystemPluginID || listEntry.SourceScope != PluginScopeWorkspace {
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
	if statusEntry.PluginID != firstpartyplugin.AppSubsystemPluginID || statusEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active linked app subsystem plugin status entry, got %#v", statusEntry)
	}
	if len(statusEntry.Components) != 2 || statusEntry.Components[0] != "backend" || statusEntry.Components[1] != "frontend" {
		t.Fatalf("expected backend/frontend linked app subsystem status components, got %#v", statusEntry.Components)
	}
	if runtimeResponse.FeatureCapabilities == nil || runtimeResponse.FeatureCapabilities.AppSubsystem.PluginID != firstpartyplugin.AppSubsystemPluginID {
		t.Fatalf("expected linked app subsystem provider capabilities, got %#v", runtimeResponse.FeatureCapabilities)
	}
}

func TestAppSubsystemOnlyProviderManifestsDoNotRequestGenericListenerEndpoint(
	t *testing.T,
) {
	roots := map[string]string{
		"first-party": stageFirstPartyAppSubsystemPluginSource(t),
		"unknown-id": filepath.Join(
			workerRPCTestRepoRoot(t),
			"tests",
			"fixtures",
			"plugins",
			"app-subsystem-unknown-id",
		),
	}
	for name, root := range roots {
		t.Run(name, func(t *testing.T) {
			manifest, err := loadPluginManifestFile(filepath.Join(root, pluginManifestFileName))
			if err != nil {
				t.Fatalf("load plugin manifest: %v", err)
			}
			if !containsString(manifest.Capabilities, "registerAppSubsystemBackend") {
				t.Fatalf("expected app-subsystem backend capability, got %#v", manifest.Capabilities)
			}
			if containsString(manifest.Capabilities, "registerListenerEndpoint") {
				t.Fatalf("app-subsystem-only provider must not request generic listener endpoints: %#v", manifest.Capabilities)
			}
		})
	}
}

func TestBuildFirstPartyAppSubsystemWheelIncludesRuntimeManagedAssets(t *testing.T) {
	stagingRoot := stageFirstPartyAppSubsystemPluginSource(t)
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

func TestEnsureRuntimeManagedPluginFrontendAssetsBuildsGenericSourcePlugin(
	t *testing.T,
) {
	sourceRoot := stageFirstPartyAppSubsystemPluginSource(t)
	rewritePluginManifest(t, sourceRoot, func(payload map[string]any) {
		payload["id"] = "acme-generic-runtime-managed-fixture"
		payload["name"] = "Acme Generic Runtime Managed Fixture"
	})

	manifest, err := loadPluginManifestFile(filepath.Join(sourceRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load genericized plugin manifest: %v", err)
	}
	buildCalls := stubPluginFrontendBuildRunner(t, func(frontendRoot string, packageManager string, args []string) error {
		if packageManager != pluginFrontendBuildPackageManagerPNPM {
			t.Fatalf("expected pnpm package manager, got %q", packageManager)
		}
		if reflect.DeepEqual(args, []string{"run", "build"}) {
			writeRuntimeManagedFrontendBuildOutputs(t, frontendRoot)
		}
		return nil
	})

	if err := ensureRuntimeManagedPluginFrontendAssets(sourceRoot, manifest, runtimeManagedFrontendSourceBuild); err != nil {
		t.Fatalf("build runtime-managed frontend assets for generic source plugin: %v", err)
	}

	assertRuntimeManagedFrontendBuildCalls(t, buildCalls)
}

func TestEnsureRuntimeManagedPluginFrontendAssetsRejectsMissingPackageJSON(
	t *testing.T,
) {
	sourceRoot := stageFirstPartyAppSubsystemPluginSource(t)
	manifest, err := loadPluginManifestFile(filepath.Join(sourceRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load staged plugin manifest: %v", err)
	}
	removeRuntimeManagedFrontendPackageJSON(t, sourceRoot)

	err = ensureRuntimeManagedPluginFrontendAssets(sourceRoot, manifest, runtimeManagedFrontendSourceBuild)
	assertMissingRuntimeManagedFrontendPackageJSONError(t, err)
}

func TestEnsureRuntimeManagedPluginFrontendAssetsInstallsDependenciesWhenNodeModulesExists(
	t *testing.T,
) {
	sourceRoot := stageFirstPartyAppSubsystemPluginSource(t)
	manifest, err := loadPluginManifestFile(filepath.Join(sourceRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load staged plugin manifest: %v", err)
	}
	nodeModulesRoot := filepath.Join(sourceRoot, "frontend", "node_modules")
	if err := os.MkdirAll(nodeModulesRoot, 0o755); err != nil {
		t.Fatalf("mkdir staged node_modules: %v", err)
	}
	if err := os.WriteFile(filepath.Join(nodeModulesRoot, "marker.txt"), []byte("stale\n"), 0o644); err != nil {
		t.Fatalf("write staged node_modules marker: %v", err)
	}
	buildCalls := stubPluginFrontendBuildRunner(t, func(frontendRoot string, packageManager string, args []string) error {
		if packageManager != pluginFrontendBuildPackageManagerPNPM {
			t.Fatalf("expected pnpm package manager, got %q", packageManager)
		}
		if reflect.DeepEqual(args, []string{"run", "build"}) {
			writeRuntimeManagedFrontendBuildOutputs(t, frontendRoot)
		}
		return nil
	})

	if err := ensureRuntimeManagedPluginFrontendAssets(sourceRoot, manifest, runtimeManagedFrontendSourceBuild); err != nil {
		t.Fatalf("build runtime-managed frontend assets with preexisting node_modules: %v", err)
	}

	assertRuntimeManagedFrontendBuildCalls(t, buildCalls)
}

func TestPackagePluginSourceForDeploymentBuildsRuntimeManagedFrontendAssets(
	t *testing.T,
) {
	sourceRoot := stageFirstPartyAppSubsystemPluginSource(t)
	manifest, err := loadPluginManifestFile(filepath.Join(sourceRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load staged plugin manifest: %v", err)
	}
	targetRoot := filepath.Join(t.TempDir(), "packaged-provider")
	buildCalls := stubPluginFrontendBuildRunner(t, func(frontendRoot string, packageManager string, args []string) error {
		if packageManager != pluginFrontendBuildPackageManagerPNPM {
			t.Fatalf("expected pnpm package manager, got %q", packageManager)
		}
		if reflect.DeepEqual(args, []string{"run", "build"}) {
			writeRuntimeManagedFrontendBuildOutputs(t, frontendRoot)
		}
		return nil
	})

	if err := packagePluginSourceForDeployment(
		DiscoveredPlugin{
			PluginID:   manifest.ID,
			SourcePath: sourceRoot,
			Scope:      PluginScopeWorkspace,
			Manifest:   &manifest,
		},
		targetRoot,
	); err != nil {
		t.Fatalf("package plugin source for deployment: %v", err)
	}

	assertRuntimeManagedFrontendBuildCalls(t, buildCalls)
	for _, relativePath := range []string{
		filepath.Join("frontend", "dist", "index.js"),
		filepath.Join("frontend", "dist", "index.css"),
	} {
		if _, err := os.Stat(filepath.Join(targetRoot, relativePath)); err != nil {
			t.Fatalf("expected packaged runtime-managed asset %s: %v", relativePath, err)
		}
	}
}

func TestPackagePluginSourceForDeploymentRejectsMissingPackageJSON(t *testing.T) {
	sourceRoot := stageFirstPartyAppSubsystemPluginSource(t)
	manifest, err := loadPluginManifestFile(filepath.Join(sourceRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load staged plugin manifest: %v", err)
	}
	removeRuntimeManagedFrontendPackageJSON(t, sourceRoot)

	targetRoot := filepath.Join(t.TempDir(), "packaged-provider")
	err = packagePluginSourceForDeployment(
		DiscoveredPlugin{
			PluginID:   manifest.ID,
			SourcePath: sourceRoot,
			Scope:      PluginScopeWorkspace,
			Manifest:   &manifest,
		},
		targetRoot,
	)
	assertMissingRuntimeManagedFrontendPackageJSONError(t, err)
}

func TestPackagePluginSourceForDeploymentRebuildsRuntimeManagedFrontendAssetsWhenDistExists(
	t *testing.T,
) {
	sourceRoot := stageFirstPartyAppSubsystemPluginSource(t)
	distRoot := filepath.Join(sourceRoot, "frontend", "dist")
	if err := os.MkdirAll(distRoot, 0o755); err != nil {
		t.Fatalf("mkdir staged frontend dist: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distRoot, "index.js"), []byte("STALE_JS\n"), 0o644); err != nil {
		t.Fatalf("write staged stale frontend entrypoint: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distRoot, "index.css"), []byte("STALE_CSS\n"), 0o644); err != nil {
		t.Fatalf("write staged stale frontend style: %v", err)
	}

	manifest, err := loadPluginManifestFile(filepath.Join(sourceRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load staged plugin manifest: %v", err)
	}
	targetRoot := filepath.Join(t.TempDir(), "packaged-provider")
	buildCalls := stubPluginFrontendBuildRunner(t, func(frontendRoot string, packageManager string, args []string) error {
		if packageManager != pluginFrontendBuildPackageManagerPNPM {
			t.Fatalf("expected pnpm package manager, got %q", packageManager)
		}
		if reflect.DeepEqual(args, []string{"run", "build"}) {
			writeRuntimeManagedFrontendBuildOutputs(t, frontendRoot)
		}
		return nil
	})

	if err := packagePluginSourceForDeployment(
		DiscoveredPlugin{
			PluginID:   manifest.ID,
			SourcePath: sourceRoot,
			Scope:      PluginScopeWorkspace,
			Manifest:   &manifest,
		},
		targetRoot,
	); err != nil {
		t.Fatalf("package plugin source for deployment: %v", err)
	}

	assertRuntimeManagedFrontendBuildCalls(t, buildCalls)

	entrypointBytes, err := os.ReadFile(filepath.Join(targetRoot, "frontend", "dist", "index.js"))
	if err != nil {
		t.Fatalf("read rebuilt frontend entrypoint: %v", err)
	}
	if strings.Contains(string(entrypointBytes), "STALE_JS") {
		t.Fatalf("expected rebuilt frontend entrypoint, got stale content %q", string(entrypointBytes))
	}

	styleBytes, err := os.ReadFile(filepath.Join(targetRoot, "frontend", "dist", "index.css"))
	if err != nil {
		t.Fatalf("read rebuilt frontend style: %v", err)
	}
	if strings.Contains(string(styleBytes), "STALE_CSS") {
		t.Fatalf("expected rebuilt frontend style, got stale content %q", string(styleBytes))
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

func stageFirstPartyAppSubsystemPluginSource(t *testing.T) string {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	stagingRoot := filepath.Join(t.TempDir(), firstpartyplugin.AppSubsystemPluginID)
	copyBackendCodegenFixtureDir(
		t,
		filepath.Join(repoRoot, "plugins", firstpartyplugin.AppSubsystemPluginID),
		stagingRoot,
	)
	if err := os.RemoveAll(filepath.Join(stagingRoot, "frontend", "dist")); err != nil {
		t.Fatalf("remove staged frontend dist: %v", err)
	}
	return stagingRoot
}

func stubPluginFrontendBuildRunner(
	t *testing.T,
	runner func(frontendRoot string, packageManager string, args []string) error,
) *[][]string {
	t.Helper()

	calls := [][]string{}
	previous := pluginFrontendBuildRunner
	pluginFrontendBuildRunner = func(frontendRoot string, packageManager string, args []string) error {
		calls = append(calls, append([]string(nil), args...))
		if runner == nil {
			return nil
		}
		return runner(frontendRoot, packageManager, args)
	}
	t.Cleanup(func() {
		pluginFrontendBuildRunner = previous
	})
	return &calls
}

func assertRuntimeManagedFrontendBuildCalls(t *testing.T, calls *[][]string) {
	t.Helper()

	if !reflect.DeepEqual(*calls, [][]string{
		{"install", "--lockfile=false"},
		{"run", "build"},
	}) {
		t.Fatalf("expected plugin-owned frontend build calls, got %#v", *calls)
	}
}

func writeRuntimeManagedFrontendBuildOutputs(t *testing.T, frontendRoot string) {
	t.Helper()

	distRoot := filepath.Join(frontendRoot, "dist")
	if err := os.MkdirAll(distRoot, 0o755); err != nil {
		t.Fatalf("mkdir built frontend dist: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distRoot, "index.js"), []byte("export default {};\n"), 0o644); err != nil {
		t.Fatalf("write built frontend entrypoint: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distRoot, "index.css"), []byte("body {}\n"), 0o644); err != nil {
		t.Fatalf("write built frontend style: %v", err)
	}
}

func removeRuntimeManagedFrontendPackageJSON(t *testing.T, pluginRoot string) {
	t.Helper()

	frontendRoot := filepath.Join(pluginRoot, "frontend")
	writeRuntimeManagedFrontendBuildOutputs(t, frontendRoot)
	if err := os.Remove(filepath.Join(frontendRoot, "package.json")); err != nil {
		t.Fatalf("remove plugin frontend package.json: %v", err)
	}
}

func assertMissingRuntimeManagedFrontendPackageJSONError(t *testing.T, err error) {
	t.Helper()

	assertPluginServiceErrorCode(t, err, ServiceErrorCodeSourceInvalid)
	if !strings.Contains(err.Error(), filepath.Join("frontend", "package.json")) {
		t.Fatalf("expected missing frontend/package.json error, got %v", err)
	}
}
