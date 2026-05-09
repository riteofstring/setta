package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestAppIDEMCPServerSupportsTemporaryIDsForSetSectionParamFilterOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "20",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_section_param_filter",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "20",
			"paramFilter":     "   ",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_section_param_filter: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_section_param_filter success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app set_section_param_filter: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-params-section"].SharedModifier)
	if got := allowedPayload["paramFilter"]; got != "   " {
		t.Fatalf("expected allowed-params-section raw paramFilter whitespace after temp-id app mutation, got %#v", got)
	}
}

func TestAppIDEMCPServerSupportsSetMetaControlShowSectionTitleOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustAddAppScopedMCPMetaControlSections(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"chatId":          "chat-1",
			"sectionId":       "chat-section",
		},
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"sectionId":        "allowed-meta-section",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call set_meta_control_show_section_title: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_meta_control_show_section_title success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app set_meta_control_show_section_title: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-meta-section"].SharedModifier)
	if got := allowedPayload["showSectionTitle"]; got != true {
		t.Fatalf("expected allowed-meta-section showSectionTitle=true after app mutation, got %#v", got)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetMetaControlShowSectionTitleOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustAddAppScopedMCPMetaControlSections(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":        "11",
		"chat-1":               "12",
		"chat-section":         "13",
		"allowed-meta-section": "24",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_meta_control_show_section_title",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"chatId":          "12",
			"sectionId":       "13",
		},
		Arguments: map[string]any{
			"projectConfigId":  "11",
			"sectionId":        "24",
			"showSectionTitle": true,
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_meta_control_show_section_title: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_meta_control_show_section_title success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app set_meta_control_show_section_title: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-meta-section"].SharedModifier)
	if got := allowedPayload["showSectionTitle"]; got != true {
		t.Fatalf("expected allowed-meta-section showSectionTitle=true after temp-id app mutation, got %#v", got)
	}
}

func TestAppIDEMCPServerSupportsSetAppDefinitionOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"appSpec": map[string]any{
				"root":     map[string]any{"key": "root", "type": "Stack"},
				"elements": map[string]any{},
			},
			"appSpecPath":    appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json"),
			"appSpecVersion": "v2",
			"catalogId":      appspec.DefaultCatalogID,
			"theme":          map[string]any{"mode": "dark"},
		},
	})
	if err != nil {
		t.Fatalf("call set_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_app_definition success, got %#v", result.StructuredContent)
	}

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(cfg.Paths.SettaFilesRoot, appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json"))
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"])) {
		t.Fatalf("expected stored app spec %#v, got %#v", mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"]), storedSpec)
	}
	storedAppDefinition := mustDecodeStoredAppDefinition(
		t,
		appdefinition.MustStorageForPlugin("setta-json-render-app-gen").StoredDocumentAppDefinitionRaw(app.ProjectStates().Main().Snapshot().Document),
	)
	if storedAppDefinition.AppSpecPath != appspec.MustForPlugin("setta-json-render-app-gen").JoinPath("custom.json") {
		t.Fatalf("expected persisted app definition after streamable HTTP mutation, got %#v", storedAppDefinition)
	}
}

func TestAppIDEMCPServerSupportsGetAppDefinitionOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setTestAppDefinition(t, app.ProjectStates().Main(), appdefinition.SetInput{
		AppSpec: map[string]any{
			"root":     map[string]any{"key": "root", "type": "Stack"},
			"elements": map[string]any{},
		},
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
		},
	})
	if err != nil {
		t.Fatalf("call get_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected get_app_definition success, got %#v", result.StructuredContent)
	}

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(cfg.Paths.SettaFilesRoot, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	payload := mustStructuredMapValue(t, result.StructuredContent)
	appDefinition := mustStructuredMapValue(t, payload["appDefinition"])
	if appDefinition["appSpecPath"] != appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath() {
		t.Fatalf("expected default app spec path %q, got %#v", appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath(), appDefinition["appSpecPath"])
	}
	if !reflect.DeepEqual(storedSpec, mustStructuredMapValue(t, payload["appSpec"])) {
		t.Fatalf("expected stored app spec %#v, got %#v", storedSpec, mustStructuredMapValue(t, payload["appSpec"]))
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForGetAppDefinitionOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setTestAppDefinition(t, app.ProjectStates().Main(), appdefinition.SetInput{
		AppSpec: map[string]any{
			"root":     map[string]any{"key": "root", "type": "Stack"},
			"elements": map[string]any{},
		},
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
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

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(cfg.Paths.SettaFilesRoot, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"])) {
		t.Fatalf("expected stored app spec %#v, got %#v", storedSpec, mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"]))
	}
}

func TestAppIDEMCPServerSupportsValidateAppDefinitionOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "validate_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
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
		t.Fatalf("call validate_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected validate_app_definition success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMapValue(t, result.StructuredContent)
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
	capabilities := mustStructuredMapValue(t, payload["capabilities"])
	if capabilities["catalogId"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, capabilities["catalogId"])
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForValidateAppDefinitionOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "validate_app_definition",
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
		},
	})
	if err != nil {
		t.Fatalf("call temp-id validate_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id validate_app_definition success, got %#v", result.StructuredContent)
	}

	capabilities := mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["capabilities"])
	if capabilities["catalogId"] != appspec.DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %#v", appspec.DefaultCatalogID, capabilities["catalogId"])
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetAppDefinitionOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
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
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_app_definition success, got %#v", result.StructuredContent)
	}

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(cfg.Paths.SettaFilesRoot, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"])) {
		t.Fatalf("expected stored app spec %#v, got %#v", mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"]), storedSpec)
	}
}

