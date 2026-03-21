package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/externalagentconfigs"
	"setta/internal/modes"
	"setta/internal/realtime"
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

	store, service := newExternalAgentConfigRouteTestService(t)
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
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	// Config read should return the normalized list directly from the Go owner.
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

func TestRegisterExternalAgentConfigRoutesGetsConfig(t *testing.T) {
	t.Parallel()

	store, service := newExternalAgentConfigRouteTestService(t)
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
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetExternalAgentConfig, bytes.NewBufferString(`{"configId":"config-1"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var configPayload externalagentconfigs.Config
	if err := json.Unmarshal(response.Body.Bytes(), &configPayload); err != nil {
		t.Fatalf("decode config: %v", err)
	}
	if configPayload.ID != "config-1" || configPayload.Name != "OpenCode Server" {
		t.Fatalf("unexpected config %#v", configPayload)
	}
}

func TestRegisterExternalAgentConfigRoutesReturnsHealth(t *testing.T) {
	t.Parallel()

	store, service := newExternalAgentConfigRouteTestService(t)
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
	nodeVersion := "v18.0.0"
	sdkVersion := "1.1.36"
	cliVersion := "codex 0.25.1"
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
				NodeVersion: &nodeVersion,
				SDKVersion:  &sdkVersion,
				EnvVars: externalagentconfigs.EnvVarStatus{
					Present: []string{"OPENAI_API_KEY"},
					Missing: []string{"ANTHROPIC_API_KEY"},
				},
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
				CLIVersion: &cliVersion,
			},
		},
	}
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, checker)

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
	if payload[0].NodeVersion == nil || *payload[0].NodeVersion != nodeVersion {
		t.Fatalf("expected opencode nodeVersion mapping, got %#v", payload[0])
	}
	if payload[0].SDKVersion == nil || *payload[0].SDKVersion != sdkVersion {
		t.Fatalf("expected opencode sdkVersion mapping, got %#v", payload[0])
	}
	if payload[1].NodePath != nil {
		t.Fatalf("expected non-opencode nodePath to remain nil, got %#v", payload[1])
	}
	if payload[1].CLIVersion == nil || *payload[1].CLIVersion != cliVersion {
		t.Fatalf("expected codex cliVersion mapping, got %#v", payload[1])
	}
	if got := payload[0].EnvVars; len(got.Present) != 1 || got.Present[0] != "OPENAI_API_KEY" || len(got.Missing) != 1 || got.Missing[0] != "ANTHROPIC_API_KEY" {
		t.Fatalf("expected envVars mapping from checker status, got %#v", got)
	}
	if len(checker.seenConfigIDs) != 2 || checker.seenConfigIDs[0] != "config-1" || checker.seenConfigIDs[1] != "config-2" {
		t.Fatalf("expected checker calls in config order, got %#v", checker.seenConfigIDs)
	}
}

func TestRegisterExternalAgentConfigRoutesAllowDeploymentReadsWhenLLMAccessEnabled(t *testing.T) {
	t.Parallel()

	store, service := newExternalAgentConfigRouteTestService(t)
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

	checker := &externalAgentConfigRouteStubChecker{
		statusByConfigID: map[string]externalagentconfigs.Status{
			"config-1": {
				ConfigID:  "config-1",
				Name:      "OpenCode Server",
				ToolType:  externalagentconfigs.ToolTypeOpenCode,
				RunMode:   externalagentconfigs.RunModeServer,
				Supported: true,
				Available: true,
				Issues:    []string{},
			},
		},
	}
	testCases := []struct {
		name string
		mode config.Mode
		path string
		body string
	}{
		{name: "share list", mode: config.ModeShare, path: RouteGetExternalAgentConfigs},
		{name: "share get", mode: config.ModeShare, path: RouteGetExternalAgentConfig, body: `{"configId":"config-1"}`},
		{name: "share health", mode: config.ModeShare, path: RouteGetExternalAgentHealth},
		{name: "app list", mode: config.ModeApp, path: RouteGetExternalAgentConfigs},
		{name: "app get", mode: config.ModeApp, path: RouteGetExternalAgentConfig, body: `{"configId":"config-1"}`},
		{name: "app health", mode: config.ModeApp, path: RouteGetExternalAgentHealth},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:   testCase.mode,
				Policy: map[string]any{"allowLLM": true},
			})
			handler := newExternalAgentConfigRouteTestHandler(t, testCase.mode, service, checker, deploymentRuntime)

			method := http.MethodGet
			var body io.Reader
			if testCase.body != "" {
				method = http.MethodPost
				body = bytes.NewBufferString(testCase.body)
			}
			request := httptest.NewRequest(method, "/api"+testCase.path, body)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("expected 200 for %s, got %d with body %q", testCase.path, response.Code, response.Body.String())
			}
		})
	}
}

func TestRegisterExternalAgentConfigRoutesBlockDeploymentReadsWhenLLMAccessDisabled(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	checker := &externalAgentConfigRouteStubChecker{}
	testCases := []struct {
		name string
		mode config.Mode
		path string
		body string
	}{
		{name: "share list", mode: config.ModeShare, path: RouteGetExternalAgentConfigs},
		{name: "share get", mode: config.ModeShare, path: RouteGetExternalAgentConfig, body: `{"configId":"config-1"}`},
		{name: "share health", mode: config.ModeShare, path: RouteGetExternalAgentHealth},
		{name: "app list", mode: config.ModeApp, path: RouteGetExternalAgentConfigs},
		{name: "app get", mode: config.ModeApp, path: RouteGetExternalAgentConfig, body: `{"configId":"config-1"}`},
		{name: "app health", mode: config.ModeApp, path: RouteGetExternalAgentHealth},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode: testCase.mode,
			})
			handler := newExternalAgentConfigRouteTestHandler(t, testCase.mode, service, checker, deploymentRuntime)

			method := http.MethodGet
			var body io.Reader
			if testCase.body != "" {
				method = http.MethodPost
				body = bytes.NewBufferString(testCase.body)
			}
			request := httptest.NewRequest(method, "/api"+testCase.path, body)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403 for %s, got %d with body %q", testCase.path, response.Code, response.Body.String())
			}
			assertExternalAgentConfigRouteErrorCode(t, response.Body.Bytes(), "llm_access_forbidden")
		})
	}
}

func TestRegisterExternalAgentConfigRoutesCreatesConfig(t *testing.T) {
	t.Parallel()

	store, service := newExternalAgentConfigRouteTestService(t)
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	// Create should hydrate defaults through the service and return the saved config.
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateExternalAgentConfig, bytes.NewBufferString(`{
	  "name": "Codex",
	  "toolType": "codex",
	  "runMode": "app_server"
	}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var created externalagentconfigs.Config
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created config: %v", err)
	}
	if created.ID == "" {
		t.Fatalf("expected created id, got %#v", created)
	}
	if created.SettingsAllowSettaEdits != true {
		t.Fatalf("expected create default settingsAllowSettaEdits=true, got %#v", created)
	}
	if created.ApprovalPolicy == nil || *created.ApprovalPolicy != "on-failure" {
		t.Fatalf("expected codex approval default, got %#v", created)
	}

	configs, err := store.List()
	if err != nil {
		t.Fatalf("list configs: %v", err)
	}
	if len(configs) != 1 || configs[0].ID != created.ID {
		t.Fatalf("expected stored created config, got %#v", configs)
	}
}

