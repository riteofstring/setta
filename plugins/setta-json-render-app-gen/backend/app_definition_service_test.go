package settajsonrenderappgenbackend

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appdefinition"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func TestAppDefinitionServiceGetAppDefinitionEmpty(t *testing.T) {
	t.Parallel()

	_, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)

	result, err := service.GetAppDefinition(context.Background())
	if err != nil {
		t.Fatalf("get app definition: %v", err)
	}
	if result.AppDefinition != nil {
		t.Fatalf("expected no app definition, got %#v", result.AppDefinition)
	}
	if result.AppSpec != nil {
		t.Fatalf("expected no app spec, got %#v", result.AppSpec)
	}
}

func TestAppDefinitionServiceGetEffectiveMetadataDefaults(t *testing.T) {
	t.Parallel()

	_, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)

	definition, err := service.GetEffectiveAppDefinition(context.Background())
	if err != nil {
		t.Fatalf("get effective app definition: %v", err)
	}
	specPath, err := service.GetEffectiveAppSpecPath(context.Background())
	if err != nil {
		t.Fatalf("get effective app spec path: %v", err)
	}
	themeMode, err := service.GetEffectiveAppThemeMode(context.Background())
	if err != nil {
		t.Fatalf("get effective app theme mode: %v", err)
	}

	if definition.CatalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected default catalog id %q, got %q", appspec.DefaultCatalogID, definition.CatalogID)
	}
	if definition.AppSpecVersion != "v1" {
		t.Fatalf("expected default app spec version v1, got %q", definition.AppSpecVersion)
	}
	if specPath != appspec.DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %q", appspec.DefaultPath(), specPath)
	}
	if themeMode != "auto" {
		t.Fatalf("expected default app theme mode auto, got %q", themeMode)
	}
}

func TestAppDefinitionServiceUsesSelectedProviderNamespace(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	providerPluginID := "acme.third-party-app-provider"
	service := NewAppDefinitionService(runtime, providerPluginID)
	defaultAppSpecPath := appspec.ForPlugin(providerPluginID).DefaultPath()
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}

	snapshot, result, err := service.SetAppDefinition(
		context.Background(),
		appdefinition.SetInput{
			AppSpec: appSpec,
		},
	)
	if err != nil {
		t.Fatalf("set app definition: %v", err)
	}
	if result.AppDefinition == nil {
		t.Fatal("expected app definition result")
	}
	if result.AppDefinition.AppSpecPath != defaultAppSpecPath {
		t.Fatalf("expected provider-scoped app spec path %q, got %#v", defaultAppSpecPath, result.AppDefinition.AppSpecPath)
	}
	if len(snapshot.Document.PluginData[providerPluginID]) == 0 {
		t.Fatalf("expected provider-scoped plugin data entry for %q", providerPluginID)
	}
	if len(snapshot.Document.PluginData[ProviderPluginID]) != 0 {
		t.Fatalf("did not expect first-party plugin data entry for %q, got %#v", ProviderPluginID, snapshot.Document.PluginData[ProviderPluginID])
	}
	storedSpec, err := appspec.ForPlugin(providerPluginID).Read(
		root,
		defaultAppSpecPath,
	)
	if err != nil {
		t.Fatalf("read provider-scoped app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, appSpec) {
		t.Fatalf("expected provider-scoped app spec %#v, got %#v", appSpec, storedSpec)
	}
}

func TestAppDefinitionServiceGetAppDefinitionNormalizesPersistedMetadata(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)

	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	customPath := appspec.JoinPath("custom.json")
	if err := appspec.Write(root, customPath, appSpec); err != nil {
		t.Fatalf("write app spec: %v", err)
	}
	if _, err := runtime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		next := withStoredDocumentAppDefinition(document, mustEncodeStoredAppDefinition(t, &appdefinition.AppDefinition{
			AppSpecVersion: " v2 ",
			CatalogID:      " " + appspec.DefaultCatalogID + " ",
			AppSpecPath:    " " + customPath + " ",
			Routes: []appdefinition.AppRoute{
				{Path: " / ", Name: " Home ", RootKey: " root "},
			},
			DataBindings: projectstate.RawJSON(` {"title":"hello"} `),
			Actions:      projectstate.RawJSON(` {"submit":{"type":"run"}} `),
			Theme:        projectstate.RawJSON(` {"mode":"dark"} `),
			Assets:       projectstate.RawJSON(` [{"type":"image","path":"hero.png"}] `),
		}))
		return next, nil
	}); err != nil {
		t.Fatalf("mutate persisted app definition payload: %v", err)
	}

	result, err := service.GetAppDefinition(context.Background())
	if err != nil {
		t.Fatalf("get normalized persisted app definition: %v", err)
	}
	if result.AppDefinition == nil {
		t.Fatal("expected app definition metadata")
	}
	if result.AppDefinition.AppSpecVersion != "v2" {
		t.Fatalf("expected trimmed app spec version v2, got %q", result.AppDefinition.AppSpecVersion)
	}
	if result.AppDefinition.CatalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected trimmed catalog id %q, got %q", appspec.DefaultCatalogID, result.AppDefinition.CatalogID)
	}
	if result.AppDefinition.AppSpecPath != customPath {
		t.Fatalf("expected trimmed app spec path %q, got %q", customPath, result.AppDefinition.AppSpecPath)
	}
	if len(result.AppDefinition.Routes) != 1 {
		t.Fatalf("expected one normalized route, got %#v", result.AppDefinition.Routes)
	}
	if result.AppDefinition.Routes[0].Path != "/" || result.AppDefinition.Routes[0].Name != "Home" || result.AppDefinition.Routes[0].RootKey != "root" {
		t.Fatalf("expected normalized route metadata, got %#v", result.AppDefinition.Routes[0])
	}
	if !reflect.DeepEqual(result.AppSpec, appSpec) {
		t.Fatalf("expected stored app spec %#v, got %#v", appSpec, result.AppSpec)
	}
}

