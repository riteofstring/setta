package app

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"setta/internal/lsp"
	"setta/internal/plugins"
	"setta/internal/projectstate"
)

func TestCloneLanguageServerSpecsDeepCopiesSettings(t *testing.T) {
	original := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-basedpyright",
			Name:       "basedpyright",
			LanguageID: "python",
			Command:    "/tmp/python",
			Args:       []string{"-c", "from basedpyright.langserver import main; main()", "--stdio"},
			Settings: map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"diagnosticSeverityOverrides": map[string]any{
							"reportUnknownVariableType": "none",
						},
					},
				},
			},
		},
	}

	cloned := cloneLanguageServerSpecs(original)
	basedpyrightSettings := cloned[0].Settings["basedpyright"].(map[string]any)
	analysis := basedpyrightSettings["analysis"].(map[string]any)
	overrides := analysis["diagnosticSeverityOverrides"].(map[string]any)
	overrides["reportUnknownVariableType"] = "error"

	originalOverrides := original[0].Settings["basedpyright"].(map[string]any)["analysis"].(map[string]any)["diagnosticSeverityOverrides"].(map[string]any)
	if originalOverrides["reportUnknownVariableType"] != "none" {
		t.Fatalf("expected original settings to remain unchanged, got %#v", originalOverrides)
	}
}

func TestCloneLanguageServerSpecsPreservesEmptySettingsMap(t *testing.T) {
	original := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			Name:       "fixture-dsl",
			LanguageID: "fixturedsl",
			Command:    "python",
			Settings:   map[string]any{},
		},
	}

	cloned := cloneLanguageServerSpecs(original)
	if cloned[0].Settings == nil || len(cloned[0].Settings) != 0 {
		t.Fatalf("expected explicit empty settings map to remain explicit, got %#v", cloned[0].Settings)
	}
}

func TestRollbackRefreshTransitionRestoresLanguageServerSettings(t *testing.T) {
	previous := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-basedpyright",
			Name:       "basedpyright",
			LanguageID: "python",
			Command:    "/tmp/python",
			Args:       []string{"-c", "from basedpyright.langserver import main; main()", "--stdio"},
			Settings: map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"diagnosticSeverityOverrides": map[string]any{
							"reportUnknownVariableType": "none",
						},
					},
				},
			},
		},
	}
	next := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-basedpyright",
			Name:       "basedpyright",
			LanguageID: "python",
			Command:    "/tmp/python",
			Args:       []string{"-c", "from basedpyright.langserver import main; main()", "--stdio"},
		},
	}

	refresher := &pluginBackendRuntimeRefresher{
		lspSpecs:        cloneLanguageServerSpecs(next),
		appliedLSPSpecs: cloneLanguageServerSpecs(next),
	}
	refresher.rollbackRefreshTransitionLocked(&pluginBackendRefreshTransition{
		nextLSPSpecs:     cloneLanguageServerSpecs(next),
		previousLSPSpecs: cloneLanguageServerSpecs(previous),
	})

	if len(refresher.lspSpecs) != 1 {
		t.Fatalf("expected one restored LSP spec, got %#v", refresher.lspSpecs)
	}
	basedpyrightSettings, ok := refresher.lspSpecs[0].Settings["basedpyright"].(map[string]any)
	if !ok {
		t.Fatalf("expected restored settings map, got %#v", refresher.lspSpecs[0].Settings)
	}
	analysis, ok := basedpyrightSettings["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("expected restored analysis settings, got %#v", basedpyrightSettings["analysis"])
	}
	overrides, ok := analysis["diagnosticSeverityOverrides"].(map[string]any)
	if !ok {
		t.Fatalf("expected restored override settings, got %#v", analysis["diagnosticSeverityOverrides"])
	}
	if overrides["reportUnknownVariableType"] != "none" {
		t.Fatalf("expected restored reportUnknownVariableType override, got %#v", overrides["reportUnknownVariableType"])
	}
}

func TestPluginMutationRuntimeServiceRescanRollsBackOnHandlerRefreshError(t *testing.T) {
	service, _ := newPluginRuntimeRefreshTestService(t)
	previousRuntime := &pluginBackendMCPRuntime{toolNames: []string{"existing_tool"}}
	capabilities := newAppSubsystemCapabilityState()
	capabilities.Set(plugins.PluginAppSubsystemCapabilities{
		PluginID:      "setta-fixture-app-provider",
		PluginEnabled: true,
		AppPreviewUI:  true,
	})
	watchCodeCapabilities := newWatchCodeCapabilityState()
	watchCodeCapabilities.Set(plugins.PluginWatchCodeCapabilities{
		PluginID:      "setta-fixture-watch-code-provider",
		PluginEnabled: true,
		Python:        true,
	})
	refresher := &pluginBackendRuntimeRefresher{
		service:                  service,
		runtime:                  previousRuntime,
		appSubsystemCapabilities: capabilities,
		watchCodeCapabilities:    watchCodeCapabilities,
		refreshAppHandler: func() error {
			return context.Canceled
		},
	}

	_, err := newPluginMutationRuntimeService(
		service,
		refresher,
		capabilities,
		watchCodeCapabilities,
	).Rescan()
	if err == nil {
		t.Fatal("expected handler refresh failure")
	}
	if refresher.runtime != previousRuntime {
		t.Fatalf("expected runtime to roll back to previous instance, got %#v", refresher.runtime)
	}
	currentCapabilities := capabilities.AppSubsystemCapabilities()
	if !currentCapabilities.PluginEnabled || currentCapabilities.PluginID != "setta-fixture-app-provider" || !currentCapabilities.AppPreviewUI {
		t.Fatalf("expected app subsystem capabilities to roll back, got %#v", currentCapabilities)
	}
	currentWatchCodeCapabilities := watchCodeCapabilities.WatchCodeCapabilities()
	if !currentWatchCodeCapabilities.PluginEnabled || currentWatchCodeCapabilities.PluginID != "setta-fixture-watch-code-provider" || !currentWatchCodeCapabilities.Python {
		t.Fatalf("expected watch code capabilities to roll back, got %#v", currentWatchCodeCapabilities)
	}
}

