package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/lsp"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
	"setta/internal/testutil/firstpartyplugin"
)

func TestAppStartsWithoutPythonLanguageServerPluginOrSelection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	selectedByLanguage, err := settingsstate.LanguageServerSelectedByLanguage(app.SettingsState().Snapshot().Document)
	if err != nil {
		t.Fatalf("LanguageServerSelectedByLanguage returned error: %v", err)
	}
	selection, ok := selectedByLanguage["python"]
	if ok || selection != nil {
		t.Fatalf("expected missing Python selection by default, got ok=%v selection=%#v", ok, selection)
	}

	seedAppLSPCodeSectionProjectWithSource(t, app, "math.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	runtimeRequest, err := http.NewRequest(http.MethodGet, server.URL+"/api"+httpapi.RoutePluginsRuntime, nil)
	if err != nil {
		t.Fatalf("new plugin runtime request: %v", err)
	}
	runtimeRequest.AddCookie(authCookie)

	runtimeResponse, err := http.DefaultClient.Do(runtimeRequest)
	if err != nil {
		t.Fatalf("get plugin runtime: %v", err)
	}
	defer runtimeResponse.Body.Close()
	if runtimeResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(runtimeResponse.Body)
		t.Fatalf("expected plugin runtime 200, got %d with body %q", runtimeResponse.StatusCode, string(body))
	}

	var runtimePayload struct {
		Status struct {
			Plugins []plugins.PluginStatusEntry `json:"plugins"`
		} `json:"status"`
	}
	if err := json.NewDecoder(runtimeResponse.Body).Decode(&runtimePayload); err != nil {
		t.Fatalf("decode plugin runtime payload: %v", err)
	}
	if len(runtimePayload.Status.Plugins) != 0 {
		t.Fatalf("expected no installed plugins at startup, got %#v", runtimePayload.Status.Plugins)
	}

	completions := requestAppCodeAreaCompletion(
		t,
		server.URL,
		authCookie,
		"project-alpha",
		"runner",
		"math.",
		len("math."),
	)
	if len(completions) != 0 {
		t.Fatalf("expected no Python completions without a selected plugin, got %#v", completions)
	}

	diagnostics := fetchAppLatestLSPDiagnostics(t, server.URL, authCookie, "project-alpha")
	if diagnostics.ProjectID != "project-alpha" {
		t.Fatalf("expected diagnostics payload for project-alpha, got %#v", diagnostics.ProjectID)
	}
	if len(diagnostics.CodeSections) != 0 {
		t.Fatalf("expected empty code-section diagnostics without a selected plugin, got %#v", diagnostics.CodeSections)
	}
	if len(diagnostics.UnmappedGenCode) != 0 {
		t.Fatalf("expected no unmapped generated diagnostics without a selected plugin, got %#v", diagnostics.UnmappedGenCode)
	}
	if len(diagnostics.GenCode.Errors) != 0 {
		t.Fatalf("expected no generated-code diagnostics without a selected plugin, got %#v", diagnostics.GenCode.Errors)
	}

	restartRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRestartLanguageServer, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new restart language server request: %v", err)
	}
	restartRequest.Header.Set("Content-Type", "application/json")
	restartRequest.AddCookie(authCookie)

	restartResponse, err := http.DefaultClient.Do(restartRequest)
	if err != nil {
		t.Fatalf("post restart language server: %v", err)
	}
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart conflict when no plugin is selected, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	var restartPayload struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(restartResponse.Body).Decode(&restartPayload); err != nil {
		t.Fatalf("decode restart response: %v", err)
	}
	if restartPayload.Error.Code != "language_server_not_configured" {
		t.Fatalf("expected language_server_not_configured restart error, got %#v", restartPayload.Error)
	}
	if restartPayload.Error.Message != "Language server is not configured. Select a plugin and restart after it is available." {
		t.Fatalf("unexpected restart error message %#v", restartPayload.Error)
	}
}

func TestAppStartsWithPluginLanguageServerCompletion(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguage("fixturedsl"), "fixture.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	completions := requestAppCodeAreaCompletion(
		t,
		server.URL,
		newAppTestAuthCookie(t, app),
		"project-alpha",
		"runner",
		"fixture.",
		8,
	)
	if len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected startup plugin completions %#v", completions)
	}
}

func TestAppLinkedPluginLanguageServerBecomesAvailableAfterLink(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguage("fixturedsl"), "fixture.")

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	localPluginRoot := filepath.Join(t.TempDir(), "backend")
	copyAppTestDir(t, sourceRoot, localPluginRoot)
	rewriteAppPluginManifest(t, localPluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8)
	if len(completions) != 0 {
		t.Fatalf("expected no plugin completions before link, got %#v", completions)
	}

	requestBody := mustAppJSON(t, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           true,
	})
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RoutePluginsLink, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new plugins link request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins link: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins link 200, got %d with body %q", response.StatusCode, string(payload))
	}

	completions = requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8)
	if len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("unexpected linked plugin completions %#v", completions)
	}
}

