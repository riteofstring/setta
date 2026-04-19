package plugins

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"

	"setta/internal/config"
	"setta/internal/pythonenv"
)

type DiscoveryServiceOptions struct {
	Store                     *Store
	WorkspaceRoot             string
	SettaFilesRoot            string
	SettaHome                 string
	ServerMode                config.Mode
	PackageManagerRuntime     *pythonenv.Runtime
	PackageManagerSearchPaths []string
}

type DiscoverySnapshot struct {
	ServerMode       config.Mode
	InstalledPlugins int
	ActivePlugins    int
	Plugins          []DiscoveredPlugin
}

type DiscoveryService struct {
	store                     *Store
	serverMode                config.Mode
	packageManagerRuntime     *pythonenv.Runtime
	packageManagerSearchPaths []string
}

func NewDiscoveryService(options DiscoveryServiceOptions) (*DiscoveryService, error) {
	store := options.Store
	var err error
	if store == nil {
		store, err = NewStore(StoreOptions{
			WorkspaceRoot:  options.WorkspaceRoot,
			SettaFilesRoot: options.SettaFilesRoot,
			SettaHome:      options.SettaHome,
		})
		if err != nil {
			return nil, err
		}
	}

	if options.ServerMode == "" {
		return nil, ErrFilesystemWorkerSpecResolverServerModeRequired
	}
	if _, ok := resolverModeAllowedCapabilities[options.ServerMode]; !ok {
		return nil, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverServerModeInvalid, options.ServerMode)
	}

	return &DiscoveryService{
		store:                     store,
		serverMode:                options.ServerMode,
		packageManagerRuntime:     options.PackageManagerRuntime,
		packageManagerSearchPaths: append([]string(nil), options.PackageManagerSearchPaths...),
	}, nil
}

func (s *DiscoveryService) Rescan() (DiscoverySnapshot, error) {
	if s == nil {
		return DiscoverySnapshot{}, ErrWorkspaceRootRequired
	}

	pluginsState, err := s.store.LoadPluginsState()
	if err != nil {
		return DiscoverySnapshot{}, err
	}
	globalState, err := s.store.LoadPluginsGlobalState()
	if err != nil {
		return DiscoverySnapshot{}, err
	}
	return s.rescanWithStates(pluginsState, globalState)
}

func (s *DiscoveryService) rescanWithStates(
	pluginsState PluginsStateFile,
	globalState PluginsGlobalStateFile,
) (DiscoverySnapshot, error) {
	entries, err := s.discoverPluginEntries()
	if err != nil {
		return DiscoverySnapshot{}, err
	}
	resolvedEntries, err := s.resolveDiscoveredEntries(entries, pluginsState, globalState)
	if err != nil {
		return DiscoverySnapshot{}, err
	}
	installedCount, activeCount := countDiscoverySnapshotEntries(resolvedEntries)

	return DiscoverySnapshot{
		ServerMode:       s.serverMode,
		InstalledPlugins: installedCount,
		ActivePlugins:    activeCount,
		Plugins:          resolvedEntries,
	}, nil
}

func (s *DiscoveryService) discoverPluginEntries() ([]DiscoveredPlugin, error) {
	installMetadata, err := s.store.LoadInstallMetadata()
	if err != nil {
		return nil, err
	}
	entries, err := s.discoverFilesystemPlugins(installMetadata)
	if err != nil {
		return nil, err
	}
	packageManagerEntries, err := s.discoverPackageManagerPlugins()
	if err != nil {
		return nil, err
	}
	return append(entries, packageManagerEntries...), nil
}

func (s *DiscoveryService) resolveDiscoveredEntries(
	entries []DiscoveredPlugin,
	pluginsState PluginsStateFile,
	globalState PluginsGlobalStateFile,
) ([]DiscoveredPlugin, error) {
	grouped := map[string][]DiscoveredPlugin{}
	for _, entry := range entries {
		grouped[entry.PluginID] = append(grouped[entry.PluginID], entry)
	}

	pluginIDs := make([]string, 0, len(grouped))
	for pluginID := range grouped {
		pluginIDs = append(pluginIDs, pluginID)
	}
	slices.Sort(pluginIDs)

	resolvedEntries := make([]DiscoveredPlugin, 0, len(entries))
	for _, pluginID := range pluginIDs {
		group, err := s.resolveDiscoveredGroup(grouped[pluginID], pluginsState, globalState)
		if err != nil {
			return nil, err
		}
		resolvedEntries = append(resolvedEntries, group...)
	}
	return resolvedEntries, nil
}

