package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/projectstate"

	"github.com/go-chi/chi/v5"
)

type routePythonPackageProvider struct {
	packages []string
}

func (p routePythonPackageProvider) InstalledPackages(context.Context) ([]string, error) {
	return append([]string(nil), p.packages...), nil
}

type routeStateMachineRunProvider struct {
	report                map[string]any
	projectConfigID       string
	childRunID            *string
	machineRunID          *string
	sectionID             *string
	signalName            string
	payload               map[string]any
	shareSessionID        *string
	reportSignalCallCount int
}

func (p *routeStateMachineRunProvider) Disabled() bool {
	return p == nil
}

func (p *routeStateMachineRunProvider) ReportSignal(
	projectConfigID string,
	childRunID *string,
	machineRunID *string,
	sectionID *string,
	signalName string,
	payload map[string]any,
	shareSessionID *string,
) (map[string]any, error) {
	p.reportSignalCallCount++
	p.projectConfigID = projectConfigID
	p.childRunID = childRunID
	p.machineRunID = machineRunID
	p.sectionID = sectionID
	p.signalName = signalName
	p.payload = payload
	p.shareSessionID = shareSessionID
	if p.report != nil {
		return p.report, nil
	}
	return map[string]any{
		"status":                "ok",
		"signalEventId":         "signal-1",
		"machineRunId":          "machine-1",
		"childRunId":            "child-run-1",
		"sourceSectionId":       "chat-section",
		"signalName":            signalName,
		"sourceActivationCount": 0,
	}, nil
}

