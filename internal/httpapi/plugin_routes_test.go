package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/modes"
	"setta/internal/plugins"
)

func TestRegisterPluginRoutesReturnsRuntimePayload(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "full")
	writePluginRouteStateFile(t, roots.settaFilesRoot, map[string]any{
		"pluginConfigById": map[string]any{
			"workspace:setta-fixture-full": map[string]any{
				"enabled": true,
				"label":   "route-fixture",
			},
		},
	})

	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RoutePluginsRuntime, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload plugins.RuntimeResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode plugin runtime response: %v", err)
	}
	if len(payload.List.Plugins) != 1 {
		t.Fatalf("expected one active list plugin, got %#v", payload.List.Plugins)
	}
	if len(payload.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", payload.Status.Plugins)
	}
	if payload.List.Plugins[0].PluginID != "setta-fixture-full" {
		t.Fatalf("expected full fixture plugin id, got %#v", payload.List.Plugins[0].PluginID)
	}
	if payload.List.Plugins[0].Frontend.EntrypointURL == nil || !strings.Contains(*payload.List.Plugins[0].Frontend.EntrypointURL, "/plugins/setta-fixture-full/frontend/src/index.js?v=") {
		t.Fatalf("expected versioned entrypoint url, got %#v", payload.List.Plugins[0].Frontend.EntrypointURL)
	}
	if got := payload.List.Plugins[0].Config.CurrentConfig["label"]; got != "route-fixture" {
		t.Fatalf("expected current config label route-fixture, got %#v", got)
	}
}

func TestBuildPluginAssetURLUsesPluginRootRouteConstantAndEscapesSegments(t *testing.T) {
	t.Parallel()

	digest := "abc123"
	got := buildPluginAssetURL("acme.plugin", "frontend/dist/# entry.js", &digest)

	expected := "/plugins/acme.plugin/frontend/dist/%23%20entry.js?v=abc123"
	if got != expected {
		t.Fatalf("expected plugin asset url %q, got %q", expected, got)
	}
}

func TestRegisterPluginRoutesRuntimePayloadUsesEmptyCollectionsInsteadOfNull(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	writePluginRouteStateFile(t, roots.settaFilesRoot, map[string]any{
		"pendingRestartBackendPluginIds": []string{"setta-fixture-backend"},
	})

	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RoutePluginsRuntime, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode plugin runtime response: %v", err)
	}

	list := payload["list"].(map[string]any)
	listPlugins := list["plugins"].([]any)
	if len(listPlugins) != 1 {
		t.Fatalf("expected one list plugin entry, got %#v", listPlugins)
	}
	listEntry := listPlugins[0].(map[string]any)
	if _, ok := listEntry["effectiveCapabilities"].([]any); !ok {
		t.Fatalf("expected list effectiveCapabilities array, got %#v", listEntry["effectiveCapabilities"])
	}
	if _, ok := listEntry["components"].([]any); !ok {
		t.Fatalf("expected list components array, got %#v", listEntry["components"])
	}
	configPayload := listEntry["config"].(map[string]any)
	if _, ok := configPayload["schemaJson"].(map[string]any); !ok {
		t.Fatalf("expected schemaJson object, got %#v", configPayload["schemaJson"])
	}
	if _, ok := configPayload["currentConfig"].(map[string]any); !ok {
		t.Fatalf("expected currentConfig object, got %#v", configPayload["currentConfig"])
	}

	status := payload["status"].(map[string]any)
	statusPlugins := status["plugins"].([]any)
	if len(statusPlugins) != 1 {
		t.Fatalf("expected one status plugin entry, got %#v", statusPlugins)
	}
	statusEntry := statusPlugins[0].(map[string]any)
	for _, field := range []string{
		"requestedCapabilities",
		"effectiveCapabilities",
		"blockedCapabilities",
		"components",
		"registeredCodegenTargets",
		"registeredBackendRoutes",
		"registeredStaticDirs",
		"registeredListenerEndpoints",
		"errors",
	} {
		if _, ok := statusEntry[field].([]any); !ok {
			t.Fatalf("expected status %s array, got %#v", field, statusEntry[field])
		}
	}
}

