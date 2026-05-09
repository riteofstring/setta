package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/agentprofiles"
	"setta/internal/config"
	"setta/internal/mcpx"
	"setta/internal/modes"

	"github.com/go-chi/chi/v5"
)

func TestMCPToolCallRouteSupportsStructuralCreateWithUnscopedContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
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
		"tool":"create_top_level_section",
		"arguments":{"projectConfigId":"project-alpha","implType":"Dict"},
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
		t.Fatalf("expected structural create success, got %#v", payload.StructuredContent)
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	sectionID, ok := structured["sectionId"].(string)
	if !ok || strings.TrimSpace(sectionID) == "" {
		t.Fatalf("expected created section id, got %#v", structured["sectionId"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route structural create: %v", err)
	}
	if _, ok := project.Sections[sectionID]; !ok {
		t.Fatalf("expected created section %q in project, got %#v", sectionID, project.Sections)
	}
}

func TestMCPToolCallRouteSupportsStructuralChildCreateWithUnscopedContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
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
		"tool":"create_child_sections",
		"arguments":{"projectConfigId":"project-alpha","parentId":"allowed-section","implType":"Terminal","numChildren":1},
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
		t.Fatalf("expected structural child create success, got %#v", payload.StructuredContent)
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	sectionIDs := mustStringListForRoute(t, structured["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one created child id, got %#v", sectionIDs)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route structural child create: %v", err)
	}
	createdSection, ok := project.Sections[sectionIDs[0]]
	if !ok {
		t.Fatalf("expected created child section %q in project, got %#v", sectionIDs[0], project.Sections)
	}
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created child parent allowed-section, got %#v", createdSection)
	}

	parentPayload := mustDecodedRouteProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	children := mustStringListForRoute(t, parentPayload["children"])
	if len(children) != 1 || children[0] != sectionIDs[0] {
		t.Fatalf("expected allowed-section children [%q], got %#v", sectionIDs[0], children)
	}
}

func TestMCPToolCallRouteSupportsSetCodeSectionAttachedTerminal(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	terminalSectionID := mustSeedRouteTopLevelTerminal(t, projectRuntime)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
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
		"tool":"set_code_section_attached_terminal",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","terminalSectionId":"`+terminalSectionID+`"},
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
		t.Fatalf("expected set_code_section_attached_terminal success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_code_section_attached_terminal: %v", err)
	}
	_, _, codeImpl, err := project.ResolveSection("allowed-section")
	if err != nil {
		t.Fatalf("resolve allowed section after route attach: %v", err)
	}
	if codeImpl.Code.AttachedTerminalSectionID != terminalSectionID {
		t.Fatalf("expected attached terminal %q after route mutation, got %q", terminalSectionID, codeImpl.Code.AttachedTerminalSectionID)
	}
}

func TestMCPToolCallRouteSetCodeSectionAttachedTerminalAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	terminalSectionID := mustSeedRouteTopLevelTerminal(t, projectRuntime)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
		terminalSectionID: "91",
	})
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
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
		"tool":"set_code_section_attached_terminal",
		"arguments":{"projectConfigId":"11","sectionId":"14","terminalSectionId":"91"},
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
		t.Fatalf("expected temp-id set_code_section_attached_terminal success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route set_code_section_attached_terminal: %v", err)
	}
	_, _, codeImpl, err := project.ResolveSection("allowed-section")
	if err != nil {
		t.Fatalf("resolve allowed section after temp-id route attach: %v", err)
	}
	if codeImpl.Code.AttachedTerminalSectionID != terminalSectionID {
		t.Fatalf("expected attached terminal %q after temp-id route mutation, got %q", terminalSectionID, codeImpl.Code.AttachedTerminalSectionID)
	}
}