func (s *DiscoveryService) resolveDiscoveredGroup(
	group []DiscoveredPlugin,
	pluginsState PluginsStateFile,
	globalState PluginsGlobalStateFile,
) ([]DiscoveredPlugin, error) {
	slices.SortFunc(group, compareDiscoveredPlugins)
	if len(group) == 0 {
		return group, nil
	}

	primaryIndex := -1
	for index, entry := range group {
		resolved, err := s.resolveUnshadowedDiscoveredEntry(entry, pluginsState, globalState)
		if err != nil {
			return nil, err
		}
		group[index] = resolved
		if discoveredPluginCanShadowLowerEntries(resolved) {
			primaryIndex = index
			break
		}
	}

	if primaryIndex < 0 {
		primaryIndex = 0
	}
	markShadowedDiscoveredPlugins(group, group[primaryIndex].SourcePath, primaryIndex+1)
	return group, nil
}

func (s *DiscoveryService) resolveUnshadowedDiscoveredEntry(
	entry DiscoveredPlugin,
	pluginsState PluginsStateFile,
	globalState PluginsGlobalStateFile,
) (DiscoveredPlugin, error) {
	resolvePrimaryPluginState(&entry, pluginsState, globalState, s.serverMode)
	if err := s.populateBackendRegistrations(&entry); err != nil {
		entry.Errors = append(entry.Errors, PluginErrorInfo{
			Code:    string(ServiceErrorCodeBackendRuntimeInvalid),
			Message: err.Error(),
		})
		entry.State = PluginRuntimeStateInvalid
		entry.RestartRequired = false
	}
	return entry, nil
}

func markShadowedDiscoveredPlugins(group []DiscoveredPlugin, primarySourcePath string, startIndex int) {
	for index := startIndex; index < len(group); index++ {
		group[index].State = PluginRuntimeStateShadowed
		group[index].ShadowedBySourcePath = primarySourcePath
		group[index].RestartRequired = false
	}
}

func discoveredPluginCanShadowLowerEntries(entry DiscoveredPlugin) bool {
	return entry.State != PluginRuntimeStateInvalid
}

func countDiscoverySnapshotEntries(entries []DiscoveredPlugin) (int, int) {
	installedCount := 0
	activeCount := 0
	for _, entry := range entries {
		if entry.State == PluginRuntimeStateActive || entry.State == PluginRuntimeStatePendingRestart {
			activeCount++
		}
		if entry.ShadowedBySourcePath != "" {
			continue
		}
		switch entry.State {
		case PluginRuntimeStateActive, PluginRuntimeStatePendingRestart, PluginRuntimeStateDisabled, PluginRuntimeStateInvalid:
			installedCount++
		}
	}
	return installedCount, activeCount
}

func (s *DiscoveryService) discoverFilesystemPlugins(metadata PluginInstallMetadataFile) ([]DiscoveredPlugin, error) {
	entries := []DiscoveredPlugin{}
	for _, scope := range []PluginScope{PluginScopeWorkspace, PluginScopeSettaFiles, PluginScopeGlobal} {
		root := s.store.scopeRoot(scope)
		children, err := os.ReadDir(root)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("read plugin root %s: %w", root, err)
		}
		for _, child := range children {
			if !child.IsDir() && child.Type()&os.ModeSymlink == 0 {
				continue
			}
			childPath := filepath.Join(root, child.Name())
			entry, err := s.discoverFilesystemPlugin(scope, childPath, metadata)
			if err != nil {
				return nil, err
			}
			entries = append(entries, entry)
		}
	}
	return entries, nil
}