func TestRegisterExternalAgentConfigRoutesCreateClaudeInitializesSharedSettings(t *testing.T) {
	t.Parallel()

	_, service, workspaceRoot := newExternalAgentConfigRouteTestServiceWithWorkspace(t)
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateExternalAgentConfig, bytes.NewBufferString(`{
	  "name": "Claude",
	  "toolType": "claude_code",
	  "runMode": "sdk",
	  "settingsMode": "managed_local"
	}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	settingsPath := filepath.Join(workspaceRoot, ".claude", "settings.local.json")
	content, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("read claude shared settings: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode claude shared settings: %v", err)
	}
	if _, ok := payload["permissions"].(map[string]any); !ok {
		t.Fatalf("expected managed claude permissions block, got %#v", payload)
	}
}

func TestRegisterExternalAgentConfigRoutesUpdatesConfig(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	created, err := service.Create(externalagentconfigs.Config{
		ID:                 "config-1",
		Name:               "Codex",
		ToolType:           externalagentconfigs.ToolTypeCodex,
		RunMode:            externalagentconfigs.RunModeAppServer,
		WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	// Update should replace the persisted config by id through the Go mutation owner.
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateExternalAgentConfig, bytes.NewBufferString(`{
	  "config": {
	    "id": "config-1",
	    "name": "Codex v2",
	    "toolType": "codex",
	    "runMode": "app_server",
	    "approvalPolicy": "never",
	    "settingsAllowSettaEdits": true,
	    "workingDirStrategy": "project_root"
	  }
	}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var updated externalagentconfigs.Config
	if err := json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode updated config: %v", err)
	}
	if updated.ID != created.ID || updated.Name != "Codex v2" {
		t.Fatalf("expected updated config response, got %#v", updated)
	}
	if updated.ApprovalPolicy == nil || *updated.ApprovalPolicy != "never" {
		t.Fatalf("expected updated approval policy, got %#v", updated)
	}
}