func TestMCPToolCallRouteSupportsSetSectionSizes(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
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
		"tool":"set_section_sizes",
		"arguments":{"projectConfigId":"project-alpha","sectionSizes":{"allowed-section":{"width":480,"height":220}}},
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
		t.Fatalf("expected set_section_sizes success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_sizes: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	size := mustStructuredMapForRoute(t, allowedPayload["size"])
	if size["width"] != float64(480) || size["height"] != float64(220) {
		t.Fatalf("expected allowed-section size {480 220}, got %#v", size)
	}
}

func TestMCPToolCallRouteSetSectionSizesAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha":   "11",
		"allowed-section": "14",
	})
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:      t.TempDir(),
		ProjectState:       projectRuntime,
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
		"tool":"set_section_sizes",
		"arguments":{"projectConfigId":"11","sectionSizes":{"14":{"width":510,"height":240}}},
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
		t.Fatalf("expected temp-id set_section_sizes success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route set_section_sizes: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	size := mustStructuredMapForRoute(t, allowedPayload["size"])
	if size["width"] != float64(510) || size["height"] != float64(240) {
		t.Fatalf("expected allowed-section size {510 240} after temp-id route mutation, got %#v", size)
	}
}

func TestMCPToolCallRouteSupportsIncrementerStructuralChildCreateWithUnscopedContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
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
		"tool":"create_child_sections_via_incrementer",
		"arguments":{"projectConfigId":"project-alpha","calledBy":"allowed-section","implType":"Terminal","numChildren":1},
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
		t.Fatalf("expected incrementer structural child create success, got %#v", payload.StructuredContent)
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	sectionIDs := mustStringListForRoute(t, structured["sectionIds"])
	if len(sectionIDs) != 1 || strings.TrimSpace(sectionIDs[0]) == "" {
		t.Fatalf("expected one created incrementer child id, got %#v", sectionIDs)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route incrementer child create: %v", err)
	}
	createdSection, ok := project.Sections[sectionIDs[0]]
	if !ok {
		t.Fatalf("expected created incrementer child section %q in project, got %#v", sectionIDs[0], project.Sections)
	}
	if createdSection.ParentSectionID != "allowed-section" {
		t.Fatalf("expected created incrementer child parent allowed-section, got %#v", createdSection)
	}

	parentPayload := mustDecodedRouteProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	children := mustStringListForRoute(t, parentPayload["children"])
	if len(children) != 1 || children[0] != sectionIDs[0] {
		t.Fatalf("expected allowed-section children [%q], got %#v", sectionIDs[0], children)
	}
}

