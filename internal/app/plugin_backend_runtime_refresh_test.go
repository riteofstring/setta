package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"setta/internal/lsp"
	"setta/internal/plugins"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
)

func TestPluginBackendRuntimeRefresherPrepareRefreshTransitionClonesPreviousSettings(t *testing.T) {
	t.Parallel()

	originalSpecs := []lsp.LanguageServerSpec{fixtureRefresherLanguageServerSpec()}
	service := &stubPluginBackendRefreshService{
		previewSnapshot: plugins.DiscoverySnapshot{},
		nextSpecs:       []lsp.LanguageServerSpec{},
	}
	refresher := &pluginBackendRuntimeRefresher{
		service:  service,
		lspSpecs: lsp.CloneLanguageServerSpecs(originalSpecs),
	}

	transition, err := refresher.prepareRefreshTransitionLocked(context.Background())
	if err != nil {
		t.Fatalf("prepare refresh transition: %v", err)
	}

	severityOverrides := originalSpecs[0].Settings["basedpyright"].(map[string]any)["analysis"].(map[string]any)["severityOverrides"].(map[string]any)
	severityOverrides["reportUnusedCallResult"] = "error"

	got := transition.previousLSPSpecs[0].Settings["basedpyright"].(map[string]any)["analysis"].(map[string]any)["severityOverrides"].(map[string]any)["reportUnusedCallResult"]
	if got != "warning" {
		t.Fatalf("expected cloned settings to keep original value, got %#v", got)
	}
}

func TestPluginBackendRuntimeRefresherRollbackRestoresSettings(t *testing.T) {
	t.Parallel()

	previousSpecs := []lsp.LanguageServerSpec{fixtureRefresherLanguageServerSpec()}
	router := &stubPluginBackendLanguageServerReplacer{}
	refresher := &pluginBackendRuntimeRefresher{
		lspRouter: router,
	}

	refresher.rollbackRefreshTransitionLocked(&pluginBackendRefreshTransition{
		nextLSPSpecs: []lsp.LanguageServerSpec{{
			PluginID:   "other-plugin",
			Name:       "other",
			LanguageID: "python",
			Command:    "python",
		}},
		previousLSPSpecs: lsp.CloneLanguageServerSpecs(previousSpecs),
	})

	if len(router.replacedSpecs) != 1 {
		t.Fatalf("expected one rollback spec replacement, got %#v", router.replacedSpecs)
	}
	if !reflect.DeepEqual(router.replacedSpecs[0], previousSpecs) {
		t.Fatalf("expected rollback to restore previous specs, got %#v", router.replacedSpecs[0])
	}
}

func TestBuildSelectedLanguageServerStatusesIncludesPythonWhenUnselected(t *testing.T) {
	t.Parallel()

	statuses := buildSelectedLanguageServerStatuses(
		map[string]*string{},
		nil,
		nil,
		nil,
	)
	if len(statuses) != 1 {
		t.Fatalf("expected one default language status, got %#v", statuses)
	}
	if statuses[0].LanguageID != "python" {
		t.Fatalf("expected default python status, got %#v", statuses[0])
	}
	if statuses[0].State != plugins.SelectedLanguageServerStateNotSelected {
		t.Fatalf("expected not-selected state, got %#v", statuses[0])
	}
	if !statuses[0].Applied {
		t.Fatalf("expected unselected python state to be applied when no spec is live")
	}
}

