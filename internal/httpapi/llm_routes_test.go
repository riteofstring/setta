package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/llmconfig"
	"setta/internal/modes"
	"setta/internal/realtime"
)

func TestRegisterLLMRoutesGetsAndSetsConfig(t *testing.T) {
	t.Parallel()

	state := newLLMRouteTestState(t, llmconfig.AllConfigs{
		Configs:    map[string]llmconfig.Config{},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}, map[string]string{})
	handler := newLLMRouteTestHandler(t, config.ModeIDE, state.service)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteLLMConfig,
		strings.NewReader(`{"configs":{"anthropic-main":{"model":"claude-sonnet","provider":"anthropic","api_key_env":"ANTHROPIC_API_KEY"}},"mcpServers":{},"default_config_id":"anthropic-main"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var saved llmconfig.AllConfigs
	if err := json.Unmarshal(response.Body.Bytes(), &saved); err != nil {
		t.Fatalf("decode saved config: %v", err)
	}
	if saved.DefaultConfigID != "anthropic-main" {
		t.Fatalf("expected saved default config id, got %#v", saved)
	}
	if got := saved.Configs["anthropic-main"].APIKeyEnv; got != "ANTHROPIC_API_KEY" {
		t.Fatalf("expected api key env to roundtrip, got %#v", saved)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api"+RouteLLMConfig, nil)
	getResponse := httptest.NewRecorder()
	handler.ServeHTTP(getResponse, getRequest)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from get, got %d with body %q", getResponse.Code, getResponse.Body.String())
	}
	var loaded llmconfig.AllConfigs
	if err := json.Unmarshal(getResponse.Body.Bytes(), &loaded); err != nil {
		t.Fatalf("decode loaded config: %v", err)
	}
	if _, ok := loaded.Configs["anthropic-main"]; !ok {
		t.Fatalf("expected saved config from get route, got %#v", loaded)
	}
}

func TestRegisterLLMRoutesReturnsEmptyTopLevelCollectionsForDefaultConfig(t *testing.T) {
	t.Parallel()

	state := newLLMRouteTestState(t, llmconfig.AllConfigs{
		Configs:             map[string]llmconfig.Config{},
		MCPServers:          map[string]llmconfig.ServerConfig{},
		DefaultMCPServerIDs: []string{},
	}, map[string]string{})
	handler := newLLMRouteTestHandler(t, config.ModeIDE, state.service)

	request := httptest.NewRequest(http.MethodGet, "/api"+RouteLLMConfig, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var loaded llmconfig.AllConfigs
	if err := json.Unmarshal(response.Body.Bytes(), &loaded); err != nil {
		t.Fatalf("decode loaded config: %v", err)
	}
	if loaded.Configs == nil {
		t.Fatal("expected configs map to be non-nil")
	}
	if loaded.MCPServers == nil {
		t.Fatal("expected mcpServers map to be non-nil")
	}
	if loaded.DefaultMCPServerIDs == nil {
		t.Fatal("expected defaultMcpServerIds slice to be non-nil")
	}
}

func TestRegisterLLMRoutesRejectsInvalidConfig(t *testing.T) {
	t.Parallel()

	state := newLLMRouteTestState(t, llmconfig.AllConfigs{
		Configs:    map[string]llmconfig.Config{},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}, map[string]string{})
	handler := newLLMRouteTestHandler(t, config.ModeIDE, state.service)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteLLMConfig,
		strings.NewReader(`{"configs":{"broken":{"provider":"openai"}},"mcpServers":{}}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_llm_config" {
		t.Fatalf("expected invalid_llm_config, got %#v", payload)
	}
}

func TestRegisterLLMRoutesGetsAndSetsManagedAPIKeys(t *testing.T) {
	t.Parallel()

	state := newLLMRouteTestState(t, llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-main": {
				ID:        "openai-main",
				Model:     "gpt-4o",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}, map[string]string{})
	handler := newLLMRouteTestHandler(t, config.ModeIDE, state.service)

	postRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteLLMAPIKeys,
		strings.NewReader(`{"apiKeys":{"OPENAI_API_KEY":"openai-secret","UNSCOPED_CUSTOM_KEY":"custom-secret"},"expectedRevision":0}`),
	)
	postResponse := httptest.NewRecorder()
	handler.ServeHTTP(postResponse, postRequest)

	if postResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", postResponse.Code, postResponse.Body.String())
	}
	var saved llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(postResponse.Body.Bytes(), &saved); err != nil {
		t.Fatalf("decode managed api key response: %v", err)
	}
	if saved.Revision <= 0 {
		t.Fatalf("expected positive revision, got %#v", saved)
	}
	if got := saved.APIKeys["OPENAI_API_KEY"]; got != "openai-secret" {
		t.Fatalf("expected configured key in snapshot, got %#v", saved)
	}
	if got := saved.APIKeys["UNSCOPED_CUSTOM_KEY"]; got != "custom-secret" {
		t.Fatalf("expected unscoped key in snapshot, got %#v", saved)
	}

	getRequest := httptest.NewRequest(http.MethodGet, "/api"+RouteLLMAPIKeys, nil)
	getResponse := httptest.NewRecorder()
	handler.ServeHTTP(getResponse, getRequest)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 from get, got %d with body %q", getResponse.Code, getResponse.Body.String())
	}
	var loaded llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(getResponse.Body.Bytes(), &loaded); err != nil {
		t.Fatalf("decode managed api key get response: %v", err)
	}
	if loaded.Revision != saved.Revision {
		t.Fatalf("expected persisted revision %d, got %#v", saved.Revision, loaded)
	}
	if got := loaded.APIKeys["UNSCOPED_CUSTOM_KEY"]; got != "custom-secret" {
		t.Fatalf("expected unscoped key to roundtrip, got %#v", loaded)
	}
}