func (s *DiscoveryService) discoverFilesystemPlugin(scope PluginScope, pluginRoot string, metadata PluginInstallMetadataFile) (DiscoveredPlugin, error) {
	pluginID := filepath.Base(pluginRoot)
	canonicalSourceKey := fmt.Sprintf("local:%s", pluginRoot)
	if metadataEntry, ok := metadata.Entries[metadataKey(scope, pluginID)]; ok {
		canonicalSourceKey = metadataEntry.CanonicalSourceKey
	}

	manifestPath := filepath.Join(pluginRoot, pluginManifestFileName)
	if _, err := os.Stat(manifestPath); err != nil {
		if os.IsNotExist(err) {
			return DiscoveredPlugin{
				PluginID:           pluginID,
				Name:               pluginID,
				Version:            "unknown",
				Scope:              scope,
				SourcePath:         pluginRoot,
				CanonicalSourceKey: canonicalSourceKey,
				SourceManager:      PluginSourceManagerSetta,
				Errors: []PluginErrorInfo{
					{
						Code:    "PLUGIN_SOURCE_MANIFEST_NOT_FOUND",
						Message: fmt.Sprintf("Manifest not found: %s", manifestPath),
					},
				},
				State: PluginRuntimeStateInvalid,
			}, nil
		}
		return DiscoveredPlugin{}, fmt.Errorf("stat plugin manifest %s: %w", manifestPath, err)
	}

	manifest, err := LoadPluginManifest(pluginRoot, pluginID)
	if err != nil {
		return DiscoveredPlugin{
			PluginID:           pluginID,
			Name:               pluginID,
			Version:            "unknown",
			Scope:              scope,
			SourcePath:         pluginRoot,
			CanonicalSourceKey: canonicalSourceKey,
			SourceManager:      PluginSourceManagerSetta,
			Errors: []PluginErrorInfo{
				{
					Code:    "PLUGIN_MANIFEST_INVALID",
					Message: err.Error(),
				},
			},
			State: PluginRuntimeStateInvalid,
		}, nil
	}

	if metadataEntry, ok := metadata.Entries[metadataKey(scope, manifest.ID)]; ok {
		canonicalSourceKey = metadataEntry.CanonicalSourceKey
	}
	if err := ValidatePluginManifestPaths(pluginRoot, manifest); err != nil {
		return DiscoveredPlugin{
			PluginID:           pluginID,
			Name:               pluginID,
			Version:            "unknown",
			Scope:              scope,
			SourcePath:         pluginRoot,
			CanonicalSourceKey: canonicalSourceKey,
			SourceManager:      PluginSourceManagerSetta,
			Errors: []PluginErrorInfo{
				{
					Code:    "PLUGIN_MANIFEST_INVALID",
					Message: err.Error(),
				},
			},
			State: PluginRuntimeStateInvalid,
		}, nil
	}

	digest, err := computeDirectoryDigest(pluginRoot)
	if err != nil {
		return DiscoveredPlugin{}, err
	}

	return DiscoveredPlugin{
		PluginID:           manifest.ID,
		Name:               manifest.Name,
		Version:            manifest.Version,
		Scope:              scope,
		SourcePath:         pluginRoot,
		Manifest:           &manifest,
		CanonicalSourceKey: canonicalSourceKey,
		SourceDigestSHA256: stringPtr(digest),
		SourceManager:      PluginSourceManagerSetta,
	}, nil
}

func compareDiscoveredPlugins(left DiscoveredPlugin, right DiscoveredPlugin) int {
	if diff := compareScopeOrder(left.Scope, right.Scope); diff != 0 {
		return diff
	}
	if diff := compareSourceManagerOrder(left.SourceManager, right.SourceManager); diff != 0 {
		return diff
	}
	if left.SourcePath < right.SourcePath {
		return -1
	}
	if left.SourcePath > right.SourcePath {
		return 1
	}
	return 0
}

func compareScopeOrder(left PluginScope, right PluginScope) int {
	return scopeOrder(left) - scopeOrder(right)
}

func scopeOrder(scope PluginScope) int {
	switch scope {
	case PluginScopeWorkspace:
		return 0
	case PluginScopeSettaFiles:
		return 1
	default:
		return 2
	}
}

func compareSourceManagerOrder(left PluginSourceManager, right PluginSourceManager) int {
	return sourceManagerOrder(left) - sourceManagerOrder(right)
}

func sourceManagerOrder(sourceManager PluginSourceManager) int {
	switch sourceManager {
	case PluginSourceManagerSetta:
		return 0
	default:
		return 1
	}
}

func resolvePrimaryPluginState(entry *DiscoveredPlugin, pluginsState PluginsStateFile, globalState PluginsGlobalStateFile, serverMode config.Mode) {
	if entry == nil {
		return
	}
	if entry.Manifest == nil || len(entry.Errors) > 0 {
		entry.State = PluginRuntimeStateInvalid
		return
	}

	requestedCapabilities, effectiveCapabilities, blockedCapabilities, err := resolveFilesystemPluginCapabilities(entry.Manifest.Capabilities, serverMode)
	if err != nil {
		entry.Errors = append(entry.Errors, PluginErrorInfo{
			Code:    "PLUGIN_MANIFEST_INVALID",
			Message: err.Error(),
		})
		entry.State = PluginRuntimeStateInvalid
		return
	}
	entry.RequestedCapabilities = requestedCapabilities
	entry.EffectiveCapabilities = effectiveCapabilities
	entry.BlockedCapabilities = blockedCapabilities
	if err := validatePersistedPluginConfigRoot(entry, pluginsState); err != nil {
		entry.Errors = append(entry.Errors, PluginErrorInfo{
			Code:    string(ServiceErrorCodeConfigInvalid),
			Message: err.Error(),
		})
		entry.State = PluginRuntimeStateInvalid
		return
	}
	if err := validateDiscoveredPluginConfigSchema(*entry); err != nil {
		entry.Errors = append(entry.Errors, PluginErrorInfo{
			Code:    string(ServiceErrorCodeConfigSchemaInvalid),
			Message: err.Error(),
		})
		entry.State = PluginRuntimeStateInvalid
		return
	}

	if containsString(pluginsState.PendingRestartBackendPluginIDs, entry.PluginID) {
		entry.State = PluginRuntimeStatePendingRestart
		entry.RestartRequired = true
		return
	}

	enabled, enablementSource := resolveFilesystemPluginEnabledWithSource(
		entry.PluginID,
		entry.Scope,
		entry.Manifest.EnabledByDefault,
		pluginsState,
		globalState,
	)
	entry.EnablementSource = &enablementSource
	if !enabled {
		entry.State = PluginRuntimeStateDisabled
		entry.RestartRequired = false
		return
	}

	entry.State = PluginRuntimeStateActive
	entry.RestartRequired = false
}

