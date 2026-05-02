package plugins

import (
	"context"
	"strings"
	"sync"

	"setta/internal/buildinfo"
	"setta/internal/config"
	"setta/internal/pythonenv"
)

const unverifiedSourceWarning = "Source is unverified. Install only from trusted owners."

type CandidateProvider interface {
	ResolveCandidate(ctx context.Context, spec ParsedSourceSpec, installer PluginInstallerBackend) (CandidatePlugin, error)
}

type RestartCallback func(context.Context) (bool, error)

type ServiceOptions struct {
	Store                     *Store
	DiscoveryService          *DiscoveryService
	WorkspaceRoot             string
	SettaFilesRoot            string
	SettaHome                 string
	ServerMode                config.Mode
	RestartCommand            string
	RestartCallback           RestartCallback
	SettaVersion              string
	CandidateProvider         CandidateProvider
	PackageManagerRuntime     *pythonenv.Runtime
	PackageManagerSearchPaths []string
}

type Service struct {
	store             *Store
	discoveryService  *DiscoveryService
	candidateProvider CandidateProvider
	restartCommand    string
	restartCallback   RestartCallback
	settaVersion      string
	settaFilesRoot    string

	mu                          sync.Mutex
	installTargetReservations   map[string]struct{}
	pendingRestartRemovedPlugin map[string]PendingRestartRemovedBackendPlugin
}

type preparedInstall struct {
	scope                           PluginScope
	sourceSpec                      string
	installer                       PluginInstallerBackend
	candidate                       CandidatePlugin
	targetPath                      string
	enable                          bool
	force                           bool
	hasExistingEntry                bool
	existingEntryBackend            bool
	existingEntryLanguageServerOnly bool
	skipLookupRescan                bool
	skipFinalRescan                 bool
}

type preparedRollback struct {
	pluginID                       string
	scope                          PluginScope
	targetPath                     string
	snapshotPath                   string
	snapshotManifest               PluginManifest
	snapshotDigest                 string
	metadata                       PluginInstallMetadataFile
	metadataEntry                  PluginInstallMetadataEntry
	currentEntryHadBackend         bool
	currentEntryLanguageServerOnly bool
}

type preparedUninstall struct {
	scope           PluginScope
	entry           DiscoveredPlugin
	targetPath      string
	skipFinalRescan bool
}

func NewService(options ServiceOptions) (*Service, error) {
	store := options.Store
	if store == nil {
		var err error
		store, err = NewStore(StoreOptions{
			WorkspaceRoot:  options.WorkspaceRoot,
			SettaFilesRoot: options.SettaFilesRoot,
			SettaHome:      options.SettaHome,
		})
		if err != nil {
			return nil, err
		}
	}

	discoveryService := options.DiscoveryService
	if discoveryService == nil {
		var err error
		discoveryService, err = NewDiscoveryService(DiscoveryServiceOptions{
			Store:                     store,
			ServerMode:                options.ServerMode,
			PackageManagerRuntime:     options.PackageManagerRuntime,
			PackageManagerSearchPaths: options.PackageManagerSearchPaths,
		})
		if err != nil {
			return nil, err
		}
	}

	return &Service{
		store:                       store,
		discoveryService:            discoveryService,
		candidateProvider:           options.CandidateProvider,
		restartCommand:              defaultRestartCommand(options.RestartCommand),
		restartCallback:             options.RestartCallback,
		settaVersion:                resolvedSettaVersion(options.SettaVersion),
		settaFilesRoot:              strings.TrimSpace(options.SettaFilesRoot),
		installTargetReservations:   map[string]struct{}{},
		pendingRestartRemovedPlugin: map[string]PendingRestartRemovedBackendPlugin{},
	}, nil
}

func (s *Service) SetRestartCallback(callback RestartCallback) {
	if s == nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.restartCallback = callback
}

func resolvedSettaVersion(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed != "" {
		return trimmed
	}
	return buildinfo.HostPackageVersion()
}

func (s *Service) Rescan() (DiscoverySnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.rescanLocked()
}

func (s *Service) PreviewBackendRuntimeRefresh() (DiscoverySnapshot, error) {
	if s == nil {
		return DiscoverySnapshot{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return DiscoverySnapshot{}, err
	}
	globalState, err := s.store.LoadPluginsGlobalState()
	if err != nil {
		return DiscoverySnapshot{}, err
	}

	state.PendingRestartBackendPluginIDs = nil
	state.PendingRestartLanguageServerOnlyPluginIDs = nil
	return s.discoveryService.rescanWithStates(state, globalState)
}

func (s *Service) CommitBackendRuntimeRefresh() (DiscoverySnapshot, error) {
	if s == nil {
		return DiscoverySnapshot{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return DiscoverySnapshot{}, err
	}

	stateChanged := len(state.PendingRestartBackendPluginIDs) != 0 || len(state.PendingRestartLanguageServerOnlyPluginIDs) != 0
	if stateChanged {
		state.PendingRestartBackendPluginIDs = nil
		state.PendingRestartLanguageServerOnlyPluginIDs = nil
		if err := s.store.SavePluginsState(state); err != nil {
			return DiscoverySnapshot{}, err
		}
	}
	if len(s.pendingRestartRemovedPlugin) != 0 {
		s.pendingRestartRemovedPlugin = map[string]PendingRestartRemovedBackendPlugin{}
	}

	return s.rescanLocked()
}

func (s *Service) CommitAppliedLanguageServerPlugins(pluginIDs []string) error {
	if s == nil {
		return ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	state, err := s.store.LoadPluginsState()
	if err != nil {
		return err
	}
	if len(state.PendingRestartLanguageServerOnlyPluginIDs) == 0 {
		return nil
	}

	removablePendingIDs := selectedPendingRestartLanguageServerOnlyPluginIDs(
		state.PendingRestartLanguageServerOnlyPluginIDs,
		pluginIDs,
	)
	if len(removablePendingIDs) == 0 {
		return nil
	}

	state.PendingRestartBackendPluginIDs = removeStrings(
		state.PendingRestartBackendPluginIDs,
		removablePendingIDs,
	)
	state.PendingRestartLanguageServerOnlyPluginIDs = removeStrings(
		state.PendingRestartLanguageServerOnlyPluginIDs,
		removablePendingIDs,
	)
	if err := s.store.SavePluginsState(state); err != nil {
		return err
	}
	for pluginID := range removablePendingIDs {
		delete(s.pendingRestartRemovedPlugin, pluginID)
	}
	return nil
}
