package uisettings

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/appspec"
	"setta/internal/projectstate"
)

func TestNewCoreRegistryListsBoundedCoreEntries(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry, err := NewCoreRegistry(runtime, t.TempDir())
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	entries := registry.ListEntries(SourceFilterCore)
	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		ids = append(ids, entry.SettingID)
	}
	expected := []string{
		"core.app.catalog_id",
		"core.app.spec_path",
		"core.app.spec_version",
		"core.app.theme_mode",
		"core.project.name",
		"core.project.show_param_display_names",
		"core.run_instructions.python_codegen_enabled",
		"core.watch_code.enabled",
		"core.watch_code.files",
		"core.watch_code.folders",
	}
	if !reflect.DeepEqual(ids, expected) {
		t.Fatalf("expected core entry ids %#v, got %#v", expected, ids)
	}
}

func TestRegistrySearchRanksCoreSettingBySynonym(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry, err := NewCoreRegistry(runtime, t.TempDir())
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	results, err := registry.Search("watch toggle", 3, SourceFilterCore)
	if err != nil {
		t.Fatalf("search registry: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected search results")
	}
	if results[0].SettingID != "core.watch_code.enabled" {
		t.Fatalf("expected top result core.watch_code.enabled, got %#v", results[0])
	}
}

func TestRegistryReadValueReturnsDefaultedAppMetadataOnFreshProject(t *testing.T) {
	t.Parallel()

	runtime := openCoreRegistryRuntime(t)
	registry, err := NewCoreRegistry(runtime, t.TempDir())
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	catalogID, err := registry.ReadValue(context.Background(), "project-alpha", "core.app.catalog_id")
	if err != nil {
		t.Fatalf("read app catalog id: %v", err)
	}
	specVersion, err := registry.ReadValue(context.Background(), "project-alpha", "core.app.spec_version")
	if err != nil {
		t.Fatalf("read app spec version: %v", err)
	}
	specPath, err := registry.ReadValue(context.Background(), "project-alpha", "core.app.spec_path")
	if err != nil {
		t.Fatalf("read app spec path: %v", err)
	}
	themeMode, err := registry.ReadValue(context.Background(), "project-alpha", "core.app.theme_mode")
	if err != nil {
		t.Fatalf("read app theme mode: %v", err)
	}
	projectName, err := registry.ReadValue(context.Background(), "project-alpha", "core.project.name")
	if err != nil {
		t.Fatalf("read project name: %v", err)
	}
	pythonCodegenEnabled, err := registry.ReadValue(context.Background(), "project-alpha", "core.run_instructions.python_codegen_enabled")
	if err != nil {
		t.Fatalf("read python codegen enabled: %v", err)
	}

	if catalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected default catalog id %q, got %#v", appspec.DefaultCatalogID, catalogID)
	}
	if specVersion != projectstate.DefaultAppSpecVersion() {
		t.Fatalf("expected default app spec version %q, got %#v", projectstate.DefaultAppSpecVersion(), specVersion)
	}
	if specPath != appspec.DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %#v", appspec.DefaultPath(), specPath)
	}
	if themeMode != projectstate.DefaultAppThemeMode() {
		t.Fatalf("expected default app theme mode %q, got %#v", projectstate.DefaultAppThemeMode(), themeMode)
	}
	if projectName != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", projectName)
	}
	if pythonCodegenEnabled != false {
		t.Fatalf("expected python codegen disabled, got %#v", pythonCodegenEnabled)
	}
}

func TestRegistryWriteValueNormalizesSpecPathThroughProjectStateOwner(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	result, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.app.spec_path",
		"  "+filepath.Join(root, "app_specs", "ui-settings.json")+"  ",
		appspec.DefaultPath(),
	)
	if err != nil {
		t.Fatalf("write app spec path: %v", err)
	}
	if result.OldValue != appspec.DefaultPath() {
		t.Fatalf("expected old spec path %q, got %#v", appspec.DefaultPath(), result.OldValue)
	}
	if result.NewValue != "app_specs/ui-settings.json" {
		t.Fatalf("expected normalized spec path app_specs/ui-settings.json, got %#v", result.NewValue)
	}
	if result.NormalizedValue != "app_specs/ui-settings.json" {
		t.Fatalf("expected normalized value app_specs/ui-settings.json, got %#v", result.NormalizedValue)
	}
}