func TestAppLinkedSelectedBasedpyrightPublishesDiagnosticsAfterLink(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("SETTA_PYTHON", firstpartyplugin.BasedpyrightPython(t))

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "python", "setta-basedpyright")
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "print(missing_name)\n")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	initialDiagnostics := fetchAppLatestLSPDiagnostics(t, server.URL, authCookie, "project-alpha")
	if len(initialDiagnostics.CodeSections) != 0 {
		t.Fatalf("expected no diagnostics before linking selected plugin, got %#v", initialDiagnostics.CodeSections)
	}

	localPluginRoot := filepath.Join(t.TempDir(), "setta-basedpyright")
	copyAppTestDir(t, filepath.Join(appTestRepoRoot(t), "plugins", "setta-basedpyright"), localPluginRoot)
	requestBody := mustAppJSON(t, map[string]any{
		"localPluginRoot": localPluginRoot,
		"scope":           "workspace",
		"enable":          true,
		"force":           true,
	})
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RoutePluginsLink, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new plugins link request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins link: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins link 200, got %d with body %q", response.StatusCode, string(payload))
	}
	var linkPayload struct {
		RestartRequired bool `json:"restartRequired"`
	}
	if err := json.NewDecoder(response.Body).Decode(&linkPayload); err != nil {
		t.Fatalf("decode plugins link payload: %v", err)
	}
	if linkPayload.RestartRequired {
		t.Fatalf("expected selected language-server link to reconcile without restart, got %#v", linkPayload)
	}

	waitForAppCondition(t, 15*time.Second, func() bool {
		return len(fetchAppLatestLSPDiagnostics(t, server.URL, authCookie, "project-alpha").CodeSections["runner"]) > 0
	})

	diagnostics := fetchAppLatestLSPDiagnostics(t, server.URL, authCookie, "project-alpha")
	if len(diagnostics.CodeSections["runner"]) == 0 {
		t.Fatalf("expected linked basedpyright diagnostics, got %#v", diagnostics)
	}
}

func TestAppDisablingSelectedBasedpyrightClearsDiagnosticsWithoutRestart(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "print(missing_name)\n")
	selectAppLanguageServer(t, app, "python", "setta-basedpyright")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	waitForAppCondition(t, 15*time.Second, func() bool {
		return len(fetchAppLatestLSPDiagnostics(t, server.URL, authCookie, "project-alpha").CodeSections["runner"]) > 0
	})

	requestBody := mustAppJSON(t, map[string]any{"pluginId": "setta-basedpyright"})
	request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RoutePluginsDisable, bytes.NewReader(requestBody))
	if err != nil {
		t.Fatalf("new plugins disable request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("post plugins disable: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins disable 200, got %d with body %q", response.StatusCode, string(payload))
	}
	var disablePayload struct {
		RestartRequired bool `json:"restartRequired"`
	}
	if err := json.NewDecoder(response.Body).Decode(&disablePayload); err != nil {
		t.Fatalf("decode plugins disable payload: %v", err)
	}
	if disablePayload.RestartRequired {
		t.Fatalf("expected selected language-server disable to reconcile without restart, got %#v", disablePayload)
	}

	waitForAppCondition(t, 15*time.Second, func() bool {
		payload := fetchAppLatestLSPDiagnostics(t, server.URL, authCookie, "project-alpha")
		return len(payload.CodeSections) == 0 && len(payload.GenCode.Errors) == 0 && len(payload.UnmappedGenCode) == 0
	})

	diagnostics := fetchAppLatestLSPDiagnostics(t, server.URL, authCookie, "project-alpha")
	if len(diagnostics.CodeSections) != 0 || len(diagnostics.GenCode.Errors) != 0 || len(diagnostics.UnmappedGenCode) != 0 {
		t.Fatalf("expected diagnostics to clear after disabling selected plugin, got %#v", diagnostics)
	}
}

func TestAppWritingSelectedBasedpyrightConfigRefreshesAppliedSpecsAndStatus(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "print(missing_name)\n")
	selectAppLanguageServer(t, app, "python", "setta-basedpyright")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	writeAppPluginConfig(t, server.URL, authCookie, "setta-basedpyright", map[string]any{
		"basedpyright": map[string]any{
			"analysis": map[string]any{
				"diagnosticSeverityOverrides": map[string]any{
					"reportUndefinedVariable":   "none",
					"reportUnknownArgumentType": "none",
				},
			},
		},
	})

	specs, _ := cloneAppRuntimeLanguageServerSpecs(t, app)
	if len(specs) != 1 {
		t.Fatalf("expected one applied lsp spec, got %#v", specs)
	}
	basedpyrightSettings, ok := specs[0].Settings["basedpyright"].(map[string]any)
	if !ok {
		t.Fatalf("expected basedpyright settings root, got %#v", specs[0].Settings)
	}
	analysis, ok := basedpyrightSettings["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("expected basedpyright analysis settings, got %#v", basedpyrightSettings["analysis"])
	}
	overrides, ok := analysis["diagnosticSeverityOverrides"].(map[string]any)
	if !ok {
		t.Fatalf("expected basedpyright diagnosticSeverityOverrides map, got %#v", analysis["diagnosticSeverityOverrides"])
	}
	if got := overrides["reportUndefinedVariable"]; got != "none" {
		t.Fatalf("expected reportUndefinedVariable override to be none, got %#v", got)
	}
	if got := overrides["reportUnknownArgumentType"]; got != "none" {
		t.Fatalf("expected reportUnknownArgumentType override to be none, got %#v", got)
	}

	status := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-basedpyright")
	if len(entry.AppliedLanguageServerLanguages) != 1 || entry.AppliedLanguageServerLanguages[0] != "python" {
		t.Fatalf("expected applied python status after config refresh, got %#v", entry.AppliedLanguageServerLanguages)
	}
}

func TestAppWritingConfigForAppliedLanguageServerRefreshesProjectSyncOnce(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	_, recordingSyncer := attachRecordingProjectSyncer(t, app, nil)

	writeAppPluginConfig(t, server.URL, authCookie, "setta-fixture-backend", fixtureLanguageServerConfig(true))
	if recordingSyncer.closeCalls != 1 {
		t.Fatalf("expected one project synchronizer restart after applied plugin config write, got %d", recordingSyncer.closeCalls)
	}
}