func TestAppDefinitionServiceRejectsInvalidPersistedMetadata(t *testing.T) {
	t.Parallel()

	_, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)

	if _, err := runtime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		return withStoredDocumentAppDefinition(
			document,
			projectstate.RawJSON(`{"appSpecVersion":"v1","catalogId":"setta.app.default","dataBindings":["not","an","object"]}`),
		), nil
	}); err != nil {
		t.Fatalf("mutate invalid persisted app definition payload: %v", err)
	}

	_, err := service.GetEffectiveAppDefinition(context.Background())
	if err == nil {
		t.Fatal("expected invalid persisted app definition payload to fail in plugin service")
	}
	if !strings.Contains(err.Error(), "appDefinition.dataBindings") {
		t.Fatalf("expected appDefinition.dataBindings error, got %v", err)
	}
}

func TestAppDefinitionServiceSetAndGetPersistSpecAndMetadata(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)

	appSpecVersion := " v2 "
	catalogID := " " + appspec.DefaultCatalogID + " "
	customPath := appspec.JoinPath("custom.json")
	absoluteAppSpecPath := "  " + filepath.Join(root, filepath.FromSlash(customPath)) + "  "
	routes := []appdefinition.AppRoute{{Path: " / ", Name: " Home ", RootKey: " root "}}
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

	snapshot, result, err := service.SetAppDefinition(context.Background(), appdefinition.SetInput{
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
	if result.AppDefinition.AppSpecPath != customPath {
		t.Fatalf("expected normalized app spec path %q, got %q", customPath, result.AppDefinition.AppSpecPath)
	}
	if result.AppDefinition.AppSpecVersion != "v2" {
		t.Fatalf("expected app spec version v2, got %q", result.AppDefinition.AppSpecVersion)
	}
	if result.AppDefinition.CatalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %q", appspec.DefaultCatalogID, result.AppDefinition.CatalogID)
	}
	if len(result.AppDefinition.Routes) != 1 {
		t.Fatalf("expected one normalized route, got %#v", result.AppDefinition.Routes)
	}
	if result.AppDefinition.Routes[0].Path != "/" || result.AppDefinition.Routes[0].Name != "Home" || result.AppDefinition.Routes[0].RootKey != "root" {
		t.Fatalf("expected normalized route metadata, got %#v", result.AppDefinition.Routes[0])
	}
	snapshotDefinition := storedDocumentAppDefinition(t, snapshot.Document)
	if snapshotDefinition == nil || snapshotDefinition.AppSpecPath != customPath {
		t.Fatalf("expected snapshot app definition with normalized path, got %#v", snapshotDefinition)
	}

	storedSpec, err := appspec.Read(root, customPath)
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, appSpec) {
		t.Fatalf("expected stored app spec %#v, got %#v", appSpec, storedSpec)
	}

	readResult, err := service.GetAppDefinition(context.Background())
	if err != nil {
		t.Fatalf("get app definition: %v", err)
	}
	if readResult.AppDefinition == nil || readResult.AppDefinition.AppSpecPath != customPath {
		t.Fatalf("expected persisted metadata, got %#v", readResult.AppDefinition)
	}
	if !reflect.DeepEqual(readResult.AppSpec, appSpec) {
		t.Fatalf("expected stored app spec %#v, got %#v", appSpec, readResult.AppSpec)
	}
}