func TestPluginMutationRuntimeServiceRescanKeepsCommittedSnapshotOnHandlerRefreshError(t *testing.T) {
	service, workspaceRoot, _ := newPluginRuntimeRefreshTestServiceWithRoots(t)
	seedAppPluginFixture(t, workspaceRoot, "app-subsystem-unknown-id")

	refresher := &pluginBackendRuntimeRefresher{
		service: service,
		refreshAppHandler: func() error {
			return context.Canceled
		},
	}
	runtimeService := newPluginMutationRuntimeService(
		service,
		refresher,
		newAppSubsystemCapabilityState(),
		newWatchCodeCapabilityState(),
	)

	initial, err := runtimeService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("load initial runtime: %v", err)
	}
	if got := initial.FeatureCapabilities.AppSubsystem.PluginID; got != "acme-app-subsystem-fixture" {
		t.Fatalf("expected initial app subsystem provider acme-app-subsystem-fixture, got %q", got)
	}
	if initial.Status.AppSubsystemSelection == nil || initial.Status.AppSubsystemSelection.SelectedPluginID == nil || *initial.Status.AppSubsystemSelection.SelectedPluginID != "acme-app-subsystem-fixture" {
		t.Fatalf("expected initial selected provider, got %#v", initial.Status.AppSubsystemSelection)
	}

	seedAppPluginFixture(t, workspaceRoot, "backend")

	if _, err := runtimeService.Rescan(); err == nil {
		t.Fatal("expected handler refresh failure")
	}

	runtimeAfterFailure, err := runtimeService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime after failed rescan: %v", err)
	}
	if got := runtimeAfterFailure.FeatureCapabilities.AppSubsystem.PluginID; got != "acme-app-subsystem-fixture" {
		t.Fatalf("expected committed app subsystem provider after failed rescan, got %q", got)
	}
	if runtimeAfterFailure.Status.AppSubsystemSelection == nil || runtimeAfterFailure.Status.AppSubsystemSelection.SelectedPluginID == nil || *runtimeAfterFailure.Status.AppSubsystemSelection.SelectedPluginID != "acme-app-subsystem-fixture" {
		t.Fatalf("expected committed selected provider after failed rescan, got %#v", runtimeAfterFailure.Status.AppSubsystemSelection)
	}

	lookup, err := runtimeService.LookupRegisteredBackendRoute("POST", "/items")
	if err != nil {
		t.Fatalf("lookup backend route after failed rescan: %v", err)
	}
	if lookup.Matched {
		t.Fatalf("did not expect failed rescan route to become visible, got %#v", lookup)
	}

	_, handled, err := runtimeService.InvokeRegisteredListenerEndpoint(
		context.Background(),
		plugins.BackendListenerEndpointRequest{EndpointName: "route_backend_fixture_ping"},
	)
	if err != nil {
		t.Fatalf("invoke listener endpoint after failed rescan: %v", err)
	}
	if handled {
		t.Fatal("did not expect failed rescan listener endpoint to become visible")
	}
}

func TestPluginBackendRuntimeRefresherRefreshRestoresPendingStateOnHandlerRefreshError(
	t *testing.T,
) {
	service, settaFilesRoot := newPluginRuntimeRefreshTestService(t)
	if err := os.WriteFile(
		filepath.Join(settaFilesRoot, "plugins_state.json"),
		[]byte("{\n  \"pendingRestartBackendPluginIds\": [\"setta-fixture-backend\"],\n  \"pendingRestartLanguageServerOnlyPluginIds\": [\"setta-fixture-backend\"]\n}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write pending restart plugin state: %v", err)
	}

	previousRuntime := &pluginBackendMCPRuntime{toolNames: []string{"existing_tool"}}
	previousSpecs := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Settings:   map[string]any{},
		},
	}
	capabilities := newAppSubsystemCapabilityState()
	capabilities.Set(plugins.PluginAppSubsystemCapabilities{
		PluginID:             "setta-fixture-app-provider",
		PluginEnabled:        true,
		AppDeploymentRuntime: true,
	})
	refresher := &pluginBackendRuntimeRefresher{
		service:                  service,
		runtime:                  previousRuntime,
		lspSpecs:                 cloneLanguageServerSpecs(previousSpecs),
		appliedLSPSpecs:          cloneLanguageServerSpecs(previousSpecs),
		appSubsystemCapabilities: capabilities,
		refreshAppHandler: func() error {
			return context.Canceled
		},
	}

	_, err := refresher.Refresh(context.Background())
	if err == nil {
		t.Fatal("expected handler refresh failure")
	}
	if refresher.runtime != previousRuntime {
		t.Fatalf("expected runtime to roll back to previous instance, got %#v", refresher.runtime)
	}
	if !languageServerSpecSlicesEqual(refresher.lspSpecs, previousSpecs) {
		t.Fatalf("expected lsp specs to remain unchanged, got %#v", refresher.lspSpecs)
	}
	if !languageServerSpecSlicesEqual(refresher.appliedLSPSpecs, previousSpecs) {
		t.Fatalf("expected applied lsp specs to remain unchanged, got %#v", refresher.appliedLSPSpecs)
	}
	state, err := service.BackendRuntimeRefreshState()
	if err != nil {
		t.Fatalf("load backend runtime refresh state: %v", err)
	}
	if len(state.PendingRestartBackendPluginIDs) != 1 || state.PendingRestartBackendPluginIDs[0] != "setta-fixture-backend" {
		t.Fatalf("expected pending backend ids to be restored, got %#v", state.PendingRestartBackendPluginIDs)
	}
	if len(state.PendingRestartLanguageServerOnlyPluginIDs) != 1 || state.PendingRestartLanguageServerOnlyPluginIDs[0] != "setta-fixture-backend" {
		t.Fatalf("expected pending language-server-only ids to be restored, got %#v", state.PendingRestartLanguageServerOnlyPluginIDs)
	}
	currentCapabilities := capabilities.AppSubsystemCapabilities()
	if !currentCapabilities.PluginEnabled || currentCapabilities.PluginID != "setta-fixture-app-provider" || !currentCapabilities.AppDeploymentRuntime {
		t.Fatalf("expected app subsystem capabilities to roll back, got %#v", currentCapabilities)
	}
}

