package app

import (
	"context"
	"reflect"
	"testing"

	"setta/internal/lsp"
	"setta/internal/plugins"
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

type stubPluginBackendRefreshService struct {
	previewSnapshot plugins.DiscoverySnapshot
	nextSpecs       []lsp.LanguageServerSpec
}

func (s *stubPluginBackendRefreshService) Rescan() (plugins.DiscoverySnapshot, error) {
	return s.previewSnapshot, nil
}

func (s *stubPluginBackendRefreshService) PreviewBackendRuntimeRefresh() (plugins.DiscoverySnapshot, error) {
	return s.previewSnapshot, nil
}

func (s *stubPluginBackendRefreshService) CommitBackendRuntimeRefresh() (plugins.DiscoverySnapshot, error) {
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
