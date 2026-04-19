package app

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/plugins"
	"setta/internal/pythonenv"
	"setta/internal/settingsstate"
	"setta/internal/testutil/firstpartyplugin"
)

type defaultsProfilePluginHarness struct {
	service       *plugins.Service
	workspaceRoot string
}

func TestBootstrapWorkspaceDefaultsInstallProfileWritesMissingPythonSelection(t *testing.T) {
	runtimeRoot := t.TempDir()
	settingsRuntime := newDefaultsProfileSettingsRuntime(t)
	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installDefaultsProfilePackageManagerPlugin(t, sitePackages)
	pluginService := newDefaultsProfilePluginService(t, []string{sitePackages})

	if err := bootstrapWorkspaceDefaultsInstallProfile(context.Background(), runtimeRoot, settingsRuntime, pluginService); err != nil {
		t.Fatalf("bootstrapWorkspaceDefaultsInstallProfile returned error: %v", err)
	}

	selection, ok, err := settingsstate.LanguageServerSelectionForLanguage(settingsRuntime.Snapshot().Document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage returned error: %v", err)
	}
	if !ok || selection == nil || *selection != "setta-basedpyright" {
		t.Fatalf("expected python defaults selection, got ok=%v selection=%#v", ok, selection)
	}

	statePath := defaultsProfileBootstrapStatePath(runtimeRoot)
	payload, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("read defaults profile state: %v", err)
	}
	var state defaultsProfileBootstrapState
	if err := json.Unmarshal(payload, &state); err != nil {
		t.Fatalf("decode defaults profile state: %v", err)
	}
	if state.ProfileID != plugins.DefaultsInstallProfileID || state.ProfileVersion != plugins.DefaultsInstallProfileVersion {
		t.Fatalf("unexpected defaults profile state %#v", state)
	}
}

func TestBootstrapWorkspaceDefaultsInstallProfilePreservesExplicitNullSelection(t *testing.T) {
	runtimeRoot := t.TempDir()
	settingsRuntime := newDefaultsProfileSettingsRuntime(t)
	if _, err := settingsRuntime.MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		document["languageServer"] = map[string]any{
			"selectedByLanguage": map[string]any{
				"python": nil,
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed settings runtime: %v", err)
	}

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installDefaultsProfilePackageManagerPlugin(t, sitePackages)
	pluginService := newDefaultsProfilePluginService(t, []string{sitePackages})

	if err := bootstrapWorkspaceDefaultsInstallProfile(context.Background(), runtimeRoot, settingsRuntime, pluginService); err != nil {
		t.Fatalf("bootstrapWorkspaceDefaultsInstallProfile returned error: %v", err)
	}

	selection, ok, err := settingsstate.LanguageServerSelectionForLanguage(settingsRuntime.Snapshot().Document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage returned error: %v", err)
	}
	if !ok || selection != nil {
		t.Fatalf("expected explicit null python selection to remain, got ok=%v selection=%#v", ok, selection)
	}
}

func TestBootstrapWorkspaceDefaultsInstallProfileSelectsAvailableLinkedPlugin(t *testing.T) {
	runtimeRoot := t.TempDir()
	settingsRuntime := newDefaultsProfileSettingsRuntime(t)
	pluginService := newDefaultsProfilePluginService(t, nil)

	workspaceScope := plugins.PluginScopeWorkspace
	linkResult, err := pluginService.Link(plugins.LinkOptions{
		LocalPluginRoot: copyDefaultsProfileLinkedPlugin(t),
		Scope:           &workspaceScope,
		Enable:          true,
	})
	if err != nil {
		t.Fatalf("link linked defaults profile plugin: %v", err)
	}
	if !linkResult.RestartRequired {
		t.Fatalf("expected linked defaults profile plugin to require refresh, got %#v", linkResult)
	}
	if _, err := pluginService.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit linked defaults profile plugin refresh: %v", err)
	}

	if err := bootstrapWorkspaceDefaultsInstallProfile(context.Background(), runtimeRoot, settingsRuntime, pluginService); err != nil {
		t.Fatalf("bootstrapWorkspaceDefaultsInstallProfile returned error: %v", err)
	}

	selection, ok, err := settingsstate.LanguageServerSelectionForLanguage(settingsRuntime.Snapshot().Document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage returned error: %v", err)
	}
	if !ok || selection == nil || *selection != "setta-basedpyright" {
		t.Fatalf("expected linked plugin python defaults selection, got ok=%v selection=%#v", ok, selection)
	}
}