func TestMCPToolCallRouteSupportsSectionVariantCreateWithUnscopedContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
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

	beforeProject, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route variant create: %v", err)
	}
	beforeVariantIDs := append([]string(nil), beforeProject.Sections["allowed-params-section"].VariantIDs...)

	response := postMCPToolRoute(t, handler, `{
		"tool":"create_new_section_variant",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section"},
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
		t.Fatalf("expected section variant create success, got %#v", payload.StructuredContent)
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	variantID, ok := structured["variantId"].(string)
	if !ok || strings.TrimSpace(variantID) == "" {
		t.Fatalf("expected created variant id, got %#v", structured["variantId"])
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route variant create: %v", err)
	}
	afterVariantIDs := project.Sections["allowed-params-section"].VariantIDs
	if len(afterVariantIDs) != len(beforeVariantIDs)+1 {
		t.Fatalf("expected one new section variant, got before=%#v after=%#v", beforeVariantIDs, afterVariantIDs)
	}
	if got := project.SectionVariantMap["allowed-params-section"]; got != variantID {
		t.Fatalf("expected active allowed-params-section variant %q, got %q", variantID, got)
	}
	if _, ok := project.SectionVariants[variantID]; !ok {
		t.Fatalf("expected created variant %q in project, got %#v", variantID, project.SectionVariants)
	}
	if len(project.CodeObjs["allowed-param"].VariantIDs) != 2 {
		t.Fatalf("expected allowed-param to gain one code-object variant, got %#v", project.CodeObjs["allowed-param"].VariantIDs)
	}
}

func TestMCPToolCallRouteSupportsStructuralDeleteWithUnscopedContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
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
		"tool":"delete_sections",
		"arguments":{"projectConfigId":"project-alpha","sectionIds":["allowed-params-section"]},
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
		t.Fatalf("expected structural delete success, got %#v", payload.StructuredContent)
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	sectionIDs := mustStringListForRoute(t, structured["sectionIds"])
	if len(sectionIDs) != 1 || sectionIDs[0] != "allowed-params-section" {
		t.Fatalf("expected deleted section ids [allowed-params-section], got %#v", sectionIDs)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route delete: %v", err)
	}
	if _, ok := project.Sections["allowed-params-section"]; ok {
		t.Fatalf("expected allowed-params-section to be removed, got %#v", project.Sections)
	}
	if _, ok := project.CodeObjs["allowed-param"]; ok {
		t.Fatalf("expected allowed-param to be pruned, got %#v", project.CodeObjs)
	}
}

func TestMCPToolCallRouteSupportsDecrementerStructuralDeleteWithUnscopedContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	canonicalChildID := mustSeedRouteChildSection(t, projectRuntime, "allowed-section")
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
		"tool":"delete_child_sections_via_decrementer",
		"arguments":{"projectConfigId":"project-alpha","calledBy":"allowed-section","numChildren":1},
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
		t.Fatalf("expected decrementer structural delete success, got %#v", payload.StructuredContent)
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	sectionIDs := mustStringListForRoute(t, structured["sectionIds"])
	if len(sectionIDs) != 1 || sectionIDs[0] != canonicalChildID {
		t.Fatalf("expected deleted child ids [%s], got %#v", canonicalChildID, sectionIDs)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route decrementer delete: %v", err)
	}
	if _, ok := project.Sections[canonicalChildID]; ok {
		t.Fatalf("expected %q to be removed, got %#v", canonicalChildID, project.Sections)
	}

	parentPayload := mustDecodedRouteProjectPayload(t, project.SectionImpls["allowed-impl"].Payload)
	children := mustStringListForRoute(t, parentPayload["children"])
	if len(children) != 0 {
		t.Fatalf("expected allowed-section children to be empty after decrementer delete, got %#v", children)
	}
}

func TestMCPToolCallRouteBlockedOutsideFullIDE(t *testing.T) {
	t.Parallel()

	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("new mcp server: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "launcher", info: RuntimeInfo{Mode: "launcher"}},
		ModePolicy: modes.NewPolicy(config.ModeLauncher),
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := RegisterMCPRootRoutes(r, MCPRootRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeLauncher),
				Server:     server,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := postMCPToolRoute(t, handler, `{"tool":"list_mcp_tools"}`)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestMCPToolCallRouteSupportsUtilityReadInitTools(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	writeMCPToolRouteDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-listener-examples.md"), "# Examples\n")
	writeMCPToolRouteDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "emit_to_frontend.md"), "# Emit\n")
	writeMCPToolRouteDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-listener-hot-reload.md"), "# Hot Reload\n")
	writeMCPToolRouteDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "setta-realtime-behavior.md"), "# Realtime\n")
	writeMCPToolRouteDocsFile(t, filepath.Join(workspaceRoot, "docs", "reference", "listener-flows.md"), "# Listener Flows\n")

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	statusClient, err := mcpx.NewClient(mcpx.ClientOptions{
		Servers: map[string]mcpx.ServerConfig{
			mcpx.DefaultServerID: {
				Transport: mcpx.TransportStreamableHTTP,
				URL:       "http://127.0.0.1:8000/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("new status client: %v", err)
	}

	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  workspaceRoot,
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
		MCPStatuses:    statusClient,
		DocsRoot:       filepath.Join(workspaceRoot, "docs"),
		PythonPackages: routePythonPackageProvider{
			packages: []string{"Alpha=1.0.0", "beta=2.0.0"},
		},
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
		"tool":"search_mcp_tools",
		"arguments":{"query":"section size settings","limit":2}
	}`)
	if searchResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", searchResponse.Code, searchResponse.Body.String())
	}
	searchPayload := decodeCallToolRouteResult(t, searchResponse.Body.Bytes())
	if searchPayload.IsError {
		t.Fatalf("expected search_mcp_tools success, got %#v", searchPayload.StructuredContent)
	}
	searchResult := mustStructuredMapForRoute(t, searchPayload.StructuredContent)
	searchEntries := mustStructuredListForRoute(t, searchResult["results"])
	if len(searchEntries) == 0 || mustStructuredMapForRoute(t, searchEntries[0])["name"] != "set_section_sizes" {
		t.Fatalf("expected set_section_sizes search result, got %#v", searchEntries)
	}

	statusResponse := postMCPToolRoute(t, handler, `{
		"tool":"get_mcp_server_runtime_status",
		"arguments":{}
	}`)
	if statusResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", statusResponse.Code, statusResponse.Body.String())
	}
	statusPayload := decodeCallToolRouteResult(t, statusResponse.Body.Bytes())
	if statusPayload.IsError {
		t.Fatalf("expected get_mcp_server_runtime_status success, got %#v", statusPayload.StructuredContent)
	}
	statusResult := mustStructuredMapForRoute(t, statusPayload.StructuredContent)
	serverStatuses := mustStructuredListForRoute(t, statusResult["servers"])
	if len(serverStatuses) != 1 || mustStructuredMapForRoute(t, serverStatuses[0])["serverId"] != mcpx.DefaultServerID {
		t.Fatalf("expected one default runtime status, got %#v", serverStatuses)
	}

	projectsResponse := postMCPToolRoute(t, handler, `{
		"tool":"getProjectConfigNamesAndIds",
		"arguments":{}
	}`)
	if projectsResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", projectsResponse.Code, projectsResponse.Body.String())
	}
	projectsPayload := decodeCallToolRouteResult(t, projectsResponse.Body.Bytes())
	if projectsPayload.IsError {
		t.Fatalf("expected getProjectConfigNamesAndIds success, got %#v", projectsPayload.StructuredContent)
	}
	projectsResult := mustStructuredMapForRoute(t, projectsPayload.StructuredContent)
	projectConfigs := mustStructuredListForRoute(t, projectsResult["projectConfigs"])
	if len(projectConfigs) != 1 || mustStructuredMapForRoute(t, projectConfigs[0])["id"] != "project-alpha" {
		t.Fatalf("expected one project-alpha metadata entry, got %#v", projectConfigs)
	}

	packagesResponse := postMCPToolRoute(t, handler, `{
		"tool":"getInstalledPythonPackages",
		"arguments":{}
	}`)
	if packagesResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", packagesResponse.Code, packagesResponse.Body.String())
	}
	packagesPayload := decodeCallToolRouteResult(t, packagesResponse.Body.Bytes())
	if packagesPayload.IsError {
		t.Fatalf("expected getInstalledPythonPackages success, got %#v", packagesPayload.StructuredContent)
	}
	packagesResult := mustStructuredMapForRoute(t, packagesPayload.StructuredContent)
	packages := mustStructuredListForRoute(t, packagesResult["packages"])
	if !reflect.DeepEqual(packages, []any{"Alpha=1.0.0", "beta=2.0.0"}) {
		t.Fatalf("expected installed python package list, got %#v", packages)
	}

	docsResponse := postMCPToolRoute(t, handler, `{
		"tool":"get_setta_docs",
		"arguments":{}
	}`)
	if docsResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", docsResponse.Code, docsResponse.Body.String())
	}
	docsPayload := decodeCallToolRouteResult(t, docsResponse.Body.Bytes())
	if docsPayload.IsError {
		t.Fatalf("expected get_setta_docs success, got %#v", docsPayload.StructuredContent)
	}
	docsResult := mustStructuredMapForRoute(t, docsPayload.StructuredContent)
	docs := mustStructuredListForRoute(t, docsResult["docs"])
	if len(docs) != 4 {
		t.Fatalf("expected four default docs, got %#v", docs)
	}
}

