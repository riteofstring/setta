package plugins

import "strings"

const (
	DefaultsInstallProfileID      = "defaults"
	DefaultsInstallProfileVersion = 2
)

type InstallProfile struct {
	ID                             string
	Version                        int
	PackageSpecs                   []string
	LanguageServerPluginByLanguage map[string]string
}

func DefaultsInstallProfile() InstallProfile {
	return InstallProfile{
		ID:      DefaultsInstallProfileID,
		Version: DefaultsInstallProfileVersion,
		PackageSpecs: []string{
			"setta-basedpyright==0.1.0",
		},
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
		if !hasAvailableProfilePlugin(snapshot.Plugins, pluginID, language) {
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

func hasAvailableProfilePlugin(entries []DiscoveredPlugin, pluginID string, language string) bool {
	for _, entry := range entries {
		if strings.TrimSpace(entry.PluginID) != pluginID {
			continue
		}
		if !profileEntryProvidesLanguageServer(entry, language) {
			continue
		}
		return true
	}
	return false
}

func profileEntryProvidesLanguageServer(entry DiscoveredPlugin, language string) bool {
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
