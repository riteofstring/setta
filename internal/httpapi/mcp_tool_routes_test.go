package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

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

func newMCPToolRouteTestHandler(t *testing.T, server *mcpx.Server) http.Handler {
	t.Helper()

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
	return handler
}

func assertMCPToolRouteMissingContextFailsClosed(t *testing.T, handler http.Handler) {
	t.Helper()

	payload := callScopedMCPToolRouteAllowError(t, handler, `{"tool":"read_file_range","arguments":{"path":"example.txt"}}`, "missing context read_file_range")
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
}

func assertMCPToolRouteBodyAgenticContextSummary(t *testing.T, handler http.Handler) {
	t.Helper()

	payload := callScopedMCPToolRoute(t, handler, `{
		"tool":"get_latest_project_state_summary",
		"arguments":{"projectConfigId":"project-alpha"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "body agentic context summary")
	summary := mustStructuredMapForRoute(t, payload.StructuredContent)
	projectConfig := mustStructuredMapForRoute(t, summary["projectConfig"])
	sectionVariantMap := mustStructuredMapForRoute(t, projectConfig["sectionVariantMap"])
	if _, ok := sectionVariantMap["blocked-section"]; ok {
		t.Fatalf("did not expect blocked-section in scoped summary, got %#v", sectionVariantMap)
	}
	if _, ok := sectionVariantMap["blocked-params-section"]; ok {
		t.Fatalf("did not expect blocked-params-section in scoped summary, got %#v", sectionVariantMap)
	}
}

func assertMCPToolRouteNamespacedRejected(t *testing.T, handler http.Handler) {
	t.Helper()

	response := postMCPToolRoute(t, handler, `{"tool":"setta__read_file_range","arguments":{"path":"example.txt"}}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
}

func assertMCPToolRouteMalformedJSONRejected(t *testing.T, handler http.Handler) {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, RouteMCPToolCall, strings.NewReader(`{"tool":"list_mcp_tools"`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
}

func assertMCPToolRouteBlankToolRejected(t *testing.T, handler http.Handler) {
	t.Helper()

	response := postMCPToolRoute(t, handler, `{"tool":"   ","arguments":{}}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
}

func assertMCPToolRouteUnknownToolRejected(t *testing.T, handler http.Handler) {
	t.Helper()

	response := postMCPToolRoute(t, handler, `{"tool":"tool_that_does_not_exist","arguments":{}}`)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
}

func callRouteReportStateMachineSignal(t *testing.T, handler http.Handler) mcpxCallToolResult {
	t.Helper()

	return callScopedMCPToolRoute(t, handler, `{
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
	}`, "report_state_machine_signal")
}

func assertRouteReportStateMachineSignalResult(t *testing.T, payload mcpxCallToolResult) {
	t.Helper()

	result := mustStructuredMapForRoute(t, payload.StructuredContent)
	if result["status"] != "ok" {
		t.Fatalf("expected ok status, got %#v", result["status"])
	}
}

func assertRouteReportStateMachineSignalProvider(t *testing.T, provider *routeStateMachineRunProvider) {
	t.Helper()

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

	handler := newMCPToolRouteTestHandler(t, server)

	assertMCPToolRouteMissingContextFailsClosed(t, handler)
	assertMCPToolRouteBodyAgenticContextSummary(t, handler)
	assertMCPToolRouteNamespacedRejected(t, handler)
	assertMCPToolRouteMalformedJSONRejected(t, handler)
	assertMCPToolRouteBlankToolRejected(t, handler)
	assertMCPToolRouteUnknownToolRejected(t, handler)
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

	handler := newMCPToolRouteTestHandler(t, server)
	payload := callRouteReportStateMachineSignal(t, handler)
	assertRouteReportStateMachineSignalResult(t, payload)
	assertRouteReportStateMachineSignalProvider(t, provider)
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

	assertRouteScopedDiagnosticsMute(t, handler, projectRuntime)
	assertRouteScopedDiagnosticsSuppression(t, handler, projectRuntime)
	assertRouteScopedSectionName(t, handler, projectRuntime)
	assertRouteScopedSetCode(t, handler, projectRuntime)
	assertRouteScopedBlockedSetCode(t, handler)
	assertRouteScopedParamEnteredValue(t, handler, projectRuntime)
	assertRouteScopedParamNameAndValue(t, handler, projectRuntime)
	assertRouteScopedParamImplConfig(t, handler, projectRuntime)
	assertRouteScopedChangeParamImpl(t, handler, projectRuntime)
	assertRouteScopedCallableSelection(t, handler, projectRuntime)

	addedCallableParamID := addRouteScopedKwarg(t, handler, "first")
	assertRouteScopedEmptyCallableParam(t, projectRuntime, addedCallableParamID)
	assertRouteScopedCallableParamNameAndValue(t, handler, projectRuntime, addedCallableParamID)
	assertRouteScopedDeletedKwarg(t, handler, projectRuntime, addedCallableParamID)

	addedCallableParamID = addRouteScopedKwarg(t, handler, "second")
	assertRouteScopedDeleteSelectedParams(t, handler, projectRuntime, addedCallableParamID)
	assertRouteScopedTypeErrorIgnore(t, handler, projectRuntime)
	assertRouteScopedCodeObjName(t, handler, projectRuntime)
	assertRouteScopedCodeObjDisplayName(t, handler, projectRuntime)
}

func callScopedMCPToolRoute(t *testing.T, handler http.Handler, body string, label string) mcpxCallToolResult {
	t.Helper()

	payload := callScopedMCPToolRouteAllowError(t, handler, body, label)
	if payload.IsError {
		t.Fatalf("expected %s success, got %#v", label, payload.StructuredContent)
	}
	return payload
}

func callScopedMCPToolRouteAllowError(t *testing.T, handler http.Handler, body string, label string) mcpxCallToolResult {
	t.Helper()

	response := postMCPToolRoute(t, handler, body)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d with body %q", label, response.Code, response.Body.String())
	}
	return decodeCallToolRouteResult(t, response.Body.Bytes())
}

func assertRouteScopedDiagnosticsMute(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, `{
		"tool":"set_code_section_diagnostics_mute",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","mute":true},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "scoped write")

	project := loadRouteScopedProject(t, projectRuntime, "after route scoped write")
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after route scoped write: %v", err)
	}
	if !ignoreState.Muted {
		t.Fatalf("expected allowed-section to be muted, got %#v", ignoreState)
	}
}

func assertRouteScopedDiagnosticsSuppression(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, `{
		"tool":"set_code_section_diagnostic_code_suppression",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","code":"reportFoo","suppress":true},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "scoped suppression")

	project := loadRouteScopedProject(t, projectRuntime, "after route scoped suppression")
	ignoreState, err := project.CodeSectionDiagnosticsIgnoreStateForSection("allowed-section")
	if err != nil {
		t.Fatalf("ignore state after route scoped suppression: %v", err)
	}
	if len(ignoreState.SuppressedCodes) != 1 || ignoreState.SuppressedCodes[0] != "reportFoo" {
		t.Fatalf("expected reportFoo suppression, got %#v", ignoreState.SuppressedCodes)
	}
}

func assertRouteScopedSectionName(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, `{
		"tool":"set_section_name",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","name":"Allowed Renamed"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "set_section_name")

	project := loadRouteScopedProject(t, projectRuntime, "after route set_section_name")
	if got := project.Sections["allowed-section"].Name; got != "Allowed Renamed" {
		t.Fatalf("expected renamed section name, got %q", got)
	}
}

func assertRouteScopedSetCode(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, `{
		"tool":"set_code",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-section","code":"print('route updated')\n"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "set_code")

	project := loadRouteScopedProject(t, projectRuntime, "after route set_code")
	allowedPayload := mustDecodedRouteProjectPayload(t, project.Sections["allowed-section"].SharedModifier)
	if got := allowedPayload["code"]; got != "print('route updated')\n" {
		t.Fatalf("expected updated route code payload, got %#v", got)
	}
}

func assertRouteScopedBlockedSetCode(t *testing.T, handler http.Handler) {
	t.Helper()

	payload := callScopedMCPToolRouteAllowError(t, handler, `{
		"tool":"set_code",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"blocked-section","code":"print('blocked')\n"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "blocked set_code")
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
}

func assertRouteScopedParamEnteredValue(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, `{
		"tool":"set_param_entered_value",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","value":"updated"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "set_param_entered_value")

	project := loadRouteScopedProject(t, projectRuntime, "after route set_param_entered_value")
	paramPayload := resolveRouteScopedAllowedParamPayload(t, project, "after route set_param_entered_value")
	if got := paramPayload["value"]; got != "updated" {
		t.Fatalf("expected updated param value, got %#v", got)
	}
}

func assertRouteScopedParamNameAndValue(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, `{
		"tool":"set_param_name_and_value",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","codeObjId":"allowed-param","name":"user-id@v2","value":"renamed"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "set_param_name_and_value")

	project := loadRouteScopedProject(t, projectRuntime, "after route set_param_name_and_value")
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}
	paramPayload := resolveRouteScopedAllowedParamPayload(t, project, "after route set_param_name_and_value")
	if got := paramPayload["value"]; got != "renamed" {
		t.Fatalf("expected renamed param value, got %#v", got)
	}
}

func assertRouteScopedParamImplConfig(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	if _, err := projectRuntime.ChangeParamImpl(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "SliderParam"); err != nil {
		t.Fatalf("prepare slider impl before route update_param_impl_config: %v", err)
	}
	if _, err := projectRuntime.SetSectionCodeObjectValue(context.Background(), "project-alpha", "allowed-params-section", "allowed-param", "75"); err != nil {
		t.Fatalf("prepare slider value before route update_param_impl_config: %v", err)
	}

	payload := callScopedMCPToolRoute(t, handler, `{
		"tool":"update_param_impl_config",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","newConfig":{"max":10}},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "update_param_impl_config")
	updateParamImplConfigPayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	if updateParamImplConfigPayload["status"] != "ok" {
		t.Fatalf("expected update_param_impl_config status ok, got %#v", updateParamImplConfigPayload["status"])
	}

	project := loadRouteScopedProject(t, projectRuntime, "after route update_param_impl_config")
	paramPayload := resolveRouteScopedAllowedParamPayload(t, project, "after route update_param_impl_config")
	if got := paramPayload["value"]; got != "10" {
		t.Fatalf("expected slider value to clamp to 10, got %#v", got)
	}
}

func assertRouteScopedChangeParamImpl(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	payload := callScopedMCPToolRoute(t, handler, `{
		"tool":"change_param_impl",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","selectedId":"PasswordParam"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "change_param_impl")
	changeParamImplPayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	if changeParamImplPayload["status"] != "ok" {
		t.Fatalf("expected change_param_impl status ok, got %#v", changeParamImplPayload["status"])
	}

	project := loadRouteScopedProject(t, projectRuntime, "after route change_param_impl")
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
}

func assertRouteScopedCallableSelection(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	payload := callScopedMCPToolRoute(t, handler, `{
		"tool":"set_callable",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","callableName":"sorted","refetchParams":false},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "set_callable")
	callablePayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	if callablePayload["callableId"] != "allowed-callable-2" {
		t.Fatalf("expected callable id allowed-callable-2, got %#v", callablePayload["callableId"])
	}

	project := loadRouteScopedProject(t, projectRuntime, "after route set_callable")
	_, _, callableImpl, err := project.ResolveSection("allowed-callable-section")
	if err != nil {
		t.Fatalf("resolve allowed-callable-section after route set_callable: %v", err)
	}
	callableSectionPayload := mustDecodedRouteProjectPayload(t, callableImpl.Payload)
	if got := callableSectionPayload["callable"]; got != "allowed-callable-2" {
		t.Fatalf("expected persisted callable allowed-callable-2, got %#v", got)
	}
}

func addRouteScopedKwarg(t *testing.T, handler http.Handler, label string) string {
	t.Helper()

	payload := callScopedMCPToolRoute(t, handler, `{
		"tool":"add_kwarg",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, label+" add_kwarg")
	addKwargPayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	addedCallableParamID, ok := addKwargPayload["codeObjId"].(string)
	if !ok || addedCallableParamID == "" {
		t.Fatalf("expected %s add_kwarg codeObjId string, got %#v", label, addKwargPayload["codeObjId"])
	}
	return addedCallableParamID
}

func assertRouteScopedEmptyCallableParam(t *testing.T, projectRuntime *projectstate.Runtime, addedCallableParamID string) {
	t.Helper()

	project := loadRouteScopedProject(t, projectRuntime, "after route add_kwarg")
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
}

func assertRouteScopedCallableParamNameAndValue(
	t *testing.T,
	handler http.Handler,
	projectRuntime *projectstate.Runtime,
	addedCallableParamID string,
) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, fmt.Sprintf(`{
		"tool":"set_param_name_and_value",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","codeObjId":"%s","name":"key","value":"None"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, addedCallableParamID), "callable set_param_name_and_value")

	project := loadRouteScopedProject(t, projectRuntime, "after route callable set_param_name_and_value")
	if got := project.CodeObjs[addedCallableParamID].Name; got != "key" {
		t.Fatalf("expected added callable param name key, got %q", got)
	}
	callableCodeObjPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", addedCallableParamID)
	if err != nil {
		t.Fatalf("resolve added callable param after route rename/value: %v", err)
	}
	if got := callableCodeObjPayload["value"]; got != "None" {
		t.Fatalf("expected added callable param value None, got %#v", got)
	}
}

func assertRouteScopedDeletedKwarg(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime, addedCallableParamID string) {
	t.Helper()

	payload := callScopedMCPToolRoute(t, handler, `{
		"tool":"delete_kwarg",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "delete_kwarg")
	deleteKwargPayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	if got := deleteKwargPayload["codeObjId"]; got != addedCallableParamID {
		t.Fatalf("expected deleted codeObjId %q, got %#v", addedCallableParamID, got)
	}

	project := loadRouteScopedProject(t, projectRuntime, "after route delete_kwarg")
	assertRouteScopedCallableChildrenPruned(t, project, addedCallableParamID, "after delete_kwarg")
}

func assertRouteScopedDeleteSelectedParams(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime, addedCallableParamID string) {
	t.Helper()

	payload := callScopedMCPToolRoute(t, handler, fmt.Sprintf(`{
		"tool":"delete_selected_params",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-callable-section","paramInfoIds":["%s"]},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, addedCallableParamID), "delete_selected_params")
	deleteSelectedParamsPayload := mustStructuredMapForRoute(t, payload.StructuredContent)
	deletedParamIDs := mustStringListForRoute(t, deleteSelectedParamsPayload["paramInfoIds"])
	if len(deletedParamIDs) != 1 || deletedParamIDs[0] != addedCallableParamID {
		t.Fatalf("expected deleted paramInfoIds [%s], got %#v", addedCallableParamID, deletedParamIDs)
	}

	project := loadRouteScopedProject(t, projectRuntime, "after route delete_selected_params")
	assertRouteScopedCallableChildrenPruned(t, project, addedCallableParamID, "after delete_selected_params")
}

func assertRouteScopedTypeErrorIgnore(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, `{
		"tool":"set_type_error_ignore",
		"arguments":{"projectConfigId":"project-alpha","sectionId":"allowed-params-section","paramInfoId":"allowed-param","ignoreTypeErrors":true},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "set_type_error_ignore")

	project := loadRouteScopedProject(t, projectRuntime, "after route set_type_error_ignore")
	typeErrorIgnoreState, err := project.TypeErrorIgnoreStateForSection("allowed-params-section")
	if err != nil {
		t.Fatalf("type error ignore state after route set_type_error_ignore: %v", err)
	}
	if !typeErrorIgnoreState.Params["allowed-param"] {
		t.Fatalf("expected allowed-param type-error ignore state, got %#v", typeErrorIgnoreState)
	}
}

func assertRouteScopedCodeObjName(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, `{
		"tool":"set_code_obj_name",
		"arguments":{"projectConfigId":"project-alpha","codeObjId":"allowed-param","name":"user-id@v2"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "set_code_obj_name")

	project := loadRouteScopedProject(t, projectRuntime, "after route set_code_obj_name")
	if got := project.CodeObjs["allowed-param"].Name; got != "user-id@v2" {
		t.Fatalf("expected code object name user-id@v2, got %q", got)
	}
}

func assertRouteScopedCodeObjDisplayName(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, `{
		"tool":"set_code_obj_display_name",
		"arguments":{"projectConfigId":"project-alpha","codeObjId":"allowed-param","displayName":"Height"},
		"agenticContext":{
			"projectConfigId":"project-alpha",
			"chatId":"chat-1",
			"sectionId":"chat-section"
		}
	}`, "set_code_obj_display_name")

	project := loadRouteScopedProject(t, projectRuntime, "after route set_code_obj_display_name")
	if got := project.CodeObjs["allowed-param"].DisplayName; got != "Height" {
		t.Fatalf("expected display name Height, got %q", got)
	}
}

func assertRouteScopedCallableChildrenPruned(t *testing.T, project projectstate.Project, deletedCallableParamID string, contextLabel string) {
	t.Helper()

	callableCodeObjPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-callable-section", "allowed-callable-2")
	if err != nil {
		t.Fatalf("resolve allowed-callable-2 %s: %v", contextLabel, err)
	}
	callableChildren := mustStringListForRoute(t, callableCodeObjPayload["children"])
	if len(callableChildren) != 1 || callableChildren[0] != "allowed-param-existing" {
		t.Fatalf("expected callable children [allowed-param-existing] %s, got %#v", contextLabel, callableChildren)
	}
	if _, ok := project.CodeObjs[deletedCallableParamID]; ok {
		t.Fatalf("expected deleted callable param %q to be pruned %s, got %#v", deletedCallableParamID, contextLabel, project.CodeObjs[deletedCallableParamID])
	}
}

func loadRouteScopedProject(t *testing.T, projectRuntime *projectstate.Runtime, contextLabel string) projectstate.Project {
	t.Helper()

	project, err := projectRuntime.Snapshot().Document.ProjectByID("project-alpha")
	if err != nil {
		t.Fatalf("project by id %s: %v", contextLabel, err)
	}
	return project
}

func resolveRouteScopedAllowedParamPayload(t *testing.T, project projectstate.Project, contextLabel string) map[string]any {
	t.Helper()

	paramPayload, _, _, _, err := project.ResolveSectionCodeObject("allowed-params-section", "allowed-param")
	if err != nil {
		t.Fatalf("resolve allowed-param %s: %v", contextLabel, err)
	}
	return paramPayload
}

func seedRouteTopLevelSectionViewMode(t *testing.T, projectRuntime *projectstate.Runtime) {
	t.Helper()

	if _, _, err := projectRuntime.CreateViewMode(context.Background(), "project-alpha"); err != nil {
		t.Fatalf("seed view mode: %v", err)
	}
}

func assertRouteAllowedTopLevelSectionLayout(t *testing.T, handler http.Handler, projectRuntime *projectstate.Runtime) {
	t.Helper()

	callScopedMCPToolRoute(t, handler, `{
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
	}`, "set_top_level_section_layout")

	project := loadRouteScopedProject(t, projectRuntime, "after route set_top_level_section_layout")
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
}

func assertRouteBlockedTopLevelSectionLayout(t *testing.T, handler http.Handler) {
	t.Helper()

	payload := callScopedMCPToolRouteAllowError(t, handler, `{
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
	}`, "blocked set_top_level_section_layout")
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

func TestMCPToolCallRouteSupportsSetTopLevelSectionLayout(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	seedRouteTopLevelSectionViewMode(t, projectRuntime)
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

	handler := newMCPToolRouteTestHandler(t, server)
	assertRouteAllowedTopLevelSectionLayout(t, handler, projectRuntime)
	assertRouteBlockedTopLevelSectionLayout(t, handler)
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
	handler := newMCPToolRouteTestHandler(t, server)

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
	handler := newMCPToolRouteTestHandler(t, server)

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
	handler := newMCPToolRouteTestHandler(t, server)

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