func TestMCPToolCallRouteReturnsStructuredToolErrorsWithHTTP200(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
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

	invalidResponse := postMCPToolRoute(t, handler, `{
		"tool":"search_mcp_tools",
		"arguments":{"query":"   "}
	}`)
	if invalidResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", invalidResponse.Code, invalidResponse.Body.String())
	}
	invalidPayload := decodeCallToolRouteResult(t, invalidResponse.Body.Bytes())
	if !invalidPayload.IsError {
		t.Fatalf("expected blank search_mcp_tools call to fail, got %#v", invalidPayload.StructuredContent)
	}
	invalidStructured := mustStructuredMapForRoute(t, invalidPayload.StructuredContent)
	if invalidStructured["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", invalidStructured["code"])
	}

	internalResponse := postMCPToolRoute(t, handler, `{
		"tool":"getInstalledPythonPackages",
		"arguments":{}
	}`)
	if internalResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", internalResponse.Code, internalResponse.Body.String())
	}
	internalPayload := decodeCallToolRouteResult(t, internalResponse.Body.Bytes())
	if !internalPayload.IsError {
		t.Fatalf("expected getInstalledPythonPackages without runtime to fail, got %#v", internalPayload.StructuredContent)
	}
	internalStructured := mustStructuredMapForRoute(t, internalPayload.StructuredContent)
	if internalStructured["code"] != "internal_error" {
		t.Fatalf("expected internal_error code, got %#v", internalStructured["code"])
	}
}

