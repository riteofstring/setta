package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/uisettings"
)

type routeRevealService struct {
	input  uisettings.RevealInput
	result uisettings.RevealResult
	err    error
}

func (s *routeRevealService) Reveal(_ context.Context, input uisettings.RevealInput) (uisettings.RevealResult, error) {
	s.input = input
	return s.result, s.err
}

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

func TestMCPToolCallRouteUISettingReadRejectsShareScopeWithoutProjectContext(t *testing.T) {
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

	response := postMCPToolRoute(t, handler, `{
		"tool":"get_ui_setting_value",
		"arguments":{"settingId":"core.app.spec_path"},
		"agenticContext":{"shareSessionId":"share-session-1","allowUnscoped":true}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if !payload.IsError {
		t.Fatalf("expected scope violation, got %#v", payload.StructuredContent)
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	if structured["code"] != "scope_violation" {
		t.Fatalf("expected scope_violation code, got %#v", structured["code"])
	}
	if structured["reason"] != "missing_context" {
		t.Fatalf("expected missing_context reason, got %#v", structured["reason"])
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

func TestMCPToolCallRouteSupportsRevealUISetting(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	revealService := &routeRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-1",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:    workspaceRoot,
		ProjectState:     projectRuntime,
		SectionNames:     routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:   diagnostics,
		UISettingReveals: revealService,
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

	response := postMCPToolRoute(t, handler, `{
		"tool":"reveal_ui_setting",
		"arguments":{"projectConfigId":"project-alpha","settingId":"core.project.show_param_display_names","sectionIdToActivate":"allowed-callable-section","durationMs":1500},
		"agenticContext":{"projectConfigId":"project-alpha","shareSessionId":"share-session-1","chatId":"chat-1","sectionId":"chat-section","frontendAffinityToken":"frontend-token"}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", payload.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected canonical project id, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected explicit section id to be forwarded, got %q", revealService.input.SectionIDToActivate)
	}
	if revealService.input.FrontendAffinityToken != "frontend-token" {
		t.Fatalf("expected frontend affinity token to be forwarded, got %q", revealService.input.FrontendAffinityToken)
	}
	if revealService.input.ShareSessionID != "share-session-1" {
		t.Fatalf("expected share session id to be forwarded, got %q", revealService.input.ShareSessionID)
	}
}

func TestMCPToolCallRouteSetUISettingValueRevealAfterSetPreservesWriteResult(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	revealService := &routeRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-set-after-reveal",
			ProjectConfigID:    "project-alpha",
			DurationMS:         1500,
			EmittedRevealCount: 1,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "expected reveal failure",
					},
				},
			},
		},
	}
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:    workspaceRoot,
		ProjectState:     projectRuntime,
		SectionNames:     routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:   diagnostics,
		UISettingReveals: revealService,
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

	response := postMCPToolRoute(t, handler, `{
		"tool":"set_ui_setting_value",
		"arguments":{"projectConfigId":"project-alpha","settingId":"core.project.show_param_display_names","value":true,"revealAfterSet":true,"durationMs":1500},
		"agenticContext":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","allowUnscoped":true}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_ui_setting_value revealAfterSet success, got %#v", payload.StructuredContent)
	}

	result := mustStructuredMapForRoute(t, payload.StructuredContent)
	if result["changed"] != true {
		t.Fatalf("expected changed=true, got %#v", result["changed"])
	}
	revealPayload := mustStructuredMapForRoute(t, result["reveal"])
	statuses := mustStructuredListForRoute(t, revealPayload["statuses"])
	if len(statuses) != 1 || mustStructuredMapForRoute(t, statuses[0])["status"] != "failed" {
		t.Fatalf("expected nested failed reveal status, got %#v", statuses)
	}
	if revealService.input.ContextSectionID != "allowed-callable-section" {
		t.Fatalf("expected context section to be forwarded, got %q", revealService.input.ContextSectionID)
	}
	if revealService.input.DurationMS != 1500 {
		t.Fatalf("expected duration 1500, got %d", revealService.input.DurationMS)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after revealAfterSet route write: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected revealAfterSet route write to persist showParamDisplayNames")
	}
}

func TestMCPToolCallRouteRevealUISettingAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha":            "11",
		"chat-section":             "13",
		"allowed-callable-section": "14",
	})
	revealService := &routeRevealService{
		result: uisettings.RevealResult{
			RequestID:          "request-temp",
			ProjectConfigID:    "project-alpha",
			DurationMS:         3000,
			EmittedRevealCount: 0,
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "failed",
					Error: &uisettings.SettingError{
						Code:    uisettings.ErrorCodeMutationFailed,
						Message: "test failure",
					},
				},
			},
		},
	}
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:      workspaceRoot,
		ProjectState:       projectRuntime,
		SectionNames:       routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:     diagnostics,
		TemporaryIDMapPath: temporaryIDMapPath,
		UISettingReveals:   revealService,
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

	response := postMCPToolRoute(t, handler, `{
		"tool":"reveal_ui_setting",
		"arguments":{"projectConfigId":"11","settingId":"core.project.show_param_display_names","sectionIdToActivate":"14"},
		"agenticContext":{"projectConfigId":"11","sectionId":"13","allowUnscoped":true}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected temporary reveal_ui_setting success, got %#v", payload.StructuredContent)
	}

	if revealService.input.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected canonical project id, got %q", revealService.input.ProjectConfigID)
	}
	if revealService.input.SectionIDToActivate != "allowed-callable-section" {
		t.Fatalf("expected canonical section id, got %q", revealService.input.SectionIDToActivate)
	}
	if revealService.input.ContextSectionID != "chat-section" {
		t.Fatalf("expected canonical context section id, got %q", revealService.input.ContextSectionID)
	}
}