func TestRegisterPluginRoutesReturnsRescanSummary(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRescan, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin rescan 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload struct {
		SchemaVersion    int    `json:"schemaVersion"`
		ServerMode       string `json:"serverMode"`
		InstalledPlugins int    `json:"installedPlugins"`
		ActivePlugins    int    `json:"activePlugins"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode plugin rescan response: %v", err)
	}
	if payload.SchemaVersion != 1 {
		t.Fatalf("expected rescan schema version 1, got %d", payload.SchemaVersion)
	}
	if payload.ServerMode != "ide" {
		t.Fatalf("expected rescan server mode ide, got %q", payload.ServerMode)
	}
	if payload.InstalledPlugins != 1 || payload.ActivePlugins != 1 {
		t.Fatalf("unexpected rescan summary %#v", payload)
	}
}

// Runtime and rescan should preserve the typed malformed-state contract instead of collapsing to internal_error.
func TestRegisterPluginRoutesMapMalformedPersistedStateForRuntimeAndRescan(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	if err := os.WriteFile(
		filepath.Join(roots.settaFilesRoot, "plugins_state.json"),
		[]byte(`{"enabledPluginIds":`),
		0o644,
	); err != nil {
		t.Fatalf("seed malformed plugins state: %v", err)
	}

	for _, testCase := range []struct {
		name   string
		method string
		path   string
	}{
		{name: "runtime", method: http.MethodGet, path: RoutePluginsRuntime},
		{name: "rescan", method: http.MethodPost, path: RoutePluginsRescan},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(testCase.method, "/api"+testCase.path, nil)
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected malformed plugins state 422, got %d with body %q", response.Code, response.Body.String())
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode malformed plugins state response: %v", err)
			}
			if payload.Error.Code != string(plugins.ServiceErrorCodeStateInvalid) {
				t.Fatalf("expected state invalid code, got %q", payload.Error.Code)
			}
			expectedMessage := "Invalid plugins state file: " + filepath.Join(roots.settaFilesRoot, "plugins_state.json")
			if payload.Error.Message != expectedMessage {
				t.Fatalf("expected malformed state message %q, got %q", expectedMessage, payload.Error.Message)
			}
		})
	}
}

// The shared plugin route mapper should preserve explicit service-provided HTTP status, code, and message.
func TestRegisterPluginRoutesPreserveCustomStatusesForRemainingMutationFailures(t *testing.T) {
	t.Parallel()

	const injectedMessage = "Injected route failure for mapping test."
	injectedError := &plugins.ServiceError{
		Code:    plugins.ServiceErrorCode("PLUGIN_TEST_ERROR"),
		Message: injectedMessage,
		Status:  http.StatusTeapot,
	}

	testCases := []struct {
		name    string
		method  string
		path    string
		body    string
		service pluginRouteServiceStub
	}{
		{
			name:   "link",
			method: http.MethodPost,
			path:   RoutePluginsLink,
			body:   `{"localPluginRoot":"/tmp/plugin","scope":"workspace","enable":true,"force":false}`,
			service: pluginRouteServiceStub{
				linkFunc: func(plugins.LinkOptions) (plugins.PluginInstallResult, error) {
					return plugins.PluginInstallResult{}, injectedError
				},
			},
		},
		{
			name:   "enable",
			method: http.MethodPost,
			path:   RoutePluginsEnable,
			body:   `{"pluginId":"setta-fixture-frontend"}`,
			service: pluginRouteServiceStub{
				enableFunc: func(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResult, error) {
					return plugins.PluginEnableDisableResult{}, injectedError
				},
			},
		},
		{
			name:   "disable",
			method: http.MethodPost,
			path:   RoutePluginsDisable,
			body:   `{"pluginId":"setta-fixture-frontend"}`,
			service: pluginRouteServiceStub{
				disableFunc: func(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResult, error) {
					return plugins.PluginEnableDisableResult{}, injectedError
				},
			},
		},
		{
			name:   "config",
			method: http.MethodPost,
			path:   RoutePluginsConfig,
			body:   `{"pluginId":"setta-fixture-frontend","config":{"enabled":true}}`,
			service: pluginRouteServiceStub{
				writeConfigFunc: func(context.Context, plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResult, error) {
					return plugins.PluginConfigWriteResult{}, injectedError
				},
			},
		},
		{
			name:   "lock write",
			method: http.MethodPost,
			path:   RoutePluginsLockWrite,
			service: pluginRouteServiceStub{
				writeLockfileFunc: func() (plugins.PluginLockWriteResult, error) {
					return plugins.PluginLockWriteResult{}, injectedError
				},
			},
		},
		{
			name:   "lock apply",
			method: http.MethodPost,
			path:   RoutePluginsLockApply,
			body:   `{"check":false}`,
			service: pluginRouteServiceStub{
				applyLockfileFunc: func(context.Context, bool) (plugins.PluginLockApplyResult, error) {
					return plugins.PluginLockApplyResult{}, injectedError
				},
			},
		},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			handler := newPluginRouteTestHandler(t, config.ModeIDE, testCase.service)

			response := httptest.NewRecorder()
			request := httptest.NewRequest(testCase.method, "/api"+testCase.path, strings.NewReader(testCase.body))
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusTeapot {
				t.Fatalf("expected custom plugin error status 418, got %d with body %q", response.Code, response.Body.String())
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode custom plugin error response: %v", err)
			}
			if payload.Error.Code != "PLUGIN_TEST_ERROR" {
				t.Fatalf("expected injected error code, got %q", payload.Error.Code)
			}
			if payload.Error.Message != injectedMessage {
				t.Fatalf("expected injected error message %q, got %q", injectedMessage, payload.Error.Message)
			}
		})
	}
}

func TestRegisterPluginRoutesInstallAndUninstallPlugin(t *testing.T) {
	t.Parallel()

	_, service := newRoutePluginMutationService(t, map[string]routePluginFixtureSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	installResponse := httptest.NewRecorder()
	installRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsInstall, strings.NewReader(`{"sourceSpec":"pypi:setta-fixture-frontend==0.1.0","scope":"workspace","installer":"pip","enable":true,"force":false}`))
	handler.ServeHTTP(installResponse, installRequest)
	if installResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin install 200, got %d with body %q", installResponse.Code, installResponse.Body.String())
	}

	var installPayload plugins.PluginInstallResult
	if err := json.Unmarshal(installResponse.Body.Bytes(), &installPayload); err != nil {
		t.Fatalf("decode plugin install response: %v", err)
	}
	if installPayload.PluginID != "setta-fixture-frontend" || installPayload.Version != "0.1.0" {
		t.Fatalf("unexpected install payload %#v", installPayload)
	}
	if installPayload.SourceScope != plugins.PluginScopeWorkspace || installPayload.SourceScopeLabel != "workspace" {
		t.Fatalf("unexpected install scope payload %#v", installPayload)
	}
	if installPayload.TrustStatus != plugins.PluginSourceTrustStatusUnverified {
		t.Fatalf("expected unverified trust status, got %#v", installPayload.TrustStatus)
	}
	if installPayload.TrustWarning != "Source is unverified. Install only from trusted owners." {
		t.Fatalf("unexpected install trust warning %#v", installPayload.TrustWarning)
	}
	if installPayload.State != plugins.PluginRuntimeStateActive || installPayload.RestartRequired {
		t.Fatalf("unexpected install state payload %#v", installPayload)
	}

	uninstallResponse := httptest.NewRecorder()
	uninstallRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsUninstall, strings.NewReader(`{"pluginId":"setta-fixture-frontend","scope":"workspace"}`))
	handler.ServeHTTP(uninstallResponse, uninstallRequest)
	if uninstallResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin uninstall 200, got %d with body %q", uninstallResponse.Code, uninstallResponse.Body.String())
	}

	var uninstallPayload plugins.PluginUninstallResult
	if err := json.Unmarshal(uninstallResponse.Body.Bytes(), &uninstallPayload); err != nil {
		t.Fatalf("decode plugin uninstall response: %v", err)
	}
	if uninstallPayload.PluginID != "setta-fixture-frontend" || uninstallPayload.RemovedFromScope != plugins.PluginScopeWorkspace || uninstallPayload.RestartRequired {
		t.Fatalf("unexpected uninstall payload %#v", uninstallPayload)
	}
}

func TestRegisterPluginRoutesLinksLocalPlugin(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	localPluginRoot := filepath.Join(t.TempDir(), "frontend")
	sourceRoot := filepath.Join(routePluginFixtureRepoRoot(t), "tests", "fixtures", "plugins", "frontend")
	if err := copyRoutePluginFixtureDir(sourceRoot, localPluginRoot); err != nil {
		t.Fatalf("copy local plugin fixture: %v", err)
	}
	if err := rewriteRoutePluginManifest(localPluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	}); err != nil {
		t.Fatalf("rewrite local plugin manifest: %v", err)
	}

	linkResponse := httptest.NewRecorder()
	linkRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsLink, strings.NewReader(`{"localPluginRoot":"`+filepath.ToSlash(localPluginRoot)+`","scope":"workspace","enable":true,"force":false}`))
	handler.ServeHTTP(linkResponse, linkRequest)
	if linkResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin link 200, got %d with body %q", linkResponse.Code, linkResponse.Body.String())
	}

	var linkPayload plugins.PluginInstallResult
	if err := json.Unmarshal(linkResponse.Body.Bytes(), &linkPayload); err != nil {
		t.Fatalf("decode plugin link response: %v", err)
	}
	if linkPayload.PluginID != "setta-fixture-frontend" || linkPayload.Version != "0.1.0" {
		t.Fatalf("unexpected link payload %#v", linkPayload)
	}
	if linkPayload.SourceScope != plugins.PluginScopeWorkspace || linkPayload.SourceScopeLabel != "workspace" {
		t.Fatalf("unexpected link scope payload %#v", linkPayload)
	}
	if linkPayload.TrustStatus != plugins.PluginSourceTrustStatusUnverified {
		t.Fatalf("expected unverified link trust status, got %#v", linkPayload.TrustStatus)
	}
	if linkPayload.TrustWarning != "Source is unverified. Install only from trusted owners." {
		t.Fatalf("unexpected link trust warning %#v", linkPayload.TrustWarning)
	}
	if linkPayload.State != plugins.PluginRuntimeStateActive || linkPayload.RestartRequired {
		t.Fatalf("unexpected link state payload %#v", linkPayload)
	}

	runtimeResponse := httptest.NewRecorder()
	runtimeRequest := httptest.NewRequest(http.MethodGet, "/api"+RoutePluginsRuntime, nil)
	handler.ServeHTTP(runtimeResponse, runtimeRequest)
	if runtimeResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin runtime 200 after link, got %d with body %q", runtimeResponse.Code, runtimeResponse.Body.String())
	}

	var runtimePayload plugins.RuntimeResponse
	if err := json.Unmarshal(runtimeResponse.Body.Bytes(), &runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime response after link: %v", err)
	}
	if len(runtimePayload.Status.Plugins) != 1 || runtimePayload.Status.Plugins[0].PluginID != "setta-fixture-frontend" {
		t.Fatalf("unexpected plugin runtime payload after link %#v", runtimePayload.Status.Plugins)
	}
}

func TestRegisterPluginRoutesMapsLinkSourceValidationErrors(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsLink, strings.NewReader(`{"localPluginRoot":"/tmp/missing-plugin","scope":"workspace","enable":true,"force":false}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected plugin link 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode link validation error response: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeSourceNotFound) {
		t.Fatalf("expected source not found code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesRejectInvalidJSONForLink(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsLink, strings.NewReader(`{"localPluginRoot"`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid link json 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid link json response: %v", err)
	}
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json error code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesUpdateAndRollbackPlugin(t *testing.T) {
	t.Parallel()

	_, service := newRoutePluginMutationService(t, map[string]routePluginFixtureSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
		"pypi:setta-fixture-frontend==0.2.0": {
			FixtureName: "frontend",
			Version:     "0.2.0",
		},
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	installResponse := httptest.NewRecorder()
	installRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsInstall, strings.NewReader(`{"sourceSpec":"pypi:setta-fixture-frontend==0.1.0","scope":"workspace","installer":"pip","enable":true,"force":false}`))
	handler.ServeHTTP(installResponse, installRequest)
	if installResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin install 200, got %d with body %q", installResponse.Code, installResponse.Body.String())
	}

	updateResponse := httptest.NewRecorder()
	updateRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsUpdate, strings.NewReader(`{"pluginId":"setta-fixture-frontend","scope":"workspace","to":"0.2.0"}`))
	handler.ServeHTTP(updateResponse, updateRequest)
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin update 200, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}

	var updatePayload plugins.PluginUpdateResult
	if err := json.Unmarshal(updateResponse.Body.Bytes(), &updatePayload); err != nil {
		t.Fatalf("decode plugin update response: %v", err)
	}
	if updatePayload.PluginID != "setta-fixture-frontend" || updatePayload.FromVersion != "0.1.0" || updatePayload.ToVersion != "0.2.0" || updatePayload.RestartRequired {
		t.Fatalf("unexpected update payload %#v", updatePayload)
	}

	rollbackResponse := httptest.NewRecorder()
	rollbackRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRollback, strings.NewReader(`{"pluginId":"setta-fixture-frontend","scope":"workspace"}`))
	handler.ServeHTTP(rollbackResponse, rollbackRequest)
	if rollbackResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin rollback 200, got %d with body %q", rollbackResponse.Code, rollbackResponse.Body.String())
	}

	var rollbackPayload plugins.PluginRollbackResult
	if err := json.Unmarshal(rollbackResponse.Body.Bytes(), &rollbackPayload); err != nil {
		t.Fatalf("decode plugin rollback response: %v", err)
	}
	if rollbackPayload.PluginID != "setta-fixture-frontend" || rollbackPayload.RestoredVersion != "0.1.0" || rollbackPayload.RestartRequired {
		t.Fatalf("unexpected rollback payload %#v", rollbackPayload)
	}
}