func TestBuildSelectedLanguageServerStatusesKeepsPendingInstallReadyUntilApplied(t *testing.T) {
	t.Parallel()

	selectedPluginID := "setta-basedpyright"
	statuses := buildSelectedLanguageServerStatuses(
		map[string]*string{"python": &selectedPluginID},
		[]plugins.PluginStatusEntry{{
			PluginID: "setta-basedpyright",
			State:    plugins.PluginRuntimeStatePendingRestart,
		}},
		[]plugins.PluginStatusEntry{{
			PluginID: "setta-basedpyright",
			State:    plugins.PluginRuntimeStateActive,
			RegisteredLanguageServers: []plugins.PluginRegisteredLanguageServer{{
				PluginID: "setta-basedpyright",
				Name:     "basedpyright",
				Language: "python",
				Command:  "/tmp/basedpyright",
			}},
		}},
		nil,
	)
	if len(statuses) != 1 {
		t.Fatalf("expected one language status, got %#v", statuses)
	}
	if statuses[0].State != plugins.SelectedLanguageServerStateReady {
		t.Fatalf("expected ready state, got %#v", statuses[0])
	}
	if statuses[0].Applied {
		t.Fatalf("expected ready selection to remain unapplied without a live spec")
	}
	if statuses[0].SelectedPluginID == nil || *statuses[0].SelectedPluginID != selectedPluginID {
		t.Fatalf("expected selected plugin id %q, got %#v", selectedPluginID, statuses[0].SelectedPluginID)
	}
}

func TestBuildSelectedLanguageServerStatusesUsesPrimaryPluginEntryForClassification(t *testing.T) {
	t.Parallel()

	selectedPluginID := "setta-basedpyright"
	statuses := buildSelectedLanguageServerStatuses(
		map[string]*string{"python": &selectedPluginID},
		[]plugins.PluginStatusEntry{
			{
				PluginID: "setta-basedpyright",
				State:    plugins.PluginRuntimeStateActive,
				RegisteredLanguageServers: []plugins.PluginRegisteredLanguageServer{
					{
						PluginID: "setta-basedpyright",
						Name:     "basedpyright",
						Language: "javascript",
						Command:  "/tmp/js-lsp",
					},
				},
			},
			{
				PluginID: "setta-basedpyright",
				State:    plugins.PluginRuntimeStateShadowed,
				RegisteredLanguageServers: []plugins.PluginRegisteredLanguageServer{
					{
						PluginID: "setta-basedpyright",
						Name:     "basedpyright-shadowed",
						Language: "python",
						Command:  "/tmp/python-lsp",
					},
				},
			},
		},
		[]plugins.PluginStatusEntry{
			{
				PluginID: "setta-basedpyright",
				State:    plugins.PluginRuntimeStateActive,
				RegisteredLanguageServers: []plugins.PluginRegisteredLanguageServer{
					{
						PluginID: "setta-basedpyright",
						Name:     "basedpyright",
						Language: "javascript",
						Command:  "/tmp/js-lsp",
					},
				},
			},
		},
		nil,
	)
	if len(statuses) != 2 {
		t.Fatalf("expected tracked javascript and python statuses, got %#v", statuses)
	}

	for _, status := range statuses {
		if status.LanguageID != "python" {
			continue
		}
		if status.State != plugins.SelectedLanguageServerStateSelectedPluginWrongLang {
			t.Fatalf("expected wrong-language state from primary entry, got %#v", status)
		}
		return
	}
	t.Fatalf("expected python selected language server status, got %#v", statuses)
}

func TestBuildSelectedLanguageServerStatusesKeepsMissingSelectionAppliedUntilRefresh(t *testing.T) {
	t.Parallel()

	selectedPluginID := "setta-basedpyright"
	statuses := buildSelectedLanguageServerStatuses(
		map[string]*string{"python": &selectedPluginID},
		nil,
		nil,
		[]lsp.LanguageServerSpec{fixtureRefresherLanguageServerSpec()},
	)
	if len(statuses) != 1 {
		t.Fatalf("expected one language status, got %#v", statuses)
	}
	if statuses[0].State != plugins.SelectedLanguageServerStateSelectedPluginMissing {
		t.Fatalf("expected missing selection state, got %#v", statuses[0])
	}
	if !statuses[0].Applied {
		t.Fatalf("expected missing selection to remain applied until refresh, got %#v", statuses[0])
	}
}

