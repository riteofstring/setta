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
	defer server.Close()
	authCookie := newAppTestAuthCookie(t, app)

	assertAppCompletionLabel(t, server.URL, authCookie, "fixtureCompletion")
	currentSpecs, appliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, app)
	assertAppLanguageServerSpecSourcePath(t, currentSpecs, appliedSpecs, workspacePluginRoot)

	overwriteAppPluginBackendWithInvalidGo(t, workspacePluginRoot)

	rescanResponse := rescanAppPlugins(t, server.URL, authCookie)
	defer rescanResponse.Body.Close()
	if rescanResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(rescanResponse.Body)
		t.Fatalf("expected plugins rescan 200 after invalidating higher-precedence duplicate, got %d with body %q", rescanResponse.StatusCode, string(body))
	}

	assertAppCompletionLabel(t, server.URL, authCookie, "fixtureCompletion")
	currentSpecs, appliedSpecs = cloneAppRuntimeLanguageServerSpecs(t, app)
	assertAppLanguageServerSpecSourcePath(t, currentSpecs, appliedSpecs, workspacePluginRoot)

	statusAfterRescan := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	duplicateEntries := appPluginStatusEntriesForID(statusAfterRescan, "setta-fixture-backend")
	if len(duplicateEntries) < 2 {
		t.Fatalf("expected duplicate runtime status entries after invalidation, got %#v", duplicateEntries)
	}
	if !entryAppliesLanguage(duplicateEntries[0], "fixturedsl") || duplicateEntries[0].State != plugins.PluginRuntimeStateInvalid || duplicateEntries[0].SourceScope != plugins.PluginScopeWorkspace {
		t.Fatalf("expected first duplicate entry to keep the invalid applied workspace implementation, got %#v", duplicateEntries[0])
	}
	activeDuplicate := mustFindAppPluginStatusEntryByScopeAndState(
		t,
		statusAfterRescan,
		"setta-fixture-backend",
		plugins.PluginScopeSettaFiles,
		plugins.PluginRuntimeStateActive,
	)
	if len(activeDuplicate.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected active replacement duplicate to remain unapplied before restart, got %#v", activeDuplicate.AppliedLanguageServerLanguages)
	}

	writeAppPluginConfig(t, server.URL, authCookie, "setta-fixture-backend", fixtureLanguageServerConfig(true))

	assertAppCompletionLabel(t, server.URL, authCookie, "fixtureCompletion")
	currentSpecs, appliedSpecs = cloneAppRuntimeLanguageServerSpecs(t, app)
	assertAppLanguageServerSpecSourcePath(t, currentSpecs, appliedSpecs, workspacePluginRoot)

	statusAfterConfig := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	duplicateEntries = appPluginStatusEntriesForID(statusAfterConfig, "setta-fixture-backend")
	if len(duplicateEntries) < 2 {
		t.Fatalf("expected duplicate runtime status entries after config refresh, got %#v", duplicateEntries)
	}
	if !entryAppliesLanguage(duplicateEntries[0], "fixturedsl") || duplicateEntries[0].State != plugins.PluginRuntimeStateInvalid || duplicateEntries[0].SourceScope != plugins.PluginScopeWorkspace {
		t.Fatalf("expected config refresh to keep the invalid applied workspace implementation first, got %#v", duplicateEntries[0])
	}
	activeDuplicate = mustFindAppPluginStatusEntryByScopeAndState(
		t,
		statusAfterConfig,
		"setta-fixture-backend",
		plugins.PluginScopeSettaFiles,
		plugins.PluginRuntimeStateActive,
	)
	if len(activeDuplicate.AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected active replacement duplicate to remain unapplied after config refresh, got %#v", activeDuplicate.AppliedLanguageServerLanguages)
	}

	restartResponse := restartAppLanguageServer(t, server.URL, authCookie)
	defer restartResponse.Body.Close()
	if restartResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(restartResponse.Body)
		t.Fatalf("expected restart 200 after duplicate replacement becomes selected, got %d with body %q", restartResponse.StatusCode, string(body))
	}

	assertAppCompletionLabel(t, server.URL, authCookie, "altFixtureCompletion")
	currentSpecs, appliedSpecs = cloneAppRuntimeLanguageServerSpecs(t, app)
	assertAppLanguageServerSpecSourcePath(t, currentSpecs, appliedSpecs, settaFilesPluginRoot)

	statusAfterRestart := fetchAppPluginRuntimeStatus(t, server.URL, authCookie)
	duplicateEntries = appPluginStatusEntriesForID(statusAfterRestart, "setta-fixture-backend")
	if len(duplicateEntries) == 0 {
		t.Fatalf("expected duplicate runtime status entries after restart, got %#v", statusAfterRestart)
	}
	if duplicateEntries[0].SourceScope != plugins.PluginScopeSettaFiles || !entryAppliesLanguage(duplicateEntries[0], "fixturedsl") {
		t.Fatalf("expected restart to apply the setta_files duplicate first, got %#v", duplicateEntries[0])
	}
	activeDuplicate = mustFindAppPluginStatusEntryByScopeAndState(
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