func TestAppDefinitionServiceGetReturnsNilSpecWhenStoredFileMissing(t *testing.T) {
	t.Parallel()

	root, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)

	setTestAppDefinition(t, runtime, appdefinition.SetInput{
		AppSpec: map[string]any{
			"root": "root",
			"elements": map[string]any{
				"root": map[string]any{
					"key":  "root",
					"type": "Stack",
				},
			},
		},
	})
	if err := os.Remove(filepath.Join(root, appspec.DefaultPath())); err != nil {
		t.Fatalf("remove stored app spec: %v", err)
	}

	result, err := service.GetAppDefinition(context.Background())
	if err != nil {
		t.Fatalf("get app definition with missing stored file: %v", err)
	}
	if result.AppDefinition == nil || result.AppDefinition.AppSpecPath != appspec.DefaultPath() {
		t.Fatalf("expected app definition metadata with default path, got %#v", result.AppDefinition)
	}
	if result.AppSpec != nil {
		t.Fatalf("expected nil app spec for missing stored file, got %#v", result.AppSpec)
	}
}

func TestAppDefinitionServiceValidateReturnsCapabilitiesAndIssues(t *testing.T) {
	t.Parallel()

	_, runtime := openPersistedPluginAppDefinitionRuntime(t)
	service := appDefinitionServiceForTest(runtime)

	result, err := service.ValidateAppDefinition(context.Background(), appdefinition.ValidateInput{
		AppSpec: map[string]any{
			"root": map[string]any{
				"key":  "root",
				"type": "Stack",
				"props": map[string]any{
					"unknown": "nope",
				},
				"children": []any{
					"missing-child",
					map[string]any{
						"key":      "scope",
						"type":     "ConfigScope",
						"children": []any{},
					},
					map[string]any{
						"key":  "heading",
						"type": "Heading",
						"props": map[string]any{
							"text": "Hello",
						},
						"children": []any{},
					},
					map[string]any{
						"key":  "run-btn",
						"type": "ActionButton",
						"props": map[string]any{
							"label":  "Run",
							"action": "run",
						},
					},
				},
			},
			"elements": map[string]any{},
		},
		Theme: &map[string]any{
			"motion": map[string]any{
				"durationMs": "fast",
			},
			"vars": map[string]any{
				"accent":       "#fff",
				"--app-accent": "#fff",
			},
		},
		Assets: &[]any{
			map[string]any{"rel": "stylesheet", "href": "https://example.com/app.css"},
		},
	})
	if err != nil {
		t.Fatalf("validate app definition: %v", err)
	}
	if len(result.Errors) < 4 {
		t.Fatalf("expected multiple validation errors, got %#v", result.Errors)
	}
	if len(result.Warnings) == 0 {
		t.Fatalf("expected validation warnings, got %#v", result.Warnings)
	}
	if result.Capabilities.CatalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %q", appspec.DefaultCatalogID, result.Capabilities.CatalogID)
	}
	if result.Capabilities.AppSpecVersion != "v1" {
		t.Fatalf("expected app spec version v1, got %q", result.Capabilities.AppSpecVersion)
	}
}

func TestAppDefinitionServiceUpdateHandlesMergeAndRequiredState(t *testing.T) {
	t.Parallel()

	t.Run("merges patch and rewrites stored spec", func(t *testing.T) {
		t.Parallel()

		root, runtime := openPersistedPluginAppDefinitionRuntime(t)
		service := appDefinitionServiceForTest(runtime)
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
		setTestAppDefinition(t, runtime, appdefinition.SetInput{AppSpec: initial})

		snapshot, result, err := service.UpdateAppDefinition(context.Background(), map[string]any{
			"root": map[string]any{
				"props": map[string]any{
					"gap": float64(12),
				},
			},
		})
		if err != nil {
			t.Fatalf("update app definition: %v", err)
		}

		appSpecObject, ok := result.AppSpec.(map[string]any)
		if !ok {
			t.Fatalf("expected app spec object result, got %#v", result.AppSpec)
		}
		rootObject := appSpecObject["root"].(map[string]any)
		propsObject := rootObject["props"].(map[string]any)
		if propsObject["gap"] != float64(12) {
			t.Fatalf("expected merged gap 12, got %#v", propsObject["gap"])
		}
		if propsObject["direction"] != "column" {
			t.Fatalf("expected preserved direction column, got %#v", propsObject["direction"])
		}
		snapshotDefinition := storedDocumentAppDefinition(t, snapshot.Document)
		if snapshotDefinition == nil || snapshotDefinition.AppSpecPath != appspec.DefaultPath() {
			t.Fatalf("expected snapshot app definition with default path, got %#v", snapshotDefinition)
		}

		storedSpec, err := appspec.Read(root, appspec.DefaultPath())
		if err != nil {
			t.Fatalf("read stored app spec: %v", err)
		}
		if !reflect.DeepEqual(storedSpec, result.AppSpec) {
			t.Fatalf("expected stored app spec %#v, got %#v", result.AppSpec, storedSpec)
		}
	})

	t.Run("rejects invalid update without rewriting stored spec", func(t *testing.T) {
		t.Parallel()

		root, runtime := openPersistedPluginAppDefinitionRuntime(t)
		service := appDefinitionServiceForTest(runtime)
		initial := map[string]any{
			"root": map[string]any{
				"key":  "root",
				"type": "Stack",
			},
			"elements": map[string]any{},
		}
		setTestAppDefinition(t, runtime, appdefinition.SetInput{AppSpec: initial})

		_, _, err := service.UpdateAppDefinition(context.Background(), map[string]any{
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
	})

	t.Run("requires configured spec path", func(t *testing.T) {
		t.Parallel()

		_, runtime := openPersistedPluginAppDefinitionRuntime(t)
		service := appDefinitionServiceForTest(runtime)

		_, _, err := service.UpdateAppDefinition(context.Background(), map[string]any{
			"root": map[string]any{"type": "Stack"},
		})
		if !errors.Is(err, appdefinition.ErrAppSpecPathUnconfigured) {
			t.Fatalf("expected app spec path unconfigured error, got %v", err)
		}
	})

	t.Run("requires stored spec", func(t *testing.T) {
		t.Parallel()

		_, runtime := openPersistedPluginAppDefinitionRuntime(t)
		service := appDefinitionServiceForTest(runtime)
		_, err := runtime.MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
			next := withStoredDocumentAppDefinition(document, mustEncodeStoredAppDefinition(t, &appdefinition.AppDefinition{
				AppSpecPath:    appspec.DefaultPath(),
				AppSpecVersion: "v1",
				CatalogID:      appspec.DefaultCatalogID,
			}))
			return next, nil
		})
		if err != nil {
			t.Fatalf("seed app definition metadata: %v", err)
		}

		_, _, err = service.UpdateAppDefinition(context.Background(), map[string]any{
			"root": map[string]any{"type": "Stack"},
		})
		if !errors.Is(err, appdefinition.ErrAppSpecNotFound) {
			t.Fatalf("expected app spec not found error, got %v", err)
		}
	})
}