func TestBuildSelectedLanguageServerStatusesTreatsInvalidSelectionAsUnavailable(t *testing.T) {
	t.Parallel()

	selectedPluginID := "setta-basedpyright"
	statuses := buildSelectedLanguageServerStatuses(
		map[string]*string{"python": &selectedPluginID},
		[]plugins.PluginStatusEntry{{
			PluginID:                  "setta-basedpyright",
			State:                     plugins.PluginRuntimeStateInvalid,
			RegisteredLanguageServers: []plugins.PluginRegisteredLanguageServer{},
		}},
		[]plugins.PluginStatusEntry{{
			PluginID:                  "setta-basedpyright",
			State:                     plugins.PluginRuntimeStateInvalid,
			RegisteredLanguageServers: []plugins.PluginRegisteredLanguageServer{},
		}},
		nil,
	)
	if len(statuses) != 1 {
		t.Fatalf("expected one language status, got %#v", statuses)
	}
	if statuses[0].State != plugins.SelectedLanguageServerStateSelectedPluginUnavailable {
		t.Fatalf("expected unavailable state for invalid selection, got %#v", statuses[0])
	}
}

func TestBuildSelectedLanguageServerStatusesClassifiesPendingDisableUsingPreviewState(t *testing.T) {
	t.Parallel()

	selectedPluginID := "setta-basedpyright"
	statuses := buildSelectedLanguageServerStatuses(
		map[string]*string{"python": &selectedPluginID},
		[]plugins.PluginStatusEntry{{
			PluginID: "setta-basedpyright",
			State:    plugins.PluginRuntimeStatePendingRestart,
			RegisteredLanguageServers: []plugins.PluginRegisteredLanguageServer{{
				PluginID: "setta-basedpyright",
				Name:     "basedpyright",
				Language: "python",
				Command:  "/tmp/basedpyright",
			}},
		}},
		[]plugins.PluginStatusEntry{{
			PluginID: "setta-basedpyright",
			State:    plugins.PluginRuntimeStateDisabled,
		}},
		[]lsp.LanguageServerSpec{fixtureRefresherLanguageServerSpec()},
	)

	if len(statuses) != 1 {
		t.Fatalf("expected one language status, got %#v", statuses)
	}
	if statuses[0].State != plugins.SelectedLanguageServerStateSelectedPluginUnavailable {
		t.Fatalf("expected unavailable state for pending disable, got %#v", statuses[0])
	}
	if !statuses[0].Applied {
		t.Fatalf("expected pending disable to remain applied until restart, got %#v", statuses[0])
	}
}

func TestBuildSelectedLanguageServerStatusesClassifiesPendingUninstallUsingPreviewState(t *testing.T) {
	t.Parallel()

	selectedPluginID := "setta-basedpyright"
	statuses := buildSelectedLanguageServerStatuses(
		map[string]*string{"python": &selectedPluginID},
		[]plugins.PluginStatusEntry{{
			PluginID: "setta-basedpyright",
			State:    plugins.PluginRuntimeStatePendingRestart,
			RegisteredLanguageServers: []plugins.PluginRegisteredLanguageServer{{
				PluginID: "setta-basedpyright",
				Name:     "basedpyright",
				Language: "python",
				Command:  "/tmp/basedpyright",
			}},
		}},
		nil,
		[]lsp.LanguageServerSpec{fixtureRefresherLanguageServerSpec()},
	)

	if len(statuses) != 1 {
		t.Fatalf("expected one language status, got %#v", statuses)
	}
	if statuses[0].State != plugins.SelectedLanguageServerStateSelectedPluginMissing {
		t.Fatalf("expected missing state for pending uninstall, got %#v", statuses[0])
	}
	if !statuses[0].Applied {
		t.Fatalf("expected pending uninstall to remain applied until restart, got %#v", statuses[0])
	}
}

