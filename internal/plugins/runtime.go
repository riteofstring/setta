package plugins

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strings"

	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/config"
	"setta/internal/statefs"
	"setta/internal/watchcodecontracts"
)

const (
	pluginListSchemaVersion    = 1
	pluginRuntimeSchemaVersion = 1

	redactedSourcePathPrefix         = "[redacted]"
	redactedCanonicalSourceKeyPrefix = "redacted:"
)

type AssetURLBuilder func(pluginID string, relativePath string, sourceDigestSHA256 *string) string

type RuntimeOptions struct {
	AssetURLBuilder AssetURLBuilder
}

type PluginAppSubsystemProviderSelectionStatusKind string

const (
	PluginAppSubsystemProviderSelectionStatusNoProvider       PluginAppSubsystemProviderSelectionStatusKind = "no_provider"
	PluginAppSubsystemProviderSelectionStatusDisabledProvider PluginAppSubsystemProviderSelectionStatusKind = "disabled_provider"
	PluginAppSubsystemProviderSelectionStatusInvalidProvider  PluginAppSubsystemProviderSelectionStatusKind = "invalid_provider"
	PluginAppSubsystemProviderSelectionStatusActive           PluginAppSubsystemProviderSelectionStatusKind = "active"
	PluginAppSubsystemProviderSelectionStatusConflict         PluginAppSubsystemProviderSelectionStatusKind = "provider_conflict"
)

type PluginAppSubsystemProviderSelection struct {
	Status               PluginAppSubsystemProviderSelectionStatusKind `json:"status"`
	SelectedPluginID     *string                                       `json:"selectedPluginId,omitempty"`
	ActivePluginIDs      []string                                      `json:"activePluginIds"`
	DisabledPluginIDs    []string                                      `json:"disabledPluginIds"`
	InvalidPluginIDs     []string                                      `json:"invalidPluginIds"`
	ConflictingPluginIDs []string                                      `json:"conflictingPluginIds"`
}

type PluginAppSubsystemCapabilities struct {
	ProviderSelection      *PluginAppSubsystemProviderSelection `json:"providerSelection,omitempty"`
	PluginID               string                               `json:"pluginId"`
	PluginEnabled          bool                                 `json:"pluginEnabled"`
	AppAuthoringUI         bool                                 `json:"appAuthoringUi"`
	AppPreviewUI           bool                                 `json:"appPreviewUi"`
	AppGenerationChatModes bool                                 `json:"appGenerationChatModes"`
	AppDeploymentRuntime   bool                                 `json:"appDeploymentRuntime"`
}

type PluginWatchCodeProviderSelectionStatusKind string

const (
	PluginWatchCodeProviderSelectionStatusNoProvider       PluginWatchCodeProviderSelectionStatusKind = "no_provider"
	PluginWatchCodeProviderSelectionStatusDisabledProvider PluginWatchCodeProviderSelectionStatusKind = "disabled_provider"
	PluginWatchCodeProviderSelectionStatusInvalidProvider  PluginWatchCodeProviderSelectionStatusKind = "invalid_provider"
	PluginWatchCodeProviderSelectionStatusPendingRestart   PluginWatchCodeProviderSelectionStatusKind = "pending_restart"
	PluginWatchCodeProviderSelectionStatusActive           PluginWatchCodeProviderSelectionStatusKind = "active"
	PluginWatchCodeProviderSelectionStatusConflict         PluginWatchCodeProviderSelectionStatusKind = "provider_conflict"
)

type PluginWatchCodeProviderSelection struct {
	Status                  PluginWatchCodeProviderSelectionStatusKind `json:"status"`
	SelectedPluginID        *string                                    `json:"selectedPluginId,omitempty"`
	ActivePluginIDs         []string                                   `json:"activePluginIds"`
	DisabledPluginIDs       []string                                   `json:"disabledPluginIds"`
	InvalidPluginIDs        []string                                   `json:"invalidPluginIds"`
	PendingRestartPluginIDs []string                                   `json:"pendingRestartPluginIds"`
	ConflictingPluginIDs    []string                                   `json:"conflictingPluginIds"`
}

type PluginWatchCodeLanguageServerDependencyStatusKind string

const (
	PluginWatchCodeLanguageServerDependencyStatusUnavailable    PluginWatchCodeLanguageServerDependencyStatusKind = "unavailable"
	PluginWatchCodeLanguageServerDependencyStatusNotRequired    PluginWatchCodeLanguageServerDependencyStatusKind = "not_required"
	PluginWatchCodeLanguageServerDependencyStatusActive         PluginWatchCodeLanguageServerDependencyStatusKind = "active"
	PluginWatchCodeLanguageServerDependencyStatusMissing        PluginWatchCodeLanguageServerDependencyStatusKind = "missing"
	PluginWatchCodeLanguageServerDependencyStatusDisabled       PluginWatchCodeLanguageServerDependencyStatusKind = "disabled"
	PluginWatchCodeLanguageServerDependencyStatusPendingRestart PluginWatchCodeLanguageServerDependencyStatusKind = "pending_restart"
)

type PluginWatchCodeLanguageServerDependencyStatus struct {
	Language         string                                            `json:"language"`
	Required         bool                                              `json:"required"`
	Status           PluginWatchCodeLanguageServerDependencyStatusKind `json:"status"`
	Message          string                                            `json:"message"`
	SelectedPluginID *string                                           `json:"selectedPluginId,omitempty"`
	AppliedPluginID  *string                                           `json:"appliedPluginId,omitempty"`
	RestartRequired  bool                                              `json:"restartRequired"`
}