func TestAppDefinitionServiceStreamHandlesBaseSpecAndInvalidPatch(t *testing.T) {
	t.Parallel()

	t.Run("uses provided base spec and persists result", func(t *testing.T) {
		t.Parallel()

		root, runtime := openPersistedPluginAppDefinitionRuntime(t)
		service := appDefinitionServiceForTest(runtime)
		appSpecPath := appspec.JoinPath("generated.json")
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

		snapshot, result, err := service.StreamAppDefinition(context.Background(), appdefinition.StreamInput{
			Patches:     "{\"op\":\"set\",\"path\":\"/elements/root/props/gap\",\"value\":12}\n{\"op\":\"set\",\"path\":\"/elements/root/children/0\",\"value\":\"headline\"}\n{\"op\":\"set\",\"path\":\"/elements/headline\",\"value\":{\"key\":\"headline\",\"type\":\"Heading\",\"props\":{\"text\":\"Hi\"}}}",
			AppSpecPath: &appSpecPath,
			BaseAppSpec: &baseAppSpec,
		})
		if err != nil {
			t.Fatalf("stream app definition: %v", err)
		}

		snapshotDefinition := storedDocumentAppDefinition(t, snapshot.Document)
		if snapshotDefinition == nil || snapshotDefinition.AppSpecPath != appSpecPath {
			t.Fatalf("expected persisted app definition path %q, got %#v", appSpecPath, snapshotDefinition)
		}
		if result.AppDefinition == nil || result.AppDefinition.AppSpecPath != appSpecPath {
			t.Fatalf("expected result app definition path %q, got %#v", appSpecPath, result.AppDefinition)
		}

		storedSpec, err := appspec.Read(root, appSpecPath)
		if err != nil {
			t.Fatalf("read stored app spec: %v", err)
		}
		specObject := storedSpec.(map[string]any)
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
		if baseRoot["props"].(map[string]any)["gap"] != float64(8) {
			t.Fatalf("expected base app spec gap to remain 8, got %#v", baseRoot["props"])
		}
	})

	t.Run("rejects invalid nested element patch", func(t *testing.T) {
		t.Parallel()

		_, runtime := openPersistedPluginAppDefinitionRuntime(t)
		service := appDefinitionServiceForTest(runtime)

		_, _, err := service.StreamAppDefinition(context.Background(), appdefinition.StreamInput{
			Patches: "{\"op\":\"set\",\"path\":\"/elements/missing/props/title\",\"value\":\"Hello\"}",
		})
		if !errors.Is(err, appdefinition.ErrAppSpecPatchInvalid) {
			t.Fatalf("expected invalid app spec patch error, got %v", err)
		}
		if err == nil || err.Error() != "Element \"missing\" must exist before patching nested fields." {
			t.Fatalf("unexpected invalid patch message %v", err)
		}
	})
}