func TestUpdatedAppliedLanguageServerSpecsForPluginReplacesOnlyMatchingAppliedSpecs(t *testing.T) {
	t.Parallel()

	currentSpecs := []lsp.LanguageServerSpec{
		fixtureRefresherLanguageServerSpec(),
		{
			PluginID:   "other-plugin",
			Name:       "other",
			LanguageID: "javascript",
			Command:    "node",
			Settings: map[string]any{
				"other": map[string]any{"enabled": true},
			},
		},
	}
	nextSpecs := []lsp.LanguageServerSpec{
		{
			PluginID:   "setta-basedpyright",
			Name:       "basedpyright",
			LanguageID: "python",
			Command:    "python",
			Settings: map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"diagnosticSeverityOverrides": map[string]any{
							"reportUnknownVariableType": "error",
						},
					},
				},
			},
		},
		{
			PluginID:   "another-plugin",
			Name:       "another",
			LanguageID: "rust",
			Command:    "rust-analyzer",
		},
	}

	updatedSpecs, changed := updatedAppliedLanguageServerSpecsForPlugin(
		currentSpecs,
		nextSpecs,
		"setta-basedpyright",
	)
	if !changed {
		t.Fatal("expected applied spec replacement to report a change")
	}
	if len(updatedSpecs) != len(currentSpecs) {
		t.Fatalf("expected updated specs to preserve current spec count, got %#v", updatedSpecs)
	}
	pythonSettings := updatedSpecs[0].Settings["basedpyright"].(map[string]any)["analysis"].(map[string]any)["diagnosticSeverityOverrides"].(map[string]any)
	if pythonSettings["reportUnknownVariableType"] != "error" {
		t.Fatalf("expected updated python settings, got %#v", updatedSpecs[0].Settings)
	}
	if !reflect.DeepEqual(updatedSpecs[1], currentSpecs[1]) {
		t.Fatalf("expected non-target applied spec to stay unchanged, got %#v", updatedSpecs[1])
	}
}

func TestPluginBackendRuntimeRefresherRestartProjectRestoresPreviousProjectSessionAfterFailure(t *testing.T) {
	t.Parallel()

	currentSpecs := []lsp.LanguageServerSpec{fixtureRefresherLanguageServerSpec()}
	nextSpecs := []lsp.LanguageServerSpec{{
		PluginID:   "setta-basedpyright",
		Name:       "basedpyright",
		LanguageID: "python",
		Command:    "python3",
	}}
	service := &stubPluginBackendRefreshService{
		previewSnapshot: plugins.DiscoverySnapshot{},
		nextSpecs:       nextSpecs,
	}
	router := &stubPluginBackendLanguageServerReplacer{}
	refresher := &pluginBackendRuntimeRefresher{
		service:   service,
		lspRouter: router,
		lspSpecs:  lsp.CloneLanguageServerSpecs(currentSpecs),
	}

	projectErr := errors.New("restart failed")
	restartCalls := 0
	err := refresher.RestartProject(
		context.Background(),
		fixtureRestartProjectDocument(t, projectstate.CodeLanguagePython),
		func(context.Context) error {
			restartCalls++
			if restartCalls == 1 {
				return projectErr
			}
			return nil
		},
	)
	if !errors.Is(err, projectErr) {
		t.Fatalf("expected restart error %v, got %v", projectErr, err)
	}
	if restartCalls != 2 {
		t.Fatalf("expected restart callback to run twice for rollback restore, got %d calls", restartCalls)
	}
	if service.commitCalls != 0 {
		t.Fatalf("expected commit to be skipped on project failure, got %d calls", service.commitCalls)
	}
	if !reflect.DeepEqual(refresher.lspSpecs, currentSpecs) {
		t.Fatalf("expected refresher specs to roll back, got %#v", refresher.lspSpecs)
	}
	if len(router.replacedSpecs) != 2 {
		t.Fatalf("expected apply and rollback replacements, got %#v", router.replacedSpecs)
	}
	if !reflect.DeepEqual(router.replacedSpecs[0], nextSpecs) {
		t.Fatalf("expected staged specs to be applied first, got %#v", router.replacedSpecs[0])
	}
	if !reflect.DeepEqual(router.replacedSpecs[1], currentSpecs) {
		t.Fatalf("expected rollback to restore previous specs, got %#v", router.replacedSpecs[1])
	}
}

