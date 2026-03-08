package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/externalagentconfigs"
	"setta/internal/modes"
)

type externalAgentConfigRouteStubChecker struct {
	statusByConfigID map[string]externalagentconfigs.Status
	err              error
	seenConfigIDs    []string
}

func (s *externalAgentConfigRouteStubChecker) Check(config externalagentconfigs.Config) (externalagentconfigs.Status, error) {
	if s.err != nil {
		return externalagentconfigs.Status{}, s.err
	}
	s.seenConfigIDs = append(s.seenConfigIDs, config.ID)
	if status, ok := s.statusByConfigID[config.ID]; ok {
		return status, nil
	}
	return externalagentconfigs.Status{
		ConfigID:  config.ID,
		Name:      config.Name,
		ToolType:  config.ToolType,
		RunMode:   config.RunMode,
		Supported: true,
		Available: true,
		Issues:    []string{},
	}, nil
}

func TestRegisterExternalAgentConfigRoutesListsConfigs(t *testing.T) {
	t.Parallel()

	store := newExternalAgentConfigRouteTestStore(t)
	baseURL := "http://localhost:18181"
	if err := store.Write([]externalagentconfigs.Config{
		{
			ID:                 "config-1",
			Name:               "OpenCode Server",
			ToolType:           externalagentconfigs.ToolTypeOpenCode,
			RunMode:            externalagentconfigs.RunModeServer,
			BaseURL:            &baseURL,
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		},
	}); err != nil {
		t.Fatalf("write configs: %v", err)
	}
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, store, &externalAgentConfigRouteStubChecker{})

	// Config read should return the normalized list directly from the Go store.
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetExternalAgentConfigs, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var configs []externalagentconfigs.Config
	if err := json.Unmarshal(response.Body.Bytes(), &configs); err != nil {
		t.Fatalf("decode configs: %v", err)
	}
	if len(configs) != 1 {
		t.Fatalf("expected one config, got %#v", configs)
	}
	if configs[0].ToolType != externalagentconfigs.ToolTypeOpenCode {
		t.Fatalf("expected opencode config, got %#v", configs[0])
	}
}

func TestRegisterExternalAgentConfigRoutesReturnsHealth(t *testing.T) {
	t.Parallel()

	store := newExternalAgentConfigRouteTestStore(t)
	baseURL := "http://localhost:18181"
	if err := store.Write([]externalagentconfigs.Config{
		{
			ID:                 "config-1",
			Name:               "OpenCode Server",
			ToolType:           externalagentconfigs.ToolTypeOpenCode,
			RunMode:            externalagentconfigs.RunModeServer,
			BaseURL:            &baseURL,
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		},
		{
			ID:                 "config-2",
			Name:               "Codex",
			ToolType:           externalagentconfigs.ToolTypeCodex,
			RunMode:            externalagentconfigs.RunModeAppServer,
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		},
	}); err != nil {
		t.Fatalf("write configs: %v", err)
	}
	nodePath := "/usr/local/bin/node"
	workingDir := "/workspace"
	checker := &externalAgentConfigRouteStubChecker{
		statusByConfigID: map[string]externalagentconfigs.Status{
			"config-1": {
				ConfigID:    "config-1",
				Name:        "OpenCode Server",
				ToolType:    externalagentconfigs.ToolTypeOpenCode,
				RunMode:     externalagentconfigs.RunModeServer,
				Supported:   true,
				Available:   false,
				Issues:      []string{"Server mode requires baseUrl."},
				BaseURL:     &baseURL,
				WorkingDir:  &workingDir,
				CommandPath: &nodePath,
			},
			"config-2": {
				ConfigID:   "config-2",
				Name:       "Codex",
				ToolType:   externalagentconfigs.ToolTypeCodex,
				RunMode:    externalagentconfigs.RunModeAppServer,
				Supported:  true,
				Available:  true,
				Issues:     []string{},
				WorkingDir: &workingDir,
			},
		},
	}
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, store, checker)

	// Health read should preserve config order and adapt checker output to the frontend contract.
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetExternalAgentHealth, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload []externalAgentHealthResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode health payload: %v", err)
	}
	if len(payload) != 2 {
		t.Fatalf("expected two health entries, got %#v", payload)
	}
	if payload[0].ConfigID != "config-1" || payload[1].ConfigID != "config-2" {
		t.Fatalf("expected config order to match store order, got %#v", payload)
	}
	if payload[0].NodePath == nil || *payload[0].NodePath != nodePath {
		t.Fatalf("expected opencode nodePath mapping, got %#v", payload[0])
	}
	if payload[1].NodePath != nil {
		t.Fatalf("expected non-opencode nodePath to remain nil, got %#v", payload[1])
	}
	if len(payload[0].EnvVars.Present) != 0 || len(payload[0].EnvVars.Missing) != 0 {
		t.Fatalf("expected empty envVars defaults, got %#v", payload[0].EnvVars)
	}
	if len(checker.seenConfigIDs) != 2 || checker.seenConfigIDs[0] != "config-1" || checker.seenConfigIDs[1] != "config-2" {
		t.Fatalf("expected checker calls in config order, got %#v", checker.seenConfigIDs)
	}
}

