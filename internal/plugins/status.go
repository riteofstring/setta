package plugins

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"

	"setta/internal/config"
)

const pluginStatusSchemaVersion = 1

type PluginRestartCapabilityMode string

const (
	PluginRestartCapabilityModeManual       PluginRestartCapabilityMode = "manual"
	PluginRestartCapabilityModeProgrammatic PluginRestartCapabilityMode = "programmatic"
)

type PluginRestartCapability struct {
	Mode    PluginRestartCapabilityMode `json:"mode"`
	Command *string                     `json:"command"`
	Reason  *string                     `json:"reason"`
}

type PluginStatusEntry struct {
	PluginID                    string                             `json:"pluginId"`
	Name                        string                             `json:"name"`
	Version                     string                             `json:"version"`
	State                       PluginRuntimeState                 `json:"state"`
	SourceScope                 PluginScope                        `json:"sourceScope"`
	SourceScopeLabel            string                             `json:"sourceScopeLabel"`
	SourceManager               PluginSourceManager                `json:"sourceManager"`
	SourceManagerHint           *string                            `json:"sourceManagerHint"`
	SourcePath                  string                             `json:"sourcePath"`
	CanonicalSourceKey          string                             `json:"canonicalSourceKey"`
	SourceDigestSHA256          *string                            `json:"sourceDigestSha256"`
	ShadowedBySourcePath        *string                            `json:"shadowedBySourcePath"`
	RequestedCapabilities       []string                           `json:"requestedCapabilities"`
	EffectiveCapabilities       []string                           `json:"effectiveCapabilities"`
	BlockedCapabilities         []PluginBlockedCapability          `json:"blockedCapabilities"`
	Components                  []string                           `json:"components" ts_skip:"true"`
	RegisteredCodegenTargets    []PluginRegisteredCodegenTarget    `json:"registeredCodegenTargets"`
	RegisteredBackendRoutes     []PluginRegisteredBackendRoute     `json:"registeredBackendRoutes"`
	RegisteredStaticDirs        []PluginRegisteredStaticDir        `json:"registeredStaticDirs"`
	RegisteredListenerEndpoints []PluginRegisteredListenerEndpoint `json:"registeredListenerEndpoints"`
	EnablementSource            *PluginEnablementSource            `json:"enablementSource"`
	RestartRequired             bool                               `json:"restartRequired"`
	RuntimePayloadDigestSHA256  string                             `json:"runtimePayloadDigestSha256"`
	Errors                      []PluginErrorInfo                  `json:"errors"`
}

type PluginStatusResponse struct {
	SchemaVersion     int                     `json:"schemaVersion"`
	ServerMode        config.Mode             `json:"serverMode"`
	RestartCapability PluginRestartCapability `json:"restartCapability"`
	Plugins           []PluginStatusEntry     `json:"plugins"`
}

type RestartRequiredResponse struct {
	PendingPlugins                []PluginStatusEntry     `json:"pendingPlugins"`
	PendingPluginIDs              []string                `json:"pendingPluginIds"`
	PendingPluginIDsWithoutStatus []string                `json:"pendingPluginIdsWithoutStatus"`
	RestartCapability             PluginRestartCapability `json:"restartCapability"`
}

type PluginRestartResponse struct {
	Accepted bool                        `json:"accepted"`
	Mode     PluginRestartCapabilityMode `json:"mode"`
	Command  *string                     `json:"command"`
	Reason   *string                     `json:"reason"`
}

type statusEntryRuntimeDigestPayload struct {
	RequestedCapabilities       []string                           `json:"requestedCapabilities"`
	EffectiveCapabilities       []string                           `json:"effectiveCapabilities"`
	BlockedCapabilities         []PluginBlockedCapability          `json:"blockedCapabilities"`
	Components                  []string                           `json:"components"`
	RegisteredCodegenTargets    []PluginRegisteredCodegenTarget    `json:"registeredCodegenTargets"`
	RegisteredBackendRoutes     []PluginRegisteredBackendRoute     `json:"registeredBackendRoutes"`
	RegisteredStaticDirs        []PluginRegisteredStaticDir        `json:"registeredStaticDirs"`
	RegisteredListenerEndpoints []PluginRegisteredListenerEndpoint `json:"registeredListenerEndpoints"`
	Errors                      []PluginErrorInfo                  `json:"errors"`
}

func (s *Service) Status() (PluginStatusResponse, error) {
	if s == nil {
		return PluginStatusResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginStatusResponse{}, err
	}
	return statusResponseFromSnapshot(snapshot, s.restartCapability()), nil
}