func TestRegisterPluginRoutesMapUpdateMetadataAndRollbackHistoryErrors(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	updateResponse := httptest.NewRecorder()
	updateRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsUpdate, strings.NewReader(`{"pluginId":"setta-fixture-frontend","scope":"workspace","to":null}`))
	handler.ServeHTTP(updateResponse, updateRequest)
	if updateResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected update unavailable 400, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}

	var updatePayload errorResponse
	if err := json.Unmarshal(updateResponse.Body.Bytes(), &updatePayload); err != nil {
		t.Fatalf("decode update unavailable response: %v", err)
	}
	if updatePayload.Error.Code != string(plugins.ServiceErrorCodeUpdateUnavailable) {
		t.Fatalf("expected update unavailable code, got %q", updatePayload.Error.Code)
	}

	rollbackResponse := httptest.NewRecorder()
	rollbackRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRollback, strings.NewReader(`{"pluginId":"setta-fixture-frontend","scope":"workspace"}`))
	handler.ServeHTTP(rollbackResponse, rollbackRequest)
	if rollbackResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected rollback unavailable 400, got %d with body %q", rollbackResponse.Code, rollbackResponse.Body.String())
	}

	var rollbackPayload errorResponse
	if err := json.Unmarshal(rollbackResponse.Body.Bytes(), &rollbackPayload); err != nil {
		t.Fatalf("decode rollback unavailable response: %v", err)
	}
	if rollbackPayload.Error.Code != string(plugins.ServiceErrorCodeRollbackUnavailable) {
		t.Fatalf("expected rollback unavailable code, got %q", rollbackPayload.Error.Code)
	}
}

func TestRegisterPluginRoutesRejectLocalSourceUpdateAndRollback(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	pluginRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-frontend")
	store, err := plugins.NewStore(plugins.StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new plugin store: %v", err)
	}
	if err := store.SetInstallMetadata(plugins.PluginInstallMetadataEntry{
		PluginID:           "setta-fixture-frontend",
		Scope:              plugins.PluginScopeWorkspace,
		SourceSpec:         "local:" + pluginRoot,
		CanonicalSourceKey: "local:" + pluginRoot,
		Version:            "0.1.0",
		History: []plugins.PluginInstallHistoryEntry{
			{
				Version:      "0.0.9",
				SnapshotPath: filepath.Join(roots.workspaceRoot, "missing-snapshot"),
				TimestampISO: "2026-03-09T00:00:00Z",
			},
		},
	}); err != nil {
		t.Fatalf("seed local install metadata: %v", err)
	}
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	updateResponse := httptest.NewRecorder()
	updateRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsUpdate, strings.NewReader(`{"pluginId":"setta-fixture-frontend","scope":"workspace","to":null}`))
	handler.ServeHTTP(updateResponse, updateRequest)
	if updateResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected local-source update 400, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}

	var updatePayload errorResponse
	if err := json.Unmarshal(updateResponse.Body.Bytes(), &updatePayload); err != nil {
		t.Fatalf("decode local-source update response: %v", err)
	}
	if updatePayload.Error.Code != string(plugins.ServiceErrorCodeUpdateUnavailable) {
		t.Fatalf("expected update unavailable code, got %q", updatePayload.Error.Code)
	}

	rollbackResponse := httptest.NewRecorder()
	rollbackRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRollback, strings.NewReader(`{"pluginId":"setta-fixture-frontend","scope":"workspace"}`))
	handler.ServeHTTP(rollbackResponse, rollbackRequest)
	if rollbackResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected local-source rollback 400, got %d with body %q", rollbackResponse.Code, rollbackResponse.Body.String())
	}

	var rollbackPayload errorResponse
	if err := json.Unmarshal(rollbackResponse.Body.Bytes(), &rollbackPayload); err != nil {
		t.Fatalf("decode local-source rollback response: %v", err)
	}
	if rollbackPayload.Error.Code != string(plugins.ServiceErrorCodeRollbackUnavailable) {
		t.Fatalf("expected rollback unavailable code, got %q", rollbackPayload.Error.Code)
	}
}

func TestRegisterPluginRoutesEnableAndDisablePlugin(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	disableResponse := httptest.NewRecorder()
	disableRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsDisable, strings.NewReader(`{"pluginId":"setta-fixture-frontend"}`))
	handler.ServeHTTP(disableResponse, disableRequest)
	if disableResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin disable 200, got %d with body %q", disableResponse.Code, disableResponse.Body.String())
	}

	var disabledPayload plugins.PluginEnableDisableResult
	if err := json.Unmarshal(disableResponse.Body.Bytes(), &disabledPayload); err != nil {
		t.Fatalf("decode plugin disable response: %v", err)
	}
	if disabledPayload.State != plugins.PluginRuntimeStateDisabled || disabledPayload.RestartRequired {
		t.Fatalf("unexpected disable payload %#v", disabledPayload)
	}

	enableResponse := httptest.NewRecorder()
	enableRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsEnable, strings.NewReader(`{"pluginId":"setta-fixture-frontend"}`))
	handler.ServeHTTP(enableResponse, enableRequest)
	if enableResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin enable 200, got %d with body %q", enableResponse.Code, enableResponse.Body.String())
	}

	var enabledPayload plugins.PluginEnableDisableResult
	if err := json.Unmarshal(enableResponse.Body.Bytes(), &enabledPayload); err != nil {
		t.Fatalf("decode plugin enable response: %v", err)
	}
	if enabledPayload.State != plugins.PluginRuntimeStateActive || enabledPayload.RestartRequired {
		t.Fatalf("unexpected enable payload %#v", enabledPayload)
	}
}

func TestRegisterPluginRoutesWritesPluginConfigAndRuntimeReadback(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "full")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsConfig, strings.NewReader(`{"pluginId":"setta-fixture-full","config":{"enabled":true,"label":"route-write"}}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin config 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload plugins.PluginConfigWriteResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode plugin config response: %v", err)
	}
	if payload.PluginID != "setta-fixture-full" {
		t.Fatalf("expected plugin id setta-fixture-full, got %q", payload.PluginID)
	}
	if !payload.Validation.OK {
		t.Fatalf("expected successful validation payload, got %#v", payload.Validation)
	}

	runtimeResponse := httptest.NewRecorder()
	runtimeRequest := httptest.NewRequest(http.MethodGet, "/api"+RoutePluginsRuntime, nil)
	handler.ServeHTTP(runtimeResponse, runtimeRequest)
	if runtimeResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.Code, runtimeResponse.Body.String())
	}

	var runtimePayload plugins.RuntimeResponse
	if err := json.Unmarshal(runtimeResponse.Body.Bytes(), &runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime response: %v", err)
	}
	if got := runtimePayload.List.Plugins[0].Config.CurrentConfig["label"]; got != "route-write" {
		t.Fatalf("expected runtime config label route-write, got %#v", got)
	}
}

func TestRegisterPluginRoutesWritesAndAppliesLockfile(t *testing.T) {
	t.Parallel()

	_, service := newRoutePluginMutationService(t, map[string]routePluginFixtureSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	installResponse := httptest.NewRecorder()
	installRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsInstall, strings.NewReader(`{"sourceSpec":"pypi:setta-fixture-frontend==0.1.0","scope":"workspace","installer":"pip","enable":true,"force":false}`))
	handler.ServeHTTP(installResponse, installRequest)
	if installResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin install 200, got %d with body %q", installResponse.Code, installResponse.Body.String())
	}

	writeResponse := httptest.NewRecorder()
	writeRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsLockWrite, nil)
	handler.ServeHTTP(writeResponse, writeRequest)
	if writeResponse.Code != http.StatusOK {
		t.Fatalf("expected lock write 200, got %d with body %q", writeResponse.Code, writeResponse.Body.String())
	}

	var writePayload plugins.PluginLockWriteResult
	if err := json.Unmarshal(writeResponse.Body.Bytes(), &writePayload); err != nil {
		t.Fatalf("decode lock write response: %v", err)
	}
	if writePayload.PluginCount != 1 || writePayload.LockfilePath == "" {
		t.Fatalf("unexpected lock write payload %#v", writePayload)
	}

	uninstallResponse := httptest.NewRecorder()
	uninstallRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsUninstall, strings.NewReader(`{"pluginId":"setta-fixture-frontend","scope":"workspace"}`))
	handler.ServeHTTP(uninstallResponse, uninstallRequest)
	if uninstallResponse.Code != http.StatusOK {
		t.Fatalf("expected plugin uninstall 200, got %d with body %q", uninstallResponse.Code, uninstallResponse.Body.String())
	}

	applyResponse := httptest.NewRecorder()
	applyRequest := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsLockApply, strings.NewReader(`{"check":true}`))
	handler.ServeHTTP(applyResponse, applyRequest)
	if applyResponse.Code != http.StatusOK {
		t.Fatalf("expected lock apply 200, got %d with body %q", applyResponse.Code, applyResponse.Body.String())
	}

	var applyPayload plugins.PluginLockApplyResult
	if err := json.Unmarshal(applyResponse.Body.Bytes(), &applyPayload); err != nil {
		t.Fatalf("decode lock apply response: %v", err)
	}
	if applyPayload.Applied {
		t.Fatalf("expected check-only lock apply payload, got %#v", applyPayload)
	}
	if len(applyPayload.PlannedChanges) != 1 || !strings.Contains(applyPayload.PlannedChanges[0], "install setta-fixture-frontend in workspace") {
		t.Fatalf("unexpected lock apply payload %#v", applyPayload)
	}
}

func TestRegisterPluginRoutesRejectsInvalidPluginConfig(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "full")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsConfig, strings.NewReader(`{"pluginId":"setta-fixture-full","config":{"enabled":"yes"}}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid plugin config 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid config error response: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeConfigInvalid) {
		t.Fatalf("expected config invalid error code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesRejectsInvalidJSONForConfigWrite(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsConfig, strings.NewReader("{"))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid json 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid json response: %v", err)
	}
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json error code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesRejectsInvalidJSONForLockApply(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsLockApply, strings.NewReader("{"))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid json 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid json response: %v", err)
	}
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json error code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesRejectsInvalidJSONForInstallAndUninstall(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	for _, testCase := range []struct {
		name string
		path string
	}{
		{name: "install", path: RoutePluginsInstall},
		{name: "uninstall", path: RoutePluginsUninstall},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api"+testCase.path, strings.NewReader("{"))
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected invalid json 400, got %d with body %q", response.Code, response.Body.String())
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode invalid json response: %v", err)
			}
			if payload.Error.Code != "invalid_json" {
				t.Fatalf("expected invalid_json error code, got %q", payload.Error.Code)
			}
		})
	}
}

