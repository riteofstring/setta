package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"testing"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/config"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/testutil/firstpartyplugin"

	"github.com/go-chi/chi/v5"
)

func TestMCPToolCallRouteSupportsSetShowParamDisplayNames(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before route mutation")
	}

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
		"tool":"set_show_param_display_names",
		"arguments":{
			"projectConfigId":"project-alpha",
			"showParamDisplayNames":true
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
		t.Fatalf("expected set_show_param_display_names success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after route mutation")
	}
}

func TestMCPToolCallRouteSetShowParamDisplayNamesAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id route show-param toggle: %v", err)
	}
	if project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=false before temp-id route mutation")
	}

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
		"tool":"set_show_param_display_names",
		"arguments":{
			"projectConfigId":"11",
			"showParamDisplayNames":true
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
		t.Fatalf("expected temp-id set_show_param_display_names success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route show-param toggle: %v", err)
	}
	if !project.ShowParamDisplayNames {
		t.Fatal("expected ShowParamDisplayNames=true after temp-id route mutation")
	}
}

func TestMCPToolCallRouteSupportsSetSectionTagColor(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
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
		"tool":"set_section_tag_color",
		"arguments":{
			"projectConfigId":"project-alpha",
			"sectionId":"allowed-section",
			"tagColor":"#123456"
		},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_section_tag_color success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456, got %#v", got)
	}
}

func TestMCPToolCallRouteSetSectionTagColorAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
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
		"tool":"set_section_tag_color",
		"arguments":{
			"projectConfigId":"11",
			"sectionId":"14",
			"tagColor":"#123456"
		},
		"agenticContext":{
			"projectConfigId":"11",
			"chatId":"12",
			"sectionId":"13"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected temp-id set_section_tag_color success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route set_section_tag_color: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["tagColor"]; got != "#123456" {
		t.Fatalf("expected allowed-section tagColor #123456 after temp-id route mutation, got %#v", got)
	}
}

func TestMCPToolCallRouteSupportsSetSectionStyleColor(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
		ContributedToolRegistrations: appDefinitionToolRegistrationsForTest(
			appdefinition.NewAppDefinitionService(projectRuntime, firstpartyplugin.AppSubsystemPluginID),
		),
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
		"tool":"set_section_style_color",
		"arguments":{
			"projectConfigId":"project-alpha",
			"sectionId":"allowed-section",
			"styleColor":"#654321"
		},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_section_style_color success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_style_color: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["styleColor"]; got != "#654321" {
		t.Fatalf("expected allowed-section styleColor #654321, got %#v", got)
	}
}

func TestMCPToolCallRouteSetSectionStyleColorAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"chat-1":          "12",
		"chat-section":    "13",
		"allowed-section": "14",
	})
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		SectionNames:       routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:     diagnostics,
		TemporaryIDMapPath: temporaryIDMapPath,
		ContributedToolRegistrations: appDefinitionToolRegistrationsForTest(
			appdefinition.NewAppDefinitionService(projectRuntime, firstpartyplugin.AppSubsystemPluginID),
		),
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
		"tool":"set_section_style_color",
		"arguments":{
			"projectConfigId":"11",
			"sectionId":"14",
			"styleColor":"#654321"
		},
		"agenticContext":{
			"projectConfigId":"11",
			"chatId":"12",
			"sectionId":"13"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected temp-id set_section_style_color success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route set_section_style_color: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["styleColor"]; got != "#654321" {
		t.Fatalf("expected allowed-section styleColor #654321 after temp-id route mutation, got %#v", got)
	}
}

func TestMCPToolCallRouteSupportsSetSectionParamFilter(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
		ContributedToolRegistrations: appDefinitionToolRegistrationsForTest(
			appdefinition.NewAppDefinitionService(projectRuntime, firstpartyplugin.AppSubsystemPluginID),
		),
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
		"tool":"set_section_param_filter",
		"arguments":{
			"projectConfigId":"project-alpha",
			"sectionId":"allowed-params-section",
			"paramFilter":"   "
		},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_section_param_filter success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_param_filter: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-params-section"].SharedModifier)
	if got := allowedPayload["paramFilter"]; got != "   " {
		t.Fatalf("expected allowed-params-section raw paramFilter whitespace, got %#v", got)
	}
}

