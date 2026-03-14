package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/llmconfig"
	"setta/internal/modes"
)

func TestRegisterEngineConfigRoutesListsConfigs(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	thinking := true
	settaConfigID := "claude-sonnet"
	externalConfigID := "external-codex"
	if err := store.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-1",
			Name:             "Claude",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &settaConfigID,
			Defaults: agentruns.EngineConfigDefaults{
				Thinking: &thinking,
			},
		},
		{
			ID:                    "engine-2",
			Name:                  "Codex",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: &externalConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetEngineConfigs, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var configs []agentruns.EngineConfig
	if err := json.Unmarshal(response.Body.Bytes(), &configs); err != nil {
		t.Fatalf("decode engine configs: %v", err)
	}
	if len(configs) != 2 {
		t.Fatalf("expected two engine configs, got %#v", configs)
	}
	if configs[0].ID != "engine-1" || configs[1].ID != "engine-2" {
		t.Fatalf("expected persisted engine order, got %#v", configs)
	}
	if configs[0].Defaults.Thinking == nil || !*configs[0].Defaults.Thinking {
		t.Fatalf("expected normalized defaults to roundtrip, got %#v", configs[0])
	}
	if configs[0].RuntimeSupport == nil || !configs[0].RuntimeSupport.Thinking {
		t.Fatalf("expected managed runtime support in response, got %#v", configs[0])
	}
	if configs[1].ExternalAgentConfigID == nil || *configs[1].ExternalAgentConfigID != externalConfigID {
		t.Fatalf("expected external agent config id to roundtrip, got %#v", configs[1])
	}
	if configs[1].RuntimeSupport == nil || !configs[1].RuntimeSupport.Thinking {
		t.Fatalf("expected external runtime support in response, got %#v", configs[1])
	}
}

func TestRegisterEngineConfigRoutesReturnsEmptyList(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetEngineConfigs, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var configs []agentruns.EngineConfig
	if err := json.Unmarshal(response.Body.Bytes(), &configs); err != nil {
		t.Fatalf("decode engine configs: %v", err)
	}
	if len(configs) != 0 {
		t.Fatalf("expected empty engine config list, got %#v", configs)
	}
}