func TestBootstrapWorkspaceDefaultsInstallProfileSelectsUsableLowerPrecedenceDuplicateWhenWorkspaceCopyIsInvalid(t *testing.T) {
	runtimeRoot := t.TempDir()
	settingsRuntime := newDefaultsProfileSettingsRuntime(t)

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installDefaultsProfilePackageManagerPlugin(t, sitePackages)
	pluginService := newDefaultsProfilePluginService(t, []string{sitePackages})

	workspaceScope := plugins.PluginScopeWorkspace
	linkResult, err := pluginService.Link(plugins.LinkOptions{
		LocalPluginRoot: copyDefaultsProfileLinkedPlugin(t),
		Scope:           &workspaceScope,
		Enable:          true,
	})
	if err != nil {
		t.Fatalf("link workspace defaults profile plugin: %v", err)
	}
	if !linkResult.RestartRequired {
		t.Fatalf("expected linked defaults profile plugin to require refresh, got %#v", linkResult)
	}
	if err := os.WriteFile(filepath.Join(linkResult.SourcePath, "content", "config", "schema.json"), []byte("{bad-json"), 0o644); err != nil {
		t.Fatalf("write invalid copied workspace schema: %v", err)
	}
	if _, err := pluginService.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit linked defaults profile plugin refresh after invalidating workspace copy: %v", err)
	}

	if err := bootstrapWorkspaceDefaultsInstallProfile(context.Background(), runtimeRoot, settingsRuntime, pluginService); err != nil {
		t.Fatalf("bootstrapWorkspaceDefaultsInstallProfile returned error: %v", err)
	}

	selection, ok, err := settingsstate.LanguageServerSelectionForLanguage(settingsRuntime.Snapshot().Document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage returned error: %v", err)
	}
	if !ok || selection == nil || *selection != "setta-basedpyright" {
		t.Fatalf("expected python defaults selection from usable lower-precedence duplicate, got ok=%v selection=%#v", ok, selection)
	}
}

func TestBootstrapWorkspaceDefaultsInstallProfileSelectsUsableLowerPrecedenceDuplicateWhenWorkspaceCopyDefaultsDisabled(t *testing.T) {
	runtimeRoot := t.TempDir()
	settingsRuntime := newDefaultsProfileSettingsRuntime(t)

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installDefaultsProfilePackageManagerPlugin(t, sitePackages)
	harness := newDefaultsProfilePluginHarness(t, []string{sitePackages})
	workspacePluginRoot := filepath.Join(harness.workspaceRoot, ".setta_plugins", "setta-basedpyright")
	copyAppTestDir(t, filepath.Join(appTestRepoRoot(t), "plugins", "setta-basedpyright"), workspacePluginRoot)
	manifestPath := filepath.Join(workspacePluginRoot, "setta.plugin.json")
	if err := os.WriteFile(
		manifestPath,
		mustRewriteDefaultsProfileManifest(t, manifestPath, func(payload map[string]any) {
			payload["enabledByDefault"] = false
		}),
		0o644,
	); err != nil {
		t.Fatalf("write disabled local workspace manifest: %v", err)
	}
	if err := bootstrapWorkspaceDefaultsInstallProfile(context.Background(), runtimeRoot, settingsRuntime, harness.service); err != nil {
		t.Fatalf("bootstrapWorkspaceDefaultsInstallProfile returned error: %v", err)
	}

	selection, ok, err := settingsstate.LanguageServerSelectionForLanguage(settingsRuntime.Snapshot().Document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage returned error: %v", err)
	}
	if !ok || selection == nil || *selection != "setta-basedpyright" {
		t.Fatalf("expected python defaults selection from active lower-precedence duplicate, got ok=%v selection=%#v", ok, selection)
	}
}

