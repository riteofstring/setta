package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/realtime"
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

func newUISettingsRouteTestServer(t *testing.T, projectRuntime *projectstate.Runtime, options mcpx.ServerOptions) *mcpx.Server {
	t.Helper()

	if projectRuntime != nil && options.PluginMutations == nil {
		workspaceRoot := strings.TrimSpace(options.WorkspaceRoot)
		if workspaceRoot == "" {
			workspaceRoot = t.TempDir()
			options.WorkspaceRoot = workspaceRoot
		}
		options.PluginMutations = &routeWatchCodeBackendUISettingPluginMutationProvider{
			runtime:       projectRuntime,
			workspaceRoot: workspaceRoot,
			pluginID:      "setta-fixture-watch-code-provider",
		}
	}
	server, err := mcpx.NewServer(options)
	if err != nil {
		t.Fatalf("new mcp server: %v", err)
	}
	return server
}

type routeWatchCodeBackendUISettingPluginMutationProvider struct {
	runtime       *projectstate.Runtime
	workspaceRoot string
	pluginID      string
}

func (p *routeWatchCodeBackendUISettingPluginMutationProvider) Runtime(plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error) {
	capabilities := []string{"registerUISettings"}
	return plugins.PluginRuntimeResponse{
		List: plugins.PluginListResponse{
			Plugins: []plugins.PluginListEntry{
				{
					PluginID:              p.pluginID,
					Name:                  "Watch Code Backend UI Settings",
					EffectiveCapabilities: capabilities,
				},
			},
		},
		Status: plugins.PluginStatusResponse{
			Plugins: []plugins.PluginStatusEntry{
				{
					PluginID:              p.pluginID,
					State:                 plugins.PluginRuntimeStateActive,
					EffectiveCapabilities: capabilities,
				},
			},
		},
	}, nil
}

func (p *routeWatchCodeBackendUISettingPluginMutationProvider) Rescan() (plugins.DiscoverySnapshot, error) {
	return plugins.DiscoverySnapshot{}, nil
}

func (p *routeWatchCodeBackendUISettingPluginMutationProvider) Install(context.Context, plugins.InstallOptions) (plugins.PluginInstallResponse, error) {
	return plugins.PluginInstallResponse{}, fmt.Errorf("plugin install is unavailable in this test provider")
}

func (p *routeWatchCodeBackendUISettingPluginMutationProvider) Uninstall(context.Context, plugins.UninstallOptions) (plugins.PluginUninstallResponse, error) {
	return plugins.PluginUninstallResponse{}, fmt.Errorf("plugin uninstall is unavailable in this test provider")
}

func (p *routeWatchCodeBackendUISettingPluginMutationProvider) Update(context.Context, plugins.UpdateOptions) (plugins.PluginUpdateResponse, error) {
	return plugins.PluginUpdateResponse{}, fmt.Errorf("plugin update is unavailable in this test provider")
}

func (p *routeWatchCodeBackendUISettingPluginMutationProvider) Rollback(context.Context, plugins.RollbackOptions) (plugins.PluginRollbackResponse, error) {
	return plugins.PluginRollbackResponse{}, fmt.Errorf("plugin rollback is unavailable in this test provider")
}

func (p *routeWatchCodeBackendUISettingPluginMutationProvider) WriteConfig(context.Context, plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResponse, error) {
	return plugins.PluginConfigWriteResponse{}, fmt.Errorf("plugin config writes are unavailable in this test provider")
}

func (p *routeWatchCodeBackendUISettingPluginMutationProvider) GetBackendUISettings(pluginID string) ([]plugins.PluginRegisteredUISetting, error) {
	if strings.TrimSpace(pluginID) != p.pluginID {
		return nil, fmt.Errorf("plugin %q is not active", pluginID)
	}
	writeHandlerID := "write_enabled"
	return []plugins.PluginRegisteredUISetting{
		{
			PluginID:       p.pluginID,
			LocalSettingID: "enabled",
			Title:          "Watch Code Enabled",
			Description:    "Enable or disable Watch Code for the project.",
			Synonyms:       []string{"watch code", "watch mode", "watch toggle"},
			PaneID:         "left",
			RevealKey:      "watch-code-settings",
			Mutability:     string(uisettings.MutabilityWritable),
			ValueSchema: map[string]any{
				"type": "boolean",
			},
			ReadHandlerID:  "read_enabled",
			WriteHandlerID: &writeHandlerID,
		},
	}, nil
}