func TestRegisterPluginRoutesRejectsInvalidJSONForUpdateAndRollback(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	for _, testCase := range []struct {
		name string
		path string
	}{
		{name: "update", path: RoutePluginsUpdate},
		{name: "rollback", path: RoutePluginsRollback},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api"+testCase.path, strings.NewReader("{"))
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest {
				t.Fatalf("expected invalid json 400, got %d with body %q", response.Code, response.Body.String())
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode invalid json response: %v", err)
			}
			if payload.Error.Code != "invalid_json" {
				t.Fatalf("expected invalid_json error code, got %q", payload.Error.Code)
			}
		})
	}
}

func TestRegisterPluginRoutesRejectsInvalidInstallScope(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsInstall, strings.NewReader(`{"sourceSpec":"pypi:setta-fixture-frontend==0.1.0","scope":"environment","installer":"pip"}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected invalid install scope 422, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid install scope response: %v", err)
	}
	if payload.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request error code, got %q", payload.Error.Code)
	}
	if !strings.Contains(payload.Error.Message, "environment") {
		t.Fatalf("expected invalid scope message to mention environment, got %#v", payload)
	}
}

func TestRegisterPluginRoutesRejectsInvalidJSONForEnable(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsEnable, strings.NewReader("{"))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid json 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid json response: %v", err)
	}
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json error code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesMapsMissingEnableTo404(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsEnable, strings.NewReader(`{"pluginId":"missing-plugin"}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected missing plugin enable 404, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode missing plugin response: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeNotFound) {
		t.Fatalf("expected plugin not found code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesRequiresExplicitUninstallScopeWhenPluginExistsInMultipleScopes(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	copyPluginRouteFixtureToSettaFiles(t, roots.settaFilesRoot, "frontend")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsUninstall, strings.NewReader(`{"pluginId":"setta-fixture-frontend"}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected ambiguous uninstall 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode ambiguous uninstall response: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeUninstallScopeRequired) {
		t.Fatalf("expected uninstall scope required code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesReturnsManualRestartPayload(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRestart, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin restart 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload plugins.PluginRestartResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode plugin restart response: %v", err)
	}
	if payload.Accepted {
		t.Fatalf("expected manual restart payload, got %#v", payload)
	}
	if payload.Mode != plugins.RestartCapabilityModeManual {
		t.Fatalf("expected manual restart mode, got %#v", payload.Mode)
	}
	if payload.Command == nil || *payload.Command != "setta" {
		t.Fatalf("expected manual restart command, got %#v", payload.Command)
	}
	if payload.Reason == nil || *payload.Reason != "Programmatic restart is not available in this runtime." {
		t.Fatalf("unexpected manual restart reason %#v", payload.Reason)
	}
}

func TestRegisterPluginRoutesAcceptsProgrammaticRestart(t *testing.T) {
	t.Parallel()

	restartCalls := 0
	service, _ := newPluginRouteTestServiceWithRestartCallback(t, config.ModeIDE, func(context.Context) (bool, error) {
		restartCalls++
		return true, nil
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRestart, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected accepted plugin restart 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload plugins.PluginRestartResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode accepted plugin restart response: %v", err)
	}
	if !payload.Accepted {
		t.Fatalf("expected accepted restart payload, got %#v", payload)
	}
	if payload.Mode != plugins.RestartCapabilityModeProgrammatic {
		t.Fatalf("expected programmatic restart mode, got %#v", payload.Mode)
	}
	if restartCalls != 1 {
		t.Fatalf("expected one restart callback call, got %d", restartCalls)
	}
}

func TestRegisterPluginRoutesHandlesProgrammaticRestartRejection(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestServiceWithRestartCallback(t, config.ModeIDE, func(context.Context) (bool, error) {
		return false, nil
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRestart, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected rejected plugin restart 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload plugins.PluginRestartResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode rejected plugin restart response: %v", err)
	}
	if payload.Accepted {
		t.Fatalf("expected rejected restart payload, got %#v", payload)
	}
	if payload.Mode != plugins.RestartCapabilityModeProgrammatic {
		t.Fatalf("expected programmatic restart mode, got %#v", payload.Mode)
	}
	if payload.Command == nil || *payload.Command != "setta" {
		t.Fatalf("expected fallback restart command, got %#v", payload.Command)
	}
	if payload.Reason == nil || *payload.Reason != "Programmatic restart request was rejected." {
		t.Fatalf("unexpected rejected restart reason %#v", payload.Reason)
	}
}

func TestRegisterPluginRoutesMapsProgrammaticRestartFailureTo503(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestServiceWithRestartCallback(t, config.ModeIDE, func(context.Context) (bool, error) {
		return false, os.ErrPermission
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRestart, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected restart failure 503, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode restart failure response: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeRestartFailed) {
		t.Fatalf("expected restart failed error code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesMapsMissingLockfileTo404(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeIDE)
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsLockApply, strings.NewReader(`{"check":false}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected missing lockfile 404, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode missing lockfile response: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeLockfileNotFound) {
		t.Fatalf("expected lockfile not found code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRoutesBlocksConfigWriteOutsideIDE(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeShare)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "full")
	handler := newPluginRouteTestHandler(t, config.ModeShare, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsConfig, strings.NewReader(`{"pluginId":"setta-fixture-full","config":{"enabled":true}}`))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected share-mode config write 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden envelope, got %q", response.Body.String())
	}
}

func TestRegisterPluginRoutesBlocksLifecycleSlicesOutsideIDE(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeShare)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	handler := newPluginRouteTestHandler(t, config.ModeShare, service)

	testCases := []struct {
		name string
		path string
		body string
	}{
		{name: "rescan", path: RoutePluginsRescan},
		{name: "install", path: RoutePluginsInstall, body: `{"sourceSpec":"pypi:setta-fixture-frontend==0.1.0","scope":"workspace","installer":"pip"}`},
		{name: "link", path: RoutePluginsLink, body: `{"localPluginRoot":"/tmp/plugin","scope":"workspace","enable":true,"force":false}`},
		{name: "uninstall", path: RoutePluginsUninstall, body: `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`},
		{name: "update", path: RoutePluginsUpdate, body: `{"pluginId":"setta-fixture-frontend","scope":"workspace","to":null}`},
		{name: "rollback", path: RoutePluginsRollback, body: `{"pluginId":"setta-fixture-frontend","scope":"workspace"}`},
		{name: "enable", path: RoutePluginsEnable, body: `{"pluginId":"setta-fixture-frontend"}`},
		{name: "disable", path: RoutePluginsDisable, body: `{"pluginId":"setta-fixture-frontend"}`},
		{name: "lock write", path: RoutePluginsLockWrite},
		{name: "lock apply", path: RoutePluginsLockApply, body: `{"check":true}`},
	}
	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api"+testCase.path, strings.NewReader(testCase.body))
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden {
				t.Fatalf("expected share-mode %s 403, got %d with body %q", testCase.name, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
				t.Fatalf("expected mode_forbidden envelope, got %q", response.Body.String())
			}
		})
	}
}

func TestRegisterPluginRoutesBlocksRestartOutsideIDE(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestService(t, config.ModeShare)
	handler := newPluginRouteTestHandler(t, config.ModeShare, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api"+RoutePluginsRestart, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("expected share-mode restart 403, got %d with body %q", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"code":"mode_forbidden"`) {
		t.Fatalf("expected mode_forbidden envelope, got %q", response.Body.String())
	}
}

func TestRegisterPluginRoutesRedactsRuntimePayloadOutsideIDE(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeShare)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "full")
	writePluginRouteStateFile(t, roots.settaFilesRoot, map[string]any{
		"pluginConfigById": map[string]any{
			"workspace:setta-fixture-full": map[string]any{
				"secret": "value",
			},
		},
	})

	handler := newPluginRouteTestHandler(t, config.ModeShare, service)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RoutePluginsRuntime, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload plugins.RuntimeResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode redacted plugin runtime response: %v", err)
	}
	entry := payload.List.Plugins[0]
	if !strings.Contains(entry.CanonicalSourceKey, "redacted:workspace:setta:setta-fixture-full:") {
		t.Fatalf("expected redacted canonical source key, got %q", entry.CanonicalSourceKey)
	}
	if len(entry.Config.CurrentConfig) != 0 {
		t.Fatalf("expected redacted config payload, got %#v", entry.Config.CurrentConfig)
	}
	if entry.Config.SchemaJSON != nil {
		t.Fatalf("expected redacted schema payload, got %#v", entry.Config.SchemaJSON)
	}
	if !strings.Contains(payload.Status.Plugins[0].SourcePath, "[redacted]:workspace:setta:setta-fixture-full:") {
		t.Fatalf("expected redacted status source path, got %q", payload.Status.Plugins[0].SourcePath)
	}
}

func TestRegisterPluginRoutesRuntimeReportsManualRestartCapabilityOutsideIDEWithCallback(t *testing.T) {
	t.Parallel()

	service, _ := newPluginRouteTestServiceWithRestartCallback(t, config.ModeShare, func(context.Context) (bool, error) {
		return true, nil
	})
	handler := newPluginRouteTestHandler(t, config.ModeShare, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api"+RoutePluginsRuntime, nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected plugin runtime 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload plugins.RuntimeResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode share-mode plugin runtime response: %v", err)
	}
	if payload.Status.RestartCapability.Mode != plugins.RestartCapabilityModeManual {
		t.Fatalf("expected manual restart capability, got %#v", payload.Status.RestartCapability)
	}
	if payload.Status.RestartCapability.Command == nil || *payload.Status.RestartCapability.Command != "setta" {
		t.Fatalf("expected manual restart command, got %#v", payload.Status.RestartCapability.Command)
	}
	if payload.Status.RestartCapability.Reason == nil || *payload.Status.RestartCapability.Reason != "Plugin runtime restart is available only in IDE mode." {
		t.Fatalf("unexpected share-mode restart reason %#v", payload.Status.RestartCapability.Reason)
	}
}

func TestRegisterPluginRootRoutesServesFrontendAssetsAndImmutableCache(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/plugins/setta-fixture-frontend/frontend/src/index.js", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected asset 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.Contains(response.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("expected unversioned asset to skip immutable cache headers, got %q", response.Header().Get("Cache-Control"))
	}
	if !strings.Contains(response.Body.String(), "export const apiVersion = 1;") {
		t.Fatalf("expected frontend asset body, got %q", response.Body.String())
	}

	versionedResponse := httptest.NewRecorder()
	versionedRequest := httptest.NewRequest(
		http.MethodGet,
		"/plugins/setta-fixture-frontend/frontend/src/index.js?v=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		nil,
	)
	handler.ServeHTTP(versionedResponse, versionedRequest)
	if versionedResponse.Code != http.StatusOK {
		t.Fatalf("expected versioned asset 200, got %d with body %q", versionedResponse.Code, versionedResponse.Body.String())
	}
	if got := versionedResponse.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("expected immutable cache header, got %q", got)
	}
}

