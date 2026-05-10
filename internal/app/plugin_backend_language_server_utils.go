package app

import (
	"context"
	"encoding/json"
	"reflect"
	"slices"
	"strings"

	"setta/internal/lsp"
	"setta/internal/plugins"
)

func findPluginInScope(entries []plugins.DiscoveredPlugin, pluginID string, scope plugins.PluginScope) (plugins.DiscoveredPlugin, bool) {
	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.Scope == scope {
			return entry, true
		}
	}
	return plugins.DiscoveredPlugin{}, false
}

func cloneOptionalDigest(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := strings.TrimSpace(*value)
	return &cloned
}

func cloneLanguageServerSpecs(specs []lsp.LanguageServerSpec) []lsp.LanguageServerSpec {
	if len(specs) == 0 {
		return nil
	}
	cloned := make([]lsp.LanguageServerSpec, 0, len(specs))
	for _, spec := range specs {
		cloned = append(cloned, lsp.LanguageServerSpec{
			PluginID:                 spec.PluginID,
			Name:                     spec.Name,
			LanguageID:               spec.LanguageID,
			Command:                  spec.Command,
			Args:                     append([]string(nil), spec.Args...),
			Environment:              clonePluginLanguageServerEnvironment(spec.Environment),
			Settings:                 clonePluginLanguageServerSettings(spec.Settings),
			SettingsKey:              cloneOptionalString(spec.SettingsKey),
			PluginSourceScope:        spec.PluginSourceScope,
			PluginSourceManager:      spec.PluginSourceManager,
			PluginCanonicalSourceKey: spec.PluginCanonicalSourceKey,
			PluginSourcePath:         spec.PluginSourcePath,
			PluginSourceDigestSHA256: cloneOptionalString(spec.PluginSourceDigestSHA256),
		})
	}
	return cloned
}

func languageServerSpecSlicesEqual(left []lsp.LanguageServerSpec, right []lsp.LanguageServerSpec) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if !lspLanguageServerSpecsEqual(left[index], right[index]) {
			return false
		}
	}
	return true
}

func lspLanguageServerSpecsEqual(left lsp.LanguageServerSpec, right lsp.LanguageServerSpec) bool {
	if !lspLanguageServerSpecScalarFieldsEqual(left, right) {
		return false
	}
	if !slices.Equal(left.Args, right.Args) {
		return false
	}
	if !languageServerEnvironmentEqual(left.Environment, right.Environment) {
		return false
	}
	if !languageServerSettingsEqual(left.Settings, right.Settings) {
		return false
	}
	return optionalStringPointersEqual(left.SettingsKey, right.SettingsKey) &&
		optionalStringPointersEqual(left.PluginSourceDigestSHA256, right.PluginSourceDigestSHA256)
}

func lspLanguageServerSpecScalarFieldsEqual(left lsp.LanguageServerSpec, right lsp.LanguageServerSpec) bool {
	return left.PluginID == right.PluginID &&
		left.Name == right.Name &&
		left.LanguageID == right.LanguageID &&
		left.Command == right.Command &&
		left.PluginSourceScope == right.PluginSourceScope &&
		left.PluginSourceManager == right.PluginSourceManager &&
		left.PluginCanonicalSourceKey == right.PluginCanonicalSourceKey &&
		left.PluginSourcePath == right.PluginSourcePath
}

func clonePluginLanguageServerEnvironment(source map[string]string) map[string]string {
	if source == nil {
		return nil
	}
	cloned := make(map[string]string, len(source))
	for key, value := range source {
		normalizedKey := strings.TrimSpace(key)
		if normalizedKey == "" {
			continue
		}
		cloned[normalizedKey] = value
	}
	if len(cloned) == 0 {
		return nil
	}
	return cloned
}

func languageServerEnvironmentEqual(left map[string]string, right map[string]string) bool {
	return reflect.DeepEqual(
		clonePluginLanguageServerEnvironment(left),
		clonePluginLanguageServerEnvironment(right),
	)
}

func languageServerSettingsEqual(left map[string]any, right map[string]any) bool {
	return reflect.DeepEqual(
		clonePluginLanguageServerSettings(left),
		clonePluginLanguageServerSettings(right),
	)
}

func optionalStringPointersEqual(left *string, right *string) bool {
	switch {
	case left == nil && right == nil:
		return true
	case left == nil || right == nil:
		return false
	default:
		return *left == *right
	}
}

func selectedLanguageServerPluginIDsFromSelections(selections map[string]*string) []string {
	selectedPluginIDs := make([]string, 0, len(selections))
	for _, pluginID := range selections {
		if pluginID == nil {
			continue
		}
		selectedPluginIDs = append(selectedPluginIDs, *pluginID)
	}
	return uniqueSortedStrings(selectedPluginIDs)
}

func appliedLanguageServerLanguagesByPlugin(specs []lsp.LanguageServerSpec) map[string][]string {
	if len(specs) == 0 {
		return nil
	}
	byPlugin := map[string][]string{}
	for _, spec := range specs {
		pluginID := strings.TrimSpace(spec.PluginID)
		languageID := strings.ToLower(strings.TrimSpace(spec.LanguageID))
		if pluginID == "" || languageID == "" {
			continue
		}
		if slices.Contains(byPlugin[pluginID], languageID) {
			continue
		}
		byPlugin[pluginID] = append(byPlugin[pluginID], languageID)
	}
	for pluginID := range byPlugin {
		slices.Sort(byPlugin[pluginID])
	}
	return byPlugin
}