func (s *Service) RestartRequiredSummary() (RestartRequiredResponse, error) {
	if s == nil {
		return RestartRequiredResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return RestartRequiredResponse{}, err
	}
	state, err := s.store.LoadPluginsState()
	if err != nil {
		return RestartRequiredResponse{}, err
	}

	pendingPlugins := make([]PluginStatusEntry, 0)
	pendingIDsFromStatus := map[string]struct{}{}
	for _, entry := range snapshot.Plugins {
		if entry.State != PluginRuntimeStatePendingRestart {
			continue
		}
		pendingPlugins = append(pendingPlugins, statusEntryFromDiscoveredPlugin(entry))
		pendingIDsFromStatus[entry.PluginID] = struct{}{}
	}

	pendingIDs := append([]string(nil), state.PendingRestartBackendPluginIDs...)
	pendingIDsWithoutStatus := make([]string, 0, len(pendingIDs))
	for _, pluginID := range pendingIDs {
		if _, ok := pendingIDsFromStatus[pluginID]; ok {
			continue
		}
		pendingIDsWithoutStatus = append(pendingIDsWithoutStatus, pluginID)
	}

	return RestartRequiredResponse{
		PendingPlugins:                pendingPlugins,
		PendingPluginIDs:              pendingIDs,
		PendingPluginIDsWithoutStatus: pendingIDsWithoutStatus,
		RestartCapability:             s.restartCapability(),
	}, nil
}