func TestRegisterExternalAgentConfigRoutesDeletesConfig(t *testing.T) {
	t.Parallel()

	store, service := newExternalAgentConfigRouteTestService(t)
	created, err := service.Create(externalagentconfigs.Config{
		ID:                 "config-1",
		Name:               "OpenCode",
		ToolType:           externalagentconfigs.ToolTypeOpenCode,
		RunMode:            externalagentconfigs.RunModeSDK,
		WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
	})
	if err != nil {
		t.Fatalf("create config: %v", err)
	}
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	// Delete should remove the config and return the existing null JSON success payload.
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteExternalAgentConfig, bytes.NewBufferString(`{"configId":"config-1"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	configs, err := store.List()
	if err != nil {
		t.Fatalf("list configs: %v", err)
	}
	if len(configs) != 0 {
		t.Fatalf("expected config deletion, got %#v", configs)
	}
	if string(bytes.TrimSpace(response.Body.Bytes())) != "null" {
		t.Fatalf("expected null delete response, got %q", response.Body.String())
	}
	if created.ID == "" {
		t.Fatalf("expected created config id to remain populated")
	}
}

func TestRegisterExternalAgentConfigRoutesRejectInvalidJSONAcrossCRUD(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	// All mutation routes should reject malformed JSON consistently.
	for _, path := range []string{
		RouteCreateExternalAgentConfig,
		RouteUpdateExternalAgentConfig,
		RouteDeleteExternalAgentConfig,
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+path, bytes.NewBufferString(`{"bad"`))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)

		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for %s, got %d with body %q", path, response.Code, response.Body.String())
		}
		var payload errorResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode error payload for %s: %v", path, err)
		}
		if payload.Error.Code != "invalid_json" {
			t.Fatalf("expected invalid_json for %s, got %#v", path, payload)
		}
	}
}

func TestRegisterExternalAgentConfigRoutesRequireTopLevelConfigOnUpdate(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	// Update keeps the existing top-level config envelope requirement.
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateExternalAgentConfig, bytes.NewBufferString(`{}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	assertExternalAgentConfigRouteErrorCode(t, response.Body.Bytes(), "external_agent_config_required")
}

func TestRegisterExternalAgentConfigRoutesRequireConfigIDOnDelete(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	// Delete should fail fast when the caller does not provide configId.
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteExternalAgentConfig, bytes.NewBufferString(`{}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	assertExternalAgentConfigRouteErrorCode(t, response.Body.Bytes(), "config_id_required")
}

func TestRegisterExternalAgentConfigRoutesRequireConfigIDOnGet(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetExternalAgentConfig, bytes.NewBufferString(`{}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	assertExternalAgentConfigRouteErrorCode(t, response.Body.Bytes(), "config_id_required")
}

func TestRegisterExternalAgentConfigRoutesRejectUnknownPluginAdapterField(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	// The pluginAdapterId field is no longer part of the Go-owned route contract.
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateExternalAgentConfig, bytes.NewBufferString(`{
	  "name": "Codex",
	  "toolType": "codex",
	  "pluginAdapterId": "acme-plugin:openhands",
	  "runMode": "app_server"
	}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	assertExternalAgentConfigRouteErrorCode(t, response.Body.Bytes(), "invalid_json")
}

func TestRegisterExternalAgentConfigRoutesReturnNotFoundForMissingConfig(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	// Missing config ids should map to the explicit not-found transport error.
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteExternalAgentConfig, bytes.NewBufferString(`{"configId":"missing"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	assertExternalAgentConfigRouteErrorCode(t, response.Body.Bytes(), "external_agent_config_not_found")
}

func TestRegisterExternalAgentConfigRoutesReturnNotFoundForMissingGetConfig(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetExternalAgentConfig, bytes.NewBufferString(`{"configId":"missing"}`))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	assertExternalAgentConfigRouteErrorCode(t, response.Body.Bytes(), "external_agent_config_not_found")
}

func TestRegisterExternalAgentConfigRoutesReturnsInternalErrorForInvalidStorePayload(t *testing.T) {
	t.Parallel()

	store, service := newExternalAgentConfigRouteTestService(t)
	if err := os.WriteFile(store.Path(), []byte(`{"id":"bad"}`), 0o644); err != nil {
		t.Fatalf("write invalid payload: %v", err)
	}
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{})

	// Store decode failures should stay inside the route boundary and surface as internal_error.
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetExternalAgentConfigs, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d with body %q", response.Code, response.Body.String())
	}
	assertExternalAgentConfigRouteErrorCode(t, response.Body.Bytes(), "internal_error")
}

func TestRegisterExternalAgentConfigRoutesReturnsInternalErrorForCheckerFailure(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	if _, err := service.Create(externalagentconfigs.Config{
		ID:                 "config-1",
		Name:               "Codex",
		ToolType:           externalagentconfigs.ToolTypeCodex,
		RunMode:            externalagentconfigs.RunModeAppServer,
		WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
	}); err != nil {
		t.Fatalf("create config: %v", err)
	}
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeIDE, service, &externalAgentConfigRouteStubChecker{
		err: errors.New("boom"),
	})

	// Checker failures should not leak implementation details through the HTTP surface.
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetExternalAgentHealth, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d with body %q", response.Code, response.Body.String())
	}
	assertExternalAgentConfigRouteErrorCode(t, response.Body.Bytes(), "internal_error")
}

