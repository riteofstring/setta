package plugins

import (
	"fmt"
	"os"
	"strings"
)

func (s *Service) prepareRollbackLocked(options RollbackOptions) (preparedRollback, error) {
	scope, entry, err := s.resolveScopeAndEntryLocked(options.PluginID, options.Scope)
	if err != nil {
		return preparedRollback{}, err
	}
	if entry.PluginID != "" {
		if err := ensureSettaManagedForWrite(entry, "rollback"); err != nil {
			return preparedRollback{}, err
		}
	}

	metadata, metadataEntry, err := s.rollbackMetadataEntryLocked(options.PluginID, scope)
	if err != nil {
		return preparedRollback{}, err
	}
	snapshotPath, snapshotManifest, snapshotDigest, err := loadRollbackSnapshot(options.PluginID, metadataEntry)
	if err != nil {
		return preparedRollback{}, err
	}
	targetPath, err := s.store.PluginRoot(scope, options.PluginID)
	if err != nil {
		return preparedRollback{}, err
	}
	return preparedRollback{
		pluginID:                       options.PluginID,
		scope:                          scope,
		targetPath:                     targetPath,
		snapshotPath:                   snapshotPath,
		snapshotManifest:               snapshotManifest,
		snapshotDigest:                 snapshotDigest,
		metadata:                       metadata,
		metadataEntry:                  metadataEntry,
		currentEntryHadBackend:         entry.HasBackend(),
		currentEntryLanguageServerOnly: entryHasLanguageServerOnlyBackendRuntime(entry),
	}, nil
}

func (s *Service) rollbackMetadataEntryLocked(pluginID string, scope PluginScope) (PluginInstallMetadataFile, PluginInstallMetadataEntry, error) {
	metadata, err := s.store.LoadInstallMetadata()
	if err != nil {
		return PluginInstallMetadataFile{}, PluginInstallMetadataEntry{}, err
	}

	metadataEntry, ok := metadata.Entries[metadataKey(scope, pluginID)]
	if ok && SourceSpecIsLocal(metadataEntry.SourceSpec) {
		return PluginInstallMetadataFile{}, PluginInstallMetadataEntry{}, newServiceError(
			ServiceErrorCodeRollbackUnavailable,
			"Rollback is unavailable for linked local plugins. Unlink and relink the desired local source for %s.",
			pluginID,
		)
	}
	if !ok || len(metadataEntry.History) == 0 {
		return PluginInstallMetadataFile{}, PluginInstallMetadataEntry{}, newServiceError(
			ServiceErrorCodeRollbackUnavailable,
			"No rollback history exists for plugin: %s",
			pluginID,
		)
	}
	return metadata, metadataEntry, nil
}

func loadRollbackSnapshot(pluginID string, metadataEntry PluginInstallMetadataEntry) (string, PluginManifest, string, error) {
	previous := metadataEntry.History[len(metadataEntry.History)-1]
	snapshotPath := strings.TrimSpace(previous.SnapshotPath)
	if snapshotPath == "" {
		return "", PluginManifest{}, "", missingRollbackSnapshotError(pluginID)
	}
	if _, err := os.Stat(snapshotPath); err != nil {
		if os.IsNotExist(err) {
			return "", PluginManifest{}, "", missingRollbackSnapshotError(pluginID)
		}
		return "", PluginManifest{}, "", fmt.Errorf("stat rollback snapshot %s: %w", snapshotPath, err)
	}

	snapshotManifest, err := LoadPluginManifest(snapshotPath, pluginID)
	if err != nil {
		return "", PluginManifest{}, "", err
	}
	snapshotDigest, err := computeDirectoryDigest(snapshotPath)
	if err != nil {
		return "", PluginManifest{}, "", err
	}
	return snapshotPath, snapshotManifest, snapshotDigest, nil
}

func missingRollbackSnapshotError(pluginID string) error {
	return newServiceError(ServiceErrorCodeRollbackUnavailable, "Rollback snapshot missing for plugin: %s", pluginID)
}

func (s *Service) rollbackPreparedLocked(rollback preparedRollback) (bool, error) {
	if err := s.reserveInstallTargetPathLocked(rollback.targetPath, true); err != nil {
		return false, err
	}
	defer s.releaseInstallTargetPathReservationLocked(rollback.targetPath)

	if err := removePluginTarget(rollback.targetPath); err != nil {
		return false, err
	}
	if err := copyDirectoryTree(rollback.snapshotPath, rollback.targetPath); err != nil {
		return false, err
	}
	if err := s.saveRollbackMetadataLocked(rollback); err != nil {
		return false, err
	}

	restartRequired := rollback.snapshotManifest.Backend != nil || rollback.currentEntryHadBackend
	if restartRequired {
		languageServerOnly := s.pendingRestartLanguageServerOnlyForManifest(
			&rollback.snapshotManifest,
			rollback.currentEntryLanguageServerOnly,
		)
		if err := s.addPendingRestartBackendIDLocked(rollback.pluginID, languageServerOnly); err != nil {
			return false, err
		}
		delete(s.pendingRestartRemovedPlugin, rollback.pluginID)
	}
	if _, err := s.rescanLocked(); err != nil {
		return false, err
	}
	return restartRequired, nil
}

func (s *Service) saveRollbackMetadataLocked(rollback preparedRollback) error {
	rollback.metadataEntry.History = append(
		[]PluginInstallHistoryEntry(nil),
		rollback.metadataEntry.History[:len(rollback.metadataEntry.History)-1]...,
	)
	rollback.metadataEntry.Version = rollback.snapshotManifest.Version
	rollback.metadataEntry.SourceDigestSHA256 = stringPtr(rollback.snapshotDigest)
	rollback.metadata.Entries[metadataKey(rollback.scope, rollback.pluginID)] = rollback.metadataEntry
	return s.store.SaveInstallMetadata(rollback.metadata)
}
