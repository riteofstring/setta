package app

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/lsp"
	"setta/internal/observability"
	"setta/internal/plugins"
	"setta/internal/projectstate"
)

func TestAppDuplicatePluginCopiesKeepCommittedAppliedIdentityUntilRestart(t *testing.T) {
	harness := newAppDuplicatePluginLSPHarness(t)

	assertAppDuplicateLSPCompletionAndSource(t, harness, "fixtureCompletion", harness.workspacePluginRoot)
	overwriteAppPluginBackendWithInvalidGo(t, harness.workspacePluginRoot)

	assertAppDuplicatePluginRescanKeepsWorkspaceApplied(t, harness)
	assertAppDuplicatePluginConfigRefreshKeepsWorkspaceApplied(t, harness)
	assertAppDuplicatePluginRestartAppliesSettaFilesReplacement(t, harness)
}

type appDuplicatePluginLSPHarness struct {
	app                  *App
	serverURL            string
	authCookie           *http.Cookie
	workspacePluginRoot  string
	settaFilesPluginRoot string
}

func newAppDuplicatePluginLSPHarness(t *testing.T) appDuplicatePluginLSPHarness {
	t.Helper()

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	prepareAppPluginLanguageServerFixture(t)

	altScriptPath := writeAltAppFixtureLanguageServerScript(t)
	t.Setenv("SETTA_PLUGIN_FIXTURE_LSP_SCRIPT_ALT", altScriptPath)

	installAppLanguageServerOnlyFixturePlugin(t, cfg)
	workspacePluginRoot := filepath.Join(cfg.Paths.WorkspaceRoot, ".setta_plugins", "setta-fixture-backend")

	installAppPluginFixtureToSettaFiles(t, cfg, "backend", "setta-fixture-backend")
	settaFilesPluginRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "plugins", "setta-fixture-backend")
	rewriteAppPluginManifest(t, settaFilesPluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})
	rewriteAppFixtureLanguageServerEnv(t, settaFilesPluginRoot, "SETTA_PLUGIN_FIXTURE_LSP_SCRIPT_ALT")

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
	t.Cleanup(server.Close)

	return appDuplicatePluginLSPHarness{
		app:                  app,
		serverURL:            server.URL,
		authCookie:           newAppTestAuthCookie(t, app),
		workspacePluginRoot:  workspacePluginRoot,
		settaFilesPluginRoot: settaFilesPluginRoot,
	}
}

func assertAppDuplicateLSPCompletionAndSource(t *testing.T, harness appDuplicatePluginLSPHarness, wantCompletion string, expectedSourcePath string) {
	t.Helper()

	assertAppCompletionLabel(t, harness.serverURL, harness.authCookie, wantCompletion)
	currentSpecs, appliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, harness.app)
	assertAppLanguageServerSpecSourcePath(t, currentSpecs, appliedSpecs, expectedSourcePath)
}

func assertAppDuplicatePluginRescanKeepsWorkspaceApplied(t *testing.T, harness appDuplicatePluginLSPHarness) {
	t.Helper()

	rescanResponse := rescanAppPlugins(t, harness.serverURL, harness.authCookie)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugins rescan 200 after invalidating higher-precedence duplicate, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	assertAppDuplicateLSPCompletionAndSource(t, harness, "fixtureCompletion", harness.workspacePluginRoot)

	statusAfterRescan := fetchAppPluginRuntimeStatus(t, harness.serverURL, harness.authCookie)
	assertAppInvalidWorkspaceDuplicateStatus(t, statusAfterRescan, "before restart")
}

func assertAppDuplicatePluginConfigRefreshKeepsWorkspaceApplied(t *testing.T, harness appDuplicatePluginLSPHarness) {
	t.Helper()

	writeAppPluginConfig(t, harness.serverURL, harness.authCookie, "setta-fixture-backend", fixtureLanguageServerConfig(true))

	assertAppDuplicateLSPCompletionAndSource(t, harness, "fixtureCompletion", harness.workspacePluginRoot)

	statusAfterConfig := fetchAppPluginRuntimeStatus(t, harness.serverURL, harness.authCookie)
	assertAppInvalidWorkspaceDuplicateStatus(t, statusAfterConfig, "after config refresh")
}

func assertAppInvalidWorkspaceDuplicateStatus(t *testing.T, status []plugins.PluginStatusEntry, phase string) {
	t.Helper()

	duplicateEntries := appPluginStatusEntriesForID(status, "setta-fixture-backend")
	if len(duplicateEntries) < 2 {
		t.Fatalf("expected duplicate runtime status entries %s, got %#v", phase, duplicateEntries)
	}
	if !entryAppliesLanguage(duplicateEntries[0], "fixturedsl") || duplicateEntries[0].State != plugins.PluginRuntimeStateInvalid || duplicateEntries[0].SourceScope != plugins.PluginScopeWorkspace {
		t.Fatalf("expected first duplicate entry to keep the invalid applied workspace implementation %s, got %#v", phase, duplicateEntries[0])
	}
	activeDuplicate := mustFindAppPluginStatusEntryByScopeAndState(
		t,
		status,
		"setta-fixture-backend",
		plugins.PluginScopeSettaFiles,
		plugins.PluginRuntimeStateActive,
	)
	if len(activeDuplicate.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected active replacement duplicate to remain unapplied %s, got %#v", phase, activeDuplicate.AppliedLanguageServerLanguages)
	}
}

