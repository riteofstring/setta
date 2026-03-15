package plugins

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"setta/internal/config"
	"setta/internal/statefs"
)

var (
	ErrFilesystemWorkerSpecResolverWorkspaceRootRequired = ErrWorkspaceRootRequired
	ErrFilesystemWorkerSpecResolverSettaFilesRootNeeded  = ErrSettaFilesRootRequired
	ErrFilesystemWorkerSpecResolverSettaHomeRequired     = ErrSettaHomeRequired
	ErrFilesystemWorkerSpecResolverCommandPrefixRequired = errors.New("plugins: worker command prefix is required")
	ErrFilesystemWorkerSpecResolverServerModeRequired    = errors.New("plugins: server mode is required")
	ErrFilesystemWorkerSpecResolverServerModeInvalid     = errors.New("plugins: server mode is unsupported")
	ErrFilesystemWorkerSpecResolverTargetIDRequired      = errors.New("plugins: plugin codegen target id is required")
	ErrFilesystemWorkerSpecResolverTargetIDInvalid       = errors.New("plugins: plugin codegen target id must be <plugin-id>:<local-id>")
	ErrFilesystemWorkerSpecResolverPluginNotFound        = errors.New("plugins: plugin codegen target plugin was not found")
	ErrFilesystemWorkerSpecResolverPluginDisabled        = errors.New("plugins: plugin codegen target plugin is disabled")
	ErrFilesystemWorkerSpecResolverPluginRootInvalid     = ErrPluginRootInvalid
	ErrFilesystemWorkerSpecResolverManifestNotFound      = ErrPluginManifestNotFound
	ErrFilesystemWorkerSpecResolverManifestInvalid       = ErrPluginManifestInvalid
	ErrFilesystemWorkerSpecResolverManifestUnsupported   = ErrPluginManifestUnsupported
	ErrFilesystemWorkerSpecResolverBackendRequired       = errors.New("plugins: plugin backend entrypoint is required")
	ErrFilesystemWorkerSpecResolverCodegenCapability     = errors.New("plugins: registerCodegenTarget capability is required")
)

var (
	resolverKnownPluginCapabilities = map[string]struct{}{
		"registerSectionKinds":         {},
		"registerPane":                 {},
		"registerCommand":              {},
		"registerTopNavBarItem":        {},
		"registerContextMenu":          {},
		"readProjectState":             {},
		"subscribeProjectState":        {},
		"emitListenerEvents":           {},
		"registerMcpTools":             {},
		"registerLanguageServer":       {},
		"registerExternalAgentAdapter": {},
		"registerCodegenTarget":        {},
		"registerRouter":               {},
		"registerListenerEndpoint":     {},
		"registerStaticDir":            {},
		"writeWorkspacePlugins":        {},
	}
	resolverHostBlockedCapabilities = map[string]struct{}{
		"registerContextMenu":      {},
		"registerListenerEndpoint": {},
		"registerStaticDir":        {},
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

type FilesystemWorkerSpecResolverOptions struct {
	WorkspaceRoot    string
	SettaFilesRoot   string
	SettaHome        string
	RuntimeProvider  WorkerRuntimeProvider
	CommandPrefix    []string
	ServerMode       config.Mode
	Environment      []string
	WorkingDirectory string
}

type FilesystemWorkerSpecResolver struct {
	store           *Store
	runtimeProvider WorkerRuntimeProvider
	serverMode      config.Mode
}

type filesystemPluginManifest = PluginManifest
type filesystemPluginsState = PluginsStateFile
type filesystemPluginsGlobalState = PluginsGlobalStateFile
type filesystemPluginScope string

const (
	filesystemPluginScopeWorkspace  filesystemPluginScope = filesystemPluginScope(PluginScopeWorkspace)
	filesystemPluginScopeSettaFiles filesystemPluginScope = filesystemPluginScope(PluginScopeSettaFiles)
	filesystemPluginScopeGlobal     filesystemPluginScope = filesystemPluginScope(PluginScopeGlobal)
)

func NewFilesystemWorkerSpecResolver(options FilesystemWorkerSpecResolverOptions) (*FilesystemWorkerSpecResolver, error) {
	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  options.WorkspaceRoot,
		SettaFilesRoot: options.SettaFilesRoot,
		SettaHome:      options.SettaHome,
	})
	if err != nil {
		return nil, err
	}

	serverMode := options.ServerMode
	if serverMode == "" {
		return nil, ErrFilesystemWorkerSpecResolverServerModeRequired
	}
	if _, ok := resolverModeAllowedCapabilities[serverMode]; !ok {
		return nil, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverServerModeInvalid, serverMode)
	}

	runtimeProvider := options.RuntimeProvider
	if runtimeProvider == nil {
		commandPrefix, err := normalizeWorkerCommandPrefix(options.CommandPrefix)
		if err != nil {
			return nil, ErrFilesystemWorkerSpecResolverCommandPrefixRequired
		}

		workingDirectory := ""
		if strings.TrimSpace(options.WorkingDirectory) != "" {
			workingDirectory, err = statefs.NormalizePath(options.WorkingDirectory, "")
			if err != nil {
				return nil, fmt.Errorf("resolve plugin worker working directory: %w", err)
			}
		}

		runtimeProvider = WorkerRuntimeProviderFunc(func(context.Context) (WorkerRuntime, error) {
			return WorkerRuntime{
				CommandPrefix:    append([]string(nil), commandPrefix...),
				Environment:      append([]string(nil), options.Environment...),
				WorkingDirectory: workingDirectory,
			}, nil
		})
	}

	return &FilesystemWorkerSpecResolver{
		store:           store,
		runtimeProvider: runtimeProvider,
		serverMode:      serverMode,
	}, nil
}

