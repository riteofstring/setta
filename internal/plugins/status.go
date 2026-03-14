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

type RestartCapabilityMode string

const (
	RestartCapabilityModeManual       RestartCapabilityMode = "manual"
	RestartCapabilityModeProgrammatic RestartCapabilityMode = "programmatic"
)

type RestartCapability struct {
	Mode    RestartCapabilityMode `json:"mode"`
	Command *string               `json:"command"`
	Reason  *string               `json:"reason"`
}

type StatusEntry struct {
	PluginID                        string                                 `json:"pluginId"`
	Name                            string                                 `json:"name"`
	Version                         string                                 `json:"version"`
	State                           PluginRuntimeState                     `json:"state"`
	SourceScope                     PluginScope                            `json:"sourceScope"`
	SourceScopeLabel                string                                 `json:"sourceScopeLabel"`
	SourceManager                   PluginSourceManager                    `json:"sourceManager"`
	SourceManagerHint               *string                                `json:"sourceManagerHint"`
	SourcePath                      string                                 `json:"sourcePath"`
	CanonicalSourceKey              string                                 `json:"canonicalSourceKey"`
	SourceDigestSHA256              *string                                `json:"sourceDigestSha256"`
	ShadowedBySourcePath            *string                                `json:"shadowedBySourcePath"`
	RequestedCapabilities           []string                               `json:"requestedCapabilities"`
	EffectiveCapabilities           []string                               `json:"effectiveCapabilities"`
	BlockedCapabilities             []PluginBlockedCapability              `json:"blockedCapabilities"`
	RegisteredLanguageServers       []PluginRegisteredLanguageServer       `json:"registeredLanguageServers"`
	RegisteredExternalAgentAdapters []PluginRegisteredExternalAgentAdapter `json:"registeredExternalAgentAdapters"`
	RegisteredCodegenTargets        []PluginRegisteredCodegenTarget        `json:"registeredCodegenTargets"`
	EnablementSource                *PluginEnablementSource                `json:"enablementSource"`
	RestartRequired                 bool                                   `json:"restartRequired"`
	RuntimePayloadDigestSHA256      string                                 `json:"runtimePayloadDigestSha256"`
	Errors                          []PluginErrorInfo                      `json:"errors"`
}

type StatusResponse struct {
	SchemaVersion     int               `json:"schemaVersion"`
	ServerMode        config.Mode       `json:"serverMode"`
	RestartCapability RestartCapability `json:"restartCapability"`
	Plugins           []StatusEntry     `json:"plugins"`
}

type RestartRequiredResponse struct {
	PendingPlugins                []StatusEntry     `json:"pendingPlugins"`
	PendingPluginIDs              []string          `json:"pendingPluginIds"`
	PendingPluginIDsWithoutStatus []string          `json:"pendingPluginIdsWithoutStatus"`
	RestartCapability             RestartCapability `json:"restartCapability"`
}

type PluginRestartResult struct {
	Accepted bool                  `json:"accepted"`
	Mode     RestartCapabilityMode `json:"mode"`
	Command  *string               `json:"command"`
	Reason   *string               `json:"reason"`
}

type statusEntryRuntimeDigestPayload struct {
	RequestedCapabilities           []string                               `json:"requestedCapabilities"`
	EffectiveCapabilities           []string                               `json:"effectiveCapabilities"`
	BlockedCapabilities             []PluginBlockedCapability              `json:"blockedCapabilities"`
	RegisteredLanguageServers       []PluginRegisteredLanguageServer       `json:"registeredLanguageServers"`
	RegisteredExternalAgentAdapters []PluginRegisteredExternalAgentAdapter `json:"registeredExternalAgentAdapters"`
	RegisteredCodegenTargets        []PluginRegisteredCodegenTarget        `json:"registeredCodegenTargets"`
	Errors                          []PluginErrorInfo                      `json:"errors"`
}

type pluginStatusRuntimeDetails struct {
	registeredLanguageServers       []PluginRegisteredLanguageServer
	registeredExternalAgentAdapters []PluginRegisteredExternalAgentAdapter
	registeredCodegenTargets        []PluginRegisteredCodegenTarget
	errors                          []PluginErrorInfo
}