type PluginWatchCodeCapabilities struct {
	ProviderSelection        *PluginWatchCodeProviderSelection              `json:"providerSelection,omitempty"`
	LanguageServerDependency *PluginWatchCodeLanguageServerDependencyStatus `json:"languageServerDependency,omitempty"`
	PluginID                 string                                         `json:"pluginId"`
	PluginEnabled            bool                                           `json:"pluginEnabled"`
	Python                   bool                                           `json:"python"`
	RequiresLanguageServer   bool                                           `json:"requiresLanguageServer"`
	CanvasControlsUI         bool                                           `json:"canvasControlsUi"`
}

func (c PluginWatchCodeCapabilities) ActiveProviderPluginID() (string, bool) {
	pluginID := strings.TrimSpace(c.PluginID)
	return pluginID, c.PluginEnabled && c.Python && pluginID != ""
}

func (s *PluginWatchCodeProviderSelection) ContainsPluginID(pluginID string) bool {
	pluginID = strings.TrimSpace(pluginID)
	if s == nil || pluginID == "" {
		return false
	}
	if s.SelectedPluginID != nil && strings.TrimSpace(*s.SelectedPluginID) == pluginID {
		return true
	}
	return slices.Contains(s.ActivePluginIDs, pluginID) ||
		slices.Contains(s.DisabledPluginIDs, pluginID) ||
		slices.Contains(s.InvalidPluginIDs, pluginID) ||
		slices.Contains(s.PendingRestartPluginIDs, pluginID) ||
		slices.Contains(s.ConflictingPluginIDs, pluginID)
}

type PluginFeatureCapabilities struct {
	AppSubsystem PluginAppSubsystemCapabilities `json:"appSubsystem"`
	WatchCode    PluginWatchCodeCapabilities    `json:"watchCode"`
}

type PluginFrontendDescriptor struct {
	EntrypointURL *string `json:"entrypointUrl"`
	StyleURL      *string `json:"styleUrl"`
}

type PluginContentDescriptor struct {
	HasBlueprints       bool `json:"hasBlueprints"`
	HasProjectTemplates bool `json:"hasProjectTemplates"`
	HasPrompts          bool `json:"hasPrompts"`
}

type PluginConfigDescriptor struct {
	HasSchema                 bool           `json:"hasSchema"`
	SchemaJSON                map[string]any `json:"schemaJson"`
	SchemaJSONDigestSHA256    *string        `json:"schemaJsonDigestSha256"`
	CurrentConfig             map[string]any `json:"currentConfig"`
	CurrentConfigDigestSHA256 *string        `json:"currentConfigDigestSha256"`
}

type PluginListEntry struct {
	PluginID              string                   `json:"pluginId"`
	Name                  string                   `json:"name"`
	Version               string                   `json:"version"`
	SourceScope           PluginScope              `json:"sourceScope"`
	SourceScopeLabel      string                   `json:"sourceScopeLabel"`
	SourceManager         PluginSourceManager      `json:"sourceManager"`
	SourceManagerHint     *string                  `json:"sourceManagerHint"`
	CanonicalSourceKey    string                   `json:"canonicalSourceKey"`
	SourceDigestSHA256    *string                  `json:"sourceDigestSha256"`
	Frontend              PluginFrontendDescriptor `json:"frontend"`
	Content               PluginContentDescriptor  `json:"content"`
	Config                PluginConfigDescriptor   `json:"config"`
	Components            []string                 `json:"components" ts_skip:"true"`
	EffectiveCapabilities []string                 `json:"effectiveCapabilities"`
	EnablementSource      *PluginEnablementSource  `json:"enablementSource"`
	RestartRequired       bool                     `json:"restartRequired"`
}

type PluginListResponse struct {
	SchemaVersion     int                     `json:"schemaVersion"`
	ServerMode        config.Mode             `json:"serverMode"`
	RestartCapability PluginRestartCapability `json:"restartCapability"`
	Plugins           []PluginListEntry       `json:"plugins"`
}

type PluginRuntimeResponse struct {
	SchemaVersion       int                        `json:"schemaVersion"`
	FeatureCapabilities *PluginFeatureCapabilities `json:"featureCapabilities,omitempty"`
	List                PluginListResponse         `json:"list"`
	Status              PluginStatusResponse       `json:"status"`
}