func TestAppIDEMCPServerSupportsUpdateAppDefinitionOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setTestAppDefinition(t, app.ProjectStates().Main(), appdefinition.SetInput{
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

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "update_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
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
		t.Fatalf("call update_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected update_app_definition success, got %#v", result.StructuredContent)
	}

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(cfg.Paths.SettaFilesRoot, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	appSpec := mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"])
	rootSpec := mustStructuredMapValue(t, appSpec["root"])
	props := mustStructuredMapValue(t, rootSpec["props"])
	if props["gap"] != float64(12) {
		t.Fatalf("expected merged gap 12, got %#v", props["gap"])
	}
	if props["direction"] != "column" {
		t.Fatalf("expected preserved direction column, got %#v", props["direction"])
	}
	if !reflect.DeepEqual(storedSpec, appSpec) {
		t.Fatalf("expected stored app spec %#v, got %#v", appSpec, storedSpec)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForUpdateAppDefinitionOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	enableAppSubsystemPluginForTest(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setTestAppDefinition(t, app.ProjectStates().Main(), appdefinition.SetInput{
		AppSpec: map[string]any{
			"root": map[string]any{
				"key":  "root",
				"type": "Stack",
				"props": map[string]any{
					"gap": float64(8),
				},
			},
			"elements": map[string]any{},
		},
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
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

	storedSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(cfg.Paths.SettaFilesRoot, appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"])) {
		t.Fatalf("expected stored app spec %#v, got %#v", mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"]), storedSpec)
	}
}

func TestAppIDEMCPServerSupportsCompareAndSetShowParamDisplayNamesOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "compare_and_set_show_param_display_names",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId":       "project-alpha",
			"showParamDisplayNames": true,
			"expectedOldValue":      false,
		},
	})
	if err != nil {
		t.Fatalf("call compare_and_set_show_param_display_names: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected compare_and_set_show_param_display_names success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app CAS show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after app CAS mutation")
	}
}

func TestAppIDEMCPServerRejectsPluginSetProjectConfigCodegenTargetsOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"codegenTargets": []any{
				map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
					"options":  map[string]any{"className": "MCPState"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call set_project_config_codegen_targets: %v", err)
	}
	if !result.IsError {
		t.Fatalf("expected set_project_config_codegen_targets rejection, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMapValue(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	message, ok := payload["message"].(string)
	if !ok || !strings.Contains(message, "is not registered") {
		t.Fatalf("expected plugin-registration rejection message, got %#v", payload["message"])
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app set_project_config_codegen_targets: %v", err)
	}
	if len(project.CodegenTargets) != 0 {
		t.Fatalf("expected no persisted codegen targets after app rejection, got %#v", project.CodegenTargets)
	}
}

func TestAppIDEMCPServerSupportsLinkedPluginSetProjectConfigCodegenTargetsWithTemporaryIDsOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	localPluginRoot := filepath.Join(t.TempDir(), "backend")
	copyAppTestDir(t, sourceRoot, localPluginRoot)
	manifestPath := filepath.Join(localPluginRoot, "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read linked plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode linked plugin manifest: %v", err)
	}
	manifest["capabilities"] = []string{"registerCodegenTarget"}
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode linked plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write linked plugin manifest: %v", err)
	}

	httpClient := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	linkRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RoutePluginsLink, bytes.NewReader(mustAppJSON(t, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           true,
	})))
	if err != nil {
		t.Fatalf("new plugins link request: %v", err)
	}
	linkRequest.Header.Set("Content-Type", "application/json")
	linkResponse, err := httpClient.Do(linkRequest)
	if err != nil {
		t.Fatalf("post plugins link: %v", err)
	}
	defer linkResponse.Body.Close()
	if linkResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(linkResponse.Body)
		t.Fatalf("expected plugins link 200, got %d with body %q", linkResponse.StatusCode, string(body))
	}

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: httpClient,
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_project_config_codegen_targets",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"codegenTargets": []any{
				map[string]any{
					"language": "setta-fixture-backend-codegen:typescript",
					"options":  map[string]any{"className": "TemporaryMCPState"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_project_config_codegen_targets: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_project_config_codegen_targets success, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMapValue(t, result.StructuredContent)
	if payload["status"] != "ok" {
		t.Fatalf("expected ok status, got %#v", payload)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app linked-plugin set_project_config_codegen_targets: %v", err)
	}
	if len(project.CodegenTargets) != 1 || project.CodegenTargets[0].Language != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("expected persisted plugin codegen target after temp-id app call, got %#v", project.CodegenTargets)
	}
}