func TestMCPToolCallRouteScopesCallsFromAgenticContext(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspaceRoot, "example.txt"), []byte("alpha\nbeta\ngamma\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
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

	t.Run("missing context fails closed", func(t *testing.T) {
		response := postMCPToolRoute(t, handler, `{"tool":"read_file_range","arguments":{"path":"example.txt"}}`)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
		}

		payload := decodeCallToolRouteResult(t, response.Body.Bytes())
		if !payload.IsError {
			t.Fatal("expected scoped tool call to fail without agentic context")
		}
		structured := mustStructuredMapForRoute(t, payload.StructuredContent)
		if structured["code"] != "scope_violation" {
			t.Fatalf("expected scope_violation code, got %#v", structured["code"])
		}
		if structured["reason"] != "missing_context" {
			t.Fatalf("expected missing_context reason, got %#v", structured["reason"])
		}
	})

	t.Run("body agentic context enables filtered project summary", func(t *testing.T) {
		response := postMCPToolRoute(t, handler, `{
			"tool":"get_latest_project_state_summary",
			"arguments":{"projectConfigId":"project-alpha"},
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
			t.Fatalf("expected summary success, got %#v", payload.StructuredContent)
		}
		summary := mustStructuredMapForRoute(t, payload.StructuredContent)
		projectConfig := mustStructuredMapForRoute(t, summary["projectConfig"])
		sectionVariantMap := mustStructuredMapForRoute(t, projectConfig["sectionVariantMap"])
		if _, ok := sectionVariantMap["blocked-section"]; ok {
			t.Fatalf("did not expect blocked-section in scoped summary, got %#v", sectionVariantMap)
		}
		if _, ok := sectionVariantMap["blocked-params-section"]; ok {
			t.Fatalf("did not expect blocked-params-section in scoped summary, got %#v", sectionVariantMap)
		}
	})

	t.Run("namespaced tool names are rejected", func(t *testing.T) {
		response := postMCPToolRoute(t, handler, `{"tool":"setta__read_file_range","arguments":{"path":"example.txt"}}`)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
		}
	})

	t.Run("malformed JSON is rejected", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodPost, RouteMCPToolCall, strings.NewReader(`{"tool":"list_mcp_tools"`))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()

		handler.ServeHTTP(response, request)

		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
		}
	})

	t.Run("blank tool names are rejected", func(t *testing.T) {
		response := postMCPToolRoute(t, handler, `{"tool":"   ","arguments":{}}`)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
		}
	})

	t.Run("unknown tools return not found", func(t *testing.T) {
		response := postMCPToolRoute(t, handler, `{"tool":"tool_that_does_not_exist","arguments":{}}`)
		if response.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
		}
	})
}

func TestMCPToolCallRouteRejectsNonObjectArgumentsAtTransportBoundary(t *testing.T) {
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

	for _, testCase := range []struct {
		name string
		body string
	}{
		{
			name: "string_arguments",
			body: `{"tool":"getProjectConfigNamesAndIds","arguments":"nope"}`,
		},
		{
			name: "array_arguments",
			body: `{"tool":"getProjectConfigNamesAndIds","arguments":[]}`,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			response := postMCPToolRoute(t, handler, testCase.body)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode route error payload: %v", err)
			}
			if payload.Error.Code != "invalid_json" {
				t.Fatalf("expected invalid_json code, got %#v", payload.Error.Code)
			}
			if payload.Error.Message != "Invalid JSON payload." {
				t.Fatalf("unexpected route error message %#v", payload.Error.Message)
			}
		})
	}
}

func TestMCPToolCallRouteRejectsLegacyInvokeLinkedChatTool(t *testing.T) {
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

	response := postMCPToolRoute(t, handler, `{"tool":"invoke_linked_chat","arguments":{}}`)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestMCPToolCallRouteScopesCallsFromAgenticContextHeaders(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspaceRoot, "example.txt"), []byte("alpha\nbeta\ngamma\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
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

	request := httptest.NewRequest(http.MethodPost, RouteMCPToolCall, strings.NewReader(`{
		"tool":"get_latest_project_state_summary",
		"arguments":{"projectConfigId":"project-alpha"}
	}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(mcpx.AgenticContextProjectConfigIDHeader, "project-alpha")
	request.Header.Set(mcpx.AgenticContextChatIDHeader, "chat-1")
	request.Header.Set(mcpx.AgenticContextSectionIDHeader, "chat-section")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected summary success, got %#v", payload.StructuredContent)
	}
	summary := mustStructuredMapForRoute(t, payload.StructuredContent)
	projectConfig := mustStructuredMapForRoute(t, summary["projectConfig"])
	sectionVariantMap := mustStructuredMapForRoute(t, projectConfig["sectionVariantMap"])
	if _, ok := sectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in scoped summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-params-section"]; ok {
		t.Fatalf("did not expect blocked-params-section in scoped summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["allowed-section"]; !ok {
		t.Fatalf("expected allowed-section in scoped summary, got %#v", sectionVariantMap)
	}
}

func TestMCPToolCallRouteReportStateMachineSignalUsesBodyRunContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	provider := &routeStateMachineRunProvider{
		report: map[string]any{
			"status":                "ok",
			"signalEventId":         "signal-1",
			"machineRunId":          "machine-1",
			"childRunId":            "child-run-1",
			"sourceSectionId":       "chat-section",
			"signalName":            "merge_decision",
			"sourceActivationCount": 1,
		},
	}
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		SectionNames:     routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:   diagnostics,
		StateMachineRuns: provider,
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
		"tool":"report_state_machine_signal",
		"arguments":{
			"signalName":"merge_decision",
			"sectionId":"chat-section",
			"payload":{"decision":"retry"}
		},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"runId":"child-run-1",
			"allowUnscoped":true
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected report_state_machine_signal success, got %#v", payload.StructuredContent)
	}
	result := mustStructuredMapForRoute(t, payload.StructuredContent)
	if result["status"] != "ok" {
		t.Fatalf("expected ok status, got %#v", result["status"])
	}
	if provider.reportSignalCallCount != 1 {
		t.Fatalf("expected one ReportSignal call, got %d", provider.reportSignalCallCount)
	}
	if provider.projectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha project config id, got %#v", provider.projectConfigID)
	}
	if provider.childRunID == nil || *provider.childRunID != "child-run-1" {
		t.Fatalf("expected child-run-1 child run id, got %#v", provider.childRunID)
	}
	if provider.machineRunID != nil {
		t.Fatalf("expected nil machine run id, got %#v", provider.machineRunID)
	}
	if provider.sectionID == nil || *provider.sectionID != "chat-section" {
		t.Fatalf("expected chat-section source section id, got %#v", provider.sectionID)
	}
	if provider.signalName != "merge_decision" {
		t.Fatalf("expected merge_decision signal name, got %#v", provider.signalName)
	}
	if provider.payload["decision"] != "retry" {
		t.Fatalf("expected retry payload, got %#v", provider.payload)
	}
	if provider.shareSessionID != nil {
		t.Fatalf("expected nil share session id in IDE mode, got %#v", provider.shareSessionID)
	}
}