func TestAppWritingConfigForAppliedLanguageServerRollsBackPersistedConfigOnRefreshFailure(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	oldConfig := fixtureLanguageServerConfig(false)
	newConfig := fixtureLanguageServerConfig(true)
	writeAppPluginConfig(t, server.URL, authCookie, "setta-fixture-backend", oldConfig)
	beforeCurrentSpecs, beforeAppliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, app)

	_, recordingSyncer := attachRecordingProjectSyncer(t, app, &recordingProjectSyncer{
		syncErrs: []error{errors.New("sync failed"), nil},
	})

	response := postAppPluginConfig(t, server.URL, authCookie, "setta-fixture-backend", newConfig)
	defer response.Body.Close()
	if response.StatusCode != http.StatusInternalServerError {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected plugins config 500 after refresh failure, got %d with body %q", response.StatusCode, string(payload))
	}

	persistedState := readAppPluginsState(t, cfg)
	persistedConfig, ok := persistedState.PluginConfigByID["workspace:setta-fixture-backend"].(map[string]any)
	if !ok || !reflect.DeepEqual(persistedConfig, oldConfig) {
		t.Fatalf("expected persisted plugin config to roll back to %#v, got %#v", oldConfig, persistedState.PluginConfigByID)
	}

	afterCurrentSpecs, afterAppliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, app)
	if !languageServerSpecSlicesEqual(beforeCurrentSpecs, afterCurrentSpecs) {
		t.Fatalf("expected current specs to remain unchanged after failed config write, got before=%#v after=%#v", beforeCurrentSpecs, afterCurrentSpecs)
	}
	if !languageServerSpecSlicesEqual(beforeAppliedSpecs, afterAppliedSpecs) {
		t.Fatalf("expected applied specs to remain unchanged after failed config write, got before=%#v after=%#v", beforeAppliedSpecs, afterAppliedSpecs)
	}
	if recordingSyncer.closeCalls != 2 {
		t.Fatalf("expected failed config refresh to re-materialize project state once after rollback, got %d close calls", recordingSyncer.closeCalls)
	}
	if recordingSyncer.syncCalls != 2 {
		t.Fatalf("expected failed config refresh to sync documents again after rollback, got %d sync calls", recordingSyncer.syncCalls)
	}
}

func TestAppWritingConfigForSelectedUnappliedLanguageServerDoesNotApplyUntilRestart(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	initialStatus := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	initialEntry := mustFindAppPluginStatusEntry(t, initialStatus, "setta-fixture-backend")
	if len(initialEntry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected unapplied selection before config write, got %#v", initialEntry.AppliedLanguageServerLanguages)
	}

	writeAppPluginConfig(t, server.URL, authCookie, "setta-fixture-backend", fixtureLanguageServerConfig(true))

	statusAfterConfig := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entryAfterConfig := mustFindAppPluginStatusEntry(t, statusAfterConfig, "setta-fixture-backend")
	if len(entryAfterConfig.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected config write not to apply selected plugin before restart, got %#v", entryAfterConfig.AppliedLanguageServerLanguages)
	}

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	statusAfterRestart := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entryAfterRestart := mustFindAppPluginStatusEntry(t, statusAfterRestart, "setta-fixture-backend")
	if len(entryAfterRestart.AppliedLanguageServerLanguages) != 1 || entryAfterRestart.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected selected plugin to apply after restart, got %#v", entryAfterRestart.AppliedLanguageServerLanguages)
	}
}

func TestAppWritingConfigForAppliedLanguageServerDoesNotApplyOtherSelectedLanguageServerUntilRestart(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)
	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	replaceAppLanguageServerSelectionsWithoutRefresh(t, app, map[string]string{})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "str.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	setAppLanguageServerSelectionWithoutRefresh(t, app, "python", "setta-basedpyright")
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "str.", 4); len(completions) != 0 {
		t.Fatalf("expected no Python completions before restart, got %#v", completions)
	}

	writeAppPluginConfig(t, server.URL, authCookie, "setta-fixture-backend", fixtureLanguageServerConfig(true))

	currentSpecs, appliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, app)
	if len(currentSpecs) != 1 || currentSpecs[0].LanguageID != "fixturedsl" {
		t.Fatalf("expected current specs to keep only fixturedsl applied after config write, got %#v", currentSpecs)
	}
	if len(appliedSpecs) != 1 || appliedSpecs[0].LanguageID != "fixturedsl" {
		t.Fatalf("expected applied specs to keep only fixturedsl after config write, got %#v", appliedSpecs)
	}

	statusAfterConfig := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	fixtureEntry := mustFindAppPluginStatusEntry(t, statusAfterConfig, "setta-fixture-backend")
	if len(fixtureEntry.AppliedLanguageServerLanguages) != 1 || fixtureEntry.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected fixturedsl to remain the only applied language server after config write, got %#v", fixtureEntry.AppliedLanguageServerLanguages)
	}
	basedpyrightEntry := mustFindAppPluginStatusEntry(t, statusAfterConfig, "setta-basedpyright")
	if len(basedpyrightEntry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected basedpyright to remain unapplied after config write, got %#v", basedpyrightEntry.AppliedLanguageServerLanguages)
	}
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "str.", 4); len(completions) != 0 {
		t.Fatalf("expected config write not to apply Python before restart, got %#v", completions)
	}
}

