package app

import (
	"context"
	"errors"
	"io"
	"path/filepath"
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
	restartErrs    []error
	restartHook    func()
	typeCheckErr   error
}

func (s *stubProjectLSPAdmin) Restart(_ context.Context, _ projectstate.Document) error {
	s.restartCalls++
	if s.restartHook != nil {
		s.restartHook()
	}
	if len(s.restartErrs) != 0 {
		err := s.restartErrs[0]
		s.restartErrs = s.restartErrs[1:]
		return err
	}
	return s.restartErr
}

func (s *stubProjectLSPAdmin) TypeCheckProject(_ context.Context, _ projectstate.Document, _ string) error {
	s.typeCheckCalls++
	return s.typeCheckErr
}

type stubRuntimeLSPRefresher struct {
	refreshCalls  int
	rollbackCalls int
	commitCalls   int
	refreshErr    error
	rollbackErr   error
	commitErr     error
	hasSpecs      bool
}

func (s *stubRuntimeLSPRefresher) RefreshLanguageServers(_ context.Context) error {
	s.refreshCalls++
	return s.refreshErr
}

func (s *stubRuntimeLSPRefresher) RollbackLanguageServers(_ context.Context) error {
	s.rollbackCalls++
	return s.rollbackErr
}

func (s *stubRuntimeLSPRefresher) HasConfiguredLanguageServers() bool {
	return s.hasSpecs
}

func (s *stubRuntimeLSPRefresher) CommitAppliedLanguageServerPlugins(_ context.Context) error {
	s.commitCalls++
	return s.commitErr
}

type recordingProjectSyncer struct {
	syncCalls    int
	refreshCalls int
	closeCalls   int
	syncErr      error
	syncErrs     []error
	refreshErr   error
	closeErr     error
}

func (s *recordingProjectSyncer) SyncDocuments(context.Context, map[string]lsp.SyncedDocument) error {
	s.syncCalls++
	if len(s.syncErrs) != 0 {
		err := s.syncErrs[0]
		s.syncErrs = s.syncErrs[1:]
		return err
	}
	return s.syncErr
}

func (s *recordingProjectSyncer) RefreshDocuments(context.Context, map[string]lsp.SyncedDocument) error {
	s.refreshCalls++
	return s.refreshErr
}

func (s *recordingProjectSyncer) UpsertDocument(context.Context, lsp.SyncedDocument) error {
	return nil
}

func (s *recordingProjectSyncer) Close(context.Context) error {
	s.closeCalls++
	return s.closeErr
}

