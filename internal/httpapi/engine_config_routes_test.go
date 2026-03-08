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
	if configs[1].ExternalAgentConfigID == nil || *configs[1].ExternalAgentConfigID != externalConfigID {
		t.Fatalf("expected external agent config id to roundtrip, got %#v", configs[1])
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

func TestRegisterEngineConfigRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	store := newEngineConfigRouteTestStore(t)
	handler := newEngineConfigRouteTestHandler(t, config.ModeShare, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateEngineConfig, strings.NewReader(`{}`))
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
}

func newEngineConfigRouteTestHandler(t *testing.T, mode config.Mode, store *agentruns.EngineStore) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterEngineConfigRoutes(r, EngineConfigRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Engines:    store,
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