func TestAppWritingConfigForAppliedLanguageServerKeepsClearedSelectionPendingUntilRestart(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguage("fixturedsl"), "fixture.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("expected initial fixture completions, got %#v", completions)
	}

	replaceAppLanguageServerSelectionsWithoutRefresh(t, app, map[string]string{})

	writeAppPluginConfig(t, server.URL, authCookie, "setta-fixture-backend", fixtureLanguageServerConfig(true))

	currentSpecs, appliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, app)
	if len(currentSpecs) != 1 || currentSpecs[0].PluginID != "setta-fixture-backend" || currentSpecs[0].LanguageID != "fixturedsl" {
		t.Fatalf("expected current specs to keep applied fixture language server pending until restart, got %#v", currentSpecs)
	}
	if len(appliedSpecs) != 1 || appliedSpecs[0].PluginID != "setta-fixture-backend" || appliedSpecs[0].LanguageID != "fixturedsl" {
		t.Fatalf("expected applied specs to keep fixture language server pending until restart, got %#v", appliedSpecs)
	}

	statusAfterConfig := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entryAfterConfig := mustFindAppPluginStatusEntry(t, statusAfterConfig, "setta-fixture-backend")
	if len(entryAfterConfig.AppliedLanguageServerLanguages) != 1 || entryAfterConfig.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected fixture language server to remain applied after config write with cleared selection, got %#v", entryAfterConfig.AppliedLanguageServerLanguages)
	}
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("expected fixture completions to remain available until restart, got %#v", completions)
	}

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart conflict after clearing selection, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	statusAfterRestart := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entryAfterRestart := mustFindAppPluginStatusEntry(t, statusAfterRestart, "setta-fixture-backend")
	if len(entryAfterRestart.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected fixture language server to clear only after restart, got %#v", entryAfterRestart.AppliedLanguageServerLanguages)
	}
}

func TestAppWritingConfigForAppliedLanguageServerKeepsSwitchedSelectionPendingUntilRestart(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)
	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend-alt")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend-alt"), func(payload map[string]any) {
		payload["id"] = "setta-fixture-backend-alt"
		payload["name"] = "setta-fixture-backend-alt"
		payload["capabilities"] = []string{"registerLanguageServer"}
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguage("fixturedsl"), "fixture.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("expected initial fixture completions, got %#v", completions)
	}

	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend-alt")

	writeAppPluginConfig(t, server.URL, authCookie, "setta-fixture-backend", fixtureLanguageServerConfig(true))

	currentSpecs, appliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, app)
	if len(currentSpecs) != 1 || currentSpecs[0].PluginID != "setta-fixture-backend" || currentSpecs[0].LanguageID != "fixturedsl" {
		t.Fatalf("expected current specs to keep original fixture language server pending until restart, got %#v", currentSpecs)
	}
	if len(appliedSpecs) != 1 || appliedSpecs[0].PluginID != "setta-fixture-backend" || appliedSpecs[0].LanguageID != "fixturedsl" {
		t.Fatalf("expected applied specs to keep original fixture language server pending until restart, got %#v", appliedSpecs)
	}

	statusAfterConfig := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	originalEntry := mustFindAppPluginStatusEntry(t, statusAfterConfig, "setta-fixture-backend")
	if len(originalEntry.AppliedLanguageServerLanguages) != 1 || originalEntry.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected original fixture plugin to remain applied until restart, got %#v", originalEntry.AppliedLanguageServerLanguages)
	}
	altEntry := mustFindAppPluginStatusEntry(t, statusAfterConfig, "setta-fixture-backend-alt")
	if len(altEntry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected switched fixture plugin to remain unapplied until restart, got %#v", altEntry.AppliedLanguageServerLanguages)
	}
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("expected original fixture completions to remain available until restart, got %#v", completions)
	}

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200 after switching to alternate plugin, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	statusAfterRestart := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	originalEntry = mustFindAppPluginStatusEntry(t, statusAfterRestart, "setta-fixture-backend")
	if len(originalEntry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected original fixture plugin to stop being applied after restart, got %#v", originalEntry.AppliedLanguageServerLanguages)
	}
	altEntry = mustFindAppPluginStatusEntry(t, statusAfterRestart, "setta-fixture-backend-alt")
	if len(altEntry.AppliedLanguageServerLanguages) != 1 || altEntry.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected alternate fixture plugin to apply after restart, got %#v", altEntry.AppliedLanguageServerLanguages)
	}
}

func TestAppPluginRuntimeStatusTracksAppliedLanguageServerSelection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	initialStatus := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	initialEntry := mustFindAppPluginStatusEntry(t, initialStatus, "setta-fixture-backend")
	if len(initialEntry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected unapplied selection before restart, got %#v", initialEntry.AppliedLanguageServerLanguages)
	}

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	status := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-fixture-backend")
	if len(entry.AppliedLanguageServerLanguages) != 1 || entry.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected applied fixturedsl selection after restart, got %#v", entry.AppliedLanguageServerLanguages)
	}
}

func TestAppPluginRescanKeepsSelectedLanguageServerOnlyPluginPendingUntilRestart(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")
	writeAppPendingRestartPluginState(t, cfg, "setta-fixture-backend")
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguage("fixturedsl"), "fixture.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	expectAppFixturePluginPendingRestartState(t, cfg, server.URL, authCookie, "before rescan")

	rescanResponse := rescanAppPlugins(t, server.URL, authCookie)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugins rescan 200, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	expectAppFixturePluginPendingRestartState(t, cfg, server.URL, authCookie, "after rescan")

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200 after rescan, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	expectAppFixturePluginAppliedState(t, server.URL, authCookie, "after restart")
}