func TestRegisterPluginRootRoutesRejectsTraversalAndUnknownPlugins(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "frontend")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	traversalResponse := httptest.NewRecorder()
	traversalRequest := httptest.NewRequest(http.MethodGet, "/plugins/setta-fixture-frontend/%2E%2E/setta.plugin.json", nil)
	handler.ServeHTTP(traversalResponse, traversalRequest)
	if traversalResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected traversal 400, got %d with body %q", traversalResponse.Code, traversalResponse.Body.String())
	}
	var traversalPayload errorResponse
	if err := json.Unmarshal(traversalResponse.Body.Bytes(), &traversalPayload); err != nil {
		t.Fatalf("decode traversal error payload: %v", err)
	}
	if traversalPayload.Error.Code != string(plugins.ServiceErrorCodeAssetInvalidPath) {
		t.Fatalf("expected asset invalid path code, got %q", traversalPayload.Error.Code)
	}

	notFoundResponse := httptest.NewRecorder()
	notFoundRequest := httptest.NewRequest(http.MethodGet, "/plugins/missing-plugin/frontend/src/index.js", nil)
	handler.ServeHTTP(notFoundResponse, notFoundRequest)
	if notFoundResponse.Code != http.StatusNotFound {
		t.Fatalf("expected unknown plugin 404, got %d with body %q", notFoundResponse.Code, notFoundResponse.Body.String())
	}
	var notFoundPayload errorResponse
	if err := json.Unmarshal(notFoundResponse.Body.Bytes(), &notFoundPayload); err != nil {
		t.Fatalf("decode unknown plugin error payload: %v", err)
	}
	if notFoundPayload.Error.Code != string(plugins.ServiceErrorCodeNotFound) {
		t.Fatalf("expected plugin not found code, got %q", notFoundPayload.Error.Code)
	}
}

func TestRegisterPluginRootRoutesServesRegisteredBackendStaticDirs(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	rewriteRoutePluginManifest(filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerStaticDir"}
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/static/fixture.txt", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("expected backend static asset 200, got %d with body %q", response.Code, response.Body.String())
	}
	if strings.TrimSpace(response.Body.String()) != "backend static fixture" {
		t.Fatalf("unexpected backend static asset body %q", response.Body.String())
	}
}

func TestRegisterPluginRootRoutesDispatchesRegisteredBackendRoutes(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	rewriteRoutePluginManifest(filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	getResponse := httptest.NewRecorder()
	getRequest := httptest.NewRequest(http.MethodGet, "/health", nil)
	handler.ServeHTTP(getResponse, getRequest)
	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected backend route 200, got %d with body %q", getResponse.Code, getResponse.Body.String())
	}

	var getPayload map[string]any
	if err := json.Unmarshal(getResponse.Body.Bytes(), &getPayload); err != nil {
		t.Fatalf("decode backend route payload: %v", err)
	}
	if getPayload["ok"] != true || getPayload["serverMode"] != "ide" {
		t.Fatalf("unexpected backend route payload %#v", getPayload)
	}

	postResponse := httptest.NewRecorder()
	postRequest := httptest.NewRequest(http.MethodPost, "/items?view=route", strings.NewReader(`{"name":"route-fixture"}`))
	postRequest.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(postResponse, postRequest)
	if postResponse.Code != http.StatusCreated {
		t.Fatalf("expected backend route 201, got %d with body %q", postResponse.Code, postResponse.Body.String())
	}

	var postPayload map[string]any
	if err := json.Unmarshal(postResponse.Body.Bytes(), &postPayload); err != nil {
		t.Fatalf("decode backend POST payload: %v", err)
	}
	if postPayload["rawQuery"] != "view=route" || postPayload["contentType"] != "application/json" {
		t.Fatalf("unexpected backend POST payload %#v", postPayload)
	}
}