func TestMCPToolCallRouteReportStateMachineSignalForwardsShareSessionID(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	provider := &routeStateMachineRunProvider{
		report: map[string]any{
			"status":          "ok",
			"machineRunId":    "machine-1",
			"childRunId":      "child-run-1",
			"sourceSectionId": "chat-section",
			"signalName":      "merge_decision",
		},
	}
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		SectionNames:     routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:   diagnostics,
		StateMachineRuns: provider,
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
		"tool":"report_state_machine_signal",
		"arguments":{
			"signalName":"merge_decision",
			"sectionId":"chat-section",
			"payload":{"decision":"retry"}
		},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"runId":"child-run-1",
			"shareSessionId":"share-session-a",
			"allowUnscoped":true
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload := decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected report_state_machine_signal success, got %#v", payload.StructuredContent)
	}
	if provider.shareSessionID == nil || *provider.shareSessionID != "share-session-a" {
		t.Fatalf("expected share-session-a share session id, got %#v", provider.shareSessionID)
	}
}

func TestMCPToolCallRouteReportStateMachineSignalRequiresActiveChildRun(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	provider := &routeStateMachineRunProvider{}
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		SectionNames:     routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:   diagnostics,
		StateMachineRuns: provider,
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
		"tool":"report_state_machine_signal",
		"arguments":{
			"signalName":"merge_decision",
			"sectionId":"chat-section"
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
	if !payload.IsError {
		t.Fatal("expected report_state_machine_signal without runId to fail")
	}
	if provider.reportSignalCallCount != 0 {
		t.Fatalf("expected runtime provider not to be called, got %d calls", provider.reportSignalCallCount)
	}
	result := mustStructuredMapForRoute(t, payload.StructuredContent)
	if result["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", result["code"])
	}
	if result["message"] != "report_state_machine_signal requires an active child run." {
		t.Fatalf("unexpected error message %#v", result["message"])
	}
}

