package watchcodeuisettings

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/uisettings"
)

const testProviderPluginID = "setta-fixture-watch-code-provider"

func TestBuildScopedUISettingEntriesExposePluginMetadataAndSearch(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openTestRuntime(t, root)
	registry := mustNewWatchCodeRegistry(t, runtime, root)

	entry, ok, err := registry.Get(EnabledSettingID)
	if err != nil {
		t.Fatalf("get watch code enabled: %v", err)
	}
	if !ok {
		t.Fatal("expected watch code enabled setting")
	}
	if entry.Metadata.Source != uisettings.SourcePlugin {
		t.Fatalf("expected plugin source, got %q", entry.Metadata.Source)
	}
	if entry.Metadata.PluginID != testProviderPluginID {
		t.Fatalf("expected provider plugin id %q, got %q", testProviderPluginID, entry.Metadata.PluginID)
	}
	if entry.Metadata.Highlight.AnchorID != EnabledSettingID {
		t.Fatalf("expected stable DOM anchor %q, got %q", EnabledSettingID, entry.Metadata.Highlight.AnchorID)
	}

	pluginResults, err := registry.Search("watch toggle", 3, uisettings.SourceFilterPlugin)
	if err != nil {
		t.Fatalf("search plugin watch settings: %v", err)
	}
	if len(pluginResults) == 0 || pluginResults[0].SettingID != EnabledSettingID {
		t.Fatalf("expected top plugin watch-code result, got %#v", pluginResults)
	}

	coreResults, err := registry.Search("watch toggle", 3, uisettings.SourceFilterCore)
	if err != nil {
		t.Fatalf("search core watch settings: %v", err)
	}
	if len(coreResults) != 0 {
		t.Fatalf("expected watch-code settings to be absent from core search, got %#v", coreResults)
	}
}

func TestBuildScopedUISettingEntriesFilesRoundTrip(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openTestRuntime(t, root)
	registry := mustNewWatchCodeRegistry(t, runtime, root)

	nextFiles := []string{"backend/setta/api/listener.py", "frontend/src/components/App/appTheme.ts"}
	expectedFiles := []any{nextFiles[0], nextFiles[1]}
	result, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		FilesSettingID,
		[]any{nextFiles[0], nextFiles[1]},
		nil,
	)
	if err != nil {
		t.Fatalf("write watch code files: %v", err)
	}
	if !result.Changed {
		t.Fatalf("expected watch code files write to change state, got %#v", result)
	}
	if !reflect.DeepEqual(result.NewValue, expectedFiles) {
		t.Fatalf("expected new watch code files %#v, got %#v", expectedFiles, result.NewValue)
	}
	if !reflect.DeepEqual(result.NormalizedValue, expectedFiles) {
		t.Fatalf("expected normalized watch code files %#v, got %#v", expectedFiles, result.NormalizedValue)
	}

	value, err := registry.ReadValue(context.Background(), "project-alpha", FilesSettingID)
	if err != nil {
		t.Fatalf("read watch code files after write: %v", err)
	}
	if !reflect.DeepEqual(value, expectedFiles) {
		t.Fatalf("expected watch code files %#v after write, got %#v", expectedFiles, value)
	}
}

func TestBuildScopedUISettingEntriesRejectsInvalidFolderShape(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openTestRuntime(t, root)
	registry := mustNewWatchCodeRegistry(t, runtime, root)

	_, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		FoldersSettingID,
		[]any{
			map[string]any{
				"path":      "./backend",
				"recursive": "not-a-boolean",
			},
		},
		nil,
	)
	settingErr, ok := err.(*uisettings.SettingError)
	if !ok {
		t.Fatalf("expected SettingError, got %T (%v)", err, err)
	}
	if settingErr.Code != uisettings.ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
}

func TestBuildScopedUISettingEntriesRejectsUnsupportedFolderProperties(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openTestRuntime(t, root)
	registry := mustNewWatchCodeRegistry(t, runtime, root)

	_, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		FoldersSettingID,
		[]any{
			map[string]any{
				"path":      "./backend",
				"recursive": true,
				"extra":     "not-allowed",
			},
		},
		nil,
	)
	settingErr, ok := err.(*uisettings.SettingError)
	if !ok {
		t.Fatalf("expected SettingError, got %T (%v)", err, err)
	}
	if settingErr.Code != uisettings.ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
	if !strings.Contains(settingErr.Message, "unsupported properties") {
		t.Fatalf("expected unsupported properties message, got %q", settingErr.Message)
	}
}

func TestBuildScopedUISettingEntriesFollowProviderAvailability(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openTestRuntime(t, root)

	entries, err := BuildScopedUISettingEntries(
		plugins.WatchCodeCapabilitiesFromSnapshot(plugins.DiscoverySnapshot{}),
		runtime,
		root,
	)
	if err != nil {
		t.Fatalf("build inactive watch code settings: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no entries without active provider, got %#v", entries)
	}

	unavailable := UnavailableSettingErrors(plugins.WatchCodeCapabilitiesFromSnapshot(plugins.DiscoverySnapshot{}))
	if unavailable[EnabledSettingID].Code != uisettings.ErrorCodePluginUnavailable {
		t.Fatalf("expected unavailable setting error for %s, got %#v", EnabledSettingID, unavailable[EnabledSettingID])
	}
}

func mustNewWatchCodeRegistry(t *testing.T, runtime *projectstate.Runtime, workspaceRoot string) *uisettings.Registry {
	t.Helper()

	entries, err := BuildScopedUISettingEntries(activeCapabilities(), runtime, workspaceRoot)
	if err != nil {
		t.Fatalf("build watch code ui setting entries: %v", err)
	}
	registry, err := uisettings.New(entries)
	if err != nil {
		t.Fatalf("new watch code registry: %v", err)
	}
	return registry
}

func activeCapabilities() plugins.PluginWatchCodeCapabilities {
	return plugins.PluginWatchCodeCapabilities{
		PluginID:               testProviderPluginID,
		PluginEnabled:          true,
		Python:                 true,
		RequiresLanguageServer: true,
	}
}

func openTestRuntime(t *testing.T, root string) *projectstate.Runtime {
	t.Helper()

	store, err := projectstate.NewStore(filepath.Join(root, "project.json"), projectstate.StoreOptions{})
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	document := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime, err := projectstate.OpenRuntimeWithOptions(context.Background(), store, projectstate.RuntimeOptions{})
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	return runtime
}