func TestMCPToolCallRouteSupportsReportCompletionStatus(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
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
		"tool":"report_completion_status",
		"arguments":{
			"taskId":" task-a ",
			"completionIntent":true,
			"requiresVerification":true,
			"checkResults":[
				{"checkName":"pytest","status":"passed","details":"  ok  ","source":"  go test  "}
			]
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
		t.Fatalf("expected report_completion_status success, got %#v", payload.StructuredContent)
	}
	result := mustStructuredMapForRoute(t, payload.StructuredContent)
	if result["taskId"] != "task-a" {
		t.Fatalf("expected trimmed taskId, got %#v", result["taskId"])
	}
	if result["verificationStatus"] != "passed" {
		t.Fatalf("expected passed verificationStatus, got %#v", result["verificationStatus"])
	}
	checkResults := mustStructuredListForRoute(t, result["checkResults"])
	if len(checkResults) != 1 {
		t.Fatalf("expected one check result, got %#v", checkResults)
	}
	firstCheck := mustStructuredMapForRoute(t, checkResults[0])
	if firstCheck["details"] != "ok" {
		t.Fatalf("expected trimmed details, got %#v", firstCheck["details"])
	}
	if firstCheck["source"] != "go test" {
		t.Fatalf("expected trimmed source, got %#v", firstCheck["source"])
	}
}

func TestMCPToolCallRouteSupportsAgentProfileReadTools(t *testing.T) {
	t.Parallel()

	settaFilesRoot := t.TempDir()
	store, err := agentprofiles.NewStore(settaFilesRoot)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	if err := store.Write([]agentprofiles.Profile{
		{
			ID:                          "profile-alpha",
			Name:                        "Alpha",
			Description:                 "Primary profile",
			SystemPrompt:                "You are alpha.",
			EnableBackgroundSummaryFill: true,
			EnableLlmChatTitles:         true,
			ToolAllowlist:               []string{"tool.a"},
		},
		{
			ID:           "profile-beta",
			Name:         "Beta",
			SystemPrompt: "You are beta.",
		},
	}); err != nil {
		t.Fatalf("seed agent profiles: %v", err)
	}

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
		AgentProfiles:  store,
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

	listResponse := postMCPToolRoute(t, handler, `{
		"tool":"list_agent_profiles",
		"arguments":{}
	}`)
	if listResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", listResponse.Code, listResponse.Body.String())
	}
	listPayload := decodeCallToolRouteResult(t, listResponse.Body.Bytes())
	if listPayload.IsError {
		t.Fatalf("expected list_agent_profiles success, got %#v", listPayload.StructuredContent)
	}
	listResult := mustStructuredMapForRoute(t, listPayload.StructuredContent)
	profiles := mustStructuredListForRoute(t, listResult["profiles"])
	if len(profiles) != 2 {
		t.Fatalf("expected two agent profiles, got %#v", profiles)
	}

	getResponse := postMCPToolRoute(t, handler, `{
		"tool":"get_agent_profile",
		"arguments":{"profileId":"profile-alpha"}
	}`)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", getResponse.Code, getResponse.Body.String())
	}
	getPayload := decodeCallToolRouteResult(t, getResponse.Body.Bytes())
	if getPayload.IsError {
		t.Fatalf("expected get_agent_profile success, got %#v", getPayload.StructuredContent)
	}
	profile := mustStructuredMapForRoute(t, getPayload.StructuredContent)
	if profile["name"] != "Alpha" {
		t.Fatalf("expected Alpha profile, got %#v", profile)
	}
}
