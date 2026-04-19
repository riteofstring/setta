package plugins

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"setta/internal/lsp"
)

var ErrRegisteredLanguageServerConflict = errors.New("plugin language server registration is ambiguous")

func (s *Service) LanguageServerSpecs(_ context.Context) ([]lsp.LanguageServerSpec, error) {
	if s == nil {
		return nil, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return nil, err
	}
	return LanguageServerSpecsFromSnapshot(snapshot)
}

func LanguageServerSpecsFromSnapshot(snapshot DiscoverySnapshot) ([]lsp.LanguageServerSpec, error) {
	return languageServerSpecsFromEntries(snapshot.Plugins)
}

func languageServerSpecsFromEntries(entries []DiscoveredPlugin) ([]lsp.LanguageServerSpec, error) {
	collector := languageServerSpecCollector{
		specs:      make([]lsp.LanguageServerSpec, 0),
		byLanguage: map[string]string{},
	}
	for _, entry := range entries {
		if err := collector.addEntry(entry); err != nil {
			return nil, err
		}
	}
	sortLanguageServerSpecs(collector.specs)
	return collector.specs, nil
}

type languageServerSpecCollector struct {
	specs      []lsp.LanguageServerSpec
	byLanguage map[string]string
}

func (c *languageServerSpecCollector) addEntry(entry DiscoveredPlugin) error {
	if !pluginProvidesLanguageServer(entry) {
		return nil
	}
	for _, registration := range entry.RegisteredLanguageServers {
		spec, language, err := buildLanguageServerSpec(registration)
		if err != nil {
			return err
		}
		if err := c.claimLanguage(language, entry.PluginID); err != nil {
			return err
		}
		c.specs = append(c.specs, spec)
	}
	return nil
}

func pluginProvidesLanguageServer(entry DiscoveredPlugin) bool {
	if entry.Manifest == nil {
		return false
	}
	if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
		return false
	}
	return containsString(entry.EffectiveCapabilities, "registerLanguageServer")
}

func buildLanguageServerSpec(registration PluginRegisteredLanguageServer) (lsp.LanguageServerSpec, string, error) {
	language := strings.ToLower(strings.TrimSpace(registration.Language))
	if language == "" {
		return lsp.LanguageServerSpec{}, "", fmt.Errorf("plugin language server language is required")
	}
	return lsp.LanguageServerSpec{
		Name:        strings.TrimSpace(registration.Name),
		LanguageID:  language,
		Command:     strings.TrimSpace(registration.Command),
		Args:        append([]string(nil), registration.Args...),
		SettingsKey: cloneOptionalString(registration.SettingsKey),
	}, language, nil
}

func (c *languageServerSpecCollector) claimLanguage(language string, pluginID string) error {
	if existingPluginID, exists := c.byLanguage[language]; exists {
		return fmt.Errorf(
			"%w: %s registered by %s and %s",
			ErrRegisteredLanguageServerConflict,
			language,
			existingPluginID,
			pluginID,
		)
	}
	c.byLanguage[language] = pluginID
	return nil
}

func sortLanguageServerSpecs(specs []lsp.LanguageServerSpec) {
	slices.SortFunc(specs, func(left lsp.LanguageServerSpec, right lsp.LanguageServerSpec) int {
		if left.LanguageID < right.LanguageID {
			return -1
		}
		if left.LanguageID > right.LanguageID {
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