func TestAppPluginRescanKeepsMixedBackendPluginPendingUntilPluginRestart(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer", "registerRouter"}
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")
	writeAppPendingRestartPluginStateWithLanguageServerOnlyIDs(t, cfg, []string{"setta-fixture-backend"}, nil)
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguage("fixturedsl"), "fixture.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	expectAppFixturePluginPendingRestartState(t, cfg, server.URL, authCookie, "before rescan")

	rescanResponse := rescanAppPlugins(t, server.URL, authCookie)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugins rescan 200, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	expectAppFixturePluginPendingRestartState(t, cfg, server.URL, authCookie, "after rescan")

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart conflict for mixed backend plugin after rescan, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	expectAppFixturePluginPendingRestartState(t, cfg, server.URL, authCookie, "after LSP restart")

	pluginRestartResponse := restartAppPlugins(t, server.URL, authCookie)
	defer pluginRestartResponse.Body.Close()
	if pluginRestartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(pluginRestartResponse.Body)
		t.Fatalf("expected plugins restart 200 after rescan, got %d with body %q", pluginRestartResponse.StatusCode, string(body))
	}

	expectAppFixturePluginAppliedState(t, server.URL, authCookie, "after full plugin restart")
}

func TestAppRestartLanguageServerKeepsMixedBackendPluginPendingUntilPluginRestart(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppPluginFixture(t, cfg, "backend", "setta-fixture-backend")
	rewriteAppPluginManifest(t, filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend"), func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer", "registerRouter"}
	})

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguage("fixturedsl"), "fixture.")
	writeAppPendingRestartPluginStateWithLanguageServerOnlyIDs(t, cfg, []string{"setta-fixture-backend"}, nil)
	if err := app.pluginRuntime.Close(context.Background()); err != nil {
		t.Fatalf("close plugin runtime before reinitialize: %v", err)
	}
	if err := app.pluginRuntime.Initialize(context.Background()); err != nil {
		t.Fatalf("reinitialize plugin runtime with pending mixed backend plugin: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	rescanResponse := rescanAppPlugins(t, server.URL, authCookie)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugins rescan 200, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	expectAppFixturePluginPendingRestartState(t, cfg, server.URL, authCookie, "before restart")

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK && restartResponse.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected LSP restart to leave pending mixed backend plugin untouched, got %d with body %q", restartResponse.StatusCode, string(body))
	}
	if restartResponse.StatusCode == http.StatusConflict {
		var restartPayload struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		if err := json.NewDecoder(restartResponse.Body).Decode(&restartPayload); err != nil {
			t.Fatalf("decode restart response: %v", err)
		}
		if restartPayload.Error.Code != "language_server_not_configured" {
			t.Fatalf("expected language_server_not_configured restart error, got %#v", restartPayload.Error)
		}
	}

	expectAppFixturePluginPendingRestartState(t, cfg, server.URL, authCookie, "after LSP restart")

	pluginRestartResponse := restartAppPlugins(t, server.URL, authCookie)
	defer pluginRestartResponse.Body.Close()
	if pluginRestartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(pluginRestartResponse.Body)
		t.Fatalf("expected plugins restart 200, got %d with body %q", pluginRestartResponse.StatusCode, string(body))
	}

	expectAppFixturePluginAppliedState(t, server.URL, authCookie, "after full plugin restart")
}

func TestAppInitializeKeepsSelectedLanguageServerOnlyPluginPendingUntilRestart(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	setAppLanguageServerSelectionWithoutRefresh(t, app, "python", "setta-basedpyright")
	writeAppPendingRestartPluginState(t, cfg, "setta-basedpyright")
	if err := app.pluginRuntime.Close(context.Background()); err != nil {
		t.Fatalf("close plugin runtime before reinitialize: %v", err)
	}
	if err := app.pluginRuntime.Initialize(context.Background()); err != nil {
		t.Fatalf("reinitialize plugin runtime: %v", err)
	}
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "str.")

	currentSpecs, appliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, app)
	if len(currentSpecs) != 0 || len(appliedSpecs) != 0 {
		t.Fatalf("expected startup to keep pending language-server-only plugin unapplied, got current=%#v applied=%#v", currentSpecs, appliedSpecs)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	status := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-basedpyright")
	if entry.State != plugins.PluginRuntimeStatePendingRestart || !entry.RestartRequired {
		t.Fatalf("expected basedpyright pending restart before restart, got %#v", entry)
	}
	if len(entry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected no applied languages before restart, got %#v", entry.AppliedLanguageServerLanguages)
	}
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "str.", 4); len(completions) != 0 {
		t.Fatalf("expected no python completions before restart, got %#v", completions)
	}
	persistedState := readAppPluginsState(t, cfg)
	if len(persistedState.PendingRestartBackendPluginIDs) != 1 || persistedState.PendingRestartBackendPluginIDs[0] != "setta-basedpyright" {
		t.Fatalf("expected pending restart ids to keep basedpyright before restart, got %#v", persistedState.PendingRestartBackendPluginIDs)
	}
	if len(persistedState.PendingRestartLanguageServerOnlyPluginIDs) != 1 || persistedState.PendingRestartLanguageServerOnlyPluginIDs[0] != "setta-basedpyright" {
		t.Fatalf("expected pending LSP-only restart ids to keep basedpyright before restart, got %#v", persistedState.PendingRestartLanguageServerOnlyPluginIDs)
	}

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	status = fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entry = mustFindAppPluginStatusEntry(t, status, "setta-basedpyright")
	if entry.State != plugins.PluginRuntimeStateActive || entry.RestartRequired {
		t.Fatalf("expected active basedpyright after restart, got %#v", entry)
	}
	if len(entry.AppliedLanguageServerLanguages) != 1 || entry.AppliedLanguageServerLanguages[0] != "python" {
		t.Fatalf("expected python to be applied after restart, got %#v", entry.AppliedLanguageServerLanguages)
	}
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "str.", 4); len(completions) == 0 {
		t.Fatalf("expected python completions after restart, got %#v", completions)
	}
	currentSpecs, appliedSpecs = cloneAppRuntimeLanguageServerSpecs(t, app)
	if len(currentSpecs) != 1 || currentSpecs[0].LanguageID != "python" {
		t.Fatalf("expected current specs to apply python after restart, got %#v", currentSpecs)
	}
	if len(appliedSpecs) != 1 || appliedSpecs[0].LanguageID != "python" {
		t.Fatalf("expected applied specs to apply python after restart, got %#v", appliedSpecs)
	}

	persistedState = readAppPluginsState(t, cfg)
	if len(persistedState.PendingRestartBackendPluginIDs) != 0 {
		t.Fatalf("expected pending restart ids to clear after LSP restart, got %#v", persistedState.PendingRestartBackendPluginIDs)
	}
	if len(persistedState.PendingRestartLanguageServerOnlyPluginIDs) != 0 {
		t.Fatalf("expected pending LSP-only restart ids to clear after LSP restart, got %#v", persistedState.PendingRestartLanguageServerOnlyPluginIDs)
	}
}

