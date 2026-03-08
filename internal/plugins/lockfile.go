package plugins

import (
	"slices"
	"strings"
)

const pluginLockSchemaVersion = 1

type PluginLockEntry struct {
	PluginID           string                  `json:"pluginId"`
	Version            string                  `json:"version"`
	CanonicalSourceKey string                  `json:"canonicalSourceKey"`
	Scope              PluginScope             `json:"scope"`
	SourceDigestSHA256 *string                 `json:"sourceDigestSha256"`
	SourceSpec         *string                 `json:"sourceSpec"`
	InstallerBackend   *PluginInstallerBackend `json:"installerBackend"`
}

type PluginsLockFile struct {
	SchemaVersion int               `json:"schemaVersion"`
	Plugins       []PluginLockEntry `json:"plugins"`
}

type PluginLockWriteResult struct {
	LockfilePath string `json:"lockfilePath"`
	PluginCount  int    `json:"pluginCount"`
}

func (s *Service) WriteLockfile() (PluginLockWriteResult, error) {
	if s == nil {
		return PluginLockWriteResult{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginLockWriteResult{}, err
	}
	installMetadata, err := s.store.LoadInstallMetadata()
	if err != nil {
		return PluginLockWriteResult{}, err
	}

	candidates := make([]DiscoveredPlugin, 0, len(snapshot.Plugins))
	for _, entry := range snapshot.Plugins {
		if entry.ShadowedBySourcePath != "" {
			continue
		}
		if entry.SourceManager == PluginSourceManagerPackageManager {
			continue
		}
		if entry.Manifest == nil {
			continue
		}
		candidates = append(candidates, entry)
	}
	slices.SortFunc(candidates, compareLockfilePluginEntries)

	lockEntries := make([]PluginLockEntry, 0, len(candidates))
	for _, entry := range candidates {
		lockEntries = append(lockEntries, buildLockEntry(entry, installMetadata))
	}

	lockfilePath := s.store.LockfilePath()
	if err := writeStoreJSONFile(lockfilePath, PluginsLockFile{
		SchemaVersion: pluginLockSchemaVersion,
		Plugins:       lockEntries,
	}); err != nil {
		return PluginLockWriteResult{}, err
	}

	return PluginLockWriteResult{
		LockfilePath: lockfilePath,
		PluginCount:  len(lockEntries),
	}, nil
}

func compareLockfilePluginEntries(left DiscoveredPlugin, right DiscoveredPlugin) int {
	if diff := strings.Compare(left.PluginID, right.PluginID); diff != 0 {
		return diff
	}
	if diff := compareScopeOrder(left.Scope, right.Scope); diff != 0 {
		return diff
	}
	return strings.Compare(left.SourcePath, right.SourcePath)
}

func buildLockEntry(entry DiscoveredPlugin, installMetadata PluginInstallMetadataFile) PluginLockEntry {
	lockEntry := PluginLockEntry{
		PluginID:           entry.PluginID,
		Version:            entry.Version,
		CanonicalSourceKey: entry.CanonicalSourceKey,
		Scope:              entry.Scope,
		SourceDigestSHA256: cloneOptionalString(entry.SourceDigestSHA256),
	}
	metadataEntry, ok := installMetadata.Entries[metadataKey(entry.Scope, entry.PluginID)]
	if !ok {
		return lockEntry
	}
	lockEntry.SourceSpec = optionalTrimmedStringPointer(metadataEntry.SourceSpec)
	lockEntry.InstallerBackend = cloneOptionalInstallerBackend(metadataEntry.InstallerBackend)
	return lockEntry
}

func optionalTrimmedStringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return stringPointer(trimmed)
}

func cloneOptionalInstallerBackend(value *PluginInstallerBackend) *PluginInstallerBackend {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}