func TestPluginMutationRuntimeServiceApplyLockfileRestoresOnHandlerRefreshError(t *testing.T) {
	service, workspaceRoot, _ := newPluginRuntimeRefreshTestServiceWithRoots(t)
	seedAppPluginFixture(t, workspaceRoot, "frontend")
	writePluginRuntimeRefreshTestJSON(
		t,
		filepath.Join(workspaceRoot, ".setta_plugins", "plugins.lock.json"),
		map[string]any{
			"schemaVersion": 1,
			"plugins":       []any{},
		},
	)

	runtimeService := newPluginMutationRuntimeService(
		service,
		&pluginBackendRuntimeRefresher{
			service: service,
			refreshAppHandler: func() error {
				return context.Canceled
			},
		},
		nil,
		nil,
	)

	if _, err := runtimeService.ApplyLockfile(context.Background(), false); err == nil {
		t.Fatal("expected handler refresh failure")
	}

	runtimeAfterFailure, err := runtimeService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime after failed lockfile apply: %v", err)
	}
	if len(runtimeAfterFailure.List.Plugins) != 1 || runtimeAfterFailure.List.Plugins[0].PluginID != "setta-fixture-frontend" {
		t.Fatalf("expected committed frontend plugin after failed lockfile apply, got %#v", runtimeAfterFailure.List.Plugins)
	}

	manifestPath := filepath.Join(workspaceRoot, ".setta_plugins", "setta-fixture-frontend", "setta.plugin.json")
	if _, err := os.Stat(manifestPath); err != nil {
		t.Fatalf("expected frontend plugin manifest to be restored, got %v", err)
	}
}

func TestPluginBackendRuntimeRefresherAppliesLanguageServerStatus(t *testing.T) {
	refresher := &pluginBackendRuntimeRefresher{
		appliedLSPSpecs: []lsp.LanguageServerSpec{
			{
				PluginID:   "setta-basedpyright",
				LanguageID: "python",
			},
		},
	}
	status := plugins.PluginStatusResponse{
		Plugins: []plugins.PluginStatusEntry{
			{
				PluginID:                       "setta-basedpyright",
				State:                          plugins.PluginRuntimeStateActive,
				AppliedLanguageServerLanguages: []string{},
			},
			{
				PluginID: "setta-shadowed",
				State:    plugins.PluginRuntimeStateShadowed,
			},
		},
	}

	refresher.applyAppliedLanguageServerStatus(&status)

	if len(status.Plugins[0].AppliedLanguageServerLanguages) != 1 || status.Plugins[0].AppliedLanguageServerLanguages[0] != "python" {
		t.Fatalf("expected applied python status, got %#v", status.Plugins[0].AppliedLanguageServerLanguages)
	}
}

func TestPluginBackendRuntimeRefresherReconcilesProjectDocumentWhenWatchCodeProviderStateChanges(
	t *testing.T,
) {
	tests := []struct {
		name       string
		previous   plugins.PluginWatchCodeCapabilities
		next       plugins.PluginWatchCodeCapabilities
		wantActive bool
		wantID     string
	}{
		{
			name: "provider activates",
			next: plugins.PluginWatchCodeCapabilities{
				PluginID:      "setta-watch-code",
				PluginEnabled: true,
				Python:        true,
			},
			wantActive: true,
			wantID:     "setta-watch-code",
		},
		{
			name: "provider deactivates",
			previous: plugins.PluginWatchCodeCapabilities{
				PluginID:      "setta-watch-code",
				PluginEnabled: true,
				Python:        true,
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
				SchemaVersion:    projectstate.CurrentSchemaVersion,
				DefaultProjectID: "project-alpha",
				Projects: map[string]projectstate.Project{
					"project-alpha": {ID: "project-alpha", Name: "Alpha"},
				},
			})
			if err != nil {
				t.Fatalf("open project runtime: %v", err)
			}
			t.Cleanup(func() {
				if err := projectRuntime.Close(); err != nil {
					t.Fatalf("close project runtime: %v", err)
				}
			})

			capabilities := newWatchCodeCapabilityState()
			capabilities.Set(test.next)
			restarter := &recordingProjectDocumentRestarter{
				onRestart: func(_ projectstate.Document) error {
					pluginID, active := capabilities.ActiveProviderPluginID()
					if active != test.wantActive || pluginID != test.wantID {
						t.Fatalf("restart saw active provider (%q, %v), want (%q, %v)", pluginID, active, test.wantID, test.wantActive)
					}
					return nil
				},
			}
			specs := []lsp.LanguageServerSpec{{PluginID: "setta-basedpyright", LanguageID: "python"}}
			refresher := &pluginBackendRuntimeRefresher{
				projectState:          projectRuntime,
				projectSync:           restarter,
				watchCodeCapabilities: capabilities,
			}

			err = refresher.reconcileProjectDocumentLocked(
				context.Background(),
				specs,
				cloneLanguageServerSpecs(specs),
				watchCodeActiveProviderChanged(test.previous, test.next),
			)
			if err != nil {
				t.Fatalf("reconcile project document: %v", err)
			}
			if restarter.restartCount != 1 {
				t.Fatalf("expected one project restart, got %d", restarter.restartCount)
			}
		})
	}
}