func (s *Service) Runtime(options RuntimeOptions) (PluginRuntimeResponse, error) {
	if s == nil {
		return PluginRuntimeResponse{}, ErrWorkspaceRootRequired
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	snapshot, err := s.rescanLocked()
	if err != nil {
		return PluginRuntimeResponse{}, err
	}
	return s.RuntimeFromSnapshot(snapshot, options)
}

func buildRuntimeAppSubsystemCapabilities(entries []DiscoveredPlugin) PluginAppSubsystemCapabilities {
	resolution := resolveAppSubsystemProvider(entries)
	capabilities := PluginAppSubsystemCapabilities{
		ProviderSelection: &resolution.selection,
	}
	if resolution.selection.SelectedPluginID != nil {
		capabilities.PluginID = *resolution.selection.SelectedPluginID
		capabilities.PluginEnabled = true
		mergeRuntimeAppSubsystemCapabilities(&capabilities, resolution.feature)
	}
	return capabilities
}

func AppSubsystemCapabilitiesFromSnapshot(
	snapshot DiscoverySnapshot,
) PluginAppSubsystemCapabilities {
	return buildRuntimeAppSubsystemCapabilities(snapshot.Plugins)
}

func buildRuntimeWatchCodeCapabilities(entries []DiscoveredPlugin) PluginWatchCodeCapabilities {
	resolution := resolveWatchCodeProvider(entries)
	capabilities := PluginWatchCodeCapabilities{
		ProviderSelection: &resolution.selection,
	}
	if resolution.selection.SelectedPluginID != nil {
		capabilities.PluginID = *resolution.selection.SelectedPluginID
		capabilities.PluginEnabled = true
		mergeRuntimeWatchCodeCapabilities(&capabilities, resolution.feature, resolution.backend)
	}
	return capabilities
}

func WatchCodeCapabilitiesFromSnapshot(
	snapshot DiscoverySnapshot,
) PluginWatchCodeCapabilities {
	return buildRuntimeWatchCodeCapabilities(snapshot.Plugins)
}

func AppSubsystemProviderSelectionFromSnapshot(
	snapshot DiscoverySnapshot,
) PluginAppSubsystemProviderSelection {
	return resolveAppSubsystemProvider(snapshot.Plugins).selection
}

func WatchCodeProviderSelectionFromSnapshot(
	snapshot DiscoverySnapshot,
) PluginWatchCodeProviderSelection {
	return resolveWatchCodeProvider(snapshot.Plugins).selection
}

type runtimeAppSubsystemProviderResolution struct {
	selection PluginAppSubsystemProviderSelection
	feature   *PluginAppSubsystemFeatureManifest
}

type runtimeAppSubsystemProviderCandidate struct {
	pluginID string
	feature  *PluginAppSubsystemFeatureManifest
}

type runtimeWatchCodeProviderResolution struct {
	selection PluginWatchCodeProviderSelection
	feature   *PluginWatchCodeFeatureManifest
	backend   *backendProbeWatchCodeBackendRegistration
}

type runtimeWatchCodeProviderCandidate struct {
	pluginID string
	feature  *PluginWatchCodeFeatureManifest
	backend  *backendProbeWatchCodeBackendRegistration
}

func setRuntimeAppSubsystemProviderResolutionStatus(
	resolution *runtimeAppSubsystemProviderResolution,
	activeProviders []runtimeAppSubsystemProviderCandidate,
	hasInvalidActiveProvider bool,
) {
	switch {
	case hasInvalidActiveProvider:
		resolution.selection.Status = PluginAppSubsystemProviderSelectionStatusInvalidProvider
	case len(activeProviders) == 0:
		switch {
		case len(resolution.selection.InvalidPluginIDs) != 0:
			resolution.selection.Status = PluginAppSubsystemProviderSelectionStatusInvalidProvider
		case len(resolution.selection.DisabledPluginIDs) != 0:
			resolution.selection.Status = PluginAppSubsystemProviderSelectionStatusDisabledProvider
		default:
			resolution.selection.Status = PluginAppSubsystemProviderSelectionStatusNoProvider
		}
	case len(activeProviders) == 1:
		resolution.selection.Status = PluginAppSubsystemProviderSelectionStatusActive
		resolution.selection.SelectedPluginID = stringPointer(activeProviders[0].pluginID)
		resolution.feature = activeProviders[0].feature
	default:
		resolution.selection.Status = PluginAppSubsystemProviderSelectionStatusConflict
		resolution.selection.ConflictingPluginIDs = append(
			resolution.selection.ConflictingPluginIDs,
			resolution.selection.ActivePluginIDs...,
		)
	}
}

func resolveAppSubsystemProvider(entries []DiscoveredPlugin) runtimeAppSubsystemProviderResolution {
	resolution := runtimeAppSubsystemProviderResolution{
		selection: PluginAppSubsystemProviderSelection{
			Status:               PluginAppSubsystemProviderSelectionStatusNoProvider,
			ActivePluginIDs:      []string{},
			DisabledPluginIDs:    []string{},
			InvalidPluginIDs:     []string{},
			ConflictingPluginIDs: []string{},
		},
	}
	activeProviders := make([]runtimeAppSubsystemProviderCandidate, 0)
	hasInvalidActiveProvider := false
	for _, entry := range entries {
		if entry.State == PluginRuntimeStateShadowed || entry.ShadowedBySourcePath != "" {
			continue
		}
		feature := runtimeAppSubsystemFeatureManifest(entry)
		if feature == nil {
			continue
		}
		if !appSubsystemBackendContractRegistered(entry) ||
			!appSubsystemFrontendEntrypointAvailable(entry, feature) {
			markRuntimeAppSubsystemProviderInvalid(
				&resolution,
				entry,
				&hasInvalidActiveProvider,
			)
			continue
		}
		switch entry.State {
		case PluginRuntimeStateActive:
			resolution.selection.ActivePluginIDs = append(
				resolution.selection.ActivePluginIDs,
				entry.PluginID,
			)
			activeProviders = append(activeProviders, runtimeAppSubsystemProviderCandidate{
				pluginID: entry.PluginID,
				feature:  feature,
			})
		case PluginRuntimeStateDisabled:
			resolution.selection.DisabledPluginIDs = append(
				resolution.selection.DisabledPluginIDs,
				entry.PluginID,
			)
		case PluginRuntimeStateInvalid:
			resolution.selection.InvalidPluginIDs = append(
				resolution.selection.InvalidPluginIDs,
				entry.PluginID,
			)
		}
	}

	setRuntimeAppSubsystemProviderResolutionStatus(
		&resolution,
		activeProviders,
		hasInvalidActiveProvider,
	)

	resolution.selection.ActivePluginIDs = cloneStringSliceOrEmpty(resolution.selection.ActivePluginIDs)
	resolution.selection.DisabledPluginIDs = cloneStringSliceOrEmpty(resolution.selection.DisabledPluginIDs)
	resolution.selection.InvalidPluginIDs = cloneStringSliceOrEmpty(resolution.selection.InvalidPluginIDs)
	resolution.selection.ConflictingPluginIDs = cloneStringSliceOrEmpty(resolution.selection.ConflictingPluginIDs)
	return resolution
}

func setRuntimeWatchCodeProviderResolutionStatus(
	resolution *runtimeWatchCodeProviderResolution,
	activeProviders []runtimeWatchCodeProviderCandidate,
	hasInvalidActiveProvider bool,
) {
	switch {
	case hasInvalidActiveProvider:
		resolution.selection.Status = PluginWatchCodeProviderSelectionStatusInvalidProvider
	case len(resolution.selection.PendingRestartPluginIDs) != 0:
		resolution.selection.Status = PluginWatchCodeProviderSelectionStatusPendingRestart
	case len(activeProviders) == 0:
		switch {
		case len(resolution.selection.InvalidPluginIDs) != 0:
			resolution.selection.Status = PluginWatchCodeProviderSelectionStatusInvalidProvider
		case len(resolution.selection.DisabledPluginIDs) != 0:
			resolution.selection.Status = PluginWatchCodeProviderSelectionStatusDisabledProvider
		default:
			resolution.selection.Status = PluginWatchCodeProviderSelectionStatusNoProvider
		}
	case len(activeProviders) == 1:
		resolution.selection.Status = PluginWatchCodeProviderSelectionStatusActive
		resolution.selection.SelectedPluginID = stringPointer(activeProviders[0].pluginID)
		resolution.feature = activeProviders[0].feature
		resolution.backend = activeProviders[0].backend
	default:
		resolution.selection.Status = PluginWatchCodeProviderSelectionStatusConflict
		resolution.selection.ConflictingPluginIDs = append(
			resolution.selection.ConflictingPluginIDs,
			resolution.selection.ActivePluginIDs...,
		)
	}
}

func resolveWatchCodeProvider(entries []DiscoveredPlugin) runtimeWatchCodeProviderResolution {
	resolution := runtimeWatchCodeProviderResolution{
		selection: PluginWatchCodeProviderSelection{
			Status:                  PluginWatchCodeProviderSelectionStatusNoProvider,
			ActivePluginIDs:         []string{},
			DisabledPluginIDs:       []string{},
			InvalidPluginIDs:        []string{},
			PendingRestartPluginIDs: []string{},
			ConflictingPluginIDs:    []string{},
		},
	}
	activeProviders := make([]runtimeWatchCodeProviderCandidate, 0)
	hasInvalidActiveProvider := false
	for _, entry := range entries {
		if entry.State == PluginRuntimeStateShadowed || entry.ShadowedBySourcePath != "" {
			continue
		}
		feature := runtimeWatchCodeFeatureManifest(entry)
		if feature == nil {
			continue
		}
		if watchCodeBackendCapabilityModeBlocked(entry) {
			continue
		}
		if !watchCodeProviderRegistrationValid(entry, feature) {
			markRuntimeWatchCodeProviderInvalid(
				&resolution,
				entry,
				&hasInvalidActiveProvider,
			)
			continue
		}
		switch entry.State {
		case PluginRuntimeStateActive:
			resolution.selection.ActivePluginIDs = append(
				resolution.selection.ActivePluginIDs,
				entry.PluginID,
			)
			activeProviders = append(activeProviders, runtimeWatchCodeProviderCandidate{
				pluginID: entry.PluginID,
				feature:  feature,
				backend:  entry.watchCodeBackend,
			})
		case PluginRuntimeStateDisabled:
			resolution.selection.DisabledPluginIDs = append(
				resolution.selection.DisabledPluginIDs,
				entry.PluginID,
			)
		case PluginRuntimeStateInvalid:
			resolution.selection.InvalidPluginIDs = append(
				resolution.selection.InvalidPluginIDs,
				entry.PluginID,
			)
		case PluginRuntimeStatePendingRestart:
			resolution.selection.PendingRestartPluginIDs = append(
				resolution.selection.PendingRestartPluginIDs,
				entry.PluginID,
			)
		}
	}

	setRuntimeWatchCodeProviderResolutionStatus(
		&resolution,
		activeProviders,
		hasInvalidActiveProvider,
	)

	resolution.selection.ActivePluginIDs = cloneStringSliceOrEmpty(resolution.selection.ActivePluginIDs)
	resolution.selection.DisabledPluginIDs = cloneStringSliceOrEmpty(resolution.selection.DisabledPluginIDs)
	resolution.selection.InvalidPluginIDs = cloneStringSliceOrEmpty(resolution.selection.InvalidPluginIDs)
	resolution.selection.PendingRestartPluginIDs = cloneStringSliceOrEmpty(resolution.selection.PendingRestartPluginIDs)
	resolution.selection.ConflictingPluginIDs = cloneStringSliceOrEmpty(resolution.selection.ConflictingPluginIDs)
	return resolution
}

func watchCodeProviderRegistrationValid(
	entry DiscoveredPlugin,
	feature *PluginWatchCodeFeatureManifest,
) bool {
	return watchCodeBackendContractRegistered(entry) &&
		watchCodeBackendSupportsRequiredLanguage(entry.watchCodeBackend) &&
		watchCodeFrontendEntrypointAvailable(entry, feature)
}

func markRuntimeAppSubsystemProviderInvalid(
	resolution *runtimeAppSubsystemProviderResolution,
	entry DiscoveredPlugin,
	hasInvalidActiveProvider *bool,
) {
	resolution.selection.InvalidPluginIDs = append(
		resolution.selection.InvalidPluginIDs,
		entry.PluginID,
	)
	*hasInvalidActiveProvider =
		*hasInvalidActiveProvider || entry.State == PluginRuntimeStateActive
}

func markRuntimeWatchCodeProviderInvalid(
	resolution *runtimeWatchCodeProviderResolution,
	entry DiscoveredPlugin,
	hasInvalidActiveProvider *bool,
) {
	resolution.selection.InvalidPluginIDs = append(
		resolution.selection.InvalidPluginIDs,
		entry.PluginID,
	)
	*hasInvalidActiveProvider =
		*hasInvalidActiveProvider || entry.State == PluginRuntimeStateActive
}

func runtimeAppSubsystemFeatureManifest(
	entry DiscoveredPlugin,
) *PluginAppSubsystemFeatureManifest {
	if entry.Manifest == nil || entry.Manifest.FeatureCapabilities == nil {
		return nil
	}
	return entry.Manifest.FeatureCapabilities.AppSubsystem
}

func runtimeWatchCodeFeatureManifest(
	entry DiscoveredPlugin,
) *PluginWatchCodeFeatureManifest {
	if entry.Manifest == nil || entry.Manifest.FeatureCapabilities == nil {
		return nil
	}
	return entry.Manifest.FeatureCapabilities.WatchCode
}

func watchCodeBackendCapabilityModeBlocked(entry DiscoveredPlugin) bool {
	for _, blocked := range entry.BlockedCapabilities {
		if blocked.Capability == "registerWatchCodeBackend" &&
			blocked.Reason == PluginBlockedCapabilityReasonModePolicy {
			return true
		}
	}
	return false
}

func appSubsystemFeatureRequiresFrontend(
	feature *PluginAppSubsystemFeatureManifest,
) bool {
	if feature == nil {
		return false
	}
	return feature.AppAuthoringUI ||
		feature.AppPreviewUI ||
		feature.AppGenerationChatModes ||
		feature.AppDeploymentRuntime
}

func appSubsystemFrontendEntrypointAvailable(
	entry DiscoveredPlugin,
	feature *PluginAppSubsystemFeatureManifest,
) bool {
	if !appSubsystemFeatureRequiresFrontend(feature) {
		return true
	}
	if entry.Manifest == nil || entry.Manifest.Frontend == nil {
		return false
	}
	_, err := resolveManifestRegularFile(
		entry.SourcePath,
		entry.Manifest.Frontend.Entrypoint,
		"plugin frontend entrypoint",
	)
	return err == nil
}

func watchCodeBackendSupportsRequiredLanguage(
	registration *backendProbeWatchCodeBackendRegistration,
) bool {
	if registration == nil {
		return false
	}
	for _, language := range registration.Languages {
		if strings.EqualFold(language, "python") {
			return true
		}
	}
	return false
}

func watchCodeFrontendEntrypointAvailable(
	entry DiscoveredPlugin,
	feature *PluginWatchCodeFeatureManifest,
) bool {
	if feature == nil || !feature.CanvasControlsUI {
		return true
	}
	if entry.Manifest == nil || entry.Manifest.Frontend == nil {
		return false
	}
	_, err := resolveManifestRegularFile(
		entry.SourcePath,
		entry.Manifest.Frontend.Entrypoint,
		"plugin frontend entrypoint",
	)
	return err == nil
}

func appSubsystemBackendContractRegistered(entry DiscoveredPlugin) bool {
	if entry.appSubsystemBackend == nil {
		return false
	}

	registeredEndpoints := make(map[string]struct{}, len(entry.appSubsystemListenerEndpoints))
	for _, endpoint := range entry.appSubsystemListenerEndpoints {
		normalizedName := strings.TrimSpace(endpoint.Name)
		if normalizedName == "" {
			continue
		}
		registeredEndpoints[normalizedName] = struct{}{}
	}
	for _, requiredEndpoint := range backendruntime.RequiredListenerEndpointNames() {
		if _, ok := registeredEndpoints[requiredEndpoint]; !ok {
			return false
		}
	}
	return true
}

func watchCodeBackendContractRegistered(entry DiscoveredPlugin) bool {
	if entry.watchCodeBackend == nil {
		return false
	}
	return entry.watchCodeBackend.ContractVersion == watchcodecontracts.BackendContractVersion
}

func mergeRuntimeAppSubsystemCapabilities(
	capabilities *PluginAppSubsystemCapabilities,
	feature *PluginAppSubsystemFeatureManifest,
) {
	if capabilities == nil || feature == nil {
		return
	}
	capabilities.AppAuthoringUI = capabilities.AppAuthoringUI || feature.AppAuthoringUI
	capabilities.AppPreviewUI = capabilities.AppPreviewUI || feature.AppPreviewUI
	capabilities.AppGenerationChatModes = capabilities.AppGenerationChatModes || feature.AppGenerationChatModes
	capabilities.AppDeploymentRuntime = capabilities.AppDeploymentRuntime || feature.AppDeploymentRuntime
}

func mergeRuntimeWatchCodeCapabilities(
	capabilities *PluginWatchCodeCapabilities,
	feature *PluginWatchCodeFeatureManifest,
	backend *backendProbeWatchCodeBackendRegistration,
) {
	if capabilities == nil || feature == nil || backend == nil {
		return
	}
	capabilities.Python = capabilities.Python || watchCodeBackendSupportsRequiredLanguage(backend)
	capabilities.RequiresLanguageServer = capabilities.RequiresLanguageServer || backend.RequiresLanguageServer
	capabilities.CanvasControlsUI = capabilities.CanvasControlsUI || feature.CanvasControlsUI
}

func (s *Service) ResolveAssetPath(pluginID string, assetPath string) (string, error) {
	if s == nil {
		return "", ErrWorkspaceRootRequired
	}

	trimmedPluginID, err := validateRuntimePluginID(pluginID)
	if err != nil {
		return "", err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	entry, err := s.runtimeActiveEntryLocked(trimmedPluginID)
	if err != nil {
		return "", err
	}
	return resolveRuntimeAssetPath(entry, assetPath)
}

func validateRuntimePluginID(pluginID string) (string, error) {
	trimmedPluginID := strings.TrimSpace(pluginID)
	if trimmedPluginID == "" {
		return "", newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", pluginID)
	}
	return trimmedPluginID, nil
}

func (s *Service) runtimeActiveEntryLocked(pluginID string) (DiscoveredPlugin, error) {
	snapshot, err := s.rescanLocked()
	if err != nil {
		return DiscoveredPlugin{}, err
	}

	entry, ok := findRuntimeActiveEntry(snapshot.Plugins, pluginID)
	if !ok {
		return DiscoveredPlugin{}, newServiceError(ServiceErrorCodeNotFound, "Plugin not active: %s", pluginID)
	}
	return entry, nil
}

func resolveRuntimeAssetPath(entry DiscoveredPlugin, assetPath string) (string, error) {
	resolvedPath, err := statefs.ResolveWithinRoot(entry.SourcePath, assetPath, "plugin asset path")
	if err != nil {
		return "", invalidRuntimeAssetPathError(assetPath)
	}

	if err := ensureRuntimeAssetWithinFrontendRoots(entry, resolvedPath, assetPath); err != nil {
		return "", err
	}

	if err := ensureRuntimeAssetIsRegularFile(resolvedPath, assetPath); err != nil {
		return "", err
	}
	return resolvedPath, nil
}

func ensureRuntimeAssetWithinFrontendRoots(entry DiscoveredPlugin, resolvedPath string, assetPath string) error {
	allowedRoots, err := pluginFrontendAssetRoots(entry)
	if err != nil {
		return err
	}
	for _, root := range allowedRoots {
		if _, err := statefs.EnsureWithinRoot(root, resolvedPath, "plugin asset path"); err == nil {
			return nil
		}
	}
	return runtimeAssetNotFoundError(assetPath)
}

func ensureRuntimeAssetIsRegularFile(resolvedPath string, assetPath string) error {
	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return runtimeAssetNotFoundError(assetPath)
		}
		return err
	}
	if !info.Mode().IsRegular() {
		return runtimeAssetNotFoundError(assetPath)
	}
	return nil
}