func TestMCPToolCallRouteSetSectionParamFilterAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-params-section": "20",
	})
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		SectionNames:       routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:     diagnostics,
		TemporaryIDMapPath: temporaryIDMapPath,
		ContributedToolRegistrations: appDefinitionToolRegistrationsForTest(
			appdefinition.NewAppDefinitionService(projectRuntime, firstpartyplugin.AppSubsystemPluginID),
		),
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
		"tool":"set_section_param_filter",
		"arguments":{
			"projectConfigId":"11",
			"sectionId":"20",
			"paramFilter":"   "
		},
		"agenticContext":{
			"projectConfigId":"11",
			"chatId":"12",
			"sectionId":"13"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected temp-id set_section_param_filter success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route set_section_param_filter: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-params-section"].SharedModifier)
	if got := allowedPayload["paramFilter"]; got != "   " {
		t.Fatalf("expected allowed-params-section raw paramFilter whitespace after temp-id route mutation, got %#v", got)
	}
}

func TestMCPToolCallRouteSupportsSetMetaControlShowSectionTitle(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	mustAddRouteMetaControlSections(t, projectRuntime)

	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
		ContributedToolRegistrations: appDefinitionToolRegistrationsForTest(
			appdefinition.NewAppDefinitionService(projectRuntime, firstpartyplugin.AppSubsystemPluginID),
		),
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
		"tool":"set_meta_control_show_section_title",
		"arguments":{
			"projectConfigId":"project-alpha",
			"sectionId":"allowed-meta-section",
			"showSectionTitle":true
		},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_meta_control_show_section_title success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_meta_control_show_section_title: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-meta-section"].SharedModifier)
	if got := allowedPayload["showSectionTitle"]; got != true {
		t.Fatalf("expected allowed-meta-section showSectionTitle=true, got %#v", got)
	}
}

func TestMCPToolCallRouteSetMetaControlShowSectionTitleAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	mustAddRouteMetaControlSections(t, projectRuntime)

	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha":        "11",
		"chat-1":               "12",
		"chat-section":         "13",
		"allowed-meta-section": "24",
	})
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
		SectionNames:       routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:     diagnostics,
		TemporaryIDMapPath: temporaryIDMapPath,
		ContributedToolRegistrations: appDefinitionToolRegistrationsForTest(
			appdefinition.NewAppDefinitionService(projectRuntime, firstpartyplugin.AppSubsystemPluginID),
		),
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
		"tool":"set_meta_control_show_section_title",
		"arguments":{
			"projectConfigId":"11",
			"sectionId":"24",
			"showSectionTitle":true
		},
		"agenticContext":{
			"projectConfigId":"11",
			"chatId":"12",
			"sectionId":"13"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected temp-id set_meta_control_show_section_title success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route set_meta_control_show_section_title: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-meta-section"].SharedModifier)
	if got := allowedPayload["showSectionTitle"]; got != true {
		t.Fatalf("expected allowed-meta-section showSectionTitle=true after temp-id route mutation, got %#v", got)
	}
}

func TestMCPToolCallRouteSupportsTogglePositionLocks(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route toggle_position_locks: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
		if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected allowed-section to start unlocked")
		}
	}
	if len(project.Sections["blocked-section"].SharedModifier) != 0 {
		blockedPayload := mustDecodedRouteProjectPayload(t, project.Sections["blocked-section"].SharedModifier)
		if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected blocked-section to start unlocked")
		}
	}

	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
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
		"tool":"toggle_position_locks",
		"arguments":{
			"projectConfigId":"project-alpha",
			"sectionIds":["allowed-section","blocked-section"]
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
		t.Fatalf("expected toggle_position_locks success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route toggle_position_locks: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	blockedPayload := mustDecodedRouteProjectPayload(t, project.Sections["blocked-section"].SharedModifier)
	if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected allowed-section to be locked after route mutation")
	}
	if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected blocked-section to be locked after route mutation")
	}
}

