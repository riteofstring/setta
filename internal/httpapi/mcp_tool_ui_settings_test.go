package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/mcpx"
	"setta/internal/modes"
)

func TestMCPToolCallRouteSupportsUISettingSearchReadWrite(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
	})
	if err != nil {
		t.Fatalf("new mcp server: %v", err)
	}

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

	searchResponse := postMCPToolRoute(t, handler, `{
		"tool":"search_ui_settings",
		"arguments":{"projectConfigId":"project-alpha","query":"watch toggle","limit":3,"sourceFilter":"core"},
		"agenticContext":{"projectConfigId":"project-alpha","allowUnscoped":true}
	}`)
	if searchResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", searchResponse.Code, searchResponse.Body.String())
	}
	searchPayload := decodeCallToolRouteResult(t, searchResponse.Body.Bytes())
	if searchPayload.IsError {
		t.Fatalf("expected search_ui_settings success, got %#v", searchPayload.StructuredContent)
	}
	searchResult := mustStructuredMapForRoute(t, searchPayload.StructuredContent)
	searchResults := mustStructuredListForRoute(t, searchResult["results"])
	if len(searchResults) == 0 || mustStructuredMapForRoute(t, searchResults[0])["settingId"] != "core.watch_code.enabled" {
		t.Fatalf("expected ranked core watch-code result, got %#v", searchResults)
	}

	getResponse := postMCPToolRoute(t, handler, `{
		"tool":"get_ui_setting_value",
		"arguments":{"projectConfigId":"project-alpha","settingId":"core.app.spec_path"},
		"agenticContext":{"projectConfigId":"project-alpha","allowUnscoped":true}
	}`)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", getResponse.Code, getResponse.Body.String())
	}
	getPayload := decodeCallToolRouteResult(t, getResponse.Body.Bytes())
	if getPayload.IsError {
		t.Fatalf("expected get_ui_setting_value success, got %#v", getPayload.StructuredContent)
	}
	getResult := mustStructuredMapForRoute(t, getPayload.StructuredContent)
	if getResult["value"] != "app_specs/app.json" {
		t.Fatalf("expected default app spec path, got %#v", getResult["value"])
	}

	setResponse := postMCPToolRoute(t, handler, `{
		"tool":"set_ui_setting_value",
		"arguments":{"projectConfigId":"project-alpha","settingId":"core.project.show_param_display_names","value":true},
		"agenticContext":{"projectConfigId":"project-alpha","allowUnscoped":true}
	}`)
	if setResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", setResponse.Code, setResponse.Body.String())
	}
	setPayload := decodeCallToolRouteResult(t, setResponse.Body.Bytes())
	if setPayload.IsError {
		t.Fatalf("expected set_ui_setting_value success, got %#v", setPayload.StructuredContent)
	}
	setResult := mustStructuredMapForRoute(t, setPayload.StructuredContent)
	if setResult["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", setResult["changed"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_ui_setting_value: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected route set_ui_setting_value to persist showParamDisplayNames")
	}
}

func TestMCPToolCallRouteUISettingReadWriteAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"chat-1":        "12",
		"chat-section":  "13",
	})

	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:      workspaceRoot,
		ProjectState:       projectRuntime,
		SectionNames:       routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:     diagnostics,
		TemporaryIDMapPath: temporaryIDMapPath,
	})
	if err != nil {
		t.Fatalf("new mcp server: %v", err)
	}

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

	getResponse := postMCPToolRoute(t, handler, `{
		"tool":"get_ui_setting_value",
		"arguments":{"projectConfigId":"11","settingId":"core.project.show_param_display_names"},
		"agenticContext":{"projectConfigId":"11","allowUnscoped":true}
	}`)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", getResponse.Code, getResponse.Body.String())
	}
	getPayload := decodeCallToolRouteResult(t, getResponse.Body.Bytes())
	if getPayload.IsError {
		t.Fatalf("expected temporary get_ui_setting_value success, got %#v", getPayload.StructuredContent)
	}

	setResponse := postMCPToolRoute(t, handler, `{
		"tool":"set_ui_setting_value",
		"arguments":{"projectConfigId":"11","settingId":"core.project.show_param_display_names","value":true},
		"agenticContext":{"projectConfigId":"11","allowUnscoped":true}
	}`)
	if setResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", setResponse.Code, setResponse.Body.String())
	}
	setPayload := decodeCallToolRouteResult(t, setResponse.Body.Bytes())
	if setPayload.IsError {
		t.Fatalf("expected temporary set_ui_setting_value success, got %#v", setPayload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temporary route write: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected temporary-id route write to persist to canonical project")
	}
}
