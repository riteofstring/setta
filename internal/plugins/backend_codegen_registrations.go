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

type BackendCodegenRegistrationSource interface {
	SnapshotCodegenRegistrations(context.Context, DiscoveredPlugin) PluginCodegenRegistrationSnapshot
}

type PluginCodegenRegistrationSnapshot struct {
	Registrations []PluginRegisteredCodegenTarget
	Errors        []PluginErrorInfo
}

type BackendCodegenRegistrationLoaderOptions struct {
	RuntimeProvider WorkerRuntimeProvider
	ServerMode      config.Mode
}

type BackendCodegenRegistrationLoader struct {
	runtimeProvider WorkerRuntimeProvider
	serverMode      config.Mode

	mu            sync.Mutex
	cacheByPlugin map[string]backendCodegenRegistrationCacheEntry
}

var ErrBackendCodegenRegistrationRuntimeProviderRequired = errors.New("plugins: backend codegen registration runtime provider is required")

type backendCodegenRegistrationCacheEntry struct {
	cacheKey string
	snapshot PluginCodegenRegistrationSnapshot
}

func NewBackendCodegenRegistrationLoader(options BackendCodegenRegistrationLoaderOptions) (*BackendCodegenRegistrationLoader, error) {
	if options.RuntimeProvider == nil {
		return nil, ErrBackendCodegenRegistrationRuntimeProviderRequired
	}
	if options.ServerMode == "" {
		return nil, ErrFilesystemWorkerSpecResolverServerModeRequired
	}
	return &BackendCodegenRegistrationLoader{
		runtimeProvider: options.RuntimeProvider,
		serverMode:      options.ServerMode,
		cacheByPlugin:   map[string]backendCodegenRegistrationCacheEntry{},
	}, nil
}

func (l *BackendCodegenRegistrationLoader) SnapshotCodegenRegistrations(ctx context.Context, entry DiscoveredPlugin) PluginCodegenRegistrationSnapshot {
	if l == nil || l.runtimeProvider == nil {
		return PluginCodegenRegistrationSnapshot{}
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if !shouldLoadBackendCodegenRegistrations(entry) {
		return PluginCodegenRegistrationSnapshot{}
	}

	cacheKey := backendCodegenRegistrationCacheKey(entry, l.serverMode)

	l.mu.Lock()
	if cached, ok := l.cacheByPlugin[entry.PluginID]; ok && cached.cacheKey == cacheKey {
		snapshot := clonePluginCodegenRegistrationSnapshot(cached.snapshot)
		l.mu.Unlock()
		return snapshot
	}
	l.mu.Unlock()

	snapshot := l.loadCodegenRegistrations(ctx, entry)

	l.mu.Lock()
	l.cacheByPlugin[entry.PluginID] = backendCodegenRegistrationCacheEntry{
		cacheKey: cacheKey,
		snapshot: clonePluginCodegenRegistrationSnapshot(snapshot),
	}
	l.mu.Unlock()
	return snapshot
}

func shouldLoadBackendCodegenRegistrations(entry DiscoveredPlugin) bool {
	if entry.ShadowedBySourcePath != "" {
		return false
	}
	if entry.Manifest == nil || entry.Manifest.Backend == nil {
		return false
	}
	if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
		return false
	}
	return containsCapability(entry.EffectiveCapabilities, CapabilityRegisterCodegenTarget)
}

func backendCodegenRegistrationCacheKey(entry DiscoveredPlugin, serverMode config.Mode) string {
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

func (l *BackendCodegenRegistrationLoader) loadCodegenRegistrations(ctx context.Context, entry DiscoveredPlugin) PluginCodegenRegistrationSnapshot {
	runtime, err := l.runtimeProvider.ResolveWorkerRuntime(ctx)
	if err != nil {
		return pluginCodegenRegistrationFailureSnapshot(entry, err)
	}
	entrypoint, err := resolveManifestRegularFile(entry.SourcePath, entry.Manifest.Backend.Entrypoint, "plugin backend entrypoint")
	if err != nil {
		return pluginCodegenRegistrationFailureSnapshot(entry, err)
	}

	runtimeSession, err := StartCodegenRuntime(ctx, CodegenRuntimeStartOptions{
		WorkerSpec: BackendWorkerSpec{
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
		},
	})
	if err != nil {
		return pluginCodegenRegistrationFailureSnapshot(entry, err)
	}

	registrations := runtimeSession.Registrations()
	closeErr := runtimeSession.Close()
	snapshot := PluginCodegenRegistrationSnapshot{
		Registrations: serializeRegisteredCodegenTargets(registrations),
	}
	if closeErr != nil {
		snapshot.Errors = append(snapshot.Errors, pluginCodegenRegistrationError(entry, closeErr))
	}
	return snapshot
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

func pluginCodegenRegistrationFailureSnapshot(entry DiscoveredPlugin, err error) PluginCodegenRegistrationSnapshot {
	return PluginCodegenRegistrationSnapshot{
		Registrations: []PluginRegisteredCodegenTarget{},
		Errors: []PluginErrorInfo{
			pluginCodegenRegistrationError(entry, err),
		},
	}
}

func pluginCodegenRegistrationError(entry DiscoveredPlugin, err error) PluginErrorInfo {
	return PluginErrorInfo{
		Code:    "PLUGIN_BACKEND_REGISTER_FAILED",
		Message: fmt.Sprintf("Plugin backend codegen registration load failed for %s: %s", strings.TrimSpace(entry.PluginID), err.Error()),
	}
}

func clonePluginCodegenRegistrationSnapshot(snapshot PluginCodegenRegistrationSnapshot) PluginCodegenRegistrationSnapshot {
	return PluginCodegenRegistrationSnapshot{
		Registrations: append([]PluginRegisteredCodegenTarget(nil), snapshot.Registrations...),
		Errors:        append([]PluginErrorInfo(nil), snapshot.Errors...),
	}
}