func TestMCPToolCallRouteTogglePositionLocksAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id route toggle_position_locks: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
		if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected allowed-section to start unlocked")
		}
	}
	if len(project.Sections["blocked-section"].SharedModifier) != 0 {
		blockedPayload := mustDecodedRouteProjectPayload(t, project.Sections["blocked-section"].SharedModifier)
		if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); locked {
			t.Fatal("expected blocked-section to start unlocked")
		}
	}

	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
		"blocked-section": "16",
	})
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:      t.TempDir(),
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

	response := postMCPToolRoute(t, handler, `{
		"tool":"toggle_position_locks",
		"arguments":{
			"projectConfigId":"11",
			"sectionIds":["14","16"]
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
		t.Fatalf("expected temp-id toggle_position_locks success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route toggle_position_locks: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	blockedPayload := mustDecodedRouteProjectPayload(t, project.Sections["blocked-section"].SharedModifier)
	if locked, _ := allowedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected allowed-section to be locked after temp-id route mutation")
	}
	if locked, _ := blockedPayload["positionAndSizeLocked"].(bool); !locked {
		t.Fatal("expected blocked-section to be locked after temp-id route mutation")
	}
}

func TestMCPToolCallRouteSupportsToggleMinimized(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route toggle_minimized: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
		if minimized, _ := allowedPayload["isMinimized"].(bool); minimized {
			t.Fatal("expected allowed-section to start unminimized")
		}
	}

	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
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
		"tool":"toggle_minimized",
		"arguments":{
			"projectConfigId":"project-alpha",
			"sectionId":"allowed-section"
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
		t.Fatalf("expected toggle_minimized success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route toggle_minimized: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if minimized, _ := allowedPayload["isMinimized"].(bool); !minimized {
		t.Fatal("expected allowed-section to be minimized after route mutation")
	}
}

func TestMCPToolCallRouteToggleMinimizedAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id route toggle_minimized: %v", err)
	}
	if len(project.Sections["allowed-section"].SharedModifier) != 0 {
		allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
		if minimized, _ := allowedPayload["isMinimized"].(bool); minimized {
			t.Fatal("expected allowed-section to start unminimized")
		}
	}

	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:      t.TempDir(),
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

	response := postMCPToolRoute(t, handler, `{
		"tool":"toggle_minimized",
		"arguments":{
			"projectConfigId":"11",
			"sectionId":"14"
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
		t.Fatalf("expected temp-id toggle_minimized success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route toggle_minimized: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if minimized, _ := allowedPayload["isMinimized"].(bool); !minimized {
		t.Fatal("expected allowed-section to be minimized after temp-id route mutation")
	}
}

func TestMCPToolCallRouteSupportsToggleGroupOrientation(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	mustAddRouteGroupSection(t, projectRuntime)
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route toggle_group_orientation: %v", err)
	}
	groupPayload := mustDecodedRouteProjectPayload(t, project.SectionImpls["group-impl"].Payload)
	if horizontal, _ := groupPayload["isHorizontalOrientation"].(bool); horizontal {
		t.Fatal("expected group-section to start vertical")
	}

	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
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
		"tool":"toggle_group_orientation",
		"arguments":{
			"projectConfigId":"project-alpha",
			"sectionId":"group-section"
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
		t.Fatalf("expected toggle_group_orientation success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route toggle_group_orientation: %v", err)
	}
	groupPayload = mustDecodedRouteProjectPayload(t, project.Sections["group-section"].SharedModifier)
	if horizontal, _ := groupPayload["isHorizontalOrientation"].(bool); !horizontal {
		t.Fatal("expected group-section to be horizontal after route mutation")
	}
}

func TestMCPToolCallRouteSetGroupOverflowModeAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	mustAddRouteGroupSection(t, projectRuntime)

	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha": "11",
		"group-section": "41",
	})
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:      t.TempDir(),
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

	response := postMCPToolRoute(t, handler, `{
		"tool":"set_group_overflow_mode",
		"arguments":{
			"projectConfigId":"11",
			"sectionId":"41",
			"overflowMode":true
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
		t.Fatalf("expected temp-id set_group_overflow_mode success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route set_group_overflow_mode: %v", err)
	}
	groupPayload := mustDecodedRouteProjectPayload(t, project.Sections["group-section"].SharedModifier)
	if overflow, _ := groupPayload["overflowMode"].(bool); !overflow {
		t.Fatal("expected group-section overflowMode=true after temp-id route mutation")
	}
}