func (p *routeWatchCodeBackendUISettingPluginMutationProvider) ReadBackendUISettingValue(_ context.Context, options plugins.BackendUISettingReadOptions) (any, error) {
	if strings.TrimSpace(options.PluginID) != p.pluginID {
		return nil, fmt.Errorf("plugin %q is not active", options.PluginID)
	}
	if strings.TrimSpace(options.HandlerID) != "read_enabled" {
		return nil, fmt.Errorf("unsupported watch code read handler %q", options.HandlerID)
	}
	document := p.runtime.Snapshot().Document
	project, err := document.ProjectByID(options.ProjectConfigID)
	if err != nil {
		return nil, err
	}
	projectData, _, err := document.WatchCodePluginProjectData(p.pluginID, project.ID)
	if err != nil {
		return nil, err
	}
	return projectData.Enabled, nil
}

func (p *routeWatchCodeBackendUISettingPluginMutationProvider) WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error {
	if strings.TrimSpace(options.PluginID) != p.pluginID {
		return fmt.Errorf("plugin %q is not active", options.PluginID)
	}
	if strings.TrimSpace(options.HandlerID) != "write_enabled" {
		return fmt.Errorf("unsupported watch code write handler %q", options.HandlerID)
	}
	enabled, ok := options.Value.(bool)
	if !ok {
		return fmt.Errorf("watch code enabled value must be boolean")
	}
	_, err := p.runtime.SetWatchCodeEnabled(
		ctx,
		p.pluginID,
		options.ProjectConfigID,
		enabled,
		p.workspaceRoot,
	)
	return err
}