func TestRegisterEngineConfigRoutesReturnsInternalErrorForInvalidPayload(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	if err := os.WriteFile(store.Path(), []byte(`{"id":"bad"}`), 0o644); err != nil {
		t.Fatalf("write invalid payload: %v", err)
	}
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetEngineConfigs, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "internal_error" {
		t.Fatalf("expected internal_error, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesGetsConfig(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	settaConfigID := "claude-sonnet"
	if err := store.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-1",
			Name:             "Claude",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &settaConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetEngineConfig,
		strings.NewReader(`{"configId":"engine-1"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var configPayload agentruns.EngineConfig
	if err := json.Unmarshal(response.Body.Bytes(), &configPayload); err != nil {
		t.Fatalf("decode engine config: %v", err)
	}
	if configPayload.ID != "engine-1" || configPayload.Name != "Claude" {
		t.Fatalf("unexpected engine config %#v", configPayload)
	}
}

func TestRegisterEngineConfigRoutesAdvertisesGeminiThinkingRuntimeSupport(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	settaConfigID := "gemini-thinking"
	if err := store.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-gemini",
			Name:             "Gemini Thinking",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &settaConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetEngineConfig,
		strings.NewReader(`{"configId":"engine-gemini"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var configPayload agentruns.EngineConfig
	if err := json.Unmarshal(response.Body.Bytes(), &configPayload); err != nil {
		t.Fatalf("decode engine config: %v", err)
	}
	if configPayload.RuntimeSupport == nil || !configPayload.RuntimeSupport.Thinking {
		t.Fatalf("expected Gemini runtime support in response, got %#v", configPayload)
	}
}

func TestRegisterEngineConfigRoutesCreatesConfig(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateEngineConfig,
		strings.NewReader(`{"name":"Codex","engineType":"external_agent","externalAgentConfigId":"external-codex"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var created agentruns.EngineConfig
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created config: %v", err)
	}
	if strings.TrimSpace(created.ID) == "" {
		t.Fatalf("expected generated config id, got %#v", created)
	}
	if created.Name != "Codex" || created.EngineType != agentruns.EngineTypeExternalAgent {
		t.Fatalf("unexpected created config %#v", created)
	}
	if created.ExternalAgentConfigID == nil || *created.ExternalAgentConfigID != "external-codex" {
		t.Fatalf("expected created external agent id, got %#v", created)
	}

	persisted, err := store.Get(created.ID)
	if err != nil {
		t.Fatalf("load created config: %v", err)
	}
	if persisted.Name != "Codex" {
		t.Fatalf("expected persisted config, got %#v", persisted)
	}
}

func TestRegisterEngineConfigRoutesUpdatesConfig(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	settaConfigID := "claude-sonnet"
	if err := store.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-1",
			Name:             "Claude",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &settaConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpdateEngineConfig,
		strings.NewReader(`{"config":{"id":"engine-1","name":"Codex","engineType":"external_agent","externalAgentConfigId":"external-codex"}}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var updated agentruns.EngineConfig
	if err := json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode updated config: %v", err)
	}
	if updated.Name != "Codex" || updated.EngineType != agentruns.EngineTypeExternalAgent {
		t.Fatalf("unexpected updated engine config %#v", updated)
	}
	if updated.ExternalAgentConfigID == nil || *updated.ExternalAgentConfigID != "external-codex" {
		t.Fatalf("expected updated external agent config id, got %#v", updated)
	}

	persisted, err := store.Get("engine-1")
	if err != nil {
		t.Fatalf("load persisted engine config: %v", err)
	}
	if persisted.Name != "Codex" || persisted.EngineType != agentruns.EngineTypeExternalAgent {
		t.Fatalf("unexpected persisted engine config %#v", persisted)
	}
}

func TestRegisterEngineConfigRoutesDeletesConfig(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	if err := store.Write([]agentruns.EngineConfig{
		{
			ID:         "engine-1",
			Name:       "Claude",
			EngineType: agentruns.EngineTypeSettaLLM,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteEngineConfig,
		strings.NewReader(`{"configId":"engine-1"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	configs, err := store.List()
	if err != nil {
		t.Fatalf("list engine configs: %v", err)
	}
	if len(configs) != 0 {
		t.Fatalf("expected deleted engine config, got %#v", configs)
	}
}

func TestRegisterEngineConfigRoutesReturnsNotFoundForMissingConfig(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpdateEngineConfig,
		strings.NewReader(`{"config":{"id":"engine-missing","name":"Claude","engineType":"setta_llm"}}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "engine_config_not_found" {
		t.Fatalf("expected engine_config_not_found, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesReturnsNotFoundForMissingGetConfig(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetEngineConfig,
		strings.NewReader(`{"configId":"engine-missing"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "engine_config_not_found" {
		t.Fatalf("expected engine_config_not_found, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesReturnsNotFoundForMissingDeleteConfig(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteEngineConfig,
		strings.NewReader(`{"configId":"engine-missing"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "engine_config_not_found" {
		t.Fatalf("expected engine_config_not_found, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesRejectsInvalidJSON(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateEngineConfig, strings.NewReader(`{"config"`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesRejectsMissingGetConfigID(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetEngineConfig, strings.NewReader(`{}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "config_id_required" {
		t.Fatalf("expected config_id_required, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesRejectsMissingCreateName(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateEngineConfig,
		strings.NewReader(`{"engineType":"setta_llm"}`),
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
	if payload.Error.Code != "engine_config_name_required" {
		t.Fatalf("expected engine_config_name_required, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesRejectsMissingConfigPayload(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateEngineConfig, strings.NewReader(`{}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "engine_config_required" {
		t.Fatalf("expected engine_config_required, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesRejectsMissingDeleteConfigID(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteEngineConfig, strings.NewReader(`{}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "config_id_required" {
		t.Fatalf("expected config_id_required, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesRejectsInvalidConfigPayload(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	if err := store.Write([]agentruns.EngineConfig{
		{
			ID:         "engine-1",
			Name:       "Claude",
			EngineType: agentruns.EngineTypeSettaLLM,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpdateEngineConfig,
		strings.NewReader(`{"config":{"id":"engine-1","name":"Claude"}}`),
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
	if payload.Error.Code != "invalid_engine_config" {
		t.Fatalf("expected invalid_engine_config, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesRejectsInvalidCreatedConfigPayload(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateEngineConfig,
		strings.NewReader(`{"name":"Claude","engineType":"unsupported"}`),
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
	if payload.Error.Code != "invalid_engine_config" {
		t.Fatalf("expected invalid_engine_config, got %#v", payload)
	}
}

func TestRegisterEngineConfigRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeShare, store)
	testCases := []struct {
		name string
		path string
		body string
	}{
		{name: "get", path: RouteGetEngineConfig, body: `{"configId":"engine-1"}`},
		{name: "create", path: RouteCreateEngineConfig, body: `{"name":"Claude","engineType":"setta_llm"}`},
		{name: "update", path: RouteUpdateEngineConfig, body: `{"config":{"id":"engine-1","name":"Claude","engineType":"setta_llm"}}`},
		{name: "delete", path: RouteDeleteEngineConfig, body: `{"configId":"engine-1"}`},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			request := httptest.NewRequest(http.MethodPost, "/api"+testCase.path, strings.NewReader(testCase.body))
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

func newEngineConfigRouteTestHandler(t *testing.T, mode config.Mode, store *agentruns.EngineStore) http.Handler {
	t.Helper()

	llmRuntime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"claude-sonnet": {
				ID:       "claude-sonnet",
				Model:    "claude-sonnet-4-5-20250929",
				Provider: "anthropic",
				OtherParams: map[string]any{
					"max_tokens": 4096,
					"thinking": map[string]any{
						"type":          "enabled",
						"budget_tokens": 1024,
					},
				},
			},
			"gemini-thinking": {
				ID:       "gemini-thinking",
				Model:    "gemini-2.5-pro",
				Provider: "gemini",
				OtherParams: map[string]any{
					"thinking_config": map[string]any{
						"thinking_budget": 128,
						"thinking_level":  "medium",
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterEngineConfigRoutes(r, EngineConfigRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Engines:    store,
				LLM:        llmRuntime,
			}); err != nil {
				t.Fatalf("register engine config routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newEngineConfigRouteTestStore(t *testing.T) *agentruns.EngineStore {
	t.Helper()

	store, err := agentruns.NewEngineStore(t.TempDir())
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	return store
}
