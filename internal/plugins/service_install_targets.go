package plugins

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func (s *Service) installCandidateLocked(candidate CandidatePlugin, targetPath string, scope PluginScope, sourceSpec string, installer PluginInstallerBackend, enable bool, force bool) error {
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		return fmt.Errorf("create plugin target parent %s: %w", targetPath, err)
	}
	if err := s.ensureTargetPathAvailableLocked(targetPath, force); err != nil {
		return err
	}
	if targetExists(targetPath) {
		if err := s.backupExistingPluginLocked(candidate.Manifest.ID, scope, targetPath); err != nil {
			return err
		}
		if err := removePluginTarget(targetPath); err != nil {
			return err
		}
	}

	stagedPath := filepath.Join(filepath.Dir(targetPath), fmt.Sprintf(".%s.tmp-%d-%d", candidate.Manifest.ID, os.Getpid(), time.Now().UTC().UnixNano()))
	if err := removePluginTarget(stagedPath); err != nil {
		return err
	}
	if err := copyDirectoryTree(candidate.Root, stagedPath); err != nil {
		return err
	}
	if err := os.Rename(stagedPath, targetPath); err != nil {
		removePluginTarget(stagedPath)
		return fmt.Errorf("activate plugin candidate %s: %w", targetPath, err)
	}
	installerValue := installer
	if err := s.store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           candidate.Manifest.ID,
		Scope:              scope,
		SourceSpec:         sourceSpec,
		InstallerBackend:   &installerValue,
		CanonicalSourceKey: candidate.CanonicalSourceKey,
		SourceDigestSHA256: cloneOptionalString(candidate.SourceDigestSHA256),
		Version:            candidate.Manifest.Version,
	}); err != nil {
		return err
	}
	return s.applyEnablementAfterInstallLocked(candidate.Manifest.ID, scope, enable)
}

func (s *Service) ensureTargetPathAvailableLocked(targetPath string, force bool) error {
	if force {
		return nil
	}
	if targetExists(targetPath) {
		return newServiceError(ServiceErrorCodeTargetExists, "Plugin already exists at %s. Use force to overwrite.", targetPath)
	}
	return nil
}

func (s *Service) reserveInstallTargetPathLocked(targetPath string, force bool) error {
	if err := s.ensureTargetPathAvailableLocked(targetPath, force); err != nil {
		return err
	}
	targetKey, err := installTargetPathKey(targetPath)
	if err != nil {
		return err
	}
	if _, exists := s.installTargetReservations[targetKey]; exists {
		return newServiceError(ServiceErrorCodeTargetExists, "Plugin install already in progress for %s.", targetPath)
	}
	s.installTargetReservations[targetKey] = struct{}{}
	return nil
}

func (s *Service) releaseInstallTargetPathReservationLocked(targetPath string) {
	targetKey, err := installTargetPathKey(targetPath)
	if err != nil {
		return
	}
	delete(s.installTargetReservations, targetKey)
}

func installTargetPathKey(targetPath string) (string, error) {
	absolutePath, err := filepath.Abs(filepath.Clean(targetPath))
	if err != nil {
		return "", err
	}
	return absolutePath, nil
}

func (s *Service) backupExistingPluginLocked(pluginID string, scope PluginScope, targetPath string) error {
	info, err := os.Lstat(targetPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat existing plugin %s: %w", targetPath, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil
	}
	historyEntry, err := s.store.CreateHistorySnapshot(pluginID, scope)
	if err != nil {
		return err
	}
	metadataEntry, ok, err := s.store.GetInstallMetadata(pluginID, scope)
	if err != nil {
		return err
	}
	if !ok {
		manifest, err := LoadPluginManifest(targetPath, pluginID)
		if err != nil {
			return err
		}
		digest, err := computeDirectoryDigest(targetPath)
		if err != nil {
			return err
		}
		metadataEntry = PluginInstallMetadataEntry{
			PluginID:           pluginID,
			Scope:              scope,
			SourceSpec:         "local:" + targetPath,
			CanonicalSourceKey: "local:" + targetPath,
			SourceDigestSHA256: stringPtr(digest),
			Version:            manifest.Version,
			History:            []PluginInstallHistoryEntry{},
		}
	}
	metadataEntry.History = append(metadataEntry.History, historyEntry)
	metadata, err := s.store.LoadInstallMetadata()
	if err != nil {
		return err
	}
	metadata.Entries[metadataKey(scope, pluginID)] = metadataEntry
	return s.store.SaveInstallMetadata(metadata)
}

func (s *Service) applyEnablementAfterInstallLocked(pluginID string, scope PluginScope, enable bool) error {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	if scope == PluginScopeGlobal {
		state.EnabledPluginIDs = removeString(state.EnabledPluginIDs, pluginID)
		state.DisabledPluginIDs = removeString(state.DisabledPluginIDs, pluginID)
	} else if enable {
		state.EnabledPluginIDs = appendIfMissing(state.EnabledPluginIDs, pluginID)
		state.DisabledPluginIDs = removeString(state.DisabledPluginIDs, pluginID)
	} else {
		state.DisabledPluginIDs = appendIfMissing(state.DisabledPluginIDs, pluginID)
		state.EnabledPluginIDs = removeString(state.EnabledPluginIDs, pluginID)
	}
	if err := s.store.SavePluginsState(state); err != nil {
		return err
	}
	if scope != PluginScopeGlobal {
		return nil
	}
	globalState, err := s.store.LoadPluginsGlobalState()
	if err != nil {
		return err
	}
	if enable {
		globalState.AutoEnabledPluginIDs = appendIfMissing(globalState.AutoEnabledPluginIDs, pluginID)
	} else {
		globalState.AutoEnabledPluginIDs = removeString(globalState.AutoEnabledPluginIDs, pluginID)
	}
	return s.store.SavePluginsGlobalState(globalState)
}

func (s *Service) removePluginFromEnablementLocked(pluginID string, scope PluginScope) error {
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	state.EnabledPluginIDs = removeString(state.EnabledPluginIDs, pluginID)
	state.DisabledPluginIDs = removeString(state.DisabledPluginIDs, pluginID)
	delete(state.PluginConfigByID, pluginConfigKey(pluginID, scope))
	if err := s.store.SavePluginsState(state); err != nil {
		return err
	}
	if scope != PluginScopeGlobal {
		return nil
	}
	globalState, err := s.store.LoadPluginsGlobalState()
	if err != nil {
		return err
	}
	globalState.AutoEnabledPluginIDs = removeString(globalState.AutoEnabledPluginIDs, pluginID)
	return s.store.SavePluginsGlobalState(globalState)
}