func (r *FilesystemWorkerSpecResolver) ResolvePluginCodegenWorkerSpec(ctx context.Context, targetID string) (BackendWorkerSpec, error) {
	if r == nil {
		return BackendWorkerSpec{}, ErrFilesystemWorkerSpecResolverPluginNotFound
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return BackendWorkerSpec{}, err
	}

	pluginID, _, err := parsePluginCodegenTargetID(targetID)
	if err != nil {
		return BackendWorkerSpec{}, err
	}

	pluginsState, err := r.loadPluginsState()
	if err != nil {
		return BackendWorkerSpec{}, err
	}
	globalState, err := r.loadPluginsGlobalState()
	if err != nil {
		return BackendWorkerSpec{}, err
	}

	for _, candidate := range r.scopeCandidates(pluginID) {
		if err := ctx.Err(); err != nil {
			return BackendWorkerSpec{}, err
		}

		info, err := os.Stat(candidate.root)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return BackendWorkerSpec{}, fmt.Errorf("stat plugin root %s: %w", candidate.root, err)
		}
		if !info.IsDir() {
			return BackendWorkerSpec{}, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverPluginRootInvalid, candidate.root)
		}

		manifest, entrypoint, err := loadFilesystemPluginManifest(candidate.root, pluginID)
		if err != nil {
			return BackendWorkerSpec{}, err
		}
		if !resolveFilesystemPluginEnabled(pluginID, candidate.scope, manifest.EnabledByDefault, pluginsState, globalState) {
			return BackendWorkerSpec{}, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverPluginDisabled, pluginID)
		}

		requestedCapabilities, effectiveCapabilities, _, err := resolveFilesystemPluginCapabilities(manifest.Capabilities, r.serverMode)
		if err != nil {
			return BackendWorkerSpec{}, err
		}
		if !containsCapability(effectiveCapabilities, CapabilityRegisterCodegenTarget) {
			return BackendWorkerSpec{}, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverCodegenCapability, pluginID)
		}

		runtime, err := r.runtimeProvider.ResolveWorkerRuntime(ctx)
		if err != nil {
			return BackendWorkerSpec{}, err
		}

		return BackendWorkerSpec{
			CommandPrefix:         append([]string(nil), runtime.CommandPrefix...),
			PluginID:              manifest.ID,
			PluginVersion:         manifest.Version,
			PluginRoot:            candidate.root,
			Entrypoint:            entrypoint,
			ServerMode:            string(r.serverMode),
			RequestedCapabilities: requestedCapabilities,
			EffectiveCapabilities: effectiveCapabilities,
			Environment:           runtime.Environment,
			WorkingDirectory:      runtime.WorkingDirectory,
		}, nil
	}

	return BackendWorkerSpec{}, fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverPluginNotFound, pluginID)
}

type filesystemPluginScopeCandidate struct {
	scope filesystemPluginScope
	root  string
}

