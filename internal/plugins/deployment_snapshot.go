package plugins

import (
	"fmt"
	"path/filepath"
	"strings"
)

type ActivePluginDeploymentSnapshot struct {
	SourcePath string
	State      PluginsStateFile
}

type activePluginDeploymentSnapshot struct {
	entry DiscoveredPlugin
	state PluginsStateFile
}

func (s *Service) DeploymentSnapshotForActivePlugin(
	pluginID string,
) (ActivePluginDeploymentSnapshot, error) {
	if s == nil {
		return ActivePluginDeploymentSnapshot{}, ErrWorkspaceRootRequired
	}

	trimmedPluginID, err := validateRuntimePluginID(pluginID)
	if err != nil {
		return ActivePluginDeploymentSnapshot{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.deploymentSnapshotForActivePluginLocked(trimmedPluginID)
	if err != nil {
		return ActivePluginDeploymentSnapshot{}, err
	}
	return ActivePluginDeploymentSnapshot{
		SourcePath: snapshot.entry.SourcePath,
		State:      snapshot.state,
	}, nil
}

func (s *Service) PackageActivePluginForDeployment(
	pluginID string,
	targetRoot string,
) (PluginsStateFile, error) {
	if s == nil {
		return PluginsStateFile{}, ErrWorkspaceRootRequired
	}
	trimmedPluginID, err := validateRuntimePluginID(pluginID)
	if err != nil {
		return PluginsStateFile{}, err
	}
	trimmedTargetRoot := strings.TrimSpace(targetRoot)
	if trimmedTargetRoot == "" {
		return PluginsStateFile{}, fmt.Errorf("plugin deployment target root is required")
	}

	s.mu.Lock()
	snapshot, err := s.deploymentSnapshotForActivePluginLocked(trimmedPluginID)
	s.mu.Unlock()
	if err != nil {
		return PluginsStateFile{}, err
	}
	if err := packagePluginSourceForDeployment(snapshot.entry, trimmedTargetRoot); err != nil {
		return PluginsStateFile{}, err
	}
	return snapshot.state, nil
}

func (s *Service) deploymentSnapshotForActivePluginLocked(
	trimmedPluginID string,
) (activePluginDeploymentSnapshot, error) {
	snapshot, err := s.rescanLocked()
	if err != nil {
		return activePluginDeploymentSnapshot{}, err
	}
	entry, ok := findRuntimeActiveEntry(snapshot.Plugins, trimmedPluginID)
	if !ok {
		return activePluginDeploymentSnapshot{}, newServiceError(
			ServiceErrorCodeNotFound,
			"Plugin not active: %s",
			trimmedPluginID,
		)
	}
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return activePluginDeploymentSnapshot{}, err
	}

	deploymentState := PluginsStateFile{
		EnabledPluginIDs: []string{entry.PluginID},
	}
	currentConfig := pluginConfigSnapshotWithDuplicateFallback(
		snapshot.Plugins,
		entry,
		&state,
	).Config
	if len(currentConfig) != 0 {
		deploymentState.PluginConfigByID = map[string]any{
			pluginConfigKey(entry.PluginID, PluginScopeWorkspace): currentConfig,
		}
	}

	return activePluginDeploymentSnapshot{
		entry: entry,
		state: normalizePluginsStateFile(deploymentState),
	}, nil
}

func packagePluginSourceForDeployment(entry DiscoveredPlugin, targetRoot string) error {
	if strings.TrimSpace(entry.SourcePath) == "" {
		return fmt.Errorf("%w: empty plugin source path", ErrPluginRootInvalid)
	}
	if err := removePluginTarget(targetRoot); err != nil {
		return err
	}
	if err := CopyDirectoryTree(entry.SourcePath, targetRoot); err != nil {
		return err
	}
	if !packageManagerPythonBackendInstallPayloadRequired(entry, targetRoot) {
		return nil
	}
	return copyPythonBackendInstallPayload(
		filepath.Dir(entry.SourcePath),
		entry.SourcePath,
		targetRoot,
	)
}

func packageManagerPythonBackendInstallPayloadRequired(
	entry DiscoveredPlugin,
	targetRoot string,
) bool {
	if entry.SourceManager != PluginSourceManagerPackageManager || entry.Manifest == nil {
		return false
	}
	if !manifestUsesPythonBackend(*entry.Manifest) {
		return false
	}
	return !directoryContainsFiles(filepath.Join(targetRoot, pythonBackendSitePackagesDirName))
}
