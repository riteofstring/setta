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
	PluginID                        string                    `json:"pluginId"`
	Name                            string                    `json:"name"`
	Version                         string                    `json:"version"`
	State                           PluginRuntimeState        `json:"state"`
	SourceScope                     PluginScope               `json:"sourceScope"`
	SourceScopeLabel                string                    `json:"sourceScopeLabel"`
	SourceManager                   PluginSourceManager       `json:"sourceManager"`
	SourceManagerHint               *string                   `json:"sourceManagerHint"`
	SourcePath                      string                    `json:"sourcePath"`
	CanonicalSourceKey              string                    `json:"canonicalSourceKey"`
	SourceDigestSHA256              *string                   `json:"sourceDigestSha256"`
	ShadowedBySourcePath            *string                   `json:"shadowedBySourcePath"`
	RequestedCapabilities           []string                  `json:"requestedCapabilities"`
	EffectiveCapabilities           []string                  `json:"effectiveCapabilities"`
	BlockedCapabilities             []PluginBlockedCapability `json:"blockedCapabilities"`
	RegisteredLanguageServers       []any                     `json:"registeredLanguageServers"`
	RegisteredExternalAgentAdapters []any                     `json:"registeredExternalAgentAdapters"`
	RegisteredCodegenTargets        []any                     `json:"registeredCodegenTargets"`
	EnablementSource                *PluginEnablementSource   `json:"enablementSource"`
	RestartRequired                 bool                      `json:"restartRequired"`
	RuntimePayloadDigestSHA256      string                    `json:"runtimePayloadDigestSha256"`
	Errors                          []PluginErrorInfo         `json:"errors"`
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
	RequestedCapabilities           []string                  `json:"requestedCapabilities"`
	EffectiveCapabilities           []string                  `json:"effectiveCapabilities"`
	BlockedCapabilities             []PluginBlockedCapability `json:"blockedCapabilities"`
	RegisteredLanguageServers       []any                     `json:"registeredLanguageServers"`
	RegisteredExternalAgentAdapters []any                     `json:"registeredExternalAgentAdapters"`
	RegisteredCodegenTargets        []any                     `json:"registeredCodegenTargets"`
	Errors                          []PluginErrorInfo         `json:"errors"`
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

	pendingPlugins := make([]StatusEntry, 0)
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

func statusResponseFromSnapshot(snapshot DiscoverySnapshot, capability RestartCapability) StatusResponse {
	entries := make([]StatusEntry, 0, len(snapshot.Plugins))
	for _, entry := range snapshot.Plugins {
		entries = append(entries, statusEntryFromDiscoveredPlugin(entry))
	}
	return StatusResponse{
		SchemaVersion:     pluginStatusSchemaVersion,
		ServerMode:        snapshot.ServerMode,
		RestartCapability: capability,
		Plugins:           entries,
	}
}

func statusEntryFromDiscoveredPlugin(entry DiscoveredPlugin) StatusEntry {
	runtimeDigest := computeStatusEntryRuntimePayloadDigest(entry)
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
		RequestedCapabilities:           append([]string(nil), entry.RequestedCapabilities...),
		EffectiveCapabilities:           append([]string(nil), entry.EffectiveCapabilities...),
		BlockedCapabilities:             append([]PluginBlockedCapability(nil), entry.BlockedCapabilities...),
		RegisteredLanguageServers:       []any{},
		RegisteredExternalAgentAdapters: []any{},
		RegisteredCodegenTargets:        []any{},
		EnablementSource:                cloneOptionalEnablementSource(entry.EnablementSource),
		RestartRequired:                 entry.RestartRequired,
		RuntimePayloadDigestSHA256:      runtimeDigest,
		Errors:                          append([]PluginErrorInfo(nil), entry.Errors...),
	}
}

func computeStatusEntryRuntimePayloadDigest(entry DiscoveredPlugin) string {
	payload := statusEntryRuntimeDigestPayload{
		RequestedCapabilities:           append([]string(nil), entry.RequestedCapabilities...),
		EffectiveCapabilities:           append([]string(nil), entry.EffectiveCapabilities...),
		BlockedCapabilities:             append([]PluginBlockedCapability(nil), entry.BlockedCapabilities...),
		RegisteredLanguageServers:       []any{},
		RegisteredExternalAgentAdapters: []any{},
		RegisteredCodegenTargets:        []any{},
		Errors:                          append([]PluginErrorInfo(nil), entry.Errors...),
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
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