func fixtureLanguageServerConfig(emitDiagnostics bool) map[string]any {
	return map[string]any{
		"fixtureDslLanguageServer": map[string]any{
			"analysis": map[string]any{
				"emitDiagnostics": emitDiagnostics,
			},
		},
	}
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

func attachRecordingProjectSyncer(t *testing.T, app *App, syncer *recordingProjectSyncer) (*projectstate.Runtime, *recordingProjectSyncer) {
	t.Helper()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.NewDocument())
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if syncer == nil {
		syncer = &recordingProjectSyncer{}
	}
	projectSync, err := lsp.NewProjectSynchronizer(lsp.ProjectSynchronizerOptions{
		SettaFilesRoot: app.config.Paths.SettaFilesRoot,
		Service:        syncer,
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
	return projectRuntime, syncer
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
	if runtime.rollbackCalls != 0 {
		t.Fatalf("expected no runtime rollback on success, got %d", runtime.rollbackCalls)
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
	if runtime.commitCalls != 1 {
		t.Fatalf("expected runtime to commit the empty applied spec set when no specs remain, got %d", runtime.commitCalls)
	}
	if runtime.rollbackCalls != 0 {
		t.Fatalf("expected no runtime rollback when no specs remain after successful restart, got %d", runtime.rollbackCalls)
	}
}

func TestWorkspaceLSPAdminRestartRollsBackRuntimeWhenProjectRestartFails(t *testing.T) {
	t.Parallel()

	restartErr := errors.New("restart failed")
	projectAdmin := &stubProjectLSPAdmin{restartErrs: []error{restartErr, nil}}
	runtime := &stubRuntimeLSPRefresher{hasSpecs: true}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	err := admin.Restart(context.Background(), projectstate.Document{})
	if !errors.Is(err, restartErr) {
		t.Fatalf("expected restart error, got %v", err)
	}
	if runtime.rollbackCalls != 1 {
		t.Fatalf("expected one runtime rollback after restart failure, got %d", runtime.rollbackCalls)
	}
	if runtime.commitCalls != 0 {
		t.Fatalf("expected no runtime commit after restart failure, got %d", runtime.commitCalls)
	}
	if projectAdmin.restartCalls != 2 {
		t.Fatalf("expected failed restart to re-materialize project state once after rollback, got %d calls", projectAdmin.restartCalls)
	}
}

func TestWorkspaceLSPAdminRestartKeepsSelectionChangedMidRestartPending(t *testing.T) {
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
	writeAppPendingRestartPluginStateWithLanguageServerOnlyIDs(
		t,
		cfg,
		[]string{"setta-fixture-backend-alt"},
		[]string{"setta-fixture-backend-alt"},
	)

	projectAdmin := &stubProjectLSPAdmin{
		restartHook: func() {
			setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend-alt")
		},
	}
	admin := newWorkspaceLSPAdmin(projectAdmin, app.pluginRuntime)

	if err := admin.Restart(context.Background(), projectstate.Document{}); err != nil {
		t.Fatalf("restart language server: %v", err)
	}

	persistedState := readAppPluginsState(t, cfg)
	if len(persistedState.PendingRestartBackendPluginIDs) != 1 || persistedState.PendingRestartBackendPluginIDs[0] != "setta-fixture-backend-alt" {
		t.Fatalf("expected switched selection to stay pending in backend ids, got %#v", persistedState.PendingRestartBackendPluginIDs)
	}
	if len(persistedState.PendingRestartLanguageServerOnlyPluginIDs) != 1 || persistedState.PendingRestartLanguageServerOnlyPluginIDs[0] != "setta-fixture-backend-alt" {
		t.Fatalf("expected switched selection to stay pending in language-server-only ids, got %#v", persistedState.PendingRestartLanguageServerOnlyPluginIDs)
	}

	currentSpecs, appliedSpecs := cloneAppRuntimeLanguageServerSpecs(t, app)
	if len(currentSpecs) != 1 || currentSpecs[0].PluginID != "setta-fixture-backend" {
		t.Fatalf("expected current specs to keep the original plugin after first restart, got %#v", currentSpecs)
	}
	if len(appliedSpecs) != 1 || appliedSpecs[0].PluginID != "setta-fixture-backend" {
		t.Fatalf("expected applied specs to keep the original plugin after first restart, got %#v", appliedSpecs)
	}
}

func TestWorkspaceLSPAdminRestartRollsBackRuntimeWhenCommitFails(t *testing.T) {
	t.Parallel()

	commitErr := errors.New("commit failed")
	projectAdmin := &stubProjectLSPAdmin{restartErrs: []error{nil, nil}}
	runtime := &stubRuntimeLSPRefresher{hasSpecs: true, commitErr: commitErr}
	admin := newWorkspaceLSPAdmin(projectAdmin, runtime)

	err := admin.Restart(context.Background(), projectstate.Document{})
	if !errors.Is(err, commitErr) {
		t.Fatalf("expected commit error, got %v", err)
	}
	if runtime.commitCalls != 1 {
		t.Fatalf("expected one runtime commit attempt, got %d", runtime.commitCalls)
	}
	if runtime.rollbackCalls != 1 {
		t.Fatalf("expected one runtime rollback after commit failure, got %d", runtime.rollbackCalls)
	}
	if projectAdmin.restartCalls != 2 {
		t.Fatalf("expected commit failure to re-materialize project state once after rollback, got %d calls", projectAdmin.restartCalls)
	}
}

func TestWorkspaceLSPAdminRestartOnlyRestartsProjectSyncOnceWhenSpecsChange(t *testing.T) {
	app := newAppWithFixtureLanguageServer(t)
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend")
	projectRuntime, recordingSyncer := attachRecordingProjectSyncer(t, app, nil)

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
	projectRuntime, recordingSyncer := attachRecordingProjectSyncer(t, app, nil)

	admin := newWorkspaceLSPAdmin(app.pluginRuntime.projectSync, app.pluginRuntime)
	err := admin.Restart(context.Background(), projectRuntime.Snapshot().Document)
	if !errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
		t.Fatalf("expected unconfigured error when specs disappear, got %v", err)
	}
	if recordingSyncer.closeCalls != 1 {
		t.Fatalf("expected one project synchronizer restart when specs disappear, got %d", recordingSyncer.closeCalls)
	}
}