func TestRegisterPluginRootRoutesRequireAuthOnlyForRegisteredBackendRoutes(t *testing.T) {
	t.Parallel()

	authService := newTestAuthService(t)
	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	rewriteRoutePluginManifest(filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter", "registerStaticDir"}
	})
	handler := newPluginRouteTestHandlerWithAuth(t, config.ModeIDE, service, authService)

	unauthorizedResponse := httptest.NewRecorder()
	unauthorizedRequest := httptest.NewRequest(http.MethodGet, "/health", nil)
	handler.ServeHTTP(unauthorizedResponse, unauthorizedRequest)
	if unauthorizedResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected backend route auth 401, got %d with body %q", unauthorizedResponse.Code, unauthorizedResponse.Body.String())
	}
	if contentType := unauthorizedResponse.Header().Get("Content-Type"); !strings.Contains(contentType, "text/html") {
		t.Fatalf("expected backend route auth html response, got %q", contentType)
	}
	if !strings.Contains(unauthorizedResponse.Body.String(), bootstrapPagePath) {
		t.Fatalf("expected backend route auth html to link to bootstrap page, got %q", unauthorizedResponse.Body.String())
	}

	token, _, err := authService.MintAuthCookie(time.Now().UTC())
	if err != nil {
		t.Fatalf("mint auth cookie: %v", err)
	}
	currentSession, ok := authService.CurrentSession()
	if !ok {
		t.Fatal("expected current session")
	}
	cookieName, err := authService.CookieName(currentSession.Metadata.ID)
	if err != nil {
		t.Fatalf("resolve auth cookie name: %v", err)
	}

	authorizedResponse := httptest.NewRecorder()
	authorizedRequest := httptest.NewRequest(http.MethodGet, "/health", nil)
	authorizedRequest.AddCookie(&http.Cookie{
		Name:  cookieName,
		Value: token,
	})
	handler.ServeHTTP(authorizedResponse, authorizedRequest)
	if authorizedResponse.Code != http.StatusOK {
		t.Fatalf("expected authorized backend route 200, got %d with body %q", authorizedResponse.Code, authorizedResponse.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(authorizedResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode authorized backend payload: %v", err)
	}
	if payload["sessionId"] != "abc123" || payload["hasAuth"] != true {
		t.Fatalf("expected auth context in backend payload, got %#v", payload)
	}

	staticResponse := httptest.NewRecorder()
	staticRequest := httptest.NewRequest(http.MethodGet, "/static/fixture.txt", nil)
	handler.ServeHTTP(staticResponse, staticRequest)
	if staticResponse.Code != http.StatusOK {
		t.Fatalf("expected public backend static asset 200, got %d with body %q", staticResponse.Code, staticResponse.Body.String())
	}
}

func TestRegisterPluginRootRoutesRejectsTraversalForRegisteredBackendStaticDirs(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	rewriteRoutePluginManifest(filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerStaticDir"}
	})
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/static/%2E%2E/main.go", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected traversal 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode traversal payload: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeAssetInvalidPath) {
		t.Fatalf("expected asset invalid path code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRootRoutesLeavesUnknownPathsAsRouteNotFoundWithoutRegisteredStaticDir(t *testing.T) {
	t.Parallel()

	service, roots := newPluginRouteTestService(t, config.ModeIDE)
	copyPluginRouteFixtureToWorkspace(t, roots.workspaceRoot, "backend")
	handler := newPluginRouteTestHandler(t, config.ModeIDE, service)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/static/fixture.txt", nil)
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected unknown static path 404, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode not found payload: %v", err)
	}
	if payload.Error.Code != "not_found" {
		t.Fatalf("expected generic not_found code, got %q", payload.Error.Code)
	}
}

func TestRegisterPluginRootRoutesPreserveBackendRouteStatusHeadersAndBody(t *testing.T) {
	t.Parallel()

	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			switch requestPath {
			case "/created", "/missing":
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			default:
				return plugins.BackendRouteLookup{}, nil
			}
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			switch request.Path {
			case "/created":
				return plugins.BackendHTTPResponse{
					StatusCode: http.StatusCreated,
					Headers: map[string][]string{
						"Content-Type": {"application/json"},
						"X-Fixture":    {"created"},
					},
					Body: []byte(`{"ok":true}`),
				}, true, nil
			case "/missing":
				return plugins.BackendHTTPResponse{
					StatusCode: http.StatusNotFound,
					Headers: map[string][]string{
						"Content-Type": {"application/json"},
					},
					Body: []byte(`{"detail":"missing"}`),
				}, true, nil
			default:
				return plugins.BackendHTTPResponse{}, false, nil
			}
		},
	}

	server := httptest.NewServer(newPluginRouteTestHandler(t, config.ModeIDE, service))
	defer server.Close()

	createdResponse, err := http.Get(server.URL + "/created")
	if err != nil {
		t.Fatalf("request created backend route: %v", err)
	}
	defer createdResponse.Body.Close()

	createdBody, err := io.ReadAll(createdResponse.Body)
	if err != nil {
		t.Fatalf("read created backend route body: %v", err)
	}
	if createdResponse.StatusCode != http.StatusCreated {
		t.Fatalf("expected created backend route status 201, got %d", createdResponse.StatusCode)
	}
	if got := createdResponse.Header.Get("X-Fixture"); got != "created" {
		t.Fatalf("expected created backend response header, got %q", got)
	}
	if string(createdBody) != `{"ok":true}` {
		t.Fatalf("expected created backend route body, got %q", createdBody)
	}

	missingResponse, err := http.Get(server.URL + "/missing")
	if err != nil {
		t.Fatalf("request missing backend route: %v", err)
	}
	defer missingResponse.Body.Close()

	missingBody, err := io.ReadAll(missingResponse.Body)
	if err != nil {
		t.Fatalf("read missing backend route body: %v", err)
	}
	if missingResponse.StatusCode != http.StatusNotFound {
		t.Fatalf("expected missing backend route status 404, got %d", missingResponse.StatusCode)
	}
	if string(missingBody) != `{"detail":"missing"}` {
		t.Fatalf("expected missing backend route body, got %q", missingBody)
	}
}

func TestRegisterPluginRootRoutesMapBackendDispatchServiceErrors(t *testing.T) {
	t.Parallel()

	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			if requestPath == "/error" {
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			}
			return plugins.BackendRouteLookup{}, nil
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			return plugins.BackendHTTPResponse{}, true, &plugins.ServiceError{
				Code:    plugins.ServiceErrorCodeBackendRuntimeInvalid,
				Message: "backend dispatch failed",
				Status:  http.StatusBadGateway,
			}
		},
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/error", nil)
	newPluginRouteTestHandler(t, config.ModeIDE, service).ServeHTTP(response, request)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected backend dispatch error status 502, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode backend dispatch error payload: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid code, got %#v", payload.Error)
	}
	if payload.Error.Message != "backend dispatch failed" {
		t.Fatalf("expected backend dispatch error message, got %#v", payload.Error)
	}
}

func TestRegisterPluginRootRoutesPreserveRepeatedHeadersFromBackendResponse(t *testing.T) {
	t.Parallel()

	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			if requestPath == "/headers" {
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			}
			return plugins.BackendRouteLookup{}, nil
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			return plugins.BackendHTTPResponse{
				StatusCode: http.StatusOK,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
					"Set-Cookie": {
						"a=1; Path=/; HttpOnly",
						"b=2; Path=/; Secure",
					},
					"Link": {
						"</a.css>; rel=preload; as=style",
						"</b.css>; rel=preload; as=style",
					},
					"X-Fixture": {"headers"},
				},
				Body: []byte(`{"ok":true}`),
			}, true, nil
		},
	}

	server := httptest.NewServer(newPluginRouteTestHandler(t, config.ModeIDE, service))
	defer server.Close()

	response, err := http.Get(server.URL + "/headers")
	if err != nil {
		t.Fatalf("request backend route with repeated headers: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected repeated-header backend route status 200, got %d", response.StatusCode)
	}
	if got := response.Header.Get("X-Fixture"); got != "headers" {
		t.Fatalf("expected x-fixture header, got %q", got)
	}
	if got := response.Header.Values("Set-Cookie"); len(got) != 2 || got[0] != "a=1; Path=/; HttpOnly" || got[1] != "b=2; Path=/; Secure" {
		t.Fatalf("expected repeated set-cookie headers, got %#v", got)
	}
	if got := response.Header.Values("Link"); len(got) != 2 || got[0] != "</a.css>; rel=preload; as=style" || got[1] != "</b.css>; rel=preload; as=style" {
		t.Fatalf("expected repeated link headers, got %#v", got)
	}
}

func TestRegisterPluginRootRoutesRejectInvalidHeaderTransportValues(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name                    string
		headers                 map[string][]string
		expectedMessageFragment string
	}{
		{
			name: "non_latin_1_value",
			headers: map[string][]string{
				"X-Fixture": {"✓"},
			},
			expectedMessageFragment: "non-latin-1 header name or value",
		},
		{
			name: "newline_in_name",
			headers: map[string][]string{
				"X-Fixture\nInvalid": {"value"},
			},
			expectedMessageFragment: "headers containing newline characters",
		},
		{
			name: "newline_in_value",
			headers: map[string][]string{
				"X-Fixture": {"value\rinvalid"},
			},
			expectedMessageFragment: "headers containing newline characters",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			service := pluginRouteServiceStub{
				lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
					if requestPath == "/headers" {
						return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
					}
					return plugins.BackendRouteLookup{}, nil
				},
				dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
					return plugins.BackendHTTPResponse{
						StatusCode: http.StatusOK,
						Headers:    tc.headers,
						Body:       []byte(`{"ok":true}`),
					}, true, nil
				},
			}

			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/headers", nil)
			newPluginRouteTestHandler(t, config.ModeIDE, service).ServeHTTP(response, request)

			if response.Code != http.StatusBadGateway {
				t.Fatalf("expected invalid header transport to fail with 502, got %d with body %q", response.Code, response.Body.String())
			}

			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode invalid header transport payload: %v", err)
			}
			if payload.Error.Code != string(plugins.ServiceErrorCodeBackendRuntimeInvalid) {
				t.Fatalf("expected backend runtime invalid code, got %#v", payload.Error)
			}
			if !strings.Contains(payload.Error.Message, tc.expectedMessageFragment) {
				t.Fatalf("expected invalid header transport message to contain %q, got %#v", tc.expectedMessageFragment, payload.Error)
			}
		})
	}
}