func validatePersistedPluginConfigRoot(entry *DiscoveredPlugin, pluginsState PluginsStateFile) error {
	if entry == nil || pluginsState.PluginConfigByID == nil {
		return nil
	}
	rawValue, ok := pluginsState.PluginConfigByID[pluginConfigKey(entry.PluginID, entry.Scope)]
	if !ok || rawValue == nil {
		return nil
	}
	if _, ok := rawValue.(map[string]any); ok {
		return nil
	}
	return newServiceError(ServiceErrorCodeConfigInvalid, "Plugin config for %s must be a JSON object.", entry.PluginID)
}

func (s *DiscoveryService) populateBackendRegistrations(entry *DiscoveredPlugin) error {
	resetBackendRegistrations(entry)
	if !shouldPopulateBackendRegistrations(entry) {
		return nil
	}
	probe, err := s.probeBackendRegistrations(entry)
	if err != nil {
		return err
	}
	applyBackendProbeRegistrations(entry, probe)
	return nil
}

func resetBackendRegistrations(entry *DiscoveredPlugin) {
	if entry == nil {
		return
	}
	entry.RegisteredCodegenTargets = []PluginRegisteredCodegenTarget{}
	entry.RegisteredLanguageServers = []PluginRegisteredLanguageServer{}
	entry.RegisteredUISettings = []PluginRegisteredUISetting{}
	entry.RegisteredBackendRoutes = []PluginRegisteredBackendRoute{}
	entry.RegisteredStaticDirs = []PluginRegisteredStaticDir{}
	entry.RegisteredListenerEndpoints = []PluginRegisteredListenerEndpoint{}
}

func shouldPopulateBackendRegistrations(entry *DiscoveredPlugin) bool {
	if entry == nil || entry.Manifest == nil || !entry.HasBackend() || len(entry.Errors) != 0 {
		return false
	}
	return backendProbeRequired(entry.RequestedCapabilities)
}

func (s *DiscoveryService) probeBackendRegistrations(entry *DiscoveredPlugin) (backendProbeResponse, error) {
	return probeGoBackendRegistrations(
		entry.SourcePath,
		*entry.Manifest,
		filepath.Join(s.store.settaFilesRoot, backendProbeBuildRootName),
	)
}

func applyBackendProbeRegistrations(entry *DiscoveredPlugin, probe backendProbeResponse) {
	if entry == nil {
		return
	}
	if containsString(entry.EffectiveCapabilities, "registerCodegenTarget") {
		entry.RegisteredCodegenTargets = probe.CodegenTargets
	}
	if containsString(entry.EffectiveCapabilities, "registerLanguageServer") {
		entry.RegisteredLanguageServers = probe.LanguageServers
	}
	entry.RegisteredUISettings = cloneRegisteredUISettings(probe.UISettings)
	if containsString(entry.EffectiveCapabilities, "registerRouter") {
		entry.RegisteredBackendRoutes = probe.Routes
	}
	if containsString(entry.EffectiveCapabilities, "registerStaticDir") {
		entry.RegisteredStaticDirs = probe.StaticDirs
	}
	if containsString(entry.EffectiveCapabilities, "registerListenerEndpoint") {
		entry.RegisteredListenerEndpoints = probe.ListenerEndpoints
	}
}

func resolveFilesystemPluginEnabledWithSource(
	pluginID string,
	scope PluginScope,
	manifestEnabledByDefault bool,
	pluginsState PluginsStateFile,
	globalState PluginsGlobalStateFile,
) (bool, PluginEnablementSource) {
	if containsString(pluginsState.DisabledPluginIDs, pluginID) {
		return false, PluginEnablementSourceWorkspaceDisabled
	}
	if containsString(pluginsState.EnabledPluginIDs, pluginID) {
		return true, PluginEnablementSourceWorkspaceEnabled
	}
	if scope == PluginScopeGlobal && containsString(globalState.AutoEnabledPluginIDs, pluginID) {
		return true, PluginEnablementSourceGlobalAutoEnabled
	}
	if manifestEnabledByDefault {
		return true, PluginEnablementSourceManifestDefault
	}
	return false, PluginEnablementSourceManifestDefault
}