func TestPluginBackendRuntimeRefresherSkipsProjectReconcileWhenSpecsAndProviderAreUnchanged(
	t *testing.T,
) {
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close project runtime: %v", err)
		}
	})

	capabilities := plugins.PluginWatchCodeCapabilities{
		PluginID:      "setta-watch-code",
		PluginEnabled: true,
		Python:        true,
	}
	restarter := &recordingProjectDocumentRestarter{}
	specs := []lsp.LanguageServerSpec{{PluginID: "setta-basedpyright", LanguageID: "python"}}
	refresher := &pluginBackendRuntimeRefresher{
		projectState: projectRuntime,
		projectSync:  restarter,
	}

	err = refresher.reconcileProjectDocumentLocked(
		context.Background(),
		specs,
		cloneLanguageServerSpecs(specs),
		watchCodeActiveProviderChanged(capabilities, capabilities),
	)
	if err != nil {
		t.Fatalf("reconcile project document: %v", err)
	}
	if restarter.restartCount != 0 {
		t.Fatalf("expected no project restart, got %d", restarter.restartCount)
	}
}

func newPluginRuntimeRefreshTestService(t *testing.T) (*plugins.Service, string) {
	service, _, settaFilesRoot := newPluginRuntimeRefreshTestServiceWithRoots(t)
	return service, settaFilesRoot
}

