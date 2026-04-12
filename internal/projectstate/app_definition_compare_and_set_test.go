package projectstate

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/appspec"
)

func TestRuntimeCompareAndSetAppDefinitionMetadataNoopsAreSideEffectFreeOnFreshProject(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store := newTestStore(t, filepath.Join(root, "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	initialSnapshot := runtime.Snapshot()

	defaultCatalogID := appspec.DefaultCatalogID
	defaultSpecVersion := defaultAppSpecVersion
	defaultSpecPath := appspec.DefaultPath()
	defaultThemeMode := defaultAppThemeMode

	catalogSnapshot, catalogResult, err := runtime.CompareAndSetAppDefinitionCatalogID(
		context.Background(),
		defaultCatalogID,
		&defaultCatalogID,
	)
	if err != nil {
		t.Fatalf("compare-and-set app catalog id: %v", err)
	}
	specVersionSnapshot, specVersionResult, err := runtime.CompareAndSetAppDefinitionSpecVersion(
		context.Background(),
		defaultSpecVersion,
		&defaultSpecVersion,
	)
	if err != nil {
		t.Fatalf("compare-and-set app spec version: %v", err)
	}
	specPathSnapshot, specPathResult, err := runtime.CompareAndSetAppDefinitionSpecPath(
		context.Background(),
		defaultSpecPath,
		&defaultSpecPath,
	)
	if err != nil {
		t.Fatalf("compare-and-set app spec path: %v", err)
	}
	themeModeSnapshot, themeModeResult, err := runtime.CompareAndSetAppDefinitionThemeMode(
		context.Background(),
		defaultThemeMode,
		&defaultThemeMode,
	)
	if err != nil {
		t.Fatalf("compare-and-set app theme mode: %v", err)
	}

	// Same-value writes on a fresh project must not create metadata or app-spec files.
	for _, snapshot := range []Snapshot{catalogSnapshot, specVersionSnapshot, specPathSnapshot, themeModeSnapshot} {
		if snapshot.Revision != initialSnapshot.Revision {
			t.Fatalf("expected no-op revision %d, got %d", initialSnapshot.Revision, snapshot.Revision)
		}
	}
	for _, result := range []CompareAndSetResult[string]{catalogResult, specVersionResult, specPathResult, themeModeResult} {
		if result.OldValue != result.NewValue {
			t.Fatalf("expected no-op old/new match, got %#v", result)
		}
	}

	if runtime.Snapshot().Document.AppDefinition != nil {
		t.Fatalf("expected app definition to remain nil, got %#v", runtime.Snapshot().Document.AppDefinition)
	}
	if _, err := os.Stat(filepath.Join(root, defaultSpecPath)); !os.IsNotExist(err) {
		t.Fatalf("expected default app spec path to remain absent, got err=%v", err)
	}
}

func TestRuntimeCompareAndSetAppDefinitionSpecVersionMaterializesMinimalSpec(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store := newTestStore(t, filepath.Join(root, "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	initialSnapshot := runtime.Snapshot()
	expectedOldValue := defaultAppSpecVersion

	snapshot, result, err := runtime.CompareAndSetAppDefinitionSpecVersion(
		context.Background(),
		"v2",
		&expectedOldValue,
	)
	if err != nil {
		t.Fatalf("compare-and-set app spec version: %v", err)
	}
	if snapshot.Revision != initialSnapshot.Revision+1 {
		t.Fatalf("expected revision %d after app spec version write, got %d", initialSnapshot.Revision+1, snapshot.Revision)
	}
	if result.OldValue != defaultAppSpecVersion || result.NewValue != "v2" {
		t.Fatalf("unexpected app spec version result %#v", result)
	}

	// Fresh-project metadata writes should materialize the default minimal app spec.
	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	storedRoot, ok := storedSpec.(map[string]any)
	if !ok {
		t.Fatalf("expected stored minimal app spec object, got %#v", storedSpec)
	}
	if storedRoot["type"] != "Stack" {
		t.Fatalf("expected stored minimal app spec type Stack, got %#v", storedRoot["type"])
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load saved document: %v", err)
	}
	if loaded.AppDefinition == nil {
		t.Fatal("expected saved app definition metadata")
	}
	if loaded.AppDefinition.AppSpecPath != appspec.DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %q", appspec.DefaultPath(), loaded.AppDefinition.AppSpecPath)
	}
	if loaded.AppDefinition.CatalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected saved catalog id %q, got %q", appspec.DefaultCatalogID, loaded.AppDefinition.CatalogID)
	}
	if loaded.AppDefinition.AppSpecVersion != "v2" {
		t.Fatalf("expected saved app spec version v2, got %q", loaded.AppDefinition.AppSpecVersion)
	}
}

func TestRuntimeCompareAndSetAppDefinitionCatalogIDRejectsUnknownCatalog(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store := newTestStore(t, filepath.Join(root, "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	expectedOldValue := appspec.DefaultCatalogID

	_, _, err := runtime.CompareAndSetAppDefinitionCatalogID(
		context.Background(),
		"setta.app.alt",
		&expectedOldValue,
	)
	if err == nil || !strings.Contains(err.Error(), "unknown catalog id") {
		t.Fatalf("expected unknown app catalog id error, got %v", err)
	}
	if runtime.Snapshot().Document.AppDefinition != nil {
		t.Fatalf("expected app definition to remain nil after rejected catalog write, got %#v", runtime.Snapshot().Document.AppDefinition)
	}
}

func TestRuntimeCompareAndSetAppDefinitionSpecPathNormalizesAndPersistsMinimalSpec(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store := newTestStore(t, filepath.Join(root, "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	targetPath := filepath.Join(root, "app_specs", "custom.json")
	expectedOldValue := appspec.DefaultPath()

	_, result, err := runtime.CompareAndSetAppDefinitionSpecPath(
		context.Background(),
		targetPath,
		&expectedOldValue,
	)
	if err != nil {
		t.Fatalf("compare-and-set app spec path: %v", err)
	}
	if result.OldValue != appspec.DefaultPath() {
		t.Fatalf("expected old app spec path %q, got %q", appspec.DefaultPath(), result.OldValue)
	}
	if result.NewValue != "app_specs/custom.json" {
		t.Fatalf("expected normalized app spec path app_specs/custom.json, got %q", result.NewValue)
	}

	if _, err := os.Stat(filepath.Join(root, "app_specs", "custom.json")); err != nil {
		t.Fatalf("expected normalized app spec file to exist: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, appspec.DefaultPath())); !os.IsNotExist(err) {
		t.Fatalf("expected default app spec path to remain absent, got err=%v", err)
	}
}

func TestRuntimeCompareAndSetAppDefinitionThemeModePreservesThemePayload(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store := newTestStore(t, filepath.Join(root, "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	theme := map[string]any{
		"className": "app-shell",
		"mode":      "light",
	}
	if _, _, err := runtime.SetAppDefinition(context.Background(), SetAppDefinitionInput{
		AppSpec: appSpec,
		Theme:   &theme,
	}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}

	expectedOldValue := "light"
	_, result, err := runtime.CompareAndSetAppDefinitionThemeMode(
		context.Background(),
		"dark",
		&expectedOldValue,
	)
	if err != nil {
		t.Fatalf("compare-and-set app theme mode: %v", err)
	}
	if result.OldValue != "light" || result.NewValue != "dark" {
		t.Fatalf("unexpected theme mode result %#v", result)
	}

	themePayload, err := decodeAppDefinitionJSONObject(runtime.Snapshot().Document.AppDefinition.Theme, "appDefinition.theme")
	if err != nil {
		t.Fatalf("decode saved theme payload: %v", err)
	}
	if themePayload["className"] != "app-shell" {
		t.Fatalf("expected preserved theme className, got %#v", themePayload["className"])
	}
	if themePayload["mode"] != "dark" {
		t.Fatalf("expected updated theme mode dark, got %#v", themePayload["mode"])
	}
}

func TestRuntimeCompareAndSetAppDefinitionMetadataRejectsStaleExpectedOldValue(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store := newTestStore(t, filepath.Join(root, "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	initialSnapshot := runtime.Snapshot()
	staleExpectedOldValue := "v0"

	snapshot, _, err := runtime.CompareAndSetAppDefinitionSpecVersion(
		context.Background(),
		"v2",
		&staleExpectedOldValue,
	)
	if !IsExpectedOldValueMismatchError(err) {
		t.Fatalf("expected stale expected-old-value error, got %v", err)
	}
	if !strings.Contains(err.Error(), "core.app.spec_version changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %q", err.Error())
	}
	if snapshot.Revision != initialSnapshot.Revision {
		t.Fatalf("expected revision %d after stale compare-and-set, got %d", initialSnapshot.Revision, snapshot.Revision)
	}
	if runtime.Snapshot().Document.AppDefinition != nil {
		t.Fatalf("expected app definition to remain nil after stale compare-and-set, got %#v", runtime.Snapshot().Document.AppDefinition)
	}
}
