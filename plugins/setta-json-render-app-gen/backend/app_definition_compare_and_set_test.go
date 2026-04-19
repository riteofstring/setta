package settajsonrenderappgenbackend

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func TestAppDefinitionServiceCompareAndSetMetadataNoopsAreSideEffectFreeOnFreshProject(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)
	initialSnapshot := runtime.Snapshot()

	defaultCatalogID := appspec.DefaultCatalogID
	defaultSpecVersion := "v1"
	defaultSpecPath := appspec.DefaultPath()
	defaultThemeMode, err := service.GetEffectiveAppThemeMode(context.Background())
	if err != nil {
		t.Fatalf("get effective app theme mode: %v", err)
	}

	catalogSnapshot, catalogResult, err := service.CompareAndSetAppDefinitionCatalogID(
		context.Background(),
		defaultCatalogID,
		&defaultCatalogID,
	)
	if err != nil {
		t.Fatalf("compare-and-set app catalog id: %v", err)
	}
	specVersionSnapshot, specVersionResult, err := service.CompareAndSetAppDefinitionSpecVersion(
		context.Background(),
		defaultSpecVersion,
		&defaultSpecVersion,
	)
	if err != nil {
		t.Fatalf("compare-and-set app spec version: %v", err)
	}
	specPathSnapshot, specPathResult, err := service.CompareAndSetAppDefinitionSpecPath(
		context.Background(),
		defaultSpecPath,
		&defaultSpecPath,
	)
	if err != nil {
		t.Fatalf("compare-and-set app spec path: %v", err)
	}
	themeModeSnapshot, themeModeResult, err := service.CompareAndSetAppDefinitionThemeMode(
		context.Background(),
		defaultThemeMode,
		&defaultThemeMode,
	)
	if err != nil {
		t.Fatalf("compare-and-set app theme mode: %v", err)
	}

	for _, snapshot := range []projectstate.Snapshot{catalogSnapshot, specVersionSnapshot, specPathSnapshot, themeModeSnapshot} {
		if snapshot.Revision != initialSnapshot.Revision {
			t.Fatalf("expected no-op revision %d, got %d", initialSnapshot.Revision, snapshot.Revision)
		}
	}
	for _, result := range []projectstate.CompareAndSetResult[string]{catalogResult, specVersionResult, specPathResult, themeModeResult} {
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

func TestAppDefinitionServiceCompareAndSetSpecVersionMaterializesMinimalSpec(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)
	initialSnapshot := runtime.Snapshot()
	expectedOldValue := "v1"

	snapshot, result, err := service.CompareAndSetAppDefinitionSpecVersion(
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
	if result.OldValue != "v1" || result.NewValue != "v2" {
		t.Fatalf("unexpected app spec version result %#v", result)
	}

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

	storedDefinition := mustDecodeStoredAppDefinition(t, snapshot.Document.AppDefinition)
	if storedDefinition == nil {
		t.Fatal("expected saved app definition metadata")
	}
	if storedDefinition.AppSpecPath != appspec.DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %q", appspec.DefaultPath(), storedDefinition.AppSpecPath)
	}
	if storedDefinition.CatalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected saved catalog id %q, got %q", appspec.DefaultCatalogID, storedDefinition.CatalogID)
	}
	if storedDefinition.AppSpecVersion != "v2" {
		t.Fatalf("expected saved app spec version v2, got %q", storedDefinition.AppSpecVersion)
	}
}

func TestAppDefinitionServiceCompareAndSetCatalogIDRejectsUnknownCatalog(t *testing.T) {
	t.Parallel()

	_, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)
	expectedOldValue := appspec.DefaultCatalogID

	_, _, err := service.CompareAndSetAppDefinitionCatalogID(
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

func TestAppDefinitionServiceCompareAndSetSpecPathNormalizesAndPersistsMinimalSpec(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)
	customPath := appspec.JoinPath("custom.json")
	targetPath := filepath.Join(root, filepath.FromSlash(customPath))
	expectedOldValue := appspec.DefaultPath()

	_, result, err := service.CompareAndSetAppDefinitionSpecPath(
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
	if result.NewValue != customPath {
		t.Fatalf("expected normalized app spec path %q, got %q", customPath, result.NewValue)
	}

	if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(customPath))); err != nil {
		t.Fatalf("expected normalized app spec file to exist: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, appspec.DefaultPath())); !os.IsNotExist(err) {
		t.Fatalf("expected default app spec path to remain absent, got err=%v", err)
	}
}

func TestAppDefinitionServiceCompareAndSetThemeModePreservesThemePayload(t *testing.T) {
	t.Parallel()

	_, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)
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
	setTestAppDefinition(t, runtime, projectstate.SetAppDefinitionInput{
		AppSpec: appSpec,
		Theme:   &theme,
	})

	expectedOldValue := "light"
	_, result, err := service.CompareAndSetAppDefinitionThemeMode(
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

	var themePayload map[string]any
	storedDefinition := mustDecodeStoredAppDefinition(t, runtime.Snapshot().Document.AppDefinition)
	if err := json.Unmarshal(storedDefinition.Theme, &themePayload); err != nil {
		t.Fatalf("decode saved theme payload: %v", err)
	}
	if themePayload["className"] != "app-shell" {
		t.Fatalf("expected preserved theme className, got %#v", themePayload["className"])
	}
	if themePayload["mode"] != "dark" {
		t.Fatalf("expected updated theme mode dark, got %#v", themePayload["mode"])
	}
}

func TestAppDefinitionServiceCompareAndSetMetadataRejectsStaleExpectedOldValue(t *testing.T) {
	t.Parallel()

	_, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)
	initialSnapshot := runtime.Snapshot()
	staleExpectedOldValue := "v0"

	snapshot, _, err := service.CompareAndSetAppDefinitionSpecVersion(
		context.Background(),
		"v2",
		&staleExpectedOldValue,
	)
	if !projectstate.IsExpectedOldValueMismatchError(err) {
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
