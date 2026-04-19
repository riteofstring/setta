package projectstate

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"

	"setta/internal/appspec"
)

func TestRuntimeStreamAppDefinitionUsesProvidedBaseSpecAndPersistsResult(t *testing.T) {
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
	appSpecPath := "app_specs/generated.json"
	baseAppSpec := map[string]any{
		"root": "root",
		"elements": map[string]any{
			"root": map[string]any{
				"key":      "root",
				"type":     "Stack",
				"props":    map[string]any{"gap": float64(8)},
				"children": []any{},
			},
		},
	}

	snapshot, result, err := runtime.StreamAppDefinition(context.Background(), StreamAppDefinitionInput{
		Patches:     "{\"op\":\"set\",\"path\":\"/elements/root/props/gap\",\"value\":12}\n{\"op\":\"set\",\"path\":\"/elements/root/children/0\",\"value\":\"headline\"}\n{\"op\":\"set\",\"path\":\"/elements/headline\",\"value\":{\"key\":\"headline\",\"type\":\"Heading\",\"props\":{\"text\":\"Hi\"}}}",
		AppSpecPath: &appSpecPath,
		BaseAppSpec: &baseAppSpec,
	})
	if err != nil {
		t.Fatalf("stream app definition: %v", err)
	}

	if snapshot.Document.AppDefinition == nil || snapshot.Document.AppDefinition.AppSpecPath != appSpecPath {
		t.Fatalf("expected persisted app definition path %q, got %#v", appSpecPath, snapshot.Document.AppDefinition)
	}
	if result.AppDefinition == nil || result.AppDefinition.AppSpecPath != appSpecPath {
		t.Fatalf("expected result app definition path %q, got %#v", appSpecPath, result.AppDefinition)
	}

	storedSpec, err := appspec.Read(root, appSpecPath)
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	specObject, ok := storedSpec.(map[string]any)
	if !ok {
		t.Fatalf("expected stored app spec object, got %#v", storedSpec)
	}
	rootElement := specObject["elements"].(map[string]any)["root"].(map[string]any)
	props := rootElement["props"].(map[string]any)
	if props["gap"] != float64(12) {
		t.Fatalf("expected streamed gap 12, got %#v", props["gap"])
	}
	children := rootElement["children"].([]any)
	if !reflect.DeepEqual(children, []any{"headline"}) {
		t.Fatalf("expected streamed children %#v, got %#v", []any{"headline"}, children)
	}
	baseRoot := baseAppSpec["elements"].(map[string]any)["root"].(map[string]any)
	baseProps := baseRoot["props"].(map[string]any)
	if baseProps["gap"] != float64(8) {
		t.Fatalf("expected base app spec gap to remain 8, got %#v", baseProps["gap"])
	}
	if !reflect.DeepEqual(baseRoot["children"], []any{}) {
		t.Fatalf("expected base app spec children to remain empty, got %#v", baseRoot["children"])
	}
}

func TestRuntimeStreamAppDefinitionUsesStoredSpecWhenBaseSpecOmitted(t *testing.T) {
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
	initial := map[string]any{
		"root": "root",
		"elements": map[string]any{
			"root": map[string]any{
				"key":  "root",
				"type": "Stack",
				"props": map[string]any{
					"gap": float64(8),
				},
			},
		},
	}
	if _, _, err := runtime.SetAppDefinition(context.Background(), SetAppDefinitionInput{AppSpec: initial}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}

	_, result, err := runtime.StreamAppDefinition(context.Background(), StreamAppDefinitionInput{
		Patches: "{\"op\":\"replace\",\"path\":\"/elements/root/props/gap\",\"value\":12}",
	})
	if err != nil {
		t.Fatalf("stream app definition from stored spec: %v", err)
	}

	appSpecObject, ok := result.AppSpec.(map[string]any)
	if !ok {
		t.Fatalf("expected app spec object result, got %#v", result.AppSpec)
	}
	props := appSpecObject["elements"].(map[string]any)["root"].(map[string]any)["props"].(map[string]any)
	if props["gap"] != float64(12) {
		t.Fatalf("expected patched gap 12, got %#v", props["gap"])
	}

	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, result.AppSpec) {
		t.Fatalf("expected stored app spec %#v, got %#v", result.AppSpec, storedSpec)
	}
}

func TestRuntimeStreamAppDefinitionFallsBackToEmptySpecWhenConfiguredFileIsMissing(t *testing.T) {
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
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save initial document: %v", err)
	}

	runtime := openTestRuntime(t, store)
	_, result, err := runtime.StreamAppDefinition(context.Background(), StreamAppDefinitionInput{
		Patches: "{\"op\":\"set\",\"path\":\"/elements/root\",\"value\":{\"key\":\"root\",\"type\":\"Stack\"}}\n{\"op\":\"set\",\"path\":\"/root\",\"value\":\"root\"}",
	})
	if err != nil {
		t.Fatalf("stream app definition with missing stored file: %v", err)
	}

	appSpecObject := result.AppSpec.(map[string]any)
	if appSpecObject["root"] != "root" {
		t.Fatalf("expected root key root, got %#v", appSpecObject["root"])
	}
	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, result.AppSpec) {
		t.Fatalf("expected stored app spec %#v, got %#v", result.AppSpec, storedSpec)
	}
}

func TestRuntimeStreamAppDefinitionRejectsInvalidNestedElementPatch(t *testing.T) {
	t.Parallel()

	store := newTestStore(t, filepath.Join(t.TempDir(), "project.json"))
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
	_, _, err := runtime.StreamAppDefinition(context.Background(), StreamAppDefinitionInput{
		Patches: "{\"op\":\"set\",\"path\":\"/elements/missing/props/title\",\"value\":\"Hello\"}",
	})
	if !errors.Is(err, ErrAppSpecPatchInvalid) {
		t.Fatalf("expected invalid app spec patch error, got %v", err)
	}
	if err == nil || err.Error() != "Element \"missing\" must exist before patching nested fields." {
		t.Fatalf("unexpected invalid patch message %v", err)
	}
}