func newPluginRuntimeRefreshTestServiceWithRoots(t *testing.T) (*plugins.Service, string, string) {
	t.Helper()

	root := t.TempDir()
	workspaceRoot := filepath.Join(root, "workspace")
	settaFilesRoot := filepath.Join(root, "setta_files")
	settaHome := filepath.Join(root, ".setta")
	for _, path := range []string{workspaceRoot, settaFilesRoot, settaHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	service, err := plugins.NewService(plugins.ServiceOptions{
		WorkspaceRoot:  workspaceRoot,
		SettaFilesRoot: settaFilesRoot,
		SettaHome:      settaHome,
		ServerMode:     "ide",
	})
	if err != nil {
		t.Fatalf("new plugin service: %v", err)
	}
	return service, workspaceRoot, settaFilesRoot
}

func writePluginRuntimeRefreshTestJSON(t *testing.T, path string, payload any) {
	t.Helper()

	content, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal json %s: %v", path, err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, append(content, '\n'), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

type recordingProjectDocumentRestarter struct {
	restartCount int
	onRestart    func(projectstate.Document) error
}

func (r *recordingProjectDocumentRestarter) Restart(_ context.Context, document projectstate.Document) error {
	r.restartCount++
	if r.onRestart != nil {
		return r.onRestart(document)
	}
	return nil
}

func (r *recordingProjectDocumentRestarter) TypeCheckProject(
	context.Context,
	projectstate.Document,
	string,
) error {
	return nil
}

func TestPluginBackendRuntimeRefresherAppliesLanguageServerStatusForInvalidEntry(t *testing.T) {
	refresher := &pluginBackendRuntimeRefresher{
		appliedLSPSpecs: []lsp.LanguageServerSpec{
			{
				PluginID:   "setta-basedpyright",
				LanguageID: "python",
			},
		},
	}
	status := plugins.PluginStatusResponse{
		Plugins: []plugins.PluginStatusEntry{
			{
				PluginID: "setta-basedpyright",
				State:    plugins.PluginRuntimeStateInvalid,
			},
		},
	}

	refresher.applyAppliedLanguageServerStatus(&status)

	if len(status.Plugins[0].AppliedLanguageServerLanguages) != 1 || status.Plugins[0].AppliedLanguageServerLanguages[0] != "python" {
		t.Fatalf("expected invalid entry to retain applied python status, got %#v", status.Plugins[0].AppliedLanguageServerLanguages)
	}
}

func TestPluginBackendRuntimeRefresherSynthesizesMissingAppliedLanguageServerStatus(t *testing.T) {
	refresher := &pluginBackendRuntimeRefresher{
		appliedLSPSpecs: []lsp.LanguageServerSpec{
			{
				PluginID:   "setta-basedpyright",
				LanguageID: "python",
			},
		},
	}
	status := plugins.PluginStatusResponse{
		Plugins: []plugins.PluginStatusEntry{},
	}

	refresher.applyAppliedLanguageServerStatus(&status)

	if len(status.Plugins) != 1 {
		t.Fatalf("expected synthesized applied status entry, got %#v", status.Plugins)
	}
	entry := status.Plugins[0]
	if entry.PluginID != "setta-basedpyright" || entry.State != plugins.PluginRuntimeStateInvalid {
		t.Fatalf("expected synthesized invalid entry for missing applied plugin, got %#v", entry)
	}
	if len(entry.AppliedLanguageServerLanguages) != 1 || entry.AppliedLanguageServerLanguages[0] != "python" {
		t.Fatalf("expected synthesized entry to retain applied python status, got %#v", entry.AppliedLanguageServerLanguages)
	}
}

func TestPluginBackendRuntimeRefresherAppliesLanguageServerStatusToMatchingDuplicateImplementation(t *testing.T) {
	workspaceDigest := "workspace-digest"
	settaFilesDigest := "setta-files-digest"
	refresher := &pluginBackendRuntimeRefresher{
		appliedLSPSpecs: []lsp.LanguageServerSpec{
			{
				PluginID:                 "setta-basedpyright",
				LanguageID:               "python",
				PluginSourceScope:        string(plugins.PluginScopeWorkspace),
				PluginSourceManager:      string(plugins.PluginSourceManagerSetta),
				PluginCanonicalSourceKey: "local:/workspace/setta-basedpyright",
				PluginSourcePath:         "/workspace/setta-basedpyright",
				PluginSourceDigestSHA256: &workspaceDigest,
			},
		},
	}
	status := plugins.PluginStatusResponse{
		Plugins: []plugins.PluginStatusEntry{
			{
				PluginID:           "setta-basedpyright",
				State:              plugins.PluginRuntimeStateActive,
				SourceScope:        plugins.PluginScopeSettaFiles,
				SourceScopeLabel:   string(plugins.PluginScopeSettaFiles),
				SourceManager:      plugins.PluginSourceManagerSetta,
				SourcePath:         "/setta-files/setta-basedpyright",
				CanonicalSourceKey: "local:/setta-files/setta-basedpyright",
				SourceDigestSHA256: &settaFilesDigest,
			},
			{
				PluginID:           "setta-basedpyright",
				State:              plugins.PluginRuntimeStateInvalid,
				SourceScope:        plugins.PluginScopeWorkspace,
				SourceScopeLabel:   string(plugins.PluginScopeWorkspace),
				SourceManager:      plugins.PluginSourceManagerSetta,
				SourcePath:         "/workspace/setta-basedpyright",
				CanonicalSourceKey: "local:/workspace/setta-basedpyright",
				SourceDigestSHA256: &workspaceDigest,
			},
		},
	}

	refresher.applyAppliedLanguageServerStatus(&status)

	if status.Plugins[0].SourcePath != "/workspace/setta-basedpyright" {
		t.Fatalf("expected applied workspace duplicate to move to the front, got %#v", status.Plugins)
	}
	if len(status.Plugins[0].AppliedLanguageServerLanguages) != 1 || status.Plugins[0].AppliedLanguageServerLanguages[0] != "python" {
		t.Fatalf("expected applied language to stay on the matching workspace duplicate, got %#v", status.Plugins[0].AppliedLanguageServerLanguages)
	}
	if len(status.Plugins[1].AppliedLanguageServerLanguages) != 0 {
		t.Fatalf("expected lower-precedence duplicate to remain unapplied, got %#v", status.Plugins[1].AppliedLanguageServerLanguages)
	}
}

func TestBuildLanguageServerSelectionStatusesReportsActiveSelection(t *testing.T) {
	selection := "setta-basedpyright"
	statuses := buildLanguageServerSelectionStatuses(
		[]plugins.PluginStatusEntry{
			{
				PluginID: "setta-basedpyright",
				Name:     "basedpyright",
				State:    plugins.PluginRuntimeStateActive,
				RegisteredLanguageServers: []plugins.PluginRegisteredLanguageServer{
					{
						PluginID: "setta-basedpyright",
						Name:     "basedpyright",
						Language: "python",
					},
				},
				AppliedLanguageServerLanguages: []string{"python"},
			},
		},
		map[string]*string{"python": &selection},
	)

	status := requireLanguageServerSelectionStatus(t, statuses, "python")
	if status.SelectionState != plugins.LanguageServerSelectionStateSelected {
		t.Fatalf("expected selected state, got %#v", status.SelectionState)
	}
	if status.Status != plugins.LanguageServerSelectionStatusActive {
		t.Fatalf("expected active selection status, got %#v", status.Status)
	}
	if status.SelectedPluginID == nil || *status.SelectedPluginID != "setta-basedpyright" {
		t.Fatalf("expected selected plugin id setta-basedpyright, got %#v", status.SelectedPluginID)
	}
	if status.AppliedPluginID == nil || *status.AppliedPluginID != "setta-basedpyright" {
		t.Fatalf("expected applied plugin id setta-basedpyright, got %#v", status.AppliedPluginID)
	}
	if len(status.AvailableProviders) != 1 || !status.AvailableProviders[0].Available {
		t.Fatalf("expected one available provider, got %#v", status.AvailableProviders)
	}
}

func TestBuildLanguageServerSelectionStatusesReportsPendingRestartForUnsetSelectionWithAppliedPlugin(t *testing.T) {
	statuses := buildLanguageServerSelectionStatuses(
		[]plugins.PluginStatusEntry{
			{
				PluginID:                       "setta-basedpyright",
				Name:                           "setta-basedpyright",
				State:                          plugins.PluginRuntimeStateInvalid,
				AppliedLanguageServerLanguages: []string{"python"},
			},
		},
		map[string]*string{},
	)

	status := requireLanguageServerSelectionStatus(t, statuses, "python")
	if status.SelectionState != plugins.LanguageServerSelectionStateUnset {
		t.Fatalf("expected unset selection state, got %#v", status.SelectionState)
	}
	if status.Status != plugins.LanguageServerSelectionStatusPendingRestart {
		t.Fatalf("expected pending_restart selection status, got %#v", status.Status)
	}
	if !status.RestartRequired {
		t.Fatal("expected pending restart status to require restart")
	}
	if status.AppliedPluginID == nil || *status.AppliedPluginID != "setta-basedpyright" {
		t.Fatalf("expected applied plugin id setta-basedpyright, got %#v", status.AppliedPluginID)
	}
}

func TestBuildLanguageServerSelectionStatusesReportsSelectedUnavailableAndIncludesSelectedProvider(t *testing.T) {
	selection := "setta-basedpyright"
	statuses := buildLanguageServerSelectionStatuses(
		[]plugins.PluginStatusEntry{
			{
				PluginID: "setta-pylsp",
				Name:     "pylsp",
				State:    plugins.PluginRuntimeStateActive,
				RegisteredLanguageServers: []plugins.PluginRegisteredLanguageServer{
					{
						PluginID: "setta-pylsp",
						Name:     "pylsp",
						Language: "python",
					},
				},
			},
		},
		map[string]*string{"python": &selection},
	)

	status := requireLanguageServerSelectionStatus(t, statuses, "python")
	if status.Status != plugins.LanguageServerSelectionStatusSelectedUnavailable {
		t.Fatalf("expected selected_unavailable status, got %#v", status.Status)
	}
	if len(status.AvailableProviders) != 2 {
		t.Fatalf("expected selected unavailable provider to be preserved alongside active providers, got %#v", status.AvailableProviders)
	}
	if status.AvailableProviders[0].PluginID != "setta-pylsp" || !status.AvailableProviders[0].Available {
		t.Fatalf("expected active provider first, got %#v", status.AvailableProviders)
	}
	if status.AvailableProviders[1].PluginID != "setta-basedpyright" || status.AvailableProviders[1].Available {
		t.Fatalf("expected unavailable selected provider to remain in options, got %#v", status.AvailableProviders)
	}
}

func TestApplyWatchCodeLanguageServerDependencyStatusDerivesPythonLSPState(t *testing.T) {
	activePluginID := "setta-basedpyright"
	pendingPluginID := "setta-ty"

	tests := []struct {
		name                string
		selections          []plugins.LanguageServerSelectionStatus
		expectedStatus      plugins.PluginWatchCodeLanguageServerDependencyStatusKind
		expectedSelectedID  *string
		expectedAppliedID   *string
		expectedRestartFlag bool
	}{
		{
			name: "active provider agnostic python lsp",
			selections: []plugins.LanguageServerSelectionStatus{
				{
					Language:         "python",
					Status:           plugins.LanguageServerSelectionStatusActive,
					SelectedPluginID: &activePluginID,
					AppliedPluginID:  &activePluginID,
				},
			},
			expectedStatus:     plugins.PluginWatchCodeLanguageServerDependencyStatusActive,
			expectedSelectedID: &activePluginID,
			expectedAppliedID:  &activePluginID,
		},
		{
			name:           "unavailable python lsp",
			selections:     nil,
			expectedStatus: plugins.PluginWatchCodeLanguageServerDependencyStatusMissing,
		},
		{
			name: "explicitly disabled python lsp",
			selections: []plugins.LanguageServerSelectionStatus{
				{
					Language: "python",
					Status:   plugins.LanguageServerSelectionStatusDisabled,
				},
			},
			expectedStatus: plugins.PluginWatchCodeLanguageServerDependencyStatusDisabled,
		},
		{
			name: "pending restart python lsp",
			selections: []plugins.LanguageServerSelectionStatus{
				{
					Language:         "python",
					Status:           plugins.LanguageServerSelectionStatusPendingRestart,
					SelectedPluginID: &pendingPluginID,
					RestartRequired:  true,
				},
			},
			expectedStatus:      plugins.PluginWatchCodeLanguageServerDependencyStatusPendingRestart,
			expectedSelectedID:  &pendingPluginID,
			expectedRestartFlag: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := plugins.PluginRuntimeResponse{
				FeatureCapabilities: &plugins.PluginFeatureCapabilities{
					WatchCode: plugins.PluginWatchCodeCapabilities{
						PluginID:               "setta-watch-code",
						PluginEnabled:          true,
						Python:                 true,
						RequiresLanguageServer: true,
					},
				},
				Status: plugins.PluginStatusResponse{
					LanguageServerSelections: test.selections,
				},
			}

			applyWatchCodeLanguageServerDependencyStatus(&response)

			dependency := response.FeatureCapabilities.WatchCode.LanguageServerDependency
			if dependency == nil {
				t.Fatal("expected watch code language-server dependency status")
			}
			if dependency.Language != "python" || !dependency.Required {
				t.Fatalf("expected required Python dependency, got %#v", dependency)
			}
			if dependency.Status != test.expectedStatus {
				t.Fatalf("expected dependency status %q, got %#v", test.expectedStatus, dependency)
			}
			if !optionalStringPointersEqual(dependency.SelectedPluginID, test.expectedSelectedID) {
				t.Fatalf("expected selected plugin id %#v, got %#v", test.expectedSelectedID, dependency.SelectedPluginID)
			}
			if !optionalStringPointersEqual(dependency.AppliedPluginID, test.expectedAppliedID) {
				t.Fatalf("expected applied plugin id %#v, got %#v", test.expectedAppliedID, dependency.AppliedPluginID)
			}
			if dependency.RestartRequired != test.expectedRestartFlag {
				t.Fatalf("expected restartRequired=%v, got %#v", test.expectedRestartFlag, dependency)
			}
			if dependency.Message == "" {
				t.Fatalf("expected dependency message, got %#v", dependency)
			}
		})
	}
}

func requireLanguageServerSelectionStatus(
	t *testing.T,
	statuses []plugins.LanguageServerSelectionStatus,
	language string,
) plugins.LanguageServerSelectionStatus {
	t.Helper()

	for _, status := range statuses {
		if status.Language == language {
			return status
		}
	}
	t.Fatalf("expected selection status for language %q in %#v", language, statuses)
	return plugins.LanguageServerSelectionStatus{}
}

func TestCommitAppliedLanguageServerPluginsDoesNotAdvanceAppliedSpecsOnCommitFailure(t *testing.T) {
	app := newAppWithFixtureLanguageServer(t)

	previous := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Settings:   map[string]any{},
		},
	}
	next := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-basedpyright",
			LanguageID: "python",
			Command:    "python",
			Settings: map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"extraPaths": []any{"/tmp/spec"},
					},
				},
			},
		},
	}

	app.pluginRuntime.mu.Lock()
	app.pluginRuntime.appliedLSPSpecs = cloneLanguageServerSpecs(previous)
	app.pluginRuntime.lspSpecs = cloneLanguageServerSpecs(next)
	app.pluginRuntime.mu.Unlock()

	if err := os.WriteFile(filepath.Join(app.config.Paths.SettaFilesRoot, "plugins_state.json"), []byte("{"), 0o644); err != nil {
		t.Fatalf("write malformed plugin state: %v", err)
	}

	err := app.pluginRuntime.CommitAppliedLanguageServerPlugins(context.Background())
	if err == nil {
		t.Fatal("expected commit failure")
	}

	app.pluginRuntime.mu.Lock()
	defer app.pluginRuntime.mu.Unlock()

	if !languageServerSpecSlicesEqual(app.pluginRuntime.appliedLSPSpecs, previous) {
		t.Fatalf("expected applied specs to remain unchanged after commit failure, got %#v", app.pluginRuntime.appliedLSPSpecs)
	}
}

