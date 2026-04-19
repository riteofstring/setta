package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func TestAppIDEMCPServerSupportsStreamAppDefinitionOverAuthenticatedSSE(t *testing.T) {
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
	setTestAppDefinition(t, app.ProjectStates().Main(), projectstate.SetAppDefinitionInput{
		AppSpec: map[string]any{
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
		},
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "stream_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"patches":         "{\"op\":\"replace\",\"path\":\"/elements/root/props/gap\",\"value\":12}",
		},
	})
	if err != nil {
		t.Fatalf("call stream_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected stream_app_definition success, got %#v", result.StructuredContent)
	}

	storedSpec, err := appspec.Read(cfg.Paths.SettaFilesRoot, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"])) {
		t.Fatalf("expected stored app spec %#v, got %#v", mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"]), storedSpec)
	}
}

func TestAppIDEMCPServerSupportsTemporaryIDsForStreamAppDefinitionOverAuthenticatedSSE(t *testing.T) {
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
	setTestAppDefinition(t, app.ProjectStates().Main(), projectstate.SetAppDefinitionInput{
		AppSpec: map[string]any{
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
		},
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := sdkmcp.NewClient(&sdkmcp.Implementation{Name: "test-client", Version: "0.1.0"}, nil)
	session, err := client.Connect(context.Background(), &sdkmcp.SSEClientTransport{
		Endpoint:   server.URL + "/mcp",
		HTTPClient: mustAuthenticatedMCPHTTPClient(t, app, server.URL),
	}, nil)
	if err != nil {
		t.Fatalf("connect authenticated mcp client: %v", err)
	}
	defer session.Close()

	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "stream_app_definition",
		Meta: sdkmcp.Meta{
			"projectConfigId": "11",
			"allowUnscoped":   true,
		},
		Arguments: map[string]any{
			"projectConfigId": "11",
			"patches":         "{\"op\":\"replace\",\"path\":\"/elements/root/props/gap\",\"value\":12}",
		},
	})
	if err != nil {
		t.Fatalf("call temp-id stream_app_definition: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected temp-id stream_app_definition success, got %#v", result.StructuredContent)
	}

	storedSpec, err := appspec.Read(cfg.Paths.SettaFilesRoot, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"])) {
		t.Fatalf("expected stored app spec %#v, got %#v", mustStructuredMapValue(t, mustStructuredMapValue(t, result.StructuredContent)["appSpec"]), storedSpec)
	}
}

func TestAppIDEMCPToolCallRouteSupportsStreamAppDefinition(t *testing.T) {
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
	setTestAppDefinition(t, app.ProjectStates().Main(), projectstate.SetAppDefinitionInput{
		AppSpec: map[string]any{
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
		},
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	client := mustAuthenticatedMCPHTTPClient(t, app, server.URL)
	response, err := client.Post(
		server.URL+httpapi.RouteMCPToolCall,
		"application/json",
		strings.NewReader(`{
			"tool":"stream_app_definition",
			"arguments":{
				"projectConfigId":"project-alpha",
				"patches":"{\"op\":\"replace\",\"path\":\"/elements/root/props/gap\",\"value\":12}"
			},
			"agenticContext":{
				"projectConfigId":"project-alpha",
				"allowUnscoped":true
			}
		}`),
	)
	if err != nil {
		t.Fatalf("post stream_app_definition tool call route: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var payload struct {
		StructuredContent any  `json:"structuredContent"`
		IsError           bool `json:"isError"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode stream_app_definition tool call response: %v", err)
	}
	if payload.IsError {
		t.Fatalf("expected stream_app_definition success, got %#v", payload.StructuredContent)
	}

	storedSpec, err := appspec.Read(cfg.Paths.SettaFilesRoot, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, mustStructuredMapValue(t, mustStructuredMapValue(t, payload.StructuredContent)["appSpec"])) {
		t.Fatalf("expected stored app spec %#v, got %#v", mustStructuredMapValue(t, mustStructuredMapValue(t, payload.StructuredContent)["appSpec"]), storedSpec)
	}
}