func TestRegisterExternalAgentConfigRoutesBlockShareModeMutations(t *testing.T) {
	t.Parallel()

	_, service := newExternalAgentConfigRouteTestService(t)
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Mode:   config.ModeShare,
		Policy: map[string]any{"allowLLM": true},
	})
	handler := newExternalAgentConfigRouteTestHandler(t, config.ModeShare, service, &externalAgentConfigRouteStubChecker{}, deploymentRuntime)

	// External-agent-config mutations remain IDE-only in share mode.
	for _, route := range []struct {
		method string
		path   string
		body   string
	}{
		{method: http.MethodPost, path: RouteCreateExternalAgentConfig, body: `{}`},
		{method: http.MethodPost, path: RouteUpdateExternalAgentConfig, body: `{}`},
		{method: http.MethodPost, path: RouteDeleteExternalAgentConfig, body: `{}`},
	} {
		request := httptest.NewRequest(route.method, "/api"+route.path, bytes.NewBufferString(route.body))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)

		if response.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for %s, got %d with body %q", route.path, response.Code, response.Body.String())
		}
		assertExternalAgentConfigRouteErrorCode(t, response.Body.Bytes(), "mode_forbidden")
	}
}

func assertExternalAgentConfigRouteErrorCode(t *testing.T, body []byte, expected string) {
	t.Helper()

	var payload errorResponse
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != expected {
		t.Fatalf("expected %s, got %#v", expected, payload)
	}
}

func newExternalAgentConfigRouteTestHandler(
	t *testing.T,
	mode config.Mode,
	service *externalagentconfigs.Service,
	checker externalagentconfigs.Checker,
	deploymentRuntimes ...*deployments.Runtime,
) http.Handler {
	t.Helper()

	var deploymentRuntime *deployments.Runtime
	if len(deploymentRuntimes) != 0 {
		deploymentRuntime = deploymentRuntimes[0]
	}
	if deploymentRuntime == nil && (mode == config.ModeShare || mode == config.ModeApp) {
		deploymentRuntime = newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
			Mode: mode,
		})
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterExternalAgentConfigRoutes(r, ExternalAgentConfigRouteDependencies{
				ModePolicy:   modes.NewPolicy(mode),
				Configs:      service,
				Preflight:    checker,
				Deployment:   deploymentRuntime,
				WebsocketHub: realtime.NewWebsocketHub(realtime.WebsocketHubOptions{}),
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

func newExternalAgentConfigRouteTestService(t *testing.T) (*externalagentconfigs.Store, *externalagentconfigs.Service) {
	t.Helper()

	store, service, _ := newExternalAgentConfigRouteTestServiceWithWorkspace(t)
	return store, service
}

func newExternalAgentConfigRouteTestServiceWithWorkspace(t *testing.T) (*externalagentconfigs.Store, *externalagentconfigs.Service, string) {
	t.Helper()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	if err := os.MkdirAll(settaFilesRoot, 0o755); err != nil {
		t.Fatalf("mkdir setta files root: %v", err)
	}
	store, err := externalagentconfigs.NewStore(settaFilesRoot)
	if err != nil {
		t.Fatalf("new external agent config store: %v", err)
	}
	service, err := externalagentconfigs.NewService(externalagentconfigs.ServiceOptions{
		Configs:        store,
		SettaFilesRoot: settaFilesRoot,
		WorkspaceRoot:  workspaceRoot,
		SettaServerURL: "http://127.0.0.1:8000/mcp",
	})
	if err != nil {
		t.Fatalf("new external agent config service: %v", err)
	}
	return store, service, workspaceRoot
}