func TestCommitAppliedLanguageServerPluginsPreservesPendingStateForSelectionChangedMidCommit(t *testing.T) {
	app := newAppWithFixtureLanguageServer(t)

	current := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp.py"},
			Settings:   map[string]any{},
		},
	}

	app.pluginRuntime.mu.Lock()
	app.pluginRuntime.appliedLSPSpecs = cloneLanguageServerSpecs(current)
	app.pluginRuntime.lspSpecs = cloneLanguageServerSpecs(current)
	app.pluginRuntime.mu.Unlock()

	writeAppPendingRestartPluginStateWithLanguageServerOnlyIDs(
		t,
		app.config,
		[]string{"setta-fixture-backend-alt"},
		[]string{"setta-fixture-backend-alt"},
	)
	setAppLanguageServerSelectionWithoutRefresh(t, app, "fixturedsl", "setta-fixture-backend-alt")

	if err := app.pluginRuntime.CommitAppliedLanguageServerPlugins(context.Background()); err != nil {
		t.Fatalf("commit applied language server plugins: %v", err)
	}

	persistedState := readAppPluginsState(t, app.config)
	if len(persistedState.PendingRestartBackendPluginIDs) != 1 || persistedState.PendingRestartBackendPluginIDs[0] != "setta-fixture-backend-alt" {
		t.Fatalf("expected switched selection to stay pending in backend ids, got %#v", persistedState.PendingRestartBackendPluginIDs)
	}
	if len(persistedState.PendingRestartLanguageServerOnlyPluginIDs) != 1 || persistedState.PendingRestartLanguageServerOnlyPluginIDs[0] != "setta-fixture-backend-alt" {
		t.Fatalf("expected switched selection to stay pending in language-server-only ids, got %#v", persistedState.PendingRestartLanguageServerOnlyPluginIDs)
	}
}