func TestPluginBackendRuntimeRefresherRestartProjectRestoresPreviousProjectSessionWithInternalContext(t *testing.T) {
	t.Parallel()

	currentSpecs := []lsp.LanguageServerSpec{fixtureRefresherLanguageServerSpec()}
	service := &stubPluginBackendRefreshService{
		previewSnapshot: plugins.DiscoverySnapshot{},
		nextSpecs:       currentSpecs,
	}
	router := &stubPluginBackendLanguageServerReplacer{}
	refresher := &pluginBackendRuntimeRefresher{
		service:   service,
		lspRouter: router,
		lspSpecs:  lsp.CloneLanguageServerSpecs(currentSpecs),
	}

	requestCtx, cancel := context.WithCancel(context.Background())
	restartContexts := []context.Context{}
	err := refresher.RestartProject(
		requestCtx,
		fixtureRestartProjectDocument(t, projectstate.CodeLanguagePython),
		func(restartCtx context.Context) error {
			restartContexts = append(restartContexts, restartCtx)
			if len(restartContexts) == 1 {
				cancel()
				return requestCtx.Err()
			}
			if restartCtx == requestCtx {
				t.Fatal("expected rollback restore to use an internal context")
			}
			if err := restartCtx.Err(); err != nil {
				t.Fatalf("expected rollback restore context to remain active, got %v", err)
			}
			return nil
		},
	)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected canceled restart error, got %v", err)
	}
	if len(restartContexts) != 2 {
		t.Fatalf("expected restart callback to run twice, got %d calls", len(restartContexts))
	}
	if service.commitCalls != 0 {
		t.Fatalf("expected commit to be skipped on project failure, got %d calls", service.commitCalls)
	}
	if !reflect.DeepEqual(refresher.lspSpecs, currentSpecs) {
		t.Fatalf("expected refresher specs to roll back, got %#v", refresher.lspSpecs)
	}
}

func TestPluginBackendRuntimeRefresherRestartProjectRejectsUnconfiguredCurrentProjectLanguages(t *testing.T) {
	t.Parallel()

	service := &stubPluginBackendRefreshService{
		previewSnapshot: plugins.DiscoverySnapshot{},
		nextSpecs: []lsp.LanguageServerSpec{{
			PluginID:   "setta-fixture-backend",
			Name:       "fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python3",
		}},
	}
	router := &stubPluginBackendLanguageServerReplacer{}
	refresher := &pluginBackendRuntimeRefresher{
		service:   service,
		lspRouter: router,
	}

	restartCalls := 0
	err := refresher.RestartProject(
		context.Background(),
		fixtureRestartProjectDocument(t, projectstate.CodeLanguagePython),
		func(context.Context) error {
			restartCalls++
			return nil
		},
	)
	if !errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
		t.Fatalf("expected ErrLanguageServerNotConfigured, got %v", err)
	}
	if restartCalls != 0 {
		t.Fatalf("expected restart callback to be skipped, got %d calls", restartCalls)
	}
	if service.commitCalls != 0 {
		t.Fatalf("expected commit to be skipped when project languages are unconfigured, got %d calls", service.commitCalls)
	}
	if len(router.replacedSpecs) != 0 {
		t.Fatalf("expected no spec replacement when restart is rejected, got %#v", router.replacedSpecs)
	}
}