func TestAppRestartLanguageServerClearsPendingStateForSelectedLanguageServerOnlyPlugin(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")
	writeAppPendingRestartPluginState(t, cfg, "setta-fixture-backend")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	initialStatus := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	initialEntry := mustFindAppPluginStatusEntry(t, initialStatus, "setta-fixture-backend")
	if initialEntry.State != plugins.PluginRuntimeStatePendingRestart {
		t.Fatalf("expected pending restart before LSP restart, got %#v", initialEntry.State)
	}
	if len(initialEntry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected no applied languages before LSP restart, got %#v", initialEntry.AppliedLanguageServerLanguages)
	}

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	status := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-fixture-backend")
	if entry.State != plugins.PluginRuntimeStateActive || entry.RestartRequired {
		t.Fatalf("expected active applied fixture status after restart, got %#v", entry)
	}
	if len(entry.AppliedLanguageServerLanguages) != 1 || entry.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected applied fixturedsl selection after restart, got %#v", entry.AppliedLanguageServerLanguages)
	}

	persistedState := readAppPluginsState(t, cfg)
	if len(persistedState.PendingRestartBackendPluginIDs) != 0 {
		t.Fatalf("expected pending restart ids to clear after LSP restart, got %#v", persistedState.PendingRestartBackendPluginIDs)
	}
}

func TestAppRestartLanguageServerClearsPendingStateForDeselectedLanguageServerOnlyPlugin(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")
	writeAppPendingRestartPluginState(t, cfg, "setta-fixture-backend")
	replaceAppLanguageServerSelectionsWithoutRefresh(t, app, map[string]string{})

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	initialStatus := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	initialEntry := mustFindAppPluginStatusEntry(t, initialStatus, "setta-fixture-backend")
	if initialEntry.State != plugins.PluginRuntimeStatePendingRestart {
		t.Fatalf("expected pending restart before deselected LSP restart, got %#v", initialEntry.State)
	}
	if len(initialEntry.AppliedLanguageServerLanguages) != 1 || initialEntry.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected fixture language server to remain applied before restart, got %#v", initialEntry.AppliedLanguageServerLanguages)
	}

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart conflict after deselecting applied language server, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	status := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-fixture-backend")
	if entry.State != plugins.PluginRuntimeStateActive || entry.RestartRequired {
		t.Fatalf("expected active fixture status without pending restart after deselected restart, got %#v", entry)
	}
	if len(entry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected no applied fixture language server after deselected restart, got %#v", entry.AppliedLanguageServerLanguages)
	}

	persistedState := readAppPluginsState(t, cfg)
	if len(persistedState.PendingRestartBackendPluginIDs) != 0 {
		t.Fatalf("expected pending restart ids to clear after deselected LSP restart, got %#v", persistedState.PendingRestartBackendPluginIDs)
	}
}

func TestAppPluginRuntimeStatusKeepsAppliedLanguageAfterSelectedPluginDisappearsUntilRestart(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguage("fixturedsl"), "fixture.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	initialStatus := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	initialEntry := mustFindAppPluginStatusEntry(t, initialStatus, "setta-fixture-backend")
	if len(initialEntry.AppliedLanguageServerLanguages) != 1 || initialEntry.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected applied fixture language server before plugin removal, got %#v", initialEntry.AppliedLanguageServerLanguages)
	}
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("expected fixture completion before plugin removal, got %#v", completions)
	}

	if err := os.RemoveAll(filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend")); err != nil {
		t.Fatalf("remove selected plugin root: %v", err)
	}

	rescanResponse := rescanAppPlugins(t, server.URL, authCookie)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugins rescan 200 after plugin removal, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	statusAfterRemoval := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entryAfterRemoval := mustFindAppPluginStatusEntry(t, statusAfterRemoval, "setta-fixture-backend")
	if entryAfterRemoval.State != plugins.PluginRuntimeStateInvalid {
		t.Fatalf("expected synthesized invalid status after plugin removal, got %#v", entryAfterRemoval.State)
	}
	if len(entryAfterRemoval.AppliedLanguageServerLanguages) != 1 || entryAfterRemoval.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected applied fixture language server to remain published after plugin removal, got %#v", entryAfterRemoval.AppliedLanguageServerLanguages)
	}
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("expected fixture completion to remain available before restart, got %#v", completions)
	}

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart conflict after selected plugin removal, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	statusAfterRestart := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	for _, entry := range statusAfterRestart {
		if entry.PluginID != "setta-fixture-backend" {
			continue
		}
		if len(entry.AppliedLanguageServerLanguages) != 0 {
			t.Fatalf("expected removed plugin to stop reporting applied languages after restart, got %#v", entry.AppliedLanguageServerLanguages)
		}
	}
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 0 {
		t.Fatalf("expected no fixture completion after restart clears removed plugin, got %#v", completions)
	}
}