func appliedLanguageServerPluginIDs(specs []lsp.LanguageServerSpec) []string {
	byPlugin := appliedLanguageServerLanguagesByPlugin(specs)
	if len(byPlugin) == 0 {
		return nil
	}

	pluginIDs := make([]string, 0, len(byPlugin))
	for pluginID := range byPlugin {
		pluginIDs = append(pluginIDs, pluginID)
	}
	slices.Sort(pluginIDs)
	return pluginIDs
}

func mergeUniqueSortedStrings(values ...[]string) []string {
	merged := make([]string, 0)
	for _, entries := range values {
		merged = append(merged, entries...)
	}
	return uniqueSortedStrings(merged)
}

func uniqueSortedStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	set := map[string]struct{}{}
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := set[trimmed]; ok {
			continue
		}
		set[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}
	if len(normalized) == 0 {
		return nil
	}
	slices.Sort(normalized)
	return normalized
}

func refreshedAppliedLanguageServerSpecs(
	applied []lsp.LanguageServerSpec,
	selected []lsp.LanguageServerSpec,
	pluginID string,
) []lsp.LanguageServerSpec {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return cloneLanguageServerSpecs(applied)
	}

	selectedByLanguage := map[string]lsp.LanguageServerSpec{}
	for _, spec := range selected {
		if strings.TrimSpace(spec.PluginID) != trimmedPluginID {
			continue
		}
		languageID := strings.ToLower(strings.TrimSpace(spec.LanguageID))
		if languageID == "" {
			continue
		}
		selectedByLanguage[languageID] = spec
	}

	next := make([]lsp.LanguageServerSpec, 0, len(applied))
	for _, spec := range applied {
		specPluginID := strings.TrimSpace(spec.PluginID)
		if specPluginID != trimmedPluginID {
			next = append(next, spec)
			continue
		}
		languageID := strings.ToLower(strings.TrimSpace(spec.LanguageID))
		updated, ok := selectedByLanguage[languageID]
		if !ok || !languageServerSpecsShareImplementation(spec, updated) {
			next = append(next, spec)
			continue
		}
		next = append(next, updated)
	}
	return next
}

func appliedLanguageServerStatusesByPlugin(specs []lsp.LanguageServerSpec) map[string]appliedLanguageServerStatus {
	if len(specs) == 0 {
		return nil
	}
	byPlugin := map[string]appliedLanguageServerStatus{}
	for _, spec := range specs {
		pluginID := strings.TrimSpace(spec.PluginID)
		languageID := strings.ToLower(strings.TrimSpace(spec.LanguageID))
		if pluginID == "" || languageID == "" {
			continue
		}
		applied := byPlugin[pluginID]
		if strings.TrimSpace(applied.spec.PluginID) == "" {
			applied.spec = spec
		}
		if slices.Contains(applied.languages, languageID) {
			byPlugin[pluginID] = applied
			continue
		}
		applied.languages = append(applied.languages, languageID)
		slices.Sort(applied.languages)
		byPlugin[pluginID] = applied
	}
	if len(byPlugin) == 0 {
		return nil
	}
	return byPlugin
}

func languageServerSpecsShareImplementation(left lsp.LanguageServerSpec, right lsp.LanguageServerSpec) bool {
	if strings.TrimSpace(left.PluginID) != strings.TrimSpace(right.PluginID) {
		return false
	}
	if !languageServerSpecHasImplementationMetadata(left) || !languageServerSpecHasImplementationMetadata(right) {
		return true
	}
	return strings.TrimSpace(left.PluginSourceScope) == strings.TrimSpace(right.PluginSourceScope) &&
		strings.TrimSpace(left.PluginSourceManager) == strings.TrimSpace(right.PluginSourceManager) &&
		strings.TrimSpace(left.PluginCanonicalSourceKey) == strings.TrimSpace(right.PluginCanonicalSourceKey) &&
		strings.TrimSpace(left.PluginSourcePath) == strings.TrimSpace(right.PluginSourcePath)
}

func languageServerSpecMatchesStatusEntry(spec lsp.LanguageServerSpec, entry plugins.PluginStatusEntry) bool {
	if strings.TrimSpace(spec.PluginID) != strings.TrimSpace(entry.PluginID) {
		return false
	}
	if !languageServerSpecHasImplementationMetadata(spec) {
		return true
	}
	return strings.TrimSpace(spec.PluginSourceScope) == strings.TrimSpace(string(entry.SourceScope)) &&
		strings.TrimSpace(spec.PluginSourceManager) == strings.TrimSpace(string(entry.SourceManager)) &&
		strings.TrimSpace(spec.PluginCanonicalSourceKey) == strings.TrimSpace(entry.CanonicalSourceKey) &&
		strings.TrimSpace(spec.PluginSourcePath) == strings.TrimSpace(entry.SourcePath)
}

func languageServerSpecHasImplementationMetadata(spec lsp.LanguageServerSpec) bool {
	return strings.TrimSpace(spec.PluginSourceScope) != "" ||
		strings.TrimSpace(spec.PluginSourceManager) != "" ||
		strings.TrimSpace(spec.PluginCanonicalSourceKey) != "" ||
		strings.TrimSpace(spec.PluginSourcePath) != "" ||
		spec.PluginSourceDigestSHA256 != nil
}

func clonePluginLanguageServerSettings(settings map[string]any) map[string]any {
	if settings == nil {
		return nil
	}
	payload, err := json.Marshal(settings)
	if err != nil {
		return nil
	}
	var cloned map[string]any
	if err := json.Unmarshal(payload, &cloned); err != nil {
		return nil
	}
	return cloned
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := strings.TrimSpace(*value)
	return &cloned
}

func closePluginBackendRuntime(runtime *pluginBackendMCPRuntime) {
	if runtime == nil {
		return
	}
	_ = runtime.Close(context.Background())
}
