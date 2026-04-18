package plugins

import "strings"

const (
	DefaultsInstallProfileID      = "defaults"
	DefaultsInstallProfileVersion = 1
)

type InstallProfile struct {
	ID                             string
	Version                        int
	LanguageServerPluginByLanguage map[string]string
}

func DefaultsInstallProfile() InstallProfile {
	return InstallProfile{
		ID:      DefaultsInstallProfileID,
		Version: DefaultsInstallProfileVersion,
		LanguageServerPluginByLanguage: map[string]string{
			"python": "setta-basedpyright",
		},
	}
}

func (p InstallProfile) AvailableLanguageServerSelections(snapshot DiscoverySnapshot) map[string]string {
	if len(p.LanguageServerPluginByLanguage) == 0 || len(snapshot.Plugins) == 0 {
		return map[string]string{}
	}

	selected := make(map[string]string, len(p.LanguageServerPluginByLanguage))
	for rawLanguage, rawPluginID := range p.LanguageServerPluginByLanguage {
		language := normalizeProfileLanguage(rawLanguage)
		pluginID := strings.TrimSpace(rawPluginID)
		if language == "" || pluginID == "" {
			continue
		}
		if !defaultsProfileSelectionAvailable(snapshot.Plugins, language, pluginID) {
			continue
		}
		selected[language] = pluginID
	}
	if len(selected) == 0 {
		return map[string]string{}
	}
	return selected
}

func normalizeProfileLanguage(language string) string {
	return strings.ToLower(strings.TrimSpace(language))
}

func defaultsProfileSelectionAvailable(entries []DiscoveredPlugin, language string, pluginID string) bool {
	packageManagerEntry, ok := findPrimaryDiscoveredPluginForSourceManager(
		entries,
		pluginID,
		PluginSourceManagerPackageManager,
	)
	if !ok || !packageManagerDefaultsCandidate(packageManagerEntry, language) {
		return false
	}

	effectiveEntry, ok := findPrimaryDiscoveredPlugin(entries, pluginID)
	if !ok {
		return false
	}
	return activeEntryProvidesLanguageServer(effectiveEntry, language)
}

func packageManagerDefaultsCandidate(entry DiscoveredPlugin, language string) bool {
	if entry.SourceManager != PluginSourceManagerPackageManager {
		return false
	}
	if entry.Manifest == nil {
		return false
	}
	switch entry.State {
	case PluginRuntimeStateShadowed:
		return true
	case PluginRuntimeStateActive:
		return activeEntryProvidesLanguageServer(entry, language)
	default:
		return false
	}
}

func activeEntryProvidesLanguageServer(entry DiscoveredPlugin, language string) bool {
	if !pluginProvidesLanguageServer(entry) {
		return false
	}
	for _, registration := range entry.RegisteredLanguageServers {
		if normalizeProfileLanguage(registration.Language) == language {
			return true
		}
	}
	return false
}