func TestAppIDEMCPServerSupportsGeneratedFormatCodeOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	addRepoVenvRuffToPath(t)
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustEnableAppSavedPythonCodegen(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	if _, err := app.ProjectStates().Main().SetGenCodePrefix(context.Background(), "project-alpha", "import os,sys\n"); err != nil {
		t.Fatalf("seed generated prefix before format_code: %v", err)
	}
	if _, err := app.ProjectStates().Main().SetGenCodeSuffix(context.Background(), "project-alpha", "state={1:2}\n"); err != nil {
		t.Fatalf("seed generated suffix before format_code: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "format_code",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       projectstate.GeneratedPythonCodeSectionID,
		},
	})
	if err != nil {
		t.Fatalf("call generated format_code: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected generated format_code success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after generated format_code: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after generated format_code: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after generated format_code")
	}
	if config.GenCodePrefix != "import os\nimport sys\n" {
		t.Fatalf("expected formatted gen code prefix, got %q", config.GenCodePrefix)
	}
	if config.GenCodeSuffix != "state = {1: 2}\n" {
		t.Fatalf("expected formatted gen code suffix, got %q", config.GenCodeSuffix)
	}

	content := mustReadAppGeneratedPythonCode(t, cfg)
	if !strings.Contains(content, "import os\nimport sys") {
		t.Fatalf("expected generated python file to include formatted prefix, got %q", content)
	}
	if !strings.Contains(content, "state = {1: 2}") {
		t.Fatalf("expected generated python file to include formatted suffix, got %q", content)
	}
}

func TestAppIDEMCPServerSupportsSetGenCodePrefixOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustEnableAppSavedPythonCodegen(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_prefix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodePrefix":   "import math\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_gen_code_prefix: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_gen_code_prefix success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app set_gen_code_prefix: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after app set_gen_code_prefix: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after app set_gen_code_prefix")
	}
	if config.GenCodePrefix != "import math\n" {
		t.Fatalf("expected persisted gen code prefix after app mutation, got %q", config.GenCodePrefix)
	}

	content := mustReadAppGeneratedPythonCode(t, cfg)
	if !strings.Contains(content, "import math") {
		t.Fatalf("expected generated python file to include prefix, got %q", content)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetGenCodePrefixOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustEnableAppSavedPythonCodegen(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_prefix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"genCodePrefix":   "import random\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_gen_code_prefix: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_gen_code_prefix success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app set_gen_code_prefix: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after temp-id app set_gen_code_prefix: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after temp-id app set_gen_code_prefix")
	}
	if config.GenCodePrefix != "import random\n" {
		t.Fatalf("expected persisted gen code prefix after temp-id app mutation, got %q", config.GenCodePrefix)
	}

	content := mustReadAppGeneratedPythonCode(t, cfg)
	if !strings.Contains(content, "import random") {
		t.Fatalf("expected generated python file to include temp-id prefix, got %q", content)
	}
}

