package plugins

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
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

type PluginLockWriteResponse struct {
	LockfilePath string `json:"lockfilePath"`
	PluginCount  int    `json:"pluginCount"`
}

type PluginLockApplyResponse struct {
	LockfilePath   string   `json:"lockfilePath"`
	PlannedChanges []string `json:"plannedChanges"`
	Applied        bool     `json:"applied"`
}

type pluginScopeKey struct {
	Scope    PluginScope
	PluginID string
}

func (s *Service) WriteLockfile() (PluginLockWriteResponse, error) {
	if s == nil {
		return PluginLockWriteResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginLockWriteResponse{}, err
	}
	installMetadata, err := s.store.LoadInstallMetadata()
	if err != nil {
		return PluginLockWriteResponse{}, err
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
		return PluginLockWriteResponse{}, err
	}

	return PluginLockWriteResponse{
		LockfilePath: lockfilePath,
		PluginCount:  len(lockEntries),
	}, nil
}

func (s *Service) ApplyLockfile(ctx context.Context, check bool) (PluginLockApplyResponse, error) {
	if s == nil {
		return PluginLockApplyResponse{}, ErrWorkspaceRootRequired
	}
	if ctx == nil {
		ctx = context.Background()
	}

	lockfilePath := s.store.LockfilePath()
	lockfile, err := loadPluginsLockfile(lockfilePath)
	if err != nil {
		return PluginLockApplyResponse{}, err
	}

	s.mu.Lock()
	snapshot, err := s.rescanLocked()
	if err != nil {
		s.mu.Unlock()
		return PluginLockApplyResponse{}, err
	}
	installMetadata, err := s.store.LoadInstallMetadata()
	if err != nil {
		s.mu.Unlock()
		return PluginLockApplyResponse{}, err
	}
	s.mu.Unlock()

	desiredEntries, desiredByScopePlugin, err := normalizeLockfileEntries(lockfile)
	if err != nil {
		return PluginLockApplyResponse{}, err
	}

	currentExternalByScopePlugin := map[pluginScopeKey]DiscoveredPlugin{}
	currentByScopePlugin := map[pluginScopeKey]DiscoveredPlugin{}
	for _, entry := range snapshot.Plugins {
		if entry.ShadowedBySourcePath != "" {
			continue
		}
		key := pluginScopeKey{Scope: entry.Scope, PluginID: entry.PluginID}
		if entry.SourceManager == PluginSourceManagerPackageManager {
			currentExternalByScopePlugin[key] = entry
			continue
		}
		currentByScopePlugin[key] = entry
	}

	plannedChanges := planLockfileChanges(
		desiredEntries,
		desiredByScopePlugin,
		currentExternalByScopePlugin,
		currentByScopePlugin,
		installMetadata,
	)
	if check {
		return PluginLockApplyResponse{
			LockfilePath:   lockfilePath,
			PlannedChanges: plannedChanges,
			Applied:        false,
		}, nil
	}

	for _, desired := range desiredEntries {
		key := pluginScopeKey{Scope: desired.Scope, PluginID: desired.PluginID}
		if _, ok := currentExternalByScopePlugin[key]; ok {
			continue
		}
		if lockEntryIsExternallyManaged(desired) {
			continue
		}
		current, hasCurrent := currentByScopePlugin[key]
		if hasCurrent && !lockEntryNeedsInstall(desired, current, installMetadata) {
			continue
		}
		if desired.SourceSpec == nil {
			return PluginLockApplyResponse{}, newServiceError(ServiceErrorCodeLockfileEntryMissing, "Lockfile entry missing source spec for plugin: %s", desired.PluginID)
		}

		enableForInstall := true
		if hasCurrent {
			enableForInstall = current.State != PluginRuntimeStateDisabled
		}
		installerBackend := cloneOptionalInstallerBackend(desired.InstallerBackend)
		if installerBackend == nil && hasCurrent {
			if metadataEntry, ok := installMetadata.Entries[metadataKey(current.Scope, current.PluginID)]; ok {
				installerBackend = cloneOptionalInstallerBackend(metadataEntry.InstallerBackend)
			}
		}

		options := InstallOptions{
			SourceSpec:       *desired.SourceSpec,
			Scope:            scopePointer(desired.Scope),
			Installer:        installerBackend,
			Enable:           enableForInstall,
			Force:            true,
			skipLookupRescan: true,
			skipFinalRescan:  true,
		}
		if hasCurrent {
			currentEntry := current
			options.existingEntry = &currentEntry
		}
		if _, err := s.Install(ctx, options); err != nil {
			return PluginLockApplyResponse{}, err
		}
	}

	uninstallKeys := make([]pluginScopeKey, 0, len(currentByScopePlugin))
	for key := range currentByScopePlugin {
		if _, ok := desiredByScopePlugin[key]; ok {
			continue
		}
		uninstallKeys = append(uninstallKeys, key)
	}
	slices.SortFunc(uninstallKeys, comparePluginScopeKeys)
	for _, key := range uninstallKeys {
		currentEntry := currentByScopePlugin[key]
		entryCopy := currentEntry
		if _, err := s.Uninstall(ctx, UninstallOptions{
			PluginID:         currentEntry.PluginID,
			Scope:            scopePointer(currentEntry.Scope),
			resolvedEntry:    &entryCopy,
			skipLookupRescan: true,
			skipFinalRescan:  true,
		}); err != nil {
			return PluginLockApplyResponse{}, err
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.rescanLocked(); err != nil {
		return PluginLockApplyResponse{}, err
	}
	return PluginLockApplyResponse{
		LockfilePath:   lockfilePath,
		PlannedChanges: plannedChanges,
		Applied:        true,
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

func loadPluginsLockfile(path string) (PluginsLockFile, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return PluginsLockFile{}, newServiceError(ServiceErrorCodeLockfileNotFound, "Plugin lockfile not found: %s", path)
		}
		return PluginsLockFile{}, fmt.Errorf("read plugin lockfile %s: %w", path, err)
	}
	var lockfile PluginsLockFile
	if err := json.Unmarshal(content, &lockfile); err != nil {
		return PluginsLockFile{}, newServiceError(ServiceErrorCodeLockfileInvalid, "Invalid plugin lockfile: %v", err)
	}
	if lockfile.Plugins == nil {
		lockfile.Plugins = []PluginLockEntry{}
	}
	return lockfile, nil
}

func normalizeLockfileEntries(lockfile PluginsLockFile) ([]PluginLockEntry, map[pluginScopeKey]PluginLockEntry, error) {
	desiredEntries := make([]PluginLockEntry, 0, len(lockfile.Plugins))
	desiredByScopePlugin := map[pluginScopeKey]PluginLockEntry{}
	duplicateKeys := make([]pluginScopeKey, 0)
	for _, rawEntry := range lockfile.Plugins {
		entry, err := normalizeLockEntry(rawEntry)
		if err != nil {
			return nil, nil, err
		}
		key := pluginScopeKey{Scope: entry.Scope, PluginID: entry.PluginID}
		if _, exists := desiredByScopePlugin[key]; exists {
			duplicateKeys = append(duplicateKeys, key)
		}
		desiredEntries = append(desiredEntries, entry)
		desiredByScopePlugin[key] = entry
	}
	if len(duplicateKeys) > 0 {
		slices.SortFunc(duplicateKeys, comparePluginScopeKeys)
		labels := make([]string, 0, len(duplicateKeys))
		for _, key := range duplicateKeys {
			labels = append(labels, string(key.Scope)+":"+key.PluginID)
		}
		return nil, nil, newServiceError(ServiceErrorCodeLockfileInvalid, "Lockfile contains duplicate scope/plugin entries: %s", strings.Join(labels, ", "))
	}
	return desiredEntries, desiredByScopePlugin, nil
}

func normalizeLockEntry(entry PluginLockEntry) (PluginLockEntry, error) {
	pluginID, err := NormalizePluginID(entry.PluginID)
	if err != nil {
		return PluginLockEntry{}, newServiceError(ServiceErrorCodeLockfileInvalid, "Invalid lockfile plugin id: %s", entry.PluginID)
	}
	scope := entry.Scope
	normalizedScope, err := NormalizeScope(&scope)
	if err != nil {
		return PluginLockEntry{}, newServiceError(ServiceErrorCodeLockfileInvalid, "Invalid lockfile plugin scope: %s", entry.Scope)
	}
	version := strings.TrimSpace(entry.Version)
	if version == "" {
		return PluginLockEntry{}, newServiceError(ServiceErrorCodeLockfileInvalid, "Lockfile entry missing version for plugin: %s", pluginID)
	}
	canonicalSourceKey := strings.TrimSpace(entry.CanonicalSourceKey)
	if canonicalSourceKey == "" {
		return PluginLockEntry{}, newServiceError(ServiceErrorCodeLockfileInvalid, "Lockfile entry missing canonical source key for plugin: %s", pluginID)
	}
	normalizedEntry := PluginLockEntry{
		PluginID:           pluginID,
		Version:            version,
		CanonicalSourceKey: canonicalSourceKey,
		Scope:              normalizedScope,
		SourceDigestSHA256: cloneOptionalString(entry.SourceDigestSHA256),
		SourceSpec:         optionalTrimmedStringPointer(optionalStringValue(entry.SourceSpec)),
		InstallerBackend:   cloneOptionalInstallerBackend(entry.InstallerBackend),
	}
	if normalizedEntry.InstallerBackend != nil {
		switch *normalizedEntry.InstallerBackend {
		case PluginInstallerBackendAuto, PluginInstallerBackendPip, PluginInstallerBackendUV:
		default:
			return PluginLockEntry{}, newServiceError(ServiceErrorCodeLockfileInvalid, "Invalid installer backend for plugin: %s", pluginID)
		}
	}
	return normalizedEntry, nil
}

func planLockfileChanges(
	desiredEntries []PluginLockEntry,
	desiredByScopePlugin map[pluginScopeKey]PluginLockEntry,
	currentExternalByScopePlugin map[pluginScopeKey]DiscoveredPlugin,
	currentByScopePlugin map[pluginScopeKey]DiscoveredPlugin,
	installMetadata PluginInstallMetadataFile,
) []string {
	plannedChanges := make([]string, 0)
	for _, desired := range desiredEntries {
		key := pluginScopeKey{Scope: desired.Scope, PluginID: desired.PluginID}
		if _, ok := currentExternalByScopePlugin[key]; ok {
			continue
		}
		if lockEntryIsExternallyManaged(desired) {
			continue
		}
		current, ok := currentByScopePlugin[key]
		if !ok {
			plannedChanges = append(plannedChanges, "install "+desired.PluginID+" in "+string(desired.Scope))
			continue
		}
		if current.Version != desired.Version {
			plannedChanges = append(plannedChanges, "update "+desired.PluginID+" in "+string(desired.Scope)+" from "+current.Version+" to "+desired.Version)
			continue
		}
		if lockEntryRequiresSourceReconcile(desired, current, installMetadata) {
			plannedChanges = append(plannedChanges, "reconcile source for "+desired.PluginID+" in "+string(desired.Scope))
			continue
		}
		if desired.SourceDigestSHA256 != nil && !optionalStringEqual(current.SourceDigestSHA256, desired.SourceDigestSHA256) {
			plannedChanges = append(plannedChanges, "reconcile digest for "+desired.PluginID+" in "+string(desired.Scope))
		}
	}

	currentKeys := make([]pluginScopeKey, 0, len(currentByScopePlugin))
	for key := range currentByScopePlugin {
		currentKeys = append(currentKeys, key)
	}
	slices.SortFunc(currentKeys, comparePluginScopeKeys)
	for _, key := range currentKeys {
		if _, ok := desiredByScopePlugin[key]; ok {
			continue
		}
		plannedChanges = append(plannedChanges, "uninstall "+key.PluginID+" from "+string(key.Scope))
	}
	return plannedChanges
}

func lockEntryRequiresSourceReconcile(desired PluginLockEntry, current DiscoveredPlugin, installMetadata PluginInstallMetadataFile) bool {
	if current.CanonicalSourceKey != desired.CanonicalSourceKey {
		return true
	}
	if desired.SourceSpec == nil {
		return false
	}
	metadataEntry, ok := installMetadata.Entries[metadataKey(current.Scope, current.PluginID)]
	if !ok {
		return true
	}
	return metadataEntry.SourceSpec != *desired.SourceSpec
}

func lockEntryNeedsInstall(desired PluginLockEntry, current DiscoveredPlugin, installMetadata PluginInstallMetadataFile) bool {
	if current.Version != desired.Version {
		return true
	}
	if lockEntryRequiresSourceReconcile(desired, current, installMetadata) {
		return true
	}
	if desired.SourceDigestSHA256 != nil && !optionalStringEqual(current.SourceDigestSHA256, desired.SourceDigestSHA256) {
		return true
	}
	return false
}

func lockEntryIsExternallyManaged(entry PluginLockEntry) bool {
	if entry.Scope != PluginScopeSettaFiles {
		return false
	}
	if entry.SourceSpec != nil {
		return false
	}
	if entry.InstallerBackend != nil {
		return false
	}
	return strings.HasPrefix(entry.CanonicalSourceKey, "pypi:") || strings.HasPrefix(entry.CanonicalSourceKey, "python-env:")
}

func optionalStringEqual(left *string, right *string) bool {
	return optionalStringValue(left) == optionalStringValue(right)
}

func optionalStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func scopePointer(scope PluginScope) *PluginScope {
	resolvedScope := scope
	return &resolvedScope
}

func comparePluginScopeKeys(left pluginScopeKey, right pluginScopeKey) int {
	if diff := compareScopeOrder(left.Scope, right.Scope); diff != 0 {
		return diff
	}
	return strings.Compare(left.PluginID, right.PluginID)
}