func TestCommitAppliedLanguageServerPluginsDoesNotOverwriteNewerAppliedSpecs(t *testing.T) {
	app := newAppWithFixtureLanguageServer(t)

	previous := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp.py"},
			Settings:   map[string]any{},
		},
	}
	staleNext := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-basedpyright",
			LanguageID: "python",
			Command:    "python",
			Args:       []string{"basedpyright.py"},
			Settings: map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"extraPaths": []any{"/tmp/stale"},
					},
				},
			},
		},
	}
	updated := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend-alt",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp-alt.py"},
			Settings: map[string]any{
				"fixtureDslLanguageServer": map[string]any{
					"analysis": map[string]any{
						"emitDiagnostics": true,
					},
				},
			},
		},
	}

	app.pluginRuntime.mu.Lock()
	app.pluginRuntime.appliedLSPSpecs = cloneLanguageServerSpecs(previous)
	app.pluginRuntime.lspSpecs = cloneLanguageServerSpecs(staleNext)
	app.pluginRuntime.mu.Unlock()

	statePath := filepath.Join(app.config.Paths.SettaFilesRoot, "plugins_state.json")
	if err := os.Remove(statePath); err != nil && !os.IsNotExist(err) {
		t.Fatalf("remove plugins state: %v", err)
	}
	if err := syscall.Mkfifo(statePath, 0o600); err != nil {
		t.Fatalf("mkfifo plugins state: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Remove(statePath); err != nil && !os.IsNotExist(err) {
			t.Fatalf("cleanup plugins state fifo: %v", err)
		}
	})

	commitErrs := make(chan error, 1)
	go func() {
		commitErrs <- app.pluginRuntime.CommitAppliedLanguageServerPlugins(context.Background())
	}()

	mutationDone := make(chan struct{})
	go func() {
		app.pluginRuntime.mu.Lock()
		app.pluginRuntime.lspSpecs = cloneLanguageServerSpecs(updated)
		app.pluginRuntime.appliedLSPSpecs = cloneLanguageServerSpecs(updated)
		app.pluginRuntime.mu.Unlock()
		close(mutationDone)
	}()

	writerErrs := make(chan error, 1)
	go func() {
		payload, err := json.Marshal(map[string]any{
			"pendingRestartBackendPluginIds": []string{"setta-unrelated"},
		})
		if err != nil {
			writerErrs <- err
			return
		}
		writer, err := os.OpenFile(statePath, os.O_WRONLY, 0)
		if err != nil {
			writerErrs <- err
			return
		}
		if _, err := writer.Write(payload); err != nil {
			_ = writer.Close()
			writerErrs <- err
			return
		}
		if err := writer.Close(); err != nil {
			writerErrs <- err
			return
		}
		writerErrs <- nil
	}()

	select {
	case err := <-writerErrs:
		if err != nil {
			t.Fatalf("write plugins state fifo: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out writing plugins state fifo")
	}

	select {
	case err := <-commitErrs:
		if err != nil {
			t.Fatalf("commit applied language server plugins: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for applied language server commit")
	}

	select {
	case <-mutationDone:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for concurrent applied spec mutation")
	}

	app.pluginRuntime.mu.Lock()
	defer app.pluginRuntime.mu.Unlock()

	if !languageServerSpecSlicesEqual(app.pluginRuntime.appliedLSPSpecs, updated) {
		t.Fatalf("expected applied specs to keep the newer updated set, got %#v", app.pluginRuntime.appliedLSPSpecs)
	}
	if !languageServerSpecSlicesEqual(app.pluginRuntime.lspSpecs, updated) {
		t.Fatalf("expected current specs to keep the newer updated set, got %#v", app.pluginRuntime.lspSpecs)
	}
}

func TestRefreshedAppliedLanguageServerSpecsKeepsOnlyPreviouslyAppliedSelections(t *testing.T) {
	applied := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp.py"},
		},
	}
	selected := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp-updated.py"},
		},
		{
			PluginID:   "setta-basedpyright",
			LanguageID: "python",
			Command:    "python",
			Args:       []string{"basedpyright.py"},
		},
	}

	refreshed := refreshedAppliedLanguageServerSpecs(applied, selected, "setta-fixture-backend")
	if len(refreshed) != 1 {
		t.Fatalf("expected only previously applied spec to remain, got %#v", refreshed)
	}
	if refreshed[0].PluginID != "setta-fixture-backend" || refreshed[0].LanguageID != "fixturedsl" {
		t.Fatalf("unexpected refreshed spec identity %#v", refreshed[0])
	}
	if len(refreshed[0].Args) != 1 || refreshed[0].Args[0] != "fixture-lsp-updated.py" {
		t.Fatalf("expected refreshed spec to pick updated applied-plugin args, got %#v", refreshed[0].Args)
	}
}

