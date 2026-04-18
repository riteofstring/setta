package plugins

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"setta/internal/lsp"
)

func (s *Service) LanguageServerSpecs(_ context.Context, selectedByLanguage map[string]*string) ([]lsp.LanguageServerSpec, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return nil, err
	}
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return nil, err
	}
	return languageServerSpecsFromSnapshotWithState(snapshot, &state, selectedByLanguage, s.store.settaFilesRoot)
}

func (s *Service) LanguageServerSpecsForSnapshot(snapshot DiscoverySnapshot, selectedByLanguage map[string]*string) ([]lsp.LanguageServerSpec, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return nil, err
	}
	return languageServerSpecsFromSnapshotWithState(snapshot, &state, selectedByLanguage, s.store.settaFilesRoot)
}

func languageServerSpecsFromSnapshotWithState(snapshot DiscoverySnapshot, pluginsState *PluginsStateFile, selectedByLanguage map[string]*string, settaFilesRoot string) ([]lsp.LanguageServerSpec, error) {
	registrations, err := languageServerSpecsFromEntries(snapshot.Plugins, pluginsState, settaFilesRoot)
	if err != nil {
		return nil, err
	}
	return selectedLanguageServerSpecs(registrations, selectedByLanguage), nil
}

func languageServerSpecsFromEntries(entries []DiscoveredPlugin, pluginsState *PluginsStateFile, settaFilesRoot string) ([]lsp.LanguageServerSpec, error) {
	collector := languageServerSpecCollector{
		specs: make([]lsp.LanguageServerSpec, 0),
	}
	for _, entry := range entries {
		if err := collector.addEntry(entry, pluginsState, settaFilesRoot); err != nil {
			return nil, err
		}
	}
	sortLanguageServerSpecs(collector.specs)
	return collector.specs, nil
}

type languageServerSpecCollector struct {
	specs []lsp.LanguageServerSpec
}

func (c *languageServerSpecCollector) addEntry(entry DiscoveredPlugin, pluginsState *PluginsStateFile, settaFilesRoot string) error {
	if !pluginProvidesLanguageServer(entry) {
		return nil
	}
	for _, registration := range entry.RegisteredLanguageServers {
		spec, language, err := buildLanguageServerSpec(entry, registration, pluginsState, settaFilesRoot)
		if err != nil {
			return err
		}
		spec.LanguageID = language
		c.specs = append(c.specs, spec)
	}
	return nil
}

func pluginProvidesLanguageServer(entry DiscoveredPlugin) bool {
	if entry.Manifest == nil {
		return false
	}
	if entry.State != PluginRuntimeStateActive {
		return false
	}
	return containsString(entry.EffectiveCapabilities, "registerLanguageServer")
}

func buildLanguageServerSpec(entry DiscoveredPlugin, registration PluginRegisteredLanguageServer, pluginsState *PluginsStateFile, settaFilesRoot string) (lsp.LanguageServerSpec, string, error) {
	language := strings.ToLower(strings.TrimSpace(registration.Language))
	if language == "" {
		return lsp.LanguageServerSpec{}, "", fmt.Errorf("plugin language server language is required")
	}
	settingsKey := cloneOptionalString(registration.SettingsKey)
	settings := languageServerSettingsRoot(entry, pluginsState)
	if language == "python" && settingsKey != nil && *settingsKey == "basedpyright" {
		settings = lsp.BuildBasedpyrightSettingsRoot(settings, []string{settaFilesRoot})
	}
	return lsp.LanguageServerSpec{
		PluginID:    strings.TrimSpace(registration.PluginID),
		Name:        strings.TrimSpace(registration.Name),
		LanguageID:  language,
		Command:     strings.TrimSpace(registration.Command),
		Args:        append([]string(nil), registration.Args...),
		Settings:    settings,
		SettingsKey: settingsKey,
	}, language, nil
}

func sortLanguageServerSpecs(specs []lsp.LanguageServerSpec) {
	slices.SortFunc(specs, func(left lsp.LanguageServerSpec, right lsp.LanguageServerSpec) int {
		if left.LanguageID < right.LanguageID {
			return -1
		}
		if left.LanguageID > right.LanguageID {
			return 1
		}
		if left.PluginID < right.PluginID {
			return -1
		}
		if left.PluginID > right.PluginID {
			return 1
		}
		if left.Name < right.Name {
			return -1
		}
		if left.Name > right.Name {
			return 1
		}
		return 0
	})
}

func selectedLanguageServerSpecs(specs []lsp.LanguageServerSpec, selectedByLanguage map[string]*string) []lsp.LanguageServerSpec {
	if len(specs) == 0 || len(selectedByLanguage) == 0 {
		return []lsp.LanguageServerSpec{}
	}

	specsByLanguageAndPlugin := map[string]map[string]lsp.LanguageServerSpec{}
	for _, spec := range specs {
		language := strings.ToLower(strings.TrimSpace(spec.LanguageID))
		pluginID := strings.TrimSpace(spec.PluginID)
		if language == "" || pluginID == "" {
			continue
		}
		if specsByLanguageAndPlugin[language] == nil {
			specsByLanguageAndPlugin[language] = map[string]lsp.LanguageServerSpec{}
		}
		specsByLanguageAndPlugin[language][pluginID] = spec
	}

	selectedSpecs := make([]lsp.LanguageServerSpec, 0, len(selectedByLanguage))
	for rawLanguage, selectedPluginID := range selectedByLanguage {
		if selectedPluginID == nil {
			continue
		}
		language := strings.ToLower(strings.TrimSpace(rawLanguage))
		pluginID := strings.TrimSpace(*selectedPluginID)
		if language == "" || pluginID == "" {
			continue
		}
		spec, ok := specsByLanguageAndPlugin[language][pluginID]
		if !ok {
			continue
		}
		selectedSpecs = append(selectedSpecs, spec)
	}
	sortLanguageServerSpecs(selectedSpecs)
	return selectedSpecs
}