func TestMCPToolCallRouteSupportsUISettingSearchReadWrite(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server := newUISettingsRouteTestServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
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

	searchResponse := postMCPToolRoute(t, handler, `{
		"tool":"search_ui_settings",
		"arguments":{"projectConfigId":"project-alpha","query":"watch toggle","limit":3,"sourceFilter":"plugin"},
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
	if len(searchResults) == 0 || mustStructuredMapForRoute(t, searchResults[0])["settingId"] != "plugin::setta-fixture-watch-code-provider::enabled" {
		t.Fatalf("expected ranked plugin watch-code result, got %#v", searchResults)
	}
	if mustStructuredMapForRoute(t, searchResults[0])["source"] != "plugin" {
		t.Fatalf("expected plugin-sourced watch-code result, got %#v", searchResults[0])
	}

	getResponse := postMCPToolRoute(t, handler, `{
		"tool":"get_ui_setting_value",
		"arguments":{"projectConfigId":"project-alpha","settingId":"core.project.name"},
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
	if getResult["value"] != "Alpha" {
		t.Fatalf("expected project name Alpha, got %#v", getResult["value"])
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

func TestMCPToolCallRouteBroadcastsProjectStateAfterUISettingWrite(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	websocketHub := realtime.NewWebsocketHub(realtime.WebsocketHubOptions{})
	server := newUISettingsRouteTestServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
	})

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := RegisterMCPRootRoutes(r, MCPRootRouteDependencies{
				ModePolicy:   modes.NewPolicy(config.ModeIDE),
				Server:       server,
				ProjectState: projectRuntime,
				WebsocketHub: websocketHub,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	websocketServer := newTranscriptionProfileRouteTestWebsocketServer(t, websocketHub)
	defer websocketServer.Close()

	websocketClient := dialTranscriptionProfileRouteTestWebsocketClient(t, websocketServer.URL)
	defer websocketClient.CloseNow()
	waitForTranscriptionProfileRouteTestHubConnection(t, websocketHub, "frontend-a")

	response := postMCPToolRoute(t, handler, `{
		"tool":"set_ui_setting_value",
		"arguments":{"projectConfigId":"project-alpha","settingId":"plugin::setta-fixture-watch-code-provider::enabled","value":true},
		"agenticContext":{"projectConfigId":"project-alpha","allowUnscoped":true}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_ui_setting_value success, got %#v", payload.StructuredContent)
	}

	envelope := readTranscriptionProfileRouteTestEnvelope(t, websocketClient)
	if envelope.MessageType != realtime.MessageTypeUpdateFrontendProjectState {
		t.Fatalf("expected update frontend project state message, got %q", envelope.MessageType)
	}

	var update realtime.ProjectStateUpdateContent
	if err := json.Unmarshal(envelope.Content, &update); err != nil {
		t.Fatalf("decode project state update: %v", err)
	}
	if update.ProjectState.ProjectConfig.ID != "project-alpha" {
		t.Fatalf("expected project-alpha project update, got %q", update.ProjectState.ProjectConfig.ID)
	}
	watchCodeData := mustHTTPWatchCodeProjectData(t, update.ProjectState.PluginData, "setta-fixture-watch-code-provider", "project-alpha")
	if !watchCodeData.Enabled {
		t.Fatal("expected broadcast project state to include watch code plugin enabled=true")
	}
}

func TestMCPToolCallRouteUISettingReadRejectsShareScopeWithoutProjectContext(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server := newUISettingsRouteTestServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
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
		"tool":"get_ui_setting_value",
		"arguments":{"settingId":"core.project.name"},
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

	server := newUISettingsRouteTestServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:      workspaceRoot,
		ProjectState:       projectRuntime,
		SectionNames:       routeSectionNameService{runtime: projectRuntime},
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
	server := newUISettingsRouteTestServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:    workspaceRoot,
		ProjectState:     projectRuntime,
		SectionNames:     routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:   diagnostics,
		UISettingReveals: revealService,
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

func TestMCPToolCallRouteRevealUISettingTrimsFrontendAffinityToken(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	revealService := &routeRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-trimmed-affinity",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}
	server := newUISettingsRouteTestServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:    workspaceRoot,
		ProjectState:     projectRuntime,
		SectionNames:     routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:   diagnostics,
		UISettingReveals: revealService,
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
		"tool":"reveal_ui_setting",
		"arguments":{"projectConfigId":"project-alpha","settingId":"core.project.show_param_display_names"},
		"agenticContext":{"projectConfigId":"project-alpha","shareSessionId":"share-session-1","chatId":"chat-1","sectionId":"chat-section","frontendAffinityToken":"  frontend-token  "}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", payload.StructuredContent)
	}
	if revealService.input.FrontendAffinityToken != "frontend-token" {
		t.Fatalf("expected trimmed frontend affinity token, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestMCPToolCallRouteRevealUISettingIgnoresBlankFrontendAffinityToken(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	revealService := &routeRevealService{
		result: uisettings.RevealResult{
			RequestID:       "request-blank-affinity",
			ProjectConfigID: "project-alpha",
			Statuses: []uisettings.RevealStatus{
				{
					SettingID: "core.project.show_param_display_names",
					Status:    "revealed",
				},
			},
		},
	}
	server := newUISettingsRouteTestServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:    workspaceRoot,
		ProjectState:     projectRuntime,
		SectionNames:     routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:   diagnostics,
		UISettingReveals: revealService,
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
		"tool":"reveal_ui_setting",
		"arguments":{"projectConfigId":"project-alpha","settingId":"core.project.show_param_display_names"},
		"agenticContext":{"projectConfigId":"project-alpha","shareSessionId":"share-session-1","chatId":"chat-1","sectionId":"chat-section","frontendAffinityToken":"   "}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected reveal_ui_setting success, got %#v", payload.StructuredContent)
	}
	if revealService.input.FrontendAffinityToken != "" {
		t.Fatalf("expected blank frontend affinity token to be ignored, got %q", revealService.input.FrontendAffinityToken)
	}
}

func TestMCPToolCallRouteGetUISettingRejectsProjectArgumentMismatch(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server := newUISettingsRouteTestServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
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
		"tool":"get_ui_setting_value",
		"arguments":{"projectConfigId":"project-beta","settingId":"plugin::setta-fixture-watch-code-provider::enabled"},
		"agenticContext":{"projectConfigId":"project-alpha","chatId":"chat-1","sectionId":"chat-section","allowUnscoped":true}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if !payload.IsError {
		t.Fatalf("expected get_ui_setting_value mismatch to fail, got %#v", payload.StructuredContent)
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	if structured["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", structured["code"])
	}
	message, _ := structured["message"].(string)
	if !strings.Contains(message, "projectConfigId argument") || !strings.Contains(message, "does not match agentic context projectConfigId") {
		t.Fatalf("expected project mismatch message, got %#v", structured["message"])
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
	server := newUISettingsRouteTestServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:    workspaceRoot,
		ProjectState:     projectRuntime,
		SectionNames:     routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:   diagnostics,
		UISettingReveals: revealService,
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
	server := newUISettingsRouteTestServer(t, projectRuntime, mcpx.ServerOptions{
		WorkspaceRoot:      workspaceRoot,
		ProjectState:       projectRuntime,
		SectionNames:       routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:     diagnostics,
		TemporaryIDMapPath: temporaryIDMapPath,
		UISettingReveals:   revealService,
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
