package app

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/config"
	"setta/internal/plugins"
	"setta/internal/pythonenv"
	"setta/internal/settingsstate"
	"setta/internal/testutil/firstpartyplugin"
)

func TestBootstrapWorkspaceDefaultsInstallProfileWritesMissingPythonSelection(t *testing.T) {
	runtimeRoot := t.TempDir()
	settingsRuntime := newDefaultsProfileSettingsRuntime(t)
	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	firstpartyplugin.InstallBasedpyrightPluginWheel(t, sitePackages)
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
	firstpartyplugin.InstallBasedpyrightPluginWheel(t, sitePackages)
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

func TestBootstrapWorkspaceDefaultsInstallProfileRunsOnlyOncePerProfileVersion(t *testing.T) {
	runtimeRoot := t.TempDir()
	settingsRuntime := newDefaultsProfileSettingsRuntime(t)

	emptySitePackages := filepath.Join(t.TempDir(), "site-packages")
	firstPluginService := newDefaultsProfilePluginService(t, []string{emptySitePackages})
	if err := bootstrapWorkspaceDefaultsInstallProfile(context.Background(), runtimeRoot, settingsRuntime, firstPluginService); err != nil {
		t.Fatalf("first bootstrapWorkspaceDefaultsInstallProfile returned error: %v", err)
	}

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	firstpartyplugin.InstallBasedpyrightPluginWheel(t, sitePackages)
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

func TestBootstrapWorkspaceDefaultsInstallProfileUsesPackagedBasedpyrightWhenLinkedCopyShadowsIt(t *testing.T) {
	runtimeRoot := t.TempDir()
	settingsRuntime := newDefaultsProfileSettingsRuntime(t)
	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	firstpartyplugin.InstallBasedpyrightPluginWheel(t, sitePackages)
	pluginService, workspaceRoot := newDefaultsProfilePluginServiceWithWorkspace(t, []string{sitePackages})

	repoRoot := appTestRepoRoot(t)
	copyAppTestDir(
		t,
		filepath.Join(repoRoot, "plugins", "setta-basedpyright"),
		filepath.Join(workspaceRoot, ".setta_plugins", "setta-basedpyright"),
	)

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

	service, _ := newDefaultsProfilePluginServiceWithWorkspace(t, searchPaths)
	return service
}

func newDefaultsProfilePluginServiceWithWorkspace(t *testing.T, searchPaths []string) (*plugins.Service, string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	t.Setenv("SETTA_PYTHON", appTestWorkerPython(t, repoRoot))

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
	return service, workspaceRoot
}
