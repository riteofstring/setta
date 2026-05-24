package plugins

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

func (s *Service) resolveCandidate(ctx context.Context, spec ParsedSourceSpec, installer PluginInstallerBackend) (CandidatePlugin, error) {
	if s.candidateProvider == nil {
		return CandidatePlugin{}, newServiceError(ServiceErrorCodeSourceFetchFailed, "Plugin source provider is unavailable.")
	}
	return s.candidateProvider.ResolveCandidate(ctx, spec, installer)
}

func normalizeCandidate(candidate *CandidatePlugin, spec ParsedSourceSpec) error {
	if candidate == nil {
		return newServiceError(ServiceErrorCodeSourceFetchFailed, "Plugin source candidate is unavailable.")
	}
	root := strings.TrimSpace(candidate.Root)
	if root == "" {
		return newServiceError(ServiceErrorCodeSourceFetchFailed, "Plugin source candidate root is required.")
	}
	info, err := os.Stat(root)
	if err != nil {
		return fmt.Errorf("stat plugin candidate root %s: %w", root, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%w: %s", ErrPluginRootInvalid, root)
	}
	manifest, err := LoadPluginManifest(root, filepath.Base(root))
	if err != nil {
		return err
	}
	if err := ValidatePluginManifestPaths(root, manifest); err != nil {
		return err
	}
	candidate.Root = root
	candidate.Manifest = manifest
	if strings.TrimSpace(candidate.CanonicalSourceKey) == "" {
		candidate.CanonicalSourceKey = spec.CanonicalSourceKey
	}
	if candidate.SourceDigestSHA256 == nil || strings.TrimSpace(*candidate.SourceDigestSHA256) == "" {
		digest, err := computeDirectoryDigest(root)
		if err != nil {
			return err
		}
		candidate.SourceDigestSHA256 = stringPtr(digest)
	}
	return nil
}

func resolvedInstaller(installer *PluginInstallerBackend) PluginInstallerBackend {
	if installer == nil {
		return PluginInstallerBackendAuto
	}
	switch *installer {
	case PluginInstallerBackendPip, PluginInstallerBackendUV:
		return *installer
	default:
		return PluginInstallerBackendAuto
	}
}

func (s *Service) rescanLocked() (DiscoverySnapshot, error) {
	snapshot, err := s.discoveryService.Rescan()
	if err != nil {
		return DiscoverySnapshot{}, err
	}

	discoveredPluginIDs := map[string]struct{}{}
	for _, entry := range snapshot.Plugins {
		discoveredPluginIDs[entry.PluginID] = struct{}{}
	}
	for pluginID := range discoveredPluginIDs {
		delete(s.pendingRestartRemovedPlugin, pluginID)
	}
	for _, pendingRemoved := range s.pendingRestartRemovedPlugin {
		snapshot.Plugins = append(snapshot.Plugins, DiscoveredPlugin{
			PluginID:              pendingRemoved.PluginID,
			Name:                  pendingRemoved.Name,
			Version:               pendingRemoved.Version,
			Scope:                 pendingRemoved.Scope,
			SourcePath:            pendingRemoved.SourcePath,
			CanonicalSourceKey:    pendingRemoved.CanonicalSourceKey,
			SourceDigestSHA256:    cloneOptionalString(pendingRemoved.SourceDigestSHA256),
			SourceManager:         PluginSourceManagerSetta,
			State:                 PluginRuntimeStatePendingRestart,
			RequestedCapabilities: append([]string(nil), pendingRemoved.RequestedCapabilities...),
			EffectiveCapabilities: append([]string(nil), pendingRemoved.EffectiveCapabilities...),
			BlockedCapabilities:   append([]PluginBlockedCapability(nil), pendingRemoved.BlockedCapabilities...),
			RestartRequired:       true,
		})
	}
	slices.SortFunc(snapshot.Plugins, compareResolvedDiscoveredPlugins)
	snapshot.InstalledPlugins = 0
	snapshot.ActivePlugins = 0
	for _, entry := range snapshot.Plugins {
		if entry.State == PluginRuntimeStateActive || entry.State == PluginRuntimeStatePendingRestart {
			snapshot.ActivePlugins++
		}
		if entry.ShadowedBySourcePath != "" {
			continue
		}
		switch entry.State {
		case PluginRuntimeStateActive, PluginRuntimeStatePendingRestart, PluginRuntimeStateDisabled, PluginRuntimeStateInvalid:
			snapshot.InstalledPlugins++
		}
	}
	return snapshot, nil
}

func (s *Service) resolveScopeAndEntryLocked(pluginID string, requestedScope *PluginScope) (PluginScope, DiscoveredPlugin, error) {
	snapshot, err := s.rescanLocked()
	if err != nil {
		return "", DiscoveredPlugin{}, err
	}
	if requestedScope != nil {
		scope, err := NormalizeScope(requestedScope)
		if err != nil {
			return "", DiscoveredPlugin{}, err
		}
		entry := findDiscoveredPlugin(snapshot.Plugins, pluginID, scope)
		if entry.PluginID == "" {
			return "", DiscoveredPlugin{}, newServiceError(ServiceErrorCodeNotFound, "Plugin not found: %s", pluginID)
		}
		return scope, entry, nil
	}
	seen := map[PluginScope]struct{}{}
	scopes := make([]PluginScope, 0, 2)
	for _, entry := range snapshot.Plugins {
		if entry.PluginID != pluginID {
			continue
		}
		if _, ok := seen[entry.Scope]; ok {
			continue
		}
		seen[entry.Scope] = struct{}{}
		scopes = append(scopes, entry.Scope)
	}
	slices.SortFunc(scopes, compareScopeOrder)
	if len(scopes) == 0 {
		return "", DiscoveredPlugin{}, newServiceError(ServiceErrorCodeNotFound, "Plugin not found: %s", pluginID)
	}
	if len(scopes) > 1 {
		return "", DiscoveredPlugin{}, newServiceError(ServiceErrorCodeUninstallScopeRequired, "Plugin exists in multiple scopes; scope is required: %s", pluginID)
	}
	return scopes[0], findDiscoveredPlugin(snapshot.Plugins, pluginID, scopes[0]), nil
}

func (s *Service) resolveHighestPrecedenceEntryLocked(pluginID string) (DiscoveredPlugin, error) {
	snapshot, err := s.rescanLocked()
	if err != nil {
		return DiscoveredPlugin{}, err
	}
	entry, ok := PrimaryDiscoveredPlugin(snapshot.Plugins, pluginID)
	if !ok {
		return DiscoveredPlugin{}, newServiceError(ServiceErrorCodeNotFound, "Plugin not found: %s", pluginID)
	}
	return entry, nil
}

func ensureSettaManagedForWrite(entry DiscoveredPlugin, operation string) error {
	if entry.SourceManager != PluginSourceManagerPackageManager {
		return nil
	}
	return newServiceError(
		ServiceErrorCodeManagedExternally,
		"Plugin %s is managed by a Python package manager. Use uv/pip/Poetry to %s it.",
		entry.PluginID,
		operation,
	)
}

func findDiscoveredPlugin(entries []DiscoveredPlugin, pluginID string, scope PluginScope) DiscoveredPlugin {
	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.Scope == scope {
			return entry
		}
	}
	return DiscoveredPlugin{}
}