func (r *FilesystemWorkerSpecResolver) scopeCandidates(pluginID string) []filesystemPluginScopeCandidate {
	candidates, err := r.store.ScopeCandidates(pluginID)
	if err != nil {
		return nil
	}
	resolved := make([]filesystemPluginScopeCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		resolved = append(resolved, filesystemPluginScopeCandidate{
			scope: filesystemPluginScope(candidate.Scope),
			root:  candidate.Root,
		})
	}
	return resolved
}

func parsePluginCodegenTargetID(targetID string) (string, string, error) {
	trimmedTargetID := strings.TrimSpace(targetID)
	if trimmedTargetID == "" {
		return "", "", ErrFilesystemWorkerSpecResolverTargetIDRequired
	}
	pluginID, localTargetID, ok := strings.Cut(trimmedTargetID, ":")
	if !ok {
		return "", "", ErrFilesystemWorkerSpecResolverTargetIDInvalid
	}
	normalizedPluginID, err := normalizeFilesystemPluginID(pluginID)
	if err != nil {
		return "", "", err
	}
	if strings.TrimSpace(localTargetID) == "" {
		return "", "", ErrFilesystemWorkerSpecResolverTargetIDInvalid
	}
	return normalizedPluginID, strings.TrimSpace(localTargetID), nil
}

func loadFilesystemPluginManifest(pluginRoot string, expectedPluginID string) (filesystemPluginManifest, string, error) {
	manifest, err := LoadPluginManifest(pluginRoot, expectedPluginID)
	if err != nil {
		return filesystemPluginManifest{}, "", err
	}
	entrypoint, err := resolveFilesystemBackendEntrypoint(pluginRoot, manifest)
	if err != nil {
		return filesystemPluginManifest{}, "", err
	}
	return manifest, entrypoint, nil
}

func resolveFilesystemBackendEntrypoint(pluginRoot string, manifest filesystemPluginManifest) (string, error) {
	if manifest.Backend == nil {
		return "", fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverBackendRequired, manifest.ID)
	}
	entrypoint := strings.TrimSpace(manifest.Backend.Entrypoint)
	if entrypoint == "" {
		return "", fmt.Errorf("%w: %s", ErrFilesystemWorkerSpecResolverBackendRequired, manifest.ID)
	}
	resolvedEntrypoint, err := ResolvePluginBackendEntrypoint(pluginRoot, manifest)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrFilesystemWorkerSpecResolverBackendRequired, err)
	}
	return resolvedEntrypoint, nil
}

func normalizeFilesystemPluginID(raw string) (string, error) {
	return NormalizePluginID(raw)
}

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
			return nil, nil, nil, fmt.Errorf("%w: manifest capability must be non-empty", ErrFilesystemWorkerSpecResolverManifestInvalid)
		}
		if _, ok := resolverKnownPluginCapabilities[trimmedCapability]; !ok {
			return nil, nil, nil, fmt.Errorf("%w: unknown capability %q", ErrFilesystemWorkerSpecResolverManifestInvalid, trimmedCapability)
		}
		if _, exists := seen[trimmedCapability]; exists {
			return nil, nil, nil, fmt.Errorf("%w: duplicate capability %q", ErrFilesystemWorkerSpecResolverManifestInvalid, trimmedCapability)
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

func resolveFilesystemPluginEnabled(
	pluginID string,
	scope filesystemPluginScope,
	manifestEnabledByDefault bool,
	pluginsState filesystemPluginsState,
	globalState filesystemPluginsGlobalState,
) bool {
	if containsString(pluginsState.DisabledPluginIDs, pluginID) {
		return false
	}
	if containsString(pluginsState.EnabledPluginIDs, pluginID) {
		return true
	}
	if scope == filesystemPluginScopeGlobal && containsString(globalState.AutoEnabledPluginIDs, pluginID) {
		return true
	}
	return manifestEnabledByDefault
}

func (r *FilesystemWorkerSpecResolver) loadPluginsState() (filesystemPluginsState, error) {
	state, err := r.store.LoadPluginsState()
	if err != nil {
		return filesystemPluginsState{}, fmt.Errorf("load plugins state: %w", err)
	}
	return state, nil
}

func (r *FilesystemWorkerSpecResolver) loadPluginsGlobalState() (filesystemPluginsGlobalState, error) {
	state, err := r.store.LoadPluginsGlobalState()
	if err != nil {
		return filesystemPluginsGlobalState{}, fmt.Errorf("load plugins global state: %w", err)
	}
	return state, nil
}

func containsCapability(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
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