func TestRegisterExternalAgentConfigRoutesReturnsInternalErrorForInvalidStorePayload(t *testing.T) {
	t.Parallel()

	store := newExternalAgentConfigRouteTestStore(t)
	if err := os.WriteFile(store.Path(), []byte(`{"id":"bad"}`), 0o644); err != nil {
		t.Fatalf("write invalid payload: %v", err)
	}
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, store, &externalAgentConfigRouteStubChecker{})

	// Store decode failures should stay inside the route boundary and surface as internal_error.
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetExternalAgentConfigs, nil)
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

func TestRegisterExternalAgentConfigRoutesReturnsInternalErrorForCheckerFailure(t *testing.T) {
	t.Parallel()

	store := newExternalAgentConfigRouteTestStore(t)
	if err := store.Write([]externalagentconfigs.Config{
		{
			ID:                 "config-1",
			Name:               "Codex",
			ToolType:           externalagentconfigs.ToolTypeCodex,
			RunMode:            externalagentconfigs.RunModeAppServer,
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		},
	}); err != nil {
		t.Fatalf("write configs: %v", err)
	}
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, store, &externalAgentConfigRouteStubChecker{
		err: errors.New("boom"),
	})

	// Checker failures should not leak implementation details through the HTTP surface.
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetExternalAgentHealth, nil)
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

func TestRegisterExternalAgentConfigRoutesBlockShareMode(t *testing.T) {
	t.Parallel()

	store := newExternalAgentConfigRouteTestStore(t)
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeShare, store, &externalAgentConfigRouteStubChecker{})

	// Both hydration routes are IDE-only and should reject share mode consistently.
	for _, path := range []string{RouteGetExternalAgentConfigs, RouteGetExternalAgentHealth} {
		request := httptest.NewRequest(http.MethodGet, "/api"+path, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)

		if response.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for %s, got %d with body %q", path, response.Code, response.Body.String())
		}
		var payload errorResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode error payload for %s: %v", path, err)
		}
		if payload.Error.Code != "mode_forbidden" {
			t.Fatalf("expected mode_forbidden for %s, got %#v", path, payload)
		}
	}
}

func newExternalAgentConfigRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	store *externalagentconfigs.Store,
	checker externalagentconfigs.Checker,
) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterExternalAgentConfigRoutes(r, ExternalAgentConfigRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Configs:    store,
				Preflight:  checker,
			}); err != nil {
				t.Fatalf("register external agent config routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newExternalAgentConfigRouteTestStore(t *testing.T) *externalagentconfigs.Store {
	t.Helper()

	store, err := externalagentconfigs.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new external agent config store: %v", err)
	}
	return store
}