func (s *Service) Restart(ctx context.Context) (PluginRestartResponse, error) {
	if s == nil {
		return PluginRestartResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	capability := s.restartCapability()
	callback := s.restartCallback
	restartCommand := defaultRestartCommand(s.restartCommand)
	s.mu.Unlock()

	if capability.Mode == PluginRestartCapabilityModeProgrammatic {
		if callback == nil {
			return PluginRestartResponse{}, newServiceError(ServiceErrorCodeRestartFailed, "Programmatic restart callback missing.")
		}
		accepted, err := callback(ctx)
		if err != nil {
			return PluginRestartResponse{}, newServiceError(ServiceErrorCodeRestartFailed, "Programmatic restart callback failed: %s", err.Error())
		}
		if accepted {
			return PluginRestartResponse{
				Accepted: true,
				Mode:     capability.Mode,
				Command:  nil,
				Reason:   nil,
			}, nil
		}
		return PluginRestartResponse{
			Accepted: false,
			Mode:     capability.Mode,
			Command:  stringPointer(restartCommand),
			Reason:   stringPointer("Programmatic restart request was rejected."),
		}, nil
	}

	return PluginRestartResponse{
		Accepted: false,
		Mode:     capability.Mode,
		Command:  cloneOptionalString(capability.Command),
		Reason:   cloneOptionalString(capability.Reason),
	}, nil
}

func statusResponseFromSnapshot(snapshot DiscoverySnapshot, capability PluginRestartCapability) PluginStatusResponse {
	entries := make([]PluginStatusEntry, 0, len(snapshot.Plugins))
	for _, entry := range snapshot.Plugins {
		entries = append(entries, statusEntryFromDiscoveredPlugin(entry))
	}
	return PluginStatusResponse{
		SchemaVersion:     pluginStatusSchemaVersion,
		ServerMode:        snapshot.ServerMode,
		RestartCapability: capability,
		Plugins:           entries,
	}
}

func statusEntryFromDiscoveredPlugin(entry DiscoveredPlugin) PluginStatusEntry {
	runtimeDigest := computeStatusEntryRuntimePayloadDigest(entry)
	return PluginStatusEntry{
		PluginID:                    entry.PluginID,
		Name:                        entry.Name,
		Version:                     entry.Version,
		State:                       entry.State,
		SourceScope:                 entry.Scope,
		SourceScopeLabel:            string(entry.Scope),
		SourceManager:               entry.SourceManager,
		SourceManagerHint:           optionalStringPointer(entry.SourceManagerHint),
		SourcePath:                  entry.SourcePath,
		CanonicalSourceKey:          entry.CanonicalSourceKey,
		SourceDigestSHA256:          cloneOptionalString(entry.SourceDigestSHA256),
		ShadowedBySourcePath:        optionalStringPointer(entry.ShadowedBySourcePath),
		RequestedCapabilities:       cloneStringSliceOrEmpty(entry.RequestedCapabilities),
		EffectiveCapabilities:       cloneStringSliceOrEmpty(entry.EffectiveCapabilities),
		BlockedCapabilities:         cloneBlockedCapabilitiesOrEmpty(entry.BlockedCapabilities),
		Components:                  statusEntryComponents(entry),
		RegisteredCodegenTargets:    cloneRegisteredCodegenTargetsOrEmpty(entry.RegisteredCodegenTargets),
		RegisteredBackendRoutes:     cloneRegisteredBackendRoutesOrEmpty(entry.RegisteredBackendRoutes),
		RegisteredStaticDirs:        cloneRegisteredStaticDirsOrEmpty(entry.RegisteredStaticDirs),
		RegisteredListenerEndpoints: cloneRegisteredListenerEndpointsOrEmpty(entry.RegisteredListenerEndpoints),
		EnablementSource:            cloneOptionalEnablementSource(entry.EnablementSource),
		RestartRequired:             entry.RestartRequired,
		RuntimePayloadDigestSHA256:  runtimeDigest,
		Errors:                      clonePluginErrorsOrEmpty(entry.Errors),
	}
}

func computeStatusEntryRuntimePayloadDigest(entry DiscoveredPlugin) string {
	payload := statusEntryRuntimeDigestPayload{
		RequestedCapabilities:       cloneStringSliceOrEmpty(entry.RequestedCapabilities),
		EffectiveCapabilities:       cloneStringSliceOrEmpty(entry.EffectiveCapabilities),
		BlockedCapabilities:         cloneBlockedCapabilitiesOrEmpty(entry.BlockedCapabilities),
		Components:                  statusEntryComponents(entry),
		RegisteredCodegenTargets:    cloneRegisteredCodegenTargetsOrEmpty(entry.RegisteredCodegenTargets),
		RegisteredBackendRoutes:     cloneRegisteredBackendRoutesOrEmpty(entry.RegisteredBackendRoutes),
		RegisteredStaticDirs:        cloneRegisteredStaticDirsOrEmpty(entry.RegisteredStaticDirs),
		RegisteredListenerEndpoints: cloneRegisteredListenerEndpointsOrEmpty(entry.RegisteredListenerEndpoints),
		Errors:                      clonePluginErrorsOrEmpty(entry.Errors),
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func cloneStringSliceOrEmpty(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	return append([]string{}, values...)
}

func cloneBlockedCapabilitiesOrEmpty(values []PluginBlockedCapability) []PluginBlockedCapability {
	if len(values) == 0 {
		return []PluginBlockedCapability{}
	}
	return append([]PluginBlockedCapability{}, values...)
}

func cloneRegisteredCodegenTargetsOrEmpty(values []PluginRegisteredCodegenTarget) []PluginRegisteredCodegenTarget {
	if len(values) == 0 {
		return []PluginRegisteredCodegenTarget{}
	}
	return append([]PluginRegisteredCodegenTarget{}, values...)
}

func cloneRegisteredBackendRoutesOrEmpty(values []PluginRegisteredBackendRoute) []PluginRegisteredBackendRoute {
	if len(values) == 0 {
		return []PluginRegisteredBackendRoute{}
	}
	return append([]PluginRegisteredBackendRoute{}, values...)
}

func cloneRegisteredStaticDirsOrEmpty(values []PluginRegisteredStaticDir) []PluginRegisteredStaticDir {
	if len(values) == 0 {
		return []PluginRegisteredStaticDir{}
	}
	return append([]PluginRegisteredStaticDir{}, values...)
}

func cloneRegisteredListenerEndpointsOrEmpty(values []PluginRegisteredListenerEndpoint) []PluginRegisteredListenerEndpoint {
	if len(values) == 0 {
		return []PluginRegisteredListenerEndpoint{}
	}
	return append([]PluginRegisteredListenerEndpoint{}, values...)
}

func statusEntryComponents(entry DiscoveredPlugin) []string {
	if entry.Manifest == nil {
		return []string{}
	}
	return manifestComponents(*entry.Manifest)
}

func clonePluginErrorsOrEmpty(values []PluginErrorInfo) []PluginErrorInfo {
	if len(values) == 0 {
		return []PluginErrorInfo{}
	}
	return append([]PluginErrorInfo{}, values...)
}

func (s *Service) restartCapability() PluginRestartCapability {
	command := optionalStringPointer(defaultRestartCommand(s.restartCommand))
	switch s.serverMode() {
	case config.ModeShare, config.ModeApp:
		return PluginRestartCapability{
			Mode:    PluginRestartCapabilityModeManual,
			Command: command,
			Reason:  stringPointer("Plugin runtime restart is available only in IDE mode."),
		}
	default:
		if s.restartCallback != nil {
			return PluginRestartCapability{
				Mode:    PluginRestartCapabilityModeProgrammatic,
				Command: nil,
				Reason:  nil,
			}
		}
		return PluginRestartCapability{
			Mode:    PluginRestartCapabilityModeManual,
			Command: command,
			Reason:  stringPointer("Programmatic restart is not available in this runtime."),
		}
	}
}

func (s *Service) serverMode() config.Mode {
	if s == nil || s.discoveryService == nil {
		return config.ModeIDE
	}
	return s.discoveryService.serverMode
}

func defaultRestartCommand(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "setta"
	}
	return trimmed
}

func optionalStringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return stringPointer(trimmed)
}

func stringPointer(value string) *string {
	copied := value
	return &copied
}

func cloneOptionalEnablementSource(value *PluginEnablementSource) *PluginEnablementSource {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}