func assertAppDuplicatePluginRestartAppliesSettaFilesReplacement(t *testing.T, harness appDuplicatePluginLSPHarness) {
	t.Helper()

	restartResponse := restartAppLanguageServer(t, harness.serverURL, harness.authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200 after duplicate replacement becomes selected, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	assertAppDuplicateLSPCompletionAndSource(t, harness, "altFixtureCompletion", harness.settaFilesPluginRoot)

	statusAfterRestart := fetchAppPluginRuntimeStatus(t, harness.serverURL, harness.authCookie)
	duplicateEntries := appPluginStatusEntriesForID(statusAfterRestart, "setta-fixture-backend")
	if len(duplicateEntries) == 0 {
		t.Fatalf("expected duplicate runtime status entries after restart, got %#v", statusAfterRestart)
	}
	if duplicateEntries[0].SourceScope != plugins.PluginScopeSettaFiles || !entryAppliesLanguage(duplicateEntries[0], "fixturedsl") {
		t.Fatalf("expected restart to apply the setta_files duplicate first, got %#v", duplicateEntries[0])
	}
	activeDuplicate := mustFindAppPluginStatusEntryByScopeAndState(
		t,
		statusAfterRestart,
		"setta-fixture-backend",
		plugins.PluginScopeSettaFiles,
		plugins.PluginRuntimeStateActive,
	)
	if len(activeDuplicate.AppliedLanguageServerLanguages) != 1 || activeDuplicate.AppliedLanguageServerLanguages[0] != "fixturedsl" {
		t.Fatalf("expected active replacement duplicate to become applied after restart, got %#v", activeDuplicate.AppliedLanguageServerLanguages)
	}
}

func installAppPluginFixtureToSettaFiles(t *testing.T, cfg config.Config, fixtureName string, pluginID string) {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	targetRoot := filepath.Join(cfg.Paths.SettaFilesRoot, "plugins", pluginID)
	copyAppTestDir(t, sourceRoot, targetRoot)
}

func writeAltAppFixtureLanguageServerScript(t *testing.T) string {
	t.Helper()

	repoRoot := appTestRepoRoot(t)
	sourcePath := filepath.Join(repoRoot, "tests", "fixtures", "lsp", "mini_language_server.py")
	payload, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("read fixture language server script: %v", err)
	}

	updated := strings.ReplaceAll(string(payload), "fixtureCompletion", "altFixtureCompletion")
	targetPath := filepath.Join(t.TempDir(), "mini_language_server_alt.py")
	if err := os.WriteFile(targetPath, []byte(updated), 0o644); err != nil {
		t.Fatalf("write alternate fixture language server script: %v", err)
	}
	return targetPath
}

func rewriteAppFixtureLanguageServerEnv(t *testing.T, pluginRoot string, envName string) {
	t.Helper()

	mainPath := filepath.Join(pluginRoot, "backend", "main.go")
	payload, err := os.ReadFile(mainPath)
	if err != nil {
		t.Fatalf("read backend main %s: %v", mainPath, err)
	}

	updated := strings.Replace(
		string(payload),
		"\"SETTA_PLUGIN_FIXTURE_LSP_SCRIPT\"",
		"\""+envName+"\"",
		1,
	)
	if updated == string(payload) {
		t.Fatalf("expected fixture backend main %s to contain the default language server env name", mainPath)
	}
	if err := os.WriteFile(mainPath, []byte(updated), 0o644); err != nil {
		t.Fatalf("write backend main %s: %v", mainPath, err)
	}
}

func overwriteAppPluginBackendWithInvalidGo(t *testing.T, pluginRoot string) {
	t.Helper()

	mainPath := filepath.Join(pluginRoot, "backend", "main.go")
	if err := os.WriteFile(mainPath, []byte("package main\n\nfunc main() {\n"), 0o644); err != nil {
		t.Fatalf("write invalid backend main %s: %v", mainPath, err)
	}
}

func assertAppCompletionLabel(t *testing.T, serverURL string, authCookie *http.Cookie, want string) {
	t.Helper()

	completions := requestAppCodeAreaCompletion(t, serverURL, authCookie, "project-alpha", "runner", "fixture.", 8)
	if len(completions) != 1 || completions[0].Label != want {
		t.Fatalf("expected one completion %q, got %#v", want, completions)
	}
}

func assertAppLanguageServerSpecSourcePath(
	t *testing.T,
	currentSpecs []lsp.LanguageServerSpec,
	appliedSpecs []lsp.LanguageServerSpec,
	expectedSourcePath string,
) {
	t.Helper()

	if len(currentSpecs) != 1 || currentSpecs[0].PluginSourcePath != expectedSourcePath {
		t.Fatalf("expected current specs to keep source path %q, got %#v", expectedSourcePath, currentSpecs)
	}
	if len(appliedSpecs) != 1 || appliedSpecs[0].PluginSourcePath != expectedSourcePath {
		t.Fatalf("expected applied specs to keep source path %q, got %#v", expectedSourcePath, appliedSpecs)
	}
}

func appPluginStatusEntriesForID(entries []plugins.PluginStatusEntry, pluginID string) []plugins.PluginStatusEntry {
	matches := make([]plugins.PluginStatusEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.PluginID == pluginID {
			matches = append(matches, entry)
		}
	}
	return matches
}

func mustFindAppPluginStatusEntryByScopeAndState(
	t *testing.T,
	entries []plugins.PluginStatusEntry,
	pluginID string,
	scope plugins.PluginScope,
	state plugins.PluginRuntimeState,
) plugins.PluginStatusEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.SourceScope == scope && entry.State == state {
			return entry
		}
	}
	t.Fatalf("expected plugin status entry %q scope=%q state=%q in %#v", pluginID, scope, state, entries)
	return plugins.PluginStatusEntry{}
}

func entryAppliesLanguage(entry plugins.PluginStatusEntry, language string) bool {
	for _, appliedLanguage := range entry.AppliedLanguageServerLanguages {
		if strings.EqualFold(appliedLanguage, language) {
			return true
		}
	}
	return false
}
