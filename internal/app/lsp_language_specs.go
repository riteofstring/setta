package app

import (
	"context"
	"fmt"
	"slices"
	"strings"

	"setta/internal/lsp"
	"setta/internal/plugins"
)

func snapshotAppLanguageServerSpecs(
	discovery *plugins.DiscoveryService,
	backend plugins.BackendRegistrationSource,
) ([]lsp.LanguageServerSpec, error) {
	if discovery == nil || backend == nil {
		return nil, nil
	}

	snapshot, err := discovery.Rescan()
	if err != nil {
		return nil, err
	}

	specs := make([]lsp.LanguageServerSpec, 0)
	for _, entry := range snapshot.Plugins {
		if entry.State != plugins.PluginRuntimeStateActive || entry.ShadowedBySourcePath != "" {
			continue
		}

		registrations := backend.SnapshotBackendRegistrations(context.Background(), entry)
		for _, registration := range registrations.LanguageServers {
			languageID := strings.ToLower(strings.TrimSpace(registration.Language))
			if languageID == "" {
				continue
			}
			if languageID == "python" {
				return nil, fmt.Errorf("app: plugin %q attempted to register python language server", entry.PluginID)
			}
			specs = append(specs, lsp.LanguageServerSpec{
				Name:        registration.Name,
				LanguageID:  languageID,
				Command:     registration.Command,
				Args:        append([]string(nil), registration.Args...),
				SettingsKey: cloneOptionalString(registration.SettingsKey),
			})
		}
	}

	slices.SortFunc(specs, func(left lsp.LanguageServerSpec, right lsp.LanguageServerSpec) int {
		if left.LanguageID != right.LanguageID {
			return strings.Compare(left.LanguageID, right.LanguageID)
		}
		return strings.Compare(left.Name, right.Name)
	})
	return specs, nil
}

func cloneOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := strings.TrimSpace(*value)
	return &cloned
}
