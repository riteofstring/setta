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
		entry, ok := findPrimaryDiscoveredPluginForSourceManager(
			snapshot.Plugins,
			pluginID,
			PluginSourceManagerPackageManager,
		)
		if !ok || !profileEntryProvidesLanguageServer(entry, language) {
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

func profileEntryProvidesLanguageServer(entry DiscoveredPlugin, language string) bool {
	if entry.SourceManager != PluginSourceManagerPackageManager {
		return false
	}
	if entry.Manifest == nil {
		return false
	}
	switch entry.State {
	case PluginRuntimeStateActive, PluginRuntimeStatePendingRestart, PluginRuntimeStateShadowed:
	default:
		return false
	}
	if !containsString(entry.EffectiveCapabilities, "registerLanguageServer") {
		if entry.State == PluginRuntimeStateShadowed {
			return true
		}
		return false
	}
	if len(entry.RegisteredLanguageServers) == 0 {
		return entry.State == PluginRuntimeStateShadowed
	}
	for _, registration := range entry.RegisteredLanguageServers {
		if normalizeProfileLanguage(registration.Language) == language {
			return true
		}
	}
	return false
}
