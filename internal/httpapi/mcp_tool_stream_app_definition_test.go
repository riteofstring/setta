package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/mcpx"
	"setta/internal/modes"
	appdefinition "setta/plugins/setta-json-render-app-gen/backend/appdefinition"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

func TestMCPToolCallRouteSupportsStreamAppDefinition(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedMCPToolRouteAppDefinitionRuntime(t)
	setTestAppDefinition(t, projectRuntime, appdefinition.SetInput{
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

	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server := newAppDefinitionToolRouteServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		LSPDiagnostics: diagnostics,
	})

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := RegisterMCPRootRoutes(r, MCPRootRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Server:     server,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := postMCPToolRoute(t, handler, `{
		"tool":"stream_app_definition",
		"arguments":{
			"projectConfigId":"project-alpha",
			"patches":"{\"op\":\"replace\",\"path\":\"/elements/root/props/gap\",\"value\":12}"
		},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"allowUnscoped":true
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected stream_app_definition success, got %#v", payload.StructuredContent)
	}

	result := mustStructuredMapForRoute(t, payload.StructuredContent)
	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, result["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", result["appSpec"], storedSpec)
	}
}

func TestMCPToolCallRouteStreamAppDefinitionAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	root, projectRuntime := openPersistedMCPToolRouteAppDefinitionRuntime(t)
	setTestAppDefinition(t, projectRuntime, appdefinition.SetInput{
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

	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
	})
	server := newAppDefinitionToolRouteServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		LSPDiagnostics:     diagnostics,
		TemporaryIDMapPath: temporaryIDMapPath,
	})

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := RegisterMCPRootRoutes(r, MCPRootRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Server:     server,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := postMCPToolRoute(t, handler, `{
		"tool":"stream_app_definition",
		"arguments":{
			"projectConfigId":"11",
			"patches":"{\"op\":\"replace\",\"path\":\"/elements/root/props/gap\",\"value\":12}"
		},
		"agenticContext":{
			"projectConfigId":"11",
			"allowUnscoped":true
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected temp-id stream_app_definition success, got %#v", payload.StructuredContent)
	}

	result := mustStructuredMapForRoute(t, payload.StructuredContent)
	storedSpec, err := appspec.Read(root, appspec.DefaultPath())
	if err != nil {
		t.Fatalf("read stored app spec: %v", err)
	}
	if !reflect.DeepEqual(storedSpec, result["appSpec"]) {
		t.Fatalf("expected stored app spec %#v, got %#v", result["appSpec"], storedSpec)
	}
}
