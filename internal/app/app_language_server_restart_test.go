package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/lsp"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
	"setta/internal/testutil/firstpartyplugin"
)

type appLanguageServerErrorResponse struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func decodeAppLanguageServerErrorResponse(
	t *testing.T,
	response *http.Response,
	wantStatus int,
	label string,
) appLanguageServerErrorResponse {
	t.Helper()
	defer response.Body.Close()
	if response.StatusCode != wantStatus {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected %s status %d, got %d with body %q", label, wantStatus, response.StatusCode, string(body))
	}
	var payload appLanguageServerErrorResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode %s response: %v", label, err)
	}
	return payload
}

func assertAppResponseStatusAndClose(t *testing.T, response *http.Response, wantStatus int, label string) {
	t.Helper()
	defer response.Body.Close()
	if response.StatusCode != wantStatus {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected %s status %d, got %d with body %q", label, wantStatus, response.StatusCode, string(body))
	}
}

func assertAppLanguageServerSpec(
	t *testing.T,
	specs []lsp.LanguageServerSpec,
	pluginID string,
	languageID string,
	label string,
) {
	t.Helper()
	if len(specs) != 1 {
		t.Fatalf("expected one %s language server spec, got %#v", label, specs)
	}
	if specs[0].PluginID != pluginID || specs[0].LanguageID != languageID {
		t.Fatalf("expected %s spec plugin=%q language=%q, got %#v", label, pluginID, languageID, specs[0])
	}
}

func assertAppNoLanguageServerSpecs(
	t *testing.T,
	currentSpecs []lsp.LanguageServerSpec,
	appliedSpecs []lsp.LanguageServerSpec,
	label string,
) {
	t.Helper()
	if len(currentSpecs) != 0 || len(appliedSpecs) != 0 {
		t.Fatalf("expected no %s language server specs, got current=%#v applied=%#v", label, currentSpecs, appliedSpecs)
	}
}

func assertAppPluginRuntimeState(
	t *testing.T,
	entry plugins.PluginStatusEntry,
	wantState plugins.PluginRuntimeState,
	wantRestartRequired bool,
	label string,
) {
	t.Helper()
	if entry.State != wantState || entry.RestartRequired != wantRestartRequired {
		t.Fatalf("expected %s state=%q restartRequired=%v, got %#v", label, wantState, wantRestartRequired, entry)
	}
}

func assertAppPluginAppliedLanguages(
	t *testing.T,
	entry plugins.PluginStatusEntry,
	want []string,
	label string,
) {
	t.Helper()
	if !slices.Equal(entry.AppliedLanguageServerLanguages, want) {
		t.Fatalf("expected %s applied languages %#v, got %#v", label, want, entry.AppliedLanguageServerLanguages)
	}
}