func invalidRuntimeAssetPathError(assetPath string) error {
	return newServiceError(ServiceErrorCodeAssetInvalidPath, "Invalid plugin asset path: %s", strings.TrimSpace(assetPath))
}

func runtimeAssetNotFoundError(assetPath string) error {
	return newServiceError(ServiceErrorCodeAssetNotFound, "Plugin asset not found: %s", strings.TrimSpace(assetPath))
}

func (s *Service) buildRuntimeListEntries(
	entries []DiscoveredPlugin,
	pluginsState *PluginsStateFile,
	assetURLBuilder AssetURLBuilder,
	redactSourceDetails bool,
	redactConfigDetails bool,
) []PluginListEntry {
	listEntries := make([]PluginListEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.Manifest == nil {
			continue
		}
		if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
			continue
		}

		listEntries = append(listEntries, PluginListEntry{
			PluginID:           entry.PluginID,
			Name:               entry.Name,
			Version:            entry.Version,
			SourceScope:        entry.Scope,
			SourceScopeLabel:   string(entry.Scope),
			SourceManager:      entry.SourceManager,
			SourceManagerHint:  optionalStringPointer(entry.SourceManagerHint),
			CanonicalSourceKey: runtimeCanonicalSourceKey(entry, redactSourceDetails),
			SourceDigestSHA256: cloneOptionalString(entry.SourceDigestSHA256),
			Frontend:           buildRuntimeFrontendDescriptor(entry, assetURLBuilder),
			Content:            buildRuntimeContentDescriptor(entry),
			Config: buildRuntimeConfigDescriptor(
				entries,
				entry,
				pluginsState,
				redactConfigDetails,
			),
			Components:            manifestComponents(*entry.Manifest),
			EffectiveCapabilities: cloneStringSliceOrEmpty(entry.EffectiveCapabilities),
			EnablementSource:      cloneOptionalEnablementSource(entry.EnablementSource),
			RestartRequired:       entry.RestartRequired,
		})
	}
	return listEntries
}