func TestBootstrapWorkspaceDefaultsInstallProfileRunsOnlyOncePerProfileVersion(t *testing.T) {
	runtimeRoot := t.TempDir()
	settingsRuntime := newDefaultsProfileSettingsRuntime(t)

	emptySitePackages := filepath.Join(t.TempDir(), "site-packages")
	firstPluginService := newDefaultsProfilePluginService(t, []string{emptySitePackages})
	if err := bootstrapWorkspaceDefaultsInstallProfile(context.Background(), runtimeRoot, settingsRuntime, firstPluginService); err != nil {
		t.Fatalf("first bootstrapWorkspaceDefaultsInstallProfile returned error: %v", err)
	}

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installDefaultsProfilePackageManagerPlugin(t, sitePackages)
	secondPluginService := newDefaultsProfilePluginService(t, []string{sitePackages})
	if err := bootstrapWorkspaceDefaultsInstallProfile(context.Background(), runtimeRoot, settingsRuntime, secondPluginService); err != nil {
		t.Fatalf("second bootstrapWorkspaceDefaultsInstallProfile returned error: %v", err)
	}

	selection, ok, err := settingsstate.LanguageServerSelectionForLanguage(settingsRuntime.Snapshot().Document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage returned error: %v", err)
	}
	if ok || selection != nil {
		t.Fatalf("expected python selection to stay missing after first-open bootstrap, got ok=%v selection=%#v", ok, selection)
	}
}

func TestBootstrapWorkspaceDefaultsInstallProfileRepairsInvalidMarker(t *testing.T) {
	runtimeRoot := t.TempDir()
	settingsRuntime := newDefaultsProfileSettingsRuntime(t)
	if err := os.MkdirAll(runtimeRoot, 0o755); err != nil {
		t.Fatalf("mkdir runtime root: %v", err)
	}
	if err := os.WriteFile(defaultsProfileBootstrapStatePath(runtimeRoot), []byte("{"), 0o644); err != nil {
		t.Fatalf("write invalid defaults profile marker: %v", err)
	}

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installDefaultsProfilePackageManagerPlugin(t, sitePackages)
	pluginService := newDefaultsProfilePluginService(t, []string{sitePackages})

	if err := bootstrapWorkspaceDefaultsInstallProfile(context.Background(), runtimeRoot, settingsRuntime, pluginService); err != nil {
		t.Fatalf("bootstrapWorkspaceDefaultsInstallProfile returned error: %v", err)
	}

	selection, ok, err := settingsstate.LanguageServerSelectionForLanguage(settingsRuntime.Snapshot().Document, "python")
	if err != nil {
		t.Fatalf("LanguageServerSelectionForLanguage returned error: %v", err)
	}
	if !ok || selection == nil || *selection != "setta-basedpyright" {
		t.Fatalf("expected repaired python defaults selection, got ok=%v selection=%#v", ok, selection)
	}

	payload, err := os.ReadFile(defaultsProfileBootstrapStatePath(runtimeRoot))
	if err != nil {
		t.Fatalf("read repaired defaults profile marker: %v", err)
	}
	var state defaultsProfileBootstrapState
	if err := json.Unmarshal(payload, &state); err != nil {
		t.Fatalf("decode repaired defaults profile marker: %v", err)
	}
	if state.ProfileID != plugins.DefaultsInstallProfileID || state.ProfileVersion != plugins.DefaultsInstallProfileVersion {
		t.Fatalf("unexpected repaired defaults profile marker %#v", state)
	}
}

func newDefaultsProfileSettingsRuntime(t *testing.T) *settingsstate.Runtime {
	t.Helper()

	store, err := settingsstate.NewStore(filepath.Join(t.TempDir(), settingsstate.DefaultFileName), settingsstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new settings store: %v", err)
	}
	runtime, err := settingsstate.OpenRuntime(context.Background(), store)
	if err != nil {
		t.Fatalf("open settings runtime: %v", err)
	}
	return runtime
}

func newDefaultsProfilePluginService(t *testing.T, searchPaths []string) *plugins.Service {
	t.Helper()

	return newDefaultsProfilePluginHarness(t, searchPaths).service
}

