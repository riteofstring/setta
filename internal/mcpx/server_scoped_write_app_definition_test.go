package mcpx

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/projectstate"
	"setta/internal/testutil/appsubsystemtest"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerSetAppDefinitionRequiresStructuralScope(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	setScopedAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section")

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_app_definition",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"appSpec": map[string]any{
				"root":     map[string]any{"key": "root", "type": "Stack"},
				"elements": map[string]any{},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_app_definition blocked: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected blocked set_app_definition call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["reason"] != "structural_denied" {
		t.Fatalf("expected structural_denied reason, got %#v", payload["reason"])
	}
}

func TestServerGetAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	setTestAppDefinition(t, projectRuntime, appdefinition.SetInput{
		AppSpec: map[string]any{
			"root":     map[string]any{"key": "root", "type": "Stack"},
			"elements": map[string]any{},
		},
	})

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id get_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id get_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appDefinition := mustStructuredMap(t, payload["appDefinition"])
	if appDefinition["appSpecPath"] != appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %#v", appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(), appDefinition["appSpecPath"])
	}
	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", storedSpec, payload["appSpec"])
	}
}

func TestServerValidateAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	_, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "validate_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"appSpec": map[string]any{
				"root": map[string]any{
					"key":  "run-btn",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run",
						"action": "run",
					},
				},
				"elements": map[string]any{},
			},
			"theme": map[string]any{
				"vars": map[string]any{
					"accent":       "#fff",
					"--app-accent": "#fff",
				},
			},
			"assets": []any{
				map[string]any{"href": "https://example.com/app.css"},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id validate_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id validate_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	errors, ok := payload["errors"].([]any)
	if !ok {
		t.Fatalf("expected errors array, got %#v", payload["errors"])
	}
	if len(errors) != 0 {
		t.Fatalf("expected no validation errors, got %#v", errors)
	}
	warnings, ok := payload["warnings"].([]any)
	if !ok {
		t.Fatalf("expected warnings array, got %#v", payload["warnings"])
	}
	if len(warnings) < 3 {
		t.Fatalf("expected multiple warnings, got %#v", warnings)
	}
	capabilities := mustStructuredMap(t, payload["capabilities"])
	if capabilities["catalogId"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, capabilities["catalogId"])
	}
	features := mustStructuredMap(t, capabilities["features"])
	if features["responsive"] != true || features["motion"] != true {
		t.Fatalf("expected responsive and motion feature flags, got %#v", features)
	}
}

func TestServerSetAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"appSpec": map[string]any{
				"root":     map[string]any{"key": "root", "type": "Stack"},
				"elements": map[string]any{},
			},
			"appSpecPath":    appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json"),
			"appSpecVersion": "v2",
			"catalogId":      appspec.DefaultCatalogID,
			"routes": []any{
				map[string]any{"path": "/", "name": "Home", "rootKey": "root"},
			},
			"theme": map[string]any{"mode": "dark"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appDefinition := mustStructuredMap(t, payload["appDefinition"])
	if appDefinition["appSpecPath"] != appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json") {
		t.Fatalf("expected normalized app spec path, got %#v", appDefinition["appSpecPath"])
	}
	if appDefinition["appSpecVersion"] != "v2" {
		t.Fatalf("expected app spec version v2, got %#v", appDefinition["appSpecVersion"])
	}

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json"))
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", payload["appSpec"], storedSpec)
	}
	storedAppDefinition := mustDecodeStoredAppDefinition(
		t,
		appdefinition.MustStorageForPlugin("setta-json-render-app-gen").StoredDocumentAppDefinitionRaw(projectRuntime.Snapshot().Document),
	)
	if storedAppDefinition.AppSpecPath != appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json") {
		t.Fatalf("expected runtime app definition after mutation, got %#v", storedAppDefinition)
	}
}

func TestServerUpdateAppDefinitionAllowsUnscopedStructuralCallsAndTranslatesTemporaryProjectID(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	setTestAppDefinition(t, projectRuntime, appdefinition.SetInput{
		AppSpec: map[string]any{
			"root": map[string]any{
				"key":  "root",
				"type": "Stack",
				"props": map[string]any{
					"gap":       float64(8),
					"direction": "column",
				},
			},
			"elements": map[string]any{},
		},
	})

	temporaryIDMapPath := filepath.Join(t.TempDir(), temporaryIDMapFileName)
	writeTemporaryIDMapForTest(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})

	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		LSPDiagnostics:     openScopedTestLSPDiagnosticsRegistry(),
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"patch": map[string]any{
				"root": map[string]any{
					"props": map[string]any{
						"gap": float64(12),
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id update_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id update_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	appSpec := mustStructuredMap(t, payload["appSpec"])
	rootSpec := mustStructuredMap(t, appSpec["root"])
	props := mustStructuredMap(t, rootSpec["props"])
	if props["gap"] != float64(12) {
		t.Fatalf("expected merged gap 12, got %#v", props["gap"])
	}
	if props["direction"] != "column" {
		t.Fatalf("expected preserved direction column, got %#v", props["direction"])
	}

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(root, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, payload["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", payload["appSpec"], storedSpec)
	}
}

func TestServerUpdateAppDefinitionReturnsFileNotFoundWhenStoredSpecIsMissing(t *testing.T) {
	t.Parallel()

	_, projectRuntime := openPersistedAppDefinitionTestProjectRuntime(t)
	if _, err := projectRuntime.Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document = appdefinition.MustStorageForPlugin("setta-json-render-app-gen").WithStoredDocumentAppDefinition(document, appsubsystemtest.MustMarshalStoredAppDefinition(t, appdefinition.AppDefinition{
			AppSpecPath:    appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(),
			AppSpecVersion: "v1",
			CatalogID:      appspec.DefaultCatalogID,
		}))
		return document, nil
	}); err != nil {
		t.Fatalf("seed missing app definition metadata: %v", err)
	}
	if _, err := projectRuntime.Save(context.Background()); err != nil {
		t.Fatalf("save missing app definition metadata: %v", err)
	}

	_, clientSession := newScopedTestServerSession(t, t.TempDir(), projectRuntime)
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"patch": map[string]any{
				"root": map[string]any{"type": "Stack"},
			},
		},
	})
	if err != nil {
		t.Fatalf("call missing-spec update_app_definition: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected missing-spec update_app_definition call to fail")
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "file_not_found" {
		t.Fatalf("expected file_not_found code, got %#v", payload["code"])
	}
}