func assertAppPendingRestartPluginIDs(
	t *testing.T,
	state plugins.PluginsStateFile,
	backendIDs []string,
	languageServerOnlyIDs []string,
	label string,
) {
	t.Helper()
	if !slices.Equal(state.PendingRestartBackendPluginIDs, backendIDs) {
		t.Fatalf("expected %s pending restart ids %#v, got %#v", label, backendIDs, state.PendingRestartBackendPluginIDs)
	}
	if !slices.Equal(state.PendingRestartLanguageServerOnlyPluginIDs, languageServerOnlyIDs) {
		t.Fatalf(
			"expected %s pending LSP-only restart ids %#v, got %#v",
			label,
			languageServerOnlyIDs,
			state.PendingRestartLanguageServerOnlyPluginIDs,
		)
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
	assertAppLanguageServerSpec(t, currentSpecs, "setta-fixture-backend", "fixturedsl", "current pending original")
	assertAppLanguageServerSpec(t, appliedSpecs, "setta-fixture-backend", "fixturedsl", "applied pending original")

	statusAfterConfig := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	originalEntry := mustFindAppPluginStatusEntry(t, statusAfterConfig, "setta-fixture-backend")
	assertAppPluginAppliedLanguages(t, originalEntry, []string{"fixturedsl"}, "original fixture before restart")
	altEntry := mustFindAppPluginStatusEntry(t, statusAfterConfig, "setta-fixture-backend-alt")
	assertAppPluginAppliedLanguages(t, altEntry, nil, "alternate fixture before restart")
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "fixture.", 8); len(completions) != 1 || completions[0].Label != "fixtureCompletion" {
		t.Fatalf("expected original fixture completions to remain available until restart, got %#v", completions)
	}

	assertAppResponseStatusAndClose(
		t,
		restartAppLanguageServer(t, server.URL, authCookie),
		http.StatusOK,
		"restart after switching to alternate plugin",
	)

	statusAfterRestart := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	originalEntry = mustFindAppPluginStatusEntry(t, statusAfterRestart, "setta-fixture-backend")
	assertAppPluginAppliedLanguages(t, originalEntry, nil, "original fixture after restart")
	altEntry = mustFindAppPluginStatusEntry(t, statusAfterRestart, "setta-fixture-backend-alt")
	assertAppPluginAppliedLanguages(t, altEntry, []string{"fixturedsl"}, "alternate fixture after restart")
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

	assertAppResponseStatusAndClose(
		t,
		rescanAppPlugins(t, server.URL, authCookie),
		http.StatusOK,
		"sync pending fixture plugin state before rescan assertions",
	)

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
	assertAppResponseStatusAndClose(
		t,
		rescanAppPlugins(t, server.URL, authCookie),
		http.StatusOK,
		"sync fixture state after selected LSP restart",
	)

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

	assertAppResponseStatusAndClose(
		t,
		rescanAppPlugins(t, server.URL, authCookie),
		http.StatusOK,
		"sync pending mixed plugin state before rescan assertions",
	)

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
	assertAppNoLanguageServerSpecs(t, currentSpecs, appliedSpecs, "startup pending")

	server := httptest.NewServer(app.Handler())
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	assertAppResponseStatusAndClose(
		t,
		rescanAppPlugins(t, server.URL, authCookie),
		http.StatusOK,
		"sync pending basedpyright state before restart",
	)

	status := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entry := mustFindAppPluginStatusEntry(t, status, "setta-basedpyright")
	assertAppPluginRuntimeState(t, entry, plugins.PluginRuntimeStatePendingRestart, true, "basedpyright before restart")
	assertAppPluginAppliedLanguages(t, entry, nil, "basedpyright before restart")
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "str.", 4); len(completions) != 0 {
		t.Fatalf("expected no python completions before restart, got %#v", completions)
	}
	persistedState := readAppPluginsState(t, cfg)
	assertAppPendingRestartPluginIDs(
		t,
		persistedState,
		[]string{"setta-basedpyright"},
		[]string{"setta-basedpyright"},
		"basedpyright before restart",
	)

	assertAppResponseStatusAndClose(t, restartAppLanguageServer(t, server.URL, authCookie), http.StatusOK, "restart")
	assertAppResponseStatusAndClose(
		t,
		rescanAppPlugins(t, server.URL, authCookie),
		http.StatusOK,
		"sync basedpyright state after restart",
	)

	status = fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	entry = mustFindAppPluginStatusEntry(t, status, "setta-basedpyright")
	assertAppPluginRuntimeState(t, entry, plugins.PluginRuntimeStateActive, false, "basedpyright after restart")
	assertAppPluginAppliedLanguages(t, entry, []string{"python"}, "basedpyright after restart")
	if completions := requestAppCodeAreaCompletion(t, server.URL, authCookie, "project-alpha", "runner", "str.", 4); len(completions) == 0 {
		t.Fatalf("expected python completions after restart, got %#v", completions)
	}
	currentSpecs, appliedSpecs = cloneAppRuntimeLanguageServerSpecs(t, app)
	assertAppLanguageServerSpec(t, currentSpecs, "setta-basedpyright", "python", "current after restart")
	assertAppLanguageServerSpec(t, appliedSpecs, "setta-basedpyright", "python", "applied after restart")

	persistedState = readAppPluginsState(t, cfg)
	assertAppPendingRestartPluginIDs(t, persistedState, nil, nil, "after restart")
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

	assertAppResponseStatusAndClose(
		t,
		rescanAppPlugins(t, server.URL, authCookie),
		http.StatusOK,
		"sync selected pending fixture plugin state before restart",
	)

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
	assertAppResponseStatusAndClose(
		t,
		rescanAppPlugins(t, server.URL, authCookie),
		http.StatusOK,
		"sync selected fixture state after restart",
	)

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

	assertAppResponseStatusAndClose(
		t,
		rescanAppPlugins(t, server.URL, authCookie),
		http.StatusOK,
		"rescan after marking deselected fixture plugin pending",
	)

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
	assertAppResponseStatusAndClose(
		t,
		rescanAppPlugins(t, server.URL, authCookie),
		http.StatusOK,
		"sync deselected fixture state after restart",
	)

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

	prepareAppDefaultsProfilePackageManagerBasedpyrightEnv(t, cfg)

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

	prepareAppDefaultsProfilePackageManagerBasedpyrightEnv(t, cfg)

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

	prepareAppDefaultsProfilePackageManagerBasedpyrightEnv(t, cfg)
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

func prepareAppDefaultsProfilePackageManagerBasedpyrightEnv(t *testing.T, cfg config.Config) {
	t.Helper()

	allowAppDefaultsProfileBootstrap(t, cfg)
	t.Setenv("SETTA_PYTHON", firstpartyplugin.BasedpyrightPython(t))

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installDefaultsProfilePackageManagerPlugin(t, sitePackages)
	t.Setenv("PYTHONPATH", sitePackages)
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
