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
	return s.languageServerSpecsForSnapshotLocked(snapshot, selectedByLanguage, true)
}

func (s *Service) LanguageServerSpecsForSnapshot(snapshot DiscoverySnapshot, selectedByLanguage map[string]*string) ([]lsp.LanguageServerSpec, error) {
	return s.languageServerSpecsForSnapshot(snapshot, selectedByLanguage, true)
}

func (s *Service) ActiveLanguageServerSpecsForSnapshot(snapshot DiscoverySnapshot, selectedByLanguage map[string]*string) ([]lsp.LanguageServerSpec, error) {
	return s.languageServerSpecsForSnapshot(snapshot, selectedByLanguage, false)
}

func (s *Service) languageServerSpecsForSnapshot(
	snapshot DiscoverySnapshot,
	selectedByLanguage map[string]*string,
	includePendingLanguageServerOnly bool,
) ([]lsp.LanguageServerSpec, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	return s.languageServerSpecsForSnapshotLocked(snapshot, selectedByLanguage, includePendingLanguageServerOnly)
}

func (s *Service) languageServerSpecsForSnapshotLocked(
	snapshot DiscoverySnapshot,
	selectedByLanguage map[string]*string,
	includePendingLanguageServerOnly bool,
) ([]lsp.LanguageServerSpec, error) {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return nil, err
	}
	return languageServerSpecsFromSnapshotWithState(
		snapshot,
		&state,
		selectedByLanguage,
		s.settaFilesRoot,
		includePendingLanguageServerOnly,
	)
}

func LanguageServerSpecsFromSnapshot(snapshot DiscoverySnapshot, selectedByLanguage map[string]*string) ([]lsp.LanguageServerSpec, error) {
	return languageServerSpecsFromSnapshotWithState(snapshot, nil, selectedByLanguage, "", true)
}

func languageServerSpecsFromSnapshotWithState(
	snapshot DiscoverySnapshot,
	pluginsState *PluginsStateFile,
	selectedByLanguage map[string]*string,
	settaFilesRoot string,
	includePendingLanguageServerOnly bool,
) ([]lsp.LanguageServerSpec, error) {
	registrations, err := languageServerSpecsFromEntries(
		snapshot.Plugins,
		pluginsState,
		settaFilesRoot,
		includePendingLanguageServerOnly,
	)
	if err != nil {
		return nil, err
	}
	return selectedLanguageServerSpecs(registrations, selectedByLanguage), nil
}

func languageServerSpecsFromEntries(
	entries []DiscoveredPlugin,
	pluginsState *PluginsStateFile,
	settaFilesRoot string,
	includePendingLanguageServerOnly bool,
) ([]lsp.LanguageServerSpec, error) {
	normalizedSettaFilesRoot := strings.TrimSpace(settaFilesRoot)
	specs := make([]lsp.LanguageServerSpec, 0)
	for _, entry := range entries {
		if !pluginProvidesLanguageServer(entry, includePendingLanguageServerOnly) {
			continue
		}
		for _, registration := range entry.RegisteredLanguageServers {
			spec, language, err := buildLanguageServerSpec(entries, entry, registration, pluginsState, normalizedSettaFilesRoot)
			if err != nil {
				return nil, err
			}
			spec.LanguageID = language
			specs = append(specs, spec)
		}
	}
	sortLanguageServerSpecs(specs)
	return specs, nil
}

func pluginProvidesLanguageServer(entry DiscoveredPlugin, includePendingLanguageServerOnly bool) bool {
	if entry.Manifest == nil || !containsString(entry.EffectiveCapabilities, "registerLanguageServer") {
		return false
	}
	if entry.State == PluginRuntimeStateActive {
		return true
	}
	return includePendingLanguageServerOnly &&
		entry.State == PluginRuntimeStatePendingRestart &&
		entryHasLanguageServerOnlyBackendRuntime(entry)
}

func buildLanguageServerSpec(
	entries []DiscoveredPlugin,
	entry DiscoveredPlugin,
	registration PluginRegisteredLanguageServer,
	pluginsState *PluginsStateFile,
	settaFilesRoot string,
) (lsp.LanguageServerSpec, string, error) {
	language := strings.ToLower(strings.TrimSpace(registration.Language))
	if language == "" {
		return lsp.LanguageServerSpec{}, "", fmt.Errorf("plugin language server language is required")
	}
	settings := languageServerSettingsWithRuntimePaths(entries, entry, registration, pluginsState, settaFilesRoot)
	if settings == nil {
		settings = map[string]any{}
	}
	return lsp.LanguageServerSpec{
		PluginID:    strings.TrimSpace(registration.PluginID),
		Name:        strings.TrimSpace(registration.Name),
		LanguageID:  language,
		Command:     strings.TrimSpace(registration.Command),
		Args:        append([]string(nil), registration.Args...),
		Settings:    settings,
		SettingsKey: cloneOptionalString(registration.SettingsKey),
	}, language, nil
}