// PrimaryDiscoveredPlugin returns the primary visible entry for a plugin ID,
// preferring usable unshadowed entries over invalid or shadowed duplicates.
func PrimaryDiscoveredPlugin(entries []DiscoveredPlugin, pluginID string) (DiscoveredPlugin, bool) {
	best := DiscoveredPlugin{}
	found := false
	for _, entry := range entries {
		if entry.PluginID != pluginID {
			continue
		}
		if !found || discoveredPluginIsPreferredPrimary(best, entry) {
			best = entry
			found = true
		}
	}
	if !found {
		return DiscoveredPlugin{}, false
	}
	return best, true
}

func discoveredPluginIsPreferredPrimary(current DiscoveredPlugin, candidate DiscoveredPlugin) bool {
	return compareResolvedDiscoveredPlugins(candidate, current) < 0
}

func resolveEnablementBeforeMutation(entry DiscoveredPlugin, state PluginsStateFile, globalState PluginsGlobalStateFile) bool {
	if entry.Manifest == nil {
		return containsString(state.EnabledPluginIDs, entry.PluginID) && !containsString(state.DisabledPluginIDs, entry.PluginID)
	}
	enabled, _ := resolveFilesystemPluginEnabledWithSource(
		entry.PluginID,
		entry.Scope,
		entry.Manifest.EnabledByDefault,
		state,
		globalState,
	)
	return enabled
}
