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
	specs := make([]lsp.LanguageServerSpec, 0)
	byLanguage := map[string]string{}
	for _, entry := range entries {
		if entry.Manifest == nil {
			continue
		}
		if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
			continue
		}
		if !containsString(entry.EffectiveCapabilities, "registerLanguageServer") {
			continue
		}

		for _, registration := range entry.RegisteredLanguageServers {
			language := strings.ToLower(strings.TrimSpace(registration.Language))
			if language == "" {
				return nil, fmt.Errorf("plugin language server language is required")
			}
			if existingPluginID, exists := byLanguage[language]; exists {
				return nil, fmt.Errorf(
					"%w: %s registered by %s and %s",
					ErrRegisteredLanguageServerConflict,
					language,
					existingPluginID,
					entry.PluginID,
				)
			}
			byLanguage[language] = entry.PluginID
			specs = append(specs, lsp.LanguageServerSpec{
				Name:        strings.TrimSpace(registration.Name),
				LanguageID:  language,
				Command:     strings.TrimSpace(registration.Command),
				Args:        append([]string(nil), registration.Args...),
				SettingsKey: cloneOptionalString(registration.SettingsKey),
			})
		}
	}

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
	return specs, nil
}