func TestAppRestartLanguageServerReturnsUnconfiguredWhenDefaultInterpreterLacksBasedpyright(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))
	installAppRepoPlugin(t, cfg, "setta-basedpyright")

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "python", "setta-basedpyright")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	status := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-basedpyright")
	if entry.State != plugins.PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid basedpyright plugin status, got %#v", entry.State)
	}
	if len(entry.RegisteredLanguageServers) != 0 {
		t.Fatalf("expected invalid basedpyright plugin to expose no language server registrations, got %#v", entry.RegisteredLanguageServers)
	}
	if len(entry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected invalid basedpyright plugin to expose no applied languages, got %#v", entry.AppliedLanguageServerLanguages)
	}

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart conflict for invalid default interpreter, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	var restartPayload struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(restartResponse.Body).Decode(&restartPayload); err != nil {
		t.Fatalf("decode restart response: %v", err)
	}
	if restartPayload.Error.Code != "language_server_not_configured" {
		t.Fatalf("expected language_server_not_configured restart error, got %#v", restartPayload.Error)
	}
}

func TestAppRestartLanguageServerClearsPendingStateForInvalidSelectedLanguageServerOnlyPlugin(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv("SETTA_PYTHON", firstpartyplugin.EmptyPython(t))
	installAppRepoPlugin(t, cfg, "setta-basedpyright")

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	setAppLanguageServerSelectionWithoutRefresh(t, app, "python", "setta-basedpyright")
	writeAppPendingRestartPluginState(t, cfg, "setta-basedpyright")
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "str.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusConflict {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart conflict for invalid selected plugin, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	var restartPayload struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(restartResponse.Body).Decode(&restartPayload); err != nil {
		t.Fatalf("decode restart response: %v", err)
	}
	if restartPayload.Error.Code != "language_server_not_configured" {
		t.Fatalf("expected language_server_not_configured restart error, got %#v", restartPayload.Error)
	}

	persistedState := readAppPluginsState(t, cfg)
	if len(persistedState.PendingRestartBackendPluginIDs) != 0 {
		t.Fatalf("expected pending restart ids to clear after invalid selected-plugin restart, got %#v", persistedState.PendingRestartBackendPluginIDs)
	}
	if len(persistedState.PendingRestartLanguageServerOnlyPluginIDs) != 0 {
		t.Fatalf("expected pending LSP-only restart ids to clear after invalid selected-plugin restart, got %#v", persistedState.PendingRestartLanguageServerOnlyPluginIDs)
	}

	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "str.", 4); len(completions) != 0 {
		t.Fatalf("expected no Python completions after invalid selected-plugin restart, got %#v", completions)
	}
}

func TestWorkspaceLSPAdminRestartRollsBackAppliedLanguageServerStateOnProjectRestartFailure(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)
	installAppLanguageServerOnlyFixturePlugin(t, cfg)
	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	replaceAppLanguageServerSelectionsWithoutRefresh(t, app, map[string]string{})
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")
	setAppLanguageServerSelectionWithoutRefresh(t, app, "python", "setta-basedpyright")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	beforeCurrentSpecs, beforeAppliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, app)

	recordingSyncer := &recordingProjectSyncer{syncErrs: []error{errors.New("sync failed")}}
	projectSync, err := lsp.NewProjectSynchronizer(lsp.ProjectSynchronizerOptions{
		SettaFilesRoot: cfg.Paths.SettaFilesRoot,
		Service:        recordingSyncer,
	})
	if err != nil {
		t.Fatalf("new project synchronizer: %v", err)
	}
	t.Cleanup(func() {
		if err := projectSync.Close(context.Background()); err != nil {
			t.Fatalf("close project synchronizer: %v", err)
		}
	})

	admin := newWorkspaceLSPAdmin(projectSync, app.pluginRuntime)
	restartErr := admin.Restart(context.Background(), app.ProjectStates().Main().Snapshot().Document)
	if restartErr == nil || !strings.Contains(restartErr.Error(), "sync failed") {
		t.Fatalf("expected restart sync failure, got %v", restartErr)
	}

	afterCurrentSpecs, afterAppliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, app)
	if !languageServerSpecSlicesEqual(beforeCurrentSpecs, afterCurrentSpecs) {
		t.Fatalf("expected current specs to roll back after restart failure, got before=%#v after=%#v", beforeCurrentSpecs, afterCurrentSpecs)
	}
	if !languageServerSpecSlicesEqual(beforeAppliedSpecs, afterAppliedSpecs) {
		t.Fatalf("expected applied specs to remain unchanged after restart failure, got before=%#v after=%#v", beforeAppliedSpecs, afterAppliedSpecs)
	}

	status := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	fixtureEntry := mustFindAppPluginStatusEntry(t, status, "setta-fixture-backend")
	if len(fixtureEntry.AppliedLanguageServerLanguages) != 1 || fixtureEntry.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected fixture language server to remain applied after failed restart, got %#v", fixtureEntry.AppliedLanguageServerLanguages)
	}
	basedpyrightEntry := mustFindAppPluginStatusEntry(t, status, "setta-basedpyright")
	if len(basedpyrightEntry.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected basedpyright to remain unapplied after failed restart, got %#v", basedpyrightEntry.AppliedLanguageServerLanguages)
	}
	if recordingSyncer.closeCalls != 2 {
		t.Fatalf("expected failed restart to re-materialize prior project sync state, got %d close calls", recordingSyncer.closeCalls)
	}
	if recordingSyncer.syncCalls != 2 {
		t.Fatalf("expected failed restart to sync documents again after rollback, got %d sync calls", recordingSyncer.syncCalls)
	}
}