func expectRefreshedAppliedLanguageServerSpecsKeepAppliedSelection(t *testing.T, selected []lsp.LanguageServerSpec) {
	t.Helper()

	applied := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp.py"},
		},
	}

	refreshed := refreshedAppliedLanguageServerSpecs(applied, selected, "setta-fixture-backend")
	if len(refreshed) != 1 {
		t.Fatalf("expected applied spec to remain pending until restart, got %#v", refreshed)
	}
	if refreshed[0].PluginID != "setta-fixture-backend" || refreshed[0].LanguageID != "fixturedsl" {
		t.Fatalf("unexpected refreshed spec identity %#v", refreshed[0])
	}
	if len(refreshed[0].Args) != 1 || refreshed[0].Args[0] != "fixture-lsp.py" {
		t.Fatalf("expected applied spec to remain unchanged, got %#v", refreshed[0].Args)
	}
}

func TestRefreshedAppliedLanguageServerSpecsKeepsClearedSelectionPendingUntilRestart(t *testing.T) {
	expectRefreshedAppliedLanguageServerSpecsKeepAppliedSelection(t, nil)
}

func TestRefreshedAppliedLanguageServerSpecsKeepsSwitchedSelectionPendingUntilRestart(t *testing.T) {
	expectRefreshedAppliedLanguageServerSpecsKeepAppliedSelection(t, []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-fixture-backend-alt",
			LanguageID: "fixturedsl",
			Command:    "python",
			Args:       []string{"fixture-lsp-alt.py"},
		},
	})
}

func TestRefreshedAppliedLanguageServerSpecsKeepsCommittedDuplicateImplementation(t *testing.T) {
	workspaceDigest := "workspace-digest"
	settaFilesDigest := "setta-files-digest"
	applied := []lsp.LanguageServerSpec{
		{
			PluginID:                 "setta-fixture-backend",
			LanguageID:               "fixturedsl",
			Command:                  "python",
			Args:                     []string{"workspace-fixture-lsp.py"},
			PluginSourceScope:        string(plugins.PluginScopeWorkspace),
			PluginSourceManager:      string(plugins.PluginSourceManagerSetta),
			PluginCanonicalSourceKey: "local:/workspace/setta-fixture-backend",
			PluginSourcePath:         "/workspace/setta-fixture-backend",
			PluginSourceDigestSHA256: &workspaceDigest,
		},
	}
	selected := []lsp.LanguageServerSpec{
		{
			PluginID:                 "setta-fixture-backend",
			LanguageID:               "fixturedsl",
			Command:                  "python",
			Args:                     []string{"setta-files-fixture-lsp.py"},
			PluginSourceScope:        string(plugins.PluginScopeSettaFiles),
			PluginSourceManager:      string(plugins.PluginSourceManagerSetta),
			PluginCanonicalSourceKey: "local:/setta-files/setta-fixture-backend",
			PluginSourcePath:         "/setta-files/setta-fixture-backend",
			PluginSourceDigestSHA256: &settaFilesDigest,
		},
	}

	refreshed := refreshedAppliedLanguageServerSpecs(applied, selected, "setta-fixture-backend")
	if len(refreshed) != 1 {
		t.Fatalf("expected one applied spec to remain, got %#v", refreshed)
	}
	if len(refreshed[0].Args) != 1 || refreshed[0].Args[0] != "workspace-fixture-lsp.py" {
		t.Fatalf("expected config refresh to keep the committed duplicate implementation, got %#v", refreshed[0].Args)
	}
	if refreshed[0].PluginSourcePath != "/workspace/setta-fixture-backend" {
		t.Fatalf("expected committed source path to remain unchanged, got %q", refreshed[0].PluginSourcePath)
	}
}
