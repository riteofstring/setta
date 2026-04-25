package projectstate

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/appspec"
)

func TestRuntimeSetAppDefinitionPersistsSpecAndMetadata(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store := newTestStore(t, filepath.Join(root, "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	absoluteAppSpecPath := filepath.Join(root, "app_specs", "custom.json")
	appSpecVersion := "v2"
	catalogID := appspec.DefaultCatalogID
	routes := []AppRoute{{Path: "/", Name: "Home", RootKey: "root"}}
	dataBindings := map[string]any{"title": map[string]any{"text": "hello"}}
	actions := map[string]any{"customRun": map[string]any{"type": "run"}}
	theme := map[string]any{"mode": "dark"}
	assets := []any{map[string]any{"rel": "stylesheet", "href": "/app.css"}}
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}

	snapshot, result, err := runtime.SetAppDefinition(context.Background(), SetAppDefinitionInput{
		AppSpec:        appSpec,
		AppSpecPath:    &absoluteAppSpecPath,
		AppSpecVersion: &appSpecVersion,
		CatalogID:      &catalogID,
		Routes:         &routes,
		DataBindings:   &dataBindings,
		Actions:        &actions,
		Theme:          &theme,
		Assets:         &assets,
	})
	if err != nil {
		t.Fatalf("set app definition: %v", err)
	}

	if result.AppDefinition == nil {
		t.Fatal("expected app definition result")
	}
	if result.AppDefinition.AppSpecPath != "app_specs/custom.json" {
		t.Fatalf("expected normalized app spec path app_specs/custom.json, got %q", result.AppDefinition.AppSpecPath)
	}
	if result.AppDefinition.AppSpecVersion != "v2" {
		t.Fatalf("expected app spec version v2, got %q", result.AppDefinition.AppSpecVersion)
	}
	if result.AppDefinition.CatalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %q", appspec.DefaultCatalogID, result.AppDefinition.CatalogID)
	}

	storedSpec, err := appspec.Read(root, "app_specs/custom.json")
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, appSpec) {
		t.Fatalf("expected stored app spec %#v, got %#v", appSpec, storedSpec)
	}

	loaded, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load saved document: %v", err)
	}
	if loaded.AppDefinition == nil {
		t.Fatal("expected app definition in saved document")
	}
	if loaded.AppDefinition.AppSpecPath != "app_specs/custom.json" {
		t.Fatalf("expected saved app spec path app_specs/custom.json, got %q", loaded.AppDefinition.AppSpecPath)
	}
	if loaded.AppDefinition.CatalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected saved catalog id %q, got %q", appspec.DefaultCatalogID, loaded.AppDefinition.CatalogID)
	}
	if snapshot.Document.AppDefinition == nil || snapshot.Document.AppDefinition.AppSpecPath != "app_specs/custom.json" {
		t.Fatalf("expected snapshot app definition with normalized path, got %#v", snapshot.Document.AppDefinition)
	}
}

func TestRuntimeUpdateAppDefinitionMergesPatchAndRewritesStoredSpec(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store := newTestStore(t, filepath.Join(root, "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	initial := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
			"props": map[string]any{
				"gap":       float64(8),
				"direction": "column",
			},
		},
		"elements": map[string]any{},
	}
	if _, _, err := runtime.SetAppDefinition(context.Background(), SetAppDefinitionInput{AppSpec: initial}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}

	patch := map[string]any{
		"root": map[string]any{
			"props": map[string]any{
				"gap": float64(12),
			},
		},
	}
	snapshot, result, err := runtime.UpdateAppDefinition(context.Background(), patch)
	if err != nil {
		t.Fatalf("update app definition: %v", err)
	}

	appSpecObject, ok := result.AppSpec.(map[string]any)
	if !ok {
		t.Fatalf("expected app spec object result, got %#v", result.AppSpec)
	}
	rootObject, ok := appSpecObject["root"].(map[string]any)
	if !ok {
		t.Fatalf("expected root object, got %#v", appSpecObject["root"])
	}
	propsObject, ok := rootObject["props"].(map[string]any)
	if !ok {
		t.Fatalf("expected root props object, got %#v", rootObject["props"])
	}
	if propsObject["gap"] != float64(12) {
		t.Fatalf("expected merged gap 12, got %#v", propsObject["gap"])
	}
	if propsObject["direction"] != "column" {
		t.Fatalf("expected preserved direction column, got %#v", propsObject["direction"])
	}

	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, result.AppSpec) {
		t.Fatalf("expected stored app spec %#v, got %#v", result.AppSpec, storedSpec)
	}

	if snapshot.Document.AppDefinition == nil || snapshot.Document.AppDefinition.AppSpecPath != appspec.DefaultPath() {
		t.Fatalf("expected snapshot app definition with default path, got %#v", snapshot.Document.AppDefinition)
	}
}

func TestRuntimeUpdateAppDefinitionRejectsUnknownComponentWithoutRewritingStoredSpec(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store := newTestStore(t, filepath.Join(root, "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	initial := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	if _, _, err := runtime.SetAppDefinition(context.Background(), SetAppDefinitionInput{AppSpec: initial}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}

	_, _, err := runtime.UpdateAppDefinition(context.Background(), map[string]any{
		"root": map[string]any{
			"type": "Nope",
		},
	})
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "unknown component") {
		t.Fatalf("expected unknown component error, got %v", err)
	}

	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec after rejected update: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, initial) {
		t.Fatalf("expected stored app spec %#v after rejected update, got %#v", initial, storedSpec)
	}
}

func TestRuntimeUpdateAppDefinitionRequiresConfiguredSpecPath(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	_, _, err := runtime.UpdateAppDefinition(context.Background(), map[string]any{
		"root": map[string]any{"type": "Stack"},
	})
	if !errors.Is(err, ErrAppSpecPathUnconfigured) {
		t.Fatalf("expected app spec path unconfigured error, got %v", err)
	}
}

func TestRuntimeUpdateAppDefinitionRequiresStoredSpec(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	store := newTestStore(t, filepath.Join(root, "project.json"))
	document := Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		AppDefinition: &AppDefinition{
			AppSpecPath:    appspec.DefaultPath(),
			AppSpecVersion: defaultAppSpecVersion,
			CatalogID:      appspec.DefaultCatalogID,
		},
		Projects: map[string]Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	_, _, err := runtime.UpdateAppDefinition(context.Background(), map[string]any{
		"root": map[string]any{"type": "Stack"},
	})
	if !errors.Is(err, ErrAppSpecNotFound) {
		t.Fatalf("expected app spec not found error, got %v", err)
	}
}