func TestAppIDEMCPServerSupportsSetGenCodeSuffixOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustEnableAppSavedPythonCodegen(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_suffix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"genCodeSuffix":   "state = CustomState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call set_gen_code_suffix: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_gen_code_suffix success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app set_gen_code_suffix: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after app set_gen_code_suffix: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after app set_gen_code_suffix")
	}
	if config.GenCodeSuffix != "state = CustomState()\n" {
		t.Fatalf("expected persisted gen code suffix after app mutation, got %q", config.GenCodeSuffix)
	}

	content := mustReadAppGeneratedPythonCode(t, cfg)
	if !strings.Contains(content, "state = CustomState()") {
		t.Fatalf("expected generated python file to include suffix, got %q", content)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForSetGenCodeSuffixOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	mustEnableAppSavedPythonCodegen(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha": "11",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_gen_code_suffix",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"genCodeSuffix":   "state = RuntimeState()\n",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id set_gen_code_suffix: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id set_gen_code_suffix success, got %#v", result.StructuredContent)
	}

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app set_gen_code_suffix: %v", err)
	}
	config, ok, err := project.PythonCodegenTarget()
	if err != nil {
		t.Fatalf("decode python target after temp-id app set_gen_code_suffix: %v", err)
	}
	if !ok {
		t.Fatal("expected python target after temp-id app set_gen_code_suffix")
	}
	if config.GenCodeSuffix != "state = RuntimeState()\n" {
		t.Fatalf("expected persisted gen code suffix after temp-id app mutation, got %q", config.GenCodeSuffix)
	}

	content := mustReadAppGeneratedPythonCode(t, cfg)
	if !strings.Contains(content, "state = RuntimeState()") {
		t.Fatalf("expected generated python file to include temp-id suffix, got %q", content)
	}
}

func TestAppIDEMCPServerSupportsTogglePositionLocksOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before app toggle_position_locks: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
		if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected allowed-section to start unlocked")
		}
	}
	if len(project.Sections["blocked-section"].SharedModifier) != 0 {
		blockedPayload := mustDecodedProjectPayloadValue(t, project.Sections["blocked-section"].SharedModifier)
		if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected blocked-section to start unlocked")
		}
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionIds":      []string{"allowed-section", "blocked-section"},
		},
	})
	if err != nil {
		t.Fatalf("call toggle_position_locks: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected toggle_position_locks success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app toggle_position_locks: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	blockedPayload := mustDecodedProjectPayloadValue(t, project.Sections["blocked-section"].SharedModifier)
	if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected allowed-section to be locked after app mutation")
	}
	if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected blocked-section to be locked after app mutation")
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForTogglePositionLocksOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
		"blocked-section": "16",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id app toggle_position_locks: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
		if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected allowed-section to start unlocked")
		}
	}
	if len(project.Sections["blocked-section"].SharedModifier) != 0 {
		blockedPayload := mustDecodedProjectPayloadValue(t, project.Sections["blocked-section"].SharedModifier)
		if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected blocked-section to start unlocked")
		}
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_position_locks",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionIds":      []string{"14", "16"},
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_position_locks: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_position_locks success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app toggle_position_locks: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	blockedPayload := mustDecodedProjectPayloadValue(t, project.Sections["blocked-section"].SharedModifier)
	if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected allowed-section to be locked after temp-id app mutation")
	}
	if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected blocked-section to be locked after temp-id app mutation")
	}
}

func TestAppIDEMCPServerSupportsToggleMinimizedOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before app toggle_minimized: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
		if minimized, _ := allowedPayload["isMinimized"].(bool); minimized {
			t.Fatal("expected allowed-section to start unminimized")
		}
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"sectionId":       "allowed-section",
		},
	})
	if err != nil {
		t.Fatalf("call toggle_minimized: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected toggle_minimized success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after app toggle_minimized: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if minimized, _ := allowedPayload["isMinimized"].(bool); !minimized {
		t.Fatal("expected allowed-section to be minimized after app mutation")
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForToggleMinimizedOverAuthenticatedStreamableHTTP(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppLSPFixture(t)
	prepareAppCurrentSession(t, cfg)
	saveAppScopedMCPProject(t, cfg)
	writeAppTemporaryIDMap(t, filepath.Join(cfg.Paths.RuntimeRoot, "temporary_id_map.json"), map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	project, err := app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id app toggle_minimized: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
		if minimized, _ := allowedPayload["isMinimized"].(bool); minimized {
			t.Fatal("expected allowed-section to start unminimized")
		}
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.StreamableClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "toggle_minimized",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"sectionId":       "14",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id toggle_minimized: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id toggle_minimized success, got %#v", result.StructuredContent)
	}

	project, err = app.ProjectStates().Main().Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id app toggle_minimized: %v", err)
	}
	allowedPayload := mustDecodedProjectPayloadValue(t, project.Sections["allowed-section"].SharedModifier)
	if minimized, _ := allowedPayload["isMinimized"].(bool); !minimized {
		t.Fatal("expected allowed-section to be minimized after temp-id app mutation")
	}
}