func languageServerSettingsWithRuntimePaths(
	entries []DiscoveredPlugin,
	entry DiscoveredPlugin,
	registration PluginRegisteredLanguageServer,
	pluginsState *PluginsStateFile,
	settaFilesRoot string,
) map[string]any {
	settings := languageServerSettingsRoot(entries, entry, pluginsState)
	if isFirstPartyBasedpyrightRegistration(entry, registration) {
		normalizedSettaFilesRoot := strings.TrimSpace(settaFilesRoot)
		if normalizedSettaFilesRoot != "" {
			if settings == nil {
				settings = map[string]any{}
			} else {
				settings = cloneStringAnyMap(settings)
			}

			basedpyright := ensureSettingsMap(settings, "basedpyright")
			analysis := ensureSettingsMap(basedpyright, "analysis")
			analysis["extraPaths"] = stringSliceToAnySlice(
				mergeUniqueSettingPaths(analysis["extraPaths"], normalizedSettaFilesRoot),
			)
		}
	}
	return scopeLanguageServerSettings(settings, registration.SettingsKey)
}

func isFirstPartyBasedpyrightRegistration(entry DiscoveredPlugin, registration PluginRegisteredLanguageServer) bool {
	if strings.TrimSpace(entry.PluginID) != "setta-basedpyright" {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(registration.Language), "python")
}

func ensureSettingsMap(parent map[string]any, key string) map[string]any {
	if parent == nil {
		return map[string]any{}
	}
	if existing, ok := parent[key].(map[string]any); ok {
		cloned := cloneStringAnyMap(existing)
		parent[key] = cloned
		return cloned
	}
	child := map[string]any{}
	parent[key] = child
	return child
}

func scopeLanguageServerSettings(settings map[string]any, settingsKey *string) map[string]any {
	if settingsKey == nil {
		return settings
	}

	segments := parseLanguageServerSettingsKey(*settingsKey)
	if len(segments) == 0 {
		return nil
	}

	current := settings
	for index, segment := range segments {
		value, ok := current[segment]
		if !ok {
			return nil
		}
		if index == len(segments)-1 {
			currentMap, ok := value.(map[string]any)
			if !ok {
				return nil
			}
			return wrapLanguageServerSettingsBranch(segments, currentMap)
		}
		next, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		current = next
	}
	return nil
}

func parseLanguageServerSettingsKey(key string) []string {
	segments := strings.Split(strings.TrimSpace(key), ".")
	filtered := make([]string, 0, len(segments))
	for _, segment := range segments {
		trimmed := strings.TrimSpace(segment)
		if trimmed != "" {
			filtered = append(filtered, trimmed)
		}
	}
	return filtered
}

func wrapLanguageServerSettingsBranch(segments []string, settings map[string]any) map[string]any {
	wrapped := cloneStringAnyMap(settings)
	for index := len(segments) - 1; index >= 0; index-- {
		wrapped = map[string]any{segments[index]: wrapped}
	}
	return wrapped
}

func mergeUniqueSettingPaths(existing any, required ...string) []string {
	merged := readSettingPaths(existing)
	seen := map[string]struct{}{}
	for _, path := range merged {
		seen[path] = struct{}{}
	}
	for _, rawPath := range required {
		trimmed := strings.TrimSpace(rawPath)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		merged = append(merged, trimmed)
		seen[trimmed] = struct{}{}
	}
	return merged
}

func readSettingPaths(value any) []string {
	switch typed := value.(type) {
	case []string:
		paths := make([]string, 0, len(typed))
		for _, path := range typed {
			trimmed := strings.TrimSpace(path)
			if trimmed != "" {
				paths = append(paths, trimmed)
			}
		}
		return paths
	case []any:
		paths := make([]string, 0, len(typed))
		for _, entry := range typed {
			text, ok := entry.(string)
			if !ok {
				continue
			}
			trimmed := strings.TrimSpace(text)
			if trimmed != "" {
				paths = append(paths, trimmed)
			}
		}
		return paths
	default:
		return nil
	}
}

func stringSliceToAnySlice(values []string) []any {
	if len(values) == 0 {
		return nil
	}
	converted := make([]any, 0, len(values))
	for _, value := range values {
		converted = append(converted, value)
	}
	return converted
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
