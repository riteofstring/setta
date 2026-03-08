package plugins

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"

	"setta/internal/config"
)

type BackendRegistrationSource interface {
	SnapshotBackendRegistrations(context.Context, DiscoveredPlugin) PluginBackendRegistrationSnapshot
}

type PluginBackendRegistrationSnapshot struct {
	LanguageServers       []PluginRegisteredLanguageServer
	ExternalAgentAdapters []PluginRegisteredExternalAgentAdapter
	CodegenTargets        []PluginRegisteredCodegenTarget
	Errors                []PluginErrorInfo
}

type BackendLanguageServerRegistrar interface {
	RegisterLanguageServer(context.Context, RegisteredLanguageServer) error
}

type RegisteredLanguageServer struct {
	PluginID    string
	Name        string
	Language    string
	Command     string
	Args        []string
	SettingsKey *string
}

type LanguageServerRegistry struct {
	mu            sync.Mutex
	registrations []RegisteredLanguageServer
	byLanguage    map[string]RegisteredLanguageServer
}

type BackendExternalAgentAdapterRegistrar interface {
	RegisterExternalAgentAdapter(context.Context, RegisteredExternalAgentAdapter) error
}

type RegisteredExternalAgentAdapter struct {
	AdapterID       string
	PluginID        string
	Name            string
	RunModes        []string
	Command         string
	Args            []string
	EnvVarWhitelist []string
	DefaultModel    *string
}

type ExternalAgentAdapterRegistry struct {
	mu            sync.Mutex
	registrations []RegisteredExternalAgentAdapter
	byID          map[string]RegisteredExternalAgentAdapter
}

type BackendRegistrationLoaderOptions struct {
	RuntimeProvider WorkerRuntimeProvider
	ServerMode      config.Mode
}

type BackendRegistrationLoader struct {
	runtimeProvider WorkerRuntimeProvider
	serverMode      config.Mode

	mu            sync.Mutex
	cacheByPlugin map[string]backendRegistrationCacheEntry
}

var (
	ErrBackendRegistrationRuntimeProviderRequired = errors.New("plugins: backend registration runtime provider is required")
	ErrLanguageServerRegistrationConflict         = errors.New("plugins: duplicate language server registration")
	ErrExternalAgentAdapterRegistrationConflict   = errors.New("plugins: duplicate external agent adapter registration")
)

type backendRegistrationCacheEntry struct {
	cacheKey string
	snapshot PluginBackendRegistrationSnapshot
}

func NewLanguageServerRegistry() *LanguageServerRegistry {
	return &LanguageServerRegistry{
		byLanguage: map[string]RegisteredLanguageServer{},
	}
}