func TestMCPToolCallRouteAcceptsTemporaryIDsInBodyAgenticContext(t *testing.T) {
	t.Parallel()

	workspaceRoot := t.TempDir()
	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	temporaryIDMapPath := filepath.Join(t.TempDir(), "temporary_id_map.json")
	writeRouteTemporaryIDMap(t, temporaryIDMapPath, map[string]string{
		"project-alpha":          "11",
		"chat-1":                 "12",
		"chat-section":           "13",
		"allowed-section":        "14",
		"peer-chat-section":      "15",
		"allowed-variant":        "16",
		"peer-chat-variant":      "17",
		"blocked-section":        "18",
		"allowed-params-section": "20",
		"allowed-params-variant": "21",
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

	response := postMCPToolRoute(t, handler, `{
		"tool":"get_latest_project_state_summary",
		"arguments":{"projectConfigId":"11"},
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
		t.Fatalf("expected summary success, got %#v", payload.StructuredContent)
	}
	summary := mustStructuredMapForRoute(t, payload.StructuredContent)
	projectConfig := mustStructuredMapForRoute(t, summary["projectConfig"])
	if projectConfig["id"] != "11" {
		t.Fatalf("expected translated project id 11, got %#v", projectConfig["id"])
	}
	sectionVariantMap := mustStructuredMapForRoute(t, projectConfig["sectionVariantMap"])
	if _, ok := sectionVariantMap["14"]; !ok {
		t.Fatalf("expected translated allowed-section key 14, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["15"]; !ok {
		t.Fatalf("expected translated peer-chat-section key 15, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["20"]; !ok {
		t.Fatalf("expected translated allowed-params-section key 20, got %#v", sectionVariantMap)
	}
}

func TestMCPToolCallRouteSupportsScopedWriteMutation(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		CodeUpdates:    routeCodeUpdateService{runtime: projectRuntime},
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
		"tool":"set_code_section_diagnostics_mute",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","mute":true},
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
		t.Fatalf("expected scoped write success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route scoped write: %v", err)
	}
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after route scoped write: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_code_section_diagnostic_code_suppression",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","code":"reportFoo","suppress":true},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected scoped suppression success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route scoped suppression: %v", err)
	}
	ignoreState, err = project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after route scoped suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_section_name",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","name":"Allowed Renamed"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_section_name success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_section_name: %v", err)
	}
	if got := project.Sections["allowed-section"].Name; got != "Allowed Renamed" {
		t.Fatalf("expected renamed section name, got %q", got)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_code",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","code":"print('route updated')\n"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_code success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_code: %v", err)
	}
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["code"]; got != "print('route updated')\n" {
		t.Fatalf("expected updated route code payload, got %#v", got)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_code",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"blocked-section","code":"print('blocked')\n"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if !payload.IsError {
		t.Fatal("expected blocked set_code route call to fail")
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	if structured["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", structured["reason"])
	}
	if ids := mustStringListForRoute(t, structured["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected blockedSectionIds [blocked-section], got %#v", ids)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_param_entered_value",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","value":"updated"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_param_entered_value success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_param_entered_value: %v", err)
	}
	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after route set_param_entered_value: %v", err)
	}
	if got := paramPayload["value"]; got != "updated" {
		t.Fatalf("expected updated param value, got %#v", got)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_param_name_and_value",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","codeObjId":"allowed-param","name":"user-id@v2","value":"renamed"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_param_name_and_value success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_param_name_and_value: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}
	paramPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after route set_param_name_and_value: %v", err)
	}
	if got := paramPayload["value"]; got != "renamed" {
		t.Fatalf("expected renamed param value, got %#v", got)
	}

	if _, err := projectRuntime.ChangeParamImpl(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "SliderParam"); err != nil {
		t.Fatalf("prepare slider impl before route update_param_impl_config: %v", err)
	}
	if _, err := projectRuntime.SetSectionCodeObjectValue(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "75"); err != nil {
		t.Fatalf("prepare slider value before route update_param_impl_config: %v", err)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"update_param_impl_config",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","newConfig":{"max":10}},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected update_param_impl_config success, got %#v", payload.StructuredContent)
	}
	updateParamImplConfigPayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	if updateParamImplConfigPayload["status"] != "ok" {
		t.Fatalf("expected update_param_impl_config status ok, got %#v", updateParamImplConfigPayload["status"])
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route update_param_impl_config: %v", err)
	}
	paramPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after route update_param_impl_config: %v", err)
	}
	if got := paramPayload["value"]; got != "10" {
		t.Fatalf("expected slider value to clamp to 10, got %#v", got)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"change_param_impl",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","selectedId":"PasswordParam"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected change_param_impl success, got %#v", payload.StructuredContent)
	}
	changeParamImplPayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	if changeParamImplPayload["status"] != "ok" {
		t.Fatalf("expected change_param_impl status ok, got %#v", changeParamImplPayload["status"])
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route change_param_impl: %v", err)
	}
	paramPayload, _, _, paramImpl, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param after route change_param_impl: %v", err)
	}
	if paramImpl.Type != "PasswordParam" {
		t.Fatalf("expected PasswordParam impl, got %q", paramImpl.Type)
	}
	if got := paramPayload["value"]; got != "" {
		t.Fatalf("expected password value to stay blank, got %#v", got)
	}
	if got := paramPayload["hasSecret"]; got != true {
		t.Fatalf("expected hasSecret true after route change_param_impl, got %#v", got)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_callable",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","callableName":"sorted","refetchParams":false},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_callable success, got %#v", payload.StructuredContent)
	}
	callablePayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	if callablePayload["callableId"] != "allowed-callable-2" {
		t.Fatalf("expected callable id allowed-callable-2, got %#v", callablePayload["callableId"])
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_callable: %v", err)
	}
	_, _, callableImpl, err := project.ResolveSection("allowed-callable-section")
	if err != nil {
		t.Fatalf("resolve allowed-callable-section after route set_callable: %v", err)
	}
	callableSectionPayload := mustDecodedRouteProjectPayload(t, callableImpl.Payload)
	if got := callableSectionPayload["callable"]; got != "allowed-callable-2" {
		t.Fatalf("expected persisted callable allowed-callable-2, got %#v", got)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"add_kwarg",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected add_kwarg success, got %#v", payload.StructuredContent)
	}
	addKwargPayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	addedCallableParamID, ok := addKwargPayload["codeObjId"].(string)
	if !ok || addedCallableParamID == "" {
		t.Fatalf("expected add_kwarg codeObjId string, got %#v", addKwargPayload["codeObjId"])
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route add_kwarg: %v", err)
	}
	callableCodeObjPayload, addedCallableParam, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", addedCallableParamID)
	if err != nil {
		t.Fatalf("resolve added callable param after route add_kwarg: %v", err)
	}
	if addedCallableParam.Name != "" {
		t.Fatalf("expected added callable param name to start empty, got %q", addedCallableParam.Name)
	}
	if got := callableCodeObjPayload["value"]; got != "" {
		t.Fatalf("expected added callable param value to start empty, got %#v", got)
	}

	response = postMCPToolRoute(t, handler, fmt.Sprintf(`{
		"tool":"set_param_name_and_value",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","codeObjId":"%s","name":"key","value":"None"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, addedCallableParamID))
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected callable set_param_name_and_value success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route callable set_param_name_and_value: %v", err)
	}
	if got := project.CodeObjs[addedCallableParamID].Name; got != "key" {
		t.Fatalf("expected added callable param name key, got %q", got)
	}
	callableCodeObjPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-callable-section", addedCallableParamID)
	if err != nil {
		t.Fatalf("resolve added callable param after route rename/value: %v", err)
	}
	if got := callableCodeObjPayload["value"]; got != "None" {
		t.Fatalf("expected added callable param value None, got %#v", got)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"delete_kwarg",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected delete_kwarg success, got %#v", payload.StructuredContent)
	}
	deleteKwargPayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	if got := deleteKwargPayload["codeObjId"]; got != addedCallableParamID {
		t.Fatalf("expected deleted codeObjId %q, got %#v", addedCallableParamID, got)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route delete_kwarg: %v", err)
	}
	callableCodeObjPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 after route delete_kwarg: %v", err)
	}
	callableChildren := mustStringListForRoute(t, callableCodeObjPayload["children"])
	if len(callableChildren) != 1 || callableChildren[0] != "allowed-param-existing" {
		t.Fatalf("expected callable children [allowed-param-existing] after delete_kwarg, got %#v", callableChildren)
	}
	if _, ok := project.CodeObjs[addedCallableParamID]; ok {
		t.Fatalf("expected deleted callable param %q to be pruned after delete_kwarg, got %#v", addedCallableParamID, project.CodeObjs[addedCallableParamID])
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"add_kwarg",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected second add_kwarg success, got %#v", payload.StructuredContent)
	}
	addKwargPayload = mustStructuredMapForRoute(t, payload.StructuredContent)
	addedCallableParamID, ok = addKwargPayload["codeObjId"].(string)
	if !ok || addedCallableParamID == "" {
		t.Fatalf("expected second add_kwarg codeObjId string, got %#v", addKwargPayload["codeObjId"])
	}

	response = postMCPToolRoute(t, handler, fmt.Sprintf(`{
		"tool":"delete_selected_params",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","paramInfoIds":["%s"]},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, addedCallableParamID))
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected delete_selected_params success, got %#v", payload.StructuredContent)
	}
	deleteSelectedParamsPayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	deletedParamIDs := mustStringListForRoute(t, deleteSelectedParamsPayload["paramInfoIds"])
	if len(deletedParamIDs) != 1 || deletedParamIDs[0] != addedCallableParamID {
		t.Fatalf("expected deleted paramInfoIds [%s], got %#v", addedCallableParamID, deletedParamIDs)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route delete_selected_params: %v", err)
	}
	callableCodeObjPayload, _, _, _, err = project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 after route delete_selected_params: %v", err)
	}
	callableChildren = mustStringListForRoute(t, callableCodeObjPayload["children"])
	if len(callableChildren) != 1 || callableChildren[0] != "allowed-param-existing" {
		t.Fatalf("expected callable children [allowed-param-existing] after delete_selected_params, got %#v", callableChildren)
	}
	if _, ok := project.CodeObjs[addedCallableParamID]; ok {
		t.Fatalf("expected deleted callable param %q to be pruned, got %#v", addedCallableParamID, project.CodeObjs[addedCallableParamID])
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_type_error_ignore",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","ignoreTypeErrors":true},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_type_error_ignore success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_type_error_ignore: %v", err)
	}
	typeErrorIgnoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after route set_type_error_ignore: %v", err)
	}
	if !typeErrorIgnoreState.Params["allowed-param"] {
		t.Fatalf("expected allowed-param type-error ignore state, got %#v", typeErrorIgnoreState)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_code_obj_name",
		"arguments":{"projectConfigId":"project-alpha","codeObjId":"allowed-param","name":"user-id@v2"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_code_obj_name success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_code_obj_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_code_obj_display_name",
		"arguments":{"projectConfigId":"project-alpha","codeObjId":"allowed-param","displayName":"Height"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if payload.IsError {
		t.Fatalf("expected set_code_obj_display_name success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_code_obj_display_name: %v", err)
	}
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Height" {
		t.Fatalf("expected display name Height, got %q", got)
	}
}

func TestMCPToolCallRouteSupportsSetTopLevelSectionLayout(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:  t.TempDir(),
		ProjectState:   projectRuntime,
		SectionNames:   routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics: diagnostics,
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

	response := postMCPToolRoute(t, handler, `{
		"tool":"set_top_level_section_layout",
		"arguments":{
			"projectConfigId":"project-alpha",
			"topLevelSections":{
				"allowed-section":{"x":412.5,"y":208.25,"zIndex":6,"w":720,"h":360}
			}
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
		t.Fatalf("expected set_top_level_section_layout success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 412.5 || layout.Y != 208.25 || layout.ZIndex != 6 {
		t.Fatalf("unexpected persisted route layout %#v", layout)
	}
	if layout.W == nil || *layout.W != 720 {
		t.Fatalf("expected persisted width 720, got %#v", layout.W)
	}
	if layout.H == nil || *layout.H != 360 {
		t.Fatalf("expected persisted height 360, got %#v", layout.H)
	}

	response = postMCPToolRoute(t, handler, `{
		"tool":"set_top_level_section_layout",
		"arguments":{
			"projectConfigId":"project-alpha",
			"topLevelSections":{
				"blocked-section":{"x":1,"y":2}
			}
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

	payload = decodeCallToolRouteResult(t, response.Body.Bytes())
	if !payload.IsError {
		t.Fatal("expected blocked set_top_level_section_layout route call to fail")
	}
	structured := mustStructuredMapForRoute(t, payload.StructuredContent)
	if structured["reason"] != "out_of_scope" {
		t.Fatalf("expected out_of_scope reason, got %#v", structured["reason"])
	}
	if ids := mustStringListForRoute(t, structured["blockedSectionIds"]); len(ids) != 1 || ids[0] != "blocked-section" {
		t.Fatalf("expected blockedSectionIds [blocked-section], got %#v", ids)
	}
}

func TestMCPToolCallRouteSetTopLevelSectionLayoutAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
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
		"tool":"set_top_level_section_layout",
		"arguments":{
			"projectConfigId":"11",
			"topLevelSections":{
				"14":{"x":501,"y":275,"zIndex":9}
			}
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
		t.Fatalf("expected temp-id set_top_level_section_layout success, got %#v", payload.StructuredContent)
	}

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route set_top_level_section_layout: %v", err)
	}
	layout := project.TopLevelSections["allowed-section"]
	if layout.X != 501 || layout.Y != 275 || layout.ZIndex != 9 {
		t.Fatalf("expected translated route layout update, got %#v", layout)
	}
}

func TestMCPToolCallRouteSupportsAutoLayoutTopLevelSections(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	if _, err := projectRuntime.SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]projectstate.TopLevelSectionLayout{
		"chat-section":    {X: 10, Y: 10, ZIndex: 0},
		"allowed-section": {X: 15, Y: 15, ZIndex: 1},
		"blocked-section": {X: 20, Y: 20, ZIndex: 2},
	}); err != nil {
		t.Fatalf("seed route top-level layouts: %v", err)
	}
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before route auto layout: %v", err)
	}
	beforeAllowed := project.TopLevelSections["allowed-section"]
	beforeBlocked := project.TopLevelSections["blocked-section"]

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
		"tool":"auto_layout_top_level_sections",
		"arguments":{
			"projectConfigId":"project-alpha",
			"margin":10
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
		t.Fatalf("expected auto_layout_top_level_sections success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after route auto layout: %v", err)
	}
	afterAllowed := project.TopLevelSections["allowed-section"]
	afterBlocked := project.TopLevelSections["blocked-section"]
	if afterAllowed == beforeAllowed && afterBlocked == beforeBlocked {
		t.Fatalf(
			"expected route auto layout to rewrite layouts, allowed before=%#v after=%#v blocked before=%#v after=%#v",
			beforeAllowed,
			afterAllowed,
			beforeBlocked,
			afterBlocked,
		)
	}
}

func TestMCPToolCallRouteAutoLayoutTopLevelSectionsAcceptsTemporaryIDs(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
	if _, err := projectRuntime.SetTopLevelSectionLayout(context.Background(), "project-alpha", map[string]projectstate.TopLevelSectionLayout{
		"chat-section":    {X: 10, Y: 10, ZIndex: 0},
		"allowed-section": {X: 15, Y: 15, ZIndex: 1},
		"blocked-section": {X: 20, Y: 20, ZIndex: 2},
	}); err != nil {
		t.Fatalf("seed temp-id route top-level layouts: %v", err)
	}
	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id before temp-id route auto layout: %v", err)
	}
	beforeAllowed := project.TopLevelSections["allowed-section"]
	beforeBlocked := project.TopLevelSections["blocked-section"]

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
		"tool":"auto_layout_top_level_sections",
		"arguments":{
			"projectConfigId":"11",
			"margin":10
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
		t.Fatalf("expected temp-id auto_layout_top_level_sections success, got %#v", payload.StructuredContent)
	}

	project, err = projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id after temp-id route auto layout: %v", err)
	}
	afterAllowed := project.TopLevelSections["allowed-section"]
	afterBlocked := project.TopLevelSections["blocked-section"]
	if afterAllowed == beforeAllowed && afterBlocked == beforeBlocked {
		t.Fatalf(
			"expected temp-id route auto layout to rewrite layouts, allowed before=%#v after=%#v blocked before=%#v after=%#v",
			beforeAllowed,
			afterAllowed,
			beforeBlocked,
			afterBlocked,
		)
	}
}