func TestAppRestartLanguageServerIgnoresBrokenUnrelatedMCPPlugin(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)
	installAppPluginFixture(t, cfg, "backend-mcp-tools", "setta-fixture-backend-mcp-tools")

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "python", "setta-basedpyright")
	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "str.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	if len(requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "str.", 4)) == 0 {
		t.Fatal("expected basedpyright completions before breaking unrelated MCP plugin")
	}

	brokenBackendPath := filepath.Join(
		cfg.Paths.WorkspaceRoot,
		".setta_plugins",
		"setta-fixture-backend-mcp-tools",
		"backend",
		"main.go",
	)
	if err := os.WriteFile(brokenBackendPath, []byte("package main\n\nfunc main() {\n\tbroken\n}\n"), 0o644); err != nil {
		t.Fatalf("break backend mcp plugin: %v", err)
	}

	restartRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteRestartLanguageServer, strings.NewReader("null"))
	if err != nil {
		t.Fatalf("new restart language server request: %v", err)
	}
	restartRequest.Header.Set("Content-Type", "application/json")
	restartRequest.AddCookie(authCookie)
	restartResponse, err := http.DefaultClient.Do(restartRequest)
	if err != nil {
		t.Fatalf("post restart language server: %v", err)
	}
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200 with unrelated broken MCP plugin, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	if len(requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "str.", 4)) == 0 {
		t.Fatal("expected basedpyright completions after restart with unrelated broken MCP plugin")
	}
}

func TestAppStartsWithFirstPartyBasedpyrightPluginCompletion(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	prepareAppFirstPartyBasedpyrightPlugin(t, cfg)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})
	selectAppLanguageServer(t, app, "python", "setta-basedpyright")

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "str.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	completions := requestAppCodeAreaCompletion(
		t,
		server.URL,
		newAppTestAuthCookie(t, app),
		"project-alpha",
		"runner",
		"str.",
		4,
	)
	if len(completions) == 0 {
		t.Fatal("expected basedpyright completions from first-party plugin")
	}
}

func TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightOnFirstOpen(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	prepareAppDefaultsProfilePackageManagerBasedpyrightEnv(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	assertAppDefaultsProfileBasedpyrightBootstrapped(t, app)

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "str.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	completions := requestAppCodeAreaCompletion(
		t,
		server.URL,
		newAppTestAuthCookie(t, app),
		"project-alpha",
		"runner",
		"str.",
		4,
	)
	if len(completions) == 0 {
		t.Fatal("expected basedpyright completions from defaults profile package-manager plugin")
	}
}

func TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightWithoutGoToolchain(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	t.Setenv("SETTA_GO_BIN", filepath.Join(t.TempDir(), "missing-go"))
	t.Setenv("GO", filepath.Join(t.TempDir(), "missing-go"))
	t.Setenv("PATH", t.TempDir())

	prepareAppDefaultsProfilePackageManagerBasedpyrightEnv(t)

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	assertAppDefaultsProfileBasedpyrightBootstrapped(t, app)

	seedAppLSPCodeSectionProjectWithLanguage(t, app, projectstate.CodeLanguagePython, "str.")

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	completions := requestAppCodeAreaCompletion(
		t,
		server.URL,
		newAppTestAuthCookie(t, app),
		"project-alpha",
		"runner",
		"str.",
		4,
	)
	if len(completions) == 0 {
		t.Fatal("expected basedpyright completions from defaults profile package-manager plugin without go")
	}
}

func TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightWhenMarkerPathIsDirectory(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	prepareAppDefaultsProfilePackageManagerBasedpyrightEnv(t)
	if err := os.MkdirAll(defaultsProfileBootstrapStatePath(cfg.Paths.RuntimeRoot), 0o755); err != nil {
		t.Fatalf("mkdir defaults profile marker path as directory: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(0, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	assertAppDefaultsProfileBasedpyrightBootstrapped(t, app)
}

func prepareAppDefaultsProfilePackageManagerBasedpyrightEnv(t *testing.T) {
	t.Helper()

	t.Setenv("SETTA_PYTHON", firstpartyplugin.BasedpyrightPython(t))

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installDefaultsProfilePackageManagerPlugin(t, sitePackages)

	existingPythonPath := strings.TrimSpace(os.Getenv("PYTHONPATH"))
	if existingPythonPath == "" {
		t.Setenv("PYTHONPATH", sitePackages)
		return
	}
	t.Setenv("PYTHONPATH", sitePackages+string(os.PathListSeparator)+existingPythonPath)
}

func assertAppDefaultsProfileBasedpyrightBootstrapped(t *testing.T, app *App) {
	t.Helper()

	selectedByLanguage, err := settingsstate.LanguageServerSelectedByLanguage(app.SettingsState().Snapshot().Document)
	if err != nil {
		t.Fatalf("LanguageServerSelectedByLanguage returned error: %v", err)
	}
	selection, ok := selectedByLanguage["python"]
	if !ok || selection == nil || *selection != "setta-basedpyright" {
		t.Fatalf("expected bootstrapped defaults selection, got ok=%v selection=%#v", ok, selection)
	}
	if app.pluginRuntime == nil || !app.pluginRuntime.HasConfiguredLanguageServers() {
		t.Fatal("expected defaults profile plugin runtime to configure Python language servers")
	}
}