func newDefaultsProfilePluginHarness(t *testing.T, searchPaths []string) defaultsProfilePluginHarness {
	t.Helper()

	t.Setenv("SETTA_PYTHON", firstpartyplugin.BasedpyrightPython(t))

	workspaceRoot := filepath.Join(t.TempDir(), "workspace")
	settaHome := filepath.Join(t.TempDir(), ".setta")
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	if err := os.MkdirAll(settaFilesRoot, 0o755); err != nil {
		t.Fatalf("mkdir setta files root: %v", err)
	}

	pythonRuntime, err := pythonenv.NewRuntime(pythonenv.RuntimeOptions{})
	if err != nil {
		t.Fatalf("new python runtime: %v", err)
	}
	discovery, err := plugins.NewDiscoveryService(plugins.DiscoveryServiceOptions{
		WorkspaceRoot:             workspaceRoot,
		SettaFilesRoot:            settaFilesRoot,
		SettaHome:                 settaHome,
		ServerMode:                config.ModeIDE,
		PackageManagerRuntime:     pythonRuntime,
		PackageManagerSearchPaths: searchPaths,
	})
	if err != nil {
		t.Fatalf("new discovery service: %v", err)
	}
	service, err := plugins.NewService(plugins.ServiceOptions{
		WorkspaceRoot:    workspaceRoot,
		SettaFilesRoot:   settaFilesRoot,
		SettaHome:        settaHome,
		ServerMode:       config.ModeIDE,
		DiscoveryService: discovery,
	})
	if err != nil {
		t.Fatalf("new plugin service: %v", err)
	}
	return defaultsProfilePluginHarness{
		service:       service,
		workspaceRoot: workspaceRoot,
	}
}

func copyDefaultsProfileLinkedPlugin(t *testing.T) string {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	localPluginRoot := filepath.Join(t.TempDir(), "setta-basedpyright")
	copyAppTestDir(t, filepath.Join(repoRoot, "plugins", "setta-basedpyright"), localPluginRoot)
	return localPluginRoot
}

func mustRewriteDefaultsProfileManifest(t *testing.T, manifestPath string, mutate func(map[string]any)) []byte {
	t.Helper()

	payload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read defaults profile manifest %s: %v", manifestPath, err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(payload, &manifest); err != nil {
		t.Fatalf("decode defaults profile manifest %s: %v", manifestPath, err)
	}
	mutate(manifest)
	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode defaults profile manifest %s: %v", manifestPath, err)
	}
	return append(encoded, '\n')
}

func installDefaultsProfilePackageManagerPlugin(t *testing.T, sitePackages string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	pluginRoot := filepath.Join(sitePackages, "setta-basedpyright")
	copyAppTestDir(t, filepath.Join(repoRoot, "plugins", "setta-basedpyright"), pluginRoot)
	if err := os.RemoveAll(filepath.Join(pluginRoot, "build")); err != nil {
		t.Fatalf("remove copied plugin build dir: %v", err)
	}

	distInfoRoot := filepath.Join(sitePackages, "setta_basedpyright-0.1.0.dist-info")
	writeDefaultsProfilePackageManagerFile(t, filepath.Join(distInfoRoot, "METADATA"), strings.Join([]string{
		"Metadata-Version: 2.1",
		"Name: setta-basedpyright",
		"Version: 0.1.0",
		"Summary: Setta basedpyright defaults profile plugin",
		"",
	}, "\n"))

	recordLines := make([]string, 0)
	for _, root := range []string{pluginRoot, distInfoRoot} {
		err := filepath.Walk(root, func(path string, info os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if info.IsDir() || filepath.Base(path) == "RECORD" {
				return nil
			}
			relativePath, err := filepath.Rel(sitePackages, path)
			if err != nil {
				return err
			}
			recordLines = append(recordLines, filepath.ToSlash(relativePath)+",,")
			return nil
		})
		if err != nil {
			t.Fatalf("walk package-manager plugin fixture: %v", err)
		}
	}
	recordLines = append(recordLines, filepath.ToSlash(filepath.Join("setta_basedpyright-0.1.0.dist-info", "RECORD"))+",,")
	writeDefaultsProfilePackageManagerFile(t, filepath.Join(distInfoRoot, "RECORD"), strings.Join(append(recordLines, ""), "\n"))
}

func writeDefaultsProfilePackageManagerFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
