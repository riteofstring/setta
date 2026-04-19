package app

import (
	"context"
	"errors"
	"io"
	"testing"

	"setta/internal/config"
	"setta/internal/lsp"
	"setta/internal/observability"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

type stubProjectLSPAdmin struct {
	restartCalls   int
	typeCheckCalls int
	restartErr     error
	typeCheckErr   error
}

func (s *stubProjectLSPAdmin) Restart(_ context.Context, _ projectstate.Document) error {
	s.restartCalls++
	return s.restartErr
}

func (s *stubProjectLSPAdmin) TypeCheckProject(_ context.Context, _ projectstate.Document, _ string) error {
	s.typeCheckCalls++
	return s.typeCheckErr
}

type stubRuntimeLSPRefresher struct {
	refreshCalls int
	commitCalls  int
	refreshErr   error
	commitErr    error
	hasSpecs     bool
}

func (s *stubRuntimeLSPRefresher) RefreshLanguageServers(_ context.Context) error {
	s.refreshCalls++
	return s.refreshErr
}

func (s *stubRuntimeLSPRefresher) HasConfiguredLanguageServers() bool {
	return s.hasSpecs
}

func (s *stubRuntimeLSPRefresher) CommitAppliedLanguageServerPlugins(_ context.Context) error {
	s.commitCalls++
	return s.commitErr
}

type recordingProjectSyncer struct {
	closeCalls int
}

func (s *recordingProjectSyncer) SyncDocuments(context.Context, map[string]lsp.SyncedDocument) error {
	return nil
}

func (s *recordingProjectSyncer) RefreshDocuments(context.Context, map[string]lsp.SyncedDocument) error {
	return nil
}

func (s *recordingProjectSyncer) UpsertDocument(context.Context, lsp.SyncedDocument) error {
	return nil
}

func (s *recordingProjectSyncer) Close(context.Context) error {
	s.closeCalls++
	return nil
}

func newAppWithFixtureLanguageServer(t *testing.T) *App {
	t.Helper()

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
	return app
}

func attachRecordingProjectSyncer(t *testing.T, app *App) (*projectstate.Runtime, *recordingProjectSyncer) {
	t.Helper()

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	recordingSyncer := &recordingProjectSyncer{}
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

	app.pluginRuntime.projectState = projectRuntime
	app.pluginRuntime.projectSync = projectSync
	return projectRuntime, recordingSyncer
}

func TestWorkspaceLSPAdminRestartRefreshesRuntimeBeforeSync(t *testing.T) {
	t.Parallel()

	projectAdmin := &stubProjectLSPAdmin{}
	runtime := &stubRuntimeLSPRefresher{hasSpecs: true}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	if err := admin.Restart(context.Background(), projectstate.Document{}); err != nil {
		t.Fatalf("restart language server: %v", err)
	}
	if runtime.refreshCalls != 1 {
		t.Fatalf("expected one runtime refresh, got %d", runtime.refreshCalls)
	}
	if projectAdmin.restartCalls != 1 {
		t.Fatalf("expected one project restart, got %d", projectAdmin.restartCalls)
	}
	if runtime.commitCalls != 1 {
		t.Fatalf("expected one runtime commit, got %d", runtime.commitCalls)
	}
}

func TestWorkspaceLSPAdminRestartReturnsUnconfiguredWhenNoSpecsRemain(t *testing.T) {
	t.Parallel()

	projectAdmin := &stubProjectLSPAdmin{}
	runtime := &stubRuntimeLSPRefresher{hasSpecs: false}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	err := admin.Restart(context.Background(), projectstate.Document{})
	if !errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
		t.Fatalf("expected unconfigured error, got %v", err)
	}
	if projectAdmin.restartCalls != 1 {
		t.Fatalf("expected restart to reconcile project state before returning unconfigured, got %d calls", projectAdmin.restartCalls)
	}
	if runtime.commitCalls != 0 {
		t.Fatalf("expected no runtime commit when no specs remain, got %d", runtime.commitCalls)
	}
}

func TestWorkspaceLSPAdminRestartOnlyRestartsProjectSyncOnceWhenSpecsChange(t *testing.T) {
	app := newAppWithFixtureLanguageServer(t)
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")
	projectRuntime, recordingSyncer := attachRecordingProjectSyncer(t, app)

	admin := newWorkspaceLSPAdmin(app.pluginRuntime.projectSync, app.pluginRuntime)
	if err := admin.Restart(context.Background(), projectRuntime.Snapshot().Document); err != nil {
		t.Fatalf("restart language server: %v", err)
	}
	if recordingSyncer.closeCalls != 1 {
		t.Fatalf("expected one project synchronizer restart when specs change, got %d", recordingSyncer.closeCalls)
	}
}

func TestWorkspaceLSPAdminRestartOnlyRestartsProjectSyncOnceWhenSpecsDisappear(t *testing.T) {
	app := newAppWithFixtureLanguageServer(t)
	selectAppLanguageServer(t, app, "fixturedsl", "setta-fixture-backend")
	if _, err := app.SettingsState().MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		languageServerSettings := document["languageServer"].(map[string]any)
		languageServerSettings["selectedByLanguage"] = map[string]any{}
		return document, nil
	}); err != nil {
		t.Fatalf("clear language server selection: %v", err)
	}
	projectRuntime, recordingSyncer := attachRecordingProjectSyncer(t, app)

	admin := newWorkspaceLSPAdmin(app.pluginRuntime.projectSync, app.pluginRuntime)
	err := admin.Restart(context.Background(), projectRuntime.Snapshot().Document)
	if !errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
		t.Fatalf("expected unconfigured error when specs disappear, got %v", err)
	}
	if recordingSyncer.closeCalls != 1 {
		t.Fatalf("expected one project synchronizer restart when specs disappear, got %d", recordingSyncer.closeCalls)
	}
}
