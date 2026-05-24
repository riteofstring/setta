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

type testExternalMCPStatusProvider struct {
	runtime  *externalagents.Runtime
	disabled bool
	calls    []struct {
		chatID         *string
		engineConfigID *string
	}
}

func (p *testExternalMCPStatusProvider) Disabled() bool {
	return p.disabled
}

func (p *testExternalMCPStatusProvider) ExternalRuntimeStatuses(chatID *string, engineConfigID *string) ([]mcpx.ServerRuntimeStatus, error) {
	p.calls = append(p.calls, struct {
		chatID         *string
		engineConfigID *string
	}{
		chatID:         chatID,
		engineConfigID: engineConfigID,
	})
	if p.runtime == nil {
		return []mcpx.ServerRuntimeStatus{}, nil
	}
	return p.runtime.ExternalRuntimeStatuses(chatID, engineConfigID)
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
						Transport:           mcpx.TransportStreamableHTTP,
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

// The runtime-status route should report a custom files location when the
// active setta-files root is explicitly overridden away from the standard
// local/global roots.
func TestMCPRuntimeStatusRouteReportsCustomSettaFilesLocationForExplicitRoot(t *testing.T) {
	t.Parallel()

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Register: func(r chi.Router) {
			if err := RegisterMCPRoutes(r, MCPRouteDependencies{
				ModePolicy:               modes.NewPolicy(config.ModeIDE),
				LLMConfigPath:            "/tmp/custom-setta-files/llm_config.json",
				ActiveSettaFilesLocation: "custom",
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
	if payload.ActiveSettaFilesLocation != "custom" {
		t.Fatalf("expected custom files location, got %q", payload.ActiveSettaFilesLocation)
	}
	if payload.LLMConfigPath != "/tmp/custom-setta-files/llm_config.json" {
		t.Fatalf("expected explicit custom llm config path, got %q", payload.LLMConfigPath)
	}
}

func TestMCPRuntimeStatusRouteReturnsExternalStatuses(t *testing.T) {
	t.Parallel()

	fixture := newMCPRuntimeStatusExternalFixture(t)
	payload := postMCPRuntimeStatus(t, fixture.handler, `{"chatId":"chat-external","engineConfigId":"engine-external"}`)

	assertMCPRuntimeStatusExternalPayload(t, payload)
	assertMCPRuntimeStatusExternalProviderCall(t, fixture.provider)
}

type mcpRuntimeStatusExternalFixture struct {
	handler  http.Handler
	provider *testExternalMCPStatusProvider
}

func newMCPRuntimeStatusExternalFixture(t *testing.T) mcpRuntimeStatusExternalFixture {
	t.Helper()

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
	provider := &testExternalMCPStatusProvider{runtime: runtime}

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Register: func(r chi.Router) {
			if err := RegisterMCPRoutes(r, MCPRouteDependencies{
				ModePolicy:             modes.NewPolicy(config.ModeIDE),
				LLMConfigPath:          "/tmp/workspace/setta_files/llm_config.json",
				ExternalStatusProvider: provider,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return mcpRuntimeStatusExternalFixture{
		handler:  handler,
		provider: provider,
	}
}

func postMCPRuntimeStatus(t *testing.T, handler http.Handler, body string) MCPRuntimeStatusResponse {
	t.Helper()

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/mcpServerRuntimeStatus", bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload MCPRuntimeStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	return payload
}

func assertMCPRuntimeStatusExternalPayload(t *testing.T, payload MCPRuntimeStatusResponse) {
	t.Helper()

	if len(payload.ExternalServers) != 1 {
		t.Fatalf("expected one external server status, got %#v", payload.ExternalServers)
	}
	if payload.ExternalServers[0].ServerID != "setta" || payload.ExternalServers[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("unexpected external server status %#v", payload.ExternalServers[0])
	}
	if len(payload.ResolvedServers) != 1 {
		t.Fatalf("expected one resolved server status, got %#v", payload.ResolvedServers)
	}
	if payload.ResolvedServers[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected resolved transport streamable_http, got %#v", payload.ResolvedServers[0])
	}
	if payload.ResolvedServers[0].ToolCount != 4 {
		t.Fatalf("expected resolved tool count 4, got %#v", payload.ResolvedServers[0])
	}
}

func assertMCPRuntimeStatusExternalProviderCall(t *testing.T, provider *testExternalMCPStatusProvider) {
	t.Helper()

	if len(provider.calls) != 1 {
		t.Fatalf("expected one external status provider call, got %#v", provider.calls)
	}
	if provider.calls[0].chatID == nil || *provider.calls[0].chatID != "chat-external" {
		t.Fatalf("expected chat id chat-external, got %#v", provider.calls[0].chatID)
	}
	if provider.calls[0].engineConfigID == nil || *provider.calls[0].engineConfigID != "engine-external" {
		t.Fatalf("expected engineConfigId engine-external, got %#v", provider.calls[0].engineConfigID)
	}
}

func TestMCPRuntimeStatusRouteReturnsLatestExternalStatusesWithoutChatID(t *testing.T) {
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
	provider := &testExternalMCPStatusProvider{runtime: runtime}

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Register: func(r chi.Router) {
			if err := RegisterMCPRoutes(r, MCPRouteDependencies{
				ModePolicy:             modes.NewPolicy(config.ModeIDE),
				LLMConfigPath:          "/tmp/workspace/setta_files/llm_config.json",
				ExternalStatusProvider: provider,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/mcpServerRuntimeStatus", bytes.NewBufferString(`{"chatId":null,"engineConfigId":"engine-external"}`))
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
	if payload.ExternalServers[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected streamable_http transport, got %#v", payload.ExternalServers[0])
	}
	if len(payload.ResolvedServers) != 1 {
		t.Fatalf("expected one resolved server status, got %#v", payload.ResolvedServers)
	}
	if payload.ResolvedServers[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected resolved transport streamable_http, got %#v", payload.ResolvedServers[0])
	}
	if len(provider.calls) != 1 {
		t.Fatalf("expected one external status provider call, got %#v", provider.calls)
	}
	if provider.calls[0].chatID != nil {
		t.Fatalf("expected nil chat id, got %#v", provider.calls[0].chatID)
	}
	if provider.calls[0].engineConfigID == nil || *provider.calls[0].engineConfigID != "engine-external" {
		t.Fatalf("expected engineConfigId engine-external, got %#v", provider.calls[0].engineConfigID)
	}
}

func TestMCPRuntimeStatusRouteSkipsDisabledExternalProvider(t *testing.T) {
	t.Parallel()

	provider := &testExternalMCPStatusProvider{disabled: true}

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Register: func(r chi.Router) {
			if err := RegisterMCPRoutes(r, MCPRouteDependencies{
				ModePolicy:             modes.NewPolicy(config.ModeIDE),
				LLMConfigPath:          "/tmp/workspace/setta_files/llm_config.json",
				ExternalStatusProvider: provider,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/mcpServerRuntimeStatus", bytes.NewBufferString(`{"chatId":"chat-disabled","engineConfigId":"engine-disabled"}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload MCPRuntimeStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if len(payload.ExternalServers) != 0 {
		t.Fatalf("expected disabled provider to return no external servers, got %#v", payload.ExternalServers)
	}
	if len(payload.ResolvedServers) != 0 {
		t.Fatalf("expected disabled provider to return no resolved servers, got %#v", payload.ResolvedServers)
	}
	if len(provider.calls) != 0 {
		t.Fatalf("expected disabled provider to skip runtime call, got %#v", provider.calls)
	}
}

func TestMCPRuntimeStatusRouteResolvedServersKeepSettaMetadataWhenExternalStatusIsPartial(t *testing.T) {
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
		"engineConfigId":  "engine-claude-code",
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
			Transport: "",
			Endpoint:  "",
			State:     mcpx.RuntimeStateConnected,
			ToolCount: 0,
		},
	}); err != nil {
		t.Fatalf("upsert external runtime status: %v", err)
	}
	provider := &testExternalMCPStatusProvider{runtime: runtime}

	handler, err := NewHandler(Dependencies{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:   stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		Register: func(r chi.Router) {
			if err := RegisterMCPRoutes(r, MCPRouteDependencies{
				ModePolicy:    modes.NewPolicy(config.ModeIDE),
				LLMConfigPath: "/tmp/workspace/setta_files/llm_config.json",
				Client: stubMCPStatusProvider{statuses: []mcpx.ServerRuntimeStatus{
					{
						ServerID:  "setta",
						Source:    "setta_mcp",
						Transport: mcpx.TransportStreamableHTTP,
						Endpoint:  "http://127.0.0.1:8000/mcp",
						State:     mcpx.RuntimeStateConnected,
						ToolCount: 79,
					},
				}},
				ExternalStatusProvider: provider,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/mcpServerRuntimeStatus", bytes.NewBufferString(`{"chatId":"chat-external","engineConfigId":"engine-claude-code"}`))
	request.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload MCPRuntimeStatusResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if len(payload.ResolvedServers) != 1 {
		t.Fatalf("expected one resolved server status, got %#v", payload.ResolvedServers)
	}
	if payload.ResolvedServers[0].ServerID != "setta" {
		t.Fatalf("unexpected resolved server %#v", payload.ResolvedServers[0])
	}
	if payload.ResolvedServers[0].Transport != mcpx.TransportStreamableHTTP {
		t.Fatalf("expected resolved transport streamable_http, got %#v", payload.ResolvedServers[0])
	}
	if payload.ResolvedServers[0].Endpoint != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected resolved endpoint from setta runtime, got %#v", payload.ResolvedServers[0])
	}
	if payload.ResolvedServers[0].ToolCount != 79 {
		t.Fatalf("expected resolved tool count 79 from setta runtime, got %#v", payload.ResolvedServers[0])
	}
	if payload.ResolvedServers[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("expected resolved state connected, got %#v", payload.ResolvedServers[0])
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