func buildRuntimeFrontendDescriptor(entry DiscoveredPlugin, assetURLBuilder AssetURLBuilder) PluginFrontendDescriptor {
	if entry.Manifest == nil || entry.Manifest.Frontend == nil {
		return PluginFrontendDescriptor{}
	}
	return PluginFrontendDescriptor{
		EntrypointURL: buildRuntimeAssetURL(entry, entry.Manifest.Frontend.Entrypoint, assetURLBuilder),
		StyleURL:      buildRuntimeAssetURL(entry, entry.Manifest.Frontend.Style, assetURLBuilder),
	}
}

func buildRuntimeAssetURL(entry DiscoveredPlugin, relativePath string, assetURLBuilder AssetURLBuilder) *string {
	if assetURLBuilder == nil || entry.Manifest == nil {
		return nil
	}
	trimmedPath := strings.TrimSpace(relativePath)
	if trimmedPath == "" {
		return nil
	}
	resolvedPath, err := resolveManifestRegularFile(entry.SourcePath, trimmedPath, "plugin asset path")
	if err != nil {
		return nil
	}
	normalizedRelativePath, err := filepath.Rel(entry.SourcePath, resolvedPath)
	if err != nil {
		return nil
	}
	normalizedRelativePath = filepath.ToSlash(normalizedRelativePath)
	if normalizedRelativePath == "." || strings.HasPrefix(normalizedRelativePath, "../") {
		return nil
	}
	urlValue := assetURLBuilder(entry.PluginID, normalizedRelativePath, cloneOptionalString(entry.SourceDigestSHA256))
	if strings.TrimSpace(urlValue) == "" {
		return nil
	}
	return &urlValue
}