func TestRegisterPluginRootRoutesPreserveBackendRequestBodyBytes(t *testing.T) {
	t.Parallel()

	rawBody := []byte{0xff, 'a', 'b', 'c', 0xfe}
	capturedRequests := []plugins.BackendHTTPRequest{}
	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			if requestPath == "/echo" {
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			}
			return plugins.BackendRouteLookup{}, nil
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			capturedRequests = append(capturedRequests, request)
			return plugins.BackendHTTPResponse{
				StatusCode: http.StatusOK,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
				},
				Body: []byte(`{"ok":true}`),
			}, true, nil
		},
	}

	server := httptest.NewServer(newPluginRouteTestHandler(t, config.ModeIDE, service))
	defer server.Close()

	request, err := http.NewRequest(http.MethodPost, server.URL+"/echo?mode=raw", bytes.NewReader(rawBody))
	if err != nil {
		t.Fatalf("new backend route request: %v", err)
	}
	request.Header.Set("Content-Type", "application/octet-stream")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post backend route with raw bytes: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected raw-byte backend route status 200, got %d", response.StatusCode)
	}
	if len(capturedRequests) != 1 {
		t.Fatalf("expected one captured backend request, got %#v", capturedRequests)
	}
	captured := capturedRequests[0]
	if captured.Method != http.MethodPost || captured.Path != "/echo" || captured.RawQuery != "mode=raw" {
		t.Fatalf("unexpected captured backend request metadata %#v", captured)
	}
	if got := captured.Headers["Content-Type"]; len(got) != 1 || got[0] != "application/octet-stream" {
		t.Fatalf("expected content-type to round-trip, got %#v", captured.Headers)
	}
	if !bytes.Equal(captured.Body, rawBody) {
		t.Fatalf("expected raw backend request bytes %#v, got %#v", rawBody, captured.Body)
	}
}

func TestRegisterPluginRootRoutesPreserveExplicitJSONNullAndEmptyBodies(t *testing.T) {
	t.Parallel()

	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			switch requestPath {
			case "/null", "/empty":
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			default:
				return plugins.BackendRouteLookup{}, nil
			}
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			response := plugins.BackendHTTPResponse{
				StatusCode: http.StatusOK,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
				},
			}
			if request.Path == "/null" {
				response.Body = []byte("null")
			}
			return response, true, nil
		},
	}

	server := httptest.NewServer(newPluginRouteTestHandler(t, config.ModeIDE, service))
	defer server.Close()

	nullResponse, err := http.Get(server.URL + "/null")
	if err != nil {
		t.Fatalf("request backend route with null body: %v", err)
	}
	defer nullResponse.Body.Close()

	nullBody, err := io.ReadAll(nullResponse.Body)
	if err != nil {
		t.Fatalf("read backend route null body: %v", err)
	}
	if got := nullResponse.Header.Get("Content-Type"); !strings.Contains(got, "application/json") {
		t.Fatalf("expected json content-type for null body, got %q", got)
	}
	if string(nullBody) != "null" {
		t.Fatalf("expected explicit json null body, got %q", nullBody)
	}

	emptyResponse, err := http.Get(server.URL + "/empty")
	if err != nil {
		t.Fatalf("request backend route with empty body: %v", err)
	}
	defer emptyResponse.Body.Close()

	emptyBody, err := io.ReadAll(emptyResponse.Body)
	if err != nil {
		t.Fatalf("read backend route empty body: %v", err)
	}
	if got := emptyResponse.Header.Get("Content-Type"); !strings.Contains(got, "application/json") {
		t.Fatalf("expected json content-type for empty body, got %q", got)
	}
	if len(emptyBody) != 0 {
		t.Fatalf("expected empty backend route body, got %q", emptyBody)
	}
}

func TestRegisterPluginRootRoutesSuppressBackendResponseBodiesForNoContentStatuses(t *testing.T) {
	t.Parallel()

	statusByPath := map[string]int{
		"/no-content/204": http.StatusNoContent,
		"/no-content/205": http.StatusResetContent,
		"/no-content/304": http.StatusNotModified,
	}
	service := pluginRouteServiceStub{
		lookupRegisteredBackendRouteFunc: func(method string, requestPath string) (plugins.BackendRouteLookup, error) {
			if _, ok := statusByPath[requestPath]; ok {
				return plugins.BackendRouteLookup{Matched: true, PathExists: true}, nil
			}
			return plugins.BackendRouteLookup{}, nil
		},
		dispatchRegisteredBackendRouteFunc: func(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
			status, ok := statusByPath[request.Path]
			if !ok {
				return plugins.BackendHTTPResponse{}, false, nil
			}
			return plugins.BackendHTTPResponse{
				StatusCode: status,
				Headers: map[string][]string{
					"Content-Type": {"application/json"},
				},
				Body: []byte(`{"ignored":true}`),
			}, true, nil
		},
	}

	server := httptest.NewServer(newPluginRouteTestHandler(t, config.ModeIDE, service))
	defer server.Close()

	for path, expectedStatus := range statusByPath {
		path := path
		expectedStatus := expectedStatus
		t.Run(strings.TrimPrefix(path, "/no-content/"), func(t *testing.T) {
			response, err := http.Get(server.URL + path)
			if err != nil {
				t.Fatalf("request backend route with no-content status: %v", err)
			}
			defer response.Body.Close()

			body, err := io.ReadAll(response.Body)
			if err != nil {
				t.Fatalf("read backend no-content response body: %v", err)
			}
			if response.StatusCode != expectedStatus {
				t.Fatalf("expected backend route status %d, got %d", expectedStatus, response.StatusCode)
			}
			if len(body) != 0 {
				t.Fatalf("expected no-content backend response body to be empty, got %q", body)
			}
		})
	}
}

type pluginRouteTestRoots struct {
	workspaceRoot  string
	settaFilesRoot string
	settaHome      string
}

func newPluginRouteTestService(t *testing.T, mode config.Mode) (*plugins.Service, pluginRouteTestRoots) {
	t.Helper()
	return newPluginRouteTestServiceWithRestartCallback(t, mode, nil)
}

func newPluginRouteTestServiceWithRestartCallback(t *testing.T, mode config.Mode, callback plugins.RestartCallback) (*plugins.Service, pluginRouteTestRoots) {
	t.Helper()

	baseRoot := t.TempDir()
	roots := pluginRouteTestRoots{
		workspaceRoot:  filepath.Join(baseRoot, "workspace"),
		settaFilesRoot: filepath.Join(baseRoot, "setta_files"),
		settaHome:      filepath.Join(baseRoot, "setta_home"),
	}
	for _, root := range []string{roots.workspaceRoot, roots.settaFilesRoot, roots.settaHome} {
		if err := os.MkdirAll(root, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", root, err)
		}
	}

	service, err := plugins.NewService(plugins.ServiceOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		SettaFilesRoot:  roots.settaFilesRoot,
		SettaHome:       roots.settaHome,
		ServerMode:      mode,
		RestartCallback: callback,
	})
	if err != nil {
		t.Fatalf("new plugin route service: %v", err)
	}
	return service, roots
}

func newPluginRouteTestHandler(t *testing.T, mode config.Mode, service PluginRouteService) http.Handler {
	t.Helper()

	return newPluginRouteTestHandlerWithAuth(t, mode, service, nil)
}

func newPluginRouteTestHandlerWithAuth(t *testing.T, mode config.Mode, service PluginRouteService, authService *auth.Service) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		Auth:       authService,
		ModePolicy: modes.NewPolicy(mode),
		RegisterRoot: func(r chi.Router) {
			if err := RegisterPluginRootRoutes(r, PluginRootRouteDependencies{
				Service: service,
				Auth:    authService,
			}); err != nil {
				t.Fatalf("register plugin root routes: %v", err)
			}
		},
		Register: func(r chi.Router) {
			if err := RegisterPluginRoutes(r, PluginRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Service:    service,
			}); err != nil {
				t.Fatalf("register plugin routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new plugin route handler: %v", err)
	}
	return handler
}

type pluginRouteServiceStub struct {
	runtimeFunc                          func(plugins.RuntimeOptions) (plugins.RuntimeResponse, error)
	getBackendUISettingsFunc             func(string) ([]plugins.PluginRegisteredUISetting, error)
	readBackendUISettingValueFunc        func(context.Context, plugins.BackendUISettingReadOptions) (any, error)
	writeBackendUISettingValueFunc       func(context.Context, plugins.BackendUISettingWriteOptions) error
	rescanFunc                           func() (plugins.DiscoverySnapshot, error)
	installFunc                          func(context.Context, plugins.InstallOptions) (plugins.PluginInstallResult, error)
	linkFunc                             func(plugins.LinkOptions) (plugins.PluginInstallResult, error)
	uninstallFunc                        func(context.Context, plugins.UninstallOptions) (plugins.PluginUninstallResult, error)
	updateFunc                           func(context.Context, plugins.UpdateOptions) (plugins.PluginUpdateResult, error)
	rollbackFunc                         func(context.Context, plugins.RollbackOptions) (plugins.PluginRollbackResult, error)
	enableFunc                           func(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResult, error)
	disableFunc                          func(context.Context, plugins.EnableDisableOptions) (plugins.PluginEnableDisableResult, error)
	writeConfigFunc                      func(context.Context, plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResult, error)
	writeLockfileFunc                    func() (plugins.PluginLockWriteResult, error)
	applyLockfileFunc                    func(context.Context, bool) (plugins.PluginLockApplyResult, error)
	restartFunc                          func(context.Context) (plugins.PluginRestartResult, error)
	resolveAssetPathFunc                 func(string, string) (string, error)
	resolveRegisteredStaticAssetPathFunc func(string) (string, bool, error)
	lookupRegisteredBackendRouteFunc     func(string, string) (plugins.BackendRouteLookup, error)
	dispatchRegisteredBackendRouteFunc   func(context.Context, plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error)
	invokeRegisteredListenerEndpointFunc func(context.Context, plugins.BackendListenerEndpointRequest) (any, bool, error)
}