func TestPluginBackendRuntimeRefresherRestartProjectRejectsStalePreviousProjectLanguageServer(t *testing.T) {
	t.Parallel()

	currentSpecs := []lsp.LanguageServerSpec{fixtureRefresherLanguageServerSpec()}
	service := &stubPluginBackendRefreshService{
		previewSnapshot: plugins.DiscoverySnapshot{},
		nextSpecs: []lsp.LanguageServerSpec{{
			PluginID:   "setta-fixture-backend",
			Name:       "fixture-backend",
			LanguageID: "fixturedsl",
			Command:    "python3",
		}},
	}
	router := &stubPluginBackendLanguageServerReplacer{}
	refresher := &pluginBackendRuntimeRefresher{
		service:   service,
		lspRouter: router,
		lspSpecs:  lsp.CloneLanguageServerSpecs(currentSpecs),
	}

	restartCalls := 0
	err := refresher.RestartProject(
		context.Background(),
		fixtureRestartProjectDocument(t, projectstate.CodeLanguagePython),
		func(context.Context) error {
			restartCalls++
			return nil
		},
	)
	if !errors.Is(err, lsp.ErrLanguageServerNotConfigured) {
		t.Fatalf("expected ErrLanguageServerNotConfigured, got %v", err)
	}
	if restartCalls != 0 {
		t.Fatalf("expected restart callback to be skipped, got %d calls", restartCalls)
	}
	if service.commitCalls != 0 {
		t.Fatalf("expected commit to be skipped, got %d calls", service.commitCalls)
	}
	if len(router.replacedSpecs) != 0 {
		t.Fatalf("expected no spec replacement when restart is rejected, got %#v", router.replacedSpecs)
	}
	if !reflect.DeepEqual(refresher.lspSpecs, currentSpecs) {
		t.Fatalf("expected applied specs to remain unchanged, got %#v", refresher.lspSpecs)
	}
}

func TestPluginBackendRuntimeRefresherRestartProjectAllowsExplicitDisableWithoutNextSpec(t *testing.T) {
	t.Parallel()

	settingsRuntime := newDefaultsProfileSettingsRuntime(t)
	t.Cleanup(func() {
		if err := settingsRuntime.Close(); err != nil {
			t.Fatalf("close settings runtime: %v", err)
		}
	})
	if _, err := settingsRuntime.MutateAndSave(context.Background(), func(document settingsstate.Document) (settingsstate.Document, error) {
		document["languageServer"] = map[string]any{
			"selectedByLanguage": map[string]any{
				"python": nil,
			},
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed settings runtime: %v", err)
	}

	currentSpecs := []lsp.LanguageServerSpec{fixtureRefresherLanguageServerSpec()}
	service := &stubPluginBackendRefreshService{
		previewSnapshot: plugins.DiscoverySnapshot{},
		nextSpecs:       nil,
	}
	router := &stubPluginBackendLanguageServerReplacer{}
	refresher := &pluginBackendRuntimeRefresher{
		service:   service,
		settings:  settingsRuntime,
		lspRouter: router,
		lspSpecs:  lsp.CloneLanguageServerSpecs(currentSpecs),
	}

	restartCalls := 0
	err := refresher.RestartProject(
		context.Background(),
		fixtureRestartProjectDocument(t, projectstate.CodeLanguagePython),
		func(context.Context) error {
			restartCalls++
			return nil
		},
	)
	if err != nil {
		t.Fatalf("expected explicit disable restart to succeed, got %v", err)
	}
	if restartCalls != 1 {
		t.Fatalf("expected one restart callback, got %d calls", restartCalls)
	}
	if service.commitCalls != 1 {
		t.Fatalf("expected commit after explicit disable, got %d calls", service.commitCalls)
	}
	if len(refresher.lspSpecs) != 0 {
		t.Fatalf("expected applied specs to be cleared, got %#v", refresher.lspSpecs)
	}
	if len(router.replacedSpecs) != 1 {
		t.Fatalf("expected one spec replacement, got %#v", router.replacedSpecs)
	}
	if len(router.replacedSpecs[0]) != 0 {
		t.Fatalf("expected restart to apply zero specs, got %#v", router.replacedSpecs[0])
	}
}

func fixtureRestartProjectDocument(t *testing.T, language projectstate.CodeLanguage) projectstate.Document {
	t.Helper()

	document, err := projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
				SectionVariantMap: map[string]string{
					"runner": "runner-variant",
				},
				Sections: map[string]projectstate.Section{
					"runner": {
						ID:               "runner",
						Name:             "Runner",
						VariantIDs:       []string{"runner-variant"},
						DefaultVariantID: "runner-variant",
					},
				},
				SectionVariants: map[string]projectstate.SectionVariant{
					"runner-variant": {
						ID:     "runner-variant",
						ImplID: "runner-impl",
					},
				},
				SectionImpls: map[string]projectstate.SectionImpl{
					"runner-impl": {
						ID:   "runner-impl",
						Kind: projectstate.SectionKindCode,
						Payload: mustRestartProjectJSON(t, map[string]any{
							"id":           "runner-impl",
							"type":         "Code",
							"code":         "print('runner')\n",
							"codeLanguage": string(language),
							"children":     []string{},
						}),
						Code: &projectstate.CodeSectionImpl{
							Language: language,
							Binding: &projectstate.CodeFileBinding{
								Path:       fmt.Sprintf("code/runner-%s.txt", language),
								AccessMode: projectstate.CodeFileAccessModeReadWrite,
							},
						},
					},
				},
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize restart project document: %v", err)
	}
	return document
}

func mustRestartProjectJSON(t *testing.T, value map[string]any) projectstate.RawJSON {
	t.Helper()

	payload, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal restart project payload: %v", err)
	}
	return projectstate.RawJSON(payload)
}