func buildRuntimeContentDescriptor(entry DiscoveredPlugin) PluginContentDescriptor {
	if entry.Manifest == nil || entry.Manifest.Content == nil {
		return PluginContentDescriptor{}
	}
	return PluginContentDescriptor{
		HasBlueprints:       runtimeDirectoryHasFiles(entry.SourcePath, entry.Manifest.Content.BlueprintsDir),
		HasProjectTemplates: runtimeDirectoryHasFiles(entry.SourcePath, entry.Manifest.Content.ProjectTemplatesDir),
		HasPrompts:          runtimeDirectoryHasFiles(entry.SourcePath, entry.Manifest.Content.PromptsDir),
	}
}

func buildRuntimeConfigDescriptor(entries []DiscoveredPlugin, entry DiscoveredPlugin, pluginsState *PluginsStateFile, redactConfigDetails bool) PluginConfigDescriptor {
	hasSchema, schemaJSON, schemaDigest := buildRuntimeConfigSchemaDescriptor(entry)
	if redactConfigDetails {
		return PluginConfigDescriptor{
			HasSchema:                 hasSchema,
			SchemaJSON:                nil,
			SchemaJSONDigestSHA256:    nil,
			CurrentConfig:             map[string]any{},
			CurrentConfigDigestSHA256: nil,
		}
	}

	currentConfig := pluginConfigSnapshotWithDuplicateFallback(entries, entry, pluginsState).Config
	return PluginConfigDescriptor{
		HasSchema:                 hasSchema,
		SchemaJSON:                schemaJSON,
		SchemaJSONDigestSHA256:    schemaDigest,
		CurrentConfig:             currentConfig,
		CurrentConfigDigestSHA256: runtimeDigestJSONValue(currentConfig),
	}
}