func TestRegisterLLMRoutesGetsManagedAPIKeysFromWorkspaceDotEnvFallback(t *testing.T) {
	t.Parallel()

	state := newLLMRouteTestState(t, llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"anthropic-main": {
				ID:        "anthropic-main",
				Model:     "claude-sonnet",
				Provider:  "anthropic",
				APIKeyEnv: "ANTHROPIC_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}, map[string]string{})
	if err := os.WriteFile(state.envPath, []byte("ANTHROPIC_API_KEY=workspace-secret\n"), 0o644); err != nil {
		t.Fatalf("seed workspace .env: %v", err)
	}
	handler := newLLMRouteTestHandler(t, config.ModeIDE, state.service)

	request := httptest.NewRequest(http.MethodGet, "/api"+RouteLLMAPIKeys, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode managed api key response: %v", err)
	}
	if got := payload.APIKeys["ANTHROPIC_API_KEY"]; got != "workspace-secret" {
		t.Fatalf("expected workspace .env fallback in snapshot, got %#v", payload)
	}
	if payload.Revision != 0 {
		t.Fatalf("expected unmanaged workspace .env fallback to keep revision 0, got %#v", payload)
	}
}

func TestRegisterLLMRoutesSetManagedAPIKeysUsesWriteSnapshotWithoutStoreReread(t *testing.T) {
	t.Parallel()

	configs := llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-main": {
				ID:        "openai-main",
				Model:     "gpt-4o",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}
	root := t.TempDir()
	envPath := llmconfig.ManagedAPIKeysPath(root)
	runtime, err := llmconfig.NewRuntime(configs)
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}

	var mutateOnce sync.Once
	service, err := llmconfig.NewService(llmconfig.ServiceOptions{
		ConfigPath:         llmconfig.Path(root),
		ManagedAPIKeysPath: envPath,
		Runtime:            runtime,
		ProcessEnv: func() map[string]string {
			mutateOnce.Do(func() {
				if err := os.Remove(envPath); err != nil && !os.IsNotExist(err) {
					t.Fatalf("remove managed api keys path after write: %v", err)
				}
				if err := os.MkdirAll(envPath, 0o755); err != nil {
					t.Fatalf("replace managed api keys path with directory: %v", err)
				}
			})
			return map[string]string{}
		},
	})
	if err != nil {
		t.Fatalf("new llm service: %v", err)
	}

	handler := newLLMRouteTestHandler(t, config.ModeIDE, service)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteLLMAPIKeys,
		strings.NewReader(`{"apiKeys":{"OPENAI_API_KEY":"openai-secret"},"expectedRevision":0}`),
	)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode managed api key response: %v", err)
	}
	if payload.Revision <= 0 {
		t.Fatalf("expected positive revision, got %#v", payload)
	}
	if got := payload.APIKeys["OPENAI_API_KEY"]; got != "openai-secret" {
		t.Fatalf("expected openai key in response snapshot, got %#v", payload)
	}
	info, err := os.Stat(envPath)
	if err != nil {
		t.Fatalf("stat mutated managed api key path: %v", err)
	}
	if !info.IsDir() {
		t.Fatalf("expected managed api key path to be replaced with directory, got mode %v", info.Mode())
	}
}