func (r *LanguageServerRegistry) RegisterLanguageServer(_ context.Context, registration RegisteredLanguageServer) error {
	if r == nil {
		return ErrWorkerHostLanguageServerRegistrarRequired
	}

	language := strings.TrimSpace(registration.Language)
	if language == "" {
		return ErrWorkerHostLanguageServerLanguageRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.byLanguage[language]; exists {
		return fmt.Errorf("%w: %s", ErrLanguageServerRegistrationConflict, language)
	}

	cloned := RegisteredLanguageServer{
		PluginID:    registration.PluginID,
		Name:        registration.Name,
		Language:    registration.Language,
		Command:     registration.Command,
		Args:        append([]string(nil), registration.Args...),
		SettingsKey: cloneOptionalString(registration.SettingsKey),
	}
	r.byLanguage[language] = cloned
	r.registrations = append(r.registrations, cloned)
	return nil
}

func (r *LanguageServerRegistry) Registrations() []RegisteredLanguageServer {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	registrations := make([]RegisteredLanguageServer, len(r.registrations))
	for index, registration := range r.registrations {
		registrations[index] = RegisteredLanguageServer{
			PluginID:    registration.PluginID,
			Name:        registration.Name,
			Language:    registration.Language,
			Command:     registration.Command,
			Args:        append([]string(nil), registration.Args...),
			SettingsKey: cloneOptionalString(registration.SettingsKey),
		}
	}
	return registrations
}

func NewExternalAgentAdapterRegistry() *ExternalAgentAdapterRegistry {
	return &ExternalAgentAdapterRegistry{
		byID: map[string]RegisteredExternalAgentAdapter{},
	}
}

func (r *ExternalAgentAdapterRegistry) RegisterExternalAgentAdapter(_ context.Context, registration RegisteredExternalAgentAdapter) error {
	if r == nil {
		return ErrWorkerHostExternalAgentRegistrarRequired
	}

	adapterID := strings.TrimSpace(registration.AdapterID)
	if adapterID == "" {
		return ErrWorkerHostExternalAgentAdapterIDRequired
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.byID[adapterID]; exists {
		return fmt.Errorf("%w: %s", ErrExternalAgentAdapterRegistrationConflict, adapterID)
	}

	cloned := RegisteredExternalAgentAdapter{
		AdapterID:       registration.AdapterID,
		PluginID:        registration.PluginID,
		Name:            registration.Name,
		RunModes:        append([]string(nil), registration.RunModes...),
		Command:         registration.Command,
		Args:            append([]string(nil), registration.Args...),
		EnvVarWhitelist: append([]string(nil), registration.EnvVarWhitelist...),
		DefaultModel:    cloneOptionalString(registration.DefaultModel),
	}
	r.byID[adapterID] = cloned
	r.registrations = append(r.registrations, cloned)
	return nil
}

func (r *ExternalAgentAdapterRegistry) Registrations() []RegisteredExternalAgentAdapter {
	if r == nil {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	registrations := make([]RegisteredExternalAgentAdapter, len(r.registrations))
	for index, registration := range r.registrations {
		registrations[index] = RegisteredExternalAgentAdapter{
			AdapterID:       registration.AdapterID,
			PluginID:        registration.PluginID,
			Name:            registration.Name,
			RunModes:        append([]string(nil), registration.RunModes...),
			Command:         registration.Command,
			Args:            append([]string(nil), registration.Args...),
			EnvVarWhitelist: append([]string(nil), registration.EnvVarWhitelist...),
			DefaultModel:    cloneOptionalString(registration.DefaultModel),
		}
	}
	return registrations
}

func NewBackendRegistrationLoader(options BackendRegistrationLoaderOptions) (*BackendRegistrationLoader, error) {
	if options.RuntimeProvider == nil {
		return nil, ErrBackendRegistrationRuntimeProviderRequired
	}
	if options.ServerMode == "" {
		return nil, ErrFilesystemWorkerSpecResolverServerModeRequired
	}
	return &BackendRegistrationLoader{
		runtimeProvider: options.RuntimeProvider,
		serverMode:      options.ServerMode,
		cacheByPlugin:   map[string]backendRegistrationCacheEntry{},
	}, nil
}

func (l *BackendRegistrationLoader) SnapshotBackendRegistrations(ctx context.Context, entry DiscoveredPlugin) PluginBackendRegistrationSnapshot {
	if l == nil || l.runtimeProvider == nil {
		return PluginBackendRegistrationSnapshot{}
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if !shouldLoadBackendRegistrations(entry) {
		return PluginBackendRegistrationSnapshot{}
	}

	cacheKey := backendRegistrationCacheKey(entry, l.serverMode)

	l.mu.Lock()
	if cached, ok := l.cacheByPlugin[entry.PluginID]; ok && cached.cacheKey == cacheKey {
		snapshot := clonePluginBackendRegistrationSnapshot(cached.snapshot)
		l.mu.Unlock()
		return snapshot
	}
	l.mu.Unlock()

	snapshot := l.loadRegistrations(ctx, entry)

	l.mu.Lock()
	l.cacheByPlugin[entry.PluginID] = backendRegistrationCacheEntry{
		cacheKey: cacheKey,
		snapshot: clonePluginBackendRegistrationSnapshot(snapshot),
	}
	l.mu.Unlock()
	return snapshot
}

func shouldLoadBackendRegistrations(entry DiscoveredPlugin) bool {
	if entry.ShadowedBySourcePath != "" {
		return false
	}
	if entry.Manifest == nil || entry.Manifest.Backend == nil {
		return false
	}
	if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
		return false
	}
	return containsCapability(entry.EffectiveCapabilities, CapabilityRegisterLanguageServer) ||
		containsCapability(entry.EffectiveCapabilities, CapabilityRegisterExternalAgentAdapter) ||
		containsCapability(entry.EffectiveCapabilities, CapabilityRegisterCodegenTarget)
}

func backendRegistrationCacheKey(entry DiscoveredPlugin, serverMode config.Mode) string {
	payload := struct {
		ServerMode            config.Mode               `json:"serverMode"`
		PluginID              string                    `json:"pluginId"`
		Version               string                    `json:"version"`
		State                 PluginRuntimeState        `json:"state"`
		SourcePath            string                    `json:"sourcePath"`
		SourceDigestSHA256    *string                   `json:"sourceDigestSha256"`
		RequestedCapabilities []string                  `json:"requestedCapabilities"`
		EffectiveCapabilities []string                  `json:"effectiveCapabilities"`
		BlockedCapabilities   []PluginBlockedCapability `json:"blockedCapabilities"`
		BackendEntrypoint     string                    `json:"backendEntrypoint"`
	}{
		ServerMode:            serverMode,
		PluginID:              entry.PluginID,
		Version:               entry.Version,
		State:                 entry.State,
		SourcePath:            entry.SourcePath,
		SourceDigestSHA256:    cloneOptionalString(entry.SourceDigestSHA256),
		RequestedCapabilities: append([]string(nil), entry.RequestedCapabilities...),
		EffectiveCapabilities: append([]string(nil), entry.EffectiveCapabilities...),
		BlockedCapabilities:   append([]PluginBlockedCapability(nil), entry.BlockedCapabilities...),
	}
	if entry.Manifest != nil && entry.Manifest.Backend != nil {
		payload.BackendEntrypoint = entry.Manifest.Backend.Entrypoint
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func (l *BackendRegistrationLoader) loadRegistrations(ctx context.Context, entry DiscoveredPlugin) PluginBackendRegistrationSnapshot {
	runtime, err := l.runtimeProvider.ResolveWorkerRuntime(ctx)
	if err != nil {
		return pluginBackendRegistrationFailureSnapshot(entry, err)
	}
	entrypoint, err := resolveManifestRegularFile(entry.SourcePath, entry.Manifest.Backend.Entrypoint, "plugin backend entrypoint")
	if err != nil {
		return pluginBackendRegistrationFailureSnapshot(entry, err)
	}

	languageServers := NewLanguageServerRegistry()
	externalAgentAdapters := NewExternalAgentAdapterRegistry()
	codegenTargets := NewCodegenTargetRegistry()
	routers := NewBackendRouterRegistry()
	host, err := NewWorkerHost(WorkerHostOptions{
		RouterRegistrar:               routers,
		LanguageServerRegistrar:       languageServers,
		ExternalAgentAdapterRegistrar: externalAgentAdapters,
		CodegenTargetRegistrar:        codegenTargets,
	})
	if err != nil {
		return pluginBackendRegistrationFailureSnapshot(entry, err)
	}
	launcher, err := NewWorkerLauncher(WorkerLauncherOptions{Host: host})
	if err != nil {
		return pluginBackendRegistrationFailureSnapshot(entry, err)
	}

	started, err := launcher.StartAndRegister(ctx, BackendWorkerSpec{
		PythonBinary:          runtime.PythonBinary,
		PluginID:              entry.PluginID,
		PluginVersion:         entry.Version,
		PluginRoot:            entry.SourcePath,
		Entrypoint:            entrypoint,
		ServerMode:            string(l.serverMode),
		RequestedCapabilities: append([]string(nil), entry.RequestedCapabilities...),
		EffectiveCapabilities: append([]string(nil), entry.EffectiveCapabilities...),
		Environment:           append([]string(nil), runtime.Environment...),
		WorkingDirectory:      runtime.WorkingDirectory,
	})
	if err != nil {
		return pluginBackendRegistrationFailureSnapshot(entry, err)
	}

	snapshot := PluginBackendRegistrationSnapshot{
		LanguageServers:       serializeRegisteredLanguageServers(languageServers.Registrations()),
		ExternalAgentAdapters: serializeRegisteredExternalAgentAdapters(externalAgentAdapters.Registrations()),
		CodegenTargets:        serializeRegisteredCodegenTargets(codegenTargets.Registrations()),
	}
	if closeErr := started.Close(); closeErr != nil {
		snapshot.Errors = append(snapshot.Errors, pluginBackendRegistrationError(entry, closeErr))
	}
	return snapshot
}

func serializeRegisteredLanguageServers(registrations []RegisteredLanguageServer) []PluginRegisteredLanguageServer {
	if len(registrations) == 0 {
		return []PluginRegisteredLanguageServer{}
	}

	serialized := make([]PluginRegisteredLanguageServer, 0, len(registrations))
	for _, registration := range registrations {
		serialized = append(serialized, PluginRegisteredLanguageServer{
			Name:        registration.Name,
			Language:    registration.Language,
			Command:     registration.Command,
			Args:        append([]string(nil), registration.Args...),
			SettingsKey: cloneOptionalString(registration.SettingsKey),
		})
	}
	sort.Slice(serialized, func(left int, right int) bool {
		return serialized[left].Language < serialized[right].Language
	})
	return serialized
}

func serializeRegisteredExternalAgentAdapters(registrations []RegisteredExternalAgentAdapter) []PluginRegisteredExternalAgentAdapter {
	if len(registrations) == 0 {
		return []PluginRegisteredExternalAgentAdapter{}
	}

	serialized := make([]PluginRegisteredExternalAgentAdapter, 0, len(registrations))
	for _, registration := range registrations {
		serialized = append(serialized, PluginRegisteredExternalAgentAdapter{
			AdapterID:       registration.AdapterID,
			PluginID:        registration.PluginID,
			Name:            registration.Name,
			RunModes:        append([]string(nil), registration.RunModes...),
			Command:         registration.Command,
			Args:            append([]string(nil), registration.Args...),
			EnvVarWhitelist: append([]string(nil), registration.EnvVarWhitelist...),
			DefaultModel:    cloneOptionalString(registration.DefaultModel),
		})
	}
	sort.Slice(serialized, func(left int, right int) bool {
		return serialized[left].AdapterID < serialized[right].AdapterID
	})
	return serialized
}

func serializeRegisteredCodegenTargets(registrations []RegisteredCodegenTarget) []PluginRegisteredCodegenTarget {
	if len(registrations) == 0 {
		return []PluginRegisteredCodegenTarget{}
	}

	serialized := make([]PluginRegisteredCodegenTarget, 0, len(registrations))
	for _, registration := range registrations {
		serialized = append(serialized, PluginRegisteredCodegenTarget{
			TargetID:        registration.TargetID,
			PluginID:        registration.PluginID,
			Language:        registration.Language,
			Name:            registration.Name,
			DefaultFileName: registration.DefaultFileName,
		})
	}
	sort.Slice(serialized, func(left int, right int) bool {
		return serialized[left].TargetID < serialized[right].TargetID
	})
	return serialized
}

func pluginBackendRegistrationFailureSnapshot(entry DiscoveredPlugin, err error) PluginBackendRegistrationSnapshot {
	return PluginBackendRegistrationSnapshot{
		LanguageServers:       []PluginRegisteredLanguageServer{},
		ExternalAgentAdapters: []PluginRegisteredExternalAgentAdapter{},
		CodegenTargets:        []PluginRegisteredCodegenTarget{},
		Errors: []PluginErrorInfo{
			pluginBackendRegistrationError(entry, err),
		},
	}
}

func pluginBackendRegistrationError(entry DiscoveredPlugin, err error) PluginErrorInfo {
	return PluginErrorInfo{
		Code:    "PLUGIN_BACKEND_REGISTER_FAILED",
		Message: fmt.Sprintf("Plugin backend registration load failed for %s: %s", strings.TrimSpace(entry.PluginID), err.Error()),
	}
}

func clonePluginBackendRegistrationSnapshot(snapshot PluginBackendRegistrationSnapshot) PluginBackendRegistrationSnapshot {
	return PluginBackendRegistrationSnapshot{
		LanguageServers:       append([]PluginRegisteredLanguageServer(nil), snapshot.LanguageServers...),
		ExternalAgentAdapters: append([]PluginRegisteredExternalAgentAdapter(nil), snapshot.ExternalAgentAdapters...),
		CodegenTargets:        append([]PluginRegisteredCodegenTarget(nil), snapshot.CodegenTargets...),
		Errors:                append([]PluginErrorInfo(nil), snapshot.Errors...),
	}
}