func (s pluginRouteServiceStub) Runtime(options plugins.RuntimeOptions) (plugins.RuntimeResponse, error) {
	if s.runtimeFunc != nil {
		return s.runtimeFunc(options)
	}
	return plugins.RuntimeResponse{}, nil
}

func (s pluginRouteServiceStub) GetBackendUISettings(pluginID string) ([]plugins.PluginRegisteredUISetting, error) {
	if s.getBackendUISettingsFunc != nil {
		return s.getBackendUISettingsFunc(pluginID)
	}
	return []plugins.PluginRegisteredUISetting{}, nil
}

func (s pluginRouteServiceStub) ReadBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingReadOptions) (any, error) {
	if s.readBackendUISettingValueFunc != nil {
		return s.readBackendUISettingValueFunc(ctx, options)
	}
	return nil, nil
}

func (s pluginRouteServiceStub) WriteBackendUISettingValue(ctx context.Context, options plugins.BackendUISettingWriteOptions) error {
	if s.writeBackendUISettingValueFunc != nil {
		return s.writeBackendUISettingValueFunc(ctx, options)
	}
	return nil
}

func (s pluginRouteServiceStub) Rescan() (plugins.DiscoverySnapshot, error) {
	if s.rescanFunc != nil {
		return s.rescanFunc()
	}
	return plugins.DiscoverySnapshot{}, nil
}

func (s pluginRouteServiceStub) Install(ctx context.Context, options plugins.InstallOptions) (plugins.PluginInstallResult, error) {
	if s.installFunc != nil {
		return s.installFunc(ctx, options)
	}
	return plugins.PluginInstallResult{}, nil
}

func (s pluginRouteServiceStub) Link(options plugins.LinkOptions) (plugins.PluginInstallResult, error) {
	if s.linkFunc != nil {
		return s.linkFunc(options)
	}
	return plugins.PluginInstallResult{}, nil
}

func (s pluginRouteServiceStub) Uninstall(ctx context.Context, options plugins.UninstallOptions) (plugins.PluginUninstallResult, error) {
	if s.uninstallFunc != nil {
		return s.uninstallFunc(ctx, options)
	}
	return plugins.PluginUninstallResult{}, nil
}

func (s pluginRouteServiceStub) Update(ctx context.Context, options plugins.UpdateOptions) (plugins.PluginUpdateResult, error) {
	if s.updateFunc != nil {
		return s.updateFunc(ctx, options)
	}
	return plugins.PluginUpdateResult{}, nil
}

func (s pluginRouteServiceStub) Rollback(ctx context.Context, options plugins.RollbackOptions) (plugins.PluginRollbackResult, error) {
	if s.rollbackFunc != nil {
		return s.rollbackFunc(ctx, options)
	}
	return plugins.PluginRollbackResult{}, nil
}

func (s pluginRouteServiceStub) Enable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResult, error) {
	if s.enableFunc != nil {
		return s.enableFunc(ctx, options)
	}
	return plugins.PluginEnableDisableResult{}, nil
}

func (s pluginRouteServiceStub) Disable(ctx context.Context, options plugins.EnableDisableOptions) (plugins.PluginEnableDisableResult, error) {
	if s.disableFunc != nil {
		return s.disableFunc(ctx, options)
	}
	return plugins.PluginEnableDisableResult{}, nil
}

func (s pluginRouteServiceStub) WriteConfig(ctx context.Context, options plugins.ConfigWriteOptions) (plugins.PluginConfigWriteResult, error) {
	if s.writeConfigFunc != nil {
		return s.writeConfigFunc(ctx, options)
	}
	return plugins.PluginConfigWriteResult{}, nil
}

func (s pluginRouteServiceStub) WriteLockfile() (plugins.PluginLockWriteResult, error) {
	if s.writeLockfileFunc != nil {
		return s.writeLockfileFunc()
	}
	return plugins.PluginLockWriteResult{}, nil
}

func (s pluginRouteServiceStub) ApplyLockfile(ctx context.Context, check bool) (plugins.PluginLockApplyResult, error) {
	if s.applyLockfileFunc != nil {
		return s.applyLockfileFunc(ctx, check)
	}
	return plugins.PluginLockApplyResult{}, nil
}

func (s pluginRouteServiceStub) Restart(ctx context.Context) (plugins.PluginRestartResult, error) {
	if s.restartFunc != nil {
		return s.restartFunc(ctx)
	}
	return plugins.PluginRestartResult{}, nil
}

func (s pluginRouteServiceStub) ResolveAssetPath(pluginID string, assetPath string) (string, error) {
	if s.resolveAssetPathFunc != nil {
		return s.resolveAssetPathFunc(pluginID, assetPath)
	}
	return "", nil
}

func (s pluginRouteServiceStub) ResolveRegisteredStaticAssetPath(requestPath string) (string, bool, error) {
	if s.resolveRegisteredStaticAssetPathFunc != nil {
		return s.resolveRegisteredStaticAssetPathFunc(requestPath)
	}
	return "", false, nil
}

func (s pluginRouteServiceStub) LookupRegisteredBackendRoute(method string, requestPath string) (plugins.BackendRouteLookup, error) {
	if s.lookupRegisteredBackendRouteFunc != nil {
		return s.lookupRegisteredBackendRouteFunc(method, requestPath)
	}
	return plugins.BackendRouteLookup{}, nil
}

func (s pluginRouteServiceStub) DispatchRegisteredBackendRoute(ctx context.Context, request plugins.BackendHTTPRequest) (plugins.BackendHTTPResponse, bool, error) {
	if s.dispatchRegisteredBackendRouteFunc != nil {
		return s.dispatchRegisteredBackendRouteFunc(ctx, request)
	}
	return plugins.BackendHTTPResponse{}, false, nil
}

func (s pluginRouteServiceStub) InvokeRegisteredListenerEndpoint(ctx context.Context, request plugins.BackendListenerEndpointRequest) (any, bool, error) {
	if s.invokeRegisteredListenerEndpointFunc != nil {
		return s.invokeRegisteredListenerEndpointFunc(ctx, request)
	}
	return nil, false, nil
}

func copyPluginRouteFixtureToWorkspace(t *testing.T, workspaceRoot string, fixtureName string) {
	t.Helper()

	copyPluginRouteFixtureToInstallRoot(t, filepath.Join(workspaceRoot, ".setta_plugins"), fixtureName)
}

func copyPluginRouteFixtureToSettaFiles(t *testing.T, settaFilesRoot string, fixtureName string) {
	t.Helper()

	copyPluginRouteFixtureToInstallRoot(t, filepath.Join(settaFilesRoot, "plugins"), fixtureName)
}

func copyPluginRouteFixtureToInstallRoot(t *testing.T, installRoot string, fixtureName string) {
	t.Helper()

	sourceRoot := filepath.Join(routePluginFixtureRepoRoot(t), "tests", "fixtures", "plugins", fixtureName)
	manifestPayload, err := os.ReadFile(filepath.Join(sourceRoot, "setta.plugin.json"))
	if err != nil {
		t.Fatalf("read plugin fixture manifest: %v", err)
	}
	var manifest struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin fixture manifest: %v", err)
	}

	targetRoot := filepath.Join(installRoot, manifest.ID)
	if err := copyRoutePluginFixtureDir(sourceRoot, targetRoot); err != nil {
		t.Fatalf("copy plugin fixture: %v", err)
	}
	if fixtureName == "frontend" || fixtureName == "full" {
		if err := rewriteRoutePluginManifest(targetRoot, func(payload map[string]any) {
			frontend := payload["frontend"].(map[string]any)
			frontend["entrypoint"] = "frontend/src/index.js"
			frontend["style"] = "frontend/src/index.css"
		}); err != nil {
			t.Fatalf("rewrite plugin fixture manifest: %v", err)
		}
	}
}

func writePluginRouteStateFile(t *testing.T, settaFilesRoot string, payload map[string]any) {
	t.Helper()

	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("marshal plugin state payload: %v", err)
	}
	encoded = append(encoded, '\n')
	path := filepath.Join(settaFilesRoot, "plugins_state.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir plugin state parent: %v", err)
	}
	if err := os.WriteFile(path, encoded, 0o644); err != nil {
		t.Fatalf("write plugin state payload: %v", err)
	}
}