func TestRegisterLLMRoutesReturnsConflictForStaleManagedAPIKeyRevision(t *testing.T) {
	t.Parallel()

	state := newLLMRouteTestState(t, llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-main": {
				ID:        "openai-main",
				Model:     "gpt-4o",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}, map[string]string{})
	handler := newLLMRouteTestHandler(t, config.ModeIDE, state.service)

	firstRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteLLMAPIKeys,
		strings.NewReader(`{"apiKeys":{"OPENAI_API_KEY":"initial-secret"},"expectedRevision":0}`),
	)
	firstResponse := httptest.NewRecorder()
	handler.ServeHTTP(firstResponse, firstRequest)
	if firstResponse.Code != http.StatusOK {
		t.Fatalf("expected first write 200, got %d with body %q", firstResponse.Code, firstResponse.Body.String())
	}
	var first llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(firstResponse.Body.Bytes(), &first); err != nil {
		t.Fatalf("decode first snapshot: %v", err)
	}

	staleRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteLLMAPIKeys,
		strings.NewReader(`{"apiKeys":{"OPENAI_API_KEY":"initial-secret","ANTHROPIC_API_KEY":"stale"},"expectedRevision":0}`),
	)
	staleResponse := httptest.NewRecorder()
	handler.ServeHTTP(staleResponse, staleRequest)

	if staleResponse.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d with body %q", staleResponse.Code, staleResponse.Body.String())
	}
	var conflict llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(staleResponse.Body.Bytes(), &conflict); err != nil {
		t.Fatalf("decode conflict snapshot: %v", err)
	}
	if conflict.ErrorCode == nil || *conflict.ErrorCode != llmconfig.ManagedAPIKeysRevisionConflictErrorCode {
		t.Fatalf("expected revision conflict error code, got %#v", conflict)
	}
	if conflict.Revision != first.Revision {
		t.Fatalf("expected current revision %d, got %#v", first.Revision, conflict)
	}
}

func TestRegisterLLMRoutesReturnsTypedUnavailableForDotEnvFailures(t *testing.T) {
	t.Parallel()

	state := newLLMRouteTestState(t, llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-main": {
				ID:        "openai-main",
				Model:     "gpt-4o",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}, map[string]string{})
	if err := os.MkdirAll(state.envPath, 0o755); err != nil {
		t.Fatalf("make env path directory: %v", err)
	}
	handler := newLLMRouteTestHandler(t, config.ModeIDE, state.service)

	request := httptest.NewRequest(http.MethodGet, "/api"+RouteLLMAPIKeys, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d with body %q", response.Code, response.Body.String())
	}
	var payload llmconfig.ManagedAPIKeysSnapshot
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode unavailable payload: %v", err)
	}
	if payload.ErrorCode == nil || *payload.ErrorCode != llmconfig.ManagedAPIKeysUnavailableErrorCode {
		t.Fatalf("expected unavailable error code, got %#v", payload)
	}
}

func TestRegisterLLMRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	state := newLLMRouteTestState(t, llmconfig.AllConfigs{
		Configs:    map[string]llmconfig.Config{},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}, map[string]string{})
	handler := newLLMRouteTestHandler(t, config.ModeShare, state.service)
	testCases := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "get config", method: http.MethodGet, path: RouteLLMConfig},
		{name: "set config", method: http.MethodPost, path: RouteLLMConfig, body: `{"configs":{},"mcpServers":{}}`},
		{name: "get api keys", method: http.MethodGet, path: RouteLLMAPIKeys},
		{name: "set api keys", method: http.MethodPost, path: RouteLLMAPIKeys, body: `{"apiKeys":{},"expectedRevision":0}`},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			request := httptest.NewRequest(testCase.method, "/api"+testCase.path, strings.NewReader(testCase.body))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != "mode_forbidden" {
				t.Fatalf("expected mode_forbidden, got %#v", payload)
			}
		})
	}
}

type llmRouteTestState struct {
	envPath string
	service *llmconfig.Service
}

func newLLMRouteTestState(t *testing.T, configs llmconfig.AllConfigs, processEnv map[string]string) llmRouteTestState {
	t.Helper()

	root := t.TempDir()
	runtime, err := llmconfig.NewRuntime(configs)
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	service, err := llmconfig.NewService(llmconfig.ServiceOptions{
		ConfigPath:         llmconfig.Path(root),
		ManagedAPIKeysPath: llmconfig.ManagedAPIKeysPath(root),
		Runtime:            runtime,
		ProcessEnv: func() map[string]string {
			cloned := make(map[string]string, len(processEnv))
			for key, value := range processEnv {
				cloned[key] = value
			}
			return cloned
		},
	})
	if err != nil {
		t.Fatalf("new llm service: %v", err)
	}
	if len(configs.Configs) > 0 || len(configs.MCPServers) > 0 || configs.DefaultConfigID != "" {
		if _, _, err := service.SaveConfig(configs); err != nil {
			t.Fatalf("seed llm config: %v", err)
		}
	}
	return llmRouteTestState{
		envPath: llmconfig.ManagedAPIKeysPath(root),
		service: service,
	}
}

func newLLMRouteTestHandler(t *testing.T, mode config.Mode, service *llmconfig.Service) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterLLMRoutes(r, LLMRouteDependencies{
				ModePolicy:   modes.NewPolicy(mode),
				Service:      service,
				WebsocketHub: realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}),
			}); err != nil {
				t.Fatalf("register llm routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}
