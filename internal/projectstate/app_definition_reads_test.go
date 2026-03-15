package projectstate

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/appspec"
)

func TestRuntimeGetAppDefinitionEmpty(t *testing.T) {
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
	result, err := runtime.GetAppDefinition(context.Background())
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

func TestRuntimeGetAppDefinitionReturnsStoredSpec(t *testing.T) {
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
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}
	if _, _, err := runtime.SetAppDefinition(context.Background(), SetAppDefinitionInput{
		AppSpec: appSpec,
	}); err != nil {
		t.Fatalf("set app definition: %v", err)
	}

	result, err := runtime.GetAppDefinition(context.Background())
	if err != nil {
		t.Fatalf("get app definition: %v", err)
	}
	if result.AppDefinition == nil {
		t.Fatal("expected app definition metadata")
	}
	if result.AppDefinition.AppSpecPath != appspec.DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %q", appspec.DefaultPath(), result.AppDefinition.AppSpecPath)
	}
	if result.AppSpec == nil {
		t.Fatal("expected stored app spec")
	}

	rootSpec, ok := result.AppSpec.(map[string]any)["root"].(map[string]any)
	if !ok {
		t.Fatalf("expected root app spec object, got %#v", result.AppSpec)
	}
	if rootSpec["type"] != "Stack" {
		t.Fatalf("expected root component Stack, got %#v", rootSpec["type"])
	}
}

func TestRuntimeValidateAppDefinitionReturnsCapabilities(t *testing.T) {
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
	result, err := runtime.ValidateAppDefinition(context.Background(), ValidateAppDefinitionInput{
		AppSpec: map[string]any{
			"root": map[string]any{
				"key":  "root",
				"type": "Stack",
			},
			"elements": map[string]any{},
		},
	})
	if err != nil {
		t.Fatalf("validate app definition: %v", err)
	}

	if len(result.Errors) != 0 {
		t.Fatalf("expected no validation errors, got %#v", result.Errors)
	}
	if result.Capabilities.CatalogID != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %q", appspec.DefaultCatalogID, result.Capabilities.CatalogID)
	}
	if result.Capabilities.CatalogVersion != appspec.DefaultCatalogVersion {
		t.Fatalf("expected catalog version %q, got %q", appspec.DefaultCatalogVersion, result.Capabilities.CatalogVersion)
	}
	if result.Capabilities.AppSpecVersion != "v1" {
		t.Fatalf("expected app spec version v1, got %q", result.Capabilities.AppSpecVersion)
	}
	if !result.Capabilities.Features["responsive"] || !result.Capabilities.Features["motion"] || !result.Capabilities.Features["typographyScale"] {
		t.Fatalf("expected capabilities to include responsive, motion, and typographyScale, got %#v", result.Capabilities.Features)
	}
}

func TestRuntimeValidateAppDefinitionReportsWarningsAndMultipleErrors(t *testing.T) {
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
	result, err := runtime.ValidateAppDefinition(context.Background(), ValidateAppDefinitionInput{
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

	foundRunWarning := false
	foundVarWarning := false
	foundAssetWarning := false
	for _, issue := range result.Warnings {
		switch {
		case issue.Message == "Run ActionButton is missing sectionId." && issue.ElementKey == "run-btn":
			foundRunWarning = true
		case strings.Contains(issue.Message, "theme.vars contains keys that do not start with '--app-'"):
			foundVarWarning = true
		case strings.Contains(issue.Message, "assets includes external URLs"):
			foundAssetWarning = true
		}
	}
	if !foundRunWarning {
		t.Fatalf("expected missing run sectionId warning, got %#v", result.Warnings)
	}
	if !foundVarWarning {
		t.Fatalf("expected theme vars warning, got %#v", result.Warnings)
	}
	if !foundAssetWarning {
		t.Fatalf("expected external asset warning, got %#v", result.Warnings)
	}
}