func (s *Service) Status() (StatusResponse, error) {
	if s == nil {
		return StatusResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return StatusResponse{}, err
	}
	return statusResponseFromSnapshot(snapshot, s.restartCapability(), s.loadStatusRuntimeDetailsLocked(snapshot)), nil
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

	pendingPlugins := make([]StatusEntry, 0)
	pendingIDsFromStatus := map[string]struct{}{}
	for _, entry := range snapshot.Plugins {
		if entry.State != PluginRuntimeStatePendingRestart {
			continue
		}
		pendingPlugins = append(pendingPlugins, statusEntryFromDiscoveredPlugin(entry, pluginStatusRuntimeDetails{}))
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

func (s *Service) Restart(ctx context.Context) (PluginRestartResult, error) {
	if s == nil {
		return PluginRestartResult{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	capability := s.restartCapability()
	callback := s.restartCallback
	restartCommand := defaultRestartCommand(s.restartCommand)
	s.mu.Unlock()

	if capability.Mode == RestartCapabilityModeProgrammatic {
		if callback == nil {
			return PluginRestartResult{}, newServiceError(ServiceErrorCodeRestartFailed, "Programmatic restart callback missing.")
		}
		accepted, err := callback(ctx)
		if err != nil {
			return PluginRestartResult{}, newServiceError(ServiceErrorCodeRestartFailed, "Programmatic restart callback failed: %s", err.Error())
		}
		if accepted {
			return PluginRestartResult{
				Accepted: true,
				Mode:     capability.Mode,
				Command:  nil,
				Reason:   nil,
			}, nil
		}
		return PluginRestartResult{
			Accepted: false,
			Mode:     capability.Mode,
			Command:  stringPointer(restartCommand),
			Reason:   stringPointer("Programmatic restart request was rejected."),
		}, nil
	}

	return PluginRestartResult{
		Accepted: false,
		Mode:     capability.Mode,
		Command:  cloneOptionalString(capability.Command),
		Reason:   cloneOptionalString(capability.Reason),
	}, nil
}

func statusResponseFromSnapshot(snapshot DiscoverySnapshot, capability RestartCapability, detailsByPluginID map[string]pluginStatusRuntimeDetails) StatusResponse {
	entries := make([]StatusEntry, 0, len(snapshot.Plugins))
	for _, entry := range snapshot.Plugins {
		entries = append(entries, statusEntryFromDiscoveredPlugin(entry, detailsByPluginID[entry.PluginID]))
	}
	return StatusResponse{
		SchemaVersion:     pluginStatusSchemaVersion,
		ServerMode:        snapshot.ServerMode,
		RestartCapability: capability,
		Plugins:           entries,
	}
}

func statusEntryFromDiscoveredPlugin(entry DiscoveredPlugin, details pluginStatusRuntimeDetails) StatusEntry {
	errors := mergePluginErrorSlices(entry.Errors, details.errors)
	runtimeDigest := computeStatusEntryRuntimePayloadDigest(entry, details)
	return StatusEntry{
		PluginID:                        entry.PluginID,
		Name:                            entry.Name,
		Version:                         entry.Version,
		State:                           entry.State,
		SourceScope:                     entry.Scope,
		SourceScopeLabel:                string(entry.Scope),
		SourceManager:                   entry.SourceManager,
		SourceManagerHint:               optionalStringPointer(entry.SourceManagerHint),
		SourcePath:                      entry.SourcePath,
		CanonicalSourceKey:              entry.CanonicalSourceKey,
		SourceDigestSHA256:              cloneOptionalString(entry.SourceDigestSHA256),
		ShadowedBySourcePath:            optionalStringPointer(entry.ShadowedBySourcePath),
		RequestedCapabilities:           cloneStringSliceOrEmpty(entry.RequestedCapabilities),
		EffectiveCapabilities:           cloneStringSliceOrEmpty(entry.EffectiveCapabilities),
		BlockedCapabilities:             cloneBlockedCapabilitiesOrEmpty(entry.BlockedCapabilities),
		RegisteredLanguageServers:       cloneRegisteredLanguageServersOrEmpty(details.registeredLanguageServers),
		RegisteredExternalAgentAdapters: cloneRegisteredExternalAgentAdaptersOrEmpty(details.registeredExternalAgentAdapters),
		RegisteredCodegenTargets:        cloneRegisteredCodegenTargetsOrEmpty(details.registeredCodegenTargets),
		EnablementSource:                cloneOptionalEnablementSource(entry.EnablementSource),
		RestartRequired:                 entry.RestartRequired,
		RuntimePayloadDigestSHA256:      runtimeDigest,
		Errors:                          errors,
	}
}

func computeStatusEntryRuntimePayloadDigest(entry DiscoveredPlugin, details pluginStatusRuntimeDetails) string {
	payload := statusEntryRuntimeDigestPayload{
		RequestedCapabilities:           cloneStringSliceOrEmpty(entry.RequestedCapabilities),
		EffectiveCapabilities:           cloneStringSliceOrEmpty(entry.EffectiveCapabilities),
		BlockedCapabilities:             cloneBlockedCapabilitiesOrEmpty(entry.BlockedCapabilities),
		RegisteredLanguageServers:       cloneRegisteredLanguageServersOrEmpty(details.registeredLanguageServers),
		RegisteredExternalAgentAdapters: cloneRegisteredExternalAgentAdaptersOrEmpty(details.registeredExternalAgentAdapters),
		RegisteredCodegenTargets:        cloneRegisteredCodegenTargetsOrEmpty(details.registeredCodegenTargets),
		Errors:                          mergePluginErrorSlices(entry.Errors, details.errors),
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func (s *Service) loadStatusRuntimeDetailsLocked(snapshot DiscoverySnapshot) map[string]pluginStatusRuntimeDetails {
	if s == nil || s.backendRuntime == nil {
		return map[string]pluginStatusRuntimeDetails{}
	}

	detailsByPluginID := make(map[string]pluginStatusRuntimeDetails, len(snapshot.Plugins))
	for _, entry := range snapshot.Plugins {
		if !shouldLoadBackendRegistrations(entry) {
			continue
		}
		snapshot := s.backendRuntime.SnapshotBackendRegistrations(context.Background(), entry)
		if len(snapshot.LanguageServers) == 0 &&
			len(snapshot.ExternalAgentAdapters) == 0 &&
			len(snapshot.CodegenTargets) == 0 &&
			len(snapshot.Errors) == 0 {
			continue
		}
		detailsByPluginID[entry.PluginID] = pluginStatusRuntimeDetails{
			registeredLanguageServers:       cloneRegisteredLanguageServersOrEmpty(snapshot.LanguageServers),
			registeredExternalAgentAdapters: cloneRegisteredExternalAgentAdaptersOrEmpty(snapshot.ExternalAgentAdapters),
			registeredCodegenTargets:        cloneRegisteredCodegenTargetsOrEmpty(snapshot.CodegenTargets),
			errors:                          clonePluginErrorsOrEmpty(snapshot.Errors),
		}
	}
	return detailsByPluginID
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

func cloneRegisteredLanguageServersOrEmpty(values []PluginRegisteredLanguageServer) []PluginRegisteredLanguageServer {
	if len(values) == 0 {
		return []PluginRegisteredLanguageServer{}
	}
	return append([]PluginRegisteredLanguageServer{}, values...)
}

func cloneRegisteredExternalAgentAdaptersOrEmpty(values []PluginRegisteredExternalAgentAdapter) []PluginRegisteredExternalAgentAdapter {
	if len(values) == 0 {
		return []PluginRegisteredExternalAgentAdapter{}
	}
	return append([]PluginRegisteredExternalAgentAdapter{}, values...)
}

func cloneRegisteredCodegenTargetsOrEmpty(values []PluginRegisteredCodegenTarget) []PluginRegisteredCodegenTarget {
	if len(values) == 0 {
		return []PluginRegisteredCodegenTarget{}
	}
	return append([]PluginRegisteredCodegenTarget{}, values...)
}

func clonePluginErrorsOrEmpty(values []PluginErrorInfo) []PluginErrorInfo {
	if len(values) == 0 {
		return []PluginErrorInfo{}
	}
	return append([]PluginErrorInfo{}, values...)
}

func mergePluginErrorSlices(primary []PluginErrorInfo, secondary []PluginErrorInfo) []PluginErrorInfo {
	if len(primary) == 0 && len(secondary) == 0 {
		return []PluginErrorInfo{}
	}
	merged := clonePluginErrorsOrEmpty(primary)
	return append(merged, secondary...)
}

func (s *Service) restartCapability() RestartCapability {
	command := optionalStringPointer(defaultRestartCommand(s.restartCommand))
	switch s.serverMode() {
	case config.ModeShare, config.ModeApp:
		return RestartCapability{
			Mode:    RestartCapabilityModeManual,
			Command: command,
			Reason:  stringPointer("Plugin runtime restart is available only in IDE mode."),
		}
	default:
		if s.restartCallback != nil {
			return RestartCapability{
				Mode:    RestartCapabilityModeProgrammatic,
				Command: nil,
				Reason:  nil,
			}
		}
		return RestartCapability{
			Mode:    RestartCapabilityModeManual,
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