func buildRuntimeConfigSchemaDescriptor(entry DiscoveredPlugin) (bool, map[string]any, *string) {
	document, ok, err := loadPluginConfigSchemaDocument(entry)
	if err != nil {
		return false, map[string]any{}, nil
	}
	if !ok {
		return false, map[string]any{}, nil
	}
	return true, document.JSON, runtimeDigestJSONValue(document.JSON)
}

func runtimeDirectoryHasFiles(pluginRoot string, relativePath string) bool {
	trimmedPath := strings.TrimSpace(relativePath)
	if trimmedPath == "" {
		return false
	}
	resolvedPath, err := resolveManifestDirectory(pluginRoot, trimmedPath, "plugin content directory")
	if err != nil {
		return false
	}
	foundFile := false
	_ = filepath.Walk(resolvedPath, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.Mode()&os.ModeSymlink != 0 {
			targetInfo, err := os.Stat(path)
			if err != nil {
				return nil
			}
			if targetInfo.IsDir() {
				return nil
			}
			foundFile = true
			return filepath.SkipAll
		}
		if info.IsDir() {
			return nil
		}
		foundFile = true
		return filepath.SkipAll
	})
	return foundFile
}

func runtimeDigestJSONValue(value any) *string {
	payload, err := json.Marshal(value)
	if err != nil {
		return nil
	}
	sum := sha256.Sum256(payload)
	digest := hex.EncodeToString(sum[:])
	return &digest
}

func buildRuntimeStatusResponse(
	snapshot DiscoverySnapshot,
	capability PluginRestartCapability,
	redactSourceDetails bool,
	redactedSourcePathByPath map[string]string,
) PluginStatusResponse {
	entries := make([]PluginStatusEntry, 0, len(snapshot.Plugins))
	for _, entry := range snapshot.Plugins {
		entries = append(entries, buildRuntimeStatusEntry(entry, redactSourceDetails, redactedSourcePathByPath))
	}
	return PluginStatusResponse{
		SchemaVersion:            pluginStatusSchemaVersion,
		ServerMode:               snapshot.ServerMode,
		RestartCapability:        capability,
		AppSubsystemSelection:    appSubsystemProviderSelectionPointer(resolveAppSubsystemProvider(snapshot.Plugins).selection),
		WatchCodeSelection:       watchCodeProviderSelectionPointer(resolveWatchCodeProvider(snapshot.Plugins).selection),
		Plugins:                  entries,
		LanguageServerSelections: []LanguageServerSelectionStatus{},
	}
}

