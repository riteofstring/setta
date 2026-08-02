package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/projectstate"
)

func TestLauncherModeGuardedRoutesUseSharedModeForbiddenEnvelope(t *testing.T) {
	t.Parallel()

	const expectedMessage = "Launcher mode does not allow this endpoint."

	testCases := []struct {
		name       string
		newHandler func(t *testing.T) http.Handler
		method     string
		path       string
		body       string
	}{
		{
			name: "mcp_tool_call",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()

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
							t.Fatalf("register mcp root routes: %v", err)
						}
					},
				})
				if err != nil {
					t.Fatalf("new handler: %v", err)
				}
				return handler
			},
			method: http.MethodPost,
			path:   RouteMCPToolCall,
			body:   `{"tool":"list_mcp_tools"}`,
		},
		{
			name: "load_all_project_metadata",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()
				return newProjectShellRouteTestHandler(t, config.ModeLauncher, nil, nil)
			},
			method: http.MethodPost,
			path:   "/api" + RouteLoadAllProjectMetadata,
			body:   "null",
		},
		{
			name: "llm_config",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()
				state := newLLMRouteTestState(t, llmconfig.AllConfigs{
					Configs:    map[string]llmconfig.Config{},
					MCPServers: map[string]llmconfig.ServerConfig{},
				}, map[string]string{})
				return newLLMRouteTestHandler(t, config.ModeLauncher, state.service)
			},
			method: http.MethodGet,
			path:   "/api" + RouteLLMConfig,
		},
		{
			name: "external_agent_health",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()
				_, service := newExternalAgentConfigRouteTestService(t)
				return newExternalAgentConfigRouteTestHandler(
					t,
					config.ModeLauncher,
					service,
					&externalAgentConfigRouteStubChecker{},
				)
			},
			method: http.MethodGet,
			path:   "/api" + RouteGetExternalAgentHealth,
		},
		{
			name: "ai_follow_snapshot",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()
				fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
				return newAIRouteTestHandler(
					t,
					config.ModeLauncher,
					fixture.managed,
					fixture.send,
					fixture.service,
					fixture.runtime,
					fixture.follow,
				)
			},
			method: http.MethodPost,
			path:   "/api" + RouteGetAIFollowSnapshot,
			body:   `{"projectConfigId":"project-alpha"}`,
		},
		{
			name: "listener_coverage",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()
				return newListenerRouteTestHandler(
					t,
					config.ModeLauncher,
					newLauncherModeProjectRuntime(t),
					nil,
					nil,
				)
			},
			method: http.MethodPost,
			path:   "/api" + RouteGetListenerCoverage,
			body:   `{"projectConfigId":"project-alpha"}`,
		},
		{
			name: "update_artifacts",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()
				return newArtifactRouteTestHandler(t, config.ModeLauncher, nil, nil)
			},
			method: http.MethodPost,
			path:   "/api" + RouteUpdateArtifacts,
			body:   `{"artifacts":[],"uploadScope":"generic"}`,
		},
		{
			name: "latest_project_state",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()
				return newProjectRouteTestHandler(
					t,
					config.ModeLauncher,
					newLauncherModeProjectRuntime(t),
					t.TempDir(),
					nil,
					nil,
					nil,
				)
			},
			method: http.MethodPost,
			path:   "/api" + RouteGetLatestProjectState,
			body:   `{"projectConfigId":"project-alpha"}`,
		},
		{
			name: "delete_terminals",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()
				terminalService := newHTTPTestTerminalService(t)
				handler, err := NewHandler(Dependencies{
					Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
					Info:       stubInfoService{mode: "launcher", info: RuntimeInfo{Mode: "launcher"}},
					ModePolicy: modes.NewPolicy(config.ModeLauncher),
					Register: func(r chi.Router) {
						registerHTTPTestTerminalRoutes(
							t,
							r,
							modes.NewPolicy(config.ModeLauncher),
							terminalService,
							newHTTPTestRunCodeService(t, terminalService),
						)
					},
				})
				if err != nil {
					t.Fatalf("new handler: %v", err)
				}
				return handler
			},
			method: http.MethodPost,
			path:   "/api" + RouteDeleteTerminals,
			body:   `{"sectionIds":["section-a"]}`,
		},
		{
			name: "create_file",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()
				return newFileBrowserRouteTestHandler(t, config.ModeLauncher, nil, nil)
			},
			method: http.MethodPost,
			path:   "/api" + RouteCreateFile,
			body:   `{"filepath":"src/main.py"}`,
		},
		{
			name: "git_status",
			newHandler: func(t *testing.T) http.Handler {
				t.Helper()
				return newGitRouteTestHandler(t, config.ModeLauncher, t.TempDir())
			},
			method: http.MethodPost,
			path:   "/api" + RouteGetGitStatus,
			body:   "null",
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			handler := testCase.newHandler(t)

			var body io.Reader
			if testCase.body != "" {
				body = strings.NewReader(testCase.body)
			}
			request := httptest.NewRequest(testCase.method, testCase.path, body)
			if testCase.body != "" {
				request.Header.Set("Content-Type", "application/json")
			}
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			assertLauncherModeForbiddenEnvelope(t, response, expectedMessage)
		})
	}
}

func TestRegisterAttachmentRoutesDoesNotMountURLHelpersInLauncherMode(t *testing.T) {
	t.Parallel()

	service := newAttachmentRouteTestService(t, t.TempDir(), nil)
	handler := newAttachmentRouteTestHandler(t, config.ModeLauncher, nil, service, nil)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetAttachmentDownloadURL,
		strings.NewReader(`{"artifactId":"artifacts/notes.txt"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for launcher attachment helper, got %d with body %q", response.Code, response.Body.String())
	}
}

func assertLauncherModeForbiddenEnvelope(t *testing.T, response *httptest.ResponseRecorder, expectedMessage string) {
	t.Helper()

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode mode-forbidden payload: %v", err)
	}
	if payload.Error.Code != "mode_forbidden" {
		t.Fatalf("expected mode_forbidden, got %#v", payload)
	}
	if payload.Error.Message != expectedMessage {
		t.Fatalf("expected mode-forbidden message %q, got %#v", expectedMessage, payload)
	}
}

func newLauncherModeProjectRuntime(t *testing.T) *projectstate.Runtime {
	t.Helper()

	runtime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
	if err != nil {
		t.Fatalf("open launcher-mode project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close launcher-mode project runtime: %v", err)
		}
	})
	return runtime
}
