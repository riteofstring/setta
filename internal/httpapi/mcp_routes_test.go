package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/externalagents"
	"setta/internal/mcpx"
	"setta/internal/modes"
)

type stubMCPStatusProvider struct {
	statuses []mcpx.ServerRuntimeStatus
}

func (s stubMCPStatusProvider) RuntimeStatuses() []mcpx.ServerRuntimeStatus {
	cloned := make([]mcpx.ServerRuntimeStatus, 0, len(s.statuses))
	for _, status := range s.statuses {
		cloned = append(cloned, status)
	}
	return cloned
}

func TestMCPRuntimeStatusRouteReturnsCurrentStatuses(t *testing.T) {
	t.Parallel()

	now := time.Now().UTC()
	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Register: func(r chi.Router) {
			if err := RegisterMCPRoutes(r, MCPRouteDependencies{
				ModePolicy:               modes.NewPolicy(config.ModeIDE),
				LLMConfigPath:            "/tmp/workspace/setta_files/llm_config.json",
				ActiveSettaFilesLocation: "local",
				Client: stubMCPStatusProvider{statuses: []mcpx.ServerRuntimeStatus{
					{
						ServerID:            "setta",
						Source:              "setta_mcp",
						Transport:           mcpx.TransportSSE,
						Endpoint:            "http://127.0.0.1:8000/mcp",
						State:               mcpx.RuntimeStateConnected,
						LastAttemptAt:       &now,
						LastConnectedAt:     &now,
						ConsecutiveFailures: 0,
						ToolCount:           2,
					},
				}},
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/mcpServerRuntimeStatus", bytes.NewBufferString(`{}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload MCPRuntimeStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if payload.LLMConfigPath != "/tmp/workspace/setta_files/llm_config.json" {
		t.Fatalf("unexpected llm config path %q", payload.LLMConfigPath)
	}
	if payload.ActiveSettaFilesLocation != "local" {
		t.Fatalf("unexpected files location %q", payload.ActiveSettaFilesLocation)
	}
	if len(payload.Servers) != 1 {
		t.Fatalf("expected one server status, got %d", len(payload.Servers))
	}
	if payload.Servers[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("expected connected status, got %q", payload.Servers[0].State)
	}
	if len(payload.ExternalServers) != 0 {
		t.Fatalf("expected empty external servers, got %d", len(payload.ExternalServers))
	}
}

func TestMCPRuntimeStatusRouteReturnsExternalStatuses(t *testing.T) {
	t.Parallel()

	runStore, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	runtime, err := externalagents.NewRuntime(externalagents.RuntimeOptions{
		Runs: runStore,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 11, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeExternalAgent,
		"chatId":          "chat-external",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-external",
		"messages":        []any{},
	}, time.Date(2026, 3, 9, 11, 0, 0, 0, time.UTC))
	if err := runStore.Save(run); err != nil {
		t.Fatalf("save external run: %v", err)
	}
	if err := runtime.ActivateRun(run.ID, stubExternalRuntimeController{}); err != nil {
		t.Fatalf("activate external run: %v", err)
	}
	if err := runtime.UpsertMCPStatuses(run.ID, []mcpx.ServerRuntimeStatus{
		{
			ServerID:  "setta",
			Source:    "external_runtime",
			Transport: mcpx.TransportStreamableHTTP,
			Endpoint:  "http://127.0.0.1:8000/mcp",
			State:     mcpx.RuntimeStateConnected,
			ToolCount: 4,
		},
	}); err != nil {
		t.Fatalf("upsert external runtime status: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Register: func(r chi.Router) {
			if err := RegisterMCPRoutes(r, MCPRouteDependencies{
				ModePolicy:             modes.NewPolicy(config.ModeIDE),
				LLMConfigPath:          "/tmp/workspace/setta_files/llm_config.json",
				ExternalStatusProvider: runtime,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/mcpServerRuntimeStatus", bytes.NewBufferString(`{"chatId":"chat-external","engineConfigId":"engine-external"}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload MCPRuntimeStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if len(payload.ExternalServers) != 1 {
		t.Fatalf("expected one external server status, got %#v", payload.ExternalServers)
	}
	if payload.ExternalServers[0].ServerID != "setta" || payload.ExternalServers[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("unexpected external server status %#v", payload.ExternalServers[0])
	}
}

func TestMCPRuntimeStatusRouteBlockedOutsideFullIDE(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		mode config.Mode
	}{
		{name: "deployment", mode: config.ModeShare},
		{name: "launcher", mode: config.ModeLauncher},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			handler, err := NewHandler(Dependencies{
				Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
				Info:   stubInfoService{mode: string(tc.mode), info: RuntimeInfo{Mode: string(tc.mode)}},
				Register: func(r chi.Router) {
					if err := RegisterMCPRoutes(r, MCPRouteDependencies{
						ModePolicy:    modes.NewPolicy(tc.mode),
						LLMConfigPath: "/tmp/workspace/setta_files/llm_config.json",
					}); err != nil {
						panic(err)
					}
				},
			})
			if err != nil {
				t.Fatalf("new handler: %v", err)
			}

			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/mcpServerRuntimeStatus", bytes.NewBufferString(`{}`)))
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d", response.Code)
			}
		})
	}
}

type stubExternalRuntimeController struct{}

func (stubExternalRuntimeController) Cancel() error {
	return nil
}

func (stubExternalRuntimeController) SendApprovalResponse(string, bool) error {
	return nil
}

func (stubExternalRuntimeController) SendToolResponse(string, map[string]any) error {
	return nil
}
