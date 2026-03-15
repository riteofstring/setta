package httpapi

import (
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

	"github.com/go-chi/chi/v5"
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
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid install scope 400, got %d with body %q", response.Code, response.Body.String())
	}

	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode invalid install scope response: %v", err)
	}
	if payload.Error.Code != string(plugins.ServiceErrorCodeScopeInvalid) {
		t.Fatalf("expected scope invalid error code, got %q", payload.Error.Code)
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

func newPluginRouteTestHandler(t *testing.T, mode config.Mode, service *plugins.Service) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		RegisterRoot: func(r chi.Router) {
			if err := RegisterPluginRootRoutes(r, PluginRootRouteDependencies{
				Service: service,
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
