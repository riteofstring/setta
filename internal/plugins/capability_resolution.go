package plugins

import (
	"errors"
	"fmt"
	"strings"

	"setta/internal/config"
)

var (
	ErrFilesystemWorkerSpecResolverServerModeRequired = errors.New("plugins: server mode is required")
	ErrFilesystemWorkerSpecResolverServerModeInvalid  = errors.New("plugins: server mode is unsupported")
)

var (
	resolverKnownPluginCapabilities = map[string]struct{}{
		"registerSectionKinds":  {},
		"registerPane":          {},
		"registerCommand":       {},
		"registerTopNavBarItem": {},
		"registerContextMenu":   {},
		"readProjectState":      {},
		"subscribeProjectState": {},
		"emitListenerEvents":    {},
		"writeWorkspacePlugins": {},
	}
	resolverHostBlockedCapabilities = map[string]struct{}{
		"registerContextMenu": {},
	}
	resolverModeAllowedCapabilities = map[config.Mode]map[string]struct{}{
		config.ModeIDE:      resolverKnownPluginCapabilities,
		config.ModeLauncher: resolverKnownPluginCapabilities,
		config.ModeShare: {
			"registerSectionKinds":  {},
			"registerPane":          {},
			"registerCommand":       {},
			"registerTopNavBarItem": {},
			"readProjectState":      {},
			"subscribeProjectState": {},
			"emitListenerEvents":    {},
		},
		config.ModeApp: {
			"registerSectionKinds":  {},
			"registerPane":          {},
			"registerCommand":       {},
			"registerTopNavBarItem": {},
			"readProjectState":      {},
			"subscribeProjectState": {},
			"emitListenerEvents":    {},
		},
	}
)

func resolveFilesystemPluginCapabilities(requested []string, serverMode config.Mode) ([]string, []string, []PluginBlockedCapability, error) {
	allowed, ok := resolverModeAllowedCapabilities[serverMode]
	if !ok {
		return nil, nil, nil, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverServerModeInvalid, serverMode)
	}

	normalizedRequested := make([]string, 0, len(requested))
	seen := make(map[string]struct{}, len(requested))
	for _, capability := range requested {
		trimmedCapability := strings.TrimSpace(capability)
		if trimmedCapability == "" {
			return nil, nil, nil, fmt.Errorf("%w: manifest capability must be non-empty", ErrPluginManifestInvalid)
		}
		if _, ok := resolverKnownPluginCapabilities[trimmedCapability]; !ok {
			return nil, nil, nil, fmt.Errorf("%w: unknown capability %q", ErrPluginManifestInvalid, trimmedCapability)
		}
		if _, exists := seen[trimmedCapability]; exists {
			return nil, nil, nil, fmt.Errorf("%w: duplicate capability %q", ErrPluginManifestInvalid, trimmedCapability)
		}
		seen[trimmedCapability] = struct{}{}
		normalizedRequested = append(normalizedRequested, trimmedCapability)
	}

	effective := make([]string, 0, len(normalizedRequested))
	blocked := make([]PluginBlockedCapability, 0)
	for _, capability := range normalizedRequested {
		if _, hostBlocked := resolverHostBlockedCapabilities[capability]; hostBlocked {
			blocked = append(blocked, PluginBlockedCapability{
				Capability: capability,
				Reason:     PluginBlockedCapabilityReasonHostPolicy,
			})
			continue
		}
		if _, ok := allowed[capability]; ok {
			effective = append(effective, capability)
			continue
		}
		blocked = append(blocked, PluginBlockedCapability{
			Capability: capability,
			Reason:     PluginBlockedCapabilityReasonModePolicy,
		})
	}
	return normalizedRequested, effective, blocked, nil
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func isASCIIAlphaNumeric(value byte) bool {
	return (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z') || (value >= '0' && value <= '9')
}