type stubPluginBackendRefreshService struct {
	previewSnapshot plugins.DiscoverySnapshot
	nextSpecs       []lsp.LanguageServerSpec
	commitCalls     int
}

func (s *stubPluginBackendRefreshService) Rescan() (plugins.DiscoverySnapshot, error) {
	return s.previewSnapshot, nil
}

func (s *stubPluginBackendRefreshService) PreviewBackendRuntimeRefresh() (plugins.DiscoverySnapshot, error) {
	return s.previewSnapshot, nil
}

func (s *stubPluginBackendRefreshService) CommitBackendRuntimeRefresh() (plugins.DiscoverySnapshot, error) {
	s.commitCalls++
	return s.previewSnapshot, nil
}

func (s *stubPluginBackendRefreshService) LanguageServerSpecsForSnapshot(
	plugins.DiscoverySnapshot,
	map[string]*string,
) ([]lsp.LanguageServerSpec, error) {
	return lsp.CloneLanguageServerSpecs(s.nextSpecs), nil
}

type stubPluginBackendLanguageServerReplacer struct {
	replacedSpecs [][]lsp.LanguageServerSpec
}

func (s *stubPluginBackendLanguageServerReplacer) ReplaceAdditionalSpecs(_ context.Context, specs []lsp.LanguageServerSpec) error {
	s.replacedSpecs = append(s.replacedSpecs, lsp.CloneLanguageServerSpecs(specs))
	return nil
}

func fixtureRefresherLanguageServerSpec() lsp.LanguageServerSpec {
	settingsKey := "basedpyright"
	return lsp.LanguageServerSpec{
		PluginID:   "setta-basedpyright",
		Name:       "basedpyright",
		LanguageID: "python",
		Command:    "python",
		Args:       []string{"-c", "print('fixture')"},
		Settings: map[string]any{
			"basedpyright": map[string]any{
				"analysis": map[string]any{
					"severityOverrides": map[string]any{
						"reportUnusedCallResult": "warning",
					},
				},
			},
		},
		SettingsKey: &settingsKey,
	}
}