func TestRegistryWriteValueRejectsInvalidWatchCodeFolderShape(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	_, err = registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.watch_code.folders",
		[]any{
			map[string]any{
				"path":      "./backend",
				"recursive": "not-a-boolean",
			},
		},
		nil,
	)
	settingErr, ok := err.(*SettingError)
	if !ok {
		t.Fatalf("expected SettingError, got %T (%v)", err, err)
	}
	if settingErr.Code != ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
}

func TestRegistryWriteValueRejectsUnsupportedWatchCodeFolderProperties(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	_, err = registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.watch_code.folders",
		[]any{
			map[string]any{
				"path":      "./backend",
				"recursive": true,
				"extra":     "not-allowed",
			},
		},
		nil,
	)
	settingErr, ok := err.(*SettingError)
	if !ok {
		t.Fatalf("expected SettingError, got %T (%v)", err, err)
	}
	if settingErr.Code != ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
	if !strings.Contains(settingErr.Message, "unsupported properties") {
		t.Fatalf("expected unsupported properties message, got %q", settingErr.Message)
	}
}

func TestRegistryWriteValueMapsStaleCompareAndSetToMutationFailed(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	_, _, err = runtime.CompareAndSetShowParamDisplayNames(context.Background(), "project-alpha", true, nil)
	if err != nil {
		t.Fatalf("seed show param display names: %v", err)
	}

	_, err = registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.project.show_param_display_names",
		false,
		false,
	)
	settingErr, ok := err.(*SettingError)
	if !ok {
		t.Fatalf("expected SettingError, got %T (%v)", err, err)
	}
	if settingErr.Code != ErrorCodeMutationFailed {
		t.Fatalf("expected mutation_failed, got %q", settingErr.Code)
	}
}

func TestRegistryWriteValueRoundTripsProjectNameAndPythonCodegenEnabled(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	runtime := openCoreRegistryPersistedRuntime(t, root)
	registry, err := NewCoreRegistry(runtime, root)
	if err != nil {
		t.Fatalf("new core registry: %v", err)
	}

	projectNameResult, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.project.name",
		"  Renamed Project  ",
		"Alpha",
	)
	if err != nil {
		t.Fatalf("write project name: %v", err)
	}
	if projectNameResult.OldValue != "Alpha" {
		t.Fatalf("expected old project name Alpha, got %#v", projectNameResult.OldValue)
	}
	if projectNameResult.NewValue != "Renamed Project" {
		t.Fatalf("expected new project name Renamed Project, got %#v", projectNameResult.NewValue)
	}
	if projectNameResult.NormalizedValue != "Renamed Project" {
		t.Fatalf("expected normalized project name Renamed Project, got %#v", projectNameResult.NormalizedValue)
	}

	pythonCodegenResult, err := registry.WriteValue(
		context.Background(),
		"project-alpha",
		"core.run_instructions.python_codegen_enabled",
		true,
		false,
	)
	if err != nil {
		t.Fatalf("write python codegen enabled: %v", err)
	}
	if pythonCodegenResult.OldValue != false {
		t.Fatalf("expected old python codegen state false, got %#v", pythonCodegenResult.OldValue)
	}
	if pythonCodegenResult.NewValue != true {
		t.Fatalf("expected new python codegen state true, got %#v", pythonCodegenResult.NewValue)
	}
	if pythonCodegenResult.NormalizedValue != true {
		t.Fatalf("expected normalized python codegen state true, got %#v", pythonCodegenResult.NormalizedValue)
	}

	project, err := runtime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after writes: %v", err)
	}
	if project.Name != "Renamed Project" {
		t.Fatalf("expected persisted project name Renamed Project, got %#v", project.Name)
	}
	if !project.HasPythonCodegenTarget() {
		t.Fatal("expected python codegen target to be enabled after write")
	}
}

func openCoreRegistryRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()
	return openCoreRegistryPersistedRuntime(t, t.TempDir())
}

func openCoreRegistryPersistedRuntime(t *testing.T, root string) *projectstate.Runtime {
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
	runtime, err := projectstate.OpenRuntime(context.Background(), store)
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
