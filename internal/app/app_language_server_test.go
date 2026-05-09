package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
	"setta/internal/testutil/firstpartyplugin"
)

func TestAppStartsWithoutPythonLanguageServerPluginOrSelection(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	isolateAppPackageManagerPlugins(t)

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
	runtimeStatus := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	if len(runtimeStatus) != 0 {
		t.Fatalf("expected no installed plugins at startup, got %#v", runtimeStatus)
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

	restartPayload := decodeAppLanguageServerErrorResponse(
		t,
		restartAppLanguageServer(t, server.URL, authCookie),
		http.StatusConflict,
		"restart when no plugin is selected",
	)
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