func appSubsystemProviderSelectionPointer(
	selection PluginAppSubsystemProviderSelection,
) *PluginAppSubsystemProviderSelection {
	return &selection
}

func watchCodeProviderSelectionPointer(
	selection PluginWatchCodeProviderSelection,
) *PluginWatchCodeProviderSelection {
	return &selection
}

func buildRuntimeStatusEntry(entry DiscoveredPlugin, redactSourceDetails bool, redactedSourcePathByPath map[string]string) PluginStatusEntry {
	statusEntry := statusEntryFromDiscoveredPlugin(entry)
	if !redactSourceDetails {
		return statusEntry
	}

	statusEntry.SourcePath = redactedSourcePathByPath[entry.SourcePath]
	statusEntry.CanonicalSourceKey = redactedCanonicalSourceKey(
		entry.PluginID,
		entry.Scope,
		entry.SourceManager,
		entry.SourcePath,
	)
	if entry.ShadowedBySourcePath != "" {
		shadowedValue := redactedSourcePathByPath[entry.ShadowedBySourcePath]
		statusEntry.ShadowedBySourcePath = &shadowedValue
	}
	return statusEntry
}

func buildRedactedSourcePathMap(entries []DiscoveredPlugin) map[string]string {
	sourceEntryByPath := make(map[string]DiscoveredPlugin, len(entries))
	pathsToRedact := map[string]struct{}{}
	for _, entry := range entries {
		sourceEntryByPath[entry.SourcePath] = entry
		pathsToRedact[entry.SourcePath] = struct{}{}
		if entry.ShadowedBySourcePath != "" {
			pathsToRedact[entry.ShadowedBySourcePath] = struct{}{}
		}
	}

	redacted := make(map[string]string, len(pathsToRedact))
	for sourcePath := range pathsToRedact {
		entry, ok := sourceEntryByPath[sourcePath]
		if !ok {
			redacted[sourcePath] = redactedUnknownSourcePath(sourcePath)
			continue
		}
		redacted[sourcePath] = redactedSourcePath(entry.PluginID, entry.Scope, entry.SourceManager, entry.SourcePath)
	}
	return redacted
}

func shouldRedactRuntimeSourceDetails(mode config.Mode) bool {
	return mode == config.ModeShare || mode == config.ModeApp
}

func shouldRedactRuntimeConfigDetails(mode config.Mode) bool {
	return mode == config.ModeShare || mode == config.ModeApp
}

func runtimeCanonicalSourceKey(entry DiscoveredPlugin, redactSourceDetails bool) string {
	if !redactSourceDetails {
		return entry.CanonicalSourceKey
	}
	return redactedCanonicalSourceKey(entry.PluginID, entry.Scope, entry.SourceManager, entry.SourcePath)
}

func redactedCanonicalSourceKey(pluginID string, scope PluginScope, sourceManager PluginSourceManager, sourcePath string) string {
	token := redactedSourceToken(sourcePath)
	return redactedCanonicalSourceKeyPrefix + string(scope) + ":" + string(sourceManager) + ":" + pluginID + ":" + token
}

func redactedSourcePath(pluginID string, scope PluginScope, sourceManager PluginSourceManager, sourcePath string) string {
	token := redactedSourceToken(sourcePath)
	return redactedSourcePathPrefix + ":" + string(scope) + ":" + string(sourceManager) + ":" + pluginID + ":" + token
}

func redactedUnknownSourcePath(sourcePath string) string {
	return redactedSourcePathPrefix + ":unknown:" + redactedSourceToken(sourcePath)
}

func redactedSourceToken(sourcePath string) string {
	sum := sha256.Sum256([]byte(sourcePath))
	return hex.EncodeToString(sum[:])[:12]
}

func pluginFrontendAssetRoots(entry DiscoveredPlugin) ([]string, error) {
	if entry.Manifest == nil || entry.Manifest.Frontend == nil {
		return nil, newServiceError(ServiceErrorCodeAssetNotFound, "Plugin frontend assets are unavailable: %s", entry.PluginID)
	}

	roots := map[string]struct{}{}
	resolvedEntrypoint, err := resolveManifestRegularFile(entry.SourcePath, entry.Manifest.Frontend.Entrypoint, "plugin frontend entrypoint")
	if err != nil {
		return nil, newServiceError(ServiceErrorCodeAssetNotFound, "Plugin frontend assets are unavailable: %s", entry.PluginID)
	}
	roots[filepath.Dir(resolvedEntrypoint)] = struct{}{}
	if strings.TrimSpace(entry.Manifest.Frontend.Style) != "" {
		resolvedStyle, err := resolveManifestRegularFile(entry.SourcePath, entry.Manifest.Frontend.Style, "plugin frontend style")
		if err != nil {
			return nil, newServiceError(ServiceErrorCodeAssetNotFound, "Plugin frontend assets are unavailable: %s", entry.PluginID)
		}
		roots[filepath.Dir(resolvedStyle)] = struct{}{}
	}

	values := make([]string, 0, len(roots))
	for root := range roots {
		values = append(values, root)
	}
	sort.Strings(values)
	return values, nil
}

func findRuntimeActiveEntry(entries []DiscoveredPlugin, pluginID string) (DiscoveredPlugin, bool) {
	for _, entry := range entries {
		if entry.PluginID != pluginID {
			continue
		}
		if entry.Manifest == nil {
			continue
		}
		if entry.State != PluginRuntimeStateActive && entry.State != PluginRuntimeStatePendingRestart {
			continue
		}
		return entry, true
	}
	return DiscoveredPlugin{}, false
}
